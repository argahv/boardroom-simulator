from __future__ import annotations

from typing import Self

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


class CognitiveState(BaseModel):
    emotion: dict[str, float]
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    certainty: float = Field(default=0.5, ge=0.0, le=1.0)
    focus: str = ""
    goal_priority: int = Field(default=3, ge=0, le=5)


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

        if action_type == "challenge" and directed_at == self.agent_id:
            cs.emotion["anger"] = _clamp01(cs.emotion["anger"] + 0.15)
            cs.confidence = _clamp01(cs.confidence - 0.1)
        elif action_type == "compromise":
            cs.emotion["joy"] = _clamp01(cs.emotion["joy"] + 0.1)
            cs.certainty = _clamp01(cs.certainty + 0.05)
        elif action_type == "agreement":
            cs.emotion["joy"] = _clamp01(cs.emotion["joy"] + 0.08)
            cs.confidence = _clamp01(cs.confidence + 0.05)
        elif action_type == "escalate" and directed_at == self.agent_id:
            cs.emotion["fear"] = _clamp01(cs.emotion["fear"] + 0.1)
            cs.emotion["shame"] = _clamp01(cs.emotion["shame"] + 0.05)
            cs.confidence = _clamp01(cs.confidence - 0.15)
        elif not action_type:
            pass
        else:
            for key in cs.emotion:
                base = _EMOTION_BASELINES.get(key, 0.2)
                if cs.emotion[key] > base:
                    cs.emotion[key] = _clamp01(cs.emotion[key] - _UNKNOWN_EVENT_DECAY)
                elif cs.emotion[key] < base:
                    cs.emotion[key] = _clamp01(cs.emotion[key] + _UNKNOWN_EVENT_DECAY)

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
