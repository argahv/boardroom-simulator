import logging
from . import config

logger = logging.getLogger(__name__)


class BudgetExhaustedError(Exception):
    def __init__(self, message: str, reason: str = "", **context: object):
        self.reason = reason
        self.context = context
        super().__init__(message)


class BudgetGuard:
    """Per-simulation token budget guard.

    Tracks token consumption against SIMULATION_BUDGET_TOKENS.
    Provides preflight checks and soft-fallback on exhaustion.
    """

    _sim_budgets: dict[str, "BudgetGuard"] = {}

    def __init__(self, budget: int) -> None:
        self.total = budget
        self.remaining = budget
        self.tripped = False

    @classmethod
    def for_simulation(cls, simulation_id: str) -> "BudgetGuard":
        """Get or create a budget guard for the given simulation."""
        if simulation_id not in cls._sim_budgets:
            budget = config.SIMULATION_BUDGET_TOKENS
            logger.info("BudgetGuard[%s] created with budget=%d", simulation_id, budget)
            cls._sim_budgets[simulation_id] = cls(budget)
        return cls._sim_budgets[simulation_id]

    def preflight(self, estimated_tokens: int = 0) -> None:
        """Check if budget remains; raise BudgetExhaustedError if exhausted."""
        if self.tripped:
            raise BudgetExhaustedError("Budget already tripped.", reason="tripped")
        if self.remaining <= 0:
            self.trip("exhausted")
            raise BudgetExhaustedError(
                f"Budget exhausted: {self.remaining}/{self.total} tokens remain.",
                reason="exhausted",
            )
        if self.remaining < estimated_tokens and not config.ENABLE_SOFT_FALLBACK:
            raise BudgetExhaustedError(
                f"Estimated tokens {estimated_tokens} exceed remaining {self.remaining}.",
                reason="insufficient",
            )

    def trip(self, reason: str = "unknown") -> None:
        """Permanently trip (disable) this budget guard."""
        self.tripped = True
        logger.warning("BudgetGuard tripped (reason=%s, remaining=%d/%d)", reason, self.remaining, self.total)

    def record(self, tokens: int) -> None:
        """Record token consumption."""
        self.remaining = max(0, self.remaining - tokens)
