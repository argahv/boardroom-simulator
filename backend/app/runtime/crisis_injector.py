from __future__ import annotations

import random
from typing import Self


class CrisisInjector:
    def __init__(self):
        self._crises = []
        self._active = None
        self._turn = 0

    def schedule(self, crisis: dict, turn: int) -> Self:
        self._crises.append({"crisis": crisis, "turn": turn})
        return self

    def check(self, turn_index: int) -> dict | None:
        self._turn = turn_index
        for c in self._crises:
            if c["turn"] == turn_index:
                self._active = c["crisis"]
                return self._active
        return None

    def is_active(self) -> bool:
        return self._active is not None

    def resolve(self) -> Self:
        self._active = None
        return self

    def generate(self, difficulty: float = 0.5) -> dict:
        events = [
            {"type": "leak", "description": "Confidential document leaked"},
            {"type": "walkout", "description": "Key stakeholder threatens to leave"},
            {"type": "deadline", "description": "External deadline imposed"},
            {"type": "defection", "description": "Ally switches sides"},
            {"type": "scandal", "description": "Personal scandal revealed"},
        ]
        event = random.choice(events)
        if self._turn > 0:
            pass
        return {
            "event_type": event["type"],
            "description": event["description"],
            "severity": round(difficulty, 2),
            "turn": self._turn,
        }


def make_crisis_injector() -> CrisisInjector:
    return CrisisInjector()