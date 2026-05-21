from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

from langsmith import traceable

from . import config
from .workflow import create_workflow, WorkflowState, _graph_registry, _checkpointer_registry
from .models import ConflictPoint, SimulationState, Turn
from .memory import get_memory


def _turns_to_history(turns: list[Turn]) -> list[dict]:
    return [
        {
            "turn_index": t.turn_index,
            "stakeholder_id": t.stakeholder_id,
            "stakeholder_name": t.stakeholder_name,
            "role": t.role,
            "content": t.content,
            "action_type": t.action_type,
            "directed_at": t.directed_at,
            "coalition_with": t.coalition_with,
            "emotional_tone": t.emotional_tone,
        }
        for t in turns
    ]


def _sentiment_from_turn(turn: Turn) -> float:
    c = turn.content.lower()
    if any(kw in c for kw in ["agree", "support", "align", "compromise", "accept"]):
        return min(1.0, 0.3 + (turn.turn_index % 3) * 0.1)
    if any(kw in c for kw in ["concern", "risk", "cannot", "blocked", "reject", "unacceptable"]):
        return max(-1.0, -0.4 - (turn.turn_index % 3) * 0.1)
    return 0.0


def _apply_new_turns(
    state: SimulationState,
    final_workflow_state: dict,
    prior_turn_count: int,
) -> SimulationState:
    """Merge any new turns produced by the workflow back into SimulationState."""
    new_history = final_workflow_state["history"][prior_turn_count:]

    for td in new_history:
        turn = Turn(
            turn_index=td["turn_index"],
            stakeholder_id=td["stakeholder_id"],
            stakeholder_name=td["stakeholder_name"],
            role=td["role"],
            content=td["content"],
            internal_reasoning=td.get("internal_reasoning", ""),
            action_type=td["action_type"],
            directed_at=td.get("directed_at"),
            coalition_with=td.get("coalition_with"),
            emotional_tone=td.get("emotional_tone", "neutral"),
        )
        state.turns.append(turn)
        state.active_speaker_id = turn.stakeholder_id
        state.sentiment.append(_sentiment_from_turn(turn))

        conflict_type = (
            "clash" if turn.action_type in ("challenge", "escalate") else "neutral"
        )
        state.conflict_timeline.append(
            ConflictPoint(
                step=turn.turn_index,
                label=f"{turn.stakeholder_name}: {turn.action_type}",
                type=conflict_type,
            )
        )

    # Sync heatmap
    h = final_workflow_state["heatmap"]
    state.heatmap.commercial_gain = h["commercial_gain"]
    state.heatmap.tech_integrity = h["tech_integrity"]
    state.heatmap.legal_safety = h["legal_safety"]

    # Append only new event_log entries
    existing = set(state.event_log)
    for entry in final_workflow_state.get("event_log", []):
        if entry not in existing:
            state.event_log.append(entry)
            existing.add(entry)

    # Sync production dynamics from workflow state
    if final_workflow_state.get("trust_matrix"):
        state.trust_matrix = final_workflow_state["trust_matrix"]
    if final_workflow_state.get("leverage_scores"):
        state.leverage_scores = final_workflow_state["leverage_scores"]
    if final_workflow_state.get("agent_objectives"):
        state.agent_objectives = final_workflow_state["agent_objectives"]

    # Sync interrupt_type back onto Turn objects where applicable
    for td in new_history:
        if td.get("interrupt_type") and state.turns:
            matching = next(
                (t for t in state.turns if t.turn_index == td["turn_index"]), None
            )
            if matching:
                matching.interrupt_type = td["interrupt_type"]

    return state


