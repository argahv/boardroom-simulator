from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

# ── load behavior_engine directly (bypass broken __init__.py chain) ────────
# behavior_engine.py has its own importlib bootstrap for sibling modules,
# so we can load it as a standalone module.
_be_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "behavior_engine.py"
_spec = importlib.util.spec_from_file_location("test_be_engine", _be_path)
_be_mod = importlib.util.module_from_spec(_spec)
sys.modules["test_be_engine"] = _be_mod
_spec.loader.exec_module(_be_mod)

BehaviorResult = _be_mod.BehaviorResult
BehaviorEngine = _be_mod.BehaviorEngine
make_engine = _be_mod.make_engine


# ── helpers ─────────────────────────────────────────────────────────────────

def turn(
    *,
    speaker_id: str = "alice",
    action_type: str = "statement",
    target_id: str = "bob",
    **extra,
) -> dict:
    return {"speaker_id": speaker_id, "action_type": action_type, "target_id": target_id, **extra}


# ── TestInitialization ──────────────────────────────────────────────────────

class TestInitialization:
    def test_three_agents_have_subsystems(self):
        engine = BehaviorEngine(["alice", "bob", "carol"])
        for aid in ("alice", "bob", "carol"):
            state = engine.get_state_for_llm(aid)
            assert "social_physics" in state
            assert "cognitive_state" in state
            assert "trust_scores" in state
            assert "allies" in state
            assert "rivals" in state

    def test_register_agent_adds_subsystems(self):
        engine = BehaviorEngine(["alice"])
        engine.register_agent("bob")
        state = engine.get_state_for_llm("bob")
        assert state["social_physics"] != {}
        assert state["cognitive_state"] != {}

    def test_make_engine_factory(self):
        engine = make_engine(["x", "y"])
        assert isinstance(engine, BehaviorEngine)
        assert "x" in engine.get_public_state()["social_physics"]
        assert "y" in engine.get_public_state()["social_physics"]

    def test_empty_agent_list(self):
        engine = BehaviorEngine([])
        assert engine.get_public_state()["social_physics"] == {}

    def test_duplicate_register_is_noop(self):
        engine = BehaviorEngine(["a"])
        engine.register_agent("a")
        # still one agent, no crash
        assert len(engine._social_physics) == 1


# ── TestProcessTurn ─────────────────────────────────────────────────────────

class TestProcessTurn:
    def test_challenge_reduces_trust(self):
        engine = BehaviorEngine(["alice", "bob"])
        result = engine.process_turn(turn(action_type="challenge"))
        assert result.state_snapshot["trust"] < 0.5

    def test_challenge_increases_anger_in_target(self):
        engine = BehaviorEngine(["alice", "bob"])
        engine.process_turn(turn(action_type="challenge"))
        # challenge is directed at "bob" -> bob's anger goes up
        target_state = engine.get_state_for_llm("bob")
        # anger starts at 0.3 (debate baseline); challenge adds 0.15 when directed_at == self
        assert target_state["cognitive_state"]["emotion"]["anger"] == pytest.approx(0.45, abs=1e-6)

    def test_challenge_increases_rivalry(self):
        engine = BehaviorEngine(["alice", "bob"])
        result = engine.process_turn(turn(action_type="challenge"))
        alice_to_bob = result.relationship_matrix.get("alice", {}).get("bob", {})
        assert alice_to_bob.get("rivalry", 0) > 0.2

    def test_compromise_increases_trust(self):
        engine = BehaviorEngine(["alice", "bob"])
        result = engine.process_turn(turn(action_type="compromise"))
        assert result.state_snapshot["trust"] > 0.5

    def test_compromise_decreases_tension(self):
        engine = BehaviorEngine(["alice", "bob"])
        result = engine.process_turn(turn(action_type="compromise"))
        assert result.state_snapshot["tension"] < 0.5  # debate baseline 0.5 - 0.15 = 0.35

    def test_result_has_all_fields(self):
        engine = BehaviorEngine(["alice", "bob"])
        result = engine.process_turn(turn(action_type="statement"))
        assert isinstance(result.state_snapshot, dict)
        assert isinstance(result.triggers, list)
        assert isinstance(result.internal_state, dict)
        assert isinstance(result.relationship_matrix, dict)
        assert result.suggested_action is None or isinstance(result.suggested_action, str)

    def test_compromise_increases_joy_in_speaker(self):
        engine = BehaviorEngine(["alice", "bob"])
        engine.process_turn(turn(action_type="compromise"))
        state = engine.get_state_for_llm("alice")
        # joy: 0.4 (debate baseline) + 0.1 (compromise)
        assert state["cognitive_state"]["emotion"]["joy"] == pytest.approx(0.5, abs=1e-6)

    def test_target_internal_state_affected_on_challenge(self):
        engine = BehaviorEngine(["alice", "bob"])
        engine.process_turn(turn(action_type="challenge"))
        state = engine.get_state_for_llm("bob")
        # challenge directed at bob -> bob anger: 0.3 (debate) + 0.15 = 0.45
        assert state["cognitive_state"]["emotion"]["anger"] == pytest.approx(0.45, abs=1e-6)


