from __future__ import annotations

from typing import Self

from pydantic import BaseModel, Field


def personality_modulate(base_delta: float, trait_value: int, strength: float = 0.5) -> float:
    normalized = (trait_value - 50) / 50
    return base_delta * (1.0 + normalized * strength)


# ── default deltas ─────────────────────────────────────────────────────────

DEFAULT_DELTAS: dict[str, dict[str, float]] = {
    "statement": {
        "trust": 0.02, "leverage": 0.0, "tension": -0.01,
        "dominance": 0.0, "credibility": 0.02, "momentum": 0.02,
    },
    "question": {
        "trust": 0.03, "leverage": 0.01, "tension": -0.02,
        "dominance": 0.0, "credibility": 0.01, "momentum": 0.01,
    },
    "challenge": {
        "trust": -0.08, "leverage": -0.02, "tension": 0.12,
        "dominance": 0.05, "credibility": -0.03, "momentum": -0.02,
    },
    "compromise": {
        "trust": 0.1, "leverage": 0.05, "tension": -0.15,
        "dominance": -0.05, "credibility": 0.05, "momentum": 0.05,
    },
    "coalition_signal": {
        "trust": 0.06, "leverage": 0.03, "tension": -0.05,
        "dominance": -0.02, "credibility": 0.03, "momentum": 0.03,
    },
    "interrupt": {
        "trust": -0.05, "leverage": -0.01, "tension": 0.15,
        "dominance": 0.08, "credibility": -0.05, "momentum": -0.03,
    },
    "escalate": {
        "trust": -0.15, "leverage": -0.05, "tension": 0.2,
        "dominance": 0.1, "credibility": -0.1, "momentum": -0.05,
    },
    "vote": {
        "trust": 0.0, "leverage": 0.02, "tension": 0.02,
        "dominance": 0.0, "credibility": 0.02, "momentum": 0.03,
    },
    "agreement": {
        "trust": 0.08, "leverage": 0.0, "tension": -0.1,
        "dominance": -0.02, "credibility": 0.03, "momentum": 0.04,
    },
    "walkaway": {
        "trust": -0.2, "leverage": 0.05, "tension": 0.25,
        "dominance": 0.05, "credibility": -0.05, "momentum": -0.1,
    },
}

# Effects on the agent an action is directed AT (applied to the target's own state).
RECEIVED_DELTAS: dict[str, dict[str, float]] = {
    "question": {"tension": 0.02, "credibility": -0.01},
    "challenge": {"trust": -0.04, "tension": 0.08, "credibility": -0.04, "momentum": -0.03},
    "interrupt": {"tension": 0.06, "dominance": -0.03, "momentum": -0.02},
    "escalate": {"trust": -0.08, "tension": 0.1, "credibility": -0.03},
    "compromise": {"trust": 0.06, "tension": -0.06, "leverage": 0.03},
    "coalition_signal": {"trust": 0.06, "leverage": 0.03, "momentum": 0.03},
    "agreement": {"trust": 0.05, "tension": -0.05, "momentum": 0.04},
    "walkaway": {"tension": 0.1, "leverage": -0.03},
}

PERSONALITY_SOCIAL_MAP: dict[str, list[tuple[str, str, float]]] = {
    "challenge": [("aggressiveness", "tension", 0.5), ("aggressiveness", "dominance", 0.4)],
    "compromise": [("stubbornness", "tension", -0.3), ("empathy", "trust", 0.3)],
    "interrupt": [("aggressiveness", "dominance", 0.3), ("empathy", "trust", 0.2)],
}

DECAY_RATE = 0.05


# ── SocialPhysics ───────────────────────────────────────────────────────────

