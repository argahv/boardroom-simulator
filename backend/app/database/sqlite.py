import json
import sqlite3
from typing import List, Optional
from pathlib import Path
from datetime import datetime

from app.models import ScenarioTemplate, SimulationState, Stakeholder
from .base import DatabaseBackend


class SQLiteBackend(DatabaseBackend):
    def __init__(self, db_path: str = "./data/boardroom.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn: Optional[sqlite3.Connection] = None

    async def initialize(self) -> None:
        self.conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        await self._create_tables()
        await self._migrate()

    async def close(self) -> None:
        if self.conn:
            self.conn.close()
            self.conn = None

    async def _create_tables(self) -> None:
        cursor = self.conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS stakeholders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                focus TEXT NOT NULL,
                incentive_tuning INTEGER NOT NULL DEFAULT 50,
                hidden_agenda TEXT,
                tag TEXT,
                tool_profile TEXT NOT NULL DEFAULT 'none',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scenario_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                default_background TEXT NOT NULL,
                default_primary_goal TEXT NOT NULL,
                default_voltage INTEGER NOT NULL DEFAULT 50,
                default_model_temperature TEXT NOT NULL DEFAULT 'stable',
                suggested_persona_ids TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS simulations (
                simulation_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                active_speaker_id TEXT,
                state_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS v2_simulations (
                simulation_id TEXT PRIMARY KEY,
                config_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'idle',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS v2_turns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                simulation_id TEXT NOT NULL,
                turn_index INTEGER NOT NULL,
                turn_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (simulation_id) REFERENCES v2_simulations(simulation_id)
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_simulations_created ON simulations(created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_stakeholders_tag ON stakeholders(tag)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_v2_simulations_status ON v2_simulations(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_v2_turns_sim ON v2_turns(simulation_id, turn_index)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_v2_turns_sim_created ON v2_turns(simulation_id, created_at)")

        self.conn.commit()

    async def _migrate(self) -> None:
        """Idempotent column additions for existing DBs."""
        cursor = self.conn.cursor()
        cursor.execute("PRAGMA table_info(stakeholders)")
        cols = {row["name"] for row in cursor.fetchall()}
        if "tool_profile" not in cols:
            cursor.execute("ALTER TABLE stakeholders ADD COLUMN tool_profile TEXT NOT NULL DEFAULT 'none'")
            self.conn.commit()

        cursor.execute("PRAGMA table_info(simulations)")
        sim_cols = {row["name"] for row in cursor.fetchall()}
        if "runtime_status" not in sim_cols:
            cursor.execute("ALTER TABLE simulations ADD COLUMN runtime_status TEXT NOT NULL DEFAULT 'idle'")
        if "state_version" not in sim_cols:
            cursor.execute("ALTER TABLE simulations ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0")
        self.conn.commit()

    # ------------------------------------------------------------------
    # Simulations
    # ------------------------------------------------------------------

    async def create_simulation(self, state: SimulationState) -> SimulationState:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO simulations (simulation_id, status, active_speaker_id, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (state.simulation_id, state.status, state.active_speaker_id, state.model_dump_json(), now, now),
        )
        self.conn.commit()
        return state

    async def get_simulation(self, simulation_id: str) -> Optional[SimulationState]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT state_json FROM simulations WHERE simulation_id = ?", (simulation_id,))
        row = cursor.fetchone()
        return SimulationState.model_validate_json(row["state_json"]) if row else None

    async def update_simulation(self, state: SimulationState) -> SimulationState:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "UPDATE simulations SET status = ?, active_speaker_id = ?, state_json = ?, updated_at = ? WHERE simulation_id = ?",
            (state.status, state.active_speaker_id, state.model_dump_json(), now, state.simulation_id),
        )
        self.conn.commit()
        return state

    async def list_simulations(self, limit: int = 100, offset: int = 0, status: Optional[str] = None) -> List[SimulationState]:
        cursor = self.conn.cursor()
        query = "SELECT state_json FROM simulations"
        params: list = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        cursor.execute(query, params)
        return [SimulationState.model_validate_json(row["state_json"]) for row in cursor.fetchall()]

    async def delete_simulation(self, simulation_id: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM simulations WHERE simulation_id = ?", (simulation_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    # ------------------------------------------------------------------
    # v2 Simulations
    # ------------------------------------------------------------------

    async def create_v2_simulation(self, simulation_id: str, config_json: str) -> None:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO v2_simulations (simulation_id, config_json, status, created_at, updated_at) VALUES (?, ?, 'idle', ?, ?)",
            (simulation_id, config_json, now, now),
        )
        self.conn.commit()

    async def get_v2_simulation(self, simulation_id: str) -> Optional[dict]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT config_json, status FROM v2_simulations WHERE simulation_id = ?", (simulation_id,))
        row = cursor.fetchone()
        return {"config": json.loads(row["config_json"]), "status": row["status"]} if row else None

    async def update_v2_simulation_status(self, simulation_id: str, status: str) -> None:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "UPDATE v2_simulations SET status = ?, updated_at = ? WHERE simulation_id = ?",
            (status, now, simulation_id),
        )
        self.conn.commit()

    async def insert_v2_turn(self, simulation_id: str, turn_index: int, turn_json: str) -> None:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO v2_turns (simulation_id, turn_index, turn_json, created_at) VALUES (?, ?, ?, ?)",
            (simulation_id, turn_index, turn_json, now),
        )
        self.conn.commit()

    async def get_v2_turns(self, simulation_id: str, from_index: int = 0) -> list[dict]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT turn_json, turn_index FROM v2_turns WHERE simulation_id = ? AND turn_index >= ? ORDER BY turn_index ASC",
            (simulation_id, from_index),
        )
        return [json.loads(row["turn_json"]) for row in cursor.fetchall()]

    # ------------------------------------------------------------------
    # Stakeholders
    # ------------------------------------------------------------------

    def _row_to_stakeholder(self, row: sqlite3.Row) -> Stakeholder:
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

    async def create_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO stakeholders (id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (stakeholder.id, stakeholder.name, stakeholder.role, stakeholder.focus, stakeholder.incentive_tuning, stakeholder.hidden_agenda or "", stakeholder.tag, stakeholder.tool_profile, now, now),
        )
        self.conn.commit()
        return stakeholder

    async def get_stakeholder(self, stakeholder_id: str) -> Optional[Stakeholder]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile FROM stakeholders WHERE id = ?", (stakeholder_id,))
        row = cursor.fetchone()
        return self._row_to_stakeholder(row) if row else None

    async def update_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "UPDATE stakeholders SET name = ?, role = ?, focus = ?, incentive_tuning = ?, hidden_agenda = ?, tag = ?, tool_profile = ?, updated_at = ? WHERE id = ?",
            (stakeholder.name, stakeholder.role, stakeholder.focus, stakeholder.incentive_tuning, stakeholder.hidden_agenda or "", stakeholder.tag, stakeholder.tool_profile, now, stakeholder.id),
        )
        self.conn.commit()
        return stakeholder

    async def list_stakeholders(self, limit: int = 100, offset: int = 0, tag: Optional[str] = None) -> List[Stakeholder]:
        cursor = self.conn.cursor()
        query = "SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile FROM stakeholders"
        params: list = []
        if tag:
            query += " WHERE tag = ?"
            params.append(tag)
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        cursor.execute(query, params)
        return [self._row_to_stakeholder(row) for row in cursor.fetchall()]

    async def delete_stakeholder(self, stakeholder_id: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM stakeholders WHERE id = ?", (stakeholder_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    async def get_all_stakeholders(self) -> List[Stakeholder]:
        return await self.list_stakeholders(limit=1000, offset=0)

    # ------------------------------------------------------------------
    # Scenario templates
    # ------------------------------------------------------------------

    def _row_to_template(self, row: sqlite3.Row) -> ScenarioTemplate:
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

    async def create_template(self, template: ScenarioTemplate) -> ScenarioTemplate:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO scenario_templates (id, name, description, default_background, default_primary_goal, default_voltage, default_model_temperature, suggested_persona_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (template.id, template.name, template.description, template.default_background, template.default_primary_goal, template.default_voltage, template.default_model_temperature, json.dumps(template.suggested_persona_ids), now, now),
        )
        self.conn.commit()
        return template

    async def get_template(self, template_id: str) -> Optional[ScenarioTemplate]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM scenario_templates WHERE id = ?", (template_id,))
        row = cursor.fetchone()
        return self._row_to_template(row) if row else None

    async def list_templates(self) -> List[ScenarioTemplate]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM scenario_templates ORDER BY name ASC")
        return [self._row_to_template(row) for row in cursor.fetchall()]

    async def template_exists(self, template_id: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute("SELECT 1 FROM scenario_templates WHERE id = ?", (template_id,))
        return cursor.fetchone() is not None

    async def stakeholder_exists(self, stakeholder_id: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute("SELECT 1 FROM stakeholders WHERE id = ?", (stakeholder_id,))
        return cursor.fetchone() is not None
