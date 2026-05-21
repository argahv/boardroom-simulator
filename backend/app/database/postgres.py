from __future__ import annotations

import json
from typing import List, Optional

from app.models import ScenarioTemplate, SimulationState, Stakeholder
from .base import DatabaseBackend


class PostgresBackend(DatabaseBackend):
    def __init__(
        self,
        host: str = "localhost",
        port: int = 5432,
        user: str = "postgres",
        password: str = "postgres",
        database: str = "boardroom",
    ):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.database = database
        self.pool = None

    async def initialize(self) -> None:
        try:
            import asyncpg
        except ImportError:
            raise RuntimeError("asyncpg is required for PostgreSQL. Install it: pip install asyncpg")

        self.pool = await asyncpg.create_pool(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
            database=self.database,
            min_size=2,
            max_size=10,
        )

        await self._create_tables()
        await self._migrate()

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()
            self.pool = None

    async def _create_tables(self) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS stakeholders (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    focus TEXT NOT NULL,
                    incentive_tuning INTEGER NOT NULL DEFAULT 50,
                    hidden_agenda TEXT,
                    tag TEXT,
                    tool_profile TEXT NOT NULL DEFAULT 'none',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """
            )

            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS scenario_templates (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    default_background TEXT NOT NULL,
                    default_primary_goal TEXT NOT NULL,
                    default_voltage INTEGER NOT NULL DEFAULT 50,
                    default_model_temperature TEXT NOT NULL DEFAULT 'stable',
                    suggested_persona_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """
            )

            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS simulations (
                    simulation_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    active_speaker_id TEXT,
                    state_json JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """
            )

            await conn.execute("CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations(status)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_simulations_created ON simulations(created_at DESC)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_stakeholders_tag ON stakeholders(tag)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_simulations_state_json ON simulations USING GIN(state_json)")

    async def _migrate(self) -> None:
        async with self.pool.acquire() as conn:
            col = await conn.fetchrow(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name='stakeholders' AND column_name='tool_profile'
                """
            )
            if not col:
                await conn.execute("ALTER TABLE stakeholders ADD COLUMN tool_profile TEXT NOT NULL DEFAULT 'none'")

    # ------------------------------------------------------------------
    # Simulations
    # ------------------------------------------------------------------

    async def create_simulation(self, state: SimulationState) -> SimulationState:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO simulations (simulation_id, status, active_speaker_id, state_json, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())",
                state.simulation_id,
                state.status,
                state.active_speaker_id,
                json.loads(state.model_dump_json()),
            )
            return state

    async def get_simulation(self, simulation_id: str) -> Optional[SimulationState]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT state_json FROM simulations WHERE simulation_id = $1", simulation_id)
            if not row:
                return None
            return SimulationState.model_validate(row["state_json"])

    async def update_simulation(self, state: SimulationState) -> SimulationState:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE simulations SET status = $1, active_speaker_id = $2, state_json = $3, updated_at = NOW() WHERE simulation_id = $4",
                state.status,
                state.active_speaker_id,
                json.loads(state.model_dump_json()),
                state.simulation_id,
            )
            return state

    async def list_simulations(self, limit: int = 100, offset: int = 0, status: Optional[str] = None) -> List[SimulationState]:
        async with self.pool.acquire() as conn:
            if status:
                rows = await conn.fetch(
                    "SELECT state_json FROM simulations WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
                    status,
                    limit,
                    offset,
                )
            else:
                rows = await conn.fetch(
                    "SELECT state_json FROM simulations ORDER BY created_at DESC LIMIT $1 OFFSET $2",
                    limit,
                    offset,
                )
            return [SimulationState.model_validate(row["state_json"]) for row in rows]

    async def delete_simulation(self, simulation_id: str) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute("DELETE FROM simulations WHERE simulation_id = $1", simulation_id)
            return result == "DELETE 1"

    # ------------------------------------------------------------------
    # Stakeholders
    # ------------------------------------------------------------------

    async def create_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO stakeholders (id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())",
                stakeholder.id,
                stakeholder.name,
                stakeholder.role,
                stakeholder.focus,
                stakeholder.incentive_tuning,
                stakeholder.hidden_agenda or "",
                stakeholder.tag,
                stakeholder.tool_profile,
            )
            return stakeholder

    async def get_stakeholder(self, stakeholder_id: str) -> Optional[Stakeholder]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile FROM stakeholders WHERE id = $1",
                stakeholder_id,
            )
            if not row:
                return None
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

    async def update_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE stakeholders SET name = $1, role = $2, focus = $3, incentive_tuning = $4, hidden_agenda = $5, tag = $6, tool_profile = $7, updated_at = NOW() WHERE id = $8",
                stakeholder.name,
                stakeholder.role,
                stakeholder.focus,
                stakeholder.incentive_tuning,
                stakeholder.hidden_agenda or "",
                stakeholder.tag,
                stakeholder.tool_profile,
                stakeholder.id,
            )
            return stakeholder

    async def list_stakeholders(self, limit: int = 100, offset: int = 0, tag: Optional[str] = None) -> List[Stakeholder]:
        async with self.pool.acquire() as conn:
            if tag:
                rows = await conn.fetch(
                    "SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile FROM stakeholders WHERE tag = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
                    tag,
                    limit,
                    offset,
                )
            else:
                rows = await conn.fetch(
                    "SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile FROM stakeholders ORDER BY created_at DESC LIMIT $1 OFFSET $2",
                    limit,
                    offset,
                )

            return [
                Stakeholder(
                    id=row["id"],
                    name=row["name"],
                    role=row["role"],
                    focus=row["focus"],
                    incentive_tuning=row["incentive_tuning"],
                    hidden_agenda=row["hidden_agenda"] or "",
                    tag=row["tag"],
                    tool_profile=row["tool_profile"] or "none",
                )
                for row in rows
            ]

    async def delete_stakeholder(self, stakeholder_id: str) -> bool:
        async with self.pool.acquire() as conn:
            result = await conn.execute("DELETE FROM stakeholders WHERE id = $1", stakeholder_id)
            return result == "DELETE 1"

    async def get_all_stakeholders(self) -> List[Stakeholder]:
        return await self.list_stakeholders(limit=1000, offset=0)

    # ------------------------------------------------------------------
    # Scenario templates
    # ------------------------------------------------------------------

    async def create_template(self, template: ScenarioTemplate) -> ScenarioTemplate:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO scenario_templates (id, name, description, default_background, default_primary_goal, default_voltage, default_model_temperature, suggested_persona_ids, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())",
                template.id,
                template.name,
                template.description,
                template.default_background,
                template.default_primary_goal,
                template.default_voltage,
                template.default_model_temperature,
                template.suggested_persona_ids,
            )
            return template

    async def get_template(self, template_id: str) -> Optional[ScenarioTemplate]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM scenario_templates WHERE id = $1", template_id)
            if not row:
                return None
            return ScenarioTemplate(
                id=row["id"],
                name=row["name"],
                description=row["description"],
                default_background=row["default_background"],
                default_primary_goal=row["default_primary_goal"],
                default_voltage=row["default_voltage"],
                default_model_temperature=row["default_model_temperature"],
                suggested_persona_ids=row["suggested_persona_ids"] or [],
            )

    async def list_templates(self) -> List[ScenarioTemplate]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM scenario_templates ORDER BY name ASC")
            return [
                ScenarioTemplate(
                    id=row["id"],
                    name=row["name"],
                    description=row["description"],
                    default_background=row["default_background"],
                    default_primary_goal=row["default_primary_goal"],
                    default_voltage=row["default_voltage"],
                    default_model_temperature=row["default_model_temperature"],
                    suggested_persona_ids=row["suggested_persona_ids"] or [],
                )
                for row in rows
            ]

    async def template_exists(self, template_id: str) -> bool:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT 1 FROM scenario_templates WHERE id = $1", template_id)
            return row is not None

    async def stakeholder_exists(self, stakeholder_id: str) -> bool:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT 1 FROM stakeholders WHERE id = $1", stakeholder_id)
            return row is not None
