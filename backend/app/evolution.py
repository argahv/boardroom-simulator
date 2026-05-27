"""Evolution engine — maps simulation outcomes to personality trait shifts.

This module provides deterministic, rule-based mapping from simulation
TerminationResults to proposed personality changes for each persona.
It does NOT apply changes directly — it computes proposals that must
be approved by a human in the loop (T18 approval).

Design constraints:
  - No LLM calls: all mappings are pure deterministic rules
  - No mutations: functions return proposals, don't touch persona records
  - Bounded deltas: single delta never exceeds ±10, final values clamped [0, 100]
  - Stance shifts require extreme outliers (≤10% probability outcomes)
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("boardroom.evolution")

# ── Constants ────────────────────────────────────────────────────────────

MAX_DELTA = 10
"""Hard cap on any single trait delta per evolution cycle."""

MIN_TRAIT = 0
MAX_TRAIT = 100
"""Valid range for all personality traits (matches PersonalityProfile fields)."""

STANCE_SHIFT_THRESHOLD = 5
"""Only propose a stance shift when outcome probability ≤ 10% (extreme outliers).
Value represents the number of standard deviations from mean required.
"""

TRAITS = ("aggressiveness", "empathy", "stubbornness", "verbosity")
"""Ordered tuple of all tracked personality traits."""

# ── Outcome Mapping Rules ───────────────────────────────────────────────

OUTCOME_RULES: dict[str, dict[str, int]] = {
    "vote_win": {
        "aggressiveness": +5,
        "empathy": -3,
        "stubbornness": 0,
        "verbosity": 0,
    },
    "vote_loss": {
        "aggressiveness": 0,
        "empathy": +5,
        "stubbornness": -5,
        "verbosity": 0,
    },
    "consensus": {
        "aggressiveness": -3,
        "empathy": +3,
        "stubbornness": 0,
        "verbosity": 0,
    },
    "deadlock": {
        "aggressiveness": +5,
        "empathy": -5,
        "stubbornness": +5,
        "verbosity": 0,
    },
    "timeout": {
        "aggressiveness": +5,
        "empathy": -5,
        "stubbornness": +5,
        "verbosity": 0,
    },
    "walkaway": {
        "aggressiveness": +10,
        "empathy": +5,
        "stubbornness": 0,
        "verbosity": 0,
    },
}
"""Deterministic trait delta rules for each outcome type.
Keys match TerminationResult.outcome_type (with vote split by win/loss).
"""


# ── Core Functions ──────────────────────────────────────────────────────


def compute_evolution_deltas(
    persona_stance: str,
    simulation_result: dict[str, Any],
) -> dict[str, int]:
    """Compute proposed personality deltas from a simulation outcome.

    Deterministic rule mapping — no LLM or randomness involved.

    Args:
        persona_stance:
            The persona's negotiation stance. One of:
            ``"champion"``, ``"detractor"``, ``"neutral"``,
            ``"moderator"``, ``"wildcard"``.
        simulation_result:
            Dict representation of a ``TerminationResult`` plus metadata.
            Required keys:

            - ``outcome_type`` (str): ``"vote"`` | ``"consensus"`` |
              ``"timeout"`` | ``"deadlock"`` | ``"walkaway"``
            - ``vote_result`` (str, optional): ``"win"`` | ``"loss"`` |
              ``"tie"`` — only used when ``outcome_type == "vote"``
            - ``vote_breakdown`` (dict, optional): ``{"for": N, "against": N}``
              — fallback when ``vote_result`` is absent.

    Returns:
        Dict with proposed deltas for all four traits. Every key
        (``aggressiveness``, ``empathy``, ``stubbornness``, ``verbosity``)
        is always present. Each delta is clamped to ``[-MAX_DELTA, +MAX_DELTA]``.

    Examples:
        >>> compute_evolution_deltas("champion", {"outcome_type": "vote", "vote_result": "win"})
        {'aggressiveness': 5, 'empathy': -3, 'stubbornness': 0, 'verbosity': 0}

        >>> compute_evolution_deltas("detractor", {"outcome_type": "timeout"})
        {'aggressiveness': 5, 'empathy': -5, 'stubbornness': 5, 'verbosity': 0}
    """
    outcome_type = simulation_result.get("outcome_type", "timeout")
    deltas = dict.fromkeys(TRAITS, 0)

    if outcome_type == "vote":
        vote_result = simulation_result.get("vote_result", "")
        stance_won = _did_stance_win(persona_stance, vote_result, simulation_result)

        if stance_won:
            deltas.update(OUTCOME_RULES["vote_win"])
            logger.debug("Vote win for '%s' → agg+%d, emp%d",
                         persona_stance,
                         OUTCOME_RULES["vote_win"]["aggressiveness"],
                         OUTCOME_RULES["vote_win"]["empathy"])
        else:
            deltas.update(OUTCOME_RULES["vote_loss"])
            logger.debug("Vote loss for '%s' → stubb%d, emp+%d",
                         persona_stance,
                         OUTCOME_RULES["vote_loss"]["stubbornness"],
                         OUTCOME_RULES["vote_loss"]["empathy"])

    elif outcome_type == "consensus":
        deltas.update(OUTCOME_RULES["consensus"])
        logger.debug("Consensus → emp+%d, agg%d",
                     OUTCOME_RULES["consensus"]["empathy"],
                     OUTCOME_RULES["consensus"]["aggressiveness"])

    elif outcome_type == "timeout":
        deltas.update(OUTCOME_RULES["timeout"])
        logger.debug("Timeout → stubb+%d, agg+%d, emp%d",
                     OUTCOME_RULES["timeout"]["stubbornness"],
                     OUTCOME_RULES["timeout"]["aggressiveness"],
                     OUTCOME_RULES["timeout"]["empathy"])

    elif outcome_type == "deadlock":
        deltas.update(OUTCOME_RULES["deadlock"])
        logger.debug("Deadlock → stubb+%d, agg+%d, emp%d",
                     OUTCOME_RULES["deadlock"]["stubbornness"],
                     OUTCOME_RULES["deadlock"]["aggressiveness"],
                     OUTCOME_RULES["deadlock"]["empathy"])

    elif outcome_type == "walkaway":
        deltas.update(OUTCOME_RULES["walkaway"])
        logger.debug("Walkaway → agg+%d, emp+%d",
                     OUTCOME_RULES["walkaway"]["aggressiveness"],
                     OUTCOME_RULES["walkaway"]["empathy"])

    else:
        logger.warning("Unknown outcome_type '%s' — returning zero deltas",
                       outcome_type)

    # Enforce per-delta cap
    for trait in TRAITS:
        deltas[trait] = max(-MAX_DELTA, min(MAX_DELTA, deltas[trait]))

    return deltas


def _did_stance_win(
    persona_stance: str,
    vote_result: str,
    simulation_result: dict[str, Any],
) -> bool | None:
    """Determine whether a persona's stance-side won the vote.

    Resolution priority:
      1. Explicit ``vote_result`` field (``"win"`` | ``"loss"``)
      2. Inferred from ``vote_breakdown.for`` vs ``vote_breakdown.against``
      3. Returns ``None`` if outcome cannot be determined

    Args:
        persona_stance: The stance label (used in logging, not for inference).
        vote_result: ``"win"``, ``"loss"``, ``"tie"``, or ``""``.
        simulation_result: Full simulation result with optional
            ``vote_breakdown`` dict.

    Returns:
        ``True`` if stance won, ``False`` if lost, ``None`` if indeterminate.
    """
    if vote_result == "win":
        return True
    if vote_result == "loss":
        return False

    vote_breakdown = simulation_result.get("vote_breakdown", {})
    if vote_breakdown:
        for_ = vote_breakdown.get("for", 0)
        against_ = vote_breakdown.get("against", 0)
        if for_ > against_:
            logger.debug("Inferred vote win for '%s' (for=%d > against=%d)",
                         persona_stance, for_, against_)
            return True
        if against_ > for_:
            logger.debug("Inferred vote loss for '%s' (for=%d <= against=%d)",
                         persona_stance, for_, against_)
            return False

    logger.warning("Cannot determine vote outcome for stance '%s' "
                   "(vote_result=%r, breakdown=%s)",
                   persona_stance, vote_result, vote_breakdown)
    return None


# ── Full Evolution Pipeline ─────────────────────────────────────────────


def compute_evolution(
    persona_id: str,
    current_personality: dict[str, int],
    persona_stance: str,
    simulation_result: dict[str, Any],
) -> dict[str, Any]:
    """Full evolution computation: read current state, compute deltas,
    apply bounds, return a complete evolution proposal.

    This is the primary entry point for the T16→T18 evolution pipeline.
    It does **not** mutate any record — it returns a proposal dict.

    Args:
        persona_id:
            UUID or slug identifying the persona.
        current_personality:
            Current trait values. Expected keys:
            ``aggressiveness``, ``empathy``, ``stubbornness``, ``verbosity``.
            Missing keys default to ``50``.
        persona_stance:
            The persona's current stance label.
        simulation_result:
            Dict representation of the simulation's ``TerminationResult``
            plus any additional metadata. See ``compute_evolution_deltas``
            for required fields.

    Returns:
        Evolution proposal dict with the following structure:

        .. code-block:: python

            {
                "persona_id": str,
                "deltas": {"aggressiveness": int, "empathy": int, ...},
                "personality_before": {"aggressiveness": int, ...},
                "personality_after": {"aggressiveness": int, ...},
                "stance_before": str,
                "stance_after": str,           # same as before unless extreme
                "stance_shift_proposed": bool,  # True only on extreme outcomes
            }
    """
    deltas = compute_evolution_deltas(persona_stance, simulation_result)

    before = dict(current_personality)
    after: dict[str, int] = {}
    for trait in TRAITS:
        current = current_personality.get(trait, 50)
        new_val = _clamp_trait(current + deltas.get(trait, 0))
        after[trait] = new_val

    # Stance shift: only on extreme outlier outcomes
    stance_shift_proposed = _is_extreme_outcome(simulation_result)

    proposal: dict[str, Any] = {
        "persona_id": persona_id,
        "deltas": deltas,
        "personality_before": before,
        "personality_after": after,
        "stance_before": persona_stance,
        "stance_after": persona_stance,  # unchanged unless approved
        "stance_shift_proposed": stance_shift_proposed,
    }

    logger.info("Evolution proposal for %s (stance=%s, outcome=%s): "
                "deltas=%s, stance_shift=%s",
                persona_id, persona_stance,
                simulation_result.get("outcome_type", "?"),
                deltas, stance_shift_proposed)

    return proposal


# ── Utilities ────────────────────────────────────────────────────────────


def _clamp_trait(value: int) -> int:
    """Clamp a single trait value to the valid ``[MIN_TRAIT, MAX_TRAIT]`` range.

    Args:
        value: Raw trait value (may be out of range).

    Returns:
        Clamped integer in ``[0, 100]``.
    """
    return max(MIN_TRAIT, min(MAX_TRAIT, value))


def _is_extreme_outcome(simulation_result: dict[str, Any]) -> bool:
    """Check whether a simulation result qualifies as an extreme outlier.

    Extreme outcomes are those with probability ≤ 10%. Currently detected:
      - ``walkaway`` (a persona voluntarily leaves the negotiation)
      - ``deadlock`` (complete impasse, no issue resolved)
      - Any outcome with ``confidence ≤ 0.15``
        (simulation is highly uncertain about its own result)

    Args:
        simulation_result: The TerminationResult-style dict.

    Returns:
        ``True`` if the outcome is extreme enough to warrant a stance shift.
    """
    outcome_type = simulation_result.get("outcome_type", "")
    if outcome_type in ("walkaway", "deadlock"):
        logger.debug("Extreme outcome detected: %s → stance shift eligible",
                     outcome_type)
        return True

    confidence = simulation_result.get("confidence", 1.0)
    if isinstance(confidence, (int, float)) and confidence <= 0.15:
        logger.debug("Low-confidence outcome (%.2f) → stance shift eligible",
                     confidence)
        return True

    return False


# ── Database-Backed Service ─────────────────────────────────────────────

import json as _json
from uuid import uuid4 as _uuid4
from datetime import datetime as _dt, timezone as _tz


class EvolutionService:
    """Stores evolution proposals from simulation outcomes into the DB."""

    def __init__(self, db):
        self._db = db

    async def compute_and_store(
        self,
        persona_id: str,
        simulation_id: str,
        current_personality: dict[str, int],
        current_stance: str,
        simulation_result: dict,
    ) -> dict | None:
        from app.models import PersonaEvolution

        proposal = compute_evolution(
            persona_id, current_personality, current_stance, simulation_result
        )
        evo = PersonaEvolution(
            id=str(_uuid4()),
            persona_id=persona_id,
            simulation_id=simulation_id,
            proposed_deltas=_json.dumps(proposal["deltas"]),
            before_snapshot=_json.dumps(
                proposal.get("personality_before", current_personality)
            ),
            status="pending",
            applied_at=None,
            created_at=_dt.now(_tz.utc).isoformat(),
        )
        await self._db.create_persona_evolution(evo)
        return proposal

    async def get_pending_evolutions(self, persona_id: str) -> list[dict]:
        raw = await self._db.get_pending_evolutions(persona_id)
        return [r.model_dump() if hasattr(r, "model_dump") else r for r in raw]

    async def get_evolution_history(self, persona_id: str) -> list[dict]:
        raw = await self._db.get_evolution_history(persona_id)
        return [r.model_dump() if hasattr(r, "model_dump") else r for r in raw]


# ── Public alias ────────────────────────────────────────────────────────

clamp_trait = _clamp_trait
"""Public alias for _clamp_trait. Clamps a trait value to [0, 100]."""


# ── Public API ──────────────────────────────────────────────────────────

__all__ = [
    "compute_evolution_deltas",
    "compute_evolution",
    "clamp_trait",
    "EvolutionService",
    "MAX_DELTA",
    "MIN_TRAIT",
    "MAX_TRAIT",
    "TRAITS",
    "OUTCOME_RULES",
]
