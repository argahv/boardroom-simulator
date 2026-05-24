"""
PostgreSQL backend for Boardroom Simulator.

Uses asyncpg with a connection pool for proper async I/O.
Schema mirrors the SQLite backend with JSONB for flexible payloads.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg

from app.models import ScenarioTemplate, SimulationState, Stakeholder
from .base import DatabaseBackend

logger = logging.getLogger("boardroom.db.postgres")

# Schema DDL — matches SQLiteBackend structure with PG-native types
_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS stakeholders (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL,
    focus         TEXT NOT NULL,
    incentive_tuning INTEGER NOT NULL DEFAULT 50,
    hidden_agenda TEXT NOT NULL DEFAULT '',
    tag           TEXT,
    tool_profile  TEXT NOT NULL DEFAULT 'none',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scenario_templates (
    id                      TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    description             TEXT NOT NULL,
    default_background      TEXT NOT NULL,
    default_primary_goal    TEXT NOT NULL,
    default_voltage         INTEGER NOT NULL DEFAULT 50,
    default_model_temperature TEXT NOT NULL DEFAULT 'stable',
    suggested_persona_ids   TEXT NOT NULL DEFAULT '[]',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS simulations (
    simulation_id     TEXT PRIMARY KEY,
    status            TEXT NOT NULL,
    active_speaker_id TEXT,
    state_json        JSONB NOT NULL,
    runtime_status    TEXT NOT NULL DEFAULT 'idle',
    state_version     INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS v2_simulations (
    simulation_id TEXT PRIMARY KEY,
    config_json   JSONB NOT NULL,
    status        TEXT NOT NULL DEFAULT 'idle',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS v2_turns (
    id            SERIAL PRIMARY KEY,
    simulation_id TEXT NOT NULL REFERENCES v2_simulations(simulation_id),
    turn_index    INTEGER NOT NULL,
    turn_json     JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_simulations_status    ON simulations(status);
CREATE INDEX IF NOT EXISTS idx_simulations_created    ON simulations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stakeholders_tag       ON stakeholders(tag);
CREATE INDEX IF NOT EXISTS idx_v2_simulations_status  ON v2_simulations(status);
CREATE INDEX IF NOT EXISTS idx_v2_turns_sim           ON v2_turns(simulation_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_v2_turns_sim_created   ON v2_turns(simulation_id, created_at);
"""


