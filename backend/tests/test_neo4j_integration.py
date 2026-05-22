"""
Integration tests for the Neo4j graph analytics layer.

Tests cover:
1. neo4j_enabled() returns False when env var unset
2. GraphWriter.write_turn() returns False gracefully when driver is None
3. GraphQueries.build_graph_analytics() returns empty GraphAnalytics when driver is None
4. GraphWriter.write_turn() succeeds against a live Neo4j instance (skipped if unavailable)

Run with:
  cd backend && python -m pytest tests/test_neo4j_integration.py -v

Requires NEO4J_URI to be set for the live test (test_write_turn_live).
"""
from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch, call

import pytest


# ── Helpers ────────────────────────────────────────────────────────────────

def _make_sim(simulation_id: str = "test-sim-001"):
    """Build a minimal SimulationState for testing."""
    from app.models import (
        SimulationState, SimulationCreate, Stakeholder, EnvFlags
    )
    config = SimulationCreate(
        background="Test board meeting",
        primary_goal="Agree on budget allocation",
        stakeholders=[
            Stakeholder(id="alice", name="Alice", role="CFO", focus="cost"),
            Stakeholder(id="bob", name="Bob", role="CTO", focus="tech"),
        ],
        voltage=60,
        env_flags=EnvFlags(),
    )
    sim = SimulationState(
        simulation_id=simulation_id,
        config=config,
        trust_matrix={
            "alice": {"bob": 45},
            "bob": {"alice": 55},
        },
        leverage_scores={"alice": 60, "bob": 40},
        agent_objectives={"alice": ["cut costs"], "bob": ["expand infra"]},
    )
    return sim


def _make_turn(turn_index: int = 0, stakeholder_id: str = "alice", action_type: str = "statement"):
    """Build a minimal Turn for testing."""
    from app.models import Turn
    return Turn(
        turn_index=turn_index,
        stakeholder_id=stakeholder_id,
        stakeholder_name="Alice",
        role="CFO",
        content="We need to cut costs significantly.",
        internal_reasoning="Push for budget reduction.",
        action_type=action_type,
    )


# ── Test 1: neo4j_enabled() ─────────────────────────────────────────────────

class TestNeo4jEnabled(unittest.TestCase):

    def test_disabled_when_env_unset(self):
        """neo4j_enabled() must return False when NEO4J_URI is not set."""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("NEO4J_URI", None)
            from app.graph.driver import neo4j_enabled
            assert neo4j_enabled() is False

    def test_enabled_when_env_set(self):
        """neo4j_enabled() must return True when NEO4J_URI has a value."""
        with patch.dict(os.environ, {"NEO4J_URI": "bolt://localhost:7687"}):
            # Re-import to pick up env change
            import importlib
            import app.graph.driver as drv_mod
            importlib.reload(drv_mod)
            assert drv_mod.neo4j_enabled() is True
            # Reload back to clean state
            importlib.reload(drv_mod)


# ── Test 2: GraphWriter with None driver ────────────────────────────────────

class TestGraphWriterNoneDriver(unittest.TestCase):

    def test_write_turn_returns_false_on_none_driver(self):
        """GraphWriter.write_turn() must return False (not raise) when driver is None."""
        from app.graph.writer import GraphWriter
        writer = GraphWriter(driver=None)
        sim = _make_sim()
        turn = _make_turn()
        result = writer.write_turn(sim, turn)
        assert result is False

    def test_write_turn_returns_false_on_driver_exception(self):
        """GraphWriter.write_turn() must return False when driver.session() raises."""
        from app.graph.writer import GraphWriter
        bad_driver = MagicMock()
        bad_driver.session.side_effect = RuntimeError("connection refused")
        writer = GraphWriter(driver=bad_driver)
        sim = _make_sim()
        turn = _make_turn()
        result = writer.write_turn(sim, turn)
        assert result is False


# ── Test 3: GraphQueries with None driver ────────────────────────────────────

class TestGraphQueriesNoneDriver(unittest.TestCase):

    def test_build_graph_analytics_none_driver(self):
        """build_graph_analytics() must return a valid GraphAnalytics with neo4j_available=False."""
        from app.graph.queries import GraphQueries
        from app.models import GraphAnalytics
        queries = GraphQueries(driver=None)
        result = queries.build_graph_analytics("test-sim-001")
        assert isinstance(result, GraphAnalytics)
        assert result.neo4j_available is False
        assert result.hostile_pairs == []
        assert result.influence_chain == []
        assert result.coalition_evolution == []
        assert result.interrupt_chain == []

    def test_individual_query_methods_return_empty_list(self):
        """All individual query methods return [] when driver is None."""
        from app.graph.queries import GraphQueries
        q = GraphQueries(driver=None)
        assert q.hostile_pairs("sim-id") == []
        assert q.influence_chain("sim-id") == []
        assert q.coalition_evolution("sim-id") == []
        assert q.interrupt_chain("sim-id") == []
        assert q.cross_sim_patterns("agent-id") == []


# ── Test 4: Live Neo4j write (skipped if NEO4J_URI unset) ───────────────────

@pytest.mark.skipif(
    not os.getenv("NEO4J_URI"),
    reason="NEO4J_URI not set — skipping live Neo4j test"
)
class TestGraphWriterLive(unittest.TestCase):

    def test_write_turn_live(self):
        """Write a turn to Neo4j and verify nodes + relationships exist."""
        import importlib
        import app.graph.driver as drv_mod
        importlib.reload(drv_mod)  # pick up NEO4J_URI from env

        driver = drv_mod.get_driver()
        assert driver is not None, "Expected live Neo4j driver"

        from app.graph.schema import init_schema
        init_schema(driver)

        from app.graph.writer import GraphWriter
        writer = GraphWriter(driver=driver)

        sim = _make_sim(simulation_id="live-test-sim")
        turn = _make_turn(turn_index=0, stakeholder_id="alice", action_type="challenge")
        turn.directed_at = "bob"

        result = writer.write_turn(sim, turn)
        assert result is True, "write_turn should return True on success"

        # Verify nodes were created
        with driver.session() as session:
            r = session.run(
                "MATCH (s:Simulation {simulation_id: $sid}) RETURN s",
                sid="live-test-sim"
            )
            assert r.single() is not None, "Simulation node should exist"

            r2 = session.run(
                "MATCH (a:Agent {simulation_id: $sid, agent_id: 'alice'}) RETURN a",
                sid="live-test-sim"
            )
            assert r2.single() is not None, "Alice agent node should exist"

            r3 = session.run(
                "MATCH (t:Turn {simulation_id: $sid, turn_index: 0}) RETURN t",
                sid="live-test-sim"
            )
            assert r3.single() is not None, "Turn node should exist"

        # Cleanup
        with driver.session() as session:
            session.run(
                "MATCH (n) WHERE n.simulation_id = $sid DETACH DELETE n",
                sid="live-test-sim"
            )

        drv_mod.close_driver()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
