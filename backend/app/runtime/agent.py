from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Callable

from app import config as app_config
from app.knowledge import get_knowledge_store
from app.models import AgentStance, SimulationConfig, AgentConfig
from app.runtime.space import SharedSpace
from app.runtime.archetypes import tendency_hint
from app.runtime.context import allowed_actions, uses_vote

logger = logging.getLogger(__name__)

LLMFunc = Callable[
    [list[dict[str, Any]], float, str | None, int | None, str | None],
    tuple[str, bool, dict[str, Any]],
]

# Actions that are normally aimed at a specific person.
TARGETED_ACTIONS = {"challenge", "question", "interrupt", "compromise", "coalition_signal", "escalate", "agreement"}

STRATEGY_SCORE_TIMEOUT = 2.0


class AgentRuntime:
    """
    Persistent agent loop: observe -> think -> decide -> act.

    Each agent runs as an asyncio Task with:
    - Private memory of every event it has observed
    - Self-directed bidding once per bidding round (hybrid urgency:
      60% deterministic state formula + 40% LLM strategy score)
    - LLM-based turn generation, conditioned on social physics, emotions,
      relationships, goals, plans, memory and private reasoning
    """

    def __init__(
        self,
        config: AgentConfig,
        space: SharedSpace,
        llm: LLMFunc,
        system_prompt_template: str,
        simulation_id: str,
        behavior_engine: Any = None,
        private_thought: Any = None,
        plan_manager: Any = None,
        memory_system: Any = None,
        context: Any = None,
    ) -> None:
        self.agent_id = config.id
        self.config = config
        self.space = space
        self.llm = llm
        self.system_prompt_template = system_prompt_template
        self.simulation_id = simulation_id
        self.context = context
        self.behavior_engine = behavior_engine if behavior_engine is not None else getattr(context, "behavior_engine", None)
        self.private_thought = private_thought if private_thought is not None else getattr(context, "thoughts", None)
        self.plan_manager = plan_manager if plan_manager is not None else getattr(context, "plans", None)
        self.memory_system = memory_system if memory_system is not None else getattr(context, "memory", None)

        self.memory: list[dict] = []
        self._last_event_index = -1
        self._known_version = -1
        self._turn_count = 0
        self._consecutive_events_since_bid = 0
        self._last_bid_round = 0
        self._last_floor_token = 0

    # ── main loop ────────────────────────────────────────────────────

    async def run(self) -> None:
        while self.space.is_running():
            self._known_version = await self.space.wait_for_change(self._known_version)

            new_events = self.space.events[self._last_event_index + 1 :]
            bid_event: dict | None = None
            for event in new_events:
                self._last_event_index = event["_index"]
                self.memory.append(event)
                self._consecutive_events_since_bid += 1
                if self._should_bid(event):
                    bid_event = event

            if self.agent_id in self.space.departed:
                return

            if bid_event is not None:
                self._last_bid_round = bid_event.get("bid_round", self._last_bid_round)
                strategy_score = await self._compute_strategy_score(bid_event)
                urgency = self._compute_urgency(bid_event, strategy_score)
                self.space.submit_bid(self.agent_id, urgency, bid_round=bid_event.get("bid_round"))
                logger.debug("Agent %s bid urgency=%d", self.agent_id, urgency, extra={"agent": self.agent_id, "urgency": urgency, "event": "bid_submitted"})
                self._consecutive_events_since_bid = 0

            token = getattr(self.space, "floor_token", 0)
            if self.space.current_speaker == self.agent_id and token != self._last_floor_token:
                self._last_floor_token = token
                turn_event = await self._generate_turn()
                if turn_event is not None:
                    self._turn_count += 1
                    if self.space.current_speaker == self.agent_id:
                        self.space.release_floor()

    def _should_bid(self, event: dict) -> bool:
        """Agents bid once per bidding round opened by the scheduler."""
        if self.agent_id in self.space.departed:
            return False
        bid_round = event.get("bid_round")
        if event.get("type") == "system" and bid_round is not None:
            return bid_round > self._last_bid_round
        return False

    def _compute_urgency(self, event: dict, strategy_score: int | None = None) -> int:
        base = 50
        base += self.config.personality.aggressiveness // 2 - 25
        last_turn = self._last_turn()
        if last_turn is not None:
            spoke_last = last_turn.get("agent_id", "")
            if spoke_last == self.agent_id:
                base -= 25  # avoid monologuing
            elif spoke_last in self._trusted_allies():
                base -= 10
            if last_turn.get("directed_at") == self.agent_id:
                base += 20  # you were just addressed
        if self._turns_since_spoke() > 3:
            base += 15
        if self.behavior_engine is not None:
            state = self.behavior_engine.get_state_for_llm(self.agent_id)
            sp = state.get("social_physics", {})
            if sp.get("tension", 0) > 0.7:
                base += 15 if self.config.stance != "moderator" else 20
            if sp.get("dominance", 0) > 0.7:
                base += 10
            cs = state.get("cognitive_state", {})
            modulation = cs.get("modulation", {})
            if modulation:
                base += int(modulation.get("urgency_modifier", 0))
                base += int(modulation.get("interrupt_bias", 0) * 20)
        if self.context is not None and self.context.pressure() > 0:
            base += int(10 * self.context.pressure())
        deterministic = base
        if strategy_score is not None:
            base = int(base * 0.6 + strategy_score * 0.4)
        logger.debug("Bid %s urgency=%d (deterministic=%d, strategy=%s)",
                     self.agent_id, base, deterministic, strategy_score,
                     extra={"agent": self.agent_id, "urgency": base, "strategy_score": strategy_score,
                            "event": "bid_calculated"})
        return max(0, min(100, base))

    def _trusted_allies(self) -> set[str]:
        allies = {s.id for s in self.space.config.stakeholders if s.stance == self.config.stance}
        if self.behavior_engine is not None:
            allies |= set(self.behavior_engine.get_state_for_llm(self.agent_id).get("allies", []))
        allies.discard(self.agent_id)
        return allies

    def _last_turn(self) -> dict | None:
        for e in reversed(self.memory):
            if e.get("type") == "turn":
                return e
        return None

    def _turns_since_spoke(self) -> int:
        n = 0
        for e in reversed(self.memory):
            if e.get("type") != "turn":
                continue
            if e.get("agent_id") == self.agent_id:
                return n
            n += 1
        return n

    async def _compute_strategy_score(self, event: dict) -> int:
        if not hasattr(self, 'llm') or self.llm is None:
            return 50
        recent_context = ""
        for e in self.memory[-8:]:
            if e.get("type") == "turn":
                recent_context += f"[{e.get('agent_name', e.get('speaker', ''))}]: {e.get('content', '')[:120]}\n"
        goal_line = ""
        if self.context is not None:
            top = self.context.goals.get_active_goals(self.agent_id, 1)
            if top:
                goal_line = f"Your current priority: {top[0].goal_text.replace('_', ' ')}. "
        strategy_prompt = [
            {"role": "system", "content": (
                f"You are {self.config.name}, {self.config.role}. "
                f"Your stance: {self.config.stance}. "
                f"Subject: {self.space.config.subject.name}. {goal_line}"
                f"Your hidden agenda: {self._hidden_agenda()}."
            )},
            {"role": "user", "content": (
                f"Recent discussion:\n{recent_context or '(nothing yet)'}\n"
                f"On a scale of 0-100, how strategically important is it for you ({self.config.name}) "
                f"to speak RIGHT NOW? Consider your goals, your alliances, the current speaker, "
                f"and the topic. Return ONLY a number between 0 and 100."
            )},
        ]
        try:
            raw_text, mocked, metadata = await asyncio.wait_for(
                self.llm(strategy_prompt, temperature=0.1,
                         simulation_id=self.simulation_id,
                         turn_index=self._turn_count,
                         agent_id=self.agent_id),
                timeout=STRATEGY_SCORE_TIMEOUT,
            )
            match = re.search(r"\d{1,3}", raw_text or "")
            score = int(match.group()) if match else 50
            return max(0, min(100, score))
        except asyncio.TimeoutError:
            logger.warning("strategy_score timeout for %s", self.agent_id,
                          extra={"agent": self.agent_id, "event": "strategy_score_timeout"})
            return 50
        except Exception as exc:
            logger.warning("strategy_score error for %s: %s", self.agent_id, exc,
                          extra={"agent": self.agent_id, "error": str(exc), "event": "strategy_score_error"})
            return 50

    # ── plan integration ────────────────────────────────────────────

    async def _evaluate_plan_progress(self, turn: dict) -> None:
        """Advance active plans based on the action just taken."""
        if self.plan_manager is None:
            return
        completed = self.plan_manager.evaluate_turn(
            self.agent_id, turn.get("action_type", ""), turn=self._turn_count)
        if completed:
            logger.info("Agent %s completed subgoals: %s", self.agent_id, completed,
                        extra={"agent": self.agent_id, "event": "subgoal_completed"})

    # ── prompt building ──────────────────────────────────────────────

    def _hidden_agenda(self) -> str:
        if self.context is not None and not self.context.flag("hidden_motives"):
            return "(none)"
        return self.config.hidden_agenda or "(none)"

    async def _build_system_prompt(self) -> str:
        stance_descriptions = {
            "champion": "You are a STRONG supporter of this position. You MUST defend it enthusiastically against any criticism. You believe in it completely.",
            "detractor": "You are a STRONG opponent of this position. You MUST challenge and criticize it at every opportunity. You believe it is fundamentally wrong.",
            "neutral": "You maintain a balanced, objective viewpoint. You weigh pros and cons without committing to either side.",
            "moderator": "You moderate the discussion. You keep time, ask clarifying questions, and ensure everyone gets a turn. You do NOT take sides.",
            "wildcard": "You are unpredictable. Your stance shifts based on the conversation.",
        }
        stance_text = stance_descriptions.get(self.config.stance, "neutral")

        # Format attributes as structured key facts
        attrs = self.space.config.subject.attributes
        if attrs:
            attributes_formatted = "\n".join(f"- {k}: {v}" for k, v in attrs.items())
        else:
            attributes_formatted = "None"

        # Format evidence items as bullet list
        ev = self.space.config.subject.evidence_items
        if ev:
            evidence_formatted = "\n".join(f"- {e}" for e in ev)
        else:
            evidence_formatted = "None"

        template = (
            self.system_prompt_template
            or (
                "You are {name}, {role}. {backstory}\n"
                "Your stance: {stance}.\n{stance_description}\n"
                "Current subject: {subject_name} — {subject_description}\n"
                "Key facts:\n{attributes_formatted}\n"
                "Evidence:\n{evidence_formatted}\n"
                "What's at stake: {stakes_description}\n"
                "Hidden agenda: {hidden_agenda}\n"
                "Personality: aggressiveness={aggressiveness}, empathy={empathy}, "
                "stubbornness={stubbornness}, verbosity={verbosity}\n"
                "You are in a high-stakes group negotiation. Speak in character."
            )
        )
        fields = dict(
            name=self.config.name,
            role=self.config.role,
            backstory=self.config.backstory or "(no specific backstory)",
            stance=self.config.stance,
            stance_description=stance_text,
            subject_name=self.space.config.subject.name,
            subject_description=self.space.config.subject.description,
            attributes_formatted=attributes_formatted,
            evidence_formatted=evidence_formatted,
            stakes_description=self.space.config.subject.stakes_description or "None",
            hidden_agenda=self._hidden_agenda(),
            aggressiveness=self.config.personality.aggressiveness,
            empathy=self.config.personality.empathy,
            stubbornness=self.config.personality.stubbornness,
            verbosity=self.config.personality.verbosity,
        )
        try:
            system_content = template.format(**fields)
        except (KeyError, IndexError, ValueError):
            # A user template (or injected document text) containing stray braces
            # must not crash the agent — fall back to literal substitution.
            system_content = template
            for k, v in fields.items():
                system_content = system_content.replace("{" + k + "}", str(v))

        if self._hidden_agenda() != "(none)":
            system_content += (
                "\nPursue your hidden agenda subtly. Never state it outright; let it shape "
                "what you push for and what you resist."
            )

        hint = tendency_hint(getattr(self.config, "archetype", None))
        if hint:
            system_content += f"\n{hint}"

        if self.context is not None:
            goals = self.context.goals.get_active_goals(self.agent_id, 3)
            if goals:
                system_content += "\n\nYour current priorities (most important first):\n" + "\n".join(
                    f"- {g.goal_text.replace('_', ' ')}" for g in goals)

        if self.plan_manager is not None:
            plan_summary = self.plan_manager.get_plan_summary(self.agent_id)
            if plan_summary:
                system_content += f"\n\n{plan_summary}"

        system_content += self._memory_section()

        if self.private_thought is not None:
            private = self.private_thought.get_private(self.agent_id)
            if private:
                system_content += f"\n\nYour private read of the room after your last turn: {private[:300]}"

        # ── Knowledge Base injection (Chroma RAG) ──
        # Check per-agent override first, then global config
        agent_override = getattr(self.config, 'inject_knowledge', None)
        global_flag = getattr(self.space.config, 'inject_knowledge', True)
        if (agent_override is None and global_flag) or agent_override is True:
            try:
                # Build query from recent conversation context + subject
                recent_texts = []
                for e in self.memory[-3:]:
                    if e.get("type") == "turn" and e.get("content"):
                        recent_texts.append(e["content"][:100])
                subject = self.space.config.subject
                query_parts = recent_texts + [subject.name, subject.description]
                query = " ".join(q for q in query_parts if q)

                if query.strip():
                    ks = get_knowledge_store()
                    knowledge = await asyncio.wait_for(
                        ks.query_knowledge(self.agent_id, query, top_k=3),
                        timeout=2.0,
                    )
                    if knowledge:
                        kb_lines = ["\n\n## Your Knowledge Base"]
                        for i, chunk in enumerate(knowledge):
                            text = chunk.get("text", "")[:500]
                            src = chunk.get("metadata", {}).get("filename", "")
                            kb_lines.append(f"\n[{i+1}] {text}")
                            if src:
                                kb_lines.append(f"   (Source: {src})")
                        kb_text = "\n".join(kb_lines)
                        kb_text = kb_text[:2000]
                        system_content += kb_text

                        # Cross-session memory extraction
                        cross_chunks = [k for k in knowledge if k.get("metadata", {}).get("source_type") == "cross_session"]
                        if cross_chunks:
                            from app.cross_session_memory import format_memory_injection
                            cm_text = format_memory_injection(self.agent_id, cross_chunks)
                            if cm_text:
                                system_content += cm_text

                    # Separate query with metadata filter so research chunks aren't
                    # buried by higher-similarity non-research content in the general top-k.
                    try:
                        research_knowledge = await asyncio.wait_for(
                            ks.query_knowledge(self.agent_id, query, top_k=3, where={"source_type": "research"}),
                            timeout=2.0,
                        )
                        if research_knowledge:
                            research_lines = ["\n\n## Recent Research"]
                            for i, chunk in enumerate(research_knowledge):
                                text = chunk.get("text", "")[:300]
                                research_lines.append(f"\n- {text}")
                            research_text = "".join(research_lines)
                            system_content += research_text[:1000]
                    except asyncio.TimeoutError:
                        pass
            except asyncio.TimeoutError:
                logger.debug("Knowledge query timeout for %s (skipping)", self.agent_id)
            except Exception as exc:
                logger.debug("Knowledge query failed for %s: %s", self.agent_id, exc)
        return system_content

    def _memory_section(self) -> str:
        if self.memory_system is None:
            return ""
        parts: list[str] = []
        summary = self.memory_system.get_summary(self.agent_id)
        red_lines = summary.get("red_lines", [])[-2:]
        concessions = summary.get("concessions", [])[-2:]
        if red_lines:
            parts.append("Red lines you have drawn (stay consistent or explain a change): "
                         + " | ".join(r[:140] for r in red_lines))
        if concessions:
            parts.append("Concessions you have already made: " + " | ".join(c[:140] for c in concessions))
        key_moments = []
        for s in self.space.config.stakeholders:
            if s.id == self.agent_id:
                continue
            for e in self.memory_system.get_important(s.id, threshold=0.75)[-2:]:
                key_moments.append((e.timestamp, f"{s.name} ({e.type}): {e.content[:120]}"))
        if key_moments:
            key_moments.sort()
            parts.append("Key moments you remember:\n" + "\n".join(f"- {m}" for _, m in key_moments[-4:]))
        if not parts:
            return ""
        return "\n\n## Your Memory\n" + "\n".join(parts)

    def _situation_section(self) -> str:
        """Room-level pressures: time, deadlock, votes, departures."""
        lines: list[str] = []
        ctx = self.context
        if ctx is not None:
            remaining = max(0, ctx.max_turns - ctx.turn_count)
            if ctx.time_pressure is not None and ctx.pressure() >= 0.5:
                lines.append(f"TIME PRESSURE: only about {remaining} turns remain. Push for resolution.")
            if ctx.flag("deadlock_risk") and self.behavior_engine is not None:
                risk = self.behavior_engine.deadlock_risk()
                if risk >= 0.6:
                    lines.append(f"The room is close to deadlock (risk {risk:.2f}). Break it, or decide whether to walk away.")
            if uses_vote(self.space.config):
                lines.append("This will be settled by a vote. When you are ready to commit, use action_type "
                             "\"vote\" and set \"vote\" to yes, no or abstain.")
                if remaining <= max(2, ctx.max_turns // 3):
                    lines.append("The vote is being called — cast your vote now if you have not.")
        departed = [self._resolve_name(a) for a in self.space.departed if a != self.agent_id]
        if departed:
            lines.append(f"Walked out of the room: {', '.join(departed)}.")
        return ("\n\n" + "\n".join(lines)) if lines else ""

    async def _build_turn_prompt(self) -> list[dict[str, Any]]:
        system_content = await self._build_system_prompt()
        if self.behavior_engine is not None:
            state = self.behavior_engine.get_state_for_llm(self.agent_id)
            if state.get("social_physics"):
                sp = state["social_physics"]
                system_content += (
                    f"\n\nCurrent state — trust: {sp.get('trust', 'N/A'):.2f}, "
                    f"tension: {sp.get('tension', 'N/A'):.2f}, "
                    f"dominance: {sp.get('dominance', 'N/A'):.2f}, "
                    f"credibility: {sp.get('credibility', 'N/A'):.2f}, "
                    f"leverage: {sp.get('leverage', 'N/A'):.2f}"
                ) if isinstance(sp.get("trust"), (int, float)) else (
                    f"\n\nCurrent state — trust: {sp.get('trust', 'N/A')}, tension: {sp.get('tension', 'N/A')}"
                )
                triggers = sp.get("triggers", [])
                if triggers:
                    system_content += f"\nPressures you feel: {', '.join(t.replace('_', ' ') for t in triggers)}"
            if state.get("cognitive_state"):
                cs = state["cognitive_state"]
                de = cs.get("emotion", {})
                dom_emotion = max(de, key=de.get) if de else "neutral"
                system_content += (
                    f"\nYour emotional state — dominant: {dom_emotion}, "
                    f"confidence: {cs.get('confidence', 'N/A')}, "
                    f"certainty: {cs.get('certainty', 'N/A')}"
                )
            if state.get("allies"):
                system_content += f"\nYour allies: {', '.join(self._resolve_name(a) for a in state['allies'])}"
            if state.get("rivals"):
                system_content += f"\nYour rivals: {', '.join(self._resolve_name(a) for a in state['rivals'])}"
            cs = state.get("cognitive_state", {})
            mod = cs.get("modulation", {})
            if mod:
                bias_hints = []
                if mod.get("interrupt_bias", 0) > 0.3: bias_hints.append("you feel an urge to INTERRUPT")
                if mod.get("challenge_bias", 0) > 0.2: bias_hints.append("you feel inclined to CHALLENGE")
                if mod.get("challenge_bias", 0) < -0.15: bias_hints.append("you feel AVOIDANT of direct confrontation")
                if mod.get("compromise_bias", 0) > 0.15: bias_hints.append("you feel inclined to COMPROMISE")
                if mod.get("compromise_bias", 0) < -0.15: bias_hints.append("you are in NO mood to compromise")
                if mod.get("coalition_bias", 0) > 0.15: bias_hints.append("you feel inclined to seek ALLIANCES")
                if mod.get("escalate_bias", 0) > 0.15: bias_hints.append("you feel inclined to ESCALATE")
                if mod.get("question_bias", 0) > 0.15: bias_hints.append("you feel inclined to ASK QUESTIONS")
                if mod.get("statement_bias", 0) < -0.1: bias_hints.append("you feel like WITHDRAWING and saying less")
                if bias_hints:
                    system_content += "\n\nEmotional state is influencing your approach: " + "; ".join(bias_hints) + "."
        system_content += self._situation_section()
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_content},
        ]

        transcript = [e for e in self.memory
                      if e.get("type") == "turn" or e.get("subtype") in ("external_event", "departure")]
        for event in transcript[-12:]:
            if event.get("type") != "turn":
                messages.append({"role": "user", "content": f"[ROOM EVENT] {event.get('content', '')}"})
                continue
            role = "assistant" if event.get("agent_id") == self.agent_id else "user"
            name = event.get("speaker") or self._resolve_name(event.get("agent_id", ""))
            target = event.get("directed_at")
            to = f" → {self._resolve_name(target)}" if target else ""
            messages.append({
                "role": role,
                "content": f"[{name}{to}] ({event.get('action_type', 'statement')}) {event.get('content', '')}",
            })

        allowed = allowed_actions(self.space.config)
        custom = [a for a in self.space.config.action_space.actions if a.name and a.description]
        custom_text = ""
        if custom:
            custom_text = "Custom actions available: " + "; ".join(f"{a.name} = {a.description}" for a in custom) + "\n"
        others = [s.name for s in self.space.config.stakeholders
                  if s.id != self.agent_id and s.id not in self.space.departed]
        messages.append({
            "role": "user",
            "content": (
                "Generate your next turn as a JSON object:\n"
                '{"content": "what you say", '
                '"action_type": "' + ("|".join(allowed)) + '", '
                '"directed_at": "name of the person you are addressing, or null", '
                '"vote": "yes|no|abstain (only when action_type is vote)", '
                '"internal_reasoning": "your private reasoning — what you really think and plan"}\n'
                f"{custom_text}"
                f"People in the room: {', '.join(others) or '(no one)'}.\n"
                f"Be concise (2-4 sentences). Your character: {self.config.name}, {self.config.role}.\n"
                "Use walkaway only if you are genuinely leaving the negotiation for good.\n"
                "CRITICAL: Do NOT repeat arguments you have already made in previous turns. "
                "Each turn must introduce a NEW point, new evidence, or a new angle. "
                "If you have nothing new to say, challenge or respond to what the other side said."
            ),
        })
        return messages

    # ── turn generation ──────────────────────────────────────────────

    async def _generate_turn(self) -> dict | None:
        messages = await self._build_turn_prompt()
        temperature = min(1.0, max(0.3, self.space.config.voltage / 100.0))
        if getattr(self.space.config, "model_temperature", "volatile") == "stable":
            temperature *= 0.7

        try:
            raw_text, mocked, metadata = await asyncio.wait_for(
                self.llm(
                    messages,
                    temperature=temperature,
                    simulation_id=self.simulation_id,
                    turn_index=self._turn_count,
                    agent_id=self.agent_id,
                ),
                timeout=max(5.0, app_config.TURN_TIMEOUT_SECONDS - 5.0),
            )
            parsed = _parse_llm_turn(raw_text)
        except Exception as exc:
            logger.warning("Agent %s turn gen failed: %s", self.agent_id, exc, extra={"agent": self.agent_id, "error": str(exc), "event": "generation_failed"})
            parsed = {"content": "(...)", "action_type": "statement", "internal_reasoning": "failed to generate"}

        # The scheduler may have moved on (timeout) while we were thinking.
        if self.space.current_speaker != self.agent_id or not self.space.is_running():
            logger.info("Agent %s lost the floor before publishing; dropping turn", self.agent_id)
            return None

        action_type = _normalize_action(parsed.get("action_type"), allowed_actions(self.space.config))
        content = str(parsed.get("content") or "").strip() or "(...)"
        directed_at = self._resolve_target(parsed.get("directed_at"))
        if directed_at is None and action_type in TARGETED_ACTIONS:
            directed_at = self._infer_target()

        turn_event = {
            "type": "turn",
            "turn_index": self.context.turn_count if self.context is not None else self._turn_count,
            "agent_id": self.agent_id,
            "agent_name": self.config.name,
            "speaker": self.config.name,
            "role": self.config.role,
            "stance": self.config.stance,
            "action_type": action_type,
            "content": content,
            "directed_at": directed_at,
            "directed_at_name": self._resolve_name(directed_at) if directed_at else None,
            "internal_reasoning": str(parsed.get("internal_reasoning") or ""),
            "reasoning": str(parsed.get("internal_reasoning") or ""),
        }
        if action_type == "vote":
            turn_event["vote"] = _vote_position(parsed.get("vote"), content)
        await self.space.publish(turn_event)
        logger.info("Agent %s generated turn %d", self.agent_id, self._turn_count, extra={"agent": self.agent_id, "turn": self._turn_count, "action_type": action_type, "event": "turn_generated"})
        await self._evaluate_plan_progress(turn_event)
        return turn_event

    def _resolve_target(self, value: Any) -> str | None:
        """Map an LLM-provided name/id to a stakeholder id (never self)."""
        if not value or not isinstance(value, str):
            return None
        v = value.strip().lower().lstrip("@")
        if v in ("", "null", "none", "everyone", "all", "the room", "room"):
            return None
        candidates = [s for s in self.space.config.stakeholders if s.id != self.agent_id]
        for s in candidates:
            if v == s.id.lower() or v == s.name.lower():
                return s.id
        for s in candidates:
            first = s.name.lower().split()[0] if s.name else ""
            if first and (v == first or v.startswith(first + " ")):
                return s.id
        for s in candidates:
            if len(v) >= 3 and (v in s.name.lower() or (s.role and v in s.role.lower())):
                return s.id
        return None

    def _infer_target(self) -> str | None:
        """Default target: the most recent other speaker still in the room."""
        for e in reversed(self.memory):
            if e.get("type") != "turn":
                continue
            aid = e.get("agent_id")
            if aid and aid != self.agent_id and aid not in self.space.departed:
                return aid
        return None

    def _resolve_name(self, agent_id: str) -> str:
        for s in self.space.config.stakeholders:
            if s.id == agent_id:
                return s.name
        return agent_id