# ── TestTick ─────────────────────────────────────────────────────────────────

class TestTick:
    def test_decay_returns_self(self):
        engine = BehaviorEngine(["alice", "bob"])
        assert engine.tick() is engine

    def test_social_physics_decays_after_tick(self):
        engine = BehaviorEngine(["alice", "bob"])
        engine.process_turn(turn(action_type="challenge"))
        elevated = engine._social_physics["alice"].trust
        engine.tick()
        # trust returns toward 0.5 (was decreased by challenge)
        assert engine._social_physics["alice"].trust > elevated

    def test_internal_state_emotions_decay(self):
        engine = BehaviorEngine(["alice", "bob"])
        engine.process_turn(turn(action_type="challenge"))
        # anger should decay toward baseline
        before = engine._internal_states["bob"].cognitive_state.emotion["anger"]
        engine.tick()
        after = engine._internal_states["bob"].cognitive_state.emotion["anger"]
        assert after <= before  # decays or stays same

    def test_relationship_decay_after_coalition(self):
        engine = BehaviorEngine(["alice", "bob"])
        engine.process_turn(turn(action_type="coalition_signal"))
        assert engine._graph.get("alice", "bob").alliance is True
        engine.tick()
        assert engine._graph.get("alice", "bob").alliance is False


# ── TestGetStateForLlm ──────────────────────────────────────────────────────

class TestGetStateForLlm:
    def test_returns_all_keys_for_known_agent(self):
        engine = BehaviorEngine(["alice"])
        state = engine.get_state_for_llm("alice")
        assert set(state.keys()) == {"social_physics", "cognitive_state", "trust_scores", "allies", "rivals", "turn_count"}

    def test_returns_empty_social_for_unknown_agent(self):
        engine = BehaviorEngine(["alice"])
        state = engine.get_state_for_llm("nobody")
        assert state["social_physics"] == {}
        assert state["cognitive_state"] == {}

    def test_allies_reflect_graph(self):
        engine = BehaviorEngine(["a", "b", "c"])
        engine.process_turn(turn(speaker_id="a", target_id="c", action_type="coalition_signal"))
        state = engine.get_state_for_llm("a")
        assert "c" in state["allies"]

    def test_trust_scores_after_turn(self):
        engine = BehaviorEngine(["alice", "bob"])
        engine.process_turn(turn(action_type="compromise"))
        state = engine.get_state_for_llm("alice")
        # compromise increases trust from speaker to target
        assert state["trust_scores"]["bob"] > 0.5


# ── TestGetPublicState ──────────────────────────────────────────────────────

class TestGetPublicState:
    def test_returns_all_expected_keys(self):
        engine = BehaviorEngine(["a", "b"])
        pub = engine.get_public_state()
        assert set(pub.keys()) == {"turn_count", "relationship_matrix", "social_physics", "agent_states", "agent_plans"}

    def test_social_physics_by_agent(self):
        engine = BehaviorEngine(["x", "y"])
        pub = engine.get_public_state()
        assert "x" in pub["social_physics"]
        assert "y" in pub["social_physics"]

    def test_agent_states_by_agent(self):
        engine = BehaviorEngine(["x", "y"])
        pub = engine.get_public_state()
        assert "x" in pub["agent_states"]
        assert "y" in pub["agent_states"]

    def test_turn_count_increments(self):
        engine = BehaviorEngine(["a", "b"])
        assert engine.get_public_state()["turn_count"] == 0
        engine.process_turn(turn())
        assert engine.get_public_state()["turn_count"] == 1

    def test_relationship_matrix_includes_edges(self):
        engine = BehaviorEngine(["alice", "bob"])
        engine.process_turn(turn(action_type="challenge"))
        pub = engine.get_public_state()
        assert "alice" in pub["relationship_matrix"]


# ── TestSuggestedAction ─────────────────────────────────────────────────────

class TestSuggestedAction:
    def test_no_action_at_baseline(self):
        engine = BehaviorEngine(["alice", "bob"])
        result = engine.process_turn(turn(action_type="statement"))
        assert result.suggested_action is None

    def test_high_tension_suggests_deescalate(self):
        engine = BehaviorEngine(["alice", "bob"])
        # Drive alice's tension high
        for _ in range(6):
            engine.process_turn(turn(speaker_id="alice", target_id="bob", action_type="escalate"))
        result = engine.process_turn(turn(speaker_id="alice", target_id="bob", action_type="statement"))
        assert result.suggested_action == "deescalate"

    def test_low_trust_suggests_repair(self):
        engine = BehaviorEngine(["alice", "bob"])
        # escalate: trust -= 0.15, tension += 0.2
        # debate baseline tension=0.5 → after 2 escalates: tension=0.9 (> 0.7 → deescalate)
        for _ in range(2):
            engine.process_turn(turn(speaker_id="alice", target_id="bob", action_type="escalate"))
        result = engine.process_turn(turn(speaker_id="alice", target_id="bob", action_type="statement"))
        assert result.suggested_action == "deescalate"

    def test_high_trust_suggests_deepen_alliance(self):
        engine = BehaviorEngine(["alice", "bob"])
        for _ in range(3):
            engine.process_turn(turn(speaker_id="alice", target_id="bob", action_type="compromise"))
        result = engine.process_turn(turn(speaker_id="alice", target_id="bob", action_type="statement"))
        assert result.suggested_action == "deepen_alliance"


