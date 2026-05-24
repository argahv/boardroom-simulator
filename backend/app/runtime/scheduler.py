from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.database import get_database
from app.models import (
    SimulationV2Config, VoteCondition, TimeoutCondition,
    JudgeCondition, ConsensusCondition, HybridCondition,
    TerminationResult,
)
from app.runtime.space import SharedSpace
from app.graph.driver import get_driver, neo4j_enabled
from app.graph.writer import GraphWriter
from app.runtime.postmortem_generator import PostmortemGenerator

logger = logging.getLogger(__name__)

# ── Termination Checker Protocol ──────────────────────────────────────

class TerminationContext:
    """Context passed to each checker for evaluation."""
    def __init__(self, config: SimulationV2Config, space: SharedSpace,
                 turn_count: int, behavior_engine: Any = None) -> None:
        self.config = config
        self.space = space
        self.turn_count = turn_count
        self.behavior_engine = behavior_engine


class BaseChecker:
    """Base class for termination checkers. Each subclass implements check()."""
    async def check(self, ctx: TerminationContext) -> TerminationResult | None:
        raise NotImplementedError


class TimeoutChecker(BaseChecker):
    """Safety net: always active. Triggers when turn_count >= configured max."""
    def __init__(self, condition: TimeoutCondition) -> None:
        self.condition = condition

    async def check(self, ctx: TerminationContext) -> TerminationResult | None:
        if ctx.turn_count >= self.condition.max_normal_turns:
            return TerminationResult(
                reason="timeout",
                outcome_type="no_decision",
                summary=f"Reached {self.condition.max_normal_turns} turn limit without conclusion.",
                total_turns=ctx.turn_count,
            )
        return None


class VoteChecker(BaseChecker):
    """Tally agent votes from action_type='vote'. Triggers when threshold met."""
    def __init__(self, condition: VoteCondition) -> None:
        self.condition = condition

    async def check(self, ctx: TerminationContext) -> TerminationResult | None:
        if ctx.turn_count < 3:
            return None

        # Scan events for vote actions FIRST (before max_turns check)
        vote_tally: dict[str, int] = {}
        for event in ctx.space.events:
            if event.get("type") == "turn" and event.get("action_type") == "vote":
                content = event.get("content", "")
                agent = event.get("agent_id", "")
                if agent not in self.condition.voters:
                    continue
                position = self._extract_vote_position(content)
                if position:
                    vote_tally[position] = vote_tally.get(position, 0) + 1

        total_voters = len(self.condition.voters)
        for position, count in vote_tally.items():
            if total_voters > 0 and count / total_voters >= self.condition.threshold:
                return TerminationResult(
                    reason="vote_majority",
                    outcome_type="agreement",
                    summary=f"Motion carried {count}-{total_voters - count}: {position}.",
                    confidence=count / total_voters,
                    total_turns=ctx.turn_count,
                    vote_breakdown={
                        "for": count,
                        "against": total_voters - count,
                        "abstain": 0,
                    },
                    agreed_issues=[{"position": position}],
                )

        # Hard cap fallback: check AFTER vote tally
        if ctx.turn_count >= self.condition.max_turns:
            return TerminationResult(
                reason="vote_majority",
                outcome_type="no_decision",
                summary=f"Vote period ended after {self.condition.max_turns} turns without majority.",
                total_turns=ctx.turn_count,
            )

        return None

    def _extract_vote_position(self, content: str) -> str | None:
        """Extract what the agent voted for from content. Simple keyword matching."""
        lower = content.lower()
        for keyword in ["yes", "aye", "support", "in favor", "approve", "agree"]:
            if keyword in lower:
                return "yes"
        for keyword in ["no", "nay", "oppose", "against", "reject", "disagree"]:
            if keyword in lower:
                return "no"
        for keyword in ["abstain", "pass"]:
            if keyword in lower:
                return "abstain"
        return None


