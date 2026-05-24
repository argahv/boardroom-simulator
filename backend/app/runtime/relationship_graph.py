from __future__ import annotations

from typing import Self

from pydantic import BaseModel, Field


class RelationshipEntry(BaseModel):
    trust: float = Field(default=0.5, ge=0.0, le=1.0)
    fear: float = Field(default=0.2, ge=0.0, le=1.0)
    admiration: float = Field(default=0.3, ge=0.0, le=1.0)
    rivalry: float = Field(default=0.2, ge=0.0, le=1.0)
    alliance: bool = False
    dependency: float = Field(default=0.0, ge=0.0, le=1.0)


DECAY_RATE = 0.04

BASELINES: dict[str, float | bool] = {
    "trust": 0.5,
    "fear": 0.2,
    "admiration": 0.3,
    "rivalry": 0.2,
    "alliance": False,
    "dependency": 0.0,
}


class RelationshipGraph:
    def __init__(self) -> None:
        self._edges: dict[tuple[str, str], RelationshipEntry] = {}

    def get(self, a: str, b: str) -> RelationshipEntry:
        key = (a, b)
        if key not in self._edges:
            self._edges[key] = RelationshipEntry()
        return self._edges[key]

    def set(self, a: str, b: str, entry: RelationshipEntry) -> Self:
        self._edges[(a, b)] = entry
        return self

    def update(self, a: str, b: str, field: str, delta: float) -> Self:
        entry = self.get(a, b)
        current = getattr(entry, field)
        new_val = max(0.0, min(1.0, current + delta))
        setattr(entry, field, new_val)
        return self

    def apply_turn(self, turn: dict) -> Self:
        action_type = turn.get("action_type", "")
        speaker = turn.get("speaker_id", "")
        target = turn.get("target_id", "")
        if action_type == "coalition_signal":
            self.update(speaker, target, "trust", 0.08)
            self.get(speaker, target).alliance = True
        elif action_type == "challenge":
            self.update(speaker, target, "trust", -0.08)
            self.update(speaker, target, "rivalry", 0.10)
        elif action_type == "interrupt":
            self.update(speaker, target, "fear", 0.05)
            self.update(speaker, target, "rivalry", 0.08)
        elif action_type == "compromise":
            self.update(speaker, target, "trust", 0.12)
            self.get(speaker, target).alliance = True
            self.update(speaker, target, "rivalry", -0.05)
        return self

    def decay_all(self) -> Self:
        for entry in self._edges.values():
            for key, baseline in BASELINES.items():
                if isinstance(baseline, bool):
                    setattr(entry, key, baseline)
                else:
                    current = getattr(entry, key)
                    decayed = current + (baseline - current) * DECAY_RATE
                    setattr(entry, key, max(0.0, min(1.0, decayed)))
        return self

    def get_allies(self, agent_id: str) -> list[str]:
        return [
            b
            for (a, b), entry in self._edges.items()
            if a == agent_id and entry.alliance
        ]

    def get_rivals(self, agent_id: str) -> list[str]:
        return [
            b
            for (a, b), entry in self._edges.items()
            if a == agent_id and entry.rivalry > 0.6
        ]

    def trust_score(self, agent_id: str) -> float:
        scores = [
            entry.trust
            for (a, b), entry in self._edges.items()
            if b == agent_id
        ]
        if not scores:
            return 0.5
        return sum(scores) / len(scores)

    def to_matrix(self) -> dict:
        result: dict[str, dict[str, dict]] = {}
        for (a, b), entry in self._edges.items():
            if a not in result:
                result[a] = {}
            result[a][b] = {
                "trust": entry.trust,
                "fear": entry.fear,
                "admiration": entry.admiration,
                "rivalry": entry.rivalry,
                "alliance": entry.alliance,
                "dependency": entry.dependency,
            }
        return result
