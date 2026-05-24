"""
Graph schema initialisation (Neo4j / Memgraph).

Both backends use the same Cypher syntax (Memgraph 3+ is Neo4j-compatible).
Creates constraints and indexes required by the boardroom graph model.
Called once at application startup (idempotent — safe to re-run).

Node labels:
  - Simulation   {simulation_id}
  - Agent        {simulation_id, agent_id, name, role}
  - Turn         {simulation_id, turn_index}

Relationship types:
  - TRUSTS       (Agent)-[TRUSTS {score, simulation_id}]->(Agent)
  - SPOKE        (Turn)-[SPOKE {action_type}]->(Agent)
  - PART_OF      (Turn)-[PART_OF]->(Simulation)
  - INTERRUPTED  (Turn)-[INTERRUPTED {interrupt_type}]->(Turn)
  - COALITION    (Agent)-[COALITION {issue, turn_index}]->(Agent)
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_CONSTRAINTS = [
    ("simulation_id_unique",
     "CREATE CONSTRAINT simulation_id_unique IF NOT EXISTS "
     "FOR (s:Simulation) REQUIRE s.simulation_id IS UNIQUE"),
    ("agent_composite_unique",
     "CREATE CONSTRAINT agent_composite_unique IF NOT EXISTS "
     "FOR (a:Agent) REQUIRE (a.simulation_id, a.agent_id) IS UNIQUE"),
    ("turn_composite_unique",
     "CREATE CONSTRAINT turn_composite_unique IF NOT EXISTS "
     "FOR (t:Turn) REQUIRE (t.simulation_id, t.turn_index) IS UNIQUE"),
]

_INDEXES = [
    ("agent_simulation_idx",
     "CREATE INDEX agent_simulation_idx IF NOT EXISTS "
     "FOR (a:Agent) ON (a.simulation_id)"),
    ("turn_simulation_idx",
     "CREATE INDEX turn_simulation_idx IF NOT EXISTS "
     "FOR (t:Turn) ON (t.simulation_id)"),
    ("turn_action_idx",
     "CREATE INDEX turn_action_idx IF NOT EXISTS "
     "FOR (t:Turn) ON (t.action_type)"),
]


def init_schema(driver) -> bool:
    """Apply all constraints and indexes.  Returns True on success.  Never raises."""
    if driver is None:
        return False
    try:
        with driver.session() as session:
            for name, cypher in _CONSTRAINTS:
                try:
                    session.run(cypher)
                    logger.debug("Constraint applied: %s", name)
                except Exception as exc:
                    logger.warning("Constraint %s failed: %s", name, exc)
            for name, cypher in _INDEXES:
                try:
                    session.run(cypher)
                    logger.debug("Index applied: %s", name)
                except Exception as exc:
                    logger.warning("Index %s failed: %s", name, exc)
        logger.info("Graph schema initialised.")
        return True
    except Exception as exc:
        logger.warning("Graph schema init failed: %s", exc)
        return False
