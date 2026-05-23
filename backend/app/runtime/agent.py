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
    ) -> None:
        self.agent_id = config.id
        self.config = config
        self.space = space
        self.llm = llm
        self.system_prompt_template = system_prompt_template
        self.simulation_id = simulation_id

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
                    urgency = self._compute_urgency(event)
                    self.space.submit_bid(self.agent_id, urgency)
                    self._consecutive_events_since_bid = 0

            if self.space.current_speaker == self.agent_id:
                turn_event = await self._generate_turn()
                self._turn_count += 1
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
        return False

    def _compute_urgency(self, event: dict) -> int:
        base = 50
        base += self.config.personality.aggressiveness // 2
        spoke_last = event.get("agent_id", "")
        if spoke_last in self._trusted_allies():
            base -= 10
        if self._consecutive_events_since_bid > 5:
            base += 20
        return max(0, min(100, base))

    def _trusted_allies(self) -> set[str]:
        return {s.id for s in self.space.config.stakeholders if s.stance == self.config.stance}

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

        template = (
            self.system_prompt_template
            or (
                "You are {name}, {role}. {backstory}\n"
                "Your stance: {stance}.\n{stance_description}\n"
                "Current subject: {subject_name} — {subject_description}\n"
                "Hidden agenda: {hidden_agenda}\n"
                "Personality: aggressiveness={aggressiveness}, empathy={empathy}, "
                "stubbornness={stubbornness}, verbosity={verbosity}\n"
                "You are in a boardroom debate. Speak in character."
            )
        )
        return template.format(
            name=self.config.name,
            role=self.config.role,
            backstory=self.config.backstory or "(no specific backstory)",
            stance=self.config.stance,
            stance_description=stance_text,
            subject_name=self.space.config.subject.name,
            subject_description=self.space.config.subject.description,
            hidden_agenda=self.config.hidden_agenda or "(none)",
            aggressiveness=self.config.personality.aggressiveness,
            empathy=self.config.personality.empathy,
            stubbornness=self.config.personality.stubbornness,
            verbosity=self.config.personality.verbosity,
        )

    def _build_turn_prompt(self) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": self._build_system_prompt()},
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
            "statement", "question", "challenge", "compromise"
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
            logger.warning("Agent %s turn gen failed: %s", self.agent_id, exc)
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
        logger.debug("Agent %s published turn %d", self.agent_id, self._turn_count)
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
