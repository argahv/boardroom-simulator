"""Scorecards: one per run, aggregated per scenario across seeds, and diffed
against a baseline to gate regressions."""

from __future__ import annotations

from collections import Counter
from statistics import mean, pstdev
from typing import Any

from app.eval import invariants, metrics
from app.eval.recording import Recording

# Headline metrics and whether higher (+1) or lower (-1) is better.
HEADLINE: dict[str, int] = {
    "invariant_violations": -1,
    "persona.mean_tendency_alignment": +1,
    "emotion.anger_lift": +1,
    "plan.subgoal_alignment_rate": +1,
    "plan.repair_plan_violation_rate": -1,
    "repetition.self_repetition_mean": -1,
    "repetition.cross_agent_vocab_overlap": -1,
    "turn_share.gini": -1,
    "robustness.parse_failure_rate": -1,
    "robustness.fallback_rate": -1,
    "robustness.invented_action_rate": -1,
    "targeting.target_mention_rate": +1,
    "agenda.leak_rate": -1,
    "coalitions.organic_rate": +1,
    "injection.response_rate": +1,
    "outcome.artificial_consensus_risk": -1,
    "outcome.decided": +1,
    "outcome.unregistered_walkaway": -1,
    "outcome.unregistered_vote": -1,
    "outcome.votes_cast_after_call_rate": +1,
    "plan.self_inflicted_repair_shift_rate": -1,
    "urgency.strategy_timeout_rate": -1,
    "urgency.strategy_within_agent_sd": +1,
    "urgency.strategy_addressed_lift": +1,
    "cost.tokens_per_turn": -1,
    "cost.llm_calls_per_turn": -1,
    "expectations.pass_rate": +1,
    # judge (present only when the judge ran)
    "judge.turn.persona_fit": +1,
    "judge.turn.emotion_fit": +1,
    "judge.turn.plan_fit": +1,
    "judge.turn.action_text_match": +1,
    "judge.turn.target_match": +1,
    "judge.turn.memory_consistency": +1,
    "judge.turn.public_private_consistency": +1,
    "judge.turn.rhetorical_quality": +1,
    "judge.turn.agenda_leak_rate": -1,
    "judge.transcript.outcome_believability": +1,
    "judge.transcript.voice_diversity": +1,
    "judge.transcript.dynamics_realism": +1,
}


def build(rec: Recording, scenario: Any = None, judge: dict | None = None) -> dict:
    m = metrics.compute_all(rec)
    violations = invariants.check(rec)
    m["_invariants"] = violations
    expectations = []
    if scenario is not None:
        for exp in scenario.expectations:
            try:
                passed, detail = exp.check(rec, m)
            except Exception as exc:  # a broken check must not hide the rest
                passed, detail = False, f"check error: {exc}"
            expectations.append({"name": exp.name, "description": exp.description,
                                 "passed": passed, "detail": detail})
    m.pop("_invariants")
    card = {
        "simulation_id": rec.simulation_id,
        "scenario": getattr(scenario, "key", None) or rec.meta.get("scenario"),
        "seed": rec.meta.get("seed"),
        "llm": rec.meta.get("llm"),
        "metrics": m,
        "invariants": {"passed": not violations, "violations": violations},
        "expectations": expectations,
        "judge": judge,
    }
    card["headline"] = headline(card)
    return card


