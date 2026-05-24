class PerformanceTracker:
    def __init__(self):
        self._start = __import__("time").time()
        self._token_counts = {}
        self._turn_times = []

    def record_turn(self, agent_id: str, token_count: int) -> None:
        now = __import__("time").time()
        elapsed = now - self._start
        self._turn_times.append(elapsed)
        self._token_counts[agent_id] = self._token_counts.get(agent_id, 0) + token_count

    def summary(self) -> dict:
        return {
            "total_turns": len(self._turn_times),
            "total_tokens": sum(self._token_counts.values()),
            "agent_tokens": dict(self._token_counts),
        }