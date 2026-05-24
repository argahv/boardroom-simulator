from __future__ import annotations

class InterruptionManager:
    def __init__(self):
        self._interrupts = {}

    def can_interrupt(self, agent_id: str, urgency: float, current_speaker: str) -> bool:
        return urgency > 75 and agent_id != current_speaker

    def record(self, agent_id: str, target: str, turn: int) -> None:
        self._interrupts.setdefault(agent_id, []).append({"target": target, "turn": turn})

    def count_by(self, agent_id: str) -> int:
        return len(self._interrupts.get(agent_id, []))

def make_interruption_manager():
    return InterruptionManager()