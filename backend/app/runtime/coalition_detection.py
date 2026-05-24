from __future__ import annotations

from dataclasses import dataclass, field
from typing import Self


@dataclass
class Coalition:
    agent_a: str
    agent_b: str
    issue: str = ""
    strength: float = 0.5
    formed_turn: int = 0
    is_active: bool = True


class CoalitionDetector:
    def __init__(self, relationship_graph=None) -> None:
        self._graph = relationship_graph
        self._coalitions: list[Coalition] = []
        self._history: list[dict] = []

    def set_graph(self, graph) -> Self:
        self._graph = graph
        return self

    def detect(self, turn: dict, turn_index: int = 0) -> list[Coalition]:
        if self._graph is None:
            return []
        action_type = turn.get("action_type", "")
        speaker = turn.get("agent_id", "")
        target = turn.get("directed_at", "")

        if action_type == "coalition_signal" and target:
            c = Coalition(
                agent_a=speaker, agent_b=target,
                issue=turn.get("content", "")[:80],
                strength=0.7, formed_turn=turn_index,
            )
            self._coalitions.append(c)
        elif action_type == "compromise" and target:
            c = Coalition(
                agent_a=speaker, agent_b=target,
                issue="compromise agreement",
                strength=0.5, formed_turn=turn_index,
            )
            self._coalitions.append(c)

        return self.get_active()

    def get_active(self) -> list[Coalition]:
        return [c for c in self._coalitions if c.is_active]

    def get_by_agent(self, agent_id: str) -> list[Coalition]:
        return [
            c for c in self._coalitions
            if c.is_active and (c.agent_a == agent_id or c.agent_b == agent_id)
        ]

    def dissolve(self, agent_a: str, agent_b: str, turn: int = 0) -> Self:
        for c in self._coalitions:
            if {c.agent_a, c.agent_b} == {agent_a, agent_b} and c.is_active:
                c.is_active = False
        return self

    def decay(self) -> Self:
        for c in self._coalitions:
            if c.is_active:
                c.strength = max(0.0, c.strength - 0.01)
                if c.strength <= 0:
                    c.is_active = False
        return self


def make_detector(graph=None) -> CoalitionDetector:
    return CoalitionDetector(graph)
