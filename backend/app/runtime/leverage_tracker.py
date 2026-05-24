class LeverageTracker:
    def __init__(self):
        self._scores = {}

    def update(self, agent_id: str, delta: int, turn: int) -> dict:
        self._scores[agent_id] = {"score": max(0, min(100, self._scores.get(agent_id, {}).get("score", 50) + delta)), "turn": turn}
        return self._scores[agent_id]

    def get(self, agent_id: str) -> dict:
        return self._scores.get(agent_id, {"score": 50, "turn": 0})

    def all(self) -> dict:
        return dict(self._scores)

def make_leverage_tracker():
    return LeverageTracker()