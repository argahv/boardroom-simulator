from __future__ import annotations

from typing import Self

from dataclasses import dataclass

from pydantic import BaseModel, Field

from app.models import PersonalityProfile

_EMOTION_BASELINES: dict[str, float] = {
    "anger": 0.2,
    "fear": 0.2,
    "joy": 0.5,
    "shame": 0.2,
    "surprise": 0.2,
}

_DEFAULT_EMOTIONS: dict[str, float] = {
    "anger": 0.2,
    "fear": 0.2,
    "joy": 0.5,
    "shame": 0.2,
    "surprise": 0.2,
}

_UNKNOWN_EVENT_DECAY: float = 0.01


def personality_modulate(base_delta: float, trait_value: int, strength: float = 0.5) -> float:
    normalized = (trait_value - 50) / 50
    return base_delta * (1.0 + normalized * strength)


PERSONALITY_EMOTION_MAP: dict[str, list[tuple[str, str, float]]] = {
    "challenge": [("aggressiveness", "anger", 0.6), ("empathy", "anger", -0.3)],
    "compromise": [("stubbornness", "joy", -0.4), ("aggressiveness", "joy", -0.2)],
    "escalate": [("aggressiveness", "fear", -0.3), ("empathy", "fear", 0.4)],
}


# ── Emotional Modulation Thresholds ──────────────────────────────────────
# All modulation is deterministic math. Same emotions → same behavior biases.

ANGER_HIGH: float = 0.7
FEAR_HIGH: float = 0.6
JOY_HIGH: float = 0.7
SHAME_HIGH: float = 0.6
SURPRISE_HIGH: float = 0.7

ANGER_MODERATE: float = 0.4
FEAR_MODERATE: float = 0.3


@dataclass
class EmotionalModulation:
    """Behavior probability biases derived from emotional state.

    All values are additive modifiers to base behavior probabilities.
    Positive = more likely, negative = less likely.
    Range: -1.0 to 1.0
    """
    interrupt_bias: float = 0.0
    challenge_bias: float = 0.0
    compromise_bias: float = 0.0
    coalition_bias: float = 0.0
    escalate_bias: float = 0.0
    statement_bias: float = 0.0
    question_bias: float = 0.0
    urgency_modifier: float = 0.0


# ── Emotion → Modulation Mapping ─────────────────────────────────────────
# Pure function. No LLM calls. No randomness. Deterministic.

EMOTION_MODULATION_RULES: list[tuple[str, float, str, float]] = [
    ("anger", 0.7, "interrupt_bias", 0.4),
    ("anger", 0.7, "compromise_bias", -0.3),
    ("anger", 0.7, "challenge_bias", 0.25),
    ("anger", 0.7, "urgency_modifier", 15),
    ("fear", 0.6, "challenge_bias", -0.2),
    ("fear", 0.6, "coalition_bias", 0.2),
    ("fear", 0.6, "escalate_bias", -0.15),
    ("fear", 0.6, "urgency_modifier", 10),
    ("joy", 0.7, "compromise_bias", 0.2),
    ("joy", 0.7, "statement_bias", 0.1),
    ("joy", 0.7, "urgency_modifier", -10),
    ("shame", 0.6, "interrupt_bias", -0.2),
    ("shame", 0.6, "statement_bias", -0.15),
    ("surprise", 0.7, "question_bias", 0.2),
    ("surprise", 0.7, "interrupt_bias", 0.15),
]


def compute_modulation(emotions: dict[str, float]) -> EmotionalModulation:
    """Compute behavior probability biases from emotional state.

    Args:
        emotions: dict with keys anger, fear, joy, shame, surprise (0.0-1.0)

    Returns:
        EmotionalModulation with bias values set based on emotion thresholds
    """
    mod = EmotionalModulation()
    for emotion, threshold, target, delta in EMOTION_MODULATION_RULES:
        if emotions.get(emotion, 0.0) >= threshold:
            current = getattr(mod, target)
            if target == "urgency_modifier":
                setattr(mod, target, current + delta)
            else:
                setattr(mod, target, _clamp11(current + delta))
    return mod


class CognitiveState(BaseModel):
    emotion: dict[str, float]
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    certainty: float = Field(default=0.5, ge=0.0, le=1.0)
    focus: str = ""
    goal_priority: int = Field(default=3, ge=0, le=5)
    modulation: EmotionalModulation | None = None  # computed from emotions


