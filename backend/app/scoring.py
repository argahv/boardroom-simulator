from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any

WEIGHTS = {
    "leverage_momentum": 0.30,
    "trust_centrality": 0.25,
    "coalition_support": 0.20,
    "concession_extraction": 0.15,
    "resilience": 0.10,
}

@dataclass
class AgentScore:
    agent_id: str
    name: str
    score: float
    delta: float
    delta_reason: str
    rank: int
    dimensions: dict[str, float] = field(default_factory=dict)

def compute_scores(
    stakeholders: list[dict],
    trust_matrix: dict[str, dict[str, int]],
    leverage_scores: dict[str, int],
    history: list[dict],
    objective_stores: dict[str, Any],
    coalitions: list[dict],
    prev_scores: dict[str, float],
) -> list[AgentScore]:
    scores = []
    n = len(stakeholders)

    for s in stakeholders:
        aid = s["id"]
        recent_actions = [t for t in history[-8:] if t.get("stakeholder_id") == aid]
        lev_score = leverage_scores.get(aid, 50)
        lev_momentum = min(1.0, lev_score / 100.0)
        trust_received = [v.get(aid, 50) for other, v in trust_matrix.items() if other != aid]
        trust_centrality = (sum(trust_received) / len(trust_received) / 100.0) if trust_received else 0.5
        coalition_partners = sum(1 for c in coalitions if c.get("agent_a") == aid or c.get("agent_b") == aid)
        coalition_support = min(1.0, coalition_partners / max(1, n - 1))

        opp_count = 0
        store_data = objective_stores.get(aid, {})
        if store_data and store_data.get("objectives"):
            opp_count = sum(
                1
                for o in store_data["objectives"]
                if o.get("source") == "opportunity" and o.get("is_active", True)
            )
        concession_extraction = min(1.0, opp_count / 5.0)
        aggression_count = sum(1 for t in recent_actions if t.get("action_type") in ("challenge", "escalate", "interrupt"))
        resilience = 1.0 - min(1.0, aggression_count / max(1, len(recent_actions) or 1))

        dims = {
            "leverage_momentum": lev_momentum,
            "trust_centrality": trust_centrality,
            "coalition_support": coalition_support,
            "concession_extraction": concession_extraction,
            "resilience": resilience,
        }
        raw = sum(WEIGHTS[k] * v for k, v in dims.items())
        score = round(raw * 100, 2)
        prev = prev_scores.get(aid, score)
        delta = round(score - prev, 2)
        reason_parts = []
        if abs(delta) > 0.5:
            dominant = max(dims, key=lambda k: WEIGHTS[k] * dims[k])
            direction = "gained" if delta > 0 else "lost"
            reason_parts.append(f"{direction} on {dominant.replace('_', ' ')}")
        delta_reason = "; ".join(reason_parts) or "stable"

        scores.append(AgentScore(agent_id=aid, name=s.get("name", aid), score=score, delta=delta, delta_reason=delta_reason, rank=0, dimensions=dims))

    scores.sort(key=lambda x: x.score, reverse=True)
    for i, sc in enumerate(scores):
        sc.rank = i + 1

    return scores


def detect_win_context(scores: list[AgentScore], deadlock_risk_score: int) -> str:
    if not scores:
        return ""
    leader = scores[0]
    second = scores[1] if len(scores) > 1 else None
    margin = (leader.score - second.score) if second else 100

    if deadlock_risk_score >= 70:
        return "Deadlock risk high — no clear winner forming"
    if margin < 5:
        return f"Contested — {leader.name} leads narrowly over {second.name if second else 'field'}"
    if margin >= 20:
        return f"{leader.name} dominant — {leader.delta_reason}"
    return f"{leader.name} leads — {leader.delta_reason}"
