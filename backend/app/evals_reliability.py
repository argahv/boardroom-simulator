"""
Lightweight reliability evaluators for boardroom simulator traces.

Intended checks:
- JSON validity rate
- Fallback rate
- Timeout rate
- Budget stop rate

This file provides functions that can be wired to LangSmith evaluators later.
"""
from __future__ import annotations

from typing import Any, Dict


def eval_json_validity(run_output: Dict[str, Any]) -> float:
    """1.0 when output contains structured fields expected from AgentResponse."""
    required = {"content", "action_type", "emotional_tone"}
    if not isinstance(run_output, dict):
        return 0.0
    return 1.0 if required.issubset(set(run_output.keys())) else 0.0


def eval_reliability_flags(event_log: list[str]) -> Dict[str, float]:
    """Simple rate flags from event log text markers."""
    total = max(1, len(event_log))
    fallback = sum(1 for e in event_log if "DEGRADED" in e or "fallback" in e.lower())
    timeout = sum(1 for e in event_log if "timeout" in e.lower())
    budget = sum(1 for e in event_log if "Budget stop" in e)
    return {
        "fallback_rate": fallback / total,
        "timeout_rate": timeout / total,
        "budget_stop_rate": budget / total,
    }
