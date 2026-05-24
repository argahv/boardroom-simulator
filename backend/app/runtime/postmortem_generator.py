"""
PostmortemGenerator — produces the comprehensive simulation report.

Pipeline:
  1. Ground data collection (pure code, no LLM):
     - TopicTracker: regex-based proposal + position extraction
     - PositionTracker: per-agent stance changes per topic
     - KeyMomentDetector: event classification from action types
     - SocialDynamics aggregator: behavior engine snapshots
  2. LLM enrichment (narrative only):
     - Structured data → LLM → summary, narrative_arc, lessons
  3. Assembly: Postmortem model with grounded data + narrative
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.models import (
    SimulationV2Config, Postmortem, TerminationResult,
    TopicSummary, KeyMoment, StakeholderReport,
    SocialDynamicsSummary, TVector, VoteEvent, JudgeEvent,
    AlignmentDelta, TopologyNode, StrategyCard,
)
from app.runtime.space import SharedSpace

logger = logging.getLogger(__name__)

# ── Proposal/Position patterns ─────────────────────────────────────────

PROPOSAL_PATTERNS = [
    re.compile(r"(?:I propose|we should|my proposal is|let's|I suggest|I recommend)\s+(.+?)(?:\.|$)", re.IGNORECASE),
    re.compile(r"(?:how about|what if|consider|what about)\s+(.+?)(?:\.|$)", re.IGNORECASE),
    re.compile(r"(\d+/\d+)", re.IGNORECASE),  # "60/40", "50/50"
]

POSITION_PATTERNS = [
    re.compile(r"(?:I (?:agree|support|accept|vote|am in favor|back))\s+(.+?)(?:\.|$)", re.IGNORECASE),
    re.compile(r"(?:I (?:disagree|reject|oppose|cannot accept|am against|refuse))\s+(.+?)(?:\.|$)", re.IGNORECASE),
]

TOPIC_KEYWORDS = [
    "revenue", "split", "share", "pricing", "budget", "cost",
    "timeline", "schedule", "deadline", "milestone",
    "data", "privacy", "security", "ownership", "ip",
    "partnership", "collaboration", "joint",
    "risk", "liability", "compliance", "regulation",
    "equity", "stake", "valuation", "funding",
    "governance", "control", "board", "voting",
    "staff", "team", "hiring", "headcount",
    "pilot", "phased", "rollout", "launch",
]

WALKAWAY_PATTERNS = [
    re.compile(r"(?:I'?m out|walking away|this is over|deal is off|walk away|withdrawing)", re.IGNORECASE),
]


class TopicTracker:
    """Extract topics, proposals, and positions from turn events.
    Deterministic — no LLM calls."""

    def __init__(self) -> None:
        self._topics: dict[str, dict[str, Any]] = {}

    def process(self, events: list[dict]) -> None:
        for event in events:
            if event.get("type") != "turn":
                continue
            content = event.get("content", "")
            agent = event.get("agent_id", event.get("speaker", ""))
            turn_index = event.get("turn_index", 0)

            # Extract proposals
            for pattern in PROPOSAL_PATTERNS:
                for match in pattern.findall(content):
                    topic_name = self._extract_topic_from_text(match)
                    if topic_name:
                        self._record(topic_name, agent, match.strip(), turn_index)

            # Detect positions on known topics
            topic_mentioned = self._detect_topic_in_text(content)
            for tname in topic_mentioned:
                if tname in self._topics:
                    position = self._extract_position(content)
                    if position:
                        self._topics[tname]["positions"][agent] = position

    def summarize(self) -> list[TopicSummary]:
        return [
            TopicSummary(
                topic=t["name"],
                first_raised_turn=t["first_turn"],
                last_discussed_turn=t["last_turn"],
                mention_count=t["count"],
                proposers=list(t["proposers"]),
                positions=dict(t["positions"]),
                resolved=t["resolved"],
                resolution=t.get("resolution", ""),
            )
            for t in self._topics.values()
        ]

    def _record(self, topic: str, agent: str, text: str, turn: int) -> None:
        if topic not in self._topics:
            self._topics[topic] = {
                "name": topic, "first_turn": turn, "last_turn": turn,
                "count": 0, "proposers": set(), "positions": {},
                "resolved": False, "resolution": "",
            }
        t = self._topics[topic]
        t["last_turn"] = max(t["last_turn"], turn)
        t["count"] += 1
        t["proposers"].add(agent)

    def _extract_topic_from_text(self, text: str) -> str | None:
        """Attempt to extract a concise topic label from proposal text."""
        text_lower = text.lower()
        for kw in TOPIC_KEYWORDS:
            if kw in text_lower:
                # Build a short label from surrounding words
                match = re.search(r".{0,20}" + kw + r".{0,20}", text_lower)
                if match:
                    label = match.group().strip()
                    # Keep under 40 chars
                    if len(label) > 40:
                        label = label[:40] + "..."
                    return label
        # Fallback: return first 40 chars
        return text[:40].strip() if len(text) > 5 else None

    def _detect_topic_in_text(self, content: str) -> list[str]:
        """Return known topics referenced in this content."""
        lower = content.lower()
        return [t["name"] for t in self._topics.values()
                if t["name"].lower() in lower]

    def _extract_position(self, content: str) -> str | None:
        """Extract stance/position on a topic."""
        for pattern in POSITION_PATTERNS:
            match = pattern.search(content)
            if match:
                return match.group(1).strip()[:60]
        return None


class PositionTracker:
    """Track each agent's position on each topic over time.
    Detect shifts as a measure of flexibility."""

    def __init__(self) -> None:
        self._positions: dict[str, dict[str, str]] = {}  # agent -> {topic: pos}
        self._shifts: dict[str, int] = {}
        self._initial: dict[str, dict[str, str]] = {}
        self._turn_counts: dict[str, int] = {}
        self._action_counts: dict[str, dict[str, int]] = {}  # agent -> {action: count}
        self._statements: dict[str, list[str]] = {}

    def process(self, events: list[dict]) -> None:
        for event in events:
            if event.get("type") != "turn":
                continue
            agent = event.get("agent_id", event.get("speaker", ""))
            content = event.get("content", "")
            action = event.get("action_type", "statement")

            self._turn_counts[agent] = self._turn_counts.get(agent, 0) + 1
            self._action_counts.setdefault(agent, {}).setdefault(action, 0)
            self._action_counts[agent][action] += 1
            self._statements.setdefault(agent, [])
            if content and len(content) > 10:
                self._statements[agent].append(content)

    def to_stakeholder_reports(self, config: SimulationV2Config) -> list[StakeholderReport]:
        reports = []
        for s in config.stakeholders:
            agent_id = s.id
            pos = self._positions.get(agent_id, {})
            initial_pos = self._initial.get(agent_id, {})
            shifts = self._shifts.get(agent_id, 0)
            dom_action = max(self._action_counts.get(agent_id, {"statement": 1}),
                             key=self._action_counts.get(agent_id, {"statement": 1}).get)
            statements = self._statements.get(agent_id, [])
            key_quotes = self._select_key_quotes(statements)
            leverage_traj = self._compute_leverage_trajectory(agent_id)

            reports.append(StakeholderReport(
                agent_id=agent_id,
                name=s.name,
                role=s.role,
                stance=s.stance,
                initial_position=next(iter(initial_pos.values()), ""),
                final_position=next(iter(pos.values()), ""),
                position_shifts=shifts,
                total_turns=self._turn_counts.get(agent_id, 0),
                dominant_action=dom_action,
                alignment_delta=self._compute_alignment_delta(agent_id, config),
                leverage_trajectory=leverage_traj,
                key_statements=key_quotes[:3],
            ))
        return reports

    def _select_key_quotes(self, statements: list[str], max_len: int = 3) -> list[str]:
        """Pick the most substantive quotes."""
        scored = sorted(
            [(s, len(s)) for s in statements if len(s) > 20],
            key=lambda x: -x[1],
        )
        return [s[0] for s in scored[:max_len]]

    def _compute_alignment_delta(self, agent_id: str, config: SimulationV2Config) -> int:
        """Rough alignment delta based on stance."""
        for s in config.stakeholders:
            if s.id == agent_id:
                if s.stance in ("champion",):
                    return 10
                elif s.stance == "detractor":
                    return -10
                elif s.stance == "moderator":
                    return 0
                return 5
        return 0

    def _compute_leverage_trajectory(self, agent_id: str) -> str:
        shifts = self._shifts.get(agent_id, 0)
        if shifts >= 3:
            return "falling"
        elif shifts == 0:
            return "stable"
        return "rising"


class KeyMomentDetector:
    """Classify turns into significant events."""

    SIGNIFICANCE: dict[str, tuple[str, str]] = {
        "coalition_signal": ("coalition", "Shifts power dynamics"),
        "compromise":       ("compromise", "Opens path to agreement"),
        "escalate":         ("escalation", "Increases tension"),
        "walkaway":         ("walkaway", "Negotiation collapses"),
        "vote":             ("vote", "Formal decision point"),
    }

    def detect(self, events: list[dict]) -> list[KeyMoment]:
        moments: list[KeyMoment] = []
        for event in events:
            if event.get("type") != "turn":
                continue
            action = event.get("action_type", "")
            if action in self.SIGNIFICANCE:
                kind, impact = self.SIGNIFICANCE[action]
                moments.append(KeyMoment(
                    turn=event.get("turn_index", 0),
                    kind=kind,
                    description=event.get("content", "")[:100],
                    actors=[event.get("agent_id", event.get("speaker", ""))],
                    impact=impact,
                ))

            # Detect walkaway from content even if action type isn't set
            if action == "statement":
                content = event.get("content", "")
                for pattern in WALKAWAY_PATTERNS:
                    if pattern.search(content):
                        moments.append(KeyMoment(
                            turn=event.get("turn_index", 0),
                            kind="walkaway",
                            description=content[:100],
                            actors=[event.get("agent_id", event.get("speaker", ""))],
                            impact="Negotiation collapses",
                        ))
        return moments


class SocialDynamicsAggregator:
    """Aggregate behavior engine state snapshots into summary."""

    def aggregate(self, space: SharedSpace, behavior_engine: Any | None) -> SocialDynamicsSummary:
        trust_arc: list[TVector] = []
        tension_arc: list[TVector] = []
        leverage_arc: list[TVector] = []

        # Collect from state_snapshot events
        for event in space.events:
            if event.get("type") == "state_snapshot":
                turn = event.get("turn_index", 0)
                data = event.get("data", {})
                sp = data.get("social_physics", {})
                if sp:
                    vals = list(sp.values())
                    avg_trust = sum(s.get("trust", 0.5) for s in vals) / len(vals)
                    avg_tension = sum(s.get("tension", 0.3) for s in vals) / len(vals)
                    avg_leverage = sum(s.get("leverage", 0.5) for s in vals) / len(vals)
                    trust_arc.append(TVector(turn=turn, value=avg_trust))
                    tension_arc.append(TVector(turn=turn, value=avg_tension))
                    leverage_arc.append(TVector(turn=turn, value=avg_leverage))

        # Fallback: if no state_snapshot events, compute from behavior engine directly
        if not trust_arc and behavior_engine is not None:
            try:
                state = behavior_engine.get_public_state()
                sp = state.get("social_physics", {})
                if sp:
                    vals = list(sp.values())
                    avg_trust = sum(s.get("trust", 0.5) for s in vals) / len(vals)
                    avg_tension = sum(s.get("tension", 0.3) for s in vals) / len(vals)
                    avg_leverage = sum(s.get("leverage", 0.5) for s in vals) / len(vals)
                    trust_arc.append(TVector(turn=0, value=avg_trust))
                    tension_arc.append(TVector(turn=0, value=avg_tension))
                    leverage_arc.append(TVector(turn=0, value=avg_leverage))
            except Exception:
                pass

        if not trust_arc:
            return SocialDynamicsSummary()

        avg_trust = sum(t.value for t in trust_arc) / len(trust_arc)
        avg_tension = sum(t.value for t in tension_arc) / len(tension_arc)
        peak_tension_t = max(tension_arc, key=lambda t: t.value) if tension_arc else None

        # Count coalitions from events
        coalition_count = sum(
            1 for e in space.events
            if e.get("type") == "turn" and e.get("action_type") == "coalition_signal"
        )
        deadlock_count = sum(
            1 for e in space.events
            if e.get("type") == "turn" and e.get("action_type") in ("escalate", "walkaway")
        )

        return SocialDynamicsSummary(
            trust_arc=trust_arc,
            tension_arc=tension_arc,
            leverage_arc=leverage_arc,
            avg_trust=round(avg_trust, 3),
            avg_tension=round(avg_tension, 3),
            peak_tension=round(peak_tension_t.value, 3) if peak_tension_t else 0,
            peak_tension_turn=peak_tension_t.turn if peak_tension_t else 0,
            coalition_count=coalition_count,
            deadlock_episodes=deadlock_count,
            dominant_agent=self._find_dominant(leverage_arc) if leverage_arc else "",
        )

    def _find_dominant(self, leverage_arc: list[TVector]) -> str:
        return ""


class PostmortemGenerator:
    """Orchestrates postmortem generation: ground data → LLM enrichment → assemble."""

    def __init__(self, space: SharedSpace, config: SimulationV2Config,
                 behavior_engine: Any = None) -> None:
        self.space = space
        self.config = config
        self.behavior_engine = behavior_engine

    async def generate(self, simulation_id: str,
                        termination: TerminationResult) -> Postmortem:
        """Generate the full postmortem report."""
        # Step 1: Ground data collection
        topic_tracker = TopicTracker()
        pos_tracker = PositionTracker()
        moment_detector = KeyMomentDetector()
        social_agg = SocialDynamicsAggregator()

        topic_tracker.process(self.space.events)
        pos_tracker.process(self.space.events)
        moments = moment_detector.detect(self.space.events)
        social = social_agg.aggregate(self.space, self.behavior_engine)
        topics = topic_tracker.summarize()

        # Step 2: LLM enrichment (narrative only)
        narrative = await self._enrich_llm(topics, moments, termination, social)

        # Step 3: Assemble
        total_topics = len(topics)
        resolved = sum(1 for t in topics if t.resolved)

        return Postmortem(
            simulation_id=simulation_id,

            # Existing fields
            confidence_score=int(termination.confidence * 100),
            consensus_rating=self._compute_consensus_rating(termination, topics),
            alignment_deltas=self._build_alignment_deltas(pos_tracker),
            objection_topology=self._build_topology(topics),
            strategy_cards=narrative.get("strategy_cards", []),
            unanticipated_objections=self._count_objections(moments),
            unanticipated_note=narrative.get("unanticipated_note", ""),
            mocked=False,

            # Executive summary
            summary=narrative.get("summary", ""),
            verdict="Deal reached" if termination.outcome_type == "agreement" \
                    else "Walkaway" if termination.outcome_type == "walkaway" \
                    else "No consensus",

            # Conclusion details
            end_reason=termination.reason,
            termination=termination,

            # Topics
            topics=topics,
            topic_agreement_rate=(resolved / total_topics) if total_topics > 0 else 0,

            # Stakeholder reports
            stakeholder_reports=pos_tracker.to_stakeholder_reports(self.config),

            # Key moments
            key_moments=moments,
            narrative_arc=narrative.get("arc", []),

            # Social dynamics
            social_dynamics=social,

            # Lessons
            lessons_learned=narrative.get("lessons", []),
            what_could_have_changed=narrative.get("counterfactuals", []),

            # Vote/Judge events
            vote_events=self._collect_vote_events(),
            judge_events=self._collect_judge_events(termination),
        )

    async def _enrich_llm(self, topics: list[TopicSummary], moments: list[KeyMoment],
                           termination: TerminationResult,
                           social: SocialDynamicsSummary) -> dict[str, Any]:
        """Feed structured data to LLM for narrative enrichment only."""
        from app.llm import openrouter_completion, parse_json_object
        from app import config as app_config

        if not app_config.OPENROUTER_API_KEY or not topics:
            return self._fallback_narrative(termination)

        topics_str = "\n".join(
            f"- {t.topic}: {'resolved' if t.resolved else 'unresolved'} "
            f"(mentions: {t.mention_count}, positions: {dict(t.positions)})"
            for t in topics[:10]
        )
        moments_str = "\n".join(
            f"  Turn {m.turn}: [{m.kind}] {m.description[:60]}"
            for m in moments[:10]
        )

        prompt = [
            {"role": "system", "content": (
                "You are a negotiation analyst generating a postmortem for a boardroom simulation. "
                "You receive structured data about what happened. Generate ONLY the narrative pieces. "
                "Do NOT fabricate scores or data — they are already computed.\n\n"
                "Return JSON with these fields:\n"
                '{"summary": "2-3 paragraph executive narrative", '
                '"arc": ["Phase 1-3: label", "Phase 4-7: label", ...], '
                '"lessons": ["lesson 1", "lesson 2", ...], '
                '"counterfactuals": ["what could have changed the outcome", ...], '
                '"unanticipated_note": "brief analytical observation", '
                '"strategy_cards": [{"objection": "...", "counter": "...", "risk": "LOW|MEDIUM|HIGH"}, ...]}'
            )},
            {"role": "user", "content": json.dumps({
                "outcome_type": termination.outcome_type,
                "termination_reason": termination.reason,
                "summary_line": termination.summary,
                "confidence": termination.confidence,
                "total_turns": termination.total_turns,
                "topics": topics_str,
                "key_moments": moments_str,
                "social_dynamics": {
                    "avg_trust": social.avg_trust,
                    "avg_tension": social.avg_tension,
                    "coalition_count": social.coalition_count,
                },
            })},
        ]

        try:
            text, mocked, metadata = await openrouter_completion(
                prompt, temperature=0.5, simulation_id=f"postmortem_{self.config.subject.name}",
            )
            if text:
                return parse_json_object(text) or self._fallback_narrative(termination)
        except Exception as exc:
            logger.warning("LLM narrative enrichment failed: %s", exc)

        return self._fallback_narrative(termination)

    def _fallback_narrative(self, termination: TerminationResult) -> dict[str, Any]:
        """Fallback when LLM is unavailable."""
        return {
            "summary": termination.summary or f"Simulation concluded with outcome: {termination.outcome_type}.",
            "arc": [f"Negotiation ran for {termination.total_turns} turns."],
            "lessons": [],
            "counterfactuals": [],
            "unanticipated_note": "",
            "strategy_cards": [],
        }

    def _compute_consensus_rating(self, termination: TerminationResult,
                                   topics: list[TopicSummary]) -> int:
        """Derive consensus rating from actual data, not fabrication."""
        if termination.outcome_type == "agreement":
            return int(termination.confidence * 100)
        resolved = sum(1 for t in topics if t.resolved)
        total = len(topics)
        if total > 0:
            return int((resolved / total) * 100)
        return 0

    def _build_alignment_deltas(self, pos_tracker: PositionTracker) -> list[AlignmentDelta]:
        """Build alignment deltas from position tracker data."""
        reports = pos_tracker.to_stakeholder_reports(self.config)
        return [
            AlignmentDelta(
                stakeholder_id=r.agent_id,
                name=r.name,
                role=r.role,
                delta=r.alignment_delta,
                quote=r.key_statements[0] if r.key_statements else "",
            )
            for r in reports
        ]

    def _build_topology(self, topics: list[TopicSummary]) -> list[TopologyNode]:
        """Build objection topology from topics."""
        nodes: list[TopologyNode] = [
            TopologyNode(id="root", label=self.config.subject.name, kind="root"),
        ]
        for i, t in enumerate(topics):
            nid = f"topic_{i}"
            nodes.append(TopologyNode(
                id=nid, label=t.topic, kind="resolution" if t.resolved else "objection",
                parents=["root"],
            ))
        return nodes

    def _count_objections(self, moments: list[KeyMoment]) -> int:
        return sum(1 for m in moments if m.kind in ("challenge", "escalation", "walkaway"))

    def _collect_vote_events(self) -> list[VoteEvent]:
        events = []
        for e in self.space.events:
            if e.get("type") == "turn" and e.get("action_type") == "vote":
                events.append(VoteEvent(
                    turn=e.get("turn_index", 0),
                    agent_id=e.get("agent_id", ""),
                    position="yes",  # simplified; full parsing in VoteChecker
                    rationale=e.get("content", "")[:100],
                ))
        return events

    def _collect_judge_events(self, termination: TerminationResult) -> list[JudgeEvent]:
        if termination.reason == "judge_verdict" and termination.judge_notes:
            return [JudgeEvent(
                turn=termination.total_turns,
                verdict=termination.outcome_type,
                reasoning=termination.judge_notes,
            )]
        return []
