from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from pydantic import ValidationError

from . import config
from .llm import openrouter_completion, parse_json_object
from .models import (
    ActionType,
    AgentMemory,
    CoalitionSignal,
    ConflictPoint,
    HeatmapState,
    LeverageShift,
    SimulationState,
    Turn,
)

ACTION_TYPES: tuple[ActionType, ...] = (
    "statement",
    "question",
    "challenge",
    "compromise",
    "coalition_signal",
    "interrupt",
    "escalate",
)

NEGATIVE_TERMS = (
    "risk", "concern", "cannot", "blocked", "breach", "clawback",
    "veto", "exclusive", "penalty", "liability", "unacceptable",
    "non-starter", "reject", "walk away", "deadlock",
)
POSITIVE_TERMS = (
    "agree", "support", "workable", "align", "compromise", "pilot",
    "phase", "trust", "path", "close", "viable", "progress", "accept",
)

EMOTIONAL_TONES = ("neutral", "tense", "heated", "conciliatory")


# ---------------------------------------------------------------------------
# Temperature
# ---------------------------------------------------------------------------

def _temperature_for_state(state: SimulationState) -> float:
    base = 0.35 if state.config.model_temperature == "stable" else 0.82
    voltage_adjustment = (state.config.voltage - 50) / 200
    # raise temperature when deadlock risk is high
    deadlock_boost = state.deadlock_risk_score / 500
    return max(0.1, min(1.0, base + voltage_adjustment + deadlock_boost))


# ---------------------------------------------------------------------------
# Memory helpers
# ---------------------------------------------------------------------------

def _get_or_create_memory(state: SimulationState, agent_id: str) -> AgentMemory:
    for mem in state.agent_memories:
        if mem.agent_id == agent_id:
            return mem
    new_mem = AgentMemory(agent_id=agent_id)
    state.agent_memories.append(new_mem)
    return new_mem


def _memory_summary(state: SimulationState, agent_id: str) -> str:
    mem = _get_or_create_memory(state, agent_id)
    parts: list[str] = []
    if mem.positions:
        parts.append("Positions held: " + "; ".join(mem.positions[-3:]))
    if mem.concessions:
        parts.append("Concessions made: " + "; ".join(mem.concessions[-2:]))
    if mem.red_lines:
        parts.append("Red lines: " + "; ".join(mem.red_lines[-2:]))
    return " | ".join(parts) if parts else "No prior history."


def _update_memory(state: SimulationState, turn: Turn) -> None:
    mem = _get_or_create_memory(state, turn.stakeholder_id)
    content_lower = turn.content.lower()
    if turn.action_type in ("statement", "escalate"):
        # extract a short position snippet (first sentence, capped)
        first_sentence = turn.content.split(".")[0][:120]
        mem.positions.append(first_sentence)
    elif turn.action_type == "compromise":
        mem.concessions.append(turn.content.split(".")[0][:120])
    elif turn.action_type in ("challenge", "interrupt") and any(
        kw in content_lower for kw in ("never", "non-starter", "cannot accept", "walk away", "red line")
    ):
        mem.red_lines.append(turn.content.split(".")[0][:120])


# ---------------------------------------------------------------------------
# Coalition tracking
# ---------------------------------------------------------------------------

def _update_coalitions(state: SimulationState, turn: Turn) -> None:
    if turn.action_type == "coalition_signal" and turn.coalition_with:
        # check if coalition already exists
        for c in state.coalitions:
            if {c.agent_a, c.agent_b} == {turn.stakeholder_id, turn.coalition_with}:
                return
        # derive issue from content
        issue = turn.content.split(".")[0][:100]
        state.coalitions.append(
            CoalitionSignal(
                agent_a=turn.stakeholder_id,
                agent_b=turn.coalition_with,
                issue=issue,
            )
        )


# ---------------------------------------------------------------------------
# Leverage tracking
# ---------------------------------------------------------------------------

def _check_leverage_shift(state: SimulationState, turn: Turn) -> None:
    if not turn.leverage_gained:
        return
    prev_turns = state.turns
    if not prev_turns:
        return
    # find who lost leverage: the agent who was challenged or escalated against
    if turn.directed_at:
        state.leverage_shifts.append(
            LeverageShift(
                turn_index=turn.turn_index,
                from_agent=turn.directed_at,
                to_agent=turn.stakeholder_id,
                reason=turn.content.split(".")[0][:100],
            )
        )


