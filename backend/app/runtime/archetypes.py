from __future__ import annotations

from dataclasses import dataclass
from typing import Self

@dataclass
class AgentArchetype:
    name: str
    description: str = ""
    personality_bias: dict = None
    emotion_bias: dict = None
    tendencies: dict = None

    def __post_init__(self):
        self.personality_bias = self.personality_bias or {}
        self.emotion_bias = self.emotion_bias or {}
        self.tendencies = self.tendencies or {}


ARCHETYPES = {
    "opportunist": AgentArchetype(
        name="opportunist",
        description="Seizes openings, pivots quickly",
        personality_bias={"aggressiveness": 10, "empathy": -10, "stubbornness": -10},
        emotion_bias={"joy": 0.3, "fear": -0.1},
        tendencies={"compromise": 0.4, "question": 0.3, "statement": 0.2, "challenge": 0.1},
    ),
    "idealist": AgentArchetype(
        name="idealist",
        description="Driven by principles, uncompromising on core values",
        personality_bias={"aggressiveness": -10, "empathy": 20, "stubbornness": 30},
        emotion_bias={"joy": 0.2, "anger": 0.1},
        tendencies={"statement": 0.4, "challenge": 0.3, "compromise": 0.2, "question": 0.1},
    ),
    "diplomat": AgentArchetype(
        name="diplomat",
        description="Seeks consensus, builds coalitions",
        personality_bias={"aggressiveness": -20, "empathy": 30, "stubbornness": -10},
        emotion_bias={"joy": 0.3, "anger": -0.1},
        tendencies={"compromise": 0.4, "question": 0.3, "coalition_signal": 0.2, "statement": 0.1},
    ),
    "pragmatist": AgentArchetype(
        name="pragmatist",
        description="Practical, data-driven, adapts",
        personality_bias={},
        emotion_bias={},
        tendencies={"statement": 0.25, "question": 0.25, "challenge": 0.25, "compromise": 0.25},
    ),
    "agitator": AgentArchetype(
        name="agitator",
        description="Provocative, challenges authority",
        personality_bias={"aggressiveness": 30, "empathy": -20, "stubbornness": 20},
        emotion_bias={"anger": 0.3, "joy": -0.1, "fear": -0.1},
        tendencies={"challenge": 0.5, "interrupt": 0.3, "escalate": 0.1, "statement": 0.1},
    ),
    "guardian": AgentArchetype(
        name="guardian",
        description="Protects status quo, cautious",
        personality_bias={"aggressiveness": 10, "empathy": 10, "stubbornness": 20},
        emotion_bias={"fear": 0.2, "joy": -0.1, "anger": 0.1},
        tendencies={"challenge": 0.3, "interrupt": 0.2, "statement": 0.2, "escalate": 0.15, "question": 0.15},
    ),
}


ARCHETYPE_DELTA_MULTIPLIERS: dict[str, dict[str, dict[str, float]]] = {
    "agitator": {
        "challenge": {"tension": 1.5, "dominance": 1.4, "trust": -1.2},
        "interrupt": {"dominance": 1.4, "tension": 1.3},
        "escalate": {"tension": 1.3, "dominance": 1.2},
    },
    "diplomat": {
        "challenge": {"tension": 0.7, "trust": -0.6},
        "compromise": {"trust": 1.3, "tension": -1.3},
        "coalition_signal": {"trust": 1.4},
    },
    "guardian": {
        "challenge": {"tension": 1.2, "credibility": -1.1},
        "escalate": {"tension": 1.5},
        "compromise": {"trust": 1.2},
    },
    "idealist": {
        "challenge": {"tension": 1.3, "credibility": -1.2},
    },
    "opportunist": {
        "challenge": {"trust": -0.8, "tension": 0.9},
        "compromise": {"trust": 0.8, "leverage": 0.8},
    },
    "pragmatist": {},
}


class ArchetypeRegistry:
    def __init__(self):
        self._data: dict[str, AgentArchetype] = {}

    def load_defaults(self) -> Self:
        for k, v in ARCHETYPES.items():
            self._data[k] = v
        return self

    def get(self, name: str) -> AgentArchetype | None:
        return self._data.get(name)

    def list_names(self) -> list[str]:
        return list(self._data.keys())

    def register(self, a: AgentArchetype) -> Self:
        self._data[a.name] = a
        return self


def make_registry() -> ArchetypeRegistry:
    return ArchetypeRegistry().load_defaults()