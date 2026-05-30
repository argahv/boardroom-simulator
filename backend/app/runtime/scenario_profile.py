from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ScenarioProfile:
    social: dict
    emotion: dict
    volatility: float = 1.0


SCENARIO_PROFILES: dict[str, ScenarioProfile] = {
    "crisis": ScenarioProfile(
        social={"trust": 0.4, "leverage": 0.3, "tension": 0.7, "dominance": 0.5, "credibility": 0.3, "momentum": -0.2},
        emotion={"anger": 0.5, "fear": 0.6, "joy": 0.15, "shame": 0.3, "surprise": 0.4},
        volatility=1.5,
    ),
    "investor": ScenarioProfile(
        social={"trust": 0.3, "leverage": 0.6, "tension": 0.4, "dominance": 0.4, "credibility": 0.6, "momentum": 0.1},
        emotion={"anger": 0.1, "fear": 0.3, "joy": 0.6, "shame": 0.15, "surprise": 0.2},
        volatility=0.8,
    ),
    "podcast": ScenarioProfile(
        social={"trust": 0.5, "leverage": 0.3, "tension": 0.3, "dominance": 0.3, "credibility": 0.4, "momentum": 0.2},
        emotion={"anger": 0.15, "fear": 0.1, "joy": 0.6, "shame": 0.15, "surprise": 0.4},
        volatility=1.2,
    ),
    "legal": ScenarioProfile(
        social={"trust": 0.25, "leverage": 0.6, "tension": 0.6, "dominance": 0.5, "credibility": 0.5, "momentum": 0.0},
        emotion={"anger": 0.35, "fear": 0.25, "joy": 0.2, "shame": 0.2, "surprise": 0.2},
        volatility=0.9,
    ),
    "partnership": ScenarioProfile(
        social={"trust": 0.45, "leverage": 0.5, "tension": 0.35, "dominance": 0.3, "credibility": 0.5, "momentum": 0.1},
        emotion={"anger": 0.15, "fear": 0.2, "joy": 0.5, "shame": 0.15, "surprise": 0.2},
        volatility=0.7,
    ),
    "debate": ScenarioProfile(
        social={"trust": 0.5, "leverage": 0.4, "tension": 0.5, "dominance": 0.4, "credibility": 0.5, "momentum": 0.0},
        emotion={"anger": 0.3, "fear": 0.2, "joy": 0.4, "shame": 0.2, "surprise": 0.3},
        volatility=1.0,
    ),
}