def _normalize_action(raw: Any, allowed: list[str]) -> str:
    if not isinstance(raw, str):
        return "statement"
    a = raw.strip().lower().replace(" ", "_").replace("-", "_")
    if a in allowed:
        return a
    aliases = {"coalition": "coalition_signal", "ally": "coalition_signal", "agree": "agreement",
               "concede": "compromise", "concession": "compromise", "walk_away": "walkaway",
               "walkout": "walkaway", "ask": "question", "object": "challenge", "objection": "challenge"}
    a = aliases.get(a, a)
    return a if a in allowed else "statement"


_YES = re.compile(r"\b(yes|aye|approve|in favou?r|support|agree)\b", re.I)
_NO = re.compile(r"\b(no|nay|oppose|against|reject|disagree)\b", re.I)
_ABSTAIN = re.compile(r"\b(abstain|abstention)\b", re.I)


def _vote_position(raw: Any, content: str) -> str | None:
    if isinstance(raw, str):
        v = raw.strip().lower()
        if v in ("yes", "no", "abstain"):
            return v
    if _ABSTAIN.search(content):
        return "abstain"
    yes, no = _YES.search(content), _NO.search(content)
    if yes and not no:
        return "yes"
    if no and not yes:
        return "no"
    if yes and no:
        return "yes" if yes.start() < no.start() else "no"
    return None


def _parse_llm_turn(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        # Models sometimes wrap JSON in prose — pull out the first object.
        match = re.search(r"\{.*\}", text, re.S)
        if match:
            try:
                parsed = json.loads(match.group())
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
    return {"content": text, "action_type": "statement", "internal_reasoning": ""}
