from __future__ import annotations

import json
from typing import Self


class StrategicThought:
    def __init__(self, agent_id: str) -> None:
        self.agent_id = agent_id
        self.public_position: str = ""
        self.private_concern: str = ""
        self.strategy: str = ""
        self.confidence: float = 0.5
        self.last_revised: int = 0
        self._history: list[dict] = []

    def set_public_position(self, text: str) -> Self:
        self.public_position = text
        return self

    def set_private_concern(self, text: str) -> Self:
        self.private_concern = text
        return self

    def set_strategy(self, text: str) -> Self:
        self.strategy = text
        return self

    def set_confidence(self, val: float) -> Self:
        self.confidence = max(0.0, min(1.0, val))
        return self

    def snapshot(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "public_position": self.public_position,
            "strategy_hint": self.strategy[:100] + "..." if len(self.strategy) > 100 else self.strategy,
            "confidence": self.confidence,
            "last_revised": self.last_revised,
        }


class PrivateThoughtSystem:
    def __init__(self) -> None:
        self._agents: dict[str, StrategicThought] = {}

    def register_agent(self, agent_id: str) -> Self:
        self._agents[agent_id] = StrategicThought(agent_id)
        return self

    def set_position(self, agent_id: str, public: str, private: str, strategy: str, turn: int = 0) -> Self:
        if agent_id not in self._agents:
            self.register_agent(agent_id)
        thought = self._agents[agent_id]
        thought.set_public_position(public)
        thought.set_private_concern(private)
        thought.set_strategy(strategy)
        thought.last_revised = turn
        return self

    def get_public(self, agent_id: str) -> str:
        return self._agents.get(agent_id, StrategicThought(agent_id)).public_position

    def get_private(self, agent_id: str) -> str:
        return self._agents.get(agent_id, StrategicThought(agent_id)).private_concern

    def get_strategy(self, agent_id: str) -> str:
        return self._agents.get(agent_id, StrategicThought(agent_id)).strategy

    def get_public_state(self, agent_id: str) -> dict:
        if agent_id not in self._agents:
            return {}
        t = self._agents[agent_id]
        return {
            "agent_id": t.agent_id,
            "public_position": t.public_position,
            "confidence": t.confidence,
        }

    def detect_hidden_motive(self, observer_id: str, target_id: str) -> float:
        if observer_id not in self._agents or target_id not in self._agents:
            return 0.0
        target = self._agents[target_id]
        if not target.public_position or not target.private_concern:
            return 0.0
        words_public = set(target.public_position.lower().split())
        words_private = set(target.private_concern.lower().split())
        overlap = len(words_public & words_private)
        total = len(words_public | words_private)
        if total == 0:
            return 0.0
        consistency = overlap / total
        return round(1.0 - consistency, 2)

    def get_all_snapshots(self) -> dict:
        return {aid: t.snapshot() for aid, t in self._agents.items()}


def make_private_thought_system(agent_ids: list[str] | None = None) -> PrivateThoughtSystem:
    pts = PrivateThoughtSystem()
    if agent_ids:
        for aid in agent_ids:
            pts.register_agent(aid)
    return pts