class InternalState:
    """Agent-internal cognitive tracking with personality-driven init."""

    def __init__(self, agent_id: str, personality: PersonalityProfile) -> None:
        self.agent_id = agent_id
        self._personality = personality
        self.cognitive_state = CognitiveState(
            emotion=dict(_DEFAULT_EMOTIONS),
            confidence=personality.empathy / 100.0,
            certainty=1.0 - (personality.stubbornness / 100.0) * 0.3,
        )
        self.history: list[dict] = []

    def apply_event(self, event: dict) -> Self:
        action_type = event.get("action_type", "")
        directed_at = event.get("directed_at")
        cs = self.cognitive_state

        deltas: dict[str, float] = {}
        if action_type == "challenge" and directed_at == self.agent_id:
            deltas = {"anger": 0.15, "confidence": -0.1}
        elif action_type == "compromise":
            deltas = {"joy": 0.1, "certainty": 0.05}
        elif action_type == "agreement":
            deltas = {"joy": 0.08, "confidence": 0.05}
        elif action_type == "escalate" and directed_at == self.agent_id:
            deltas = {"fear": 0.1, "shame": 0.05, "confidence": -0.15}
        elif not action_type:
            pass
        else:
            for key in cs.emotion:
                base = _EMOTION_BASELINES.get(key, 0.2)
                if cs.emotion[key] > base:
                    cs.emotion[key] = _clamp01(cs.emotion[key] - _UNKNOWN_EVENT_DECAY)
                elif cs.emotion[key] < base:
                    cs.emotion[key] = _clamp01(cs.emotion[key] + _UNKNOWN_EVENT_DECAY)

        for trait_name, target_emotion, strength in PERSONALITY_EMOTION_MAP.get(action_type, []):
            if target_emotion in deltas:
                trait_val = getattr(self._personality, trait_name, 50)
                deltas[target_emotion] = personality_modulate(deltas[target_emotion], trait_val, strength)

        for key, delta in deltas.items():
            if key in ("anger", "fear", "joy", "shame", "surprise"):
                cs.emotion[key] = _clamp01(cs.emotion.get(key, 0.5) + delta)
            elif key == "confidence":
                cs.confidence = _clamp01(cs.confidence + delta)
            elif key == "certainty":
                cs.certainty = _clamp01(cs.certainty + delta)

        cs.modulation = compute_modulation(cs.emotion)
        self.history.append(dict(event))
        return self

    def shift_goal(self, new_goal: str, priority: int) -> None:
        self.cognitive_state.focus = new_goal
        self.cognitive_state.goal_priority = priority

    def emotional_decay(self) -> None:
        cs = self.cognitive_state
        for key in ("anger", "fear", "joy", "shame", "surprise"):
            baseline = _EMOTION_BASELINES[key]
            cs.emotion[key] = round(cs.emotion[key] + (baseline - cs.emotion[key]) * 0.03, 6)

    def snapshot(self) -> dict:
        cs = self.cognitive_state
        return {
            "agent_id": self.agent_id,
            "emotion": dict(cs.emotion),
            "confidence": cs.confidence,
            "certainty": cs.certainty,
            "focus": cs.focus,
            "goal_priority": cs.goal_priority,
            "modulation": {
                "interrupt_bias": cs.modulation.interrupt_bias if cs.modulation else 0,
                "challenge_bias": cs.modulation.challenge_bias if cs.modulation else 0,
                "compromise_bias": cs.modulation.compromise_bias if cs.modulation else 0,
                "coalition_bias": cs.modulation.coalition_bias if cs.modulation else 0,
                "escalate_bias": cs.modulation.escalate_bias if cs.modulation else 0,
                "statement_bias": cs.modulation.statement_bias if cs.modulation else 0,
                "question_bias": cs.modulation.question_bias if cs.modulation else 0,
                "urgency_modifier": cs.modulation.urgency_modifier if cs.modulation else 0,
            } if cs.modulation else {},
        }

    def __repr__(self) -> str:
        cs = self.cognitive_state
        return (
            f"InternalState(agent_id={self.agent_id!r}, "
            f"emotion={cs.emotion}, confidence={cs.confidence}, "
            f"certainty={cs.certainty}, focus={cs.focus!r}, "
            f"goal_priority={cs.goal_priority})"
        )


def _clamp01(val: float) -> float:
    return max(0.0, min(1.0, round(val, 6)))


def _clamp11(val: float) -> float:
    return max(-1.0, min(1.0, round(val, 6)))
