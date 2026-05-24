from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "goal_evolution.py"
_spec = importlib.util.spec_from_file_location("goal_evolution", _path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["goal_evolution"] = _mod
_spec.loader.exec_module(_mod)

GoalState = _mod.GoalState
GoalEvolution = _mod.GoalEvolution


@pytest.fixture
def e() -> GoalEvolution:
    return GoalEvolution()


class TestAddGoal:
    def test_stores_goal(self, e: GoalEvolution) -> None:
        e.add_goal("a", "test")
        assert len(e.get_all_goals("a")) == 1
        assert e.get_all_goals("a")[0].goal_text == "test"

    def test_default_priority(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g")
        assert e.get_all_goals("a")[0].priority == 1.0

    def test_multiple_goals_same_agent(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g1")
        e.add_goal("a", "g2")
        assert len(e.get_all_goals("a")) == 2

    def test_agents_isolated(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g1")
        e.add_goal("b", "g2")
        assert len(e.get_all_goals("a")) == 1
        assert len(e.get_all_goals("b")) == 1

    def test_returns_self(self, e: GoalEvolution) -> None:
        assert e.add_goal("a", "x") is e

    def test_added_goal_in_active_list(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g")
        assert len(e.get_active_goals("a")) >= 1


class TestGetActiveGoals:
    def test_returns_top_n_by_score(self, e: GoalEvolution) -> None:
        e.add_goal("a", "low", priority=1.0)
        e.add_goal("a", "high", priority=5.0)
        e.add_goal("a", "mid", priority=3.0)
        top2 = e.get_active_goals("a", n=2)
        assert len(top2) == 2
        assert top2[0].goal_text == "high"
        assert top2[1].goal_text == "mid"

    def test_confidence_affects_ranking(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g1", priority=3.0)
        e.add_goal("a", "g2", priority=2.0)
        gs = e.get_all_goals("a")
        gs[0].confidence = 0.1
        gs[1].confidence = 1.0
        top = e.get_active_goals("a", n=1)
        assert top[0].goal_text == "g2"

    def test_empty_return_for_unknown_agent(self, e: GoalEvolution) -> None:
        assert e.get_active_goals("nonexistent") == []

    def test_default_n_is_three(self, e: GoalEvolution) -> None:
        for i in range(5):
            e.add_goal("a", f"g{i}", priority=float(i))
        assert len(e.get_active_goals("a")) == 3

    def test_excludes_inactive(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g1", priority=5.0)
        e.add_goal("a", "g2", priority=1.0)
        e.get_all_goals("a")[0].is_active = False
        active = e.get_active_goals("a")
        assert len(active) == 1
        assert active[0].goal_text == "g2"


class TestUpdatePriorities:
    def test_escalation_risk_adds_deescalate(self, e: GoalEvolution) -> None:
        e.add_goal("a", "base")
        e.update_priorities("a", ["escalation_risk"])
        added = [g for g in e.get_all_goals("a") if g.goal_text == "deescalate"]
        assert len(added) == 1
        assert added[0].priority == 4.0

    def test_trust_collapse_adds_rebuild_trust(self, e: GoalEvolution) -> None:
        e.add_goal("a", "base")
        e.update_priorities("a", ["trust_collapse"])
        assert any(g.goal_text == "rebuild_trust" for g in e.get_all_goals("a"))

    def test_credibility_crisis_adds_defend_position(self, e: GoalEvolution) -> None:
        e.add_goal("a", "base")
        e.update_priorities("a", ["credibility_crisis"])
        assert any(g.goal_text == "defend_position" for g in e.get_all_goals("a"))

    def test_domination_threat_adds_assert_autonomy(self, e: GoalEvolution) -> None:
        e.add_goal("a", "base")
        e.update_priorities("a", ["domination_threat"])
        assert any(g.goal_text == "assert_autonomy" for g in e.get_all_goals("a"))

    def test_leverage_collapse_adds_regain_leverage(self, e: GoalEvolution) -> None:
        e.add_goal("a", "base")
        e.update_priorities("a", ["leverage_collapse"])
        assert any(g.goal_text == "regain_leverage" for g in e.get_all_goals("a"))

    def test_multiple_triggers(self, e: GoalEvolution) -> None:
        e.add_goal("a", "base")
        e.update_priorities("a", ["escalation_risk", "trust_collapse", "credibility_crisis"])
        texts = [g.goal_text for g in e.get_active_goals("a", 10)]
        assert "deescalate" in texts
        assert "rebuild_trust" in texts
        assert "defend_position" in texts

    def test_does_not_duplicate_trigger_goals(self, e: GoalEvolution) -> None:
        e.add_goal("a", "deescalate", priority=4.0)
        e.update_priorities("a", ["escalation_risk"])
        matches = [g for g in e.get_all_goals("a") if g.goal_text == "deescalate"]
        assert len(matches) == 1

    def test_gaining_traction_boosts_highest_confidence(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g1", priority=2.0)
        e.add_goal("a", "g2", priority=2.0)
        gs = e.get_all_goals("a")
        gs[0].confidence = 0.5
        gs[1].confidence = 0.9
        e.update_priorities("a", ["gaining_traction"])
        assert gs[1].priority == pytest.approx(2.5)

    def test_leverage_advantage_boosts_highest_priority(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g1", priority=2.0)
        e.add_goal("a", "g2", priority=4.0)
        e.update_priorities("a", ["leverage_advantage"])
        g2 = [g for g in e.get_all_goals("a") if g.goal_text == "g2"][0]
        assert g2.priority == pytest.approx(5.0)

    def test_leverage_boost_caps_at_five(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g1", priority=5.0)
        e.update_priorities("a", ["leverage_advantage"])
        assert e.get_all_goals("a")[0].priority == 5.0

    def test_unknown_trigger_is_noop(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g")
        n = len(e.get_all_goals("a"))
        e.update_priorities("a", ["made_up_trigger"])
        assert len(e.get_all_goals("a")) == n

    def test_unknown_agent_is_noop(self, e: GoalEvolution) -> None:
        e.update_priorities("nonexistent", ["escalation_risk"])

    def test_returns_self(self, e: GoalEvolution) -> None:
        assert e.update_priorities("a", []) is e


class TestDecayAll:
    def test_reduces_priority_by_decay_rate(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g", priority=4.0)
        e.decay_all(current_turn=5)
        assert e.get_all_goals("a")[0].priority == pytest.approx(3.95)

    def test_reduces_confidence_by_half_rate(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g")
        g = e.get_all_goals("a")[0]
        g.confidence = 0.8
        for _ in range(5):
            e.decay_all(current_turn=1)
        assert g.confidence < 0.8
        assert g.confidence > 0.1

    def test_priority_floor_zero(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g", priority=0.01)
        for _ in range(5):
            e.decay_all(current_turn=1)
        assert e.get_all_goals("a")[0].priority >= 0.1

    def test_goal_expires_when_age_exceeds_ttl(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g")
        e.get_all_goals("a")[0].last_reinforced_turn = 0
        e.get_all_goals("a")[0].ttl_turns = 3
        e.decay_all(current_turn=10)
        assert not e.get_all_goals("a")[0].is_active

    def test_expired_goal_excluded_from_active(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g")
        e.get_all_goals("a")[0].last_reinforced_turn = 0
        e.get_all_goals("a")[0].ttl_turns = 3
        e.decay_all(current_turn=10)
        assert e.get_active_goals("a") == []

    def test_goal_not_expired_before_ttl(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g")
        e.decay_all(current_turn=49)
        assert e.get_all_goals("a")[0].is_active

    def test_decays_all_agents(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g1", priority=3.0)
        e.add_goal("b", "g2", priority=3.0)
        e.decay_all(current_turn=1)
        assert e.get_all_goals("a")[0].priority < 3.0
        assert e.get_all_goals("b")[0].priority < 3.0

    def test_skips_inactive_goals(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g")
        e.get_all_goals("a")[0].is_active = False
        e.decay_all(current_turn=1)
        assert e.get_all_goals("a")[0].priority == 1.0

    def test_returns_self(self, e: GoalEvolution) -> None:
        assert e.decay_all(0) is e


class TestReinforceGoal:
    def test_boosts_priority_and_confidence(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g", priority=3.0)
        e.get_all_goals("a")[0].confidence = 0.5
        gid = e.get_all_goals("a")[0].goal_id
        e.reinforce_goal("a", gid)
        g = e.get_all_goals("a")[0]
        assert g.priority == pytest.approx(3.1)
        assert g.confidence == pytest.approx(0.6)

    def test_priority_capped_at_five(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g", priority=5.0)
        gid = e.get_all_goals("a")[0].goal_id
        e.reinforce_goal("a", gid)
        assert e.get_all_goals("a")[0].priority == 5.0

    def test_confidence_capped_at_one(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g", priority=1.0)
        e.get_all_goals("a")[0].confidence = 1.0
        gid = e.get_all_goals("a")[0].goal_id
        e.reinforce_goal("a", gid)
        assert e.get_all_goals("a")[0].confidence == 1.0

    def test_unknown_goal_id_is_noop(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g")
        e.reinforce_goal("a", "nonexistent")
        assert e.get_all_goals("a")[0].priority == 1.0

    def test_unknown_agent_is_noop(self, e: GoalEvolution) -> None:
        e.reinforce_goal("nonexistent", "g0")

    def test_returns_self(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g")
        assert e.reinforce_goal("a", e.get_all_goals("a")[0].goal_id) is e


class TestHasGoalShifted:
    def test_true_on_first_check(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g", priority=5.0)
        assert e.has_goal_shifted("a") is True

    def test_false_when_same_top_goal(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g", priority=5.0)
        e.has_goal_shifted("a")
        assert e.has_goal_shifted("a") is False

    def test_true_when_top_goal_changes(self, e: GoalEvolution) -> None:
        e.add_goal("a", "first", priority=3.0)
        e.has_goal_shifted("a")
        e.add_goal("a", "second", priority=5.0)
        assert e.has_goal_shifted("a") is True

    def test_false_for_unknown_agent(self, e: GoalEvolution) -> None:
        assert e.has_goal_shifted("nonexistent") is False


class TestGetAllGoals:
    def test_returns_all_goals(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g1")
        e.add_goal("a", "g2")
        assert len(e.get_all_goals("a")) == 2

    def test_includes_inactive(self, e: GoalEvolution) -> None:
        e.add_goal("a", "g")
        e.get_all_goals("a")[0].is_active = False
        assert len(e.get_all_goals("a")) == 1

    def test_returns_empty_for_unknown(self, e: GoalEvolution) -> None:
        assert e.get_all_goals("nonexistent") == []


class TestDeterminism:
    def test_identical_sequences(self) -> None:
        def build() -> list[tuple[str, float, float]]:
            ev = GoalEvolution()
            ev.add_goal("a", "g1", priority=3.0)
            ev.add_goal("a", "g2", priority=5.0)
            ev.update_priorities("a", ["gaining_traction"])
            ev.decay_all(current_turn=5)
            return [
                (g.goal_text, round(g.priority, 6), round(g.confidence, 6))
                for g in ev.get_active_goals("a", 10)
            ]
        assert build() == build()

    def test_get_active_order_stable(self) -> None:
        ev = GoalEvolution()
        ev.add_goal("a", "g1", priority=5.0)
        ev.add_goal("a", "g2", priority=3.0)
        ev.add_goal("a", "g3", priority=1.0)
        r1 = [g.goal_id for g in ev.get_active_goals("a", 10)]
        r2 = [g.goal_id for g in ev.get_active_goals("a", 10)]
        assert r1 == r2


class TestGoalStateDefaults:
    def test_field_defaults(self) -> None:
        g = GoalState(goal_id="g0", agent_id="a", goal_text="t")
        assert g.priority == 1.0
        assert g.confidence == 1.0
        assert g.source == "initial"
        assert g.created_turn == 0
        assert g.last_reinforced_turn == 0
        assert g.decay_rate == 0.05
        assert g.ttl_turns == 50
        assert g.is_active is True

    def test_score_multiplies_priority_and_confidence(self) -> None:
        g = GoalState(goal_id="g0", agent_id="a", goal_text="t", priority=4.0, confidence=0.5)
        score = g.priority * g.confidence
        assert score == 2.0
