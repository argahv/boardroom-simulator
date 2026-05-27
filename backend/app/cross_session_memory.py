"""Cross-session memory: persist simulation outcomes and inject in future runs."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("boardroom.cross_session_memory")

MAX_MEMORIES = 10  # cap at last 10 simulations


async def store_cross_session_memory(
    persona_id: str,
    simulation_id: str,
    subject: str,
    outcome_type: str,
    total_turns: int,
    lessons: list[str] | None = None,
) -> None:
    """Store a cross-session memory entry for a persona in Chroma."""
    from app.knowledge import get_knowledge_store

    lessons_text = ""
    if lessons:
        lessons_text = "\nLessons: " + "; ".join(lessons[:3])

    text = (
        f"Previous negotiation about: {subject}\n"
        f"Outcome: {outcome_type}\n"
        f"Duration: {total_turns} turns{lessons_text}"
    )

    ks = get_knowledge_store()
    await ks.add_document(
        persona_id=persona_id,
        doc_id=f"mem_{simulation_id}",
        text=text,
        metadata={
            "filename": f"cross_session_{simulation_id}.txt",
            "source_type": "cross_session",
            "simulation_id": simulation_id,
            "subject": subject,
            "outcome": outcome_type,
        },
    )
    logger.info("Cross-session memory stored for persona=%s sim=%s", persona_id, simulation_id)


def format_memory_injection(persona_id: str, memories: list[dict]) -> str:
    """Format top-2 memories as a prompt injection string.

    Args:
        persona_id: The persona's UUID
        memories: List of memory dicts from Chroma query results

    Returns:
        Formatted string for system prompt injection, or empty string
    """
    if not memories:
        return ""

    lines = ["\n## Past Experience"]
    count = 0
    for mem in memories:
        if count >= 2:
            break
        text = mem.get("text", "")
        if text:
            lines.append(f"\n- {text[:300]}")
            count += 1

    result = "\n".join(lines)
    if len(result) > 500:
        result = result[:497] + "..."
    return result
