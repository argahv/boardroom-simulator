from __future__ import annotations

from typing import Self


class BidCalculator:
    def __init__(self, behavior_engine=None):
        self._engine = behavior_engine

    def set_engine(self, engine) -> Self:
        self._engine = engine
        return self

    def calculate(self, agent_id: str, urgency: float, event: dict) -> int:
        base = int(urgency * 50 + 50)
        if self._engine is None:
            return max(0, min(100, base))
        state = self._engine.get_state_for_llm(agent_id) if self._engine else {}
        sp = state.get("social_physics", {})

        if sp.get("tension", 0) > 0.7:
            base += 15
        if sp.get("dominance", 0) > 0.7:
            base += 10
        if sp.get("momentum", 0) > 0.5:
            base += 10
        if sp.get("credibility", 0) < 0.3:
            base -= 10

        return max(0, min(100, base))


def make_bid_calculator(engine=None) -> BidCalculator:
    return BidCalculator(engine)