# ---------------------------------------------------------------------------
# Deadlock risk
# ---------------------------------------------------------------------------

def _update_deadlock_risk(state: SimulationState, turn: Turn) -> None:
    if turn.action_type in ("challenge", "escalate", "interrupt"):
        state.deadlock_risk_score = min(100, state.deadlock_risk_score + 6)
    elif turn.action_type in ("compromise", "coalition_signal"):
        state.deadlock_risk_score = max(0, state.deadlock_risk_score - 8)


# ---------------------------------------------------------------------------
# Transcript
# ---------------------------------------------------------------------------

def _transcript_markdown(state: SimulationState) -> str:
    if not state.turns:
        return "_No turns yet._"
    lines = []
    for turn in state.turns:
        directed = f" → {turn.directed_at}" if turn.directed_at else ""
        interrupt_flag = f" [{turn.interrupt_type}]" if turn.interrupt_type else ""
        coalition_flag = f" [coalition w/ {turn.coalition_with}]" if turn.coalition_with else ""
        lines.append(
            f"{turn.turn_index}. **{turn.stakeholder_name} ({turn.role})**{directed}: "
            f"{turn.content}{interrupt_flag}{coalition_flag}"
        )
    return "\n".join(lines)


def _stakeholder_roster(state: SimulationState) -> list[dict[str, Any]]:
    return [
        {
            "id": s.id,
            "name": s.name,
            "role": s.role,
            "focus": s.focus,
            "incentive_tuning": s.incentive_tuning,
            "hidden_agenda": s.hidden_agenda if state.config.env_flags.hidden_motives else "",
            "tag": s.tag,
            "memory_summary": _memory_summary(state, s.id),
        }
        for s in state.config.stakeholders
    ]


# ---------------------------------------------------------------------------
# Mock turn
# ---------------------------------------------------------------------------

