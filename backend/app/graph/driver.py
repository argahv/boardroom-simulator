"""
Neo4j driver singleton with fire-and-forget safety.

- Returns None immediately if NEO4J_URI is unset (Neo4j is optional).
- All callers must guard with `if not neo4j_enabled(): return`.
- Never raises on connection failure — logs and returns None.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_driver = None
_driver_initialised = False


def neo4j_enabled() -> bool:
    """True only when NEO4J_URI is explicitly set in the environment."""
    return bool(os.getenv("NEO4J_URI", "").strip())


def get_driver():
    """
    Return the shared Neo4j AsyncDriver, lazily initialised.
    Returns None if Neo4j is disabled or the connection failed.
    """
    global _driver, _driver_initialised

    if _driver_initialised:
        return _driver

    _driver_initialised = True

    if not neo4j_enabled():
        logger.info("Neo4j disabled (NEO4J_URI not set) — graph analytics unavailable.")
        return None

    uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD", "boardroom")

    try:
        from neo4j import GraphDatabase  # type: ignore

        _driver = GraphDatabase.driver(uri, auth=(user, password))
        # Lightweight connectivity check
        _driver.verify_connectivity()
        logger.info("Neo4j driver connected to %s", uri)
    except Exception as exc:
        logger.warning("Neo4j connection failed (%s) — continuing without graph analytics.", exc)
        _driver = None

    return _driver


def close_driver() -> None:
    """Close the driver on application shutdown (best-effort)."""
    global _driver, _driver_initialised
    if _driver is not None:
        try:
            _driver.close()
            logger.info("Neo4j driver closed.")
        except Exception:
            pass
    _driver = None
    _driver_initialised = False