@traceable(name="advance_turn", run_type="chain")
async def advance_turn(state: SimulationState, n_turns: int = 1) -> SimulationState:
    """
    Advance negotiation by n_turns using the persistent LangGraph workflow.

    Changes vs old implementation:
    - Graph is built ONCE per simulation (reused across calls via _graph_registry)
    - Agents are created ONCE per simulation (reused via _agent_registry)
    - MemorySaver checkpointer preserves LangGraph state between calls
    - max_turns controls how many turns THIS invocation runs
    - should_continue fires correctly (no longer always 'end' after 1 turn)
    """
    from .persistence import get_checkpoint_manager

    checkpoint_manager = get_checkpoint_manager()
    prior_turn_count = len(state.turns)

    workflow_graph, initial_state = create_workflow(
        simulation_id=state.simulation_id,
        background=state.config.background,
        primary_goal=state.config.primary_goal,
        stakeholders=state.config.stakeholders,
        voltage=state.config.voltage,
        env_flags=state.config.env_flags.model_dump(),
        max_turns=prior_turn_count + n_turns,
        openrouter_api_key=config.OPENROUTER_API_KEY,
    )

    # Build the input state for this invocation — seed from SimulationState
    # so LangGraph starts with the correct history / turn_index / heatmap.
    invoke_input: WorkflowState = {
        **initial_state,
        "turn_index": prior_turn_count,
        "history": _turns_to_history(state.turns),
        "heatmap": {
            "commercial_gain": state.heatmap.commercial_gain,
            "tech_integrity": state.heatmap.tech_integrity,
            "legal_safety": state.heatmap.legal_safety,
        },
        "max_turns": prior_turn_count + n_turns,
        # Restore production dynamics if present from previous turns
        "trust_matrix": state.trust_matrix or initial_state["trust_matrix"],
        "leverage_scores": state.leverage_scores or initial_state["leverage_scores"],
        "agent_objectives": state.agent_objectives or initial_state["agent_objectives"],
        "_interrupt_bidder": None,
        "_interrupt_bid": 0.0,
    }

    # LangGraph MemorySaver thread_id lets the graph resume its own internal
    # state between calls.  We key on simulation_id so each simulation is
    # a separate thread.
    run_config = {"configurable": {"thread_id": state.simulation_id}}
    final_state = await workflow_graph.ainvoke(invoke_input, config=run_config)

    state = _apply_new_turns(state, final_state, prior_turn_count)

    checkpoint_manager.save_checkpoint(
        simulation_id=state.simulation_id,
        state=state,
        metadata={
            "turn_count": len(state.turns),
            "active_speaker": state.active_speaker_id,
            "status": state.status,
        },
    )

    return state


async def stream_simulation_events(state: SimulationState) -> AsyncIterator[dict[str, Any]]:
    """Stream simulation events for SSE, one turn at a time."""
    limit = config.MAX_TURNS

    while len(state.turns) < limit and state.status == "running":
        prev_count = len(state.turns)
        state = await advance_turn(state, n_turns=1)

        if len(state.turns) == prev_count:
            break  # workflow ended early (deadlock / consensus)

        last_turn = state.turns[-1]

        yield {
            "type": "turn",
            "data": {
                "turn_index": last_turn.turn_index,
                "stakeholder_id": last_turn.stakeholder_id,
                "stakeholder_name": last_turn.stakeholder_name,
                "role": last_turn.role,
                "content": last_turn.content,
                "action_type": last_turn.action_type,
                "emotional_tone": last_turn.emotional_tone,
                "directed_at": last_turn.directed_at,
                "coalition_with": last_turn.coalition_with,
            },
        }

        yield {
            "type": "heatmap",
            "data": {
                "commercial_gain": state.heatmap.commercial_gain,
                "tech_integrity": state.heatmap.tech_integrity,
                "legal_safety": state.heatmap.legal_safety,
            },
        }

        from .llm import estimate_token_cost
        words = len(last_turn.content.split())
        prompt_tokens = int(words * 1.3 * 3)
        completion_tokens = int(words * 1.3)
        total_tokens = prompt_tokens + completion_tokens
        yield {
            "type": "cost",
            "data": {
                "turn_index": last_turn.turn_index,
                "tokens": {"prompt": prompt_tokens, "completion": completion_tokens, "total": total_tokens},
                "cost_usd": round(estimate_token_cost(total_tokens), 6),
            },
        }

        await asyncio.sleep(0)

    state.status = "complete"
    yield {
        "type": "complete",
        "data": {
            "total_turns": len(state.turns),
            "final_heatmap": {
                "commercial_gain": state.heatmap.commercial_gain,
                "tech_integrity": state.heatmap.tech_integrity,
                "legal_safety": state.heatmap.legal_safety,
            },
        },
    }


def run_simulation(state: SimulationState, max_turns: int | None = None) -> SimulationState:
    async def _run() -> SimulationState:
        limit = max_turns or config.MAX_TURNS
        next_state = state.model_copy(deep=True)
        next_state.status = "running"
        while len(next_state.turns) < limit and next_state.status == "running":
            prev = len(next_state.turns)
            next_state = await advance_turn(next_state, n_turns=1)
            if len(next_state.turns) == prev:
                break  # stopped early
        next_state.status = "complete"
        return next_state

    return asyncio.run(_run())