class SocialPhysicsChecker(BaseChecker):
    """Monitor behavior engine trust/tension for agreement or deadlock signals."""
    SENSITIVITY_MAP = {
        "diplomatic": {"trust_threshold": 0.85, "tension_low": 0.12, "tension_high": 0.90, "trust_low": 0.15},
        "balanced":   {"trust_threshold": 0.75, "tension_low": 0.20, "tension_high": 0.85, "trust_low": 0.20},
        "sensitive":  {"trust_threshold": 0.65, "tension_low": 0.30, "tension_high": 0.80, "trust_low": 0.25},
    }

    def __init__(self, condition: ConsensusCondition) -> None:
        self.condition = condition
        self._consecutive_deadlock = 0
        self._consecutive_agreement = 0

    async def check(self, ctx: TerminationContext) -> TerminationResult | None:
        if ctx.behavior_engine is None or ctx.turn_count < 3:
            return None

        sens = self.SENSITIVITY_MAP.get(self.condition.sensitivity, self.SENSITIVITY_MAP["balanced"])
        state = ctx.behavior_engine.get_public_state()
        sp_entries = state.get("social_physics", {})

        if not sp_entries:
            return None

        avg_trust = sum(s.get("trust", 0.5) for s in sp_entries.values()) / len(sp_entries)
        avg_tension = sum(s.get("tension", 0.3) for s in sp_entries.values()) / len(sp_entries)

        mode = self.condition.detection_mode
        if mode in ("both", "agreement_only"):
            if avg_trust >= sens["trust_threshold"] and avg_tension <= sens["tension_low"]:
                self._consecutive_agreement += 1
                if self._consecutive_agreement >= 3:
                    return TerminationResult(
                        reason="consensus",
                        outcome_type="agreement",
                        summary=f"Social consensus detected: trust={avg_trust:.2f}, tension={avg_tension:.2f}.",
                        confidence=avg_trust,
                        total_turns=ctx.turn_count,
                    )
            else:
                self._consecutive_agreement = 0

        if mode in ("both", "deadlock_only"):
            if avg_tension >= sens["tension_high"] or avg_trust <= sens["trust_low"]:
                self._consecutive_deadlock += 1
                if self._consecutive_deadlock >= 5:
                    # Find walkaway party if any
                    walkaway = self._find_walkaway(ctx)
                    return TerminationResult(
                        reason="deadlock_walkaway",
                        outcome_type="walkaway",
                        summary=f"Deadlock detected: tension={avg_tension:.2f}, trust={avg_trust:.2f}.",
                        total_turns=ctx.turn_count,
                        walkaway_party=walkaway,
                    )
            else:
                self._consecutive_deadlock = 0

        return None

    def _find_walkaway(self, ctx: TerminationContext) -> str | None:
        """Find which agent triggered walkaway, if any."""
        for event in reversed(ctx.space.events):
            if event.get("type") == "turn" and event.get("action_type") == "walkaway":
                return event.get("agent_id", event.get("speaker", ""))
        return None


