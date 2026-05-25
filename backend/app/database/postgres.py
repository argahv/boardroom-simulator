"""
PostgreSQL backend for Boardroom Simulator.

Uses asyncpg with a connection pool for proper async I/O.
Schema mirrors the SQLite backend with JSONB for flexible payloads.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg

from app.models import ScenarioTemplate, SimulationDocument, SimulationState, Stakeholder
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
CREATE INDEX IF NOT EXISTS idx_v2_turns_sim_created ON v2_turns(simulation_id, created_at);

CREATE TABLE IF NOT EXISTS v2_postmortems (
    simulation_id   TEXT PRIMARY KEY,
    postmortem_json JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: drop FK if it exists from earlier schema versions
ALTER TABLE v2_postmortems DROP CONSTRAINT IF EXISTS v2_postmortems_simulation_id_fkey;

CREATE TABLE IF NOT EXISTS v2_state_snapshots (
    id            TEXT PRIMARY KEY,
    simulation_id TEXT NOT NULL REFERENCES v2_simulations(simulation_id),
    turn_index    INTEGER NOT NULL,
    snapshot_json JSONB NOT NULL,
    version       INTEGER NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_sim_turn ON v2_state_snapshots(simulation_id, turn_index);

CREATE TABLE IF NOT EXISTS v2_agent_goals (
    id            TEXT PRIMARY KEY,
    simulation_id TEXT NOT NULL,
    agent_id      TEXT NOT NULL,
    turn_index    INTEGER NOT NULL,
    goal_text     TEXT NOT NULL,
    priority      REAL NOT NULL,
    source        TEXT NOT NULL,
    is_active     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_agent_goals_agent ON v2_agent_goals(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_goals_sim  ON v2_agent_goals(simulation_id);

CREATE TABLE IF NOT EXISTS document_uploads (
    id            TEXT PRIMARY KEY,
    simulation_id TEXT NOT NULL,
    filename      TEXT NOT NULL,
    content_type  TEXT NOT NULL DEFAULT 'application/octet-stream',
    file_size     INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'pending',
    extracted_text TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_uploads_sim ON document_uploads(simulation_id);
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
    def _now() -> datetime:
        return datetime.now(timezone.utc)

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
        cfg = row["config_json"]
        if isinstance(cfg, str):
            cfg = json.loads(cfg)
        return {"config": cfg, "status": row["status"]}

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
                "SELECT turn_json, turn_index FROM v2_turns WHERE simulation_id = $1 AND turn_index >= $2 ORDER BY id ASC",
                simulation_id, from_index,
            )
        return [r["turn_json"] if isinstance(r["turn_json"], dict) else json.loads(r["turn_json"]) for r in rows]

    # ── New Schema Queries (agent detail view) ─────────────────────────────

    # ── New Schema: Templates ──────────────────────────────────────────────

    async def get_simulation_config(self, simulation_id: str) -> Optional[dict]:
        """Load simulation config from new schema."""
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT config FROM simulations WHERE id = $1::uuid", simulation_id)
            cfg = row["config"] if row else None
            if isinstance(cfg, str):
                cfg = json.loads(cfg)
            return cfg

    async def get_turns_by_simulation(self, simulation_id: str) -> list[dict]:
        """Get all turns for a simulation from the new schema."""
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT t.turn_index, t.content, t.action_type, t.stance,
                       t.internal_reasoning, t.emotional_state, t.created_at,
                       sp.name as speaker, sp.role as speaker_role
                FROM turns t
                JOIN simulation_participants sp ON sp.id = t.participant_id
                WHERE t.simulation_id = $1::uuid
                ORDER BY t.id ASC
            """, simulation_id)
            return [dict(r) for r in rows]

    async def list_simulations_v2(self) -> list[dict]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id::text AS simulation_id,
                       subject_name AS name,
                       subject_description AS description,
                       status,
                       total_participants AS stakeholder_count,
                       voltage,
                       model_temperature,
                       created_at
                FROM simulations
                ORDER BY created_at DESC
                LIMIT 100
            """)
            result = []
            for r in rows:
                d = dict(r)
                d["subject"] = {"name": d.pop("name", ""), "description": d.pop("description", "")}
                result.append(d)
            return result

    async def list_templates_v2(self) -> list[dict]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT slug, name, description, category, difficulty,
                       estimated_duration, stakeholder_count, voltage, config
                FROM templates ORDER BY category, name
            """)
            result = []
            for r in rows:
                d = dict(r)
                # Ensure config is a dict, not a JSON string
                if isinstance(d.get("config"), str):
                    d["config"] = json.loads(d["config"])
                result.append(d)
            return result

    async def get_template_v2(self, slug: str) -> Optional[dict]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT slug, name, description, category, difficulty, estimated_duration, stakeholder_count, voltage, config "
                "FROM templates WHERE slug = $1", slug
            )
            return dict(row) if row else None

    async def list_personas(self) -> list[dict]:
        """List all personas from the new schema with sim stats + template refs."""
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT
                    p.id, p.slug, p.name, p.role, p.focus, p.backstory,
                    p.hidden_agenda, p.tags, p.metadata,
                    COALESCE(sim_stats.sim_count, 0) AS sim_count,
                    COALESCE(sim_stats.total_turns, 0) AS total_turns,
                    COALESCE(tmpl.template_names, '[]') AS template_names
                FROM personas p
                LEFT JOIN (
                    SELECT sp.persona_id,
                           COUNT(DISTINCT sp.simulation_id) AS sim_count,
                           COUNT(t.id) AS total_turns
                    FROM simulation_participants sp
                    LEFT JOIN turns t ON t.participant_id = sp.id
                    GROUP BY sp.persona_id
                ) sim_stats ON sim_stats.persona_id = p.id
                LEFT JOIN (
                    SELECT
                        jsonb_array_elements(config->'stakeholders')->>'name' AS sname,
                        jsonb_agg(DISTINCT t2.slug) AS template_names
                    FROM templates t2
                    GROUP BY sname
                ) tmpl ON tmpl.sname = p.name
                ORDER BY p.name
            """)
            result = []
            for r in rows:
                d = dict(r)
                meta = d.get("metadata", {})
                if isinstance(meta, str):
                    meta = json.loads(meta)
                tags = d.get("tags", [])
                if isinstance(tags, str):
                    tags = json.loads(tags) if tags.startswith("[") else [tags]
                d["tag"] = tags[0] if tags else None
                d["incentive_tuning"] = meta.get("incentive_tuning", 50) if isinstance(meta, dict) else 50
                d["hidden_agenda"] = d.get("hidden_agenda", "")
                d["sim_count"] = d.pop("sim_count", 0)
                d["total_turns"] = d.pop("total_turns", 0)
                tpls = d.pop("template_names", "[]")
                d["templates"] = json.loads(tpls) if isinstance(tpls, str) else tpls
                d["slug"] = d.get("slug", "")
                result.append(d)
            return result

    async def get_agent_by_id(self, persona_id: str) -> Optional[dict]:
        """Look up persona by UUID primary key."""
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, slug, name, role, focus, backstory, hidden_agenda, tags, personality, metadata "
                "FROM personas WHERE id = $1::uuid LIMIT 1",
                persona_id,
            )
            return dict(row) if row else None

    async def get_agent_by_name(self, name: str) -> Optional[dict]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, slug, name, role, focus, backstory, hidden_agenda, tags, personality, metadata "
                "FROM personas WHERE slug = $1 OR name = $1 LIMIT 1",
                name,
            )
            if row:
                return dict(row)
            # Fallback: look up as simulation participant name
            prow = await conn.fetchrow(
                "SELECT DISTINCT sp.name, sp.role, sp.stance, sp.backstory, sp.hidden_agenda, sp.personality "
                "FROM simulation_participants sp WHERE sp.name = $1 LIMIT 1",
                name,
            )
            return dict(prow) if prow else None

    async def get_agent_simulations_by_id(self, persona_id: str) -> list[dict]:
        """Look up simulations by persona UUID (matches personas.id)."""
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT s.id, s.subject_name, s.status, s.voltage, s.total_turns,
                       sp.stance, sp.role, sp.turn_count, sp.first_turn_index, sp.last_turn_index,
                       s.created_at
                FROM simulation_participants sp
                JOIN simulations s ON s.id = sp.simulation_id
                WHERE sp.persona_id = $1::uuid
                ORDER BY s.created_at DESC
            """, persona_id)
            return [dict(r) for r in rows]

    async def get_agent_turns_by_id(self, persona_id: str, limit: int = 50) -> list[dict]:
        """Look up turns by persona UUID (matches personas.id)."""
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT t.turn_index, t.participant_turn_index, t.content, t.action_type,
                       t.stance, t.emotional_state, t.internal_reasoning, t.created_at,
                       s.subject_name
                FROM turns t
                JOIN simulation_participants sp ON sp.id = t.participant_id
                JOIN simulations s ON s.id = t.simulation_id
                WHERE sp.persona_id = $1::uuid
                ORDER BY t.created_at DESC
                LIMIT $2
            """, persona_id, limit)
            return [dict(r) for r in rows]

    # ── New Schema Writes (dual-write from main.py) ─────────────────────

    async def create_new_simulation(self, simulation_id: str, config: dict) -> None:
        """Create row in new simulations + simulation_participants tables."""
        pool = self._pool_or_raise()
        now = datetime.now(timezone.utc)
        subject = config.get("subject", {})
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO simulations (id, subject_name, subject_description, status, voltage,
                    model_temperature, speaker_mode, end_condition, config, metadata, created_at, updated_at)
                VALUES ($1::uuid, $2, $3, 'idle', $4, $5, $6, $7::jsonb, $8::jsonb, '{}', $9, $10)
                ON CONFLICT (id) DO NOTHING
            """, simulation_id,
                subject.get("name", ""),
                subject.get("description", ""),
                config.get("voltage", 50),
                config.get("model_temperature", "volatile"),
                config.get("speaker_rules", {}).get("mode", "alternating"),
                json.dumps(config.get("end_condition", {})),
                json.dumps(config),
                now, now)

            # Create participants with persona_id lookup
            for i, s in enumerate(config.get("stakeholders", [])):
                sname = s.get("name", "")
                # Look up persona_id by name
                pid_row = await conn.fetchrow(
                    "SELECT id FROM personas WHERE name = $1 LIMIT 1", sname)
                persona_uuid = pid_row["id"] if pid_row else None
                await conn.execute("""
                    INSERT INTO simulation_participants (id, simulation_id, persona_id, name, role, stance,
                        personality, backstory, hidden_agenda, created_at)
                    VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, $9)
                    ON CONFLICT DO NOTHING
                """, simulation_id, persona_uuid,
                    s.get("name", ""),
                    s.get("role", ""),
                    s.get("stance", "neutral"),
                    json.dumps(s.get("personality", {})),
                    s.get("backstory", ""),
                    s.get("hidden_agenda", ""),
                    now)

    async def get_participant_id(self, simulation_id: str, speaker_name: str) -> Optional[str]:
        """Get simulation_participants.id for a speaker name within a sim."""
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id FROM simulation_participants WHERE simulation_id = $1::uuid AND name = $2 LIMIT 1",
                simulation_id, speaker_name)
            return str(row["id"]) if row else None

    async def get_all_participant_map(self, simulation_id: str) -> dict[str, str]:
        """Get {speaker_name: participant_id} map for a simulation."""
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT name, id FROM simulation_participants WHERE simulation_id = $1::uuid",
                simulation_id)
            return {r["name"]: str(r["id"]) for r in rows}

    async def insert_new_turn(self, simulation_id: str, participant_id: str,
                               turn_index: int, turn_data: dict) -> Optional[int]:
        """Insert a turn into the new turns table. Returns the turn id."""
        pool = self._pool_or_raise()
        now = datetime.now(timezone.utc)
        # Count existing turns for this participant for participant_turn_index
        async with pool.acquire() as conn:
            pti = await conn.fetchval(
                "SELECT COUNT(*) FROM turns WHERE participant_id = $1::uuid",
                participant_id) or 0

            content = turn_data.get("content", "")
            action_type = turn_data.get("action_type", "statement")
            stance = turn_data.get("stance")
            reasoning = turn_data.get("internal_reasoning", turn_data.get("reasoning", ""))

            # Simple emotional state extraction
            emotional_state = _extract_emotion(content, action_type)

            row = await conn.fetchrow("""
                INSERT INTO turns (simulation_id, participant_id, turn_index, participant_turn_index,
                    content, action_type, stance, emotional_state, internal_reasoning, turn_data, created_at)
                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11)
                RETURNING id
            """, simulation_id, participant_id, turn_index, pti,
                content, action_type, stance, json.dumps(emotional_state),
                reasoning, json.dumps(turn_data), now)
            return row["id"] if row else None

    async def update_simulation_status_v2(self, simulation_id: str, status: str) -> None:
        pool = self._pool_or_raise()
        now = datetime.now(timezone.utc)
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE simulations SET status = $1, total_turns = (SELECT COUNT(*) FROM turns WHERE simulation_id = $2::uuid), updated_at = $3 WHERE id = $2::uuid",
                status, simulation_id, now)

    async def update_participant_stats(self, simulation_id: str) -> None:
        """Recalculate turn_count, first/last turn_index for all participants."""
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            await conn.execute("""
                UPDATE simulation_participants sp SET
                    turn_count = sub.cnt,
                    first_turn_index = sub.min_t,
                    last_turn_index = sub.max_t
                FROM (
                    SELECT t.participant_id AS pid,
                           COUNT(*) AS cnt,
                           MIN(t.turn_index) AS min_t,
                           MAX(t.turn_index) AS max_t
                    FROM turns t
                    WHERE t.simulation_id = $1::uuid
                    GROUP BY t.participant_id
                ) sub
                WHERE sp.id = sub.pid AND sp.simulation_id = $1::uuid
            """, simulation_id)

    async def insert_semantic_memory(self, participant_id: str, simulation_id: str,
                                      memory_type: str, content: str) -> None:
        pool = self._pool_or_raise()
        now = datetime.now(timezone.utc)
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO semantic_memories (participant_id, simulation_id, memory_type, content, created_at)
                VALUES ($1::uuid, $2::uuid, $3, $4, $5)
                ON CONFLICT DO NOTHING
            """, participant_id, simulation_id, memory_type, content[:500], now)

    async def delete_new_simulation(self, simulation_id: str) -> None:
        """Clean up new schema data for a sim (CASCADE should handle this)."""
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM simulations WHERE id = $1::uuid", simulation_id)

    # ── Postmortem cache ─────────────────────────────────────────────

    async def save_postmortem(self, simulation_id: str, postmortem_json: str) -> None:
        pool = self._pool_or_raise()
        now = datetime.now(timezone.utc)
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO v2_postmortems (simulation_id, postmortem_json, created_at)
                VALUES ($1, $2::jsonb, $3)
                ON CONFLICT (simulation_id) DO UPDATE SET
                    postmortem_json = $2::jsonb,
                    created_at = $3
            """, simulation_id, postmortem_json, now)

    async def get_postmortem(self, simulation_id: str) -> Optional[str]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT postmortem_json FROM v2_postmortems WHERE simulation_id = $1",
                simulation_id,
            )
            if row:
                val = row["postmortem_json"]
                return json.dumps(val) if isinstance(val, (dict, list)) else str(val)
            return None


    # ------------------------------------------------------------------
    # v2 State Snapshots
    # ------------------------------------------------------------------

    async def create_state_snapshot(
        self, simulation_id: str, turn_index: int, snapshot_json: str, version: int = 1
    ) -> str:
        pool = self._pool_or_raise()
        snapshot_id = str(uuid.uuid4())
        now = self._now()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO v2_state_snapshots (id, simulation_id, turn_index, snapshot_json, version, created_at)
                   VALUES ($1, $2, $3, $4::jsonb, $5, $6)""",
                snapshot_id, simulation_id, turn_index, snapshot_json, version, now,
            )
        return snapshot_id

    async def get_state_snapshots_by_simulation(self, simulation_id: str) -> list[dict]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, simulation_id, turn_index, snapshot_json, version, created_at FROM v2_state_snapshots WHERE simulation_id = $1 ORDER BY turn_index ASC",
                simulation_id,
            )
        result = []
        for row in rows:
            d = dict(row)
            if isinstance(d["snapshot_json"], str):
                d["snapshot_json"] = json.loads(d["snapshot_json"])
            result.append(d)
        return result

    async def get_latest_state_snapshot(self, simulation_id: str) -> Optional[dict]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, simulation_id, turn_index, snapshot_json, version, created_at FROM v2_state_snapshots WHERE simulation_id = $1 ORDER BY turn_index DESC LIMIT 1",
                simulation_id,
            )
        if row is None:
            return None
        d = dict(row)
        if isinstance(d["snapshot_json"], str):
            d["snapshot_json"] = json.loads(d["snapshot_json"])
        return d

    async def delete_old_state_snapshots(self, simulation_id: str, max_keep: int = 50) -> None:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                DELETE FROM v2_state_snapshots
                WHERE simulation_id = $1 AND id NOT IN (
                    SELECT id FROM v2_state_snapshots
                    WHERE simulation_id = $2
                    ORDER BY turn_index DESC
                    LIMIT $3
                )
                """,
                simulation_id, simulation_id, max_keep,
            )


    # ------------------------------------------------------------------
    # Agent Goals
    # ------------------------------------------------------------------

    async def insert_agent_goal(self, goal_id: str, simulation_id: str, agent_id: str,
                                 turn_index: int, goal_text: str, priority: float,
                                 source: str, is_active: bool = True) -> None:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO v2_agent_goals (id, simulation_id, agent_id, turn_index, goal_text, priority, source, is_active)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                   ON CONFLICT (id) DO NOTHING""",
                goal_id, simulation_id, agent_id, turn_index, goal_text, priority, source, 1 if is_active else 0,
            )

    async def get_agent_goals_by_id(self, persona_id: str) -> list[dict]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, simulation_id, agent_id, turn_index, goal_text, priority, source, is_active FROM v2_agent_goals WHERE agent_id = $1 ORDER BY priority DESC, turn_index DESC",
                persona_id,
            )
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Document uploads
    # ------------------------------------------------------------------

    async def create_document(self, doc: SimulationDocument) -> None:
        pool = self._pool_or_raise()
        now = self._now()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO document_uploads (id, simulation_id, filename, content_type, file_size, status, extracted_text, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)""",
                doc.id, doc.simulation_id, doc.filename, doc.content_type,
                doc.size_bytes, doc.status, doc.extracted_text, now, now,
            )

    async def get_documents_by_simulation(self, simulation_id: str) -> list[SimulationDocument]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, simulation_id, filename, content_type, file_size, status, extracted_text, created_at FROM document_uploads WHERE simulation_id = $1 ORDER BY created_at ASC",
                simulation_id,
            )
        return [self._row_to_document(r) for r in rows]

    async def get_document(self, document_id: str) -> Optional[SimulationDocument]:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, simulation_id, filename, content_type, file_size, status, extracted_text FROM document_uploads WHERE id = $1",
                document_id,
            )
        return self._row_to_document(row) if row else None

    async def update_document_status(
        self, document_id: str, status: str, extracted_text: str | None = None
    ) -> None:
        pool = self._pool_or_raise()
        now = self._now()
        async with pool.acquire() as conn:
            if extracted_text is not None:
                await conn.execute(
                    "UPDATE document_uploads SET status = $1, extracted_text = $2, updated_at = $3 WHERE id = $4",
                    status, extracted_text, now, document_id,
                )
            else:
                await conn.execute(
                    "UPDATE document_uploads SET status = $1, updated_at = $2 WHERE id = $3",
                    status, now, document_id,
                )

    async def delete_documents_by_simulation(self, simulation_id: str) -> None:
        pool = self._pool_or_raise()
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM document_uploads WHERE simulation_id = $1",
                simulation_id,
            )

    @staticmethod
    def _row_to_document(row: asyncpg.Record) -> SimulationDocument:
        return SimulationDocument(
            id=row["id"],
            simulation_id=row["simulation_id"],
            filename=row["filename"],
            content_type=row["content_type"],
            size_bytes=row["file_size"],
            status=row["status"],
            extracted_text=row["extracted_text"],
            created_at=str(row["created_at"]) if row.get("created_at") else "",
        )


