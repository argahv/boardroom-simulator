class ModeratorAI:
    def __init__(self, scheduler=None):
        self._scheduler = scheduler

    def select_speaker(self, bids: list[tuple[str, int]], state: dict = None) -> str:
        if not bids:
            return ""
        if state:
            tension = state.get("social_physics", {}).get("tension", 0) if isinstance(state, dict) else 0
            if tension > 0.7:
                neutrals = [a for a, _ in bids if a in state.get("rivals", [])]
                if neutrals:
                    return neutrals[0]
        return max(bids, key=lambda x: x[1])[0]

    def summarize(self, turn_history: list[dict]) -> str:
        if not turn_history:
            return "No discussion yet."
        top = turn_history[-1].get("content", "")[:80]
        return f"Latest: {top}..."

def make_moderator(scheduler=None):
    return ModeratorAI(scheduler)