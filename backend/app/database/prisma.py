"""
Prisma (prisma-client-py) backend for Boardroom Simulator.

Uses the Prisma ORM to interact with PostgreSQL with type-safe queries.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import prisma.errors
from prisma import Prisma
from prisma.fields import Json as PrismaJson

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

logger = logging.getLogger("boardroom.db.prisma")


def _extract_emotion(content: str, action_type: str) -> dict:
    """Simple keyword-based emotion extraction."""
    emotions = {"anger": 0.0, "fear": 0.0, "joy": 0.0, "shame": 0.0, "surprise": 0.0}
    content_lower = content.lower()
    if action_type == "challenge":
        emotions["anger"] = 0.6
    elif action_type == "compromise":
        emotions["joy"] = 0.4
    elif action_type == "escalate":
        emotions["anger"] = 0.7
        emotions["fear"] = 0.3
    elif action_type == "coalition_signal":
        emotions["joy"] = 0.3
    elif action_type == "walkaway":
        emotions["anger"] = 0.5
        emotions["shame"] = 0.3
    if "?" in content:
        emotions["surprise"] = max(emotions["surprise"], 0.2)
    if "sorry" in content_lower or "apologize" in content_lower:
        emotions["shame"] = max(emotions["shame"], 0.5)
    return emotions


class PrismaBackend(DatabaseBackend):
    """Prisma-based implementation of DatabaseBackend using prisma-client-py."""

    def __init__(self) -> None:
        self._client: Optional[Prisma] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        self._client = Prisma()
        await self._client.connect()
        logger.info("PrismaBackend connected to PostgreSQL")

    async def close(self) -> None:
        if self._client is not None:
            await self._client.disconnect()
            self._client = None
            logger.info("PrismaBackend disconnected")

    def _client_or_raise(self) -> Prisma:
        if self._client is None:
            raise RuntimeError("PrismaBackend not initialised — call initialize() first")
        return self._client

    # ------------------------------------------------------------------
    # Timestamp helper
    # ------------------------------------------------------------------

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    # ------------------------------------------------------------------
    # UUID validation helper
    # ------------------------------------------------------------------

    @staticmethod
    def _is_valid_uuid(value: str) -> bool:
        """Check if a string is a valid UUID (for UUID column queries)."""
        if not value or not isinstance(value, str):
            return False
        try:
            uuid.UUID(value)
            return True
        except (ValueError, AttributeError):
            return False

    # ------------------------------------------------------------------
    # JSON coercion helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _pydantic_to_json(val: Any) -> Any:
        """Pydantic JSON string → Prisma dict/list."""
        if isinstance(val, str):
            return json.loads(val) if val.strip() else {}
        return val or {}

    # ------------------------------------------------------------------
    # Row → Model converters
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_stakeholder(row) -> Stakeholder:
        return Stakeholder(
            id=row.id,
            name=row.name,
            role=row.role,
            focus=row.focus,
            incentive_tuning=row.incentive_tuning,
            hidden_agenda=row.hidden_agenda or "",
            tag=row.tag,
            tool_profile=row.tool_profile or "none",
            backstory=row.backstory or "",
            stance=row.stance or "neutral",
            personality=json.dumps(row.personality or {}, separators=(",", ":")),
            tools=json.dumps(row.tools or [], separators=(",", ":")),
        )

    @staticmethod
    def _row_to_persona_detail(row) -> dict:
        personality = row.personality or {}
        if isinstance(personality, str):
            personality = json.loads(personality)
        tools = row.tools or []
        if isinstance(tools, str):
            tools = json.loads(tools)
        return {
            "id": row.id,
            "name": row.name,
            "role": row.role,
            "focus": row.focus,
            "incentive_tuning": row.incentive_tuning,
            "hidden_agenda": row.hidden_agenda or "",
            "tag": row.tag,
            "tool_profile": row.tool_profile or "none",
            "backstory": row.backstory or "",
            "stance": row.stance or "neutral",
            "personality": personality,
            "tools": tools,
        }

    @staticmethod
    def _row_to_template(row) -> ScenarioTemplate:
        suggested = row.suggested_persona_ids
        if isinstance(suggested, str):
            parsed = json.loads(suggested) if suggested.strip() else []
        elif isinstance(suggested, list):
            parsed = suggested
        else:
            parsed = []
        return ScenarioTemplate(
            id=row.id,
            name=row.name,
            description=row.description,
            default_background=row.default_background,
            default_primary_goal=row.default_primary_goal,
            default_voltage=row.default_voltage,
            default_model_temperature=row.default_model_temperature,
            suggested_persona_ids=parsed,
        )

    @staticmethod
    def _row_to_document(row) -> SimulationDocument:
        return SimulationDocument(
            id=row.id,
            simulation_id=row.simulation_id,
            filename=row.filename,
            content_type=row.content_type,
            size_bytes=row.file_size,  # DB has 'file_size', model uses 'size_bytes'
            status=row.status,
            extracted_text=row.extracted_text,
            created_at=str(row.created_at) if row.created_at else "",
        )

    # ------------------------------------------------------------------
    # Simulations (v1)
    # ------------------------------------------------------------------

    async def create_simulation(self, state: SimulationState) -> SimulationState:
        client = self._client_or_raise()
        now = self._now()
        await client.simulations.create(data={
            "id": str(uuid.uuid4()),
            "simulation_id": state.simulation_id,
            "status": state.status,
            "active_speaker_id": state.active_speaker_id,
            "state_json": PrismaJson(json.loads(state.model_dump_json())),
            "runtime_status": state.runtime_status,
            "state_version": state.state_version,
            "created_at": now,
            "updated_at": now,
        })
        return state

    async def get_simulation(self, simulation_id: str) -> Optional[SimulationState]:
        client = self._client_or_raise()
        row = await client.simulations.find_first(
            where={"simulation_id": simulation_id},
        )
        if row is not None and row.state_json is not None:
            state_json = row.state_json
            if isinstance(state_json, str):
                state_json = json.loads(state_json)
            return SimulationState.model_validate(state_json)
        return None

    async def update_simulation(self, state: SimulationState) -> SimulationState:
        client = self._client_or_raise()
        now = self._now()
        await client.simulations.update(
            where={"simulation_id": state.simulation_id},
            data={
                "status": state.status,
                "active_speaker_id": state.active_speaker_id,
                "state_json": PrismaJson(json.loads(state.model_dump_json())),
                "runtime_status": state.runtime_status,
                "state_version": state.state_version,
                "updated_at": now,
            },
        )
        return state

    async def list_simulations(
        self,
        limit: int = 100,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> list[SimulationState]:
        client = self._client_or_raise()
        where: dict[str, Any] = {}
        if status is not None:
            where["status"] = status
        rows = await client.simulations.find_many(
            take=limit,
            skip=offset,
            where=where or None,
            order={"created_at": "desc"},
        )
        result: list[SimulationState] = []
        for r in rows:
            state_json = r.state_json
            if state_json is None:
                continue
            if isinstance(state_json, str):
                state_json = json.loads(state_json)
            result.append(SimulationState.model_validate(state_json))
        return result

    async def delete_simulation(self, simulation_id: str) -> bool:
        client = self._client_or_raise()
        try:
            row = await client.simulations.delete(
                where={"simulation_id": simulation_id},
            )
            return row is not None
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Postmortem methods
    # ------------------------------------------------------------------

    async def save_postmortem(self, simulation_id: str, postmortem_json: str) -> None:
        client = self._client_or_raise()
        now = self._now()
        pj = json.loads(postmortem_json) if isinstance(postmortem_json, str) else postmortem_json
        await client.postmortems.upsert(
            where={"simulation_id": simulation_id},
            data={
                "create": {
                    "simulation_id": simulation_id,
                    "postmortem_json": PrismaJson(pj),
                    "created_at": now,
                },
                "update": {
                    "postmortem_json": PrismaJson(pj),
                    "created_at": now,
                },
            },
        )

    async def get_postmortem(self, simulation_id: str) -> Optional[str]:
        client = self._client_or_raise()
        row = await client.postmortems.find_first(
            where={"simulation_id": simulation_id},
        )
        if row is None:
            return None
        val = row.postmortem_json
        if isinstance(val, str):
            val = json.loads(val)
        return json.dumps(val) if isinstance(val, (dict, list)) else str(val)

    # ------------------------------------------------------------------
    # New schema simulation methods (simulations + simulation_participants + turns)
    # ------------------------------------------------------------------

    async def create_new_simulation(self, simulation_id: str, config: dict) -> None:
        client = self._client_or_raise()
        now = self._now()
        subject = config.get("subject", {})
        # Upsert into simulations — ON CONFLICT (id) DO NOTHING via Prisma
        existing = await client.simulations.find_first(where={"id": simulation_id})
        if not existing:
            await client.simulations.create(data={
                "id": simulation_id,
                "subject_name": subject.get("name", ""),
                "subject_description": subject.get("description", ""),
                "status": "idle",
                "voltage": config.get("voltage", 50),
                "model_temperature": config.get("model_temperature", "volatile"),
                "speaker_mode": config.get("speaker_rules", {}).get("mode", "alternating"),
                "end_condition": PrismaJson(config.get("end_condition", {})),
                "config": PrismaJson(config),
                "metadata": PrismaJson({}),
                "created_at": now,
                "updated_at": now,
            })

        # Create participants with persona_id lookup
        for s in config.get("stakeholders", []):
            sname = s.get("name", "")
            pid_row = await client.personas.find_first(where={"name": sname})
            persona_uuid = pid_row.id if pid_row else None
            existing_p = await client.simulation_participants.find_first(
                where={"simulation_id": simulation_id, "name": sname},
            )
            if not existing_p:
                await client.simulation_participants.create(data={
                    "simulation_id": simulation_id,
                    "persona_id": persona_uuid,
                    "name": s.get("name", ""),
                    "role": s.get("role", ""),
                    "stance": s.get("stance", "neutral"),
                    "personality": PrismaJson(s.get("personality", {})),
                    "backstory": s.get("backstory", ""),
                    "hidden_agenda": s.get("hidden_agenda", ""),
                    "created_at": now,
                })

    async def get_participant_id(self, simulation_id: str, speaker_name: str) -> Optional[str]:
        client = self._client_or_raise()
        row = await client.simulation_participants.find_first(
            where={"simulation_id": simulation_id, "name": speaker_name},
        )
        return str(row.id) if row else None

    async def get_all_participant_map(self, simulation_id: str) -> dict[str, str]:
        client = self._client_or_raise()
        rows = await client.simulation_participants.find_many(
            where={"simulation_id": simulation_id},
        )
        return {r.name: str(r.id) for r in rows}

    async def insert_new_turn(
        self, simulation_id: str, participant_id: str, turn_index: int, turn_data: dict
    ) -> Optional[int]:
        client = self._client_or_raise()
        now = self._now()
        pti = await client.turns.count(
            where={"participant_id": participant_id},
        )
        content = turn_data.get("content", "")
        action_type = turn_data.get("action_type", "statement")
        stance = turn_data.get("stance")
        reasoning = turn_data.get("internal_reasoning", turn_data.get("reasoning", ""))
        emotional_state = _extract_emotion(content, action_type)
        row = await client.turns.create(data={
            "simulation_id": simulation_id,
            "participant_id": participant_id,
            "turn_index": turn_index,
            "participant_turn_index": pti,
            "content": content,
            "action_type": action_type,
            "stance": stance,
            "emotional_state": PrismaJson(emotional_state),
            "internal_reasoning": reasoning,
            "turn_data": PrismaJson(turn_data),
            "created_at": now,
        })
        return row.id

    async def update_simulation_status(self, simulation_id: str, status: str) -> None:
        client = self._client_or_raise()
        try:
            now = self._now()
            total = await client.turns.count(
                where={"simulation_id": simulation_id},
            )
            await client.simulations.update(
                where={"id": simulation_id},
                data={"status": status, "total_turns": total, "updated_at": now},
            )
        except Exception:
            pass

    async def update_participant_stats(self, simulation_id: str) -> None:
        client = self._client_or_raise()
        try:
            participants = await client.simulation_participants.find_many(
                where={"simulation_id": simulation_id},
            )
        except Exception:
            return
        for p in participants:
            turns = await client.turns.find_many(
                where={"participant_id": p.id},
                order={"turn_index": "asc"},
            )
            turn_count = len(turns)
            first_ti = turns[0].turn_index if turns else None
            last_ti = turns[-1].turn_index if turns else None
            try:
                await client.simulation_participants.update(
                    where={"id": p.id},
                    data={
                        "turn_count": turn_count,
                        "first_turn_index": first_ti,
                        "last_turn_index": last_ti,
                    },
                )
            except Exception:
                pass

    async def delete_new_simulation(self, simulation_id: str) -> None:
        client = self._client_or_raise()
        try:
            await client.simulations.delete(where={"id": simulation_id})
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Simulation config + complex queries
    # ------------------------------------------------------------------

    async def get_simulation_config(self, simulation_id: str) -> Optional[dict]:
        client = self._client_or_raise()
        if not self._is_valid_uuid(simulation_id):
            return None
        row = await client.simulations.find_first(
            where={"id": simulation_id},
        )
        if row is None:
            return None
        if row is None:
            return None
        cfg = row.config
        if isinstance(cfg, str):
            cfg = json.loads(cfg)
        return cfg

    async def get_turns_by_simulation(self, simulation_id: str) -> list[dict]:
        client = self._client_or_raise()
        try:
            rows = await client.turns.find_many(
                where={"simulation_id": simulation_id},
                order={"id": "asc"},
            )
        except Exception:
            return []
        except prisma.errors.DataError:
            return []
        # Build participant lookup
        participant_ids = {r.participant_id for r in rows}
        participants = {}
        for pid in participant_ids:
            p = await client.simulation_participants.find_first(where={"id": pid})
            if p:
                participants[pid] = p
        result = []
        for r in rows:
            speaker = participants.get(r.participant_id)
            es = r.emotional_state
            if isinstance(es, str):
                es = json.loads(es)
            result.append({
                "turn_index": r.turn_index,
                "content": r.content,
                "action_type": r.action_type,
                "stance": r.stance,
                "internal_reasoning": r.internal_reasoning,
                "emotional_state": es,
                "created_at": r.created_at,
                "speaker": speaker.name if speaker else "",
                "speaker_role": speaker.role if speaker else "",
            })
        return result

    async def list_simulations_v2(self) -> list[dict]:
        client = self._client_or_raise()
        rows = await client.simulations.find_many(
            order={"created_at": "desc"},
            take=100,
        )
        result = []
        for r in rows:
            result.append({
                "simulation_id": r.id,
                "subject": {
                    "name": r.subject_name,
                    "description": r.subject_description,
                },
                "status": r.status,
                "stakeholder_count": r.total_participants,
                "voltage": r.voltage,
                "model_temperature": r.model_temperature,
                "created_at": r.created_at,
            })
        return result

    # ------------------------------------------------------------------
    # Agent detail methods
    # ------------------------------------------------------------------

    async def get_agent_by_id(self, persona_id: str) -> Optional[dict]:
        client = self._client_or_raise()
        # personas.id is uuid — reject non-UUID lookups gracefully
        if not self._is_valid_uuid(persona_id):
            # Fallback: check stakeholders (text id)
            row = await client.stakeholders.find_first(where={"id": persona_id})
            if row is None:
                return None
            return {
                "id": row.id,
                "name": row.name,
                "role": row.role,
                "focus": row.focus,
                "backstory": row.backstory,
                "hidden_agenda": row.hidden_agenda,
                "personality": row.personality,
            }
        row = await client.personas.find_first(where={"id": persona_id})
        if row is None:
            return None
        return {
            "id": row.id,
            "slug": row.slug,
            "name": row.name,
            "role": row.role,
            "focus": row.focus,
            "backstory": row.backstory,
            "hidden_agenda": row.hidden_agenda,
            "tags": row.tags,
            "personality": row.personality,
            "metadata": row.metadata,
        }

    async def get_agent_by_name(self, name: str) -> Optional[dict]:
        client = self._client_or_raise()
        row = await client.personas.find_first(
            where={"OR": [{"slug": name}, {"name": name}]},
        )
        if row:
            return {
                "id": row.id,
                "slug": row.slug,
                "name": row.name,
                "role": row.role,
                "focus": row.focus,
                "backstory": row.backstory,
                "hidden_agenda": row.hidden_agenda,
                "tags": row.tags,
                "personality": row.personality,
                "metadata": row.metadata,
            }
        # Fallback: look up as simulation participant name
        prow = await client.simulation_participants.find_first(
            where={"name": name},
        )
        if prow:
            return {
                "id": prow.id,
                "name": prow.name,
                "role": prow.role,
                "stance": prow.stance,
                "backstory": prow.backstory,
                "hidden_agenda": prow.hidden_agenda,
                "personality": prow.personality,
            }
        # Fallback: look up as stakeholder (text id, not persona)
        srow = await client.stakeholders.find_first(
            where={"name": name},
        )
        if srow:
            return {
                "id": srow.id,
                "name": srow.name,
                "role": srow.role,
                "focus": srow.focus,
                "backstory": srow.backstory,
                "hidden_agenda": srow.hidden_agenda,
                "personality": srow.personality,
            }
        return None

    async def get_agent_simulations_by_id(self, persona_id: str) -> list[dict]:
        client = self._client_or_raise()
        try:
            rows = await client.simulation_participants.find_many(
                where={"persona_id": persona_id},
            )
        except Exception:
            return []
        result = []
        for sp in rows:
            sim = await client.simulations.find_first(where={"id": sp.simulation_id})
            if sim:
                result.append({
                    "id": sim.id,
                    "subject_name": sim.subject_name,
                    "status": sim.status,
                    "voltage": sim.voltage,
                    "total_turns": sim.total_turns,
                    "stance": sp.stance,
                    "role": sp.role,
                    "turn_count": sp.turn_count,
                    "first_turn_index": sp.first_turn_index,
                    "last_turn_index": sp.last_turn_index,
                    "created_at": sim.created_at,
                })
        return result

    async def get_agent_turns_by_id(self, persona_id: str, limit: int = 50) -> list[dict]:
        client = self._client_or_raise()
        # First get participant IDs for this persona
        try:
            participants = await client.simulation_participants.find_many(
                where={"persona_id": persona_id},
            )
        except Exception:
            return []
        pids = [p.id for p in participants]
        if not pids:
            return []
        rows = await client.turns.find_many(
            where={"participant_id": {"in": pids}},
            order={"created_at": "desc"},
            take=limit,
        )
        # Build simulation lookup
        sim_ids = {r.simulation_id for r in rows}
        sims = {}
        for sid in sim_ids:
            s = await client.simulations.find_first(where={"id": sid})
            if s:
                sims[sid] = s
        result = []
        for r in rows:
            es = r.emotional_state
            if isinstance(es, str):
                es = json.loads(es)
            sim = sims.get(r.simulation_id)
            result.append({
                "turn_index": r.turn_index,
                "participant_turn_index": r.participant_turn_index,
                "content": r.content,
                "action_type": r.action_type,
                "stance": r.stance,
                "emotional_state": es,
                "internal_reasoning": r.internal_reasoning,
                "created_at": r.created_at,
                "subject_name": sim.subject_name if sim else "",
            })
        return result

    # ------------------------------------------------------------------
    # Semantic memory
    # ------------------------------------------------------------------

    async def insert_semantic_memory(
        self, participant_id: str, simulation_id: str, memory_type: str, content: str,
    ) -> None:
        client = self._client_or_raise()
        now = self._now()
        try:
            await client.semantic_memories.create(data={
                "participant_id": participant_id,
                "simulation_id": simulation_id,
                "memory_type": memory_type,
                "content": content[:500],
                "created_at": now,
            })
        except Exception:
            pass  # ON CONFLICT DO NOTHING equivalent

    # ------------------------------------------------------------------
    # Analytics / Aggregates
    # ------------------------------------------------------------------

    async def get_all_turns_count(self, simulation_id: str | None = None) -> int:
        client = self._client_or_raise()
        where: dict[str, Any] = {}
        if simulation_id is not None:
            if not self._is_valid_uuid(simulation_id):
                return 0
            where["simulation_id"] = simulation_id
        return await client.turns.count(where=where or None)

    # ------------------------------------------------------------------
    # Stakeholders
    # ------------------------------------------------------------------

    async def create_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        client = self._client_or_raise()
        now = self._now()
        data = {
            "id": stakeholder.id,
            "name": stakeholder.name,
            "role": stakeholder.role,
            "focus": stakeholder.focus,
            "incentive_tuning": stakeholder.incentive_tuning,
            "hidden_agenda": stakeholder.hidden_agenda or "",
            "tag": stakeholder.tag,
            "tool_profile": stakeholder.tool_profile or "none",
            "backstory": stakeholder.backstory or "",
            "stance": stakeholder.stance or "neutral",
            "personality": PrismaJson(self._pydantic_to_json(stakeholder.personality)),
            "tools": PrismaJson(self._pydantic_to_json(stakeholder.tools)),
            "created_at": now,
            "updated_at": now,
        }
        await client.stakeholders.create(data=data)
        # Sync to personas table so agent lookups work
        # personas.id is auto-generated UUID, stakeholder id may not be UUID
        if self._is_valid_uuid(stakeholder.id):
            pid = stakeholder.id
        else:
            pid = str(uuid.uuid4())
        try:
            await client.personas.create(data={
                "id": pid,
                "slug": stakeholder.id,
                "name": stakeholder.name,
                "role": stakeholder.role or "",
                "focus": stakeholder.focus or "",
                "backstory": stakeholder.backstory or "",
                "hidden_agenda": stakeholder.hidden_agenda or "",
                "tags": [stakeholder.tag] if stakeholder.tag else [],
                "personality": PrismaJson(self._pydantic_to_json(stakeholder.personality)),
                "metadata": PrismaJson({}),
                "created_at": now,
                "updated_at": now,
            })
        except Exception:
            pass  # persona may already exist
        return stakeholder

    async def get_stakeholder(self, stakeholder_id: str) -> Optional[Stakeholder]:
        client = self._client_or_raise()
        row = await client.stakeholders.find_first(
            where={"id": stakeholder_id}
        )
        return self._row_to_stakeholder(row) if row else None

    async def update_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        client = self._client_or_raise()
        now = self._now()
        data = {
            "name": stakeholder.name,
            "role": stakeholder.role,
            "focus": stakeholder.focus,
            "incentive_tuning": stakeholder.incentive_tuning,
            "hidden_agenda": stakeholder.hidden_agenda or "",
            "tag": stakeholder.tag,
            "tool_profile": stakeholder.tool_profile or "none",
            "backstory": stakeholder.backstory or "",
            "stance": stakeholder.stance or "neutral",
            "personality": PrismaJson(self._pydantic_to_json(stakeholder.personality)),
            "tools": PrismaJson(self._pydantic_to_json(stakeholder.tools)),
            "updated_at": now,
        }
        await client.stakeholders.update(
            data=data,
            where={"id": stakeholder.id},
        )
        return stakeholder

    async def list_stakeholders(
        self,
        limit: int = 100,
        offset: int = 0,
        tag: Optional[str] = None,
    ) -> list[Stakeholder]:
        client = self._client_or_raise()
        where: dict[str, Any] = {}
        if tag is not None:
            where["tag"] = tag
        rows = await client.stakeholders.find_many(
            take=limit,
            skip=offset,
            where=where or None,
            order={"created_at": "desc"},
        )
        return [self._row_to_stakeholder(r) for r in rows]

    async def delete_stakeholder(self, stakeholder_id: str) -> bool:
        client = self._client_or_raise()
        row = await client.stakeholders.delete(
            where={"id": stakeholder_id},
        )
        return row is not None

    async def get_all_stakeholders(self) -> list[Stakeholder]:
        client = self._client_or_raise()
        rows = await client.stakeholders.find_many(
            order={"created_at": "desc"},
            take=1000,
        )
        return [self._row_to_stakeholder(r) for r in rows]

    async def stakeholder_exists(self, stakeholder_id: str) -> bool:
        client = self._client_or_raise()
        count = await client.stakeholders.count(
            where={"id": stakeholder_id},
        )
        return count > 0

    # ------------------------------------------------------------------
    # Scenario templates
    # ------------------------------------------------------------------

    async def create_template(self, template: ScenarioTemplate) -> ScenarioTemplate:
        client = self._client_or_raise()
        now = self._now()
        suggested_str = json.dumps(template.suggested_persona_ids)
        config = PrismaJson({
            "default_background": template.default_background,
            "default_primary_goal": template.default_primary_goal,
            "default_model_temperature": template.default_model_temperature,
            "suggested_persona_ids": template.suggested_persona_ids,
        })
        # Write to legacy table (scenario_templates has String for suggested_persona_ids)
        await client.scenario_templates.create(data={
            "id": template.id,
            "name": template.name,
            "description": template.description,
            "default_background": template.default_background,
            "default_primary_goal": template.default_primary_goal,
            "default_voltage": template.default_voltage,
            "default_model_temperature": template.default_model_temperature,
            "suggested_persona_ids": suggested_str,
            "created_at": now,
            "updated_at": now,
        })
        # Dual-write to new templates table (check existence → ON CONFLICT DO NOTHING equivalent)
        existing = await client.templates.find_first(where={"slug": template.id})
        if not existing:
            await client.templates.create(data={
                "slug": template.id,
                "name": template.name,
                "description": template.description,
                "category": "",
                "difficulty": "medium",
                "estimated_duration": "",
                "stakeholder_count": len(template.suggested_persona_ids),
                "voltage": template.default_voltage,
                "config": config,
                "created_at": now,
                "updated_at": now,
            })
        return template

    async def migrate_legacy_templates(self) -> int:
        client = self._client_or_raise()
        rows = await client.scenario_templates.find_many()
        migrated = 0
        for row in rows:
            existing = await client.templates.find_first(where={"slug": row.id})
            if existing:
                continue
            suggested = row.suggested_persona_ids
            if isinstance(suggested, str):
                parsed = json.loads(suggested) if suggested.strip() else []
            elif isinstance(suggested, list):
                parsed = suggested
            else:
                parsed = []
            config = PrismaJson({
                "default_background": row.default_background,
                "default_primary_goal": row.default_primary_goal,
                "default_model_temperature": row.default_model_temperature,
                "suggested_persona_ids": parsed,
            })
            await client.templates.create(data={
                "slug": row.id,
                "name": row.name,
                "description": row.description,
                "category": "",
                "difficulty": "medium",
                "estimated_duration": "",
                "stakeholder_count": len(parsed),
                "voltage": row.default_voltage,
                "config": config,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            })
            migrated += 1
        return migrated

    async def get_template(self, template_id: str) -> Optional[ScenarioTemplate]:
        client = self._client_or_raise()
        row = await client.scenario_templates.find_first(where={"id": template_id})
        return self._row_to_template(row) if row else None

    async def list_templates(self) -> list[ScenarioTemplate]:
        client = self._client_or_raise()
        rows = await client.scenario_templates.find_many(order={"name": "asc"})
        return [self._row_to_template(r) for r in rows]

    async def template_exists(self, template_id: str) -> bool:
        client = self._client_or_raise()
        count = await client.scenario_templates.count(where={"id": template_id})
        return count > 0

    async def _lookup_stakeholders(self, persona_ids: list[str]) -> list[dict]:
        client = self._client_or_raise()
        rows = []
        for pid in persona_ids:
            row = await client.stakeholders.find_first(where={"id": pid})
            if row:
                rows.append(row)
        return [
            {
                "id": r.id,
                "name": r.name,
                "role": r.role or "",
                "backstory": r.backstory or "",
                "stance": r.stance or "neutral",
                "personality": {
                    "aggressiveness": 50,
                    "empathy": 50,
                    "stubbornness": 50,
                    "verbosity": 50,
                },
                "hidden_agenda": r.hidden_agenda or "",
                "tools": [],
                "inject_knowledge": None,
            }
            for r in rows
        ]

    async def list_templates_catalog(self) -> list[dict]:
        client = self._client_or_raise()
        rows = await client.templates.find_many(order=[{"category": "asc"}, {"name": "asc"}])
        result = []
        for r in rows:
            cfg = r.config
            if isinstance(cfg, str):
                cfg = json.loads(cfg)
            if "default_background" in cfg:
                stakeholder_data = await self._lookup_stakeholders(cfg.get("suggested_persona_ids", []))
                cfg = {
                    "subject": {
                        "name": r.name,
                        "description": cfg.get("default_background", ""),
                        "attributes": {},
                        "evidence_items": [],
                        "stakes_description": cfg.get("default_primary_goal", ""),
                    },
                    "stakeholders": stakeholder_data,
                    "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
                    "speaker_rules": {"mode": "weighed_random"},
                    "end_condition": {"type": "timeout", "max_normal_turns": 20},
                    "voltage": r.voltage,
                    "model_temperature": cfg.get("default_model_temperature", "volatile"),
                    "player_mode": False,
                    "env_flags": {"hidden_motives": True, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
                    "auto_research": True,
                    "research_topics": [],
                    "inject_knowledge": True,
                    "system_prompt_template": "",
                }
            d = {
                "slug": r.slug,
                "name": r.name,
                "description": r.description,
                "category": r.category,
                "difficulty": r.difficulty,
                "estimated_duration": r.estimated_duration,
                "stakeholder_count": r.stakeholder_count,
                "voltage": r.voltage,
                "config": cfg,
            }
            result.append(d)
        return result

    async def get_template_catalog(self, slug: str) -> Optional[dict]:
        client = self._client_or_raise()
        row = await client.templates.find_first(where={"slug": slug})
        if not row:
            return None
        cfg = row.config
        if isinstance(cfg, str):
            cfg = json.loads(cfg)
        if "default_background" in cfg:
            stakeholder_data = await self._lookup_stakeholders(cfg.get("suggested_persona_ids", []))
            cfg = {
                "subject": {
                    "name": row.name,
                    "description": cfg.get("default_background", ""),
                    "attributes": {},
                    "evidence_items": [],
                    "stakes_description": cfg.get("default_primary_goal", ""),
                },
                "stakeholders": stakeholder_data,
                "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
                "speaker_rules": {"mode": "weighed_random"},
                "end_condition": {"type": "timeout", "max_normal_turns": 20},
                "voltage": row.voltage,
                "model_temperature": cfg.get("default_model_temperature", "volatile"),
                "player_mode": False,
                "env_flags": {"hidden_motives": True, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
                "auto_research": True,
                "research_topics": [],
                "inject_knowledge": True,
                "system_prompt_template": "",
            }
        return {
            "slug": row.slug,
            "name": row.name,
            "description": row.description,
            "category": row.category,
            "difficulty": row.difficulty,
            "estimated_duration": row.estimated_duration,
            "stakeholder_count": row.stakeholder_count,
            "voltage": row.voltage,
            "config": cfg,
        }

    # ------------------------------------------------------------------
    # State Snapshots
    # ------------------------------------------------------------------

    async def create_state_snapshot(
        self, simulation_id: str, turn_index: int, snapshot_json: str, version: int = 1
    ) -> str:
        client = self._client_or_raise()
        sj = json.loads(snapshot_json) if isinstance(snapshot_json, str) else snapshot_json
        # Upsert: replace any existing snapshot for the same turn
        existing = await client.state_snapshots.find_first(
            where={"simulation_id": simulation_id, "turn_index": turn_index},
        )
        if existing:
            await client.state_snapshots.update(
                where={"id": existing.id},
                data={"snapshot_json": PrismaJson(sj), "version": version},
            )
            return existing.id
        snapshot_id = str(uuid.uuid4())
        now = self._now()
        await client.state_snapshots.create(data={
            "id": snapshot_id,
            "simulation_id": simulation_id,
            "turn_index": turn_index,
            "snapshot_json": PrismaJson(sj),
            "version": version,
            "created_at": now,
        })
        return snapshot_id

    async def get_state_snapshots_by_simulation(self, simulation_id: str) -> list[dict]:
        client = self._client_or_raise()
        rows = await client.state_snapshots.find_many(
            where={"simulation_id": simulation_id},
            order={"turn_index": "asc", "created_at": "asc"},
        )
        seen: set[int] = set()
        result = []
        for r in rows:
            if r.turn_index in seen:
                continue
            seen.add(r.turn_index)
            sj = r.snapshot_json
            if isinstance(sj, str):
                sj = json.loads(sj)
            result.append({
                "id": r.id,
                "simulation_id": r.simulation_id,
                "turn_index": r.turn_index,
                "snapshot_json": sj,
                "version": r.version,
                "created_at": r.created_at,
            })
        return result

    async def get_latest_state_snapshot(self, simulation_id: str) -> Optional[dict]:
        client = self._client_or_raise()
        row = await client.state_snapshots.find_first(
            where={"simulation_id": simulation_id},
            order={"turn_index": "desc"},
        )
        if row is None:
            return None
        sj = row.snapshot_json
        if isinstance(sj, str):
            sj = json.loads(sj)
        return {
            "id": row.id,
            "simulation_id": row.simulation_id,
            "turn_index": row.turn_index,
            "snapshot_json": sj,
            "version": row.version,
            "created_at": row.created_at,
        }

    async def delete_old_state_snapshots(self, simulation_id: str, max_keep: int = 50) -> None:
        client = self._client_or_raise()
        # Get IDs to keep (latest max_keep by turn_index DESC)
        keep = await client.state_snapshots.find_many(
            where={"simulation_id": simulation_id},
            order={"turn_index": "desc"},
            take=max_keep,
        )
        keep_ids = [k.id for k in keep]
        if keep_ids:
            await client.state_snapshots.delete_many(
                where={
                    "simulation_id": simulation_id,
                    "id": {"not_in": keep_ids},
                },
            )
        else:
            await client.state_snapshots.delete_many(
                where={"simulation_id": simulation_id},
            )

    # ------------------------------------------------------------------
    # Document uploads
    # ------------------------------------------------------------------

    async def create_document(self, doc: SimulationDocument) -> None:
        client = self._client_or_raise()
        now = self._now()
        await client.document_uploads.create(data={
            "id": doc.id,
            "simulation_id": doc.simulation_id,
            "filename": doc.filename,
            "content_type": doc.content_type,
            "file_size": doc.size_bytes,
            "status": doc.status,
            "extracted_text": doc.extracted_text,
            "created_at": now,
            "updated_at": now,
        })

    async def get_documents_by_simulation(self, simulation_id: str) -> list[SimulationDocument]:
        client = self._client_or_raise()
        rows = await client.document_uploads.find_many(
            where={"simulation_id": simulation_id},
            order={"created_at": "asc"},
        )
        return [self._row_to_document(r) for r in rows]

    async def get_document(self, document_id: str) -> Optional[SimulationDocument]:
        client = self._client_or_raise()
        row = await client.document_uploads.find_first(where={"id": document_id})
        return self._row_to_document(row) if row else None

    async def update_document_status(
        self, document_id: str, status: str, extracted_text: str | None = None
    ) -> None:
        client = self._client_or_raise()
        now = self._now()
        data: dict[str, Any] = {"status": status, "updated_at": now}
        if extracted_text is not None:
            data["extracted_text"] = extracted_text
        await client.document_uploads.update(data=data, where={"id": document_id})

    async def delete_documents_by_simulation(self, simulation_id: str) -> None:
        client = self._client_or_raise()
        await client.document_uploads.delete_many(where={"simulation_id": simulation_id})

    # ------------------------------------------------------------------
    # Persona Growth System
    # ------------------------------------------------------------------

    async def list_personas_v2(self) -> list[dict]:
        client = self._client_or_raise()
        rows = await client.stakeholders.find_many(
            order={"created_at": "desc"},
            take=1000,
        )
        # Fetch persona stats (sim_count, total_turns) for each stakeholder
        persona_rows = await client.personas.find_many(take=1000)
        persona_by_name: dict[str, str] = {p.name: p.id for p in persona_rows if p.name}
        persona_ids = list(persona_by_name.values())
        participants = await client.simulation_participants.find_many(
            where={"persona_id": {"in": persona_ids}},
            take=10000,
        )
        stats_by_pid: dict[str, dict] = {}
        for p in participants:
            pid = p.persona_id
            if pid not in stats_by_pid:
                stats_by_pid[pid] = {"sim_count": 0, "total_turns": 0}
            stats_by_pid[pid]["sim_count"] += 1
            stats_by_pid[pid]["total_turns"] += p.turn_count or 0

        result = []
        for r in rows:
            d = self._row_to_persona_detail(r)
            pid = persona_by_name.get(r.name)
            if pid and pid in stats_by_pid:
                d["sim_count"] = stats_by_pid[pid]["sim_count"]
                d["total_turns"] = stats_by_pid[pid]["total_turns"]
            else:
                d["sim_count"] = 0
                d["total_turns"] = 0
            result.append(d)
        return result

    async def get_persona_detail(self, persona_id: str) -> dict | None:
        client = self._client_or_raise()
        row = await client.stakeholders.find_first(
            where={"id": persona_id},
        )
        if row:
            return self._row_to_persona_detail(row)
        p = await client.personas.find_first(where={"id": persona_id})
        if p:
            row = await client.stakeholders.find_first(where={"name": p.name})
            if row:
                return self._row_to_persona_detail(row)
        row = await client.stakeholders.find_first(where={"name": persona_id})
        if row:
            return self._row_to_persona_detail(row)
        return None

    async def list_personas(self) -> list[dict]:
        """List all personas from the stakeholders table (hasattr-discovered by main.py)."""
        client = self._client_or_raise()
        rows = await client.stakeholders.find_many(
            order={"created_at": "desc"},
            take=1000,
        )
        return [self._row_to_persona_detail(r) for r in rows]

    # --- Persona documents ---

    async def create_persona_document(self, doc: PersonaDocument) -> PersonaDocument:
        client = self._client_or_raise()
        now = self._now()
        await client.persona_documents.create(data={
            "id": doc.id,
            "persona_id": doc.persona_id,
            "filename": doc.filename,
            "filepath": doc.filepath,
            "content_type": doc.content_type,
            "size_bytes": doc.size_bytes,
            "status": doc.status,
            "extracted_text": doc.extracted_text,
            "embedding_id": doc.embedding_id,
            "created_at": now,
        })
        return doc

    async def get_persona_documents(self, persona_id: str) -> list[PersonaDocument]:
        client = self._client_or_raise()
        rows = await client.persona_documents.find_many(
            where={"persona_id": persona_id},
            order={"created_at": "asc"},
        )
        return [
            PersonaDocument(
                id=r.id,
                persona_id=r.persona_id,
                filename=r.filename,
                filepath=r.filepath,
                content_type=r.content_type,
                size_bytes=r.size_bytes,
                status=r.status,
                extracted_text=r.extracted_text,
                embedding_id=r.embedding_id,
                created_at=str(r.created_at) if r.created_at else "",
            )
            for r in rows
        ]

    async def delete_persona_document(self, document_id: str) -> bool:
        client = self._client_or_raise()
        try:
            row = await client.persona_documents.delete(where={"id": document_id})
            return row is not None
        except Exception:
            return False

    # --- Persona evolution ---

    @staticmethod
    def _row_to_persona_evolution(row) -> PersonaEvolution:
        proposed = row.proposed_deltas or {}
        if isinstance(proposed, str):
            proposed = json.loads(proposed)
        before = row.before_snapshot or {}
        if isinstance(before, str):
            before = json.loads(before)
        return PersonaEvolution(
            id=row.id,
            persona_id=row.persona_id,
            simulation_id=row.simulation_id or "",
            proposed_deltas=json.dumps(proposed, separators=(",", ":")),
            before_snapshot=json.dumps(before, separators=(",", ":")),
            status=row.status or "pending",
            applied_at=str(row.applied_at) if row.applied_at else None,
            created_at=str(row.created_at) if row.created_at else "",
        )

    async def create_persona_evolution(self, evolution: PersonaEvolution) -> PersonaEvolution:
        client = self._client_or_raise()
        now = self._now()
        await client.persona_evolution.create(data={
            "id": evolution.id,
            "persona_id": evolution.persona_id,
            "simulation_id": evolution.simulation_id,
            "proposed_deltas": PrismaJson(self._pydantic_to_json(evolution.proposed_deltas)),
            "before_snapshot": PrismaJson(self._pydantic_to_json(evolution.before_snapshot)),
            "status": evolution.status,
            "applied_at": evolution.applied_at,
            "created_at": now,
        })
        return evolution

    async def get_evolution(self, evolution_id: str) -> Optional[PersonaEvolution]:
        client = self._client_or_raise()
        row = await client.persona_evolution.find_first(where={"id": evolution_id})
        return self._row_to_persona_evolution(row) if row else None

    async def get_pending_evolutions(self, persona_id: str) -> list[PersonaEvolution]:
        client = self._client_or_raise()
        rows = await client.persona_evolution.find_many(
            where={"persona_id": persona_id, "status": "pending"},
            order={"created_at": "desc"},
        )
        return [self._row_to_persona_evolution(r) for r in rows]

    async def approve_evolution(self, evolution_id: str) -> bool:
        client = self._client_or_raise()
        now = self._now()
        try:
            row = await client.persona_evolution.update(
                where={"id": evolution_id, "status": "pending"},
                data={"status": "approved", "applied_at": now},
            )
            return row is not None
        except Exception:
            return False

    async def reject_evolution(self, evolution_id: str) -> bool:
        client = self._client_or_raise()
        try:
            row = await client.persona_evolution.update(
                where={"id": evolution_id, "status": "pending"},
                data={"status": "rejected"},
            )
            return row is not None
        except Exception:
            return False

    async def get_evolution_history(self, persona_id: str) -> list[PersonaEvolution]:
        client = self._client_or_raise()
        rows = await client.persona_evolution.find_many(
            where={"persona_id": persona_id},
            order={"created_at": "desc"},
        )
        return [self._row_to_persona_evolution(r) for r in rows]

    async def update_persona(self, persona_id: str, personality: str, stance: str | None = None) -> bool:
        client = self._client_or_raise()
        now = self._now()
        data: dict[str, Any] = {"updated_at": now}
        pj = json.loads(personality) if isinstance(personality, str) else personality
        data["personality"] = PrismaJson(pj)
        if stance is not None:
            data["stance"] = stance
        try:
            row = await client.stakeholders.update(
                where={"id": persona_id},
                data=data,
            )
            return row is not None
        except Exception:
            return False

    # --- Persona research ---

    async def create_persona_research(self, research: PersonaResearch) -> PersonaResearch:
        client = self._client_or_raise()
        now = self._now()
        await client.persona_research.create(data={
            "id": research.id,
            "persona_id": research.persona_id,
            "query": research.query,
            "results": PrismaJson(self._pydantic_to_json(research.results)),
            "created_at": now,
        })
        return research

    async def get_persona_research(self, persona_id: str) -> list[PersonaResearch]:
        client = self._client_or_raise()
        rows = await client.persona_research.find_many(
            where={"persona_id": persona_id},
            order={"created_at": "desc"},
        )
        return [
            PersonaResearch(
                id=r.id,
                persona_id=r.persona_id,
                query=r.query,
                results=json.dumps(r.results, separators=(",", ":")) if isinstance(r.results, (dict, list)) else r.results,
                created_at=str(r.created_at) if r.created_at else "",
            )
            for r in rows
        ]

    async def update_persona_research(self, research_id: str, results: str) -> bool:
        client = self._client_or_raise()
        rj = json.loads(results) if isinstance(results, str) else results
        try:
            row = await client.persona_research.update(
                where={"id": research_id},
                data={"results": PrismaJson(rj)},
            )
            return row is not None
        except Exception:
            return False


# ------------------------------------------------------------------
# Standalone functions (imported directly by main.py)
# ------------------------------------------------------------------


async def get_agent_memories_by_id(db, persona_id: str) -> list[dict]:
    """Get semantic memories for a participant by persona UUID.
    Standalone function — imported directly by main.py, NOT a DatabaseBackend method."""
    if not hasattr(db, "_client_or_raise"):
        return []
    try:
        client = db._client_or_raise()
        rows = await client.semantic_memories.find_many(
            where={"participant_id": persona_id},
            order={"created_at": "desc"},
        )
        return [
            {
                "id": r.id,
                "participant_id": r.participant_id,
                "simulation_id": r.simulation_id,
                "memory_type": r.memory_type,
                "content": r.content,
                "turn_id": r.turn_id,
                "is_active": r.is_active,
                "confidence": r.confidence,
                "created_at": str(r.created_at) if r.created_at else "",
            }
            for r in rows
        ]
    except Exception:
        return []
