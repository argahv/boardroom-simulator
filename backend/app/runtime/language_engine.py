"""Language Engine — thin LLM wrapper that receives state, generates speech.

This is the ONLY module that calls the LLM. It receives structured state
from BehaviorEngine and renders it as natural language. It does NOT
make decisions about state transitions.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def build_llm_context(
    state_snapshot: dict,
    agent_name: str,
    agent_role: str,
    recent_memory: list[dict],
    conversation_history: list[dict],
) -> list[dict[str, Any]]:
    """Build an LLM message array from behavior state + conversation context.

    The state_snapshot comes from BehaviorEngine.get_state_for_llm() and
    contains social_physics, cognitive_state, trust_scores, etc.

    Returns messages suitable for passing to an LLM API call.
    """
    messages: list[dict[str, Any]] = []

    # System prompt with state context
    system_parts = [f"You are {agent_name}, {agent_role}."]

    social = state_snapshot.get("social_physics", {})
    if social:
        system_parts.append(
            f"Social state: trust={social.get('trust', 'N/A')}, "
            f"tension={social.get('tension', 'N/A')}, "
            f"dominance={social.get('dominance', 'N/A')}"
        )

    cognitive = state_snapshot.get("cognitive_state", {})
    if cognitive:
        system_parts.append(
            f"Internal state: confidence={cognitive.get('confidence', 'N/A')}, "
            f"emotion={cognitive.get('emotion', {})}"
        )

    allies = state_snapshot.get("allies", [])
    rivals = state_snapshot.get("rivals", [])
    if allies:
        system_parts.append(f"Allies: {', '.join(allies)}")
    if rivals:
        system_parts.append(f"Rivals: {', '.join(rivals)}")

    messages.append({"role": "system", "content": "\n".join(system_parts)})

    # Recent conversation
    for msg in conversation_history[-8:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        messages.append({"role": role, "content": content})

    # Generation instruction
    allowed_actions = ["statement", "question", "challenge", "compromise"]
    messages.append({
        "role": "user",
        "content": (
            "Generate your next turn as JSON:\n"
            '{"content": "what you say", '
            '"action_type": "' + "|".join(allowed_actions) + '"}\n'
            "Be concise (2-4 sentences). Do NOT repeat arguments."
        ),
    })

    return messages


def parse_llm_response(raw: str) -> dict[str, Any]:
    """Parse LLM JSON response with fallback."""
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
        return {"content": text, "action_type": "statement"}


class LanguageEngine:
    """Thin wrapper around LLM API calls.

    Takes structured state from BehaviorEngine and conversation context,
    builds a prompt, calls the LLM, parses the response.
    Does NOT modify state — pure rendering.
    """

    def __init__(self, llm_func: Any = None) -> None:
        self._llm = llm_func

    def set_llm(self, llm_func: Any) -> None:
        self._llm = llm_func

    async def generate(
        self,
        state_snapshot: dict,
        agent_name: str,
        agent_role: str,
        recent_memory: list[dict],
        conversation: list[dict],
    ) -> dict[str, Any]:
        messages = build_llm_context(
            state_snapshot, agent_name, agent_role, recent_memory, conversation
        )

        if self._llm is None:
            return {
                "content": "(language engine: no LLM configured)",
                "action_type": "statement",
            }

        try:
            raw_text, mocked, metadata = await self._llm(
                messages,
                temperature=0.7,
            )
            return parse_llm_response(raw_text)
        except Exception as exc:
            logger.warning("LanguageEngine call failed: %s", exc)
            return {"content": "(generation failed)", "action_type": "statement"}
