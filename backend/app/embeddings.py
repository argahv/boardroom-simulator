from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from . import config

logger = logging.getLogger("boardroom.embeddings")


def _build_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }


def _zero_vector() -> list[float]:
    return [0.0] * config.EMBEDDING_DIM


async def _post_embeddings(payload: dict[str, Any]) -> dict[str, Any]:
    """POST to OpenRouter embeddings endpoint with retry logic."""
    headers = _build_headers()
    last_error: Exception | None = None

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{config.OPENROUTER_BASE_URL}/embeddings",
                    headers=headers,
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Embedding attempt %d/3 failed: %s", attempt + 1, exc
            )
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)

    logger.error("Embedding failed after 3 retries: %s", last_error)
    raise last_error  # type: ignore[misc]


async def embed_text(text: str) -> list[float]:
    """Embed a single string via OpenRouter.

    Returns a 1536-dimensional float vector (or zero-vector on failure).

    Mock mode: returns zero-vector immediately when OPENROUTER_API_KEY is empty.
    """
    if not config.OPENROUTER_API_KEY:
        logger.info("Mock mode: returning zero vector (no API key)")
        return _zero_vector()

    payload = {
        "input": text,
        "model": config.OPENROUTER_EMBEDDING_MODEL,
    }

    try:
        body = await _post_embeddings(payload)
        data = body.get("data", [])
        if not data:
            logger.warning("Empty embedding data, returning zero vector")
            return _zero_vector()
        return data[0]["embedding"]
    except Exception:
        logger.warning("Embedding failed, falling back to zero vector")
        return _zero_vector()


async def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a list of strings via OpenRouter.

    Returns a list of float vectors (or zero-vectors on failure).

    Mock mode: returns zero-vectors immediately when OPENROUTER_API_KEY is empty.
    """
    if not config.OPENROUTER_API_KEY:
        logger.info("Mock mode: returning zero vectors (no API key)")
        return [_zero_vector() for _ in texts]

    if not texts:
        return []

    payload = {
        "input": texts,
        "model": config.OPENROUTER_EMBEDDING_MODEL,
    }

    try:
        body = await _post_embeddings(payload)
        data = body.get("data", [])

        if not data:
            logger.warning("Empty embedding batch data, returning zero vectors")
            return [_zero_vector() for _ in texts]

        results: list[list[float]] = [None] * len(data)  # type: ignore[list-item]
        for item in data:
            idx = item.get("index", 0)
            results[idx] = item["embedding"]

        # Fill any gaps with zero vectors
        for i in range(len(results)):
            if results[i] is None:
                results[i] = _zero_vector()

        return results
    except Exception:
        logger.warning("Batch embedding failed, falling back to zero vectors")
        return [_zero_vector() for _ in texts]
