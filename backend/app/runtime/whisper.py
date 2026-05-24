class WhisperChannel:
    def __init__(self):
        self._messages = []

    def send(self, from_agent: str, to_agent: str, content: str, turn: int = 0) -> dict:
        msg = {"from": from_agent, "to": to_agent, "content": content, "turn": turn}
        self._messages.append(msg)
        return msg

    def receive(self, agent_id: str) -> list[dict]:
        return [m for m in self._messages if m["to"] == agent_id]

    def channel_history(self) -> list[dict]:
        return list(self._messages)

def make_whisper_channel():
    return WhisperChannel()