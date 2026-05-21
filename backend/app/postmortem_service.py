from __future__ import annotations

import json

from .models import (
    AlignmentDelta,
    LeverageShift,
    Postmortem,
    SimulationState,
    StrategyCard,
    TopologyNode,
)


def transcript(state: SimulationState) -> str:
    return "\n".join(
        f"{turn.turn_index}. {turn.stakeholder_name} ({turn.role}): {turn.content}"
        for turn in state.turns
    )


def postmortem_messages(state: SimulationState) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "Create a detailed postmortem for a simulated boardroom partnership negotiation. "
                "Analyze the transcript for real tensions, coalition dynamics, leverage shifts, and unresolved issues. "
                "Return only valid JSON matching the requested fields."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "schema": {
                        "confidence_score": "integer 0-100",
                        "confidence_trend": "integer delta, can be negative",
                        "unanticipated_objections": "integer",
                        "unanticipated_note": "brief analytical summary of unexpected dynamics",
                        "consensus_rating": "integer 0-100",
                        "objection_topology": [
                            {
                                "id": "string",
                                "label": "string",
                                "kind": "root | objection | resolution",
                                "parents": ["parent ids"],
                            }
                        ],
                        "alignment_deltas": [
                            {
                                "stakeholder_id": "string",
                                "name": "string",
                                "role": "string",
                                "delta": "integer -100..100",
                                "quote": "short quote from transcript",
                            }
                        ],
                        "strategy_cards": [
                            {
                                "objection": "string — specific objection raised",
                                "counter": "string — tactical counter move",
                                "risk": "LOW | MEDIUM | HIGH",
                            }
                        ],
                    },
                    "stakeholders": [s.model_dump() for s in state.config.stakeholders],
                    "transcript": transcript(state),
                    "event_log": state.event_log,
                    "heatmap": state.heatmap.model_dump(),
                    "sentiment": state.sentiment,
                    "coalitions": [c.model_dump() for c in state.coalitions],
                    "leverage_shifts": [ls.model_dump() for ls in state.leverage_shifts],
                    "deadlock_risk_score": state.deadlock_risk_score,
                }
            ),
        },
    ]


def postmortem_from_payload(simulation_id: str, payload: dict[str, object], mocked: bool) -> Postmortem:
    return Postmortem(
        simulation_id=simulation_id,
        confidence_score=int(payload.get("confidence_score", 60)),
        confidence_trend=int(payload.get("confidence_trend", 0)),
        unanticipated_objections=int(payload.get("unanticipated_objections", 0)),
        unanticipated_note=str(payload.get("unanticipated_note", "")),
        consensus_rating=int(payload.get("consensus_rating", 60)),
        objection_topology=[
            TopologyNode(**item)
            for item in payload.get("objection_topology", [])
            if isinstance(item, dict)
        ],
        alignment_deltas=[
            AlignmentDelta(**item)
            for item in payload.get("alignment_deltas", [])
            if isinstance(item, dict)
        ],
        strategy_cards=[
            StrategyCard(**item)
            for item in payload.get("strategy_cards", [])
            if isinstance(item, dict)
        ],
        mocked=mocked,
    )
