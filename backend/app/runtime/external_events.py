import random

class ExternalEventInjector:
    def __init__(self):
        self._events = []
        self._active = None

    def add_event(self, event: dict, turn: int) -> None:
        self._events.append({"event": event, "turn": turn})

    def check(self, turn_index: int) -> dict | None:
        for e in self._events:
            if e["turn"] == turn_index:
                self._active = e["event"]
                return self._active
        return None

    def random_event(self, turn_index: int) -> dict:
        templates = [
            {"type": "news", "content": "Market shift reported"},
            {"type": "regulation", "content": "New regulation announced"},
            {"type": "leak", "content": "Internal document leaked"},
        ]
        event = random.choice(templates)
        event["turn"] = turn_index
        return event

def make_injector():
    return ExternalEventInjector()