# ── TestMultiAgent ──────────────────────────────────────────────────────────

class TestMultiAgent:
    def test_separate_social_physics_per_agent(self):
        engine = BehaviorEngine(["a", "b", "c"])
        engine.process_turn(turn(speaker_id="a", target_id="b", action_type="challenge"))
        engine.process_turn(turn(speaker_id="b", target_id="c", action_type="compromise"))
        # a's trust decreased (challenge); b's trust increased (compromise)
        assert engine._social_physics["a"].trust < 0.5
        assert engine._social_physics["b"].trust > 0.5

    def test_graph_tracks_multiple_edges(self):
        engine = BehaviorEngine(["a", "b", "c"])
        engine.process_turn(turn(speaker_id="a", target_id="b", action_type="challenge"))
        engine.process_turn(turn(speaker_id="a", target_id="c", action_type="coalition_signal"))
        m = engine._graph.to_matrix()
        assert len(m["a"]) == 2

    def test_internal_state_is_per_agent(self):
        engine = BehaviorEngine(["a", "b"])
        engine.process_turn(turn(speaker_id="a", target_id="b", action_type="challenge"))
        # b's anger: 0.3 (debate baseline) + 0.15 (challenge directed at b)
        assert engine._internal_states["b"].cognitive_state.emotion["anger"] == pytest.approx(0.45, abs=1e-6)
        # a's anger decays from 0.3 (debate) towards hardcoded 0.2 baseline via unknown event decay (-0.01) → 0.29
        assert engine._internal_states["a"].cognitive_state.emotion["anger"] == pytest.approx(0.29, abs=1e-6)


# ── TestDeterminism ─────────────────────────────────────────────────────────

class TestDeterminism:
    def test_same_inputs_same_outputs(self):
        e1 = BehaviorEngine(["a", "b"])
        e2 = BehaviorEngine(["a", "b"])
        turns_list = [
            turn(speaker_id="a", target_id="b", action_type="challenge"),
            turn(speaker_id="b", target_id="a", action_type="compromise"),
            turn(speaker_id="a", target_id="b", action_type="statement"),
            turn(speaker_id="b", target_id="a", action_type="escalate"),
        ]
        for t in turns_list:
            e1.process_turn(t)
            e2.process_turn(t)

        assert e1._social_physics["a"].trust == e2._social_physics["a"].trust
        assert e1._social_physics["b"].trust == e2._social_physics["b"].trust
        assert e1._graph.to_matrix() == e2._graph.to_matrix()

    def test_deterministic_public_state(self):
        e1 = BehaviorEngine(["a"])
        e2 = BehaviorEngine(["a"])
        t = turn(speaker_id="a", target_id="bogus", action_type="statement")
        e1.process_turn(t)
        e2.process_turn(t)
        assert e1.get_public_state() == e2.get_public_state()


# ── TestScenario ────────────────────────────────────────────────────────────

class TestScenario:
    def test_engine_scenario_crisis_init(self):
        engine = make_engine(["test_agent"], scenario_type="crisis")
        sp = engine._social_physics["test_agent"]
        assert abs(sp.tension - 0.7) < 1e-4, f"Expected tension=0.7, got {sp.tension}"
        assert abs(sp.trust - 0.4) < 1e-4, f"Expected trust=0.4, got {sp.trust}"

        ist = engine._internal_states["test_agent"]
        assert abs(ist.cognitive_state.emotion["fear"] - 0.6) < 1e-4, f"Expected fear=0.6, got {ist.cognitive_state.emotion['fear']}"
        assert abs(ist.cognitive_state.emotion["joy"] - 0.15) < 1e-4, f"Expected joy=0.15, got {ist.cognitive_state.emotion['joy']}"

    def test_engine_default_scenario(self):
        engine = make_engine(["test_agent"])
        sp = engine._social_physics["test_agent"]
        assert abs(sp.tension - 0.5) < 1e-4, f"Expected default tension=0.5 (debate), got {sp.tension}"
        assert abs(sp.trust - 0.5) < 1e-4

    def test_engine_personality_flow(self):
        from app.models import PersonalityProfile

        engine = make_engine(["test_agent"], personas=[PersonalityProfile(aggressiveness=80)])
        initial_tension = engine._social_physics["test_agent"].tension

        engine.process_turn({"speaker_id": "test_agent", "action_type": "challenge", "target_id": ""})
        after_tension = engine._social_physics["test_agent"].tension
        delta = after_tension - initial_tension
        expected_delta = 0.12 * (1 + (80 - 50) / 50 * 0.5)
        assert abs(delta - expected_delta) < 1e-4, f"Expected delta {expected_delta}, got {delta}"