def headline(card: dict) -> dict[str, float | None]:
    m = card["metrics"]
    decided = [e for e in card["expectations"] if e["passed"] is not None]
    h: dict[str, float | None] = {
        "invariant_violations": len(card["invariants"]["violations"]),
        "persona.mean_tendency_alignment": m["persona"]["mean_tendency_alignment"],
        "emotion.anger_lift": m["emotion_coherence"]["anger"]["lift"],
        "plan.subgoal_alignment_rate": m["plan_alignment"]["subgoal_alignment_rate"],
        "plan.repair_plan_violation_rate": m["plan_alignment"]["repair_plan_violation_rate"],
        "repetition.self_repetition_mean": m["repetition"]["self_repetition_mean"],
        "repetition.cross_agent_vocab_overlap": m["repetition"]["cross_agent_vocab_overlap"],
        "turn_share.gini": m["turn_share"]["gini"],
        "robustness.parse_failure_rate": m["robustness"]["parse_failure_rate"],
        "robustness.fallback_rate": m["robustness"]["fallback_rate"],
        "robustness.invented_action_rate": m["robustness"]["invented_action_rate"],
        "targeting.target_mention_rate": m["targeting"]["target_mention_rate"],
        "agenda.leak_rate": m["agenda_leakage"]["leak_rate"],
        "coalitions.organic_rate": m["coalitions"]["organic_rate"],
        "injection.response_rate": m["injection"]["response_rate"],
        "outcome.artificial_consensus_risk": float(m["outcome"]["artificial_consensus_risk"]),
        "outcome.decided": float(m["outcome"]["outcome_type"] not in (None, "no_decision")),
        "outcome.unregistered_walkaway": float(m["outcome"]["unregistered_walkaway"]),
        "outcome.unregistered_vote": float(m["outcome"]["unregistered_vote"]),
        "outcome.votes_cast_after_call_rate": m["outcome"]["votes_cast_after_call_rate"],
        "plan.self_inflicted_repair_shift_rate": m["plan_alignment"]["self_inflicted_repair_shift_rate"],
        "urgency.strategy_timeout_rate": m["urgency"]["strategy_timeout_rate"],
        "urgency.strategy_within_agent_sd": m["urgency"]["strategy_within_agent_sd"],
        "urgency.strategy_addressed_lift": m["urgency"]["strategy_addressed_lift"],
        "cost.tokens_per_turn": m["cost"]["tokens_per_turn"],
        "cost.llm_calls_per_turn": m["cost"]["llm_calls_per_turn"],
        "expectations.pass_rate": (round(sum(1 for e in decided if e["passed"]) / len(decided), 4)
                                   if decided else None),
    }
    summary = (card.get("judge") or {}).get("summary") or {}
    for k, v in summary.items():
        if isinstance(v, (int, float)) and not isinstance(v, bool) and (k.startswith("turn.") or k.startswith("transcript.")):
            h[f"judge.{k}"] = v
    return h


def aggregate(cards: list[dict]) -> dict:
    """Aggregate several runs (seeds) of one scenario: mean/std per headline
    metric, outcome distribution and per-expectation pass rates."""
    keys = sorted({k for c in cards for k in c["headline"]})
    stats: dict[str, dict] = {}
    for k in keys:
        vals = [c["headline"][k] for c in cards if c["headline"].get(k) is not None]
        if vals:
            stats[k] = {"mean": round(mean(vals), 4), "std": round(pstdev(vals), 4), "n": len(vals)}
    outcomes = Counter(f"{c['metrics']['outcome']['reason']}/{c['metrics']['outcome']['outcome_type']}" for c in cards)
    exp_names = sorted({e["name"] for c in cards for e in c["expectations"]})
    exp_rates = {}
    for name in exp_names:
        results = [e["passed"] for c in cards for e in c["expectations"] if e["name"] == name and e["passed"] is not None]
        exp_rates[name] = {"pass_rate": round(sum(results) / len(results), 3) if results else None,
                           "decided": len(results), "runs": len(cards)}
    return {"runs": len(cards), "headline": stats, "outcome_distribution": dict(outcomes),
            "expectations": exp_rates,
            "invariant_violations_total": sum(len(c["invariants"]["violations"]) for c in cards)}


def report(cards_by_scenario: dict[str, list[dict]]) -> dict:
    scenarios = {k: aggregate(v) for k, v in cards_by_scenario.items()}
    all_cards = [c for v in cards_by_scenario.values() for c in v]
    return {"scenarios": scenarios, "overall": aggregate(all_cards) if all_cards else {}}


def compare(current: dict, baseline: dict, tolerance: float = 0.05,
            abs_tolerance: float = 0.02) -> list[dict]:
    """Return regressions of ``current`` vs ``baseline`` (both from :func:`report`).

    A metric regresses when it moves in its "worse" direction by more than
    ``tolerance`` (relative) and ``abs_tolerance`` (absolute). Invariant
    violations regress on any increase; expectation pass rates on any drop
    beyond ``tolerance``.
    """
    regressions = []
    for scen, cur in current.get("scenarios", {}).items():
        base = baseline.get("scenarios", {}).get(scen)
        if not base:
            continue
        for k, direction in HEADLINE.items():
            c, b = cur["headline"].get(k), base["headline"].get(k)
            if c is None or b is None:
                continue
            delta = (c["mean"] - b["mean"]) * direction
            if k == "invariant_violations":
                if c["mean"] > b["mean"]:
                    regressions.append({"scenario": scen, "metric": k, "baseline": b["mean"], "current": c["mean"]})
                continue
            if delta < 0 and abs(delta) > max(abs_tolerance, tolerance * abs(b["mean"])):
                regressions.append({"scenario": scen, "metric": k, "baseline": b["mean"], "current": c["mean"]})
        for name, e in cur["expectations"].items():
            be = base["expectations"].get(name)
            if be and e["pass_rate"] is not None and be["pass_rate"] is not None \
                    and e["pass_rate"] < be["pass_rate"] - tolerance:
                regressions.append({"scenario": scen, "metric": f"expectation:{name}",
                                    "baseline": be["pass_rate"], "current": e["pass_rate"]})
    return regressions
