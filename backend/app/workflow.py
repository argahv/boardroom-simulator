"""
Production negotiation workflow.

Graph topology:
  select_speaker → generate_turn → update_dynamics → interrupt_check
                                                        │
                                      ┌─────────────────┴──────────────────┐
                                  "interrupt"                          "no_interrupt"
                                      │                                    │
                               generate_interrupt                   should_continue
                                      │                              │         │
                               update_dynamics                 "continue"    "end"
                                      │                              │         │
                               should_continue              select_speaker    END
                                │         │
                          "continue"    "end"
                               │         │
                        select_speaker   END

Key production features:
- trust_matrix[a][b] = how much a trusts b  (0-100, starts at 50)
- leverage_scores[a] = current bargaining power (0-100, starts at incentive_tuning)
- agent_objectives[a] = mutable goal strings that shift after concessions
- interrupt system: after each turn, highest-bidding non-speaker fires an extra turn
- speaker selection weighted by leverage, not just incentive_tuning
"""
from __future__ import annotations

from typing import Dict, Any, List
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
import asyncio
import random
import math

from app.agents import BoardroomAgent, AgentState, create_agent_for_stakeholder
from app.memory import NegotiationMemory, get_memory
from app.models import Stakeholder
from app import config

# ---------------------------------------------------------------------------
# Module-level registries
# ---------------------------------------------------------------------------
_agent_registry: Dict[str, Dict[str, BoardroomAgent]] = {}
_memory_registry: Dict[str, NegotiationMemory] = {}
_graph_registry: Dict[str, Any] = {}
_checkpointer_registry: Dict[str, MemorySaver] = {}

INTERRUPT_THRESHOLD = 0.6  # bid must exceed this to fire
MAX_INTERRUPTS_PER_CYCLE = 1  # max extra turns per normal turn
MAX_CONSECUTIVE_INTERRUPTS = 3  # prevent infinite interrupt chains


def _get_agents(simulation_id: str) -> Dict[str, BoardroomAgent]:
    return _agent_registry.get(simulation_id, {})


def _get_sim_memory(simulation_id: str) -> NegotiationMemory:
    if simulation_id not in _memory_registry:
        _memory_registry[simulation_id] = get_memory(
            openrouter_api_key=config.OPENROUTER_API_KEY
        )
    return _memory_registry[simulation_id]


# ---------------------------------------------------------------------------
# State schema — production
# ---------------------------------------------------------------------------

