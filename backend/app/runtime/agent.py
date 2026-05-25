from __future__ import annotations

import json
import logging
from typing import Any, Callable

from app.models import AgentStance, SimulationV2Config, StakeholderV2
from app.runtime.space import SharedSpace

logger = logging.getLogger(__name__)

LLMFunc = Callable[
    [list[dict[str, Any]], float, str | None, int | None, str | None],
    tuple[str, bool, dict[str, Any]],
]


class AgentRuntime:
    """
    Persistent agent loop: observe -> think -> decide -> act.

    Each agent runs as an asyncio Task with:
    - Private memory of every event it has observed
    - Self-directed bidding (urgency computed from personality + context)
    - LLM-based turn generation
    """

    def __init__(
        self,
        config: StakeholderV2,
        space: SharedSpace,
        llm: LLMFunc,
        system_prompt_template: str,
        simulation_id: str,
        behavior_engine: Any = None,
        memory_system: Any = None,
        private_thought: Any = None,
        plan_manager: Any = None,
    ) -> None:
        self.agent_id = config.id
        self.config = config
        self.space = space
        self.llm = llm
        self.system_prompt_template = system_prompt_template
        self.simulation_id = simulation_id
        self.behavior_engine = behavior_engine
        self.memory_system = memory_system
        self.private_thought = private_thought
        self.plan_manager = plan_manager

        self.memory: list[dict] = []
        self._last_event_index = -1
        self._known_version = -1
        self._turn_count = 0
        self._consecutive_events_since_bid = 0

    # ── main loop ────────────────────────────────────────────────────

    async def run(self) -> None:
        while self.space.is_running():
            self._known_version = await self.space.wait_for_change(self._known_version)

            new_events = self.space.events[self._last_event_index + 1 :]
            for event in new_events:
                self._last_event_index = event["_index"]
                self.memory.append(event)
                self._consecutive_events_since_bid += 1

                if self._should_bid(event):
                    strategy_score = await self._compute_strategy_score(event)
                    urgency = self._compute_urgency(event, strategy_score)
                    self.space.submit_bid(self.agent_id, urgency)
                    logger.debug("Agent %s bid urgency=%d", self.agent_id, urgency, extra={"agent": self.agent_id, "urgency": urgency, "event": "bid_submitted"})
                    self._consecutive_events_since_bid = 0

            if self.space.current_speaker == self.agent_id:
                turn_event = await self._generate_turn()
                self._turn_count += 1
                if self.plan_manager is not None:
                    await self._evaluate_plan_progress(turn_event)
                self.space.release_floor()

    def _should_bid(self, event: dict) -> bool:
        if event.get("agent_id") == self.agent_id:
            return False
        if event.get("type") == "system":
            return True
        if event.get("type") == "done":
            return False
        if self._consecutive_events_since_bid > 3:
            return True
        if self.behavior_engine is not None:
            state = self.behavior_engine.get_state_for_llm(self.agent_id)
            cs = state.get("cognitive_state", {})
            mod = cs.get("modulation", {})
            if mod.get("interrupt_bias", 0) > 0.3 and self._consecutive_events_since_bid > 1:
                return True
        return False

    def _compute_urgency(self, event: dict, strategy_score: int | None = None) -> int:
        base = 50
        base += self.config.personality.aggressiveness // 2
        spoke_last = event.get("agent_id", "")
        if spoke_last in self._trusted_allies():
            base -= 10
        if self._consecutive_events_since_bid > 5:
            base += 20
        if self.behavior_engine is not None:
            state = self.behavior_engine.get_state_for_llm(self.agent_id)
            sp = state.get("social_physics", {})
            if sp.get("tension", 0) > 0.7:
                base += 15
            if sp.get("dominance", 0) > 0.7:
                base += 10
            cs = state.get("cognitive_state", {})
            modulation = cs.get("modulation", {})
            if modulation:
                base += modulation.get("urgency_modifier", 0)
        deterministic = base
        if strategy_score is not None:
            base = int(base * 0.6 + strategy_score * 0.4)
        logger.debug("Bid %s urgency=%d (deterministic=%d, strategy=%s)",
                     self.agent_id, base, deterministic, strategy_score,
                     extra={"agent": self.agent_id, "urgency": base, "strategy_score": strategy_score,
                            "event": "bid_calculated"})
        return max(0, min(100, base))

    def _trusted_allies(self) -> set[str]:
        return {s.id for s in self.space.config.stakeholders if s.stance == self.config.stance}

    async def _compute_strategy_score(self, event: dict) -> int:
        if not hasattr(self, 'llm') or self.llm is None:
            return 50
        recent_context = ""
        for e in self.memory[-4:]:
            if e.get("type") == "turn":
                recent_context += f"[{e.get('agent_name', e.get('speaker', ''))}]: {e.get('content', '')[:80]}\n"
        strategy_prompt = [
            {"role": "system", "content": (
                f"You are {self.config.name}, {self.config.role}. "
                f"Your stance: {self.config.stance}. "
                f"Subject: {self.space.config.subject.name}. "
                f"Your hidden agenda: {self.config.hidden_agenda or '(none)'}."
            )},
            {"role": "user", "content": (
                f"Recent discussion:\n{recent_context}\n"
                f"On a scale of 0-100, how strategically important is it for you ({self.config.name}) "
                f"to speak RIGHT NOW? Consider your goals, your alliances, the current speaker, "
                f"and the topic. Return ONLY a number between 0 and 100."
            )},
        ]
        try:
            import asyncio
            raw_text, mocked, metadata = await asyncio.wait_for(
                self.llm(strategy_prompt, temperature=0.1,
                         simulation_id=self.simulation_id,
                         turn_index=self._turn_count,
                         agent_id=self.agent_id),
                timeout=2.0
            )
            score = int(''.join(c for c in raw_text.strip() if c.isdigit()) or '50')
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
        """Evaluate how the last turn affected active plans."""
        if self.plan_manager is None:
            return
        plans = self.plan_manager.get_active_plans(self.agent_id)
        if not plans:
            if self.behavior_engine is not None:
                state = self.behavior_engine.get_state_for_llm(self.agent_id)
                triggers = state.get("social_physics", {}).get("triggers", [])
                for trigger in triggers:
                    self._handle_trigger_plan(trigger)
            return

        plan = plans[0]
        action_type = turn.get("action_type", "")
        directed_at = turn.get("directed_at", "")

        for sg in plan.subgoals:
            if sg.status != "pending":
                continue

            if "weaken" in sg.description.lower() or "challenge" in sg.description.lower():
                if action_type in ("challenge", "question"):
                    sg.status = "completed"
                    sg.progress = 1.0
            elif "concession" in sg.description.lower() or "compromise" in sg.description.lower():
                if action_type == "compromise":
                    sg.status = "completed"
                    sg.progress = 1.0
            elif "ally" in sg.description.lower() or "coalition" in sg.description.lower():
                if action_type == "coalition_signal":
                    sg.status = "completed"
                    sg.progress = 1.0
            elif "defend" in sg.description.lower() or "position" in sg.description.lower():
                if action_type in ("statement", "challenge"):
                    sg.status = "completed"
                    sg.progress = 1.0

        self.plan_manager._recalculate_progress(plan)

    def _handle_trigger_plan(self, trigger: str) -> None:
        """Create a plan from a behavior trigger (e.g., 'trust_collapse' -> 'rebuild_trust')."""
        from app.runtime.goal_evolution import TRIGGER_GOAL_MAP
        if trigger in TRIGGER_GOAL_MAP:
            goal_text, _ = TRIGGER_GOAL_MAP[trigger]
            if self.plan_manager:
                existing = self.plan_manager.get_active_plans(self.agent_id)
                if not any(goal_text in p.goal_text for p in existing):
                    self.plan_manager.create_plan(
                        agent_id=self.agent_id,
                        goal_text=goal_text,
                        created_turn=self._turn_count,
                    )
                    logger.info("Plan created from trigger %s: %s", trigger, goal_text,
                               extra={"agent": self.agent_id, "trigger": trigger, "goal": goal_text,
                                      "event": "plan_created_from_trigger"})

    # ── prompt building ──────────────────────────────────────────────

    def _build_system_prompt(self) -> str:
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
                "You are in a boardroom debate. Speak in character."
            )
        )
        system_content = template.format(
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
            hidden_agenda=self.config.hidden_agenda or "(none)",
            aggressiveness=self.config.personality.aggressiveness,
            empathy=self.config.personality.empathy,
            stubbornness=self.config.personality.stubbornness,
            verbosity=self.config.personality.verbosity,
        )
        if self.plan_manager is not None:
            plan_summary = self.plan_manager.get_plan_summary(self.agent_id)
            if plan_summary:
                system_content += f"\n\n{plan_summary}"
        return system_content

    def _build_turn_prompt(self) -> list[dict[str, Any]]:
        system_content = self._build_system_prompt()
        if self.behavior_engine is not None:
            state = self.behavior_engine.get_state_for_llm(self.agent_id)
            if state.get("social_physics"):
                system_content += (
                    f"\n\nCurrent state — trust: {state['social_physics'].get('trust', 'N/A')}, "
                    f"tension: {state['social_physics'].get('tension', 'N/A')}, "
                    f"dominance: {state['social_physics'].get('dominance', 'N/A')}, "
                    f"credibility: {state['social_physics'].get('credibility', 'N/A')}"
                )
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
                system_content += f"\nYour allies: {', '.join(state['allies'])}"
            if state.get("rivals"):
                system_content += f"\nYour rivals: {', '.join(state['rivals'])}"
            cs = state.get("cognitive_state", {})
            mod = cs.get("modulation", {})
            if mod:
                bias_hints = []
                if mod.get("interrupt_bias", 0) > 0.3: bias_hints.append("you feel an urge to INTERRUPT")
                if mod.get("challenge_bias", 0) > 0.2: bias_hints.append("you feel inclined to CHALLENGE")
                if mod.get("challenge_bias", 0) < -0.15: bias_hints.append("you feel AVOIDANT of direct confrontation")
                if mod.get("compromise_bias", 0) > 0.15: bias_hints.append("you feel inclined to COMPROMISE")
                if mod.get("coalition_bias", 0) > 0.15: bias_hints.append("you feel inclined to seek ALLIANCES")
                if mod.get("escalate_bias", 0) > 0.15: bias_hints.append("you feel inclined to ESCALATE")
                if mod.get("question_bias", 0) > 0.15: bias_hints.append("you feel inclined to ASK QUESTIONS")
                if bias_hints:
                    system_content += "\n\nEmotional state is influencing your approach: " + "; ".join(bias_hints) + "."
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_content},
        ]

        recent = self.memory[-12:] if len(self.memory) > 12 else self.memory
        for event in recent:
            if event.get("type") != "turn":
                continue
            role = "assistant" if event.get("agent_id") == self.agent_id else "user"
            name = self._resolve_name(event.get("agent_id", ""))
            messages.append({
                "role": role,
                "content": f"[{name}] {event.get('content', '')}",
            })

        allowed = [a.name for a in self.space.config.action_space.actions] or [
            "statement", "question", "challenge", "compromise",
            "vote", "walkaway", "coalition_signal", "escalate",
        ]
        messages.append({
            "role": "user",
            "content": (
                "Generate your next turn as a JSON object:\n"
                '{"content": "what you say", '
                '"action_type": "' + ("|".join(allowed)) + '", '
                '"internal_reasoning": "your private reasoning"}\n'
                f"Be concise (2-4 sentences). Your character: {self.config.name}, {self.config.role}.\n"
                "CRITICAL: Do NOT repeat arguments you have already made in previous turns. "
                "Each turn must introduce a NEW point, new evidence, or a new angle. "
                "If you have nothing new to say, challenge or respond to what the other side said."
            ),
        })
        return messages

    # ── turn generation ──────────────────────────────────────────────

    async def _generate_turn(self) -> dict:
        messages = self._build_turn_prompt()
        temperature = min(1.0, max(0.3, self.space.config.voltage / 100.0))
        if getattr(self.space.config, "model_temperature", "volatile") == "stable":
            temperature *= 0.7

        try:
            raw_text, mocked, metadata = await self.llm(
                messages,
                temperature=temperature,
                simulation_id=self.simulation_id,
                turn_index=self._turn_count,
                agent_id=self.agent_id,
            )
            parsed = _parse_llm_turn(raw_text)
        except Exception as exc:
            logger.warning("Agent %s turn gen failed: %s", self.agent_id, exc, extra={"agent": self.agent_id, "error": str(exc), "event": "generation_failed"})
            parsed = {"content": "(...)", "action_type": "statement", "internal_reasoning": "failed to generate"}

        turn_event = {
            "type": "turn",
            "turn_index": self._turn_count,
            "agent_id": self.agent_id,
            "agent_name": self.config.name,
            "speaker": self.config.name,
            "role": self.config.role,
            "stance": self.config.stance,
            "action_type": parsed.get("action_type", "statement"),
            "content": parsed.get("content", ""),
            "internal_reasoning": parsed.get("internal_reasoning", ""),
            "reasoning": parsed.get("internal_reasoning", ""),
        }
        await self.space.publish(turn_event)
        logger.info("Agent %s generated turn %d", self.agent_id, self._turn_count, extra={"agent": self.agent_id, "turn": self._turn_count, "action_type": turn_event.get("action_type", "statement"), "event": "turn_generated"})
        if self.behavior_engine is not None:
            be_turn = {
                "agent_id": self.agent_id,
                "action_type": turn_event.get("action_type", "statement"),
                "target_id": turn_event.get("directed_at", None),
                "speaker_id": self.agent_id,
            }
            self.behavior_engine.process_turn(be_turn)
        if self.memory_system is not None:
            self.memory_system.record_event(
                event_type="turn",
                agent_id=self.agent_id,
                content=turn_event.get("content", ""),
                action_type=turn_event.get("action_type", "statement"),
                turn=self._turn_count,
            )
            self.memory_system.compress(self.agent_id)
        logger.debug("Agent %s published turn %d", self.agent_id, self._turn_count, extra={"agent": self.agent_id, "turn": self._turn_count, "action_type": turn_event.get("action_type", "statement"), "event": "turn_generated"})
        return turn_event

    def _resolve_name(self, agent_id: str) -> str:
        for s in self.space.config.stakeholders:
            if s.id == agent_id:
                return s.name
        return agent_id


def _parse_llm_turn(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"content": text, "action_type": "statement", "internal_reasoning": ""}
