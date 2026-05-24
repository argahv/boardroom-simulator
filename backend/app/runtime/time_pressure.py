class TimePressure:
    def __init__(self):
        self._pressure = 0.0

    def tick(self, total_turns: int, max_turns: int) -> float:
        ratio = total_turns / max_turns if max_turns > 0 else 0
        self._pressure = min(1.0, max(0.0, ratio * 1.5))
        return self._pressure

    def get_pressure(self) -> float:
        return self._pressure

    def should_escalate(self) -> bool:
        return self._pressure > 0.8

def make_time_pressure():
    return TimePressure()