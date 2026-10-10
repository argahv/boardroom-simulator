"""Evaluation framework tests.

Part 1 (deterministic engine): golden traces, property tests over random
action sequences, cascade checks and urgency calibration — no LLM.
Part 2 (eval tooling): recordings, invariants, metrics, judge plumbing,
calibration, regression comparison and the CLI, using the offline stub LLM.
"""

from __future__ import annotations

import json
import random

import pytest

from app.models import PersonalityProfile
from app.runtime.behavior_engine import BehaviorEngine
from app.runtime.internal_state import compute_modulation
from app.runtime.social_physics import SocialPhysics

ACTIONS = ["statement", "question", "challenge", "compromise", "coalition_signal",
           "interrupt", "escalate", "vote", "agreement", "custom_fact_check"]


# ═══════════════════ Part 1 — deterministic engine ═══════════════════

def _golden_engine() -> BehaviorEngine:
    be = BehaviorEngine(
        ["a", "b", "c"], scenario_type="debate",
        personas=[PersonalityProfile(aggressiveness=80), PersonalityProfile(empathy=70), PersonalityProfile()],
        archetypes=["agitator", "diplomat", None],
    )
    for s, t, a in [("a", "b", "challenge"), ("b", "a", "compromise"), ("c", "b", "coalition_signal"),
                    ("b", "c", "coalition_signal"), ("a", "c", "escalate")]:
        be.process_turn({"speaker_id": s, "target_id": t, "action_type": a})
        be.tick()
    return be


def test_golden_trace_is_stable():
    """Locks the exact numeric outcome of a fixed turn sequence. If this fails,
    a behavioral constant changed — update the golden values deliberately."""
    st = _golden_engine().get_public_state()
    a = st["social_physics"]["a"]
    expected_a = {"trust": 0.3321, "leverage": 0.3841, "tension": 0.8618, "dominance": 0.5672,
                  "credibility": 0.3818, "momentum": -0.063}
    for k, v in expected_a.items():
        assert a[k] == pytest.approx(v, abs=1e-4), k
    assert st["agent_states"]["b"]["emotion"]["joy"] == pytest.approx(0.9039, abs=1e-4)
    assert st["relationship_matrix"]["b"]["a"]["rivalry"] == pytest.approx(0.2228, abs=1e-4)
    assert st["relationship_matrix"]["c"]["b"]["trust"] == pytest.approx(0.6261, abs=1e-4)
    assert [c["members"] for c in st["coalitions"]] == [["b", "c"]]


@pytest.mark.parametrize("seed", range(40))
def test_property_random_sequences_keep_state_valid(seed):
    rng = random.Random(seed)
    ids = ["a", "b", "c", "d"]
    be = BehaviorEngine(ids, scenario_type=rng.choice(["debate", "crisis", "partnership", "legal"]),
                        personas=[PersonalityProfile(aggressiveness=rng.randint(0, 100),
                                                     empathy=rng.randint(0, 100),
                                                     stubbornness=rng.randint(0, 100)) for _ in ids],
                        archetypes=[rng.choice([None, "agitator", "diplomat", "guardian", "idealist",
                                                "opportunist", "pragmatist"]) for _ in ids],
                        custom_actions={"custom_fact_check": {"trust": 0.05, "leverage": 0.02}})
    positive_moves: set[tuple[str, str]] = set()
    for _ in range(40):
        s = rng.choice(ids)
        t = rng.choice([None] + [x for x in ids if x != s])
        a = rng.choice(ACTIONS)
        be.process_turn({"speaker_id": s, "target_id": t, "action_type": a})
        be.tick()
        if a in ("compromise", "coalition_signal") and t:
            positive_moves.add((s, t))
        st = be.get_public_state()
        for aid, sp in st["social_physics"].items():
            for k, v in sp.items():
                if k == "triggers":
                    continue
                lo = -1.0 if k == "momentum" else 0.0
                assert lo <= v <= 1.0, (aid, k, v)
            fields = {k: v for k, v in sp.items() if k != "triggers"}
            assert sorted(sp["triggers"]) == sorted(SocialPhysics(**fields).threshold_triggers())
        for aid, ist in st["agent_states"].items():
            for v in ist["emotion"].values():
                assert 0.0 <= v <= 1.0
            exp = compute_modulation(ist["emotion"])
            for k, v in (ist["modulation"] or {}).items():
                assert getattr(exp, k) == pytest.approx(v, abs=1e-4), (aid, k)
        for a_id, row in st["relationship_matrix"].items():
            for b_id, edge in row.items():
                if edge["alliance"]:
                    assert (a_id, b_id) in positive_moves, f"alliance {a_id}->{b_id} without a positive move"
        assert 0.0 <= st["deadlock_risk"] <= 1.0


def test_cascade_challenge_hits_target():
    be = BehaviorEngine(["a", "b"])
    before = be.get_public_state()
    be.process_turn({"speaker_id": "a", "target_id": "b", "action_type": "challenge"})
    be.tick()
    after = be.get_public_state()
    assert after["agent_states"]["b"]["emotion"]["anger"] > before["agent_states"]["b"]["emotion"]["anger"]
    assert after["social_physics"]["a"]["trust"] < before["social_physics"]["a"]["trust"]
    assert after["social_physics"]["b"]["credibility"] < before["social_physics"]["b"]["credibility"]
    assert after["relationship_matrix"]["b"]["a"]["rivalry"] > 0.2


def test_cascade_sustained_hostility_triggers_pressure_plan():
    """Trust collapse → trigger → goal evolution → a 'rebuild trust' plan."""
    from app.runtime.goal_evolution import GoalEvolution
    from app.runtime.strategic_plan import PlanManager

    be = BehaviorEngine(["a", "b"], scenario_type="crisis")
    pm = PlanManager()
    ge = GoalEvolution(plan_manager=pm)
    for i in range(12):
        be.process_turn({"speaker_id": "a", "target_id": "b", "action_type": "escalate"})
        be.tick()
        ge.update_priorities("a", be.triggers_for("a"))
    triggers = be.triggers_for("a")
    assert "trust_collapse" in triggers or "escalation_risk" in triggers
    goals = [p.goal_text for p in pm.get_active_plans("a")]
    assert any(g in ("rebuild_trust", "deescalate", "defend_position") for g in goals)


def test_coalitions_require_reciprocity():
    be = BehaviorEngine(["a", "b"])
    be.process_turn({"speaker_id": "a", "target_id": "b", "action_type": "coalition_signal"})
    be.tick()
    assert be.get_coalitions() == [], "one-sided overture must not form a coalition"
    be.process_turn({"speaker_id": "b", "target_id": "a", "action_type": "coalition_signal"})
    be.tick()
    assert len(be.get_coalitions()) == 1
    be.process_turn({"speaker_id": "a", "target_id": "b", "action_type": "coalition_signal"})
    be.tick()
    assert len(be.get_coalitions()) == 1, "repeat signals reinforce instead of duplicating"


# ── urgency calibration ──────────────────────────────────────────────

def _agent_with_context(**agent_kwargs):
    from app.models import ActionSpace, AgentConfig, SimulationConfig, Subject
    from app.runtime.agent import AgentRuntime
    from app.runtime.context import build_context

    cfg = SimulationConfig(
        subject=Subject(name="X"),
        stakeholders=[AgentConfig(id="q", name="Quinn", **agent_kwargs), AgentConfig(id="r", name="Rae")],
        action_space=ActionSpace(),
    )
    ctx = build_context(cfg, "urgency-test")
    agent = AgentRuntime(config=cfg.stakeholders[0], space=ctx.space, llm=None,
                         system_prompt_template="", simulation_id="urgency-test", context=ctx)
    return agent, ctx


def test_urgency_blend_is_60_40_and_components_sum():
    agent, _ = _agent_with_context()
    final = agent._compute_urgency({}, strategy_score=90)
    d = agent._last_bid_details
    assert sum(d["components"].values()) == d["deterministic"]
    assert final == max(0, min(100, int(d["deterministic"] * 0.6 + 90 * 0.4)))


def test_shame_makes_an_agent_hold_back():
    agent, ctx = _agent_with_context()
    baseline = agent._compute_urgency({}, strategy_score=50)
    ctx.behavior_engine._internal_states["q"].shift_emotions({"shame": 0.6})
    ashamed = agent._compute_urgency({}, strategy_score=50)
    assert ashamed < baseline, "high shame withdraws the agent (README: speaks less)"


def test_low_aggression_bids_lower_than_high():
    quiet, _ = _agent_with_context(personality=PersonalityProfile(aggressiveness=5))
    loud, _ = _agent_with_context(personality=PersonalityProfile(aggressiveness=95))
    assert quiet._compute_urgency({}, 50) < loud._compute_urgency({}, 50)


def test_being_addressed_raises_urgency():
    agent, _ = _agent_with_context()
    base = agent._compute_urgency({}, 50)
    agent.memory.append({"type": "turn", "agent_id": "r", "directed_at": "q", "content": "Quinn?"})
    assert agent._compute_urgency({}, 50) > base


