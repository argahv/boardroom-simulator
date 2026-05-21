from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

import httpx

from . import config

log = logging.getLogger(__name__)

_LANGSMITH_ENABLED = os.getenv("LANGSMITH_TRACING", "").lower() in ("true", "1", "yes")

try:
    if _LANGSMITH_ENABLED:
        from langsmith import traceable as _traceable, trace as _trace_context
    else:
        def _traceable(**_kwargs):  # type: ignore[misc]
            def _noop(fn):
                return fn
            return _noop
        
        class _DummyTrace:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
        
        def _trace_context(*args, **kwargs):
            return _DummyTrace()
except ImportError:
    def _traceable(**_kwargs):  # type: ignore[misc]
        def _noop(fn):
            return fn
        return _noop
    
    class _DummyTrace:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
    
    def _trace_context(*args, **kwargs):
        return _DummyTrace()


def estimate_token_cost(total_tokens: int, cost_per_million: float = 3.00) -> float:
    return (total_tokens / 1_000_000) * cost_per_million


def _strip_json_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    return text.strip()


@_traceable(
    name="openrouter_completion",
    run_type="llm",
    metadata={
        "provider": "openrouter",
        "streaming": False
    }
)
async def openrouter_completion(
    messages: list[dict[str, Any]],
    temperature: float = 0.6,
    *,
    simulation_id: Optional[str] = None,
    turn_index: Optional[int] = None,
    agent_id: Optional[str] = None,
) -> tuple[str, bool, dict[str, Any]]:
    """
    Returns (assistant_text, is_mocked, metadata).
    
    Enhanced with LangSmith tracing metadata:
    - simulation_id: Which simulation this completion belongs to
    - turn_index: Which turn this is
    - agent_id: Which agent is speaking
    - token_count: Total tokens used
    - cost: Estimated cost in USD
    """
    trace_metadata = {
        "simulation_id": simulation_id,
        "turn_index": turn_index,
        "agent_id": agent_id,
        "model": config.OPENROUTER_MODEL,
        "temperature": temperature
    }

    headers: dict[str, str] = {
        "Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    if config.OPENROUTER_HTTP_REFERRER:
        headers["HTTP-Referer"] = config.OPENROUTER_HTTP_REFERRER
    if config.OPENROUTER_APP_TITLE:
        headers["X-Title"] = config.OPENROUTER_APP_TITLE

    payload = {
        "model": config.OPENROUTER_MODEL,
        "messages": messages,
        "temperature": temperature,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{config.OPENROUTER_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        body = resp.json()

    choices = body.get("choices") or []
    if not choices:
        log.warning("Empty choices from OpenRouter: %s", body)
        return "{}", False, trace_metadata
    
    msg = choices[0].get("message") or {}
    content = msg.get("content") or ""
    
    usage = body.get("usage", {})
    total_tokens = usage.get("total_tokens", 0)
    
    cost_per_1m_tokens = 3.00
    estimated_cost = (total_tokens / 1_000_000) * cost_per_1m_tokens
    
    trace_metadata.update({
        "token_count": total_tokens,
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
        "cost_usd": round(estimated_cost, 4),
        "finish_reason": choices[0].get("finish_reason")
    })
    
    return content, False, trace_metadata


def parse_json_object(text: str) -> dict[str, Any]:
    cleaned = _strip_json_fence(text)
    return json.loads(cleaned)
