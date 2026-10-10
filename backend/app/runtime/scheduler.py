from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app import config as app_config
from app.database import get_database
from app.models import (
    SimulationConfig, VoteCondition, TimeoutCondition,
    JudgeCondition, ConsensusCondition, HybridCondition,
    TerminationResult,
)
from app.runtime.space import SharedSpace
from app.llm import traced_span
from app.graph.driver import get_driver, neo4j_enabled
from app.graph.writer import GraphWriter
from app.runtime.postmortem_generator import PostmortemGenerator
from app.runtime.context import uses_vote, vote_phase, voters_of, vote_condition

logger = logging.getLogger(__name__)

# ── Termination Checker Protocol ──────────────────────────────────────

class TerminationContext:
    """Context passed to each checker for evaluation."""
    def __init__(self, config: SimulationConfig, space: SharedSpace,
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
    """Tally agent votes from action_type='vote'.

    The motion carries as soon as the yes share of the remaining voters reaches
    the threshold. Once every remaining voter has a position (or a yes majority
    is out of reach), the vote is closed and a motion short of the threshold
    fails. If time runs out first, the outcome is no decision.
    """
    def __init__(self, condition: VoteCondition, max_turns: int | None = None) -> None:
        self.condition = condition
        self.max_turns = max_turns if max_turns is not None else condition.max_turns

    async def check(self, ctx: TerminationContext) -> TerminationResult | None:
        if ctx.turn_count < 3:
            return None
        from app.runtime.context import voters_of
        departed = getattr(ctx.space, "departed", set())
        voters = [v for v in voters_of(ctx.config) if v not in departed]

        # Latest vote per voter counts (people can change their mind).
        latest: dict[str, str] = {}
        for event in ctx.space.events:
            if event.get("type") == "turn" and event.get("action_type") == "vote":
                agent = event.get("agent_id", "")
                if agent not in voters:
                    continue
                position = event.get("vote") or self._extract_vote_position(event.get("content", ""))
                if position:
                    latest[agent] = position

        n = len(voters)
        yes = sum(1 for v in latest.values() if v == "yes")
        no = sum(1 for v in latest.values() if v == "no")
        abstain = sum(1 for v in latest.values() if v == "abstain")
        breakdown = {"for": yes, "against": no, "abstain": abstain}
        needed = self.condition.threshold
        tally = f"{yes} for, {no} against, {abstain} abstaining"

        if n and yes / n >= needed:
            return TerminationResult(
                reason="vote_majority", outcome_type="agreement",
                summary=f"Motion carried ({tally}).", confidence=yes / n,
                total_turns=ctx.turn_count, vote_breakdown=breakdown,
                agreed_issues=[{"position": "yes"}],
            )
        undecided = n - len(latest)
        if n and latest and (undecided == 0 or (yes + undecided) / n < needed):
            return TerminationResult(
                reason="vote_majority", outcome_type="rejected",
                summary=f"Motion failed ({tally}; needed {needed:.0%} of {n}).",
                confidence=1 - yes / n, total_turns=ctx.turn_count, vote_breakdown=breakdown,
                agreed_issues=[{"position": "no"}],
            )

        # Hard cap: time ran out before the vote was complete.
        if ctx.turn_count >= self.max_turns:
            return TerminationResult(
                reason="vote_incomplete", outcome_type="no_decision",
                summary=f"Time ran out with {len(latest)} of {n} votes cast ({tally}).",
                total_turns=ctx.turn_count, vote_breakdown=breakdown,
            )

        return None

    def _extract_vote_position(self, content: str) -> str | None:
        """Extract what the agent voted for from content (whole-word matching)."""
        from app.runtime.agent import _vote_position
        return _vote_position(None, content)


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
        self._last_turn: int | None = None

    async def check(self, ctx: TerminationContext) -> TerminationResult | None:
        if ctx.behavior_engine is None or ctx.turn_count < 3:
            return None
        # The scheduler checks before and after each turn; count each turn once.
        if ctx.turn_count == self._last_turn:
            return None
        self._last_turn = ctx.turn_count

        sens = self.SENSITIVITY_MAP.get(self.condition.sensitivity, self.SENSITIVITY_MAP["balanced"])
        state = ctx.behavior_engine.get_public_state()
        departed = getattr(ctx.space, "departed", set())
        sp_entries = {a: v for a, v in state.get("social_physics", {}).items() if a not in departed}

        if not sp_entries:
            return None

        avg_trust = sum(s.get("trust", 0.5) for s in sp_entries.values()) / len(sp_entries)
        avg_tension = sum(s.get("tension", 0.3) for s in sp_entries.values()) / len(sp_entries)

        mode = self.condition.detection_mode
        if mode in ("both", "agreement_only"):
            if avg_trust >= sens["trust_threshold"] and avg_tension <= sens["tension_low"]:
                self._consecutive_agreement += 1
                # A warm room is not a deal: every party must also have said yes to something.
                if self._consecutive_agreement >= 3 and _all_principals_conceded(ctx):
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
                    # Only an actual walkout is a walkaway; otherwise the room is at an impasse.
                    walkaway = self._find_walkaway(ctx)
                    return TerminationResult(
                        reason="deadlock_walkaway" if walkaway else "deadlock",
                        outcome_type="walkaway" if walkaway else "impasse",
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


def _principals(ctx: TerminationContext) -> list:
    """Stakeholders still in the room who negotiate for themselves (moderators excluded)."""
    departed = getattr(ctx.space, "departed", set())
    return [s for s in ctx.config.stakeholders if s.id not in departed and s.stance != "moderator"]


HOSTILE_ACTIONS = {"challenge", "escalate", "interrupt", "walkaway"}


def _all_principals_conceded(ctx: TerminationContext, window: int | None = None) -> bool:
    """Every remaining principal made a conciliatory move recently and nobody just objected."""
    principals = {s.id for s in _principals(ctx)}
    turns = [e for e in ctx.space.events if e.get("type") == "turn" and e.get("agent_id") in principals]
    recent = turns[-(window or 2 * max(1, len(principals))):]
    if not recent or recent[-1].get("action_type") in HOSTILE_ACTIONS:
        return False
    conceded = {t["agent_id"] for t in recent
                if t.get("action_type") in ("agreement", "compromise")
                or (t.get("action_type") == "vote" and t.get("vote") == "yes")}
    return principals <= conceded


class WalkawayChecker(BaseChecker):
    """Always active: the negotiation ends when a side has left.

    That is when fewer than two principals remain (a moderator alone cannot keep
    a deal alive), or when everyone who argued for, or everyone who argued
    against, the proposal has walked out.
    """

    async def check(self, ctx: TerminationContext) -> TerminationResult | None:
        departed = getattr(ctx.space, "departed", set())
        if not departed:
            return None
        principals = _principals(ctx)
        side_gone = False
        for stance in ("champion", "detractor"):
            side = [s for s in ctx.config.stakeholders if s.stance == stance]
            if side and all(s.id in departed for s in side):
                side_gone = True
        if len(principals) >= 2 and not side_gone:
            return None
        names = [s.name for s in ctx.config.stakeholders if s.id in departed]
        last = None
        for event in reversed(ctx.space.events):
            if event.get("type") == "turn" and event.get("action_type") == "walkaway":
                last = event.get("agent_id")
                break
        return TerminationResult(
            reason="walkaway",
            outcome_type="walkaway",
            summary=f"Negotiation collapsed: {', '.join(names)} walked out.",
            total_turns=ctx.turn_count,
            walkaway_party=last,
        )


class ExplicitAgreementChecker(BaseChecker):
    """Ends the meeting when every remaining principal has accepted the proposal on the table.

    The proposal is the latest compromise. Its author must not have attacked it
    since, and every other principal's latest word on it must be an agreement.
    Mood alone never ends a negotiation here; only what people said yes to.
    """

    async def check(self, ctx: TerminationContext) -> TerminationResult | None:
        principals = _principals(ctx)
        if len(principals) < 2:
            return None
        ids = {s.id for s in principals}
        turns = [e for e in ctx.space.events if e.get("type") == "turn"]
        last_offer = next((i for i in range(len(turns) - 1, -1, -1)
                           if turns[i].get("action_type") == "compromise"), None)
        if last_offer is None:
            return None
        offer = turns[last_offer]
        proposer = offer.get("agent_id")
        after = [t for t in turns[last_offer + 1:] if t.get("agent_id") in ids]
        for pid in ids:
            own = [t for t in after if t.get("agent_id") == pid]
            if pid == proposer:
                if any(t.get("action_type") in HOSTILE_ACTIONS for t in own):
                    return None
                continue
            if not own or own[-1].get("action_type") != "agreement":
                return None
        name = next((s.name for s in ctx.config.stakeholders if s.id == proposer), proposer)
        text = str(offer.get("content", ""))
        return TerminationResult(
            reason="explicit_agreement",
            outcome_type="agreement",
            summary=f"Every party accepted {name}'s proposal: \"{text[:200]}\"",
            confidence=1.0,
            total_turns=ctx.turn_count,
            agreed_issues=[{"proposal": text, "proposed_by": proposer}],
        )


class JudgeChecker(BaseChecker):
    """Periodically ask a judge LLM to evaluate the negotiation."""
    def __init__(self, condition: JudgeCondition, llm: Any = None) -> None:
        self.condition = condition
        self.llm = llm
        self._last_judge_turn = 0

    async def check(self, ctx: TerminationContext) -> TerminationResult | None:
        from app.llm import parse_json_object

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
                f"You are an impartial judge evaluating a negotiation about "
                f"'{ctx.config.subject.name}'. "
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
            llm = self.llm
            if llm is None:
                from app.llm import openrouter_completion as llm
            text, mocked, metadata = await llm(
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
    def build_checkers(config: SimulationConfig, llm: Any = None) -> list[BaseChecker]:
        checkers: list[BaseChecker] = [WalkawayChecker()]
        ec = config.end_condition
        # Outside a formal vote, a room can still settle by everyone explicitly accepting a proposal.
        if not uses_vote(config):
            checkers.append(ExplicitAgreementChecker())

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
                    checkers.append(VoteChecker(sub, max_turns=ec.max_turns))  # the hybrid's cap rules
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

    - Opens bidding rounds and grants the floor
    - Feeds every completed turn through all behavioral layers exactly once
      (social physics, emotions, relationships, coalitions, memory, private
      thought, goals and plans)
    - Injects environment pressure (time pressure, external events)
    - Checks end conditions after each turn
    - Publishes system events and state snapshots
    """

    BID_WINDOW_SECONDS = 3.0

    def __init__(self, config: SimulationConfig, space: SharedSpace, simulation_id: str,
                 behavior_engine: Any = None, context: Any = None, llm: Any = None) -> None:
        self.config = config
        self.space = space
        self.simulation_id = simulation_id
        self.turn_count = 0
        self.context = context
        self.behavior_engine = behavior_engine if behavior_engine is not None else getattr(context, "behavior_engine", None)
        self._termination_result: TerminationResult | None = None
        self._checkers = EndConditionRegistry.build_checkers(config, llm=llm)
        self._last_speaker: str | None = None
        self._pending_reply: str | None = None
        self._vote_called = False
        self._polled: dict[str, int] = {}
        self._last_spoke_turn: dict[str, int] = {}
        self._processed_index = 0
        import random as _random
        import zlib as _zlib
        self._rng = _random.Random(_zlib.crc32(simulation_id.encode()))

    async def run(self) -> None:
        await self.space.publish({
            "type": "system",
            "content": "Simulation started.",
            "agent_id": "__scheduler__",
            "subject_name": self.config.subject.name,
            "stakeholder_count": len(self.config.stakeholders),
        })
        # Initial state, so the first turn's effects can be measured against it.
        if self.behavior_engine is not None:
            await self.space.publish({"type": "state_snapshot", "turn_index": -1, "initial": True,
                                      "data": self.public_state()})

        while self.space.is_running():
            self.space.clear_bids()

            # Human interjections since the last turn feed the dynamics too
            await self._process_external_turns()

            # Check termination BEFORE processing next turn
            result = await self._check_all()
            if result is not None:
                self._termination_result = result
                break

            await self._apply_environment()

            # One trace span per turn: the bids and the speech of this turn nest under it.
            with traced_span(f"Turn {self.turn_count + 1}", inputs={"turn": self.turn_count + 1}) as span:
                self.space.trace_parent = span
                keep_going = await self._play_turn(span)
            self.space.trace_parent = None
            if not keep_going:
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

    async def _play_turn(self, span: Any = None) -> bool:
        """Give the floor to one speaker and process their turn. False when the meeting is over."""
        winner = await self._resolve_next_speaker()
        if winner is None:
            return False

        await self.space.publish({
            "type": "system",
            "content": f"{self._name(winner)} has the floor.",
            "agent_id": "__scheduler__",
            "granted_to": winner,
            "bids": {self._name(a): u for a, u in getattr(self, "_last_bids", {}).items()},
            "bid_details": getattr(self, "_last_bid_details", {}),
            "turn_number": self.turn_count,
        })

        start_index = len(self.space.events)
        await self.space.grant_floor(winner)
        logger.info("Turn %d — %s has the floor", self.turn_count + 1, self._name(winner), extra={"turn": self.turn_count + 1, "speaker": winner, "event": "turn_granted"})

        turn = await self._wait_for_turn(winner, timeout=app_config.TURN_TIMEOUT_SECONDS, start_index=start_index)
        if turn is None:
            logger.warning("Agent %s timed out, skipping", winner, extra={"agent": winner, "turn": self.turn_count, "event": "agent_timeout"})
            self.space.release_floor()
            await self.space.publish({
                "type": "system", "subtype": "turn_timeout", "agent_id": "__scheduler__",
                "content": f"{self._name(winner)} did not respond in time.", "timed_out": winner,
            })
            if span is not None:
                span.add_outputs({"speaker": self._name(winner), "timed_out": True})
            self.turn_count += 1
            self._sync_context()
            return True
        self._processed_index = max(self._processed_index, turn["_index"] + 1)
        if span is not None:
            span.add_outputs({"speaker": self._name(winner), "action_type": turn.get("action_type"),
                              "directed_at": self._name(turn["directed_at"]) if turn.get("directed_at") else None,
                              "content": turn.get("content"), "bids": getattr(self, "_last_bids", {})})

        await self._update_dynamics(turn)
        self._last_speaker = winner
        self._last_spoke_turn[winner] = self.turn_count

        await self._publish_snapshot()

        self.turn_count += 1
        self._sync_context()

        # Check termination AFTER turn
        result = await self._check_all()
        if result is not None:
            self._termination_result = result
            return False
        return True

    def _sync_context(self) -> None:
        if self.context is not None:
            self.context.turn_count = self.turn_count

    # ── environment pressure ───────────────────────────────────────

    async def _apply_environment(self) -> None:
        ctx = self.context
        if ctx is None:
            return
        if ctx.time_pressure is not None:
            pressure = ctx.time_pressure.tick(self.turn_count, ctx.max_turns)
            remaining = max(0, ctx.max_turns - self.turn_count)
            for level, label in ((0.5, "half"), (0.8, "critical")):
                if pressure >= level and label not in ctx.announced_pressure:
                    ctx.announced_pressure.add(label)
                    await self.space.publish({
                        "type": "system", "subtype": "time_pressure", "agent_id": "__scheduler__",
                        "content": f"Time pressure: about {remaining} turns remain.",
                        "pressure": round(pressure, 2),
                    })
                    if self.behavior_engine is not None and hasattr(self.behavior_engine, "apply_shock"):
                        self.behavior_engine.apply_shock(
                            social={"tension": 0.05 if label == "half" else 0.1},
                            emotion={"fear": 0.05 if label == "half" else 0.1})
        if not self._vote_called and uses_vote(self.config) and vote_phase(ctx):
            self._vote_called = True
            subject = self.config.subject
            motion = subject.description or subject.name
            vc = vote_condition(self.config)
            await self.space.publish({
                "type": "system", "subtype": "vote_called", "agent_id": "__scheduler__",
                "content": (f"The chair calls the vote on the motion: \"{motion}\". Each voter will be asked "
                            f"for yes, no or abstain; it passes with {vc.threshold:.0%} yes."),
            })
        if ctx.external_events is not None:
            event = ctx.external_events.check(self.turn_count)
            if event is not None:
                await self.space.publish({
                    "type": "system", "subtype": "external_event", "agent_id": "__scheduler__",
                    "content": f"⚡ {event['content']}", "event_kind": event.get("kind"),
                })
                if self.behavior_engine is not None and hasattr(self.behavior_engine, "apply_shock"):
                    self.behavior_engine.apply_shock(social=event.get("social"), emotion=event.get("emotion"))

    def _received_pressure(self, speaker: str, action_type: str) -> dict[str, bool]:
        """Who has been on the receiving end of hostility in the last two turns."""
        recent = [e for e in self.space.events if e.get("type") == "turn"][-2:]
        out = {s.id: any(t.get("directed_at") == s.id and t.get("action_type") in HOSTILE_ACTIONS
                         for t in recent)
               for s in self.config.stakeholders}
        if action_type in HOSTILE_ACTIONS:
            out[speaker] = False  # on the attack, not under it
        return out

    async def _process_external_turns(self) -> None:
        """Run human-injected turns through the dynamics so agents react to them."""
        events = self.space.events
        for event in events[self._processed_index:]:
            if event.get("type") == "turn" and event.get("is_human") and event.get("agent_id"):
                await self._update_dynamics(event)
                # The human spoke for this stakeholder; whoever they addressed gets the right of reply.
                self._last_speaker = event["agent_id"]
                target = event.get("directed_at")
                if target and target in self._active_ids() and target != event["agent_id"]:
                    self._pending_reply = target
        self._processed_index = len(events)

    async def _publish_snapshot(self) -> None:
        if self.behavior_engine is None:
            return
        public_state = self.public_state()
        await self.space.publish({
            "type": "state_snapshot",
            "turn_index": self.turn_count,
            "data": public_state,
        })
        try:
            db = get_database()
            await db.create_state_snapshot(self.simulation_id, self.turn_count, json.dumps(public_state, default=str), version=1)
        except Exception as exc:
            logger.warning("SNAPSHOT_SAVE_ERR %s: %s", self.simulation_id, exc)

    def public_state(self) -> dict:
        state = self.behavior_engine.get_public_state() if self.behavior_engine is not None else {}
        ctx = self.context
        if ctx is not None:
            state["agent_goals"] = {
                s.id: [{"goal_text": g.goal_text.replace("_", " "), "priority": round(g.priority, 2),
                        "source": g.source} for g in ctx.goals.get_active_goals(s.id, 3)]
                for s in self.config.stakeholders
            }
            state["private_thoughts"] = ctx.thoughts.get_all_snapshots()
            state["memory"] = {s.id: ctx.memory.get_summary(s.id) for s in self.config.stakeholders}
            state["time_pressure"] = round(ctx.pressure(), 3)
            state["max_turns"] = ctx.max_turns
        state["departed"] = sorted(self.space.departed)
        return state

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

    def _active_ids(self) -> list[str]:
        return [s.id for s in self.config.stakeholders if s.id not in self.space.departed]

    async def _resolve_next_speaker(self) -> str | None:
        self._last_bids = {}
        self._last_bid_details = {}
        if not self._active_ids():
            return None
        voter = self._next_roll_call()
        if voter is not None:
            await self.space.publish({
                "type": "system", "subtype": "roll_call", "agent_id": "__scheduler__",
                "content": f"The chair asks {self._name(voter)} for their vote.",
                "target_agent": voter,
            })
            return voter
        mode = self.config.speaker_rules.mode
        if mode == "moderator_led":
            await self._announce_turn()
            return await self._moderator_decides()
        elif mode == "alternating":
            await self._announce_turn()
            return await self._alternating_side()
        elif mode == "freeform":
            return await self._freeform()
        else:
            return await self._highest_bid()

    ROLL_CALL_ASKS = 2  # a voter who answers without voting is asked once more

    def _next_roll_call(self) -> str | None:
        """Once the vote is called, the chair asks each voter who has not voted, in order."""
        if not self._vote_called:
            return None
        voted = {e.get("agent_id") for e in self.space.events
                 if e.get("type") == "turn" and e.get("action_type") == "vote"}
        active = set(self._active_ids())
        pending = [v for v in voters_of(self.config)
                   if v in active and v not in voted and self._polled.get(v, 0) < self.ROLL_CALL_ASKS]
        # Everyone is asked once before anyone is asked twice; never the same person twice in a row.
        pending.sort(key=lambda v: self._polled.get(v, 0))
        voter = next((v for v in pending if v != self._last_speaker), None)
        if voter is not None:
            self._polled[voter] = self._polled.get(voter, 0) + 1
        return voter

    async def _announce_turn(self) -> None:
        await self.space.publish({
            "type": "system",
            "content": f"Turn {self.turn_count + 1}.",
            "agent_id": "__scheduler__",
        })

    async def _moderator_decides(self) -> str:
        active = self._active_ids()
        moderators = [s for s in self.config.stakeholders if s.stance == "moderator" and s.id in active]
        if moderators:
            if len(moderators) > 1:
                return moderators[self.turn_count % len(moderators)].id
            mod_id = moderators[0].id
            others = [a for a in active if a != mod_id]
            if not others:
                return mod_id
            if self.turn_count == 0:
                return mod_id
            # A tense room pulls the moderator back in to cool things down.
            if self.behavior_engine is not None and self._last_speaker != mod_id:
                if self.behavior_engine.deadlock_risk() >= 0.65:
                    return mod_id
            cycle_pos = (self.turn_count - 1) % (len(others) + 1)
            if cycle_pos < len(others):
                return others[cycle_pos]
            return mod_id
        return await self._highest_bid()

    async def _alternating_side(self) -> str:
        active = set(self._active_ids())
        champions = [s.id for s in self.config.stakeholders if s.stance == "champion" and s.id in active]
        detractors = [s.id for s in self.config.stakeholders if s.stance == "detractor" and s.id in active]
        neutrals = [s.id for s in self.config.stakeholders if s.stance not in ("champion", "detractor") and s.id in active]
        # Every third turn goes to the uncommitted voices so they are not silenced.
        if neutrals and champions and detractors and self.turn_count % 3 == 2:
            return neutrals[(self.turn_count // 3) % len(neutrals)]
        if self.turn_count % 2 == 0:
            pool = champions or neutrals or detractors or list(active)
        else:
            pool = detractors or neutrals or champions or list(active)
        idx = (self.turn_count // 2) % len(pool)
        return pool[idx]

    async def _gather_bids(self) -> dict[str, int]:
        active = self._active_ids()
        await self.space.open_bidding(f"Turn {self.turn_count + 1} — agents may bid.")
        bids = await self.space.collect_bids(set(active), timeout=self.BID_WINDOW_SECONDS)
        bids = {a: u for a, u in bids.items() if a in active}
        self._last_bids = bids
        self._last_bid_details = {a: d for a, d in self.space.round_bid_details.items() if a in bids}
        return bids

    def _take_pending_reply(self, bids: dict[str, int]) -> str | None:
        target, self._pending_reply = self._pending_reply, None
        return target if target and target in bids else None

    def _eligible(self, bids: dict[str, int]) -> dict[str, int]:
        # Nobody holds the floor twice in a row while others want it.
        if len(bids) > 1 and self._last_speaker in bids:
            bids = {a: u for a, u in bids.items() if a != self._last_speaker}
        return bids

    def _fallback_speaker(self) -> str:
        active = self._active_ids()
        # Longest-silent agent speaks when nobody bid in time.
        return min(active, key=lambda a: (self._last_spoke_turn.get(a, -1), active.index(a)))

    async def _freeform(self) -> str:
        """Pure competition: the most urgent bidder wins."""
        bids = self._eligible(await self._gather_bids())
        reply = self._take_pending_reply(bids)
        if reply:
            return reply
        if not bids:
            return self._fallback_speaker()
        top = max(bids.values())
        tied = [a for a, u in bids.items() if u == top]
        return min(tied, key=lambda a: self._last_spoke_turn.get(a, -1))

    async def _highest_bid(self) -> str:
        """Weighted-random by urgency: urgent agents usually, but not always, win."""
        bids = self._eligible(await self._gather_bids())
        reply = self._take_pending_reply(bids)
        if reply:
            return reply
        if not bids:
            return self._fallback_speaker()
        agents = list(bids)
        weights = [max(1, bids[a]) ** 2 for a in agents]
        return self._rng.choices(agents, weights=weights, k=1)[0]

    # ── turn validation ────────────────────────────────────────────

    async def _wait_for_turn(self, agent_id: str, timeout: float, start_index: int | None = None) -> dict | None:
        start = len(self.space.events) if start_index is None else start_index
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while loop.time() < deadline and self.space.is_running():
            for event in self.space.events[start:]:
                if event.get("type") == "turn" and event.get("agent_id") == agent_id and not event.get("is_human"):
                    return event
            await asyncio.sleep(0.05)
        return None

    # ── dynamics ───────────────────────────────────────────────────

    async def _update_dynamics(self, turn: dict) -> None:
        """Feed one completed turn through every behavioral layer, exactly once."""
        speaker = turn.get("agent_id", "")
        action_type = turn.get("action_type", "statement")
        target = turn.get("directed_at") or None
        content = turn.get("content", "")

        triggers_by_agent: dict[str, list[str]] = {}
        if self.behavior_engine is not None:
            be_turn = {
                "agent_id": speaker,
                "action_type": action_type,
                "target_id": target,
                "speaker_id": speaker,
                "target": target or "",
                "content": content,
            }
            try:
                self.behavior_engine.process_turn(be_turn)
                self.behavior_engine.tick()
            except Exception as exc:  # a bad turn must never stall the room
                logger.warning("Behavior engine failed on turn: %s", exc)
            if hasattr(self.behavior_engine, "triggers_for"):
                triggers_by_agent = {s.id: self.behavior_engine.triggers_for(s.id)
                                     for s in self.config.stakeholders}

        ctx = self.context
        if ctx is not None:
            ctx.memory.add_event(speaker, {
                "type": action_type, "content": content,
                "metadata": {"target": target or "", "turn": self.turn_count},
            })
            ctx.thoughts.set_position(
                speaker,
                public=content,
                private=turn.get("internal_reasoning", ""),
                strategy=ctx.plans.get_plan_summary(speaker),
                turn=self.turn_count,
            )
            ctx.goals.decay_all(self.turn_count)
            received = self._received_pressure(speaker, action_type)
            for s in self.config.stakeholders:
                ctx.goals.update_priorities(s.id, triggers_by_agent.get(s.id, []),
                                            received_pressure=received.get(s.id, False))
                if ctx.goals.has_goal_shifted(s.id):
                    top = ctx.goals.get_active_goals(s.id, 1)
                    if top and self.behavior_engine is not None and hasattr(self.behavior_engine, "shift_focus"):
                        self.behavior_engine.shift_focus(s.id, top[0].goal_text.replace("_", " "), int(top[0].priority))
                        await self.space.publish({
                            "type": "system", "subtype": "goal_shift", "agent_id": "__scheduler__",
                            "content": f"{self._name(s.id)} shifts focus: {top[0].goal_text.replace('_', ' ')}.",
                            "target_agent": s.id,
                        })

        if action_type == "walkaway" and speaker and speaker not in self.space.departed:
            self.space.departed.add(speaker)
            await self.space.publish({
                "type": "system", "subtype": "departure", "agent_id": "__scheduler__",
                "content": f"{self._name(speaker)} walked out of the negotiation.",
                "departed": speaker,
            })

        try:
            if neo4j_enabled():
                driver = get_driver()
                if driver:
                    writer = GraphWriter(driver)
                    loop = asyncio.get_event_loop()
                    loop.create_task(
                        asyncio.to_thread(writer.write_turn, self._make_sim_state(), self._make_turn(turn))
                    )
        except Exception:
            logger.debug("Neo4j write skipped for turn %d", self.turn_count, extra={"turn": self.turn_count, "event": "neo4j_write_skipped"})

    # ── helpers ────────────────────────────────────────────────────

    def _name(self, agent_id: str) -> str:
        for s in self.config.stakeholders:
            if s.id == agent_id:
                return s.name
        return agent_id

    def _make_sim_state(self):
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

    def _make_turn(self, turn: dict):
        from app.models import Turn
        return Turn(
            turn_index=turn.get("turn_index", self.turn_count),
            stakeholder_id=turn.get("agent_id", ""),
            stakeholder_name=turn.get("agent_name", turn.get("speaker", "")),
            role=turn.get("role", ""),
            content=turn.get("content", ""),
            action_type=turn.get("action_type", "statement"),
            internal_reasoning=turn.get("internal_reasoning", ""),
            is_human=bool(turn.get("is_human")), directed_at=turn.get("directed_at"),
            coalition_with=turn.get("directed_at") if turn.get("action_type") == "coalition_signal" else None,
        )