def _mock_turn_payload(state: SimulationState) -> dict[str, Any]:
    stakeholder = state.config.stakeholders[len(state.turns) % len(state.config.stakeholders)]
    action_cycle: tuple[ActionType, ...] = (
        "statement", "challenge", "question", "interrupt",
        "compromise", "coalition_signal", "escalate",
    )
    content_templates = (
        "I can support the partnership if distribution scope is explicit and the rollout has crisp milestones.",
        "The revenue share wording still exposes us to margin risk; I need tighter clawbacks before approval.",
        "Can we define the compliance pack and data ownership boundaries before exclusivity is discussed?",
        "Hold on—I need to push back on that. You're conflating two separate risk categories here.",
        "A phased pilot with regional carve-outs gives both sides a workable path without overcommitting.",
        "I hear Finance and Legal converging on a narrower launch; I can work with that if channel flexibility is preserved.",
        "This is non-negotiable for us. Data portability must be in the contract or we cannot proceed.",
    )
    idx = len(state.turns)
    action = action_cycle[idx % len(action_cycle)]
    # simulate directed_at
    other_agents = [s.id for s in state.config.stakeholders if s.id != stakeholder.id]
    directed = other_agents[(idx // 2) % len(other_agents)] if other_agents else None
    coalition_with = None
    interrupt_type = None
    if action == "coalition_signal" and len(other_agents) >= 1:
        coalition_with = other_agents[0]
    if action == "interrupt":
        interrupt_type = "cut_off"
    return {
        "speaker_id": stakeholder.id,
        "content": content_templates[idx % len(content_templates)],
        "internal_reasoning": f"Mock: {stakeholder.name} advancing their position on agenda item {state.current_agenda_item + 1}.",
        "action_type": action,
        "directed_at": directed,
        "coalition_with": coalition_with,
        "interrupt_type": interrupt_type,
        "leverage_gained": action in ("challenge", "escalate"),
        "emotional_tone": "tense" if action in ("challenge", "escalate", "interrupt") else "neutral",
        "done": idx + 1 >= min(config.MAX_TURNS, 8),
    }


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

def _build_turn_messages(state: SimulationState) -> list[dict[str, Any]]:
    """
    Two-stage orchestrator prompt:
    1. System: sets up the orchestrator's role with negotiation dynamics.
    2. User: provides full state JSON with roster (including memories), transcript,
       env flags, active coalitions, deadlock risk.
    """
    schema = {
        "speaker_id": "one stakeholder id from the roster",
        "content": (
            "Authentic spoken contribution—may be mid-sentence if interrupting. "
            "Reference prior statements by name. Challenge assumptions. Ask hard questions. "
            "Express frustration, enthusiasm, or suspicion as appropriate."
        ),
        "internal_reasoning": (
            "Private rationale: why this agent speaks now, what leverage move they're making, "
            "what they're concealing, and what they want the next move to be."
        ),
        "action_type": list(ACTION_TYPES),
        "directed_at": "optional stakeholder_id this turn is aimed at",
        "coalition_with": "optional stakeholder_id if forming/signaling alignment",
        "interrupt_type": ["cut_off", "reframe", "pile_on", "deflect", None],
        "leverage_gained": "boolean — true if this move shifts bargaining power",
        "emotional_tone": EMOTIONAL_TONES,
        "done": "optional boolean, true only when natural closure is genuinely reached",
    }

    # Build coalition context
    coalition_context = ""
    if state.coalitions:
        pairs = [f"{c.agent_a} & {c.agent_b} on '{c.issue}'" for c in state.coalitions[-4:]]
        coalition_context = "Active coalitions: " + "; ".join(pairs)

    # Build leverage context
    leverage_context = ""
    if state.leverage_shifts:
        recent = state.leverage_shifts[-2:]
        leverage_context = "Recent leverage shifts: " + "; ".join(
            f"{ls.to_agent} gained over {ls.from_agent}" for ls in recent
        )

    system_prompt = (
        "You are the negotiation orchestrator for a high-stakes boardroom simulation. "
        "Your job is to select the next speaker and generate their authentic contribution.\n\n"
        "RULES:\n"
        "1. Agents have persistent memories—they MUST reference prior statements and positions.\n"
        "2. Agents with high incentive_tuning (>65) are aggressive and self-interested.\n"
        "3. Agents with hidden_agenda actively work toward it even if it means disrupting consensus.\n"
        "4. Interruptions (action_type=interrupt) are realistic—agents cut each other off when stakes are high.\n"
        "5. Coalition signals are strategic—agents ally temporarily when it serves their agenda.\n"
        "6. Escalations happen when red lines are crossed or time pressure is high.\n"
        "7. Compromises must be specific and tied to a concrete trade-off, not vague agreement.\n"
        "8. NEVER generate artificial consensus. Maintain authentic disagreement where incentives conflict.\n"
        "9. Return ONLY a valid JSON object matching the schema. No markdown, no explanation.\n"
    )

    user_payload = {
        "schema": schema,
        "scenario_background": state.config.background,
        "primary_goal": state.config.primary_goal,
        "stakeholder_roster": _stakeholder_roster(state),
        "transcript_markdown": _transcript_markdown(state),
        "voltage": state.config.voltage,
        "env_flags": state.config.env_flags.model_dump(),
        "model_temperature": state.config.model_temperature,
        "turn_index": len(state.turns) + 1,
        "current_agenda_item": state.current_agenda_item,
        "deadlock_risk_score": state.deadlock_risk_score,
        "coalition_context": coalition_context,
        "leverage_context": leverage_context,
        "time_pressure_active": state.config.env_flags.time_pressure,
    }

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(user_payload)},
    ]


# ---------------------------------------------------------------------------
# Fallback / normalization
# ---------------------------------------------------------------------------

