from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

# Load social_physics directly to bypass broken runtime __init__.py chain
# (simulation.py → app.llm → missing app.budget)
_module_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "social_physics.py"
_spec = importlib.util.spec_from_file_location("social_physics", _module_path)
_sp_mod = importlib.util.module_from_spec(_spec)
sys.modules["social_physics"] = _sp_mod
_spec.loader.exec_module(_sp_mod)

SocialPhysics = _sp_mod.SocialPhysics
DEFAULT_DELTAS = _sp_mod.DEFAULT_DELTAS


# ── helpers ────────────────────────────────────────────────────────────────

def make_physics(**overrides) -> SocialPhysics:
    defaults = dict(
        trust=0.5,
        leverage=0.5,
        tension=0.3,
        dominance=0.3,
        credibility=0.5,
        momentum=0.0,
    )
    defaults.update(overrides)
    return SocialPhysics(**defaults)


# ── initial values ─────────────────────────────────────────────────────────

class TestInitialValues:
    def test_all_fields_default(self):
        sp = SocialPhysics()
        assert sp.trust == 0.5
        assert sp.leverage == 0.5
        assert sp.tension == 0.3
        assert sp.dominance == 0.3
        assert sp.credibility == 0.5
        assert sp.momentum == 0.0

    def test_custom_initial_values(self):
        sp = SocialPhysics(trust=0.8, tension=0.9, momentum=0.5)
        assert sp.trust == 0.8
        assert sp.tension == 0.9
        assert sp.momentum == 0.5
        assert sp.leverage == 0.5  # default
        assert sp.dominance == 0.3  # default
        assert sp.credibility == 0.5  # default

    def test_field_validation_clamps_zero_to_one(self):
        with pytest.raises(ValueError):
            SocialPhysics(trust=1.5)
        with pytest.raises(ValueError):
            SocialPhysics(leverage=-0.1)
        with pytest.raises(ValueError):
            SocialPhysics(momentum=1.1)
        with pytest.raises(ValueError):
            SocialPhysics(momentum=-1.1)


# ── update ──────────────────────────────────────────────────────────────────

class TestUpdate:
    def test_trust_decreases_on_challenge(self):
        sp = make_physics(trust=0.7)
        sp = sp.update("challenge", "a", "b", {})
        assert sp.trust < 0.7

    def test_tension_increases_on_interrupt(self):
        sp = make_physics(tension=0.3)
        sp = sp.update("interrupt", "a", "b", {})
        assert sp.tension > 0.3

    def test_momentum_positive_on_compromise(self):
        sp = make_physics()
        sp = sp.update("compromise", "a", "b", {})
        assert sp.momentum > 0

    def test_momentum_negative_on_challenge(self):
        sp = make_physics()
        sp = sp.update("challenge", "a", "b", {})
        assert sp.momentum < 0

    def test_trust_increases_on_compromise(self):
        sp = make_physics(trust=0.5)
        sp = sp.update("compromise", "a", "b", {})
        assert sp.trust > 0.5

    def test_tension_decreases_on_compromise(self):
        sp = make_physics(tension=0.5)
        sp = sp.update("compromise", "a", "b", {})
        assert sp.tension < 0.5

    def test_credibility_decreases_on_escalate(self):
        sp = make_physics(credibility=0.6)
        sp = sp.update("escalate", "a", "b", {})
        assert sp.credibility < 0.6

    def test_no_unknown_action_type(self):
        sp = make_physics()
        with pytest.raises(ValueError):
            sp.update("invalid_action", "a", "b", {})

    def test_multiple_updates_accumulate(self):
        sp = make_physics(trust=0.8, tension=0.2)
        for _ in range(3):
            sp = sp.update("challenge", "a", "b", {})
        assert sp.trust < 0.7
        assert sp.tension > 0.4

    def test_round_trip_determinism(self):
        sp1 = make_physics(trust=0.7, tension=0.4)
        sp2 = make_physics(trust=0.7, tension=0.4)
        actions = [
            ("challenge", "a", "b"),
            ("statement", "b", "a"),
            ("compromise", "a", "b"),
            ("question", "c", None),
        ]
        for action_type, speaker, target in actions:
            sp1 = sp1.update(action_type, speaker, target, {})
            sp2 = sp2.update(action_type, speaker, target, {})
        assert sp1.trust == sp2.trust
        assert sp1.tension == sp2.tension
        assert sp1.momentum == sp2.momentum


# ── decay ───────────────────────────────────────────────────────────────────

class TestDecay:
    def test_decay_moves_toward_baseline(self):
        sp = make_physics(trust=0.9, tension=0.8, dominance=0.9, credibility=0.1, momentum=0.7)
        for _ in range(3):
            sp = sp.decay()
        # trust should trend toward 0.5
        assert sp.trust < 0.9
        assert sp.trust > 0.5
        # tension should trend toward 0.3
        assert sp.tension < 0.8
        assert sp.tension > 0.3
        # dominance should trend toward 0.3
        assert sp.dominance < 0.9
        assert sp.dominance > 0.3
        # credibility should trend toward 0.5 (was below)
        assert sp.credibility > 0.1
        assert sp.credibility < 0.5
        # momentum should trend toward 0.0
        assert abs(sp.momentum) < 0.7

    def test_decay_noop_when_at_baseline(self):
        sp = make_physics()
        for _ in range(5):
            sp = sp.decay()
        assert sp.trust == 0.5
        assert sp.leverage == 0.5
        assert sp.tension == 0.3
        assert sp.dominance == 0.3
        assert sp.credibility == 0.5
        assert sp.momentum == 0.0


# ── threshold triggers ──────────────────────────────────────────────────────

