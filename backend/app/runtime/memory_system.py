from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Self


@dataclass
class Event:
    type: str
    agent_id: str
    content: str
    importance: float = 0.0
    timestamp: float = 0.0
    metadata: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.importance == 0.0:
            self.importance = _score_importance(self.type)
        if self.timestamp == 0.0:
            self.timestamp = time.time()


_IMPORTANCE_MAP: dict[str, float] = {
    "challenge": 0.8,
    "escalate": 0.9,
    "compromise": 0.7,
    "coalition_signal": 0.75,
    "interrupt": 0.6,
    "statement": 0.3,
    "question": 0.3,
    "system": 0.1,
}

_AGENT_STANCE_PATTERNS: tuple[str, ...] = (
    "believe", "think", "oppose", "support", "agree",
    "disagree", "position", "stance",
)

_RED_LINE_PATTERNS: tuple[str, ...] = (
    "never", "cannot", "red line", "under no circumstances",
    "will not", "won't", "refuse",
)


def _score_importance(event_type: str) -> float:
    return _IMPORTANCE_MAP.get(event_type, 0.3)


class EpisodicMemory:
    def __init__(self, capacity: int = 50) -> None:
        self._capacity = capacity
        self._buffers: dict[str, deque[Event]] = defaultdict(
            lambda: deque(maxlen=capacity)
        )

    @property
    def capacity(self) -> int:
        return self._capacity

    def add_event(
        self,
        agent_id: str,
        type: str,
        content: str,
        metadata: dict | None = None,
    ) -> Event:
        event = Event(
            type=type,
            agent_id=agent_id,
            content=content,
            metadata=metadata or {},
        )
        self._buffers[agent_id].append(event)
        return event

    def get_recent(self, agent_id: str, n: int = 10) -> list[Event]:
        buf = self._buffers.get(agent_id, deque())
        return list(buf)[-n:]

    def get_important(
        self, agent_id: str, threshold: float = 0.7
    ) -> list[Event]:
        buf = self._buffers.get(agent_id, deque())
        return [e for e in buf if e.importance >= threshold]

    def clear(self, agent_id: str | None = None) -> None:
        if agent_id is None:
            self._buffers.clear()
        else:
            self._buffers.pop(agent_id, None)

    def __len__(self) -> int:
        return sum(len(b) for b in self._buffers.values())

    def count(self, agent_id: str) -> int:
        return len(self._buffers.get(agent_id, deque()))


class SemanticMemory:
    def __init__(self) -> None:
        self._summaries: dict[str, dict[str, list[str]]] = defaultdict(
            lambda: {
                "positions": [],
                "concessions": [],
                "red_lines": [],
                "alliances_formed": [],
            }
        )

    def extract_semantics(self, event: Event) -> None:
        agent_id = event.agent_id
        summ = self._summaries[agent_id]
        content_lower = event.content.lower()

        if event.type == "compromise":
            if event.content not in summ["concessions"]:
                summ["concessions"].append(event.content)

        for pat in _AGENT_STANCE_PATTERNS:
            if pat in content_lower:
                if event.content not in summ["positions"]:
                    summ["positions"].append(event.content)
                break

        for pat in _RED_LINE_PATTERNS:
            if pat in content_lower:
                if event.content not in summ["red_lines"]:
                    summ["red_lines"].append(event.content)
                break

        if event.type == "coalition_signal":
            target = event.metadata.get("target", "")
            if target and target not in summ["alliances_formed"]:
                summ["alliances_formed"].append(target)

    def get_summary(self, agent_id: str) -> dict[str, list[str]]:
        return dict(self._summaries.get(agent_id, {
            "positions": [],
            "concessions": [],
            "red_lines": [],
            "alliances_formed": [],
        }))

    def clear(self, agent_id: str | None = None) -> None:
        if agent_id is None:
            self._summaries.clear()
        else:
            self._summaries.pop(agent_id, None)


class MemorySystem:
    def __init__(self, episodic: EpisodicMemory, semantic: SemanticMemory) -> None:
        self.episodic = episodic
        self.semantic = semantic

    def add_event(self, agent_id: str, event_dict: dict) -> Self:
        event = self.episodic.add_event(
            agent_id=agent_id,
            type=event_dict.get("type", "statement"),
            content=event_dict.get("content", ""),
            metadata=event_dict.get("metadata"),
        )
        self.semantic.extract_semantics(event)
        return self

    def get_context(
        self, agent_id: str, n: int = 10, importance_threshold: float = 0.7
    ) -> dict:
        return {
            "recent_events": self.episodic.get_recent(agent_id, n=n),
            "important_events": self.episodic.get_important(
                agent_id, threshold=importance_threshold
            ),
            "semantic_summary": self.semantic.get_summary(agent_id),
        }

    def get_recent(self, agent_id: str, n: int = 10) -> list[Event]:
        return self.episodic.get_recent(agent_id, n=n)

    def get_important(
        self, agent_id: str, threshold: float = 0.7
    ) -> list[Event]:
        return self.episodic.get_important(agent_id, threshold=threshold)

    def get_summary(self, agent_id: str) -> dict[str, list[str]]:
        return self.semantic.get_summary(agent_id)

    def clear(self, agent_id: str | None = None) -> None:
        self.episodic.clear(agent_id)
        self.semantic.clear(agent_id)


def make_memory_system(capacity: int = 50) -> MemorySystem:
    return MemorySystem(
        episodic=EpisodicMemory(capacity=capacity),
        semantic=SemanticMemory(),
    )