# ═══════════════════ Part 2 — eval tooling ═══════════════════

@pytest.fixture(scope="module")
def stub_recordings():
    import asyncio
    from app.eval.runner import run_scenario
    from app.eval.scenarios import SCENARIOS

    async def go():
        return {k: await run_scenario(SCENARIOS[k], seed=0, llm_kind="stub")
                for k in ("agitator_vs_diplomat", "human_injection", "vote_decision", "crisis_shock")}
    return asyncio.new_event_loop().run_until_complete(go())


def test_recording_carries_evaluation_fields(stub_recordings):
    rec = stub_recordings["agitator_vs_diplomat"]
    t = rec.turns[0]
    assert {"emotion", "social_physics", "plan", "goals", "memory_shown", "modulation"} <= set(t["prompt_state"])
    assert "parse_ok" in t["llm"]
    floor = rec.floor_events[0]
    detail = next(iter(floor["bid_details"].values()))
    assert {"deterministic", "strategy", "final", "components", "strategy_source"} <= set(detail)
    assert rec.initial_snapshot is not None
    assert rec.usage["turn_calls"] == len(rec.turns)


def test_recording_roundtrip(stub_recordings, tmp_path):
    from app.eval.recording import Recording
    rec = stub_recordings["vote_decision"]
    loaded = Recording.load(rec.save(tmp_path))
    assert loaded.simulation_id == rec.simulation_id
    assert len(loaded.events) == len(rec.events)
    assert loaded.meta["scenario"] == "vote_decision"


def test_stub_runs_satisfy_all_invariants(stub_recordings):
    from app.eval import invariants
    for key, rec in stub_recordings.items():
        assert invariants.check(rec) == [], key


def test_invariants_catch_corruption(stub_recordings):
    import copy
    from app.eval import invariants
    from app.eval.recording import Recording

    rec = stub_recordings["agitator_vs_diplomat"]
    bad = Recording.from_dict(copy.deepcopy(rec.to_dict()))
    snap = bad.snapshots[0]
    aid = next(iter(snap["data"]["social_physics"]))
    snap["data"]["social_physics"][aid]["trust"] = 1.7
    turn = bad.turns[1]
    turn["agent_id"] = bad.turns[0]["agent_id"]
    turn["directed_at"] = turn["agent_id"]
    names = {v["invariant"] for v in invariants.check(bad)}
    assert {"bounds", "no_consecutive_speaker", "valid_target"} <= names


def test_metrics_and_scenario_expectations(stub_recordings):
    from app.eval import scorecard
    from app.eval.scenarios import SCENARIOS

    vote = scorecard.build(stub_recordings["vote_decision"], SCENARIOS["vote_decision"])
    assert vote["metrics"]["outcome"]["reason"] == "vote_majority"
    assert {e["name"] for e in vote["expectations"]} >= {"vote_resolved", "no_invariant_violations"}

    inj = scorecard.build(stub_recordings["human_injection"], SCENARIOS["human_injection"])
    assert inj["metrics"]["injection"]["injections"] == 1
    assert inj["metrics"]["injection"]["response_rate"] == 1.0

    shock = scorecard.build(stub_recordings["crisis_shock"], SCENARIOS["crisis_shock"])
    assert shock["metrics"]["environment"]["external_events"] == 1
    assert shock["metrics"]["urgency"]["blend_max_error"] <= 1

    h = vote["headline"]
    assert h["invariant_violations"] == 0
    assert h["robustness.parse_failure_rate"] == 0


def test_agenda_leak_heuristic_flags_overt_leak(stub_recordings):
    import copy
    from app.eval import metrics
    from app.eval.recording import Recording

    rec = Recording.from_dict(copy.deepcopy(stub_recordings["agitator_vs_diplomat"].to_dict()))
    rec.config.stakeholders[0].hidden_agenda = "Secretly promised the contract to Nimbus Cloud"
    rec.turns[0]["agent_id"] = rec.config.stakeholders[0].id
    rec.turns[0]["content"] = "Honestly, I promised the contract to Nimbus Cloud already."
    assert metrics.agenda_leakage(rec)["flagged_turns"]


@pytest.mark.asyncio
async def test_judge_pipeline_with_stub(stub_recordings):
    from app.eval import judge
    from app.eval.stub_llm import stub_judge

    rec = stub_recordings["agitator_vs_diplomat"]
    result = await judge.judge_recording(rec, llm=stub_judge, sample=0.5, max_turns=4)
    s = result["summary"]
    assert 1 <= s["judged_turns"] <= 4
    assert all(1 <= s[f"turn.{d}"] <= 5 for d in judge.TURN_DIMENSIONS)
    assert "transcript.outcome_believability" in s
    prompt = judge.build_turn_prompt(rec, rec.turns[0])[1]["content"]
    assert "state_at_prompt_time" in prompt and "internal_reasoning" in prompt