class SocialPhysics(BaseModel):
    """Deterministic state machine for social dynamics in multi-agent negotiation.

    Tracks 6 dimensions of social state. All transitions are deterministic
    math — no LLM calls, no randomness.
    """

    trust: float = Field(default=0.5, ge=0.0, le=1.0)
    leverage: float = Field(default=0.5, ge=0.0, le=1.0)
    tension: float = Field(default=0.3, ge=0.0, le=1.0)
    dominance: float = Field(default=0.3, ge=0.0, le=1.0)
    credibility: float = Field(default=0.5, ge=0.0, le=1.0)
    momentum: float = Field(default=0.0, ge=-1.0, le=1.0)

    def update(
        self,
        action_type: str,
        speaker_id: str,
        target_id: str | None,
        context: dict,
    ) -> Self:
        if action_type not in DEFAULT_DELTAS:
            raise ValueError(f"Unknown action_type: {action_type}")
        base = DEFAULT_DELTAS[action_type]
        delta = dict(base)

        volatility = context.get("volatility", 1.0) if isinstance(context, dict) else 1.0
        if volatility and volatility != 1.0:
            delta = {k: v * volatility for k, v in delta.items()}

        personality = context.get("personality") if isinstance(context, dict) else None
        if personality:
            for trait_name, field, strength in PERSONALITY_SOCIAL_MAP.get(action_type, []):
                if field in delta:
                    trait_val = getattr(personality, trait_name, 50)
                    delta[field] = personality_modulate(delta[field], trait_val, strength)

        # Modulate by archetype from context dict (after personality)
        archetype = context.get("archetype") if isinstance(context, dict) else None
        if archetype:
            arch_deltas = _archetype_multipliers().get(archetype, {}).get(action_type, {})
            for field, mult in arch_deltas.items():
                if field in delta:
                    # Multipliers scale magnitude; the sign in the table only
                    # documents the delta's direction and must not flip it.
                    delta[field] *= abs(mult)

        return SocialPhysics(
            trust=_clamp01(self.trust + delta["trust"]),
            leverage=_clamp01(self.leverage + delta["leverage"]),
            tension=_clamp01(self.tension + delta["tension"]),
            dominance=_clamp01(self.dominance + delta["dominance"]),
            credibility=_clamp01(self.credibility + delta["credibility"]),
            momentum=_clamp11(self.momentum + delta["momentum"]),
        )

    def receive(self, action_type: str, volatility: float = 1.0) -> Self:
        """Apply the effect of being on the receiving end of ``action_type``."""
        delta = RECEIVED_DELTAS.get(action_type)
        if not delta:
            return self
        return self.nudge(**{k: v * volatility for k, v in delta.items()})

    def nudge(self, **deltas: float) -> Self:
        """Return a copy with the given fields shifted by additive deltas."""
        values = {f: getattr(self, f) for f in
                  ("trust", "leverage", "tension", "dominance", "credibility", "momentum")}
        for field, d in deltas.items():
            if field in values:
                values[field] += d
        return SocialPhysics(
            trust=_clamp01(values["trust"]),
            leverage=_clamp01(values["leverage"]),
            tension=_clamp01(values["tension"]),
            dominance=_clamp01(values["dominance"]),
            credibility=_clamp01(values["credibility"]),
            momentum=_clamp11(values["momentum"]),
        )

    def decay(self) -> Self:
        return SocialPhysics(
            trust=_decay(self.trust, 0.5),
            leverage=_decay(self.leverage, 0.5),
            tension=_decay(self.tension, 0.3),
            dominance=_decay(self.dominance, 0.3),
            credibility=_decay(self.credibility, 0.5),
            momentum=_decay(self.momentum, 0.0),
        )

    def threshold_triggers(self) -> list[str]:
        triggers: list[str] = []
        if self.tension > 0.8:
            triggers.append("escalation_risk")
        if self.trust < 0.2:
            triggers.append("trust_collapse")
        if self.dominance > 0.8:
            triggers.append("domination_threat")
        if self.momentum > 0.7:
            triggers.append("gaining_traction")
        if self.momentum < -0.5:
            triggers.append("losing_ground")
        if self.credibility < 0.2:
            triggers.append("credibility_crisis")
        if self.leverage > 0.85:
            triggers.append("leverage_advantage")
        if self.leverage < 0.15:
            triggers.append("leverage_collapse")
        return triggers

    def snapshot(self) -> dict:
        return {
            "trust": self.trust,
            "leverage": self.leverage,
            "tension": self.tension,
            "dominance": self.dominance,
            "credibility": self.credibility,
            "momentum": self.momentum,
            "triggers": self.threshold_triggers(),
        }

    def __repr__(self) -> str:
        return (
            f"SocialPhysics(trust={self.trust}, leverage={self.leverage}, "
            f"tension={self.tension}, dominance={self.dominance}, "
            f"credibility={self.credibility}, momentum={self.momentum})"
        )


# ── helpers ─────────────────────────────────────────────────────────────────

def _archetype_multipliers() -> dict:
    # This module is also loaded standalone by file path (see behavior_engine),
    # where relative imports fail — fall back to loading the sibling the same way.
    try:
        from .archetypes import ARCHETYPE_DELTA_MULTIPLIERS
        return ARCHETYPE_DELTA_MULTIPLIERS
    except ImportError:
        import importlib.util
        import sys
        from pathlib import Path
        name = "_be_archetypes"
        if name not in sys.modules:
            spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parent / "archetypes.py")
            mod = importlib.util.module_from_spec(spec)
            sys.modules[name] = mod
            spec.loader.exec_module(mod)
        return sys.modules[name].ARCHETYPE_DELTA_MULTIPLIERS


def _clamp01(val: float) -> float:
    return max(0.0, min(1.0, val))


def _clamp11(val: float) -> float:
    return max(-1.0, min(1.0, val))


def _decay(val: float, baseline: float) -> float:
    return val + (baseline - val) * DECAY_RATE
