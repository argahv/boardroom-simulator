"""Replayable simulation recordings — the input to every evaluation.

A recording is the full ordered event log of one run plus its config and LLM
usage. Turns carry ``prompt_state`` (what the agent was conditioned on) and
``llm`` (parse/latency/token info); floor events carry ``bid_details``; state
snapshots follow every turn (plus one initial snapshot).
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.models import SimulationConfig

SCHEMA_VERSION = 1


class Recording:
    def __init__(self, simulation_id: str, config: SimulationConfig | dict, events: list[dict],
                 usage: dict | None = None, meta: dict | None = None) -> None:
        self.simulation_id = simulation_id
        self.config = config if isinstance(config, SimulationConfig) else SimulationConfig(**config)
        self.events = events
        self.usage = usage or {}
        self.meta = meta or {}

    # ── construction / io ──────────────────────────────────────────

    @classmethod
    def from_context(cls, ctx: Any, meta: dict | None = None) -> "Recording":
        return cls(ctx.simulation_id, ctx.config, list(ctx.space.events), dict(ctx.usage), meta)

    @classmethod
    def load(cls, path: str | os.PathLike) -> "Recording":
        data = json.loads(Path(path).read_text())
        return cls.from_dict(data)

    @classmethod
    def from_dict(cls, data: dict) -> "Recording":
        return cls(data["simulation_id"], data["config"], data["events"], data.get("usage"), data.get("meta"))

    def to_dict(self) -> dict:
        return {
            "schema_version": SCHEMA_VERSION,
            "simulation_id": self.simulation_id,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "config": self.config.model_dump(mode="json"),
            "usage": self.usage,
            "meta": self.meta,
            "events": self.events,
        }

    def save(self, directory: str | os.PathLike) -> Path:
        d = Path(directory)
        d.mkdir(parents=True, exist_ok=True)
        path = d / f"{self.simulation_id}.json"
        path.write_text(json.dumps(self.to_dict(), default=str, indent=1))
        return path

    # ── views ──────────────────────────────────────────────────────

    @property
    def stakeholders(self) -> dict[str, Any]:
        return {s.id: s for s in self.config.stakeholders}

    def name_of(self, agent_id: str | None) -> str:
        s = self.stakeholders.get(agent_id or "")
        return s.name if s else (agent_id or "")

    @property
    def all_turns(self) -> list[dict]:
        return [e for e in self.events if e.get("type") == "turn"]

    @property
    def turns(self) -> list[dict]:
        """Agent-generated turns (human injections excluded)."""
        return [e for e in self.all_turns if not e.get("is_human")]

    @property
    def human_turns(self) -> list[dict]:
        return [e for e in self.all_turns if e.get("is_human")]

    @property
    def snapshots(self) -> list[dict]:
        return [e for e in self.events if e.get("type") == "state_snapshot" and not e.get("initial")]

    @property
    def initial_snapshot(self) -> dict | None:
        for e in self.events:
            if e.get("type") == "state_snapshot" and e.get("initial"):
                return e
        return None

    @property
    def floor_events(self) -> list[dict]:
        return [e for e in self.events if e.get("type") == "system" and e.get("granted_to")]

    @property
    def done(self) -> dict | None:
        for e in reversed(self.events):
            if e.get("type") == "done":
                return e
        return None

    def system(self, subtype: str) -> list[dict]:
        return [e for e in self.events if e.get("type") == "system" and e.get("subtype") == subtype]

    def snapshot_before(self, event: dict) -> dict | None:
        """Latest state snapshot published before ``event``."""
        idx = event.get("_index", 0)
        best = None
        for e in self.events:
            if e.get("type") == "state_snapshot" and e.get("_index", 0) < idx:
                best = e
        return best

    def snapshot_after(self, event: dict) -> dict | None:
        """First state snapshot published after ``event``."""
        idx = event.get("_index", 0)
        for e in self.events:
            if e.get("type") == "state_snapshot" and e.get("_index", 0) > idx:
                return e
        return None
