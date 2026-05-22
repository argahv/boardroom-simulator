"""
GraphQueries — read-only Neo4j analytics for postmortem enrichment.

Design rules:
- Every method returns an empty list (or default) on any failure — never raises.
- Every MATCH is scoped by simulation_id (except cross_sim_patterns which intentionally spans).
- Called only from the postmortem endpoint — not in the hot path.
- Returns typed Pydantic models imported from models.py.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class GraphQueries:
    """Read-only analytics queries against the boardroom Neo4j graph."""

    def __init__(self, driver) -> None:
        self._driver = driver

    # ── public API ────────────────────────────────────────────────────────

    def hostile_pairs(self, simulation_id: str) -> list[dict]:
        """
        Return agent pairs where BOTH mutual trust scores are below 40.
        Also counts how many times each pair clashed (challenge/escalate turns).
        """
        if self._driver is None:
            return []
        try:
            with self._driver.session() as session:
                result = session.run(
                    """
                    MATCH (a:Agent {simulation_id: $sid})-[r1:TRUSTS]->(b:Agent {simulation_id: $sid})
                    MATCH (b)-[r2:TRUSTS]->(a)
                    WHERE r1.score < 40 AND r2.score < 40 AND a.agent_id < b.agent_id
                    OPTIONAL MATCH (t:Turn {simulation_id: $sid})-[:SPOKE]->(a)
                    WHERE t.action_type IN ['challenge', 'escalate']
                      AND t.stakeholder_id = a.agent_id
                    WITH a, b, r1, r2, count(t) AS clash_count
                    RETURN
                      a.agent_id  AS agent_a,
                      b.agent_id  AS agent_b,
                      r1.score    AS trust_a_to_b,
                      r2.score    AS trust_b_to_a,
                      clash_count
                    ORDER BY (r1.score + r2.score) ASC
                    LIMIT 10
                    """,
                    sid=simulation_id,
                )
                return [dict(r) for r in result]
        except Exception as exc:
            logger.warning("GraphQueries.hostile_pairs failed: %s", exc)
            return []

    def influence_chain(self, simulation_id: str) -> list[dict]:
        """
        Rank agents by out-degree (number of unique agents they directly addressed/interrupted)
        and average leverage delta across all their turns.
        """
        if self._driver is None:
            return []
        try:
            with self._driver.session() as session:
                result = session.run(
                    """
                    MATCH (a:Agent {simulation_id: $sid})
                    OPTIONAL MATCH (t:Turn {simulation_id: $sid})-[:SPOKE]->(a)
                    WITH a, collect(t) AS turns
                    UNWIND turns AS turn
                    WITH a,
                         size([(turn)-[:INTERRUPTED]->(target) | target]) AS interrupted_count,
                         turn.interrupt_bid AS bid
                    WITH a,
                         count(*) AS out_degree,
                         avg(coalesce(bid, 0.0)) AS avg_leverage_delta
                    RETURN
                      a.agent_id AS agent_id,
                      a.name     AS name,
                      out_degree,
                      avg_leverage_delta
                    ORDER BY out_degree DESC, avg_leverage_delta DESC
                    LIMIT 10
                    """,
                    sid=simulation_id,
                )
                return [dict(r) for r in result]
        except Exception as exc:
            logger.warning("GraphQueries.influence_chain failed: %s", exc)
            return []

    def coalition_evolution(self, simulation_id: str) -> list[dict]:
        """
        Return all coalitions with their first/last turn and computed duration.
        """
        if self._driver is None:
            return []
        try:
            with self._driver.session() as session:
                result = session.run(
                    """
                    MATCH (a:Agent {simulation_id: $sid})-[c:COALITION]->(b:Agent {simulation_id: $sid})
                    RETURN
                      a.agent_id          AS agent_a,
                      b.agent_id          AS agent_b,
                      c.issue             AS issue,
                      c.first_turn        AS first_turn,
                      c.last_turn         AS last_turn,
                      (c.last_turn - c.first_turn + 1) AS duration_turns
                    ORDER BY first_turn ASC
                    """,
                    sid=simulation_id,
                )
                return [dict(r) for r in result]
        except Exception as exc:
            logger.warning("GraphQueries.coalition_evolution failed: %s", exc)
            return []

    def interrupt_chain(self, simulation_id: str) -> list[dict]:
        """
        Return the full ordered interrupt sequence for replay.
        """
        if self._driver is None:
            return []
        try:
            with self._driver.session() as session:
                result = session.run(
                    """
                    MATCH (t:Turn {simulation_id: $sid})-[i:INTERRUPTED]->(target:Agent {simulation_id: $sid})
                    RETURN
                      i.interrupter_id  AS interrupter_id,
                      i.interrupted_id  AS interrupted_id,
                      i.interrupt_type  AS interrupt_type,
                      t.turn_index      AS turn_index
                    ORDER BY t.turn_index ASC
                    """,
                    sid=simulation_id,
                )
                return [dict(r) for r in result]
        except Exception as exc:
            logger.warning("GraphQueries.interrupt_chain failed: %s", exc)
            return []

    def cross_sim_patterns(self, agent_id: str, limit: int = 5) -> list[dict]:
        """
        Look across ALL simulations for how this agent_id performs on average.
        NOTE: intentionally NOT scoped to a single simulation_id.
        """
        if self._driver is None:
            return []
        try:
            with self._driver.session() as session:
                result = session.run(
                    """
                    MATCH (a:Agent {agent_id: $aid})
                    WITH a,
                         coalesce(a.leverage_score, 50) AS lev
                    RETURN
                      a.agent_id             AS agent_id,
                      a.name                 AS name,
                      avg(lev)               AS avg_final_leverage,
                      count(a)               AS sim_count
                    ORDER BY avg_final_leverage DESC
                    LIMIT $lim
                    """,
                    aid=agent_id,
                    lim=limit,
                )
                return [dict(r) for r in result]
        except Exception as exc:
            logger.warning("GraphQueries.cross_sim_patterns failed: %s", exc)
            return []

    def build_graph_analytics(self, simulation_id: str) -> dict:
        """
        Run all 5 queries and return a dict suitable for constructing GraphAnalytics.
        Never raises — partial results are valid.
        """
        from ..models import (
            GraphAnalytics, HostilePair, InfluenceNode,
            CoalitionEvolution, InterruptEvent, CrossSimPattern,
        )

        hostile = []
        for row in self.hostile_pairs(simulation_id):
            try:
                hostile.append(HostilePair(
                    agent_a=row["agent_a"],
                    agent_b=row["agent_b"],
                    final_trust_a_to_b=row.get("trust_a_to_b", 0),
                    final_trust_b_to_a=row.get("trust_b_to_a", 0),
                    clash_count=row.get("clash_count", 0),
                ))
            except Exception:
                pass

        influence = []
        for row in self.influence_chain(simulation_id):
            try:
                influence.append(InfluenceNode(
                    agent_id=row["agent_id"],
                    name=row.get("name", row["agent_id"]),
                    out_degree=row.get("out_degree", 0),
                    avg_leverage_delta=row.get("avg_leverage_delta", 0.0),
                ))
            except Exception:
                pass

        coalitions = []
        for row in self.coalition_evolution(simulation_id):
            try:
                coalitions.append(CoalitionEvolution(
                    agent_a=row["agent_a"],
                    agent_b=row["agent_b"],
                    issue=row.get("issue", ""),
                    first_turn=row.get("first_turn", 0),
                    last_turn=row.get("last_turn", 0),
                    duration_turns=row.get("duration_turns", 1),
                ))
            except Exception:
                pass

        interrupts = []
        for row in self.interrupt_chain(simulation_id):
            try:
                interrupts.append(InterruptEvent(
                    interrupter_id=row["interrupter_id"],
                    interrupted_id=row["interrupted_id"],
                    interrupt_type=row.get("interrupt_type", "cut_off"),
                    turn_index=row.get("turn_index", 0),
                ))
            except Exception:
                pass

        return GraphAnalytics(
            hostile_pairs=hostile,
            influence_chain=influence,
            coalition_evolution=coalitions,
            interrupt_chain=interrupts,
            cross_sim_patterns=[],  # populated per-agent if needed downstream
            neo4j_available=self._driver is not None,
        )