class JudgeChecker(BaseChecker):
    """Periodically ask a judge LLM to evaluate the negotiation."""
    def __init__(self, condition: JudgeCondition, llm: Any = None) -> None:
        self.condition = condition
        self.llm = llm
        self._last_judge_turn = 0

    async def check(self, ctx: TerminationContext) -> TerminationResult | None:
        from app.llm import openrouter_completion, parse_json_object

        evaluate_every = max(3, ctx.turn_count // 3)
        if ctx.turn_count - self._last_judge_turn < evaluate_every:
            return None

        self._last_judge_turn = ctx.turn_count

        # Get recent transcript
        recent_events = ctx.space.events[-10:]
        transcript = "\n".join(
            f"{e.get('turn_index', i)}. {e.get('speaker', e.get('agent_id', '?'))}: {e.get('content', '')}"
            for i, e in enumerate(recent_events) if e.get("type") == "turn"
        ) or "No recent turns."

        criteria_str = "\n".join(f"- {c}" for c in self.condition.criteria) or "- Has a fair compromise been reached?"

        judge_prompt = [
            {"role": "system", "content": (
                "You are an impartial judge evaluating a boardroom negotiation. "
                "Assess whether the parties have reached a genuine agreement, "
                "are at an impasse, or need more time.\n\n"
                f"Your evaluation criteria:\n{criteria_str}\n\n"
                "Return a JSON object with:\n"
                '{"verdict": "agreement" | "impasse" | "continue", '
                '"reasoning": "brief explanation", '
                '"criteria_evaluations": {criteria: "assessment"}}'
            )},
            {"role": "user", "content": (
                f"Recent transcript (turn {ctx.turn_count}):\n{transcript}"
            )},
        ]

        try:
            text, mocked, metadata = await openrouter_completion(
                judge_prompt, temperature=0.3, simulation_id="judge_check",
            )
            payload = parse_json_object(text) if text else {}
            verdict = payload.get("verdict", "continue")
            reasoning = payload.get("reasoning", "")

            if verdict == "agreement":
                return TerminationResult(
                    reason="judge_verdict",
                    outcome_type="judge_ruling",
                    summary=f"Judge declares: agreement reached. {reasoning}",
                    total_turns=ctx.turn_count,
                    judge_notes=reasoning,
                )
            elif verdict == "impasse":
                return TerminationResult(
                    reason="judge_verdict",
                    outcome_type="impasse",
                    summary=f"Judge declares: impasse. {reasoning}",
                    total_turns=ctx.turn_count,
                    judge_notes=reasoning,
                )
        except Exception as exc:
            logger.warning("Judge LLM call failed: %s", exc)

        return None


class EndConditionRegistry:
    """Builds the list of active checkers from the simulation config."""

    @staticmethod
    def build_checkers(config: SimulationV2Config, llm: Any = None) -> list[BaseChecker]:
        checkers: list[BaseChecker] = []
        ec = config.end_condition

        if isinstance(ec, TimeoutCondition):
            checkers.append(TimeoutChecker(ec))
        elif isinstance(ec, VoteCondition):
            checkers.append(VoteChecker(ec))
            checkers.append(TimeoutChecker(TimeoutCondition(max_normal_turns=ec.max_turns)))
        elif isinstance(ec, JudgeCondition):
            checkers.append(JudgeChecker(ec, llm=llm))
            checkers.append(TimeoutChecker(TimeoutCondition(max_normal_turns=30)))
        elif isinstance(ec, ConsensusCondition):
            checkers.append(SocialPhysicsChecker(ec))
            checkers.append(TimeoutChecker(TimeoutCondition(max_normal_turns=ec.max_turns)))
        elif isinstance(ec, HybridCondition):
            for sub in ec.conditions:
                if isinstance(sub, VoteCondition):
                    checkers.append(VoteChecker(sub))
                elif isinstance(sub, ConsensusCondition):
                    checkers.append(SocialPhysicsChecker(sub))
                elif isinstance(sub, JudgeCondition):
                    checkers.append(JudgeChecker(sub, llm=llm))
            checkers.append(TimeoutChecker(TimeoutCondition(max_normal_turns=ec.max_turns)))
        else:
            # Fallback
            checkers.append(TimeoutChecker(TimeoutCondition(max_normal_turns=20)))

        return checkers


# ═══════════════════════════════════════════════════════════════════════
# Scheduler
# ═══════════════════════════════════════════════════════════════════════

class Scheduler:
    """
    Traffic cop for the agent runtime.

    - Reads bids and grants the floor
    - Validates action types against allowed set
    - Updates shared state (trust, leverage)
    - Checks end condition via checkers after each turn
    - Publishes system events
    """

    def __init__(self, config: SimulationV2Config, space: SharedSpace, simulation_id: str,
                 behavior_engine: Any = None) -> None:
        self.config = config
        self.space = space
        self.simulation_id = simulation_id
        self.turn_count = 0
        self.behavior_engine = behavior_engine
        self._termination_result: TerminationResult | None = None
        self._checkers = EndConditionRegistry.build_checkers(config)

    async def run(self) -> None:
        await self.space.publish({
            "type": "system",
            "content": "Simulation started.",
            "agent_id": "__scheduler__",
            "subject_name": self.config.subject.name,
            "stakeholder_count": len(self.config.stakeholders),
        })

        while self.space.is_running():
            self.space.clear_bids()

            # Check termination BEFORE processing next turn
            result = await self._check_all()
            if result is not None:
                self._termination_result = result
                break

            # Signal new turn
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

            # Publish state snapshot
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

            # Check termination AFTER turn
            result = await self._check_all()
            if result is not None:
                self._termination_result = result
                break

        # ── handle termination ─────────────────────────────────────
        if self._termination_result is None:
            self._termination_result = TerminationResult(
                reason="timeout", outcome_type="no_decision",
                summary="Simulation ended.", total_turns=self.turn_count,
            )

        tr = self._termination_result
        tr.total_turns = self.turn_count

        logger.info("Simulation ended: reason=%s outcome=%s turns=%d",
                     tr.reason, tr.outcome_type, self.turn_count,
                     extra={"reason": tr.reason, "outcome": tr.outcome_type, "turn": self.turn_count, "event": "simulation_ended"})

        # Generate postmortem automatically
        try:
            generator = PostmortemGenerator(self.space, self.config, self.behavior_engine)
            postmortem = await generator.generate(self.simulation_id, tr)
            db = get_database()
            if hasattr(db, 'save_postmortem'):
                await db.save_postmortem(self.simulation_id, json.dumps(postmortem.model_dump(mode="json")))
        except Exception as exc:
            logger.warning("Postmortem generation failed: %s", exc)

        await self.space.publish({
            "type": "done",
            "agent_id": "__scheduler__",
            "reason": tr.reason,
            "outcome_type": tr.outcome_type,
            "summary": tr.summary,
            "confidence": tr.confidence,
            "total_turns": tr.total_turns,
            "vote_breakdown": tr.vote_breakdown,
            "agreed_issues": tr.agreed_issues,
            "judge_notes": tr.judge_notes,
            "walkaway_party": tr.walkaway_party,
        })
        self.space.shutdown()

    # ── checker orchestration ──────────────────────────────────────

    async def _check_all(self) -> TerminationResult | None:
        ctx = TerminationContext(
            config=self.config,
            space=self.space,
            turn_count=self.turn_count,
            behavior_engine=self.behavior_engine,
        )
        for checker in self._checkers:
            try:
                result = await checker.check(ctx)
                if result is not None:
                    return result
            except Exception as exc:
                logger.warning("Checker %s failed: %s", type(checker).__name__, exc)
        return None

    # ── speaker resolution ─────────────────────────────────────────

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
            if len(moderators) > 1:
                return moderators[self.turn_count % len(moderators)].id
            all_ids = [s.id for s in self.config.stakeholders]
            mod_id = moderators[0].id
            others = [s for s in all_ids if s != mod_id]
            if not others:
                return mod_id
            if self.turn_count == 0:
                return mod_id
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

    # ── turn validation ────────────────────────────────────────────

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

    # ── dynamics ───────────────────────────────────────────────────

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
                        asyncio.to_thread(writer.write_turn, self._make_v2_sim_state(), self._make_v2_turn(turn))
                    )
        except Exception:
            logger.debug("Neo4j write skipped for turn %d", self.turn_count, extra={"turn": self.turn_count, "event": "neo4j_write_skipped"})

    # ── helpers ────────────────────────────────────────────────────

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
            config=sc, turns=[], heatmap=None, sentiment=[], leaderboard=[],
            trust_matrix={}, leverage_scores={}, event_log=[], coalitions=[],
            leverage_shifts=[], active_speaker_id=None, deadlock_risk_score=0,
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
            is_human=False, directed_at=None, coalition_with=None,
        )