def _fallback_turn_payload(state: SimulationState, parsed: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = parsed or {}
    stakeholder_ids = {s.id for s in state.config.stakeholders}
    speaker_id = payload.get("speaker_id")
    if speaker_id not in stakeholder_ids:
        speaker_id = state.config.stakeholders[len(state.turns) % len(state.config.stakeholders)].id
    action_type = payload.get("action_type")
    if action_type not in ACTION_TYPES:
        action_type = "statement"
    interrupt_type = payload.get("interrupt_type")
    if interrupt_type not in ("cut_off", "reframe", "pile_on", "deflect", None):
        interrupt_type = None
    directed_at = payload.get("directed_at")
    if directed_at and directed_at not in stakeholder_ids:
        directed_at = None
    coalition_with = payload.get("coalition_with")
    if coalition_with and coalition_with not in stakeholder_ids:
        coalition_with = None
    return {
        "speaker_id": speaker_id,
        "content": str(payload.get("content") or "I need clearer terms before we can move forward."),
        "internal_reasoning": str(payload.get("internal_reasoning") or "Fallback normalized invalid model JSON."),
        "action_type": action_type,
        "directed_at": directed_at,
        "coalition_with": coalition_with,
        "interrupt_type": interrupt_type,
        "leverage_gained": bool(payload.get("leverage_gained", False)),
        "emotional_tone": str(payload.get("emotional_tone") or "neutral"),
        "done": bool(payload.get("done", False)),
    }


# ---------------------------------------------------------------------------
# Heatmap
# ---------------------------------------------------------------------------

def _keyword_count(content: str, terms: tuple[str, ...]) -> int:
    lowered = content.lower()
    return sum(1 for term in terms if term in lowered)


def _clamp_heatmap(value: int) -> int:
    return max(0, min(100, value))


def _update_heatmap(heatmap: HeatmapState, turn: Turn) -> HeatmapState:
    content = turn.content.lower()
    commercial = heatmap.commercial_gain
    tech = heatmap.tech_integrity
    legal = heatmap.legal_safety

    if re.search(r"revenue|margin|roi|pricing|clawback|payback|commercial", content):
        commercial += 4 if turn.action_type in ("compromise", "coalition_signal") else -3
    if re.search(r"integration|latency|architecture|api|technical|rollout", content):
        tech += 4 if turn.action_type not in ("challenge", "escalate") else -4
    if re.search(r"legal|compliance|data|privacy|sla|liability|ownership", content):
        legal += 4 if turn.action_type == "compromise" else -4

    if turn.action_type in ("challenge", "escalate", "interrupt"):
        commercial -= 3
        legal -= 3
    if turn.action_type == "compromise":
        commercial += 3
        tech += 2
        legal += 3

    return HeatmapState(
        commercial_gain=_clamp_heatmap(commercial),
        tech_integrity=_clamp_heatmap(tech),
        legal_safety=_clamp_heatmap(legal),
        recommendation=_heatmap_recommendation(commercial, tech, legal),
    )


def _heatmap_recommendation(commercial: int, tech: int, legal: int) -> str:
    lowest = min(
        ("commercial terms", commercial),
        ("technical rollout", tech),
        ("legal safety", legal),
        key=lambda item: item[1],
    )
    if lowest[1] < 30:
        return f"Critical: {lowest[0]} is at risk of collapse. Intervene now."
    if lowest[1] < 50:
        return f"Stabilize {lowest[0]} before pushing for closure."
    return "Negotiation remains viable; steer toward concrete trade-offs."


# ---------------------------------------------------------------------------
# Sentiment
# ---------------------------------------------------------------------------

def _sentiment_score(content: str) -> float:
    positive = _keyword_count(content, POSITIVE_TERMS)
    negative = _keyword_count(content, NEGATIVE_TERMS)
    if positive == negative:
        return 0.0
    return max(-1.0, min(1.0, (positive - negative) / max(positive + negative, 1)))


# ---------------------------------------------------------------------------
# Event log
# ---------------------------------------------------------------------------

def _event_line(turn: Turn) -> str:
    verb_by_action: dict[str, str] = {
        "statement": "framed position on",
        "question": "pressed on",
        "challenge": "challenged",
        "compromise": "proposed a compromise on",
        "coalition_signal": "signaled alignment on",
        "interrupt": "cut off discussion of",
        "escalate": "escalated tensions over",
    }
    topic = "partnership terms"
    lowered = turn.content.lower()
    if "revenue" in lowered or "margin" in lowered:
        topic = "revenue share"
    elif "compliance" in lowered or "data" in lowered:
        topic = "compliance boundaries"
    elif "exclusive" in lowered or "carve" in lowered:
        topic = "exclusivity carve-outs"
    elif "rollout" in lowered or "pilot" in lowered:
        topic = "rollout structure"
    elif "clawback" in lowered:
        topic = "clawback terms"

    directed = f" (→ {turn.directed_at})" if turn.directed_at else ""
    coalition = f" [w/ {turn.coalition_with}]" if turn.coalition_with else ""
    return f"> {turn.stakeholder_name} {verb_by_action[turn.action_type]} {topic}{directed}{coalition}"


# ---------------------------------------------------------------------------
# Conflict timeline
# ---------------------------------------------------------------------------

def _conflict_type(turn_index: int, max_turns: int) -> str:
    if turn_index <= max(2, max_turns // 5):
        return "intro"
    if turn_index >= max_turns - max(2, max_turns // 5):
        return "closure"
    return "clash"


# ---------------------------------------------------------------------------
# Agenda advancement
# ---------------------------------------------------------------------------

AGENDA_ADVANCE_THRESHOLD = 4  # turns before automatically nudging to next agenda item


def _maybe_advance_agenda(state: SimulationState) -> None:
    """Advance agenda item every N turns or when a compromise is reached."""
    turns_since_last = len(state.turns) - state.current_agenda_item * AGENDA_ADVANCE_THRESHOLD
    if turns_since_last >= AGENDA_ADVANCE_THRESHOLD:
        state.current_agenda_item = min(state.current_agenda_item + 1, 5)


# ---------------------------------------------------------------------------
# Main turn advance
# ---------------------------------------------------------------------------

async def advance_turn(
    state: SimulationState,
    *,
    episode_limit: int,
) -> tuple[SimulationState, bool]:
    """Generate and append the next coherent negotiation turn."""

    messages = _build_turn_messages(state)
    raw, mocked = await openrouter_completion(
        messages,
        temperature=_temperature_for_state(state),
        mock_response=_mock_turn_payload(state),
    )
    try:
        payload = _fallback_turn_payload(state, parse_json_object(raw))
    except (json.JSONDecodeError, TypeError, ValidationError):
        payload = _fallback_turn_payload(state)

    stakeholder = next(
        s for s in state.config.stakeholders if s.id == payload["speaker_id"]
    )
    turn_index = len(state.turns) + 1
    turn = Turn(
        turn_index=turn_index,
        stakeholder_id=stakeholder.id,
        stakeholder_name=stakeholder.name,
        role=stakeholder.role,
        content=payload["content"],
        internal_reasoning=payload["internal_reasoning"],
        action_type=payload["action_type"],
        directed_at=payload.get("directed_at"),
        coalition_with=payload.get("coalition_with"),
        interrupt_type=payload.get("interrupt_type"),
        leverage_gained=payload.get("leverage_gained", False),
        emotional_tone=payload.get("emotional_tone", "neutral"),
    )

    next_state = state.model_copy(deep=True)
    next_state.turns.append(turn)
    next_state.heatmap = _update_heatmap(next_state.heatmap, turn)
    next_state.sentiment.append(_sentiment_score(turn.content))
    next_state.event_log.append(_event_line(turn))
    next_state.conflict_timeline.append(
        ConflictPoint(
            step=turn_index,
            label=f"{turn.stakeholder_name}: {turn.action_type.replace('_', ' ')}",
            type=_conflict_type(turn_index, episode_limit),
        )
    )
    next_state.active_speaker_id = stakeholder.id
    next_state.mocked = next_state.mocked or mocked

    # Enriched state updates
    _update_memory(next_state, turn)
    _update_coalitions(next_state, turn)
    _check_leverage_shift(next_state, turn)
    _update_deadlock_risk(next_state, turn)
    _maybe_advance_agenda(next_state)

    orchestrator_done = bool(payload.get("done", False))
    return next_state, orchestrator_done


# ---------------------------------------------------------------------------
# Sync runner
# ---------------------------------------------------------------------------

def run_simulation(state: SimulationState, max_turns: int | None = None) -> SimulationState:
    """Run turns synchronously until max turns or natural orchestrator closure."""

    async def _run() -> SimulationState:
        limit = max_turns or config.MAX_TURNS
        next_state = state.model_copy(deep=True)
        next_state.status = "running"
        orchestrator_done = False
        while len(next_state.turns) < limit and not orchestrator_done:
            next_state, orchestrator_done = await advance_turn(
                next_state,
                episode_limit=limit,
            )
        next_state.status = "complete"
        return next_state

    return asyncio.run(_run())
