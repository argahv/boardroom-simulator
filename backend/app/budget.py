"""
Budget / circuit-breaker layer for LLM calls.

Production pattern:
- Per-simulation token ledger (in-memory, resets on restart)
- Preflight check before every LLM call
- On 402/insufficient-credits: trip circuit-breaker for that sim
- Trip prevents further calls without hammering the provider
- Soft degrade: reduce max_tokens before hard stop

Usage:
    from app.budget import BudgetGuard, BudgetExhaustedError
    guard = BudgetGuard.for_simulation(simulation_id)
    guard.preflight(estimated_tokens)   # raises BudgetExhaustedError if tripped
    try:
        result = llm.invoke(...)
        guard.record(tokens_used)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 402:
            guard.trip("402 insufficient credits")
            raise BudgetExhaustedError("provider credits exhausted") from exc
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Dict, Optional

from app import config

logger = logging.getLogger(__name__)

# Global registry — sim_id → BudgetGuard
_registry: Dict[str, "BudgetGuard"] = {}
_lock = threading.Lock()


class BudgetExhaustedError(RuntimeError):
    """Raised when a simulation's token budget is exhausted or circuit is open."""
    def __init__(self, message: str, reason: str = "budget") -> None:
        super().__init__(message)
        self.reason = reason  # "budget" | "credits_402" | "cancelled"


@dataclass
class BudgetGuard:
    simulation_id: str
    budget_tokens: int = field(default_factory=lambda: config.SIMULATION_BUDGET_TOKENS)
    used_tokens: int = 0
    _tripped: bool = False
    _trip_reason: str = ""
    _lock: threading.Lock = field(default_factory=threading.Lock)

    # ── class-level factory ────────────────────────────────────────────────

    @classmethod
    def for_simulation(cls, simulation_id: str) -> "BudgetGuard":
        with _lock:
            if simulation_id not in _registry:
                _registry[simulation_id] = cls(simulation_id=simulation_id)
            return _registry[simulation_id]

    @classmethod
    def reset(cls, simulation_id: str) -> None:
        with _lock:
            _registry.pop(simulation_id, None)

    # ── public API ─────────────────────────────────────────────────────────

    @property
    def is_tripped(self) -> bool:
        return self._tripped

    @property
    def remaining_tokens(self) -> int:
        return max(0, self.budget_tokens - self.used_tokens)

    def preflight(self, estimated_tokens: int = 0) -> None:
        """Raise BudgetExhaustedError if circuit is open or budget exhausted."""
        with self._lock:
            if self._tripped:
                raise BudgetExhaustedError(
                    f"Budget circuit open for sim {self.simulation_id}: {self._trip_reason}",
                    reason=self._trip_reason,
                )
            if self.used_tokens + estimated_tokens > self.budget_tokens:
                self._tripped = True
                self._trip_reason = "budget"
                logger.warning(
                    "BUDGET_EXHAUSTED sim=%s used=%d budget=%d",
                    self.simulation_id,
                    self.used_tokens,
                    self.budget_tokens,
                )
                raise BudgetExhaustedError(
                    f"Token budget exhausted for sim {self.simulation_id} "
                    f"(used={self.used_tokens}, limit={self.budget_tokens})",
                    reason="budget",
                )

    def record(self, tokens_used: int) -> None:
        """Record tokens consumed by a successful call."""
        with self._lock:
            self.used_tokens += tokens_used
            logger.debug(
                "BUDGET_RECORD sim=%s delta=%d total=%d/%d",
                self.simulation_id,
                tokens_used,
                self.used_tokens,
                self.budget_tokens,
            )

    def trip(self, reason: str = "credits_402") -> None:
        """
        Manually trip the circuit (e.g. after a 402 from provider).
        All subsequent preflight() calls will immediately raise.
        """
        with self._lock:
            if not self._tripped:
                self._tripped = True
                self._trip_reason = reason
                logger.warning(
                    "BUDGET_CIRCUIT_TRIPPED sim=%s reason=%s",
                    self.simulation_id,
                    reason,
                )

    def dynamic_max_tokens(self, requested: int) -> int:
        """
        Return the safe max_tokens for the next call, shrinking as budget depletes.
        Never goes below MIN_OUTPUT_TOKENS.
        """
        with self._lock:
            fraction_remaining = self.remaining_tokens / max(1, self.budget_tokens)
            if fraction_remaining > 0.5:
                return requested
            elif fraction_remaining > 0.25:
                # Reduce to 70% of requested
                return max(config.MIN_OUTPUT_TOKENS, int(requested * 0.7))
            else:
                # Below 25% budget — cut to minimum
                return config.MIN_OUTPUT_TOKENS

    def status_dict(self) -> dict:
        return {
            "simulation_id": self.simulation_id,
            "budget_tokens": self.budget_tokens,
            "used_tokens": self.used_tokens,
            "remaining_tokens": self.remaining_tokens,
            "is_tripped": self._tripped,
            "trip_reason": self._trip_reason,
        }