class TestThresholdTriggers:
    def test_threshold_triggers_escalation(self):
        sp = make_physics(tension=0.75)
        sp = sp.update("challenge", "a", "b", {})  # tension += 0.12 → 0.87
        triggers = sp.threshold_triggers()
        assert "escalation_risk" in triggers

    def test_threshold_trust_collapse(self):
        sp = make_physics(trust=0.25)
        sp = sp.update("escalate", "a", "b", {})  # trust -= 0.15 → 0.1
        triggers = sp.threshold_triggers()
        assert "trust_collapse" in triggers

    def test_threshold_domination_threat(self):
        sp = make_physics(dominance=0.78)
        sp = sp.update("interrupt", "a", "b", {})  # dominance += 0.08 → 0.86
        triggers = sp.threshold_triggers()
        assert "domination_threat" in triggers

    def test_threshold_gaining_traction(self):
        sp = make_physics(momentum=0.68)
        sp = sp.update("compromise", "a", "b", {})  # momentum += 0.05 → 0.73
        triggers = sp.threshold_triggers()
        assert "gaining_traction" in triggers

    def test_threshold_losing_ground(self):
        sp = make_physics(momentum=-0.49)
        sp = sp.update("challenge", "a", "b", {})  # momentum -= 0.02 → -0.51 < -0.5
        triggers = sp.threshold_triggers()
        assert "losing_ground" in triggers

    def test_threshold_credibility_crisis(self):
        sp = make_physics(credibility=0.24)
        sp = sp.update("interrupt", "a", "b", {})  # credibility -= 0.05 → 0.19 < 0.2
        triggers = sp.threshold_triggers()
        assert "credibility_crisis" in triggers

    def test_threshold_leverage_advantage(self):
        sp = make_physics(leverage=0.83)
        sp = sp.update("compromise", "a", "b", {})  # leverage += 0.05 → 0.88
        triggers = sp.threshold_triggers()
        assert "leverage_advantage" in triggers

    def test_threshold_leverage_collapse(self):
        sp = make_physics(leverage=0.16)
        sp = sp.update("challenge", "a", "b", {})  # leverage -= 0.02 → 0.14 < 0.15
        triggers = sp.threshold_triggers()
        assert "leverage_collapse" in triggers

    def test_no_triggers_at_baseline(self):
        sp = make_physics()
        triggers = sp.threshold_triggers()
        assert triggers == []

    def test_multiple_triggers_simultaneously(self):
        sp = make_physics(tension=0.9, trust=0.15)
        triggers = sp.threshold_triggers()
        assert "escalation_risk" in triggers
        assert "trust_collapse" in triggers


# ── snapshot ────────────────────────────────────────────────────────────────

class TestSnapshot:
    def test_snapshot_serialization(self):
        sp = make_physics(trust=0.3, tension=0.7, momentum=0.4)
        data = sp.snapshot()
        assert isinstance(data, dict)
        assert data["trust"] == 0.3
        assert data["leverage"] == 0.5
        assert data["tension"] == 0.7
        assert data["dominance"] == 0.3
        assert data["credibility"] == 0.5
        assert data["momentum"] == 0.4
        assert isinstance(data["triggers"], list)

    def test_snapshot_includes_active_triggers(self):
        sp = make_physics(tension=0.85)
        data = sp.snapshot()
        assert "escalation_risk" in data["triggers"]


# ── repr ────────────────────────────────────────────────────────────────────

class TestRepr:
    def test_repr_contains_fields(self):
        sp = make_physics()
        r = repr(sp)
        assert "SocialPhysics" in r
        assert "trust=0.5" in r
        assert "momentum=0.0" in r


# ── DEFAULT_DELTAS module-level ─────────────────────────────────────────────

class TestDefaultDeltas:
    def test_all_action_types_present(self):
        expected = {
            "statement", "question", "challenge", "compromise",
            "coalition_signal", "interrupt", "escalate",
        }
        assert set(DEFAULT_DELTAS.keys()) == expected

    def test_each_delta_has_correct_keys(self):
        required_keys = {"trust", "leverage", "tension", "dominance", "credibility", "momentum"}
        for action_type, delta in DEFAULT_DELTAS.items():
            assert set(delta.keys()) == required_keys, f"{action_type} missing keys"


class TestPersonalityModulation:
    def test_personality_social_default(self):
        from app.models import PersonalityProfile

        sp = SocialPhysics()
        result = sp.update("challenge", "a", None, {"personality": PersonalityProfile()})
        delta = result.tension - 0.3  # base tension is 0.3
        assert abs(delta - 0.12) < 1e-4, f"Expected delta 0.12, got {delta}"

    def test_personality_social_high_agg_challenge(self):
        from app.models import PersonalityProfile

        sp = SocialPhysics()
        result = sp.update("challenge", "a", None, {"personality": PersonalityProfile(aggressiveness=80)})
        delta = result.tension - 0.3
        expected_delta = 0.12 * (1 + (80 - 50) / 50 * 0.5)  # 0.156
        assert abs(delta - expected_delta) < 1e-4, f"Expected {expected_delta}, got {delta}"

    def test_update_without_personality(self):
        from app.models import PersonalityProfile

        sp = SocialPhysics()
        result_with = sp.update("challenge", "a", None, {"personality": PersonalityProfile()})
        result_without = sp.update("challenge", "a", None, {})
        assert abs(result_with.tension - result_without.tension) < 1e-6

    def test_update_with_personality_context(self):
        from app.models import PersonalityProfile

        sp = SocialPhysics()
        result = sp.update("challenge", "a", None, {"personality": PersonalityProfile(aggressiveness=80), "extra": "data"})
        assert result.tension > 0.4  # Should be higher than baseline + default delta