class WorkflowState(TypedDict):
    simulation_id: str
    turn_index: int
    background: str
    primary_goal: str
    stakeholders: List[Dict[str, Any]]
    voltage: int
    env_flags: Dict[str, bool]
    active_speaker_id: str
    history: List[Dict[str, Any]]
    heatmap: Dict[str, int]
    event_log: List[str]
    max_turns: int
    current_turn: Dict[str, Any]

    # production dynamics
    trust_matrix: Dict[str, Dict[str, int]]    # trust_matrix[a][b] = 0-100
    leverage_scores: Dict[str, int]             # leverage_scores[a] = 0-100
    agent_objectives: Dict[str, List[str]]      # mutable goal list per agent
    consecutive_interrupts: int                  # counter to cap interrupt chains

    # interrupt sentinel — set by pre_interrupt_check node, read by interrupt_check edge
    _interrupt_bidder: Any                       # Optional[str]
    _interrupt_bid: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _init_trust_matrix(stakeholders: List[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
    ids = [s["id"] for s in stakeholders]
    return {a: {b: 50 for b in ids if b != a} for a in ids}


def _init_leverage(stakeholders: List[Dict[str, Any]]) -> Dict[str, int]:
    return {s["id"]: s.get("incentive_tuning", 50) for s in stakeholders}


def _init_objectives(stakeholders: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    return {
        s["id"]: [s.get("focus", ""), s.get("hidden_agenda", "")]
        for s in stakeholders
    }


def _clamp(val: int | float, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, int(val)))


# ---------------------------------------------------------------------------
# Node: select_next_speaker  (leverage-weighted)
# ---------------------------------------------------------------------------

def select_next_speaker(state: WorkflowState) -> WorkflowState:
    turn_index = state["turn_index"]
    history = state["history"]
    stakeholders = state["stakeholders"]
    voltage = state["voltage"]
    leverage = state.get("leverage_scores", {})

    if turn_index == 0:
        selected = random.choice(stakeholders)
        state["active_speaker_id"] = selected["id"]
        state["event_log"].append(f"Turn 0: {selected['name']} opens")
        state["consecutive_interrupts"] = 0
        return state

    last_turn = history[-1] if history else {}

    # Coalition follow-through
    if last_turn.get("coalition_with"):
        target_id = last_turn["coalition_with"]
        target = next((s for s in stakeholders if s["id"] == target_id), None)
        if target:
            state["active_speaker_id"] = target_id
            state["event_log"].append(
                f"Turn {turn_index}: coalition → {target['name']} responds"
            )
            state["consecutive_interrupts"] = 0
            return state

    # Direct address
    if last_turn.get("directed_at"):
        target_id = last_turn["directed_at"]
        target = next((s for s in stakeholders if s["id"] == target_id), None)
        if target:
            state["active_speaker_id"] = target_id
            state["event_log"].append(
                f"Turn {turn_index}: addressed → {target['name']} responds"
            )
            state["consecutive_interrupts"] = 0
            return state

    # Weighted random: leverage × (1 + voltage/100) × (1 + random jitter)
    weights = []
    for s in stakeholders:
        sid = s["id"]
        lev = leverage.get(sid, s.get("incentive_tuning", 50))
        w = lev * (1 + voltage / 100.0) * (1 + random.random() * 0.3)
        weights.append(w)

    total = sum(weights) or 1.0
    selected = random.choices(stakeholders, weights=[w / total for w in weights], k=1)[0]
    state["active_speaker_id"] = selected["id"]
    state["event_log"].append(f"Turn {turn_index}: {selected['name']} takes the floor (leverage={leverage.get(selected['id'], '?')})")
    state["consecutive_interrupts"] = 0
    return state


# ---------------------------------------------------------------------------
# Node: generate_turn  (shared by normal + interrupt turns)
# ---------------------------------------------------------------------------

async def generate_turn(state: WorkflowState) -> WorkflowState:
    agent_id = state["active_speaker_id"]
    agent_instances = _get_agents(state["simulation_id"])
    agent = agent_instances.get(agent_id)

    if not agent:
        state["event_log"].append(f"ERROR: agent {agent_id} not found")
        return state

    memory = _get_sim_memory(state["simulation_id"])

    own_context = memory.retrieve_relevant_context(
        simulation_id=state["simulation_id"],
        agent_id=agent_id,
        query=f"My position on: {state['primary_goal']}",
        n_results=3,
    )
    cross_context = memory.retrieve_cross_agent_context(
        simulation_id=state["simulation_id"],
        query=f"Objections and positions on: {state['primary_goal']}",
        exclude_agent_id=agent_id,
        n_results=3,
    )

    agent_state: AgentState = {
        "simulation_id": state["simulation_id"],
        "turn_index": state["turn_index"],
        "background": state["background"],
        "primary_goal": state["primary_goal"],
        "stakeholders": state["stakeholders"],
        "voltage": state["voltage"],
        "active_speaker_id": agent_id,
        "history": state["history"],
        "agent_memories": {
            agent_id: own_context,
            "_cross_agent": cross_context,
        },
        "heatmap": state["heatmap"],
        "event_log": state["event_log"],
        # production context injected into AgentState
        "_trust_matrix": state.get("trust_matrix", {}),
        "_leverage_scores": state.get("leverage_scores", {}),
        "_agent_objectives": state.get("agent_objectives", {}),
    }

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, agent.invoke, agent_state)

    stakeholder = next((s for s in state["stakeholders"] if s["id"] == agent_id), None)

    turn = {
        "turn_index": state["turn_index"],
        "stakeholder_id": agent_id,
        "stakeholder_name": stakeholder["name"] if stakeholder else agent_id,
        "role": stakeholder["role"] if stakeholder else "Unknown",
        "tool_profile": stakeholder.get("tool_profile", "none") if stakeholder else "none",
        "content": response.content,
        "internal_reasoning": response.internal_reasoning,
        "action_type": response.action_type,
        "directed_at": response.directed_at,
        "coalition_with": response.coalition_with,
        "emotional_tone": response.emotional_tone,
        "interrupt_bid": response.interrupt_bid,
        "position_delta": response.position_delta,
        "leverage_delta": response.leverage_delta,
        "tool_calls": response.tool_calls,
    }

    state["current_turn"] = turn
    state["history"].append(turn)

    memory.store_turn(
        simulation_id=state["simulation_id"],
        agent_id=agent_id,
        turn_index=state["turn_index"],
        content=response.content,
        metadata={
            "action_type": response.action_type,
            "emotional_tone": response.emotional_tone,
            "tool_count": len(response.tool_calls),
            "stakeholder_name": stakeholder["name"] if stakeholder else agent_id,
            "role": stakeholder["role"] if stakeholder else "Unknown",
        },
    )

    state["turn_index"] += 1
    return state


# ---------------------------------------------------------------------------
# Node: update_dynamics
# Replaces the old update_heatmap. Does heatmap + trust + leverage + objectives.
# ---------------------------------------------------------------------------

_HEATMAP_RULES: Dict[str, List[tuple[list[str], str, int]]] = {
    "financial": [
        (["roi", "revenue", "profit", "cost", "margin", "payback", "irr", "npv"], "commercial_gain", 5),
        (["risk", "exposure", "loss", "liability"], "commercial_gain", -3),
    ],
    "legal": [
        (["compliance", "regulation", "gdpr", "ccpa", "soc2", "liability", "indemnif"], "legal_safety", 5),
        (["breach", "violation", "exposure", "veto"], "legal_safety", -4),
    ],
    "technical": [
        (["architecture", "infrastructure", "scalab", "latency", "integration", "stack"], "tech_integrity", 5),
        (["debt", "fragile", "lock-in", "vendor", "risk"], "tech_integrity", -3),
    ],
    "comms": [
        (["message", "narrative", "brand", "press", "media", "statement"], "commercial_gain", 2),
    ],
    "none": [],
}

# Action → trust delta (speaker's trust from others' perspective)
_TRUST_DELTAS: Dict[str, int] = {
    "compromise": 8,
    "coalition_signal": 5,
    "statement": 1,
    "question": 2,
    "challenge": -4,
    "escalate": -8,
    "interrupt": -6,
}

# Action → leverage delta (speaker gains/loses)
_LEVERAGE_DELTAS: Dict[str, int] = {
    "compromise": -5,   # giving ground costs leverage
    "coalition_signal": 3,
    "statement": 1,
    "question": 0,
    "challenge": 4,     # aggressive push gains leverage if not overused
    "escalate": 6,
    "interrupt": 3,
}


def update_dynamics(state: WorkflowState) -> WorkflowState:
    current_turn = state.get("current_turn")
    if not current_turn:
        return state

    speaker_id = current_turn.get("stakeholder_id", "")
    action = current_turn.get("action_type", "statement")
    content = current_turn.get("content", "").lower()
    tool_profile = current_turn.get("tool_profile", "none")

    # --- Heatmap ---
    heatmap = state["heatmap"]
    for keyword_list, dimension, delta in _HEATMAP_RULES.get(tool_profile, []):
        if any(kw in content for kw in keyword_list):
            heatmap[dimension] = _clamp(heatmap.get(dimension, 50) + delta)
    if action in ("escalate", "challenge"):
        for dim in heatmap:
            heatmap[dim] = _clamp(heatmap[dim] + 2)
    state["heatmap"] = heatmap

    # --- Trust matrix ---
    trust = state.get("trust_matrix", {})
    trust_delta = _TRUST_DELTAS.get(action, 0)
    coalition_target = current_turn.get("coalition_with")
    directed_target = current_turn.get("directed_at")

    for other_id in trust.get(speaker_id, {}):
        # Baseline: everyone's trust shifts based on action type
        trust[other_id] = trust.get(other_id, {})
        old = trust[other_id].get(speaker_id, 50)
        trust[other_id][speaker_id] = _clamp(old + trust_delta)

    # Coalition boost: mutual trust increase between aligned agents
    if coalition_target and coalition_target in trust:
        trust[speaker_id][coalition_target] = _clamp(
            trust.get(speaker_id, {}).get(coalition_target, 50) + 12
        )
        trust[coalition_target][speaker_id] = _clamp(
            trust.get(coalition_target, {}).get(speaker_id, 50) + 12
        )

    # Direct challenge: extra trust erosion between adversaries
    if action in ("challenge", "escalate") and directed_target and directed_target in trust:
        trust[directed_target][speaker_id] = _clamp(
            trust.get(directed_target, {}).get(speaker_id, 50) - 10
        )

    state["trust_matrix"] = trust

    # --- Leverage scores ---
    leverage = state.get("leverage_scores", {})

    # Base leverage shift from action type
    base_delta = _LEVERAGE_DELTAS.get(action, 0)
    leverage[speaker_id] = _clamp(leverage.get(speaker_id, 50) + base_delta)

    # Apply agent's self-reported leverage_delta (from LLM response)
    for target_id, delta in current_turn.get("leverage_delta", {}).items():
        if target_id in leverage:
            leverage[target_id] = _clamp(leverage[target_id] + _clamp(delta, -10, 10))

    # Diminishing returns: if someone challenges 3+ times in a row, leverage gain decays
    recent_speaker_actions = [
        t.get("action_type") for t in state["history"][-4:]
        if t.get("stakeholder_id") == speaker_id
    ]
    consecutive_aggression = sum(
        1 for a in recent_speaker_actions if a in ("challenge", "escalate", "interrupt")
    )
    if consecutive_aggression >= 3:
        leverage[speaker_id] = _clamp(leverage[speaker_id] - 5)
        state["event_log"].append(
            f"Leverage decay: {current_turn.get('stakeholder_name', speaker_id)} "
            f"overplaying aggression (3+ consecutive)"
        )

    state["leverage_scores"] = leverage

    # --- Dynamic objectives ---
    objectives = state.get("agent_objectives", {})

    if action == "compromise":
        # Speaker conceded → update their objectives to mark the concession
        position_delta = current_turn.get("position_delta", {})
        speaker_objs = objectives.get(speaker_id, [])
        for topic, new_stance in position_delta.items():
            concession_note = f"[CONCEDED] {topic}: {new_stance}"
            if concession_note not in speaker_objs:
                speaker_objs.append(concession_note)
        objectives[speaker_id] = speaker_objs

        # Others sense blood: their objectives gain "push harder on X"
        for s in state["stakeholders"]:
            if s["id"] != speaker_id:
                other_objs = objectives.get(s["id"], [])
                for topic in position_delta:
                    push_note = f"[OPPORTUNITY] {current_turn.get('stakeholder_name', '')} conceded on {topic} — press advantage"
                    if push_note not in other_objs:
                        other_objs.append(push_note)
                objectives[s["id"]] = other_objs

    if action == "coalition_signal" and coalition_target:
        # Both agents gain shared objective
        for aid in (speaker_id, coalition_target):
            objs = objectives.get(aid, [])
            note = f"[COALITION] Aligned with {coalition_target if aid == speaker_id else speaker_id} — maintain united front"
            if note not in objs:
                objs.append(note)
            objectives[aid] = objs

    state["agent_objectives"] = objectives

    return state


# ---------------------------------------------------------------------------
# Node: interrupt_check
# After each turn, checks if any other agent's interrupt_bid exceeds threshold.
# If so, routes to generate_interrupt (extra turn, not consuming budget).
# ---------------------------------------------------------------------------

def _compute_interrupt_bid(
    state: WorkflowState,
    current_turn: dict,
) -> tuple[str | None, float]:
    """
    Pure computation — no state mutation.
    Returns (best_bidder_id, best_bid) or (None, 0.0).
    """
    speaker_id = current_turn.get("stakeholder_id", "")
    trust_matrix = state.get("trust_matrix", {})
    leverage = state.get("leverage_scores", {})
    action = current_turn.get("action_type", "")
    content_lower = current_turn.get("content", "").lower()

    best_bidder = None
    best_bid = 0.0

    for s in state["stakeholders"]:
        sid = s["id"]
        if sid == speaker_id:
            continue

        incentive = s.get("incentive_tuning", 50) / 100.0
        lev = leverage.get(sid, 50) / 100.0
        trust_toward_speaker = trust_matrix.get(sid, {}).get(speaker_id, 50)
        provocation = (100 - trust_toward_speaker) / 100.0
        focus_words = s.get("focus", "").lower().split(", ")
        focus_hit = any(fw in content_lower for fw in focus_words if len(fw) > 3)
        voltage_amp = state["voltage"] / 100.0
        agenda_words = s.get("hidden_agenda", "").lower().split()
        agenda_hit = any(aw in content_lower for aw in agenda_words if len(aw) > 4)

        bid = (
            incentive * 0.25
            + lev * 0.15
            + provocation * 0.25
            + (0.15 if focus_hit else 0.0)
            + (0.10 if agenda_hit else 0.0)
            + voltage_amp * 0.10
        )
        if action in ("challenge", "escalate") and current_turn.get("directed_at") == sid:
            bid += 0.25
        if action == "challenge":
            bid += 0.05

        if bid > best_bid:
            best_bid = bid
            best_bidder = sid

    return best_bidder, best_bid


def pre_interrupt_check(state: WorkflowState) -> WorkflowState:
    """
    Node (not a conditional edge) — computes interrupt bid and updates
    active_speaker_id + consecutive_interrupts + event_log so that the
    downstream conditional edge `interrupt_check` can be a pure read-only
    function.
    """
    current_turn = state.get("current_turn", {})
    consec = state.get("consecutive_interrupts", 0)

    if consec >= MAX_CONSECUTIVE_INTERRUPTS:
        state["event_log"] = list(state["event_log"]) + [
            f"Interrupt chain capped at {MAX_CONSECUTIVE_INTERRUPTS}. Normal flow resumes."
        ]
        state["consecutive_interrupts"] = 0
        # Signal: no interrupt available
        state["_interrupt_bidder"] = None  # type: ignore[typeddict-unknown-key]
        state["_interrupt_bid"] = 0.0       # type: ignore[typeddict-unknown-key]
        return state

    best_bidder, best_bid = _compute_interrupt_bid(state, current_turn)

    if best_bidder and best_bid > INTERRUPT_THRESHOLD:
        bidder = next((s for s in state["stakeholders"] if s["id"] == best_bidder), None)
        name = bidder["name"] if bidder else best_bidder
        state["active_speaker_id"] = best_bidder
        state["consecutive_interrupts"] = consec + 1
        state["event_log"] = list(state["event_log"]) + [
            f"⚡ INTERRUPT: {name} cuts in (bid={best_bid:.2f}, "
            f"threshold={INTERRUPT_THRESHOLD})"
        ]
    else:
        state["consecutive_interrupts"] = 0

    state["_interrupt_bidder"] = best_bidder if best_bid > INTERRUPT_THRESHOLD else None  # type: ignore[typeddict-unknown-key]
    state["_interrupt_bid"] = best_bid  # type: ignore[typeddict-unknown-key]
    return state


def interrupt_check(state: WorkflowState) -> str:
    """
    Conditional edge: pure read — returns 'interrupt' or 'no_interrupt'.
    pre_interrupt_check node does all mutations before this fires.
    """
    bidder = state.get("_interrupt_bidder")  # type: ignore[typeddict-item]
    return "interrupt" if bidder else "no_interrupt"


# Node: generate_interrupt — same as generate_turn but agent knows it's interrupting
async def generate_interrupt(state: WorkflowState) -> WorkflowState:
    """Fire the interrupting agent. Reuses generate_turn logic."""
    # Tag the upcoming turn as an interrupt
    original_turn = state.get("current_turn", {})
    state = await generate_turn(state)

    # Override action_type to "interrupt" and set interrupt_type
    if state["history"]:
        last = state["history"][-1]
        last["action_type"] = "interrupt"
        # Determine interrupt type based on content
        content = last.get("content", "").lower()
        if any(w in content for w in ["no", "stop", "wait", "hold on", "actually"]):
            last["interrupt_type"] = "cut_off"
        elif any(w in content for w in ["let me reframe", "the real issue", "perspective"]):
            last["interrupt_type"] = "reframe"
        elif any(w in content for w in ["i agree", "exactly", "building on"]):
            last["interrupt_type"] = "pile_on"
        else:
            last["interrupt_type"] = "deflect"

        state["event_log"].append(
            f"  └─ {last.get('stakeholder_name', '?')} interrupts with: "
            f"{last.get('interrupt_type', 'unknown')}"
        )

    return state


# ---------------------------------------------------------------------------
# Conditional edge: should_continue (same as before, fires after dynamics)
# ---------------------------------------------------------------------------

def should_continue(state: WorkflowState) -> str:
    history = state["history"]
    turn_index = state["turn_index"]
    max_turns = state["max_turns"]

    # Count only non-interrupt turns toward budget
    normal_turns = sum(
        1 for t in history if t.get("action_type") != "interrupt"
    )
    if normal_turns >= max_turns:
        state["event_log"].append(
            f"Negotiation complete: {normal_turns} normal turns "
            f"(+ {len(history) - normal_turns} interrupts)"
        )
        return "end"

    # Deadlock: 4 consecutive challenge/escalate (excluding interrupts)
    if len(history) >= 4:
        recent = history[-4:]
        blocking = sum(
            1 for t in recent
            if t.get("action_type") in ("challenge", "escalate")
        )
        if blocking >= 4:
            state["event_log"].append("Deadlock: 4 consecutive challenges. Stopping.")
            return "end"

    # Consensus: 3+ coalition signals in last 5 turns
    if len(history) >= 5:
        recent = history[-5:]
        coalitions = sum(1 for t in recent if t.get("coalition_with") is not None)
        if coalitions >= 3:
            state["event_log"].append("Consensus emerging: closing negotiation.")
            return "end"

    return "continue"


# ---------------------------------------------------------------------------
# Graph factory
# ---------------------------------------------------------------------------

def _build_graph() -> StateGraph:
    workflow = StateGraph(WorkflowState)

    # Nodes
    workflow.add_node("select_speaker", select_next_speaker)
    workflow.add_node("generate_turn", generate_turn)
    workflow.add_node("update_dynamics", update_dynamics)
    workflow.add_node("pre_interrupt_check", pre_interrupt_check)
    workflow.add_node("generate_interrupt", generate_interrupt)
    workflow.add_node("update_dynamics_interrupt", update_dynamics)
    workflow.add_node("pre_interrupt_check_2", pre_interrupt_check)

    # Entry
    workflow.set_entry_point("select_speaker")

    # Normal flow
    workflow.add_edge("select_speaker", "generate_turn")
    workflow.add_edge("generate_turn", "update_dynamics")
    workflow.add_edge("update_dynamics", "pre_interrupt_check")

    # After dynamics: pre_interrupt_check sets sentinel, then conditional edge fires
    workflow.add_conditional_edges(
        "pre_interrupt_check",
        interrupt_check,
        {"interrupt": "generate_interrupt", "no_interrupt": "should_continue_gate"},
    )

    # Interrupt path: generate interrupt → update dynamics again → check continue
    workflow.add_edge("generate_interrupt", "update_dynamics_interrupt")
    workflow.add_edge("update_dynamics_interrupt", "pre_interrupt_check_2")

    # After interrupt dynamics: check for another interrupt or continue
    workflow.add_conditional_edges(
        "pre_interrupt_check_2",
        interrupt_check,
        {"interrupt": "generate_interrupt", "no_interrupt": "should_continue_gate"},
    )

    # Continue gate
    workflow.add_node("should_continue_gate", lambda s: s)  # passthrough
    workflow.add_conditional_edges(
        "should_continue_gate",
        should_continue,
        {"continue": "select_speaker", "end": END},
    )

    return workflow


def _get_compiled_graph(simulation_id: str):
    if simulation_id not in _graph_registry:
        checkpointer = MemorySaver()
        _checkpointer_registry[simulation_id] = checkpointer
        _graph_registry[simulation_id] = _build_graph().compile(
            checkpointer=checkpointer
        )
    return _graph_registry[simulation_id], _checkpointer_registry[simulation_id]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_workflow(
    simulation_id: str,
    background: str,
    primary_goal: str,
    stakeholders: List[Stakeholder],
    voltage: int,
    env_flags: Dict[str, bool],
    max_turns: int,
    openrouter_api_key: str,
):
    if simulation_id not in _agent_registry:
        agent_instances: Dict[str, BoardroomAgent] = {}
        for stakeholder in stakeholders:
            agent = create_agent_for_stakeholder(
                stakeholder=stakeholder,
                openrouter_api_key=openrouter_api_key,
            )
            agent_instances[stakeholder.id] = agent
        _agent_registry[simulation_id] = agent_instances

    _get_sim_memory(simulation_id)
    graph, _ = _get_compiled_graph(simulation_id)

    stakeholder_dicts = [
        {
            "id": s.id,
            "name": s.name,
            "role": s.role,
            "focus": s.focus,
            "incentive_tuning": s.incentive_tuning,
            "hidden_agenda": s.hidden_agenda,
            "tag": s.tag,
            "tool_profile": s.tool_profile,
        }
        for s in stakeholders
    ]

    initial_state: WorkflowState = {
        "simulation_id": simulation_id,
        "turn_index": 0,
        "background": background,
        "primary_goal": primary_goal,
        "stakeholders": stakeholder_dicts,
        "voltage": voltage,
        "env_flags": env_flags,
        "active_speaker_id": "",
        "history": [],
        "heatmap": {"commercial_gain": 50, "tech_integrity": 50, "legal_safety": 50},
        "event_log": [],
        "max_turns": max_turns,
        "current_turn": {},
        # production dynamics
        "trust_matrix": _init_trust_matrix(stakeholder_dicts),
        "leverage_scores": _init_leverage(stakeholder_dicts),
        "agent_objectives": _init_objectives(stakeholder_dicts),
        "consecutive_interrupts": 0,
        "_interrupt_bidder": None,
        "_interrupt_bid": 0.0,
    }

    return graph, initial_state