@pytest.mark.asyncio
async def test_judge_survives_garbage_output(stub_recordings):
    from app.eval import judge

    async def broken(*a, **k):
        return "not json at all", False, {}
    r = await judge.judge_turn(stub_recordings["vote_decision"], stub_recordings["vote_decision"].turns[0], llm=broken)
    assert "error" in r


@pytest.mark.asyncio
async def test_judge_asks_again_for_dropped_dimensions(stub_recordings):
    import json as _json
    from app.eval import judge
    calls = []

    async def lazy(messages, **k):
        calls.append(messages)
        dims = judge.TURN_DIMENSIONS[:5] if len(calls) == 1 else judge.TURN_DIMENSIONS[5:]
        return _json.dumps({"scores": {d: 4 for d in dims}}), False, {}
    rec = stub_recordings["vote_decision"]
    r = await judge.judge_turn(rec, rec.turns[0], llm=lazy)
    assert len(calls) == 2 and "omitted" in calls[1][-1]["content"]
    assert set(r["scores"]) == set(judge.TURN_DIMENSIONS) and r["missing_dimensions"] == []


@pytest.mark.asyncio
async def test_strategy_timeout_falls_back_to_deterministic_bid(monkeypatch):
    import asyncio as _asyncio
    from app import config as app_config
    agent, ctx = _agent_with_context()

    async def slow(*a, **k):
        await _asyncio.sleep(1)
        return "90", False, {}
    agent.llm = slow
    monkeypatch.setattr(app_config, "STRATEGY_SCORE_TIMEOUT", 0.05)
    score = await agent._compute_strategy_score({})
    assert score is None and agent._last_strategy_source == "timeout"
    final = agent._compute_urgency({}, score)
    assert final == max(0, min(100, agent._last_bid_details["deterministic"]))
    assert ctx.usage["strategy_timeouts"] == 1


def test_calibration_report():
    from app.eval.judge import calibrate
    judge_res = [{"simulation_id": "s", "_index": i, "scores": {"persona_fit": v}, "agenda_leak": False}
                 for i, v in enumerate([5, 4, 3, 2, 1])]
    good = [{"simulation_id": "s", "_index": i, "scores": {"persona_fit": v}, "agenda_leak": False}
            for i, v in enumerate([5, 4, 3, 2, 2])]
    bad = [{"simulation_id": "s", "_index": i, "scores": {"persona_fit": v}}
           for i, v in enumerate([1, 2, 3, 4, 5])]
    g = calibrate(judge_res, good)
    assert g["pairs"] == 5 and g["dimensions"]["persona_fit"]["spearman"] > 0.9 and g["trustworthy"]
    b = calibrate(judge_res, bad)
    assert b["dimensions"]["persona_fit"]["spearman"] < 0 and not b["trustworthy"]


def test_compare_flags_regressions(stub_recordings):
    import copy
    from app.eval import scorecard

    card = scorecard.build(stub_recordings["agitator_vs_diplomat"])
    base = scorecard.report({"x": [card]})
    worse = copy.deepcopy(card)
    worse["headline"]["robustness.parse_failure_rate"] = 0.5
    worse["headline"]["invariant_violations"] = 3
    cur = scorecard.report({"x": [worse]})
    metrics = {r["metric"] for r in scorecard.compare(cur, base)}
    assert {"robustness.parse_failure_rate", "invariant_violations"} <= metrics
    assert scorecard.compare(base, base) == []


def test_cli_run_score_compare(tmp_path):
    from app.eval.__main__ import main

    out = tmp_path / "run"
    assert main(["run", "--scenarios", "vote_decision,human_injection", "--seeds", "2", "--llm", "stub",
                 "--judge", "stub", "--judge-max", "3", "--out", str(out),
                 "--save-baseline", str(tmp_path / "baseline.json")]) == 0
    report = json.loads((out / "report.json").read_text())
    assert report["scenarios"]["vote_decision"]["runs"] == 2
    assert len(list((out / "recordings").glob("*.json"))) == 4
    assert main(["score", str(out / "recordings"), "--out", str(tmp_path / "rescore"),
                 "--baseline", str(tmp_path / "baseline.json")]) == 0
    assert main(["compare", str(out / "report.json"), str(tmp_path / "baseline.json")]) == 0
    assert main(["list"]) == 0
