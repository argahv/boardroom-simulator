import logging
from typing import Any

from .space import SharedSpace
from .agent import AgentRuntime
from .scheduler import Scheduler
from .simulation import run_simulation

__all__ = ["SharedSpace", "AgentRuntime", "Scheduler", "run_simulation"]


class StructuredFormatter(logging.Formatter):
    """Custom formatter that appends extra context as key=value pairs."""
    _BASE_ATTRS: set[str] = set()

    def __init__(self, fmt: str | None = None, **kwargs: Any) -> None:
        super().__init__(fmt, **kwargs)
        if not StructuredFormatter._BASE_ATTRS:
            dummy = logging.LogRecord("", logging.INFO, "", 0, "", (), None)
            StructuredFormatter._BASE_ATTRS = set(dummy.__dict__.keys())

    def format(self, record: logging.LogRecord) -> str:
        extra = {k: v for k, v in record.__dict__.items()
                 if k not in self._BASE_ATTRS and not k.startswith("_")}
        if extra:
            pairs = " ".join(f"{k}={v!r}" for k, v in sorted(extra.items()))
            record.msg = f"{record.msg} [{pairs}]"
        return super().format(record)
