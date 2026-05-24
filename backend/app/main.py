from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
import importlib.util as _iu
from pathlib import Path as _P
_be_spec = _iu.spec_from_file_location("_be_main",
        _P(__file__).resolve().parent / "runtime" / "behavior_engine.py")
_be_mod = _iu.module_from_spec(_be_spec)
_be_spec.loader.exec_module(_be_mod)
create_engine = _be_mod.make_engine

from . import config
from .database import initialize_database, close_database, get_database
from .models import (
    AlignmentDelta,
    PersonalityProfile,
    Postmortem,
    ScenarioTemplate,
    SimulationV2Config,
    Stakeholder,
    StakeholderV2,
    StrategyCard,
    TopologyNode,
)
from .runtime import run_simulation_v2

from .llm import openrouter_completion, parse_json_object

from .graph import driver as graph_driver
from .graph.schema import init_schema
from .runtime import StructuredFormatter

LOG_LEVEL = os.getenv("BACKEND_LOG_LEVEL", "INFO").upper()
_handler = logging.StreamHandler()
_handler.setFormatter(
    StructuredFormatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
)
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    handlers=[_handler],
)
logger = logging.getLogger("boardroom.api")

app = FastAPI(title="Boardroom Simulator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid4()))
    started = time.perf_counter()
    client_host = request.client.host if request.client else "unknown"
    logger.info(
        "REQ id=%s method=%s path=%s query=%s client=%s",
        request_id,
        request.method,
        request.url.path,
        request.url.query,
        client_host,
    )
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.exception(
            "REQ_ERR id=%s method=%s path=%s elapsed_ms=%.2f",
            request_id,
            request.method,
            request.url.path,
            elapsed_ms,
        )
        raise

    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "RES id=%s method=%s path=%s status=%s elapsed_ms=%.2f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


async def _load_seeds() -> None:
    """Load seed data from JSON files into the database on first run."""
    db = get_database()
    seeds_dir = _P(__file__).resolve().parent.parent / "seeds"

    # Seed stakeholders/personas
    personas_path = seeds_dir / "personas" / "all.json"
    if personas_path.exists():
        with open(personas_path) as f:
            personas = json.load(f)
        for p in personas:
            if not await db.stakeholder_exists(p["id"]):
                try:
                    await db.create_stakeholder(Stakeholder(
                        id=p["id"],
                        name=p["name"],
                        role=p["role"],
                        focus=p["focus"],
                        incentive_tuning=p.get("incentive_tuning", 50),
                        hidden_agenda=p.get("hidden_agenda", ""),
                        tag=p.get("tag"),
                    ))
                except Exception as exc:
                    logger.warning("SEED_PERSONA_ERR %s: %s", p["id"], exc)
        logger.info("SEED loaded %d personas from %s", len(personas), personas_path)

    # Seed templates
    templates_path = seeds_dir / "templates" / "all.json"
    if templates_path.exists():
        with open(templates_path) as f:
            templates = json.load(f)
        for t in templates:
            if not await db.template_exists(t["id"]):
                try:
                    await db.create_template(ScenarioTemplate(
                        id=t["id"],
                        name=t["name"],
                        description=t["description"],
                        default_background=t.get("default_background", ""),
                        default_primary_goal=t.get("default_primary_goal", ""),
                        default_voltage=t.get("default_voltage", 50),
                        default_model_temperature=t.get("default_model_temperature", "stable"),
                        suggested_persona_ids=t.get("suggested_persona_ids", []),
                    ))
                except Exception as exc:
                    logger.warning("SEED_TEMPLATE_ERR %s: %s", t["id"], exc)
        logger.info("SEED loaded %d templates from %s", len(templates), templates_path)


@app.on_event("startup")
async def startup_event() -> None:
    await initialize_database()
    await _load_seeds()
    if graph_driver.neo4j_enabled():
        driver = graph_driver.get_driver()
        if driver is not None:
            init_schema(driver)

            print("✓ Neo4j connected and schema initialised.")
        else:
            print("⚠ NEO4J_URI set but connection failed — graph analytics disabled.")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await close_database()
    graph_driver.close_driver()


class RunRequest(BaseModel):
    max_turns: int | None = Field(default=None, gt=0)


class HumanTurnRequest(BaseModel):
    stakeholder_id: str
    content: str = Field(..., min_length=1)
    action_type: str = "statement"
    directed_at: str | None = None
    coalition_with: str | None = None

class ResumeRequest(BaseModel):
    pass  # no payload needed


async def _get_state_or_404(simulation_id: str) -> SimulationState:
    state = await store.get(simulation_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return state


def _transcript(state: SimulationState, max_turns: int = 30) -> str:
    turns = state.turns[-max_turns:] if len(state.turns) > max_turns else state.turns
    return "\n".join(
        f"{turn.turn_index}. {turn.stakeholder_name} ({turn.role}): {turn.content}"
        for turn in turns
    )


# (mock postmortem functions removed — replaced by PostmortemGenerator)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, str | bool]:
    return {"status": "ok", "v2": True}


# ── Stakeholders (DB-backed) ─────────────────────────────────────────────

@app.get("/stakeholders")
async def list_stakeholders_api() -> list[dict]:
    db = get_database()
    try:
        if hasattr(db, 'list_personas'):
            return await db.list_personas()
        return [s.model_dump() for s in await db.list_stakeholders(limit=500)]
    except Exception:
        return []

@app.post("/stakeholders", status_code=201)
async def create_stakeholder_api(payload: Stakeholder) -> dict:
    db = get_database()
    sid = str(uuid4())
    s = payload.model_copy(update={"id": sid})
    await db.create_stakeholder(s)
    return s.model_dump()

@app.put("/stakeholders/{stakeholder_id}")
async def update_stakeholder_api(stakeholder_id: str, payload: Stakeholder) -> dict:
    db = get_database()
    existing = await db.get_stakeholder(stakeholder_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Stakeholder not found")
    s = payload.model_copy(update={"id": stakeholder_id})
    await db.update_stakeholder(s)
    return s.model_dump()

@app.delete("/stakeholders/{stakeholder_id}", status_code=204)
async def delete_stakeholder_api(stakeholder_id: str) -> Response:
    db = get_database()
    deleted = await db.delete_stakeholder(stakeholder_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Stakeholder not found")
    return Response(status_code=204)


# ── Templates (DB-backed) ─────────────────────────────────────────────

@app.get("/templates")
async def list_templates_api() -> list[dict]:
    db = get_database()
    try:
        if hasattr(db, 'list_templates_v2'):
            return await db.list_templates_v2()
        return [t.model_dump() for t in await db.list_templates()]
    except Exception:
        return []

@app.get("/templates/{template_id}")
async def get_template_api(template_id: str) -> dict:
    db = get_database()
    if hasattr(db, 'get_template_v2'):
        t = await db.get_template_v2(template_id)
        if t is not None:
            return t
    t = await db.get_template(template_id)
    if t is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return t.model_dump()

@app.post("/templates", status_code=201)
async def create_template_api(payload: ScenarioTemplate) -> dict:
    db = get_database()
    await db.create_template(payload)
    return payload.model_dump()

@app.delete("/templates/{template_id}", status_code=204)
async def delete_template_api(template_id: str) -> Response:
    db = get_database()
    if not await db.template_exists(template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    # Soft-delete by not exposing template; no explicit delete method exists
    raise HTTPException(status_code=501, detail="Template deletion not implemented")

# ── v2 Agentic Simulation endpoints ─────────────────────────────────────────

from .database import get_database

# Active streams — in-memory tracking for live SSE sessions
_v2_simulations: dict[str, dict] = {}

def _extract_memory_type(content: str, action_type: str) -> str | None:
    """Extract memory type from a negotiation turn.

    Strong signals first, then falls back to 'position' for any substantive turn.
    This ensures every meaningful statement produces a memory entry.
    """
    import re
    text = content.lower()

    # Explicit compromises are always concessions
    if action_type == "compromise":
        return "concession"

    # Red-line signals (strong refusal / ultimatum)
    if re.search(
        r'\b(never|cannot|red line|under no circumstances|will not|won\'t|refuse|'
        r'unacceptable|dealbreaker|non.negotiable|must not|shall not|cannot accept|'
        r'out of the question|no way|absolutely not)\b',
        text,
    ):
        return "red_line"

    # Concession signals (yielding or acknowledging the other side)
    if re.search(
        r'\b(concede|concession|willing to|open to|flexible on|'
        r'understand your|see your point|valid point|you raise a good|'
        r'I agree|I accept|acknowledge|fair point|reasonable)\b',
        text,
    ):
        return "concession"

    # Position signals — broadened significantly
    if re.search(
        r'\b(believe|think|position|stance|support|oppose|agree|disagree|'
        r'argue|claim|maintain|assert|contend|view|opinion|perspective|'
        r'must|should|need to|essential|crucial|important|critical|'
        r'cannot ignore|cannot overlook|we must|we need to)\b',
        text,
    ):
        return "position"

    # Statement/challenge/escalate/question turns almost always express a position
    if action_type in ("statement", "challenge", "escalate", "question", "coalition_signal"):
        return "position"

    return None

def _extract_turn_index(event: dict) -> int:
    """Extract the correct turn index from a V2 stream event.
    The engine sometimes uses _index for the actual turn counter.
    """
    idx = event.get("turn_index", event.get("_index"))
    if idx is None:
        return 0
    return int(idx)

async def _save_turn(simulation_id: str, turn_index: int, turn_json: str) -> None:
    """Save turn to new schema tables only. Old v2_turns is deprecated."""
    db = get_database()
    try:
        if hasattr(db, 'get_participant_id') and hasattr(db, 'insert_new_turn'):
            event = json.loads(turn_json) if isinstance(turn_json, str) else turn_json
            speaker = event.get("speaker", event.get("agent_name", ""))
            if speaker:
                pid = await db.get_participant_id(simulation_id, speaker)
                if pid:
                    tid = await db.insert_new_turn(simulation_id, pid, turn_index, event)
                    if tid:
                        mtype = _extract_memory_type(event.get("content", ""), event.get("action_type", ""))
                        if mtype and hasattr(db, 'insert_semantic_memory'):
                            await db.insert_semantic_memory(pid, simulation_id, mtype, event.get("content", "")[:500])
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("V2_TURN_SAVE_ERR %s: %s", simulation_id, exc)


async def _save_state_snapshot(simulation_id: str, turn_index: int, snapshot_json: str) -> None:
    """Persist state snapshot to DB. Fire-and-forget — does not block simulation."""
    db = get_database()
    try:
        if hasattr(db, 'create_state_snapshot'):
            await db.create_state_snapshot(simulation_id, turn_index, snapshot_json, version=1)
            if hasattr(db, 'delete_old_state_snapshots'):
                await db.delete_old_state_snapshots(simulation_id, max_keep=50)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("V2_SNAPSHOT_SAVE_ERR %s: %s", simulation_id, exc)


@app.get("/simulations")
async def list_simulations_v2() -> list[dict]:
    # List from new schema, unioned with in-memory active streams
    db = get_database()
    now_iso = datetime.now(timezone.utc).isoformat()
    active = [
        {"simulation_id": sid, "subject": entry["config"].get("subject", {}), "status": entry["status"],
         "stakeholder_count": len(entry["config"].get("stakeholders", [])), "voltage": entry["config"].get("voltage", 50),
         "model_temperature": entry["config"].get("model_temperature", "stable"),
         "created_at": now_iso}
        for sid, entry in _v2_simulations.items()
    ]
    try:
        if hasattr(db, 'list_simulations_v2'):
            db_sims = await db.list_simulations_v2()
            # Merge: DB sims + active (active overrides with latest status)
            seen = {s["simulation_id"] for s in active}
            for s in db_sims:
                if s["simulation_id"] not in seen:
                    active.append(s)
    except Exception:
        pass
    return active


@app.post("/simulations")
async def create_simulation_v2(payload: SimulationV2Config) -> dict:
    simulation_id = str(uuid4())
    config_json = payload.model_dump(mode="json")
    _v2_simulations[simulation_id] = {"config": config_json, "status": "idle"}
    logger.info(
        "V2_SIM_CREATE simulation_id=%s stakeholders=%d subject=%s",
        simulation_id,
        len(payload.stakeholders),
        payload.subject.name,
    )
    # Write to new schema only
    try:
        db = get_database()
        if hasattr(db, 'create_new_simulation'):
            await db.create_new_simulation(simulation_id, config_json)
    except Exception as exc:
        logger.warning("V2_NEW_SCHEMA_SAVE_ERR %s: %s", simulation_id, exc)
    return {
        "simulation_id": simulation_id,
        "config": config_json,
        "status": "idle",
    }


@app.get("/simulations/{simulation_id}/stream")
async def stream_simulation_v2(simulation_id: str) -> StreamingResponse:
    entry = _v2_simulations.get(simulation_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Simulation not found")

    already_complete = entry["status"] == "complete"
    config = SimulationV2Config(**entry["config"])

    if not already_complete:
        entry["status"] = "running"

    async def event_stream():
        try:
            if already_complete:
                db = get_database()
                try:
                    if hasattr(db, 'get_turns_by_simulation'):
                        turns = await db.get_turns_by_simulation(simulation_id)
                    else:
                        turns = []
                except Exception:
                    turns = []
                for turn in turns:
                    yield f"data: {json.dumps(turn)}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'total_turns': len(turns)})}\n\n"
                return

            # Create BehaviorEngine for this simulation
            _be = create_engine([s.id for s in config.stakeholders])
            async for event in run_simulation_v2(config, simulation_id, behavior_engine=_be):
                if event.get("type") == "done":
                    # Must yield done AFTER status updates — generator may be cancelled post-yield
                    entry["status"] = "complete"
                    try:
                        _db = get_database()
                        if hasattr(_db, 'update_simulation_status_v2'):
                            await _db.update_simulation_status_v2(simulation_id, "complete")
                        if hasattr(_db, 'update_participant_stats'):
                            await _db.update_participant_stats(simulation_id)
                    except Exception as exc:
                        logger.warning("V2_NEW_STATUS_ERR %s: %s", simulation_id, exc)
                    yield f"data: {json.dumps(event)}\n\n"
                    return
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") == "turn":
                    turn_idx = _extract_turn_index(event)
                    if event.get("_index") is not None:
                        event["turn_index"] = event["_index"]
                    await _save_turn(simulation_id, turn_idx, json.dumps(event))
                    if _be is not None:
                        try:
                            public_state = _be.get_public_state()
                            await _save_state_snapshot(simulation_id, turn_idx, json.dumps(public_state))
                        except Exception as exc:
                            logger.warning("V2_SNAPSHOT_CAPTURE_ERR %s: %s", simulation_id, exc)
        except asyncio.CancelledError:
            yield f"data: {json.dumps({'type': 'cancelled'})}\n\n"
        except Exception as exc:
            logger.exception("V2_SIM_STREAM_ERR simulation_id=%s", simulation_id)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/simulations/{simulation_id}")
async def get_simulation_v2(simulation_id: str) -> dict:
    entry = _v2_simulations.get(simulation_id)
    if entry is not None:
        return {"config": entry["config"], "status": entry["status"]}
    db = get_database()
    try:
        if hasattr(db, 'get_simulation_config'):
            cfg = await db.get_simulation_config(simulation_id)
            if cfg:
                return {"config": cfg, "status": "complete"}
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="Simulation not found")


@app.get("/simulations/{simulation_id}/replay")
async def replay_simulation_v2(simulation_id: str) -> dict:
    """Return all persisted state snapshots for a simulation, ordered by turn."""
    db = get_database()
    try:
        if hasattr(db, 'get_state_snapshots_by_simulation'):
            snapshots = await db.get_state_snapshots_by_simulation(simulation_id)
        else:
            snapshots = []
    except Exception:
        snapshots = []

    entry = _v2_simulations.get(simulation_id)
    total_turns = 0
    if entry:
        total_turns = entry.get("config", {}).get("turns_count", 0)

    parsed = []
    for s in snapshots:
        import json
        data = json.loads(s["snapshot_json"]) if isinstance(s["snapshot_json"], str) else s["snapshot_json"]
        parsed.append({
            "turn_index": s["turn_index"],
            "snapshot_version": s.get("version", 1),
            "data": data,
        })

    return {
        "simulation_id": simulation_id,
        "total_snapshots": len(parsed),
        "total_turns": total_turns,
        "last_snapshot_turn": max((s["turn_index"] for s in parsed), default=-1),
        "snapshots": parsed,
    }


@app.get("/simulations/{simulation_id}/export")
async def export_simulation_v2(simulation_id: str) -> Response:
    """Export complete simulation data as JSON download."""
    entry = _v2_simulations.get(simulation_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Simulation not found")

    cfg = entry["config"]
    db = get_database()

    turns = []
    try:
        if hasattr(db, 'get_turns_by_simulation'):
            turns = await db.get_turns_by_simulation(simulation_id)
    except Exception:
        pass

    snapshots = []
    try:
        if hasattr(db, 'get_state_snapshots_by_simulation'):
            raw = await db.get_state_snapshots_by_simulation(simulation_id)
            for s in raw:
                data = json.loads(s["snapshot_json"]) if isinstance(s["snapshot_json"], str) else s["snapshot_json"]
                snapshots.append({"turn_index": s["turn_index"], "snapshot_version": s.get("version", 1), "data": data})
    except Exception:
        pass

    export = {
        "simulation_id": simulation_id,
        "config": cfg,
        "turns": turns,
        "state_snapshots": snapshots,
        "summary": {
            "total_turns": len(turns),
            "total_snapshots": len(snapshots),
            "stakeholder_count": len(cfg.get("stakeholders", [])),
            "voltage": cfg.get("voltage", 50),
            "status": entry["status"],
        },
        "metadata": {
            "exported_at": __import__("datetime").datetime.utcnow().isoformat(),
            "snapshot_version": 1,
        },
    }

    return Response(
        content=json.dumps(export, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="simulation-{simulation_id}.json"'},
    )


@app.post("/simulations/{simulation_id}/postmortem")
async def postmortem_v2(simulation_id: str) -> dict:
    """Get the comprehensive simulation postmortem report.

    Auto-generated on simulation end. Includes:
    - Executive summary with verdict
    - Termination details (vote breakdown, judge notes, etc.)
    - Topics discussed with positions
    - Stakeholder reports with position shifts
    - Key moments timeline
    - Social dynamics (trust/tension arcs)
    - Strategy cards and lessons learned
    """
    entry = _v2_simulations.get(simulation_id)
    if entry is None:
        db = get_database()
        try:
            if hasattr(db, 'get_simulation_config'):
                cfg = await db.get_simulation_config(simulation_id)
                if cfg:
                    entry = {"config": cfg, "status": "complete"}
                else:
                    raise HTTPException(status_code=404, detail="Simulation not found")
            else:
                raise HTTPException(status_code=404, detail="Simulation not found")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=404, detail="Simulation not found")

    db = get_database()

    # Check DB cache first
    if hasattr(db, 'get_postmortem'):
        cached = await db.get_postmortem(simulation_id)
        if cached:
            cached_d = json.loads(cached) if isinstance(cached, str) else cached
            return cached_d

    cfg = entry["config"]
    config_obj = _cfg_to_v2_config(cfg) if not isinstance(cfg.get("subject"), dict) else cfg

    # Build SharedSpace from persisted turns if available
    from app.runtime.space import SharedSpace
    space = SharedSpace(None)  # type: ignore
    try:
        if hasattr(db, 'get_turns_by_simulation'):
            turns = await db.get_turns_by_simulation(simulation_id)
            for t in turns:
                space.events.append({
                    "type": "turn",
                    "turn_index": t.get("turn_index", 0),
                    "agent_id": t.get("agent_id", t.get("stakeholder_id", "")),
                    "speaker": t.get("speaker", t.get("stakeholder_name", "")),
                    "content": t.get("content", ""),
                    "action_type": t.get("action_type", "statement"),
                })
    except Exception:
        pass

    # Generate postmortem using PostmortemGenerator
    from app.runtime.postmortem_generator import PostmortemGenerator
    from app.models import SimulationV2Config, TerminationResult

    subject_name = ""
    if isinstance(config_obj, dict):
        subject_name = config_obj.get("subject", {}).get("name", "Simulation")
    elif hasattr(config_obj, "subject"):
        subject_name = getattr(config_obj.subject, "name", "Simulation")

    # Build minimal config for generator
    gen_config = _ensure_v2_config(config_obj, subject_name)
    gen = PostmortemGenerator(space, gen_config, behavior_engine=None)
    tr = TerminationResult(
        reason=entry.get("status", "complete") if isinstance(entry, dict) else "complete",
        outcome_type="no_decision",
        total_turns=len(space.events) if hasattr(space, "events") else 0,
    )

    try:
        pm = await gen.generate(simulation_id, tr)
        result = pm.model_dump(mode="json")
    except Exception as exc:
        logger.warning("Postmortem generation failed, returning basic: %s", exc)
        result = _basic_postmortem(simulation_id, cfg, str(exc))

    # Save to DB cache
    if hasattr(db, 'save_postmortem'):
        await db.save_postmortem(simulation_id, json.dumps(result))

    return result


def _basic_postmortem(simulation_id: str, cfg: dict, error: str) -> dict:
    """Fallback when full generation fails."""
    return {
        "simulation_id": simulation_id,
        "confidence_score": 50,
        "consensus_rating": 50,
        "confidence_trend": 0,
        "unanticipated_objections": 0,
        "unanticipated_note": f"Postmortem generation encountered an issue: {error}",
        "objection_topology": [],
        "alignment_deltas": [],
        "strategy_cards": [],
        "summary": "Postmortem generation incomplete.",
        "verdict": "Unknown",
        "end_reason": "unknown",
        "termination": {"reason": "unknown", "outcome_type": "no_decision", "total_turns": 0},
        "topics": [],
        "stakeholder_reports": [],
        "key_moments": [],
        "social_dynamics": {},
        "lessons_learned": [],
        "vote_events": [],
        "judge_events": [],
        "mocked": True,
    }


def _ensure_v2_config(raw: dict | Any, subject_name: str) -> Any:
    """Ensure we have a SimulationV2Config or compatible object."""
    from app.models import SimulationV2Config, Subject, StakeholderV2, ActionSpace, SpeakerRules
    if isinstance(raw, SimulationV2Config):
        return raw
    if isinstance(raw, dict):
        stakeholders_raw = raw.get("stakeholders", [])
        stakeholders = []
        for s in stakeholders_raw:
            if isinstance(s, dict):
                stakeholders.append(StakeholderV2(
                    id=s.get("id", "?"),
                    name=s.get("name", "?"),
                    role=s.get("role", ""),
                    stance=s.get("stance", "neutral"),
                ))
        return SimulationV2Config(
            subject=Subject(name=subject_name),
            stakeholders=stakeholders,
            action_space=ActionSpace(),
        )
    return raw


def _cfg_to_v2_config(cfg: dict) -> dict:
    """Normalize config dict to expected shape."""
    return cfg


@app.get("/agents/{name}/detail")
async def agent_detail(name: str) -> dict:
    """Comprehensive agent/persona detail view."""
    db = get_database()

    # Try UUID lookup first (frontend now uses /persona/<uuid> URLs), fall back to slug/name
    profile = await db.get_agent_by_id(name) or await db.get_agent_by_name(name)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"Agent '{name}' not found")

    # Use the persona UUID for all downstream queries
    persona_id = profile["id"]

    sims = await db.get_agent_simulations_by_id(persona_id)
    turns = await db.get_agent_turns_by_id(persona_id)
    from .database.postgres import get_agent_memories_by_id as _get_memories
    memories = await _get_memories(db, persona_id)

    # Compute emotional arc across all turns
    emotional_arc = []
    for t in turns:
        es = t.get("emotional_state", {})
        if isinstance(es, dict) and es:
            emotional_arc.append({
                "turn_index": t["turn_index"],
                "simulation": t["subject_name"],
                **{k: v for k, v in es.items() if isinstance(v, (int, float))},
            })

    # Goals from persisted DB (empty until runtime writes to v2_agent_goals)
    goals: list[dict] = []
    if hasattr(db, 'get_agent_goals_by_id'):
        try:
            goals = await db.get_agent_goals_by_id(persona_id)
        except Exception:
            pass

    # Strategies: extract internal_reasoning as strategy hints, grouped by simulation
    strategies: list[dict] = []
    turns_by_sim: dict[str, list[dict]] = {}
    for t in turns:
        sim_name = t.get("subject_name", "unknown")
        turns_by_sim.setdefault(sim_name, []).append(t)
    for s in sims:
        sim_name = s.get("subject_name", "")
        sim_turns = turns_by_sim.get(sim_name, [])
        hint_turns = [t for t in sim_turns if t.get("internal_reasoning")]
        strategies.append({
            "simulation_id": s.get("id", ""),
            "subject_name": sim_name,
            "strategy_hints": [
                {
                    "turn_index": t["turn_index"],
                    "hint": (t["internal_reasoning"][:100] + "...")
                    if len(t["internal_reasoning"]) > 100
                    else t["internal_reasoning"],
                }
                for t in hint_turns[:3]
            ],
        })

    # Hidden motive scores: empty until PrivateThoughtSystem data is persisted
    hidden_motive_scores: list[dict] = []

    return {
        "profile": profile,
        "simulations": sims,
        "recent_turns": turns[:20],
        "memories": memories,
        "emotional_arc": emotional_arc,
        "goals": goals,
        "strategies": strategies,
        "hidden_motive_scores": hidden_motive_scores,
        "stats": {
            "total_simulations": len(sims),
            "total_turns": sum(s["turn_count"] for s in sims),
            "total_memories": len(memories),
            "stances": list(set(s["stance"] for s in sims)),
        },
    }


@app.get("/simulations/analytics")
async def simulations_analytics() -> dict:
    """Cross-simulation analytics aggregation."""
    db = get_database()
    total_simulations = 0
    total_turns = 0
    persona_usage: dict[str, int] = {}
    stances_count: dict[str, int] = {}
    voltage_sum = 0
    sim_count_with_voltage = 0

    # Aggregate from in-memory simulations
    for sid, entry in _v2_simulations.items():
        if entry["status"] == "complete":
            total_simulations += 1
            cfg = entry["config"]
            for s in cfg.get("stakeholders", []):
                n = s.get("name", s.get("id", "unknown"))
                persona_usage[n] = persona_usage.get(n, 0) + 1
                st = s.get("stance", "neutral")
                stances_count[st] = stances_count.get(st, 0) + 1
            v = cfg.get("voltage", 0)
            if isinstance(v, (int, float)):
                voltage_sum += v
                sim_count_with_voltage += 1

    # Aggregate from DB
    try:
        if hasattr(db, 'list_simulations_v2'):
            db_sims = await db.list_simulations_v2()
            for s in db_sims:
                sid = s["simulation_id"]
                if sid not in _v2_simulations:
                    total_simulations += 1
                    cfg = s.get("config", {})
                    stakeholders = cfg.get("stakeholders", []) if isinstance(cfg, dict) else []
                    for p in stakeholders:
                        n = p.get("name", p.get("id", "unknown"))
                        persona_usage[n] = persona_usage.get(n, 0) + 1
                        st = p.get("stance", "neutral")
                        stances_count[st] = stances_count.get(st, 0) + 1
        if hasattr(db, 'get_all_turns_count'):
            total_turns = await db.get_all_turns_count()
    except Exception:
        pass

    return {
        "total_simulations": total_simulations,
        "total_turns": total_turns,
        "avg_voltage": round(voltage_sum / sim_count_with_voltage, 1) if sim_count_with_voltage else 50,
        "top_personas": sorted(persona_usage.items(), key=lambda x: -x[1])[:10],
        "stance_distribution": stances_count,
    }


@app.post("/simulations/{simulation_id}/inject")
async def inject_v2_turn(simulation_id: str, payload: dict) -> dict:
    from app.runtime.space import SharedSpace

    entry = _v2_simulations.get(simulation_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Simulation not found")

    speaker_id = payload.get("stakeholder_id", "")
    content = payload.get("content", "")
    if not speaker_id or not content:
        raise HTTPException(status_code=422, detail="stakeholder_id and content required")

    config = SimulationV2Config(**entry["config"])
    stakeholder = next((s for s in config.stakeholders if s.id == speaker_id), None)
    if not stakeholder:
        raise HTTPException(status_code=422, detail=f"Stakeholder {speaker_id} not found")

    space = SharedSpace(config)
    turn = await space.inject_turn(stakeholder.name, content)
    await _save_turn(simulation_id, turn.get("turn_index", 0), json.dumps(turn))
    return {"status": "ok", "turn": turn}


