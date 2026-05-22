"""
GraphWriter — fire-and-forget Neo4j writes from update_dynamics.

Design rules:
- MERGE on all nodes/relationships (never CREATE) — idempotent, no duplicates.
- Every public method wraps its body in try/except and returns bool.
  Callers MUST NOT crash if this returns False.
- Called via asyncio.get_event_loop().create_task() from the sync update_dynamics node,
  so writes never block the LangGraph hot path.
- TRUSTS relationships are "latest-state-only": MERGE overwrites score in place.
- Scope: every MATCH/MERGE that touches graph data is filtered by simulation_id.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..models import SimulationState, Turn

logger = logging.getLogger(__name__)


class GraphWriter:
    """Wraps all write operations against the boardroom Neo4j graph."""

    def __init__(self, driver) -> None:
        self._driver = driver

    # ── public API ────────────────────────────────────────────────────────

    def write_turn(
        self,
        sim: "SimulationState",
        turn: "Turn",
    ) -> bool:
        """
        Persist a single turn and its relationships to Neo4j.

        Writes:
          1. Simulation node (MERGE by simulation_id)
          2. Agent node for turn.stakeholder_id (MERGE)
          3. Turn node (MERGE by simulation_id + turn_index)
          4. PART_OF  (Turn)->(Simulation)
          5. SPOKE    (Turn)->(Agent)
          6. INTERRUPTS edge if turn.action_type == "interrupt"
          7. COALITION edge if turn.coalition_with is set
          8. All TRUSTS edges from current trust_matrix (MERGE/overwrite)
          9. Agent leverage_score property update
        """
        if self._driver is None:
            return False

        try:
            with self._driver.session() as session:
                self._upsert_simulation(session, sim)
                self._upsert_agent(session, sim, turn.stakeholder_id, turn.stakeholder_name, turn.role)
                self._upsert_turn(session, sim.simulation_id, turn)
                self._link_part_of(session, sim.simulation_id, turn.turn_index)
                self._link_spoke(session, sim.simulation_id, turn)

                if turn.action_type == "interrupt" and turn.directed_at:
                    self._link_interrupted(session, sim.simulation_id, turn)

                if turn.coalition_with:
                    self._ensure_agent_exists(session, sim, turn.coalition_with)
                    self._link_coalition(session, sim, turn)

                # Overwrite all TRUSTS edges for this simulation (latest state)
                self._sync_trust_matrix(session, sim)
                # Update leverage scores
                self._sync_leverage_scores(session, sim)

            return True
        except Exception as exc:
            logger.warning(
                "GraphWriter.write_turn failed for sim=%s turn=%d: %s",
                sim.simulation_id,
                turn.turn_index,
                exc,
            )
            return False

    # ── private helpers ───────────────────────────────────────────────────

    def _upsert_simulation(self, session, sim: "SimulationState") -> None:
        session.run(
            """
            MERGE (s:Simulation {simulation_id: $sid})
            ON CREATE SET s.background = $bg, s.primary_goal = $goal, s.voltage = $voltage
            """,
            sid=sim.simulation_id,
            bg=sim.config.background,
            goal=sim.config.primary_goal,
            voltage=sim.config.voltage,
        )

    def _upsert_agent(
        self,
        session,
        sim: "SimulationState",
        agent_id: str,
        name: str,
        role: str,
    ) -> None:
        session.run(
            """
            MERGE (a:Agent {simulation_id: $sid, agent_id: $aid})
            ON CREATE SET a.name = $name, a.role = $role
            """,
            sid=sim.simulation_id,
            aid=agent_id,
            name=name,
            role=role,
        )

    def _ensure_agent_exists(self, session, sim: "SimulationState", agent_id: str) -> None:
        """Upsert an agent node when we only have the id (look up name/role from config)."""
        name = agent_id
        role = ""
        for s in sim.config.stakeholders:
            if s.id == agent_id:
                name = s.name
                role = s.role
                break
        session.run(
            """
            MERGE (a:Agent {simulation_id: $sid, agent_id: $aid})
            ON CREATE SET a.name = $name, a.role = $role
            """,
            sid=sim.simulation_id,
            aid=agent_id,
            name=name,
            role=role,
        )

    def _upsert_turn(self, session, simulation_id: str, turn: "Turn") -> None:
        session.run(
            """
            MERGE (t:Turn {simulation_id: $sid, turn_index: $idx})
            ON CREATE SET
              t.action_type      = $action_type,
              t.interrupt_type   = $interrupt_type,
              t.interrupt_bid    = $interrupt_bid,
              t.emotional_tone   = $tone,
              t.stakeholder_id   = $stakeholder_id
            """,
            sid=simulation_id,
            idx=turn.turn_index,
            action_type=turn.action_type,
            interrupt_type=turn.interrupt_type or "",
            interrupt_bid=turn.interrupt_bid,
            tone=turn.emotional_tone or "neutral",
            stakeholder_id=turn.stakeholder_id,
        )

    def _link_part_of(self, session, simulation_id: str, turn_index: int) -> None:
        session.run(
            """
            MATCH (t:Turn {simulation_id: $sid, turn_index: $idx})
            MATCH (s:Simulation {simulation_id: $sid})
            MERGE (t)-[:PART_OF]->(s)
            """,
            sid=simulation_id,
            idx=turn_index,
        )

    def _link_spoke(self, session, simulation_id: str, turn: "Turn") -> None:
        session.run(
            """
            MATCH (t:Turn {simulation_id: $sid, turn_index: $idx})
            MATCH (a:Agent {simulation_id: $sid, agent_id: $aid})
            MERGE (t)-[:SPOKE {action_type: $action_type}]->(a)
            """,
            sid=simulation_id,
            idx=turn.turn_index,
            aid=turn.stakeholder_id,
            action_type=turn.action_type,
        )

    def _link_interrupted(self, session, simulation_id: str, turn: "Turn") -> None:
        """Create INTERRUPTED edge from this turn node to the turn that was being delivered."""
        # The interrupted turn is the one immediately prior to this one addressed to directed_at.
        # We model it as (interrupter_turn)-[:INTERRUPTED]->(target_agent_last_turn).
        # Simpler: INTERRUPTED edge directly between agent nodes with turn context.
        session.run(
            """
            MATCH (a_from:Agent {simulation_id: $sid, agent_id: $from_id})
            MATCH (a_to:Agent {simulation_id: $sid, agent_id: $to_id})
            MATCH (t:Turn {simulation_id: $sid, turn_index: $idx})
            MERGE (t)-[:INTERRUPTED {
              interrupt_type: $itype,
              interrupter_id: $from_id,
              interrupted_id: $to_id
            }]->(a_to)
            """,
            sid=simulation_id,
            from_id=turn.stakeholder_id,
            to_id=turn.directed_at,
            idx=turn.turn_index,
            itype=turn.interrupt_type or "cut_off",
        )

    def _link_coalition(self, session, sim: "SimulationState", turn: "Turn") -> None:
        issue = ""
        for c in sim.coalitions:
            ids = {c.agent_a, c.agent_b}
            if turn.stakeholder_id in ids and turn.coalition_with in ids:
                issue = c.issue
                break

        session.run(
            """
            MATCH (a:Agent {simulation_id: $sid, agent_id: $a_id})
            MATCH (b:Agent {simulation_id: $sid, agent_id: $b_id})
            MERGE (a)-[r:COALITION {issue: $issue}]->(b)
            ON CREATE SET r.first_turn = $turn_idx
            SET r.last_turn = $turn_idx
            """,
            sid=sim.simulation_id,
            a_id=turn.stakeholder_id,
            b_id=turn.coalition_with,
            issue=issue,
            turn_idx=turn.turn_index,
        )

    def _sync_trust_matrix(self, session, sim: "SimulationState") -> None:
        """Overwrite all TRUSTS edges for this sim with current trust_matrix values."""
        for agent_from, targets in sim.trust_matrix.items():
            for agent_to, score in targets.items():
                if agent_from == agent_to:
                    continue
                session.run(
                    """
                    MATCH (a:Agent {simulation_id: $sid, agent_id: $from_id})
                    MATCH (b:Agent {simulation_id: $sid, agent_id: $to_id})
                    MERGE (a)-[r:TRUSTS]->(b)
                    SET r.score = $score, r.simulation_id = $sid
                    """,
                    sid=sim.simulation_id,
                    from_id=agent_from,
                    to_id=agent_to,
                    score=score,
                )

    def _sync_leverage_scores(self, session, sim: "SimulationState") -> None:
        """Write current leverage_score onto each Agent node."""
        for agent_id, score in sim.leverage_scores.items():
            session.run(
                """
                MATCH (a:Agent {simulation_id: $sid, agent_id: $aid})
                SET a.leverage_score = $score
                """,
                sid=sim.simulation_id,
                aid=agent_id,
                score=score,
            )
