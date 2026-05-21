import json
import sqlite3
from typing import List, Optional
from pathlib import Path
from datetime import datetime

from app.models import SimulationState, Stakeholder
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
            CREATE INDEX IF NOT EXISTS idx_simulations_status 
            ON simulations(status)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_simulations_created 
            ON simulations(created_at DESC)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_stakeholders_tag 
            ON stakeholders(tag)
        """)
        
        self.conn.commit()
    
    async def create_simulation(self, state: SimulationState) -> SimulationState:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        
        cursor.execute("""
            INSERT INTO simulations (simulation_id, status, active_speaker_id, state_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            state.simulation_id,
            state.status,
            state.active_speaker_id,
            state.model_dump_json(),
            now,
            now
        ))
        
        self.conn.commit()
        return state
    
    async def get_simulation(self, simulation_id: str) -> Optional[SimulationState]:
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT state_json FROM simulations WHERE simulation_id = ?
        """, (simulation_id,))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return SimulationState.model_validate_json(row['state_json'])
    
    async def update_simulation(self, state: SimulationState) -> SimulationState:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        
        cursor.execute("""
            UPDATE simulations 
            SET status = ?, active_speaker_id = ?, state_json = ?, updated_at = ?
            WHERE simulation_id = ?
        """, (
            state.status,
            state.active_speaker_id,
            state.model_dump_json(),
            now,
            state.simulation_id
        ))
        
        self.conn.commit()
        return state
    
    async def list_simulations(
        self,
        limit: int = 100,
        offset: int = 0,
        status: Optional[str] = None
    ) -> List[SimulationState]:
        cursor = self.conn.cursor()
        
        query = "SELECT state_json FROM simulations"
        params = []
        
        if status:
            query += " WHERE status = ?"
            params.append(status)
        
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        return [SimulationState.model_validate_json(row['state_json']) for row in rows]
    
    async def delete_simulation(self, simulation_id: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute("""
            DELETE FROM simulations WHERE simulation_id = ?
        """, (simulation_id,))
        
        self.conn.commit()
        return cursor.rowcount > 0
    
    async def create_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        
        cursor.execute("""
            INSERT INTO stakeholders (id, name, role, focus, incentive_tuning, hidden_agenda, tag, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            stakeholder.id,
            stakeholder.name,
            stakeholder.role,
            stakeholder.focus,
            stakeholder.incentive_tuning,
            stakeholder.hidden_agenda or "",
            stakeholder.tag,
            now,
            now
        ))
        
        self.conn.commit()
        return stakeholder
    
    async def get_stakeholder(self, stakeholder_id: str) -> Optional[Stakeholder]:
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag 
            FROM stakeholders WHERE id = ?
        """, (stakeholder_id,))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return Stakeholder(
            id=row['id'],
            name=row['name'],
            role=row['role'],
            focus=row['focus'],
            incentive_tuning=row['incentive_tuning'],
            hidden_agenda=row['hidden_agenda'] or "",
            tag=row['tag']
        )
    
    async def update_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        cursor = self.conn.cursor()
        now = datetime.utcnow().isoformat()
        
        cursor.execute("""
            UPDATE stakeholders 
            SET name = ?, role = ?, focus = ?, incentive_tuning = ?, hidden_agenda = ?, tag = ?, updated_at = ?
            WHERE id = ?
        """, (
            stakeholder.name,
            stakeholder.role,
            stakeholder.focus,
            stakeholder.incentive_tuning,
            stakeholder.hidden_agenda or "",
            stakeholder.tag,
            now,
            stakeholder.id
        ))
        
        self.conn.commit()
        return stakeholder
    
    async def list_stakeholders(
        self,
        limit: int = 100,
        offset: int = 0,
        tag: Optional[str] = None
    ) -> List[Stakeholder]:
        cursor = self.conn.cursor()
        
        query = "SELECT id, name, role, focus, incentive_tuning, hidden_agenda, tag FROM stakeholders"
        params = []
        
        if tag:
            query += " WHERE tag = ?"
            params.append(tag)
        
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        return [
            Stakeholder(
                id=row['id'],
                name=row['name'],
                role=row['role'],
                focus=row['focus'],
                incentive_tuning=row['incentive_tuning'],
                hidden_agenda=row['hidden_agenda'] or "",
                tag=row['tag']
            )
            for row in rows
        ]
    
    async def delete_stakeholder(self, stakeholder_id: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute("""
            DELETE FROM stakeholders WHERE id = ?
        """, (stakeholder_id,))
        
        self.conn.commit()
        return cursor.rowcount > 0
    
    async def get_all_stakeholders(self) -> List[Stakeholder]:
        return await self.list_stakeholders(limit=1000, offset=0)
