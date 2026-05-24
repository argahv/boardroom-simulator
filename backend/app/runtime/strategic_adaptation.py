class StrategicAdaptation:
    def __init__(self):
        self._adaptations = {}

    def evaluate(self, agent_id: str, outcome: str) -> dict:
        if outcome == "won":
            delta = {"aggressiveness": -5, "empathy": 5}
        elif outcome == "lost":
            delta = {"aggressiveness": 10, "stubbornness": 10}
        else:
            delta = {}
        self._adaptations[agent_id] = delta
        return delta

    def get_adjustment(self, agent_id: str) -> dict:
        return self._adaptations.get(agent_id, {})

def make_adaptation():
    return StrategicAdaptation()