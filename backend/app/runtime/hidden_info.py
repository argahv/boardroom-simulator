from __future__ import annotations

from typing import Self


class HiddenInformation:
    def __init__(self):
        self._secrets: dict[str, list[dict]] = {}
        
    def reveal(self, agent_id: str, info: dict) -> Self:
        if agent_id not in self._secrets:
            self._secrets[agent_id] = []
        self._secrets[agent_id].append({
            "info": info.get("info", ""),
            "revealed_to": info.get("revealed_to", None),
            "turn": info.get("turn", 0),
            "credibility": info.get("credibility", 0.5),
        })
        return self
        
    def known_by(self, agent_id: str, observer: str | None) -> list[dict]:
        secrets = self._secrets.get(agent_id, [])
        if observer is None:
            return list(secrets)
        return [s for s in secrets if s["revealed_to"] == observer or s["revealed_to"] is None]
        
    def share(self, from_agent: str, to_agent: str, info_index: int = -1) -> Self:
        secrets = self._secrets.get(from_agent, [])
        if not secrets:
            return self
        s = secrets[info_index]
        s["revealed_to"] = to_agent
        from_agent
        return self


def make_hidden_info():
    return HiddenInformation()