def _extract_emotion(content: str, action_type: str) -> dict:
    """Simple rule-based emotional state extraction from turn content."""
    import re
    text = content.lower()
    emotions = {
        "anger": 0.2,
        "fear": 0.2,
        "joy": 0.3,
        "surprise": 0.2,
        "confidence": 0.5,
        "certainty": 0.5,
    }

    action_boosts = {
        "challenge": {"anger": 0.15, "confidence": -0.05, "certainty": 0.05},
        "escalate": {"anger": 0.2, "fear": 0.1, "confidence": -0.1},
        "compromise": {"joy": 0.1, "anger": -0.1, "confidence": 0.05},
        "interrupt": {"anger": 0.1, "surprise": 0.05},
        "question": {"certainty": -0.05},
    }
    boosts = action_boosts.get(action_type, {})
    for k, v in boosts.items():
        emotions[k] = max(0.0, min(1.0, emotions.get(k, 0.5) + v))

    # Content-based signals
    if re.search(r'\b(angry|furious|outraged|unacceptable|outrageous)\b', text):
        emotions["anger"] = min(1.0, emotions["anger"] + 0.2)
    if re.search(r'\b(worried|concerned|anxious|fear|afraid|risk|danger)\b', text):
        emotions["fear"] = min(1.0, emotions["fear"] + 0.15)
    if re.search(r'\b(happy|pleased|excellent|great|agree|support)\b', text):
        emotions["joy"] = min(1.0, emotions["joy"] + 0.15)
    if re.search(r'\b(surprised|unexpected|shocked|unprecedented)\b', text):
        emotions["surprise"] = min(1.0, emotions["surprise"] + 0.15)
    if re.search(r'\b(confident|certain|sure|absolutely|definitely)\b', text):
        emotions["confidence"] = min(1.0, emotions["confidence"] + 0.15)
    if re.search(r'\b(maybe|perhaps|possibly|not sure|uncertain|might)\b', text):
        emotions["certainty"] = max(0.0, emotions["certainty"] - 0.15)

    return {k: round(v, 3) for k, v in emotions.items()}


