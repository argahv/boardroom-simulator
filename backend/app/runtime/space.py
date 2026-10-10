from __future__ import annotations

import asyncio
import logging
import time
from typing import AsyncIterator

logger = logging.getLogger(__name__)

from app.models import SimulationConfig


class SharedSpace:
    """
    Event-sourced message board. Single source of truth for all agents.

    - events: append-only log of public events (turns, system announcements, end)
    - bid_queue: agents submit bids here; scheduler reads and resolves
    - current_speaker: who holds the floor (set by scheduler)
    - _version: monotonic counter — increments on every state change
      so agents can wait for "something new" without polling.
    """

    def __init__(self, config: SimulationConfig) -> None:
        self.config = config
        self.events: list[dict] = []
        self._event_condition = asyncio.Condition()
        self._bid_queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self._running = True
        self.current_speaker: str | None = None
        self.floor_token = 0  # increments on every grant so an agent speaks once per grant
        self.trace_parent = None  # LangSmith run of the current turn; agents' LLM calls nest under it
        self._version = 0
        # Bidding rounds: the scheduler opens a round, agents bid once per round.
        self.bid_round = 0
        self._round_bids: dict[str, int] = {}
        self.round_bid_details: dict[str, dict] = {}
        self._bid_signal = asyncio.Event()
        # Agents that walked out of the room no longer bid or speak.
        self.departed: set[str] = set()

    # ── lifecycle ────────────────────────────────────────────────────

    def is_running(self) -> bool:
        return self._running

    def shutdown(self) -> None:
        self._running = False

    # ── event publishing ─────────────────────────────────────────────

    async def publish(self, event: dict) -> None:
        """Append a public event and wake all listeners."""
        async with self._event_condition:
            event["_index"] = len(self.events)
            event["_timestamp"] = time.time()
            self.events.append(event)
            self._version += 1
            self._event_condition.notify_all()
        logger.debug("Event published: type=%s", event.get("type", "unknown"), extra={"event_type": event.get("type", "unknown"), "event": "published"})

    # ── floor control ────────────────────────────────────────────────

    async def grant_floor(self, agent_id: str) -> None:
        """Grant speaking turn to an agent. Wakes all waiters."""
        async with self._event_condition:
            self.current_speaker = agent_id
            self.floor_token += 1
            self._version += 1
            self._event_condition.notify_all()

    def release_floor(self) -> None:
        """Called by scheduler after a turn completes."""
        self.current_speaker = None

    # ── human injection ───────────────────────────────────────────────

    async def inject_turn(self, speaker_name: str, content: str, agent_id: str | None = None,
                          action_type: str = "statement", directed_at: str | None = None) -> dict:
        turn = {
            "type": "turn",
            "turn_index": len([e for e in self.events if e.get("type") == "turn"]),
            "speaker": speaker_name,
            "agent_name": speaker_name,
            "content": content,
            "action_type": action_type,
            "is_human": True,
        }
        if agent_id:
            turn["agent_id"] = agent_id
        if directed_at:
            turn["directed_at"] = directed_at
        await self.publish(turn)
        return turn

    # ── bidding ──────────────────────────────────────────────────────

    def submit_bid(self, agent_id: str, urgency: int, bid_round: int | None = None,
                   details: dict | None = None) -> None:
        if agent_id in self.departed:
            return
        if bid_round is not None and bid_round != self.bid_round:
            return  # stale bid from an earlier round
        self._bid_queue.put_nowait((-urgency, agent_id))
        self._round_bids[agent_id] = urgency
        if details is not None:
            self.round_bid_details[agent_id] = details
        self._bid_signal.set()

    async def open_bidding(self, content: str, **extra) -> int:
        """Start a new bidding round and announce it. Returns the round number."""
        self.clear_bids()
        self.bid_round += 1
        await self.publish({"type": "system", "content": content, "agent_id": "__scheduler__",
                            "bid_round": self.bid_round, **extra})
        return self.bid_round

    async def collect_bids(self, expected: set[str], timeout: float) -> dict[str, int]:
        """Wait until every expected agent has bid this round (or timeout).

        Returns {agent_id: urgency} for the bids received.
        """
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        expected = set(expected) - self.departed
        while not expected.issubset(self._round_bids.keys()):
            remaining = deadline - loop.time()
            if remaining <= 0 or not self._running:
                break
            self._bid_signal.clear()
            try:
                await asyncio.wait_for(self._bid_signal.wait(), timeout=remaining)
            except asyncio.TimeoutError:
                break
        return dict(self._round_bids)

    async def resolve_bid(self) -> str:
        """Pop the highest-urgency bid. Blocks until at least one bid."""
        _, agent_id = await self._bid_queue.get()
        return agent_id

    def clear_bids(self) -> None:
        self._round_bids = {}
        self.round_bid_details = {}
        while not self._bid_queue.empty():
            try:
                self._bid_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    # ── blocking read for agents ─────────────────────────────────────

    async def wait_for_change(self, known_version: int) -> int:
        """Block until version > known_version or shutdown. Returns new version."""
        async with self._event_condition:
            while self._version <= known_version and self._running:
                await self._event_condition.wait()
            return self._version

    # ── streaming for SSE ────────────────────────────────────────────

    async def stream(self) -> AsyncIterator[dict]:
        """Yield every event that appears, live, for SSE output."""
        index = 0
        while self._running or index < len(self.events):
            while index < len(self.events):
                yield self.events[index]
                index += 1
            await asyncio.sleep(0.05)
