class TrustLeveragePanel:
    def __init__(self):
        self._metrics = {}

    def update(self, agent_id: str, trust: float, leverage: float, turn: int) -> None:
        self._metrics[agent_id] = {'trust': trust, 'leverage': leverage, 'turn': turn}

    def get_state(self) -> dict:
        return dict(self._metrics)