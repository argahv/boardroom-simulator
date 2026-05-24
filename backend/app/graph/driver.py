"""
Graph database driver singleton with fire-and-forget safety.

Supports Neo4j (NEO4J_URI) and Memgraph (MEMGRAPH_URI).
- Returns None immediately if neither URI is set (graph is optional).
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
    """True when NEO4J_URI or MEMGRAPH_URI is set."""
    return bool(os.getenv("NEO4J_URI", "").strip()) or bool(os.getenv("MEMGRAPH_URI", "").strip())


def _backend_name() -> str:
    if os.getenv("MEMGRAPH_URI", "").strip():
        return "memgraph"
    return "neo4j"


def _get_uri() -> str:
    return os.getenv("MEMGRAPH_URI", "") or os.getenv("NEO4J_URI", "bolt://localhost:7687")


def get_driver():
    """
    Return the shared Neo4j AsyncDriver, lazily initialised.
    Returns None if graph is disabled or the connection failed.
    """
    global _driver, _driver_initialised

    if _driver_initialised:
        return _driver

    _driver_initialised = True

    if not neo4j_enabled():
        logger.info("Graph disabled — set NEO4J_URI or MEMGRAPH_URI to enable.")
        return None

    uri = _get_uri()
    backend = _backend_name()
    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD", "boardroom")

    try:
        from neo4j import GraphDatabase  # type: ignore

        if backend == "memgraph":
            _driver = GraphDatabase.driver(uri)
        else:
            _driver = GraphDatabase.driver(uri, auth=(user, password))

        _driver.verify_connectivity()
        logger.info("Graph driver connected to %s (%s)", backend, uri)
    except Exception as exc:
        logger.warning("Graph connection to %s failed (%s) — continuing without graph analytics.", backend, exc)
        _driver = None

    return _driver


def close_driver() -> None:
    """Close the driver on application shutdown (best-effort)."""
    global _driver, _driver_initialised
    if _driver is not None:
        try:
            _driver.close()
            logger.info("Graph driver closed.")
        except Exception:
            pass
    _driver = None
    _driver_initialised = False
