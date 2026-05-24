from __future__ import annotations

from typing import Self

from pydantic import BaseModel, Field


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
        delta = DEFAULT_DELTAS[action_type]
        return SocialPhysics(
            trust=_clamp01(self.trust + delta["trust"]),
            leverage=_clamp01(self.leverage + delta["leverage"]),
            tension=_clamp01(self.tension + delta["tension"]),
            dominance=_clamp01(self.dominance + delta["dominance"]),
            credibility=_clamp01(self.credibility + delta["credibility"]),
            momentum=_clamp11(self.momentum + delta["momentum"]),
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

def _clamp01(val: float) -> float:
    return max(0.0, min(1.0, val))


def _clamp11(val: float) -> float:
    return max(-1.0, min(1.0, val))


def _decay(val: float, baseline: float) -> float:
    return val + (baseline - val) * DECAY_RATE