class PostgresBackend(DatabaseBackend):
    """PostgreSQL implementation of DatabaseBackend using asyncpg connection pool."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 5432,
        user: str = "boardroom",
        password: str = "boardroom",
        database: str = "boardroom",
        min_connections: int = 2,
        max_connections: int = 10,
    ) -> None:
        self._dsn = f"postgresql://{user}:{password}@{host}:{port}/{database}"
        self._pool: Optional[asyncpg.Pool] = None
        self._min_size = min_connections
        self._max_size = max_connections

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        # mask credentials in log output
        safe = self._dsn.split("@")[-1] if "@" in self._dsn else self._dsn
        logger.info("Connecting to PostgreSQL: postgresql://***:***@%s", safe)
        self._pool = await asyncpg.create_pool(
            dsn=self._dsn,
            min_size=self._min_size,
            max_size=self._max_size,
        )
        async with self._pool.acquire() as conn:
            await conn.execute(_SCHEMA_SQL)
        logger.info("PostgreSQL schema initialised.")

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
            logger.info("PostgreSQL pool closed.")

    def _pool_or_raise(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("PostgresBackend not initialised — call initialize() first")
        return self._pool

    # ------------------------------------------------------------------
    # Timestamp helper
    # ------------------------------------------------------------------

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    # Simulations (v1)
    # ------------------------------------------------------------------

    async def create_simulation(self, state: SimulationState) -> SimulationState:
        pool = self._pool_or_raise()
        now = self._now()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO simulations (simulation_id, status, active_speaker_id, state_json, created_at, updated_at)
                   VALUES ($1, $2, $3, $4::jsonb, $5, $6)""",
                state.simulation_id, state.status, state.active_speaker_id,
                state.model_dump_json(), now, now,
            )
        return state

    async def get_simulation(self, simulation_id: str) -> Optional[SimulationState]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT state_json FROM simulations WHERE simulation_id = $1",
                simulation_id,
            )
        return SimulationState.model_validate_json(row["state_json"]) if row else None

    async def update_simulation(self, state: SimulationState) -> SimulationState:
        pool = self._pool_or_raise()
        now = self._now()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE simulations SET status = $1, active_speaker_id = $2, state_json = $3::jsonb, updated_at = $4
                   WHERE simulation_id = $5""",
                state.status, state.active_speaker_id, state.model_dump_json(), now, state.simulation_id,
            )
        return state

    async def list_simulations(
        self, limit: int = 100, offset: int = 0, status: Optional[str] = None
    ) -> list[SimulationState]:
        pool = self._pool_or_raise()
        query = "SELECT state_json FROM simulations"
        params: list[Any] = []
        if status:
            query += " WHERE status = $1"
            params.append(status)
            query += f" ORDER BY created_at DESC LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}"
        else:
            query += " ORDER BY created_at DESC LIMIT $1 OFFSET $2"
        params.extend([limit, offset])
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
        return [SimulationState.model_validate_json(r["state_json"]) for r in rows]

    async def delete_simulation(self, simulation_id: str) -> bool:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM simulations WHERE simulation_id = $1",
                simulation_id,
            )
        return result != "DELETE 0"

    # ------------------------------------------------------------------
    # Stakeholders
    # ------------------------------------------------------------------

    async def create_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        pool = self._pool_or_raise()
        now = self._now()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO stakeholders (id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
                stakeholder.id, stakeholder.name, stakeholder.role, stakeholder.focus,
                stakeholder.incentive_tuning, stakeholder.hidden_agenda or "",
                stakeholder.tag, stakeholder.tool_profile, now, now,
            )
        return stakeholder

    async def get_stakeholder(self, stakeholder_id: str) -> Optional[Stakeholder]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile FROM stakeholders WHERE id = $1",
                stakeholder_id,
            )
        return self._row_to_stakeholder(row) if row else None

    async def update_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        pool = self._pool_or_raise()
        now = self._now()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE stakeholders SET name = $1, role = $2, focus = $3, incentive_tuning = $4,
                   hidden_agenda = $5, tag = $6, tool_profile = $7, updated_at = $8 WHERE id = $9""",
                stakeholder.name, stakeholder.role, stakeholder.focus,
                stakeholder.incentive_tuning, stakeholder.hidden_agenda or "",
                stakeholder.tag, stakeholder.tool_profile, now, stakeholder.id,
            )
        return stakeholder

    async def list_stakeholders(
        self, limit: int = 100, offset: int = 0, tag: Optional[str] = None
    ) -> list[Stakeholder]:
        pool = self._pool_or_raise()
        query = "SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile FROM stakeholders"
        params: list[Any] = []
        if tag:
            query += " WHERE tag = $1"
            params.append(tag)
            query += f" ORDER BY created_at DESC LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}"
        else:
            query += " ORDER BY created_at DESC LIMIT $1 OFFSET $2"
        params.extend([limit, offset])
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
        return [self._row_to_stakeholder(r) for r in rows]

    async def delete_stakeholder(self, stakeholder_id: str) -> bool:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM stakeholders WHERE id = $1",
                stakeholder_id,
            )
        return result != "DELETE 0"

    async def get_all_stakeholders(self) -> list[Stakeholder]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile FROM stakeholders ORDER BY created_at DESC LIMIT 1000",
            )
        return [self._row_to_stakeholder(r) for r in rows]

    @staticmethod
    def _row_to_stakeholder(row: asyncpg.Record) -> Stakeholder:
        return Stakeholder(
            id=row["id"],
            name=row["name"],
            role=row["role"],
            focus=row["focus"],
            incentive_tuning=row["incentive_tuning"],
            hidden_agenda=row["hidden_agenda"] or "",
            tag=row["tag"],
            tool_profile=row["tool_profile"] or "none",
        )

    # ------------------------------------------------------------------
    # Scenario templates
    # ------------------------------------------------------------------

    async def create_template(self, template: ScenarioTemplate) -> ScenarioTemplate:
        pool = self._pool_or_raise()
        now = self._now()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO scenario_templates (id, name, description, default_background, default_primary_goal,
                   default_voltage, default_model_temperature, suggested_persona_ids, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
                template.id, template.name, template.description,
                template.default_background, template.default_primary_goal,
                template.default_voltage, template.default_model_temperature,
                json.dumps(template.suggested_persona_ids), now, now,
            )
        return template

    async def get_template(self, template_id: str) -> Optional[ScenarioTemplate]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM scenario_templates WHERE id = $1",
                template_id,
            )
        return self._row_to_template(row) if row else None

    async def list_templates(self) -> list[ScenarioTemplate]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM scenario_templates ORDER BY name ASC")
        return [self._row_to_template(r) for r in rows]

    async def template_exists(self, template_id: str) -> bool:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT 1 FROM scenario_templates WHERE id = $1", template_id)
        return row is not None

    async def stakeholder_exists(self, stakeholder_id: str) -> bool:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT 1 FROM stakeholders WHERE id = $1", stakeholder_id)
        return row is not None

    @staticmethod
    def _row_to_template(row: asyncpg.Record) -> ScenarioTemplate:
        return ScenarioTemplate(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            default_background=row["default_background"],
            default_primary_goal=row["default_primary_goal"],
            default_voltage=row["default_voltage"],
            default_model_temperature=row["default_model_temperature"],
            suggested_persona_ids=json.loads(row["suggested_persona_ids"] or "[]"),
        )

    # ------------------------------------------------------------------
    # v2 Simulations
    # ------------------------------------------------------------------

    async def create_v2_simulation(self, simulation_id: str, config_json: str) -> None:
        pool = self._pool_or_raise()
        now = self._now()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO v2_simulations (simulation_id, config_json, status, created_at, updated_at)
                   VALUES ($1, $2::jsonb, 'idle', $3, $4)""",
                simulation_id, config_json, now, now,
            )

    async def get_v2_simulation(self, simulation_id: str) -> Optional[dict]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT config_json, status FROM v2_simulations WHERE simulation_id = $1",
                simulation_id,
            )
        if row is None:
            return None
        return {"config": row["config_json"], "status": row["status"]}

    async def update_v2_simulation_status(self, simulation_id: str, status: str) -> None:
        pool = self._pool_or_raise()
        now = self._now()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE v2_simulations SET status = $1, updated_at = $2 WHERE simulation_id = $3",
                status, now, simulation_id,
            )

    async def insert_v2_turn(self, simulation_id: str, turn_index: int, turn_json: str) -> None:
        pool = self._pool_or_raise()
        now = self._now()
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO v2_turns (simulation_id, turn_index, turn_json, created_at) VALUES ($1, $2, $3::jsonb, $4)",
                simulation_id, turn_index, turn_json, now,
            )

    async def get_v2_turns(self, simulation_id: str, from_index: int = 0) -> list[dict]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT turn_json, turn_index FROM v2_turns WHERE simulation_id = $1 AND turn_index >= $2 ORDER BY turn_index ASC",
                simulation_id, from_index,
            )
        return [dict(r["turn_json"]) for r in rows]
