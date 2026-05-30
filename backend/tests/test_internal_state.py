from __future__ import annotations

import importlib.util
import sys
from copy import deepcopy
from pathlib import Path

import pytest

_module_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "internal_state.py"
_spec = importlib.util.spec_from_file_location("internal_state", _module_path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["internal_state"] = _mod
_spec.loader.exec_module(_mod)

CognitiveState = _mod.CognitiveState
InternalState = _mod.InternalState

from app.models import PersonalityProfile


def make_internal_state(
    agent_id: str = "agent-alpha",
    aggressiveness: int = 50,
    empathy: int = 50,
    stubbornness: int = 50,
    verbosity: int = 50,
) -> InternalState:
    personality = PersonalityProfile(
        aggressiveness=aggressiveness,
        empathy=empathy,
        stubbornness=stubbornness,
        verbosity=verbosity,
    )
    return InternalState(agent_id=agent_id, personality=personality)


@pytest.fixture
def default_state() -> InternalState:
    return make_internal_state()


class TestInitialState:
    def test_initial_values_from_personality(self) -> None:
        state = make_internal_state(empathy=80, stubbornness=20)
        assert state.cognitive_state.confidence == 0.8
        assert state.cognitive_state.certainty == pytest.approx(0.94)

    def test_default_emotions(self, default_state: InternalState) -> None:
        cs = default_state.cognitive_state
        assert cs.emotion["anger"] == 0.2
        assert cs.emotion["fear"] == 0.2
        assert cs.emotion["joy"] == 0.5
        assert cs.emotion["shame"] == 0.2
        assert cs.emotion["surprise"] == 0.2

    def test_high_stubbornness_lowers_certainty(self) -> None:
        state = make_internal_state(stubbornness=100)
        assert state.cognitive_state.certainty == pytest.approx(0.7)

    def test_low_empathy_lowers_confidence(self) -> None:
        state = make_internal_state(empathy=10)
        assert state.cognitive_state.confidence == 0.1


class TestApplyEvent:
    def test_emotion_shifts_on_challenge(self, default_state: InternalState) -> None:
        state = default_state
        state.apply_event({"action_type": "challenge", "directed_at": "agent-alpha"})
        cs = state.cognitive_state
        assert cs.emotion["anger"] == pytest.approx(0.35)
        assert cs.confidence == pytest.approx(0.4)
        assert cs.emotion["joy"] == 0.5

    def test_challenge_not_directed_at_self(self, default_state: InternalState) -> None:
        state = default_state
        state.apply_event({"action_type": "challenge", "directed_at": "agent-beta"})
        cs = state.cognitive_state
        assert cs.emotion["anger"] == 0.2
        assert cs.confidence == 0.5

    def test_emotion_shifts_on_agreement(self, default_state: InternalState) -> None:
        state = default_state
        state.apply_event({"action_type": "agreement"})
        cs = state.cognitive_state
        assert cs.emotion["joy"] == pytest.approx(0.58)
        assert cs.confidence == pytest.approx(0.55)

    def test_confidence_drops_on_escalate(self, default_state: InternalState) -> None:
        state = default_state
        state.apply_event({"action_type": "escalate", "directed_at": "agent-alpha"})
        cs = state.cognitive_state
        assert cs.emotion["fear"] == pytest.approx(0.3)
        assert cs.emotion["shame"] == pytest.approx(0.25)
        assert cs.confidence == pytest.approx(0.35)

    def test_escalate_not_directed_at_self(self, default_state: InternalState) -> None:
        state = default_state
        state.apply_event({"action_type": "escalate", "directed_at": "agent-beta"})
        cs = state.cognitive_state
        assert cs.emotion["fear"] == 0.2
        assert cs.emotion["shame"] == 0.2
        assert cs.confidence == 0.5

    def test_compromise_from_ally(self, default_state: InternalState) -> None:
        state = default_state
        certainty_before = state.cognitive_state.certainty
        state.apply_event({"action_type": "compromise"})
        cs = state.cognitive_state
        assert cs.emotion["joy"] == pytest.approx(0.6)
        assert cs.certainty == pytest.approx(certainty_before + 0.05)

    def test_no_unknown_event_types(self, default_state: InternalState) -> None:
        state = default_state
        cs_before = deepcopy(state.cognitive_state.emotion)
        state.apply_event({"action_type": "some_bogus_type"})
        cs = state.cognitive_state
        for key in cs_before:
            assert abs(cs.emotion[key] - cs_before[key]) <= 0.02

    def test_empty_action_type_is_noop(self, default_state: InternalState) -> None:
        state = default_state
        state.apply_event({"action_type": ""})
        cs = state.cognitive_state
        assert cs.emotion["joy"] == 0.5
        assert cs.confidence == 0.5

    def test_event_appended_to_history(self, default_state: InternalState) -> None:
        state = default_state
        event = {"action_type": "challenge", "directed_at": "agent-alpha"}
        state.apply_event(event)
        assert len(state.history) == 1
        assert state.history[0] == event

    def test_apply_event_returns_self(self, default_state: InternalState) -> None:
        result = default_state.apply_event({"action_type": "agreement"})
        assert result is default_state


class TestGoalManagement:
    def test_goal_shift_persistence(self, default_state: InternalState) -> None:
        state = default_state
        state.shift_goal("secure_vote", 5)
        assert state.cognitive_state.focus == "secure_vote"
        assert state.cognitive_state.goal_priority == 5

    def test_goal_shift_updates_previous(self, default_state: InternalState) -> None:
        state = default_state
        state.shift_goal("phase_1", 2)
        state.shift_goal("phase_2", 4)
        assert state.cognitive_state.focus == "phase_2"
        assert state.cognitive_state.goal_priority == 4

    def test_goal_shift_returns_none(self, default_state: InternalState) -> None:
        result = default_state.shift_goal("x", 1)
        assert result is None


class TestEmotionalDecay:
    def test_emotional_decay_toward_baseline(self) -> None:
        state = make_internal_state()
        state.cognitive_state.emotion["anger"] = 1.0
        state.cognitive_state.emotion["fear"] = 0.9
        state.cognitive_state.emotion["joy"] = 0.0
        state.cognitive_state.emotion["shame"] = 0.8
        state.cognitive_state.emotion["surprise"] = 0.0

        for _ in range(200):
            state.emotional_decay()

        assert state.cognitive_state.emotion["anger"] == pytest.approx(0.2, abs=0.02)
        assert state.cognitive_state.emotion["fear"] == pytest.approx(0.2, abs=0.02)
        assert state.cognitive_state.emotion["joy"] == pytest.approx(0.5, abs=0.02)
        assert state.cognitive_state.emotion["shame"] == pytest.approx(0.2, abs=0.02)
        assert state.cognitive_state.emotion["surprise"] == pytest.approx(0.2, abs=0.02)

    def test_decay_single_step_direction(self, default_state: InternalState) -> None:
        state = default_state
        state.cognitive_state.emotion["anger"] = 0.8
        state.emotional_decay()
        assert state.cognitive_state.emotion["anger"] < 0.8
        assert state.cognitive_state.emotion["anger"] > 0.2

    def test_decay_at_baseline_stable(self, default_state: InternalState) -> None:
        for _ in range(10):
            default_state.emotional_decay()
        assert default_state.cognitive_state.emotion["anger"] == pytest.approx(0.2, abs=1e-6)
        assert default_state.cognitive_state.emotion["joy"] == pytest.approx(0.5, abs=1e-6)

    def test_emotional_decay_returns_none(self, default_state: InternalState) -> None:
        result = default_state.emotional_decay()
        assert result is None


class TestSnapshot:
    def test_snapshot_serialization(self, default_state: InternalState) -> None:
        result = default_state.snapshot()
        assert result["agent_id"] == "agent-alpha"
        assert set(result.keys()) == {
            "agent_id", "emotion", "confidence", "certainty", "focus", "goal_priority", "modulation",
        }
        assert isinstance(result["emotion"], dict)
        for key in ("anger", "fear", "joy", "shame", "surprise"):
            assert key in result["emotion"]
            assert isinstance(result["emotion"][key], float)

    def test_snapshot_reflects_updates(self, default_state: InternalState) -> None:
        state = default_state
        state.apply_event({"action_type": "challenge", "directed_at": "agent-alpha"})
        snap = state.snapshot()
        assert snap["confidence"] < 0.5
        assert snap["emotion"]["anger"] > 0.2

    def test_snapshot_returns_copy(self, default_state: InternalState) -> None:
        data = default_state.snapshot()
        data["emotion"]["anger"] = 1.0
        assert default_state.cognitive_state.emotion["anger"] == 0.2


class TestDeterminism:
    def test_round_trip_determinism(self) -> None:
        events = [
            {"action_type": "challenge", "directed_at": "agent-alpha"},
            {"action_type": "agreement"},
            {"action_type": "escalate", "directed_at": "agent-alpha"},
            {"action_type": "compromise"},
        ]
        state_a = make_internal_state(agent_id="agent-alpha", empathy=70, stubbornness=30)
        state_b = make_internal_state(agent_id="agent-alpha", empathy=70, stubbornness=30)

        for evt in events:
            state_a.apply_event(evt)
            state_b.apply_event(evt)

        assert state_a.snapshot() == state_b.snapshot()

    def test_different_personalities_diverge(self) -> None:
        events = [
            {"action_type": "challenge", "directed_at": "agent-alpha"},
            {"action_type": "challenge", "directed_at": "agent-alpha"},
        ]
        state_a = make_internal_state(agent_id="agent-alpha", empathy=90, stubbornness=10)
        state_b = make_internal_state(agent_id="agent-alpha", empathy=10, stubbornness=90)

        for evt in events:
            state_a.apply_event(evt)
            state_b.apply_event(evt)

        snap_a = state_a.snapshot()
        snap_b = state_b.snapshot()
        assert snap_a["confidence"] != snap_b["confidence"]
        assert snap_a["certainty"] != snap_b["certainty"]


class TestRepr:
    def test_repr_contains_agent_id(self, default_state: InternalState) -> None:
        r = repr(default_state)
        assert "agent-alpha" in r
        assert "InternalState(" in r

    def test_repr_round_trip_info(self) -> None:
        state = make_internal_state(agent_id="test-agent", empathy=100, stubbornness=0)
        r = repr(state)
        assert "test-agent" in r
        assert "confidence=1.0" in r
        assert "certainty=1.0" in r


class TestPersonalityModulation:
    def test_personality_modulate_default(self):
        from internal_state import personality_modulate

        ist = InternalState("test_agent", PersonalityProfile())
        anger_before = ist.cognitive_state.emotion["anger"]
        ist.apply_event({"action_type": "challenge", "directed_at": "test_agent"})
        anger_after = ist.cognitive_state.emotion["anger"]
        assert abs(anger_after - (anger_before + 0.15)) < 1e-4, f"Expected {anger_before + 0.15}, got {anger_after}"

        result = personality_modulate(0.15, 50, 0.6)
        assert abs(result - 0.15) < 1e-10, f"Expected 0.15, got {result}"

    def test_personality_high_aggression_challenge(self):
        ist = InternalState("test_agent", PersonalityProfile(aggressiveness=80))
        anger_before = ist.cognitive_state.emotion["anger"]
        ist.apply_event({"action_type": "challenge", "directed_at": "test_agent"})
        anger_after = ist.cognitive_state.emotion["anger"]

        expected_delta = 0.15 * (1 + (80 - 50) / 50 * 0.6)  # 0.204
        expected = anger_before + expected_delta
        assert abs(anger_after - expected) < 1e-4, f"Expected {expected}, got {anger_after}"
