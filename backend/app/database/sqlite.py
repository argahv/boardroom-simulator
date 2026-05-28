import json
import sqlite3
import uuid
from typing import List, Optional
from pathlib import Path
from datetime import datetime

from app.models import (
    PersonaDocument,
    PersonaEvolution,
    PersonaResearch,
    ScenarioTemplate,
    SimulationDocument,
    SimulationState,
    Stakeholder,
)
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
                backstory TEXT DEFAULT '',
                stance TEXT DEFAULT 'neutral',
                personality TEXT DEFAULT '{}',
                tools TEXT DEFAULT '[]',
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

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_simulations_created ON simulations(created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_stakeholders_tag ON stakeholders(tag)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS postmortems (
                simulation_id TEXT PRIMARY KEY,
                postmortem_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS state_snapshots (
                id TEXT PRIMARY KEY,
                simulation_id TEXT NOT NULL,
                turn_index INTEGER NOT NULL,
                snapshot_json TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_sim_turn ON state_snapshots(simulation_id, turn_index)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS document_uploads (
                id TEXT PRIMARY KEY,
                simulation_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                file_size INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending',
                extracted_text TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (simulation_id) REFERENCES simulations(simulation_id)
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_doc_uploads_sim ON document_uploads(simulation_id)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS agent_goals (
                id TEXT PRIMARY KEY,
                simulation_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                turn_index INTEGER NOT NULL,
                goal_text TEXT NOT NULL,
                priority REAL NOT NULL,
                source TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_agent_goals_agent ON agent_goals(agent_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_agent_goals_sim ON agent_goals(simulation_id)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS persona_documents (
                id TEXT PRIMARY KEY,
                persona_id TEXT NOT NULL,
                filename TEXT NOT NULL DEFAULT '',
                filepath TEXT NOT NULL DEFAULT '',
                content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                size_bytes INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending',
                extracted_text TEXT,
                embedding_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (persona_id) REFERENCES stakeholders(id)
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_persona_docs_pid ON persona_documents(persona_id)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS persona_evolution (
                id TEXT PRIMARY KEY,
                persona_id TEXT NOT NULL,
                simulation_id TEXT NOT NULL DEFAULT '',
                proposed_deltas TEXT NOT NULL DEFAULT '{}',
                before_snapshot TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'pending',
                applied_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (persona_id) REFERENCES stakeholders(id)
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_persona_evo_pid ON persona_evolution(persona_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_persona_evo_status ON persona_evolution(status)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS persona_research (
                id TEXT PRIMARY KEY,
                persona_id TEXT NOT NULL,
                query TEXT NOT NULL DEFAULT '',
                results TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                FOREIGN KEY (persona_id) REFERENCES stakeholders(id)
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_persona_research_pid ON persona_research(persona_id)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS document_uploads (
                id TEXT PRIMARY KEY,
                simulation_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                filepath TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                content_type TEXT NOT NULL,
                extracted_text TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_document_uploads_sim ON document_uploads(simulation_id)")

        self.conn.commit()

    async def _migrate(self) -> None:
        """Idempotent column additions for existing DBs."""
        cursor = self.conn.cursor()
        cursor.execute("PRAGMA table_info(stakeholders)")
        cols = {row["name"] for row in cursor.fetchall()}
        if "tool_profile" not in cols:
            cursor.execute("ALTER TABLE stakeholders ADD COLUMN tool_profile TEXT NOT NULL DEFAULT 'none'")
            self.conn.commit()
        for col_name, col_def in [
            ("backstory", "TEXT DEFAULT ''"),
            ("stance", "TEXT DEFAULT 'neutral'"),
            ("personality", "TEXT DEFAULT '{}'"),
            ("tools", "TEXT DEFAULT '[]'"),
        ]:
            if col_name not in cols:
                cursor.execute(f"ALTER TABLE stakeholders ADD COLUMN {col_name} {col_def}")
                self.conn.commit()

        cursor.execute("PRAGMA table_info(simulations)")
        sim_cols = {row["name"] for row in cursor.fetchall()}
        if "runtime_status" not in sim_cols:
            cursor.execute("ALTER TABLE simulations ADD COLUMN runtime_status TEXT NOT NULL DEFAULT 'idle'")
        if "state_version" not in sim_cols:
            cursor.execute("ALTER TABLE simulations ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0")
        self.conn.commit()

        cursor.execute("PRAGMA table_info(agent_goals)")
        if not cursor.fetchall():
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS agent_goals (
                    id TEXT PRIMARY KEY,
                    simulation_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    turn_index INTEGER NOT NULL,
                    goal_text TEXT NOT NULL,
                    priority REAL NOT NULL,
                    source TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_agent_goals_agent ON agent_goals(agent_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_agent_goals_sim ON agent_goals(simulation_id)")
            self.conn.commit()

        cursor.execute("PRAGMA table_info(persona_documents)")
        if not cursor.fetchall():
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS persona_documents (
                    id TEXT PRIMARY KEY,
                    persona_id TEXT NOT NULL,
                    filename TEXT NOT NULL DEFAULT '',
                    filepath TEXT NOT NULL DEFAULT '',
                    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                    size_bytes INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'pending',
                    extracted_text TEXT,
                    embedding_id TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (persona_id) REFERENCES stakeholders(id)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_persona_docs_pid ON persona_documents(persona_id)")
            self.conn.commit()

        cursor.execute("PRAGMA table_info(persona_evolution)")
        if not cursor.fetchall():
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS persona_evolution (
                    id TEXT PRIMARY KEY,
                    persona_id TEXT NOT NULL,
                    simulation_id TEXT NOT NULL DEFAULT '',
                    proposed_deltas TEXT NOT NULL DEFAULT '{}',
                    before_snapshot TEXT NOT NULL DEFAULT '{}',
                    status TEXT NOT NULL DEFAULT 'pending',
                    applied_at TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (persona_id) REFERENCES stakeholders(id)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_persona_evo_pid ON persona_evolution(persona_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_persona_evo_status ON persona_evolution(status)")
            self.conn.commit()

        cursor.execute("PRAGMA table_info(persona_research)")
        if not cursor.fetchall():
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS persona_research (
                    id TEXT PRIMARY KEY,
                    persona_id TEXT NOT NULL,
                    query TEXT NOT NULL DEFAULT '',
                    results TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (persona_id) REFERENCES stakeholders(id)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_persona_research_pid ON persona_research(persona_id)")
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
    # v2 State Snapshots
    # ------------------------------------------------------------------

    async def create_state_snapshot(
        self, simulation_id: str, turn_index: int, snapshot_json: str, version: int = 1
    ) -> str:
        cursor = self.conn.cursor()
        snapshot_id = uuid.uuid4().hex
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO state_snapshots (id, simulation_id, turn_index, snapshot_json, version, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (snapshot_id, simulation_id, turn_index, snapshot_json, version, now),
        )
        self.conn.commit()
        return snapshot_id

    async def get_state_snapshots_by_simulation(self, simulation_id: str) -> list[dict]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, simulation_id, turn_index, snapshot_json, version, created_at FROM state_snapshots WHERE simulation_id = ? ORDER BY turn_index ASC",
            (simulation_id,),
        )
        return [
            {
                "id": row["id"],
                "simulation_id": row["simulation_id"],
                "turn_index": row["turn_index"],
                "snapshot_json": json.loads(row["snapshot_json"]),
                "version": row["version"],
                "created_at": row["created_at"],
            }
            for row in cursor.fetchall()
        ]

    async def get_latest_state_snapshot(self, simulation_id: str) -> Optional[dict]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, simulation_id, turn_index, snapshot_json, version, created_at FROM state_snapshots WHERE simulation_id = ? ORDER BY turn_index DESC LIMIT 1",
            (simulation_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "simulation_id": row["simulation_id"],
            "turn_index": row["turn_index"],
            "snapshot_json": json.loads(row["snapshot_json"]),
            "version": row["version"],
            "created_at": row["created_at"],
        }

    async def delete_old_state_snapshots(self, simulation_id: str, max_keep: int = 50) -> None:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            DELETE FROM state_snapshots
            WHERE simulation_id = ? AND id NOT IN (
                SELECT id FROM state_snapshots
                WHERE simulation_id = ?
                ORDER BY turn_index DESC
                LIMIT ?
            )
            """,
            (simulation_id, simulation_id, max_keep),
        )
        self.conn.commit()

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
            backstory=row["backstory"] or "",
            stance=row["stance"] or "neutral",
            personality=row["personality"] or "{}",
            tools=row["tools"] or "[]",
        )

    async def create_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO stakeholders (id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile, backstory, stance, personality, tools, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (stakeholder.id, stakeholder.name, stakeholder.role, stakeholder.focus, stakeholder.incentive_tuning, stakeholder.hidden_agenda or "", stakeholder.tag, stakeholder.tool_profile, stakeholder.backstory or "", stakeholder.stance or "neutral", stakeholder.personality or "{}", stakeholder.tools or "[]", now, now),
        )
        self.conn.commit()
        return stakeholder

    async def get_stakeholder(self, stakeholder_id: str) -> Optional[Stakeholder]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile, backstory, stance, personality, tools FROM stakeholders WHERE id = ?", (stakeholder_id,))
        row = cursor.fetchone()
        return self._row_to_stakeholder(row) if row else None

    async def update_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "UPDATE stakeholders SET name = ?, role = ?, focus = ?, incentive_tuning = ?, hidden_agenda = ?, tag = ?, tool_profile = ?, backstory = ?, stance = ?, personality = ?, tools = ?, updated_at = ? WHERE id = ?",
            (stakeholder.name, stakeholder.role, stakeholder.focus, stakeholder.incentive_tuning, stakeholder.hidden_agenda or "", stakeholder.tag, stakeholder.tool_profile, stakeholder.backstory or "", stakeholder.stance or "neutral", stakeholder.personality or "{}", stakeholder.tools or "[]", now, stakeholder.id),
        )
        self.conn.commit()
        return stakeholder

    async def list_stakeholders(self, limit: int = 100, offset: int = 0, tag: Optional[str] = None) -> List[Stakeholder]:
        cursor = self.conn.cursor()
        query = "SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile, backstory, stance, personality, tools FROM stakeholders"
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

    # ------------------------------------------------------------------
    # Document uploads
    # ------------------------------------------------------------------

    def _row_to_document(self, row: sqlite3.Row) -> SimulationDocument:
        return SimulationDocument(
            id=row["id"],
            simulation_id=row["simulation_id"],
            filename=row["filename"],
            content_type=row["content_type"],
            size_bytes=row["file_size"],
            status=row["status"],
            extracted_text=row["extracted_text"],
            created_at=str(row["created_at"] or ""),
        )

    async def create_document(self, doc: SimulationDocument) -> None:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO document_uploads (id, simulation_id, filename, content_type, file_size, status, extracted_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (doc.id, doc.simulation_id, doc.filename, doc.content_type, doc.size_bytes, doc.status, doc.extracted_text, now, now),
        )
        self.conn.commit()

    async def get_documents_by_simulation(self, simulation_id: str) -> list[SimulationDocument]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, simulation_id, filename, content_type, file_size, status, extracted_text, created_at FROM document_uploads WHERE simulation_id = ? ORDER BY created_at ASC",
            (simulation_id,),
        )
        return [self._row_to_document(row) for row in cursor.fetchall()]

    async def get_document(self, document_id: str) -> Optional[SimulationDocument]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, simulation_id, filename, content_type, file_size, status, extracted_text FROM document_uploads WHERE id = ?",
            (document_id,),
        )
        row = cursor.fetchone()
        return self._row_to_document(row) if row else None

    async def update_document_status(
        self, document_id: str, status: str, extracted_text: str | None = None
    ) -> None:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        if extracted_text is not None:
            cursor.execute(
                "UPDATE document_uploads SET status = ?, extracted_text = ?, updated_at = ? WHERE id = ?",
                (status, extracted_text, now, document_id),
            )
        else:
            cursor.execute(
                "UPDATE document_uploads SET status = ?, updated_at = ? WHERE id = ?",
                (status, now, document_id),
            )
        self.conn.commit()

    async def delete_documents_by_simulation(self, simulation_id: str) -> None:
        cursor = self.conn.cursor()
        cursor.execute(
            "DELETE FROM document_uploads WHERE simulation_id = ?",
            (simulation_id,),
        )
        self.conn.commit()

    # ------------------------------------------------------------------
    # Persona Growth System (v2)
    # ------------------------------------------------------------------

    def _row_to_persona_v2(self, row: sqlite3.Row) -> dict:
        personality_raw = row["personality"] or "{}"
        tools_raw = row["tools"] or "[]"
        return {
            "id": row["id"],
            "name": row["name"],
            "role": row["role"],
            "focus": row["focus"],
            "incentive_tuning": row["incentive_tuning"],
            "hidden_agenda": row["hidden_agenda"] or "",
            "tag": row["tag"],
            "tool_profile": row["tool_profile"] or "none",
            "backstory": row["backstory"] or "",
            "stance": row["stance"] or "neutral",
            "personality": json.loads(personality_raw) if isinstance(personality_raw, str) else personality_raw,
            "tools": json.loads(tools_raw) if isinstance(tools_raw, str) else tools_raw,
        }

    async def list_personas_v2(self) -> list[dict]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile, backstory, stance, personality, tools FROM stakeholders ORDER BY created_at DESC LIMIT 1000"
        )
        return [self._row_to_persona_v2(row) for row in cursor.fetchall()]

    async def get_persona_v2(self, persona_id: str) -> dict | None:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag, tool_profile, backstory, stance, personality, tools FROM stakeholders WHERE id = ?",
            (persona_id,),
        )
        row = cursor.fetchone()
        return self._row_to_persona_v2(row) if row else None

    # ── Persona documents ──────────────────────────────────────────────

    def _row_to_persona_document(self, row: sqlite3.Row) -> PersonaDocument:
        return PersonaDocument(
            id=row["id"],
            persona_id=row["persona_id"],
            filename=row["filename"] or "",
            filepath=row["filepath"] or "",
            content_type=row["content_type"] or "application/octet-stream",
            size_bytes=row["size_bytes"] or 0,
            status=row["status"] or "pending",
            extracted_text=row["extracted_text"],
            embedding_id=row["embedding_id"],
            created_at=row["created_at"] or "",
        )

    async def create_persona_document(self, doc: PersonaDocument) -> PersonaDocument:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO persona_documents (id, persona_id, filename, filepath, content_type, size_bytes, status, extracted_text, embedding_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (doc.id, doc.persona_id, doc.filename, doc.filepath, doc.content_type, doc.size_bytes, doc.status, doc.extracted_text, doc.embedding_id, now),
        )
        self.conn.commit()
        return doc

    async def get_persona_documents(self, persona_id: str) -> list[PersonaDocument]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, persona_id, filename, filepath, content_type, size_bytes, status, extracted_text, embedding_id, created_at FROM persona_documents WHERE persona_id = ? ORDER BY created_at ASC",
            (persona_id,),
        )
        return [self._row_to_persona_document(row) for row in cursor.fetchall()]

    async def delete_persona_document(self, document_id: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM persona_documents WHERE id = ?", (document_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    # ── Persona evolution ──────────────────────────────────────────────

    def _row_to_persona_evolution(self, row: sqlite3.Row) -> PersonaEvolution:
        return PersonaEvolution(
            id=row["id"],
            persona_id=row["persona_id"],
            simulation_id=row["simulation_id"] or "",
            proposed_deltas=row["proposed_deltas"] or "{}",
            before_snapshot=row["before_snapshot"] or "{}",
            status=row["status"] or "pending",
            applied_at=row["applied_at"],
            created_at=row["created_at"] or "",
        )

    async def create_persona_evolution(self, evolution: PersonaEvolution) -> PersonaEvolution:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO persona_evolution (id, persona_id, simulation_id, proposed_deltas, before_snapshot, status, applied_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (evolution.id, evolution.persona_id, evolution.simulation_id, evolution.proposed_deltas, evolution.before_snapshot, evolution.status, evolution.applied_at, now),
        )
        self.conn.commit()
        return evolution

    async def get_pending_evolutions(self, persona_id: str) -> list[PersonaEvolution]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, persona_id, simulation_id, proposed_deltas, before_snapshot, status, applied_at, created_at FROM persona_evolution WHERE persona_id = ? AND status = 'pending' ORDER BY created_at DESC",
            (persona_id,),
        )
        return [self._row_to_persona_evolution(row) for row in cursor.fetchall()]

    async def approve_evolution(self, evolution_id: str) -> bool:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "UPDATE persona_evolution SET status = 'approved', applied_at = ? WHERE id = ? AND status = 'pending'",
            (now, evolution_id),
        )
        self.conn.commit()
        return cursor.rowcount > 0

    async def reject_evolution(self, evolution_id: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE persona_evolution SET status = 'rejected' WHERE id = ? AND status = 'pending'",
            (evolution_id,),
        )
        self.conn.commit()
        return cursor.rowcount > 0

    async def get_evolution(self, evolution_id: str) -> Optional[PersonaEvolution]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, persona_id, simulation_id, proposed_deltas, before_snapshot, status, applied_at, created_at FROM persona_evolution WHERE id = ?",
            (evolution_id,),
        )
        row = cursor.fetchone()
        return self._row_to_persona_evolution(row) if row else None

    async def get_evolution_history(self, persona_id: str) -> list[PersonaEvolution]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, persona_id, simulation_id, proposed_deltas, before_snapshot, status, applied_at, created_at FROM persona_evolution WHERE persona_id = ? ORDER BY created_at DESC",
            (persona_id,),
        )
        return [self._row_to_persona_evolution(row) for row in cursor.fetchall()]

    async def update_persona_v2(self, persona_id: str, personality: str, stance: str | None = None) -> bool:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        if stance is not None:
            cursor.execute(
                "UPDATE stakeholders SET personality = ?, stance = ?, updated_at = ? WHERE id = ?",
                (personality, stance, now, persona_id),
            )
        else:
            cursor.execute(
                "UPDATE stakeholders SET personality = ?, updated_at = ? WHERE id = ?",
                (personality, now, persona_id),
            )
        self.conn.commit()
        return cursor.rowcount > 0

    # ── Persona research ───────────────────────────────────────────────

    def _row_to_persona_research(self, row: sqlite3.Row) -> PersonaResearch:
        return PersonaResearch(
            id=row["id"],
            persona_id=row["persona_id"],
            query=row["query"] or "",
            results=row["results"] or "[]",
            created_at=row["created_at"] or "",
        )

    async def create_persona_research(self, research: PersonaResearch) -> PersonaResearch:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO persona_research (id, persona_id, query, results, created_at) VALUES (?, ?, ?, ?, ?)",
            (research.id, research.persona_id, research.query, research.results, now),
        )
        self.conn.commit()
        return research

    async def get_persona_research(self, persona_id: str) -> list[PersonaResearch]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, persona_id, query, results, created_at FROM persona_research WHERE persona_id = ? ORDER BY created_at DESC",
            (persona_id,),
        )
        return [self._row_to_persona_research(row) for row in cursor.fetchall()]

    async def update_persona_research(self, research_id: str, results: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE persona_research SET results = ? WHERE id = ?",
            (results, research_id),
        )
        self.conn.commit()
        return cursor.rowcount > 0

    # ------------------------------------------------------------------
    # Analytics / Aggregates
    # ------------------------------------------------------------------

    async def get_all_turns_count(self, simulation_id: str | None = None) -> int:
        cursor = self.conn.cursor()
        if simulation_id:
            cursor.execute("SELECT COUNT(*) FROM turns WHERE simulation_id = ?", (simulation_id,))
        else:
            cursor.execute("SELECT COUNT(*) FROM turns")
        row = cursor.fetchone()
        return row[0] if row else 0



