from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.database import get_database
from app.models import SimulationV2Config
from app.runtime.space import SharedSpace
from app.graph.driver import get_driver, neo4j_enabled
from app.graph.writer import GraphWriter

logger = logging.getLogger(__name__)


class Scheduler:
    """
    Traffic cop for the agent runtime.

    Does NOT decide WHAT agents say, only:
    - Reads bids and grants the floor
    - Validates action types against allowed set
    - Updates shared state (trust, leverage)
    - Checks end condition after each turn
    - Publishes system events (turn start, end condition met, etc.)
    """

    def __init__(self, config: SimulationV2Config, space: SharedSpace, simulation_id: str,
                 behavior_engine: Any = None) -> None:
        self.config = config
        self.space = space
        self.simulation_id = simulation_id
        self.turn_count = 0
        self.behavior_engine = behavior_engine
        self.behavior_engine = behavior_engine

    async def run(self) -> None:
        await self.space.publish({
            "type": "system",
            "content": "Simulation started.",
            "agent_id": "__scheduler__",
            "subject_name": self.config.subject.name,
            "stakeholder_count": len(self.config.stakeholders),
        })

        while self.space.is_running() and not self._end_condition_met():
            self.space.clear_bids()

            # Signal new turn — agents bid in response
            await self.space.publish({
                "type": "system",
                "content": f"Turn {self.turn_count + 1} — agents may bid.",
                "agent_id": "__scheduler__",
            })
            await asyncio.sleep(0.05)

            winner = await self._resolve_next_speaker()

            await self.space.publish({
                "type": "system",
                "content": f"{self._name(winner)} has the floor.",
                "agent_id": "__scheduler__",
                "granted_to": winner,
            })

            await self.space.grant_floor(winner)
            logger.info("Turn %d — %s has the floor", self.turn_count + 1, self._name(winner), extra={"turn": self.turn_count + 1, "speaker": winner, "event": "turn_granted"})

            turn = await self._wait_for_turn(winner, timeout=45.0)
            if turn is None:
                logger.warning("Agent %s timed out, skipping", winner, extra={"agent": winner, "turn": self.turn_count, "event": "agent_timeout"})
                self.space.release_floor()
                self.turn_count += 1
                continue

            self._update_dynamics(turn)

            # Publish state snapshot for frontend real-time dashboards
            if self.behavior_engine is not None:
                public_state = self.behavior_engine.get_public_state()
                await self.space.publish({
                    "type": "state_snapshot",
                    "turn_index": self.turn_count,
                    "data": public_state,
                })
                try:
                    db = get_database()
                    if hasattr(db, 'create_state_snapshot'):
                        await db.create_state_snapshot(self.simulation_id, self.turn_count, json.dumps(public_state), version=1)
                except Exception:
                    pass

            self.turn_count += 1

        end_reason = self._end_reason()
        logger.info("Simulation ended: %s", end_reason, extra={"turn": self.turn_count, "reason": end_reason, "event": "simulation_ended"})
        await self.space.publish({
            "type": "done",
            "agent_id": "__scheduler__",
            "reason": end_reason,
            "total_turns": self.turn_count,
        })
        self.space.shutdown()

    # ── speaker resolution ───────────────────────────────────────────

    async def _resolve_next_speaker(self) -> str:
        mode = self.config.speaker_rules.mode
        if mode == "moderator_led":
            return await self._moderator_decides()
        elif mode == "alternating":
            return await self._alternating_side()
        elif mode == "freeform":
            return await self._freeform()
        else:
            return await self._highest_bid()

    async def _moderator_decides(self) -> str:
        moderators = [s for s in self.config.stakeholders if s.stance == "moderator"]
        if moderators:
            # If multiple moderators, cycle through them
            if len(moderators) > 1:
                return moderators[self.turn_count % len(moderators)].id
            # Single moderator: moderator goes first each round, then cycle all other agents
            all_ids = [s.id for s in self.config.stakeholders]
            mod_id = moderators[0].id
            others = [s for s in all_ids if s != mod_id]
            if not others:
                return mod_id
            # Turn 0 = moderator, then cycle through others
            if self.turn_count == 0:
                return mod_id
            # Moderator re-enters every 4th turn
            cycle_pos = (self.turn_count - 1) % (len(others) + 1)
            if cycle_pos < len(others):
                return others[cycle_pos]
            return mod_id
        return await self._highest_bid()

    async def _alternating_side(self) -> str:
        champions = [s.id for s in self.config.stakeholders if s.stance == "champion"]
        detractors = [s.id for s in self.config.stakeholders if s.stance == "detractor"]
        neutrals = [s.id for s in self.config.stakeholders if s.stance not in ("champion", "detractor")]

        if self.turn_count % 2 == 0:
            pool = champions or neutrals or detractors or [s.id for s in self.config.stakeholders]
        else:
            pool = detractors or neutrals or champions or [s.id for s in self.config.stakeholders]

        idx = (self.turn_count // 2) % len(pool)
        return pool[idx]

    async def _freeform(self) -> str:
        try:
            return await asyncio.wait_for(self.space.resolve_bid(), timeout=10.0)
        except asyncio.TimeoutError:
            pool = [s.id for s in self.config.stakeholders]
            return pool[self.turn_count % len(pool)]

    async def _highest_bid(self) -> str:
        try:
            return await asyncio.wait_for(self.space.resolve_bid(), timeout=8.0)
        except asyncio.TimeoutError:
            pool = [s.id for s in self.config.stakeholders]
            return pool[self.turn_count % len(pool)]

    # ── turn validation ──────────────────────────────────────────────

    async def _wait_for_turn(self, agent_id: str, timeout: float) -> dict | None:
        known = self.space._version
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            if self.space._version > known:
                for event in self.space.events[self._last_index():]:
                    if event.get("type") == "turn" and event.get("agent_id") == agent_id:
                        return event
                known = self.space._version
            await asyncio.sleep(0.1)
        return None

    def _last_index(self) -> int:
        return len(self.space.events) - 1 if self.space.events else 0

    # ── dynamics ─────────────────────────────────────────────────────

    def _update_dynamics(self, turn: dict) -> None:
        action_type = turn.get("action_type", "statement")

        if self.behavior_engine is not None:
            be_turn = {
                "agent_id": turn.get("agent_id", ""),
                "action_type": action_type,
                "target_id": turn.get("directed_at", None),
                "speaker_id": turn.get("agent_id", ""),
                "target": turn.get("directed_at", ""),
            }
            self.behavior_engine.process_turn(be_turn)
            self.behavior_engine.tick()

        try:
            if neo4j_enabled():
                driver = get_driver()
                if driver:
                    writer = GraphWriter(driver)
                    loop = asyncio.get_event_loop()
                    loop.create_task(
                        asyncio.to_thread(
                            writer.write_turn,
                            self._make_v2_sim_state(),
                            self._make_v2_turn(turn),
                        )
                    )
        except Exception:
            logger.debug("Neo4j write skipped for turn %d", self.turn_count, extra={"turn": self.turn_count, "event": "neo4j_write_skipped"})

    # ── end conditions ────────────────────────────────────────────────

    def _end_condition_met(self) -> bool:
        from app.models import VoteCondition, TimeoutCondition, JudgeCondition

        ec = self.config.end_condition
        if isinstance(ec, VoteCondition):
            return self._check_vote(ec)
        elif isinstance(ec, TimeoutCondition):
            return self._check_timeout(ec)
        elif isinstance(ec, JudgeCondition):
            return self._check_judge(ec)
        return self.turn_count >= 20

    def _check_vote(self, cond: "VoteCondition") -> bool:
        if self.turn_count < 3:
            return False
        if self.turn_count >= cond.max_turns:
            return True
        return self.turn_count >= cond.max_turns

    def _check_timeout(self, cond: "TimeoutCondition") -> bool:
        return self.turn_count >= cond.max_normal_turns

    def _check_judge(self, cond: "JudgeCondition") -> bool:
        return False

    def _end_reason(self) -> str:
        ec = self.config.end_condition
        from app.models import VoteCondition, TimeoutCondition, JudgeCondition

        if isinstance(ec, VoteCondition):
            return f"Vote ended after {ec.max_turns} turns"
        elif isinstance(ec, TimeoutCondition):
            return f"Timeout after {ec.max_normal_turns} turns"
        elif isinstance(ec, JudgeCondition):
            return f"Judge ({ec.judge_id}) deliberation complete"
        return "Simulation ended"

    def _name(self, agent_id: str) -> str:
        for s in self.config.stakeholders:
            if s.id == agent_id:
                return s.name
        return agent_id

    def _make_v2_sim_state(self):
        from app.models import SimulationState, SimulationCreate
        from datetime import datetime
        sc = SimulationCreate(
            background=self.config.subject.name,
            primary_goal=self.config.subject.description or "",
            voltage=self.config.voltage,
        )
        return SimulationState(
            simulation_id=self.simulation_id,
            status="running",
            config=sc,
            turns=[],
            heatmap=None,
            sentiment=[],
            leaderboard=[],
            trust_matrix={},
            leverage_scores={},
            event_log=[],
            coalitions=[],
            leverage_shifts=[],
            active_speaker_id=None,
            deadlock_risk_score=0,
            created_at=datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat(),
        )

    def _make_v2_turn(self, turn: dict):
        from app.models import Turn
        return Turn(
            turn_index=turn.get("turn_index", self.turn_count),
            stakeholder_id=turn.get("agent_id", ""),
            stakeholder_name=turn.get("agent_name", turn.get("speaker", "")),
            role=turn.get("role", ""),
            content=turn.get("content", ""),
            action_type=turn.get("action_type", "statement"),
            internal_reasoning=turn.get("internal_reasoning", ""),
            is_human=False,
            directed_at=None,
            coalition_with=None,
        )