_MEMORY_PATTERNS = {
    "position": r'\b(believe|think|position|stance|support|oppose|agree|disagree|our view|we believe)\b',
    "red_line": r'\b(never|cannot|red line|under no circumstances|will not|won\'t|refuse|non.negotiable)\b',
    "concession": r'\b(concede|concession|willing to|open to|flexible on|could accept|might consider)\b',
    "insight": r'\b(realize|understand now|key insight|important lesson|critical observation)\b',
}


def _extract_memory_type(content: str, action_type: str) -> Optional[str]:
    """Check if content matches any semantic memory pattern."""
    if action_type == "compromise":
        return "concession"
    text = content.lower()
    for mtype, pattern in _MEMORY_PATTERNS.items():
        import re
        if re.search(pattern, text):
            return mtype
    return None


async def get_agent_memories_by_id(db, persona_id: str) -> list[dict]:
    """Look up semantic memories by persona UUID (matches personas.id)."""
    pool = db._pool_or_raise()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT sm.memory_type, sm.content, sm.is_active, sm.confidence, sm.created_at,
                   s.subject_name, t.turn_index
            FROM semantic_memories sm
            JOIN simulation_participants sp ON sp.id = sm.participant_id
            JOIN simulations s ON s.id = sm.simulation_id
            LEFT JOIN turns t ON t.id = sm.turn_id
            WHERE sp.persona_id = $1::uuid
            ORDER BY sm.created_at DESC
        """, persona_id)
        return [dict(r) for r in rows]
