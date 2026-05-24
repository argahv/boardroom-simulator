from __future__ import annotations

import asyncio
import json
import logging
import os
import time
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

LOG_LEVEL = os.getenv("BACKEND_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
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


def _mock_postmortem(state: SimulationState) -> Postmortem:
    objections = [turn for turn in state.turns if turn.action_type in ("challenge", "escalate")]
    avg_sentiment = (
        sum(state.sentiment) / len(state.sentiment) if state.sentiment else 0.0
    )
    consensus = max(0, min(100, int(55 + avg_sentiment * 30 + len(state.turns))))
    return Postmortem(
        simulation_id=state.simulation_id,
        confidence_score=max(0, min(100, consensus - 5)),
        confidence_trend=int(avg_sentiment * 20),
        unanticipated_objections=len(objections),
        unanticipated_note=(
            "Mock summary: finance and legal pressure created the main negotiation drag. "
            f"Detected {len(state.coalitions)} coalition(s) and {len(state.leverage_shifts)} leverage shift(s)."
        ),
        consensus_rating=consensus,
        objection_topology=[
            TopologyNode(id="root", label="Partnership term sheet", kind="root"),
            TopologyNode(
                id="commercial-risk",
                label="Commercial risk and clawbacks",
                kind="objection",
                parents=["root"],
            ),
            TopologyNode(
                id="phased-pilot",
                label="Phased pilot with clearer carve-outs",
                kind="resolution",
                parents=["commercial-risk"],
            ),
        ],
        alignment_deltas=[
            AlignmentDelta(
                stakeholder_id=s.id,
                name=s.name,
                role=s.role,
                delta=10 if s.tag in {"AGREEABLE", "VISIONARY"} else -5,
                quote=state.turns[-1].content if state.turns else "No transcript available.",
            )
            for s in state.config.stakeholders
        ],
        strategy_cards=[
            StrategyCard(
                objection="Revenue share and clawback ambiguity",
                counter="Offer a phased pilot with explicit downside caps and milestone gates.",
                risk="MEDIUM",
            ),
            StrategyCard(
                objection="Compliance and data ownership uncertainty",
                counter="Attach a compliance pack with data boundaries and SLA remedies.",
                risk="HIGH",
            ),
        ],
        mocked=True,
    )


def _postmortem_messages(state: SimulationState) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "Create a detailed postmortem for a simulated boardroom partnership negotiation. "
                "Analyze the transcript for real tensions, coalition dynamics, leverage shifts, and unresolved issues. "
                "Return only valid JSON matching the requested fields."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "schema": {
                        "confidence_score": "integer 0-100",
                        "confidence_trend": "integer delta, can be negative",
                        "unanticipated_objections": "integer",
                        "unanticipated_note": "brief analytical summary of unexpected dynamics",
                        "consensus_rating": "integer 0-100",
                        "objection_topology": [
                            {
                                "id": "string",
                                "label": "string",
                                "kind": "root | objection | resolution",
                                "parents": ["parent ids"],
                            }
                        ],
                        "alignment_deltas": [
                            {
                                "stakeholder_id": "string",
                                "name": "string",
                                "role": "string",
                                "delta": "integer -100..100",
                                "quote": "short quote from transcript",
                            }
                        ],
                        "strategy_cards": [
                            {
                                "objection": "string — specific objection raised",
                                "counter": "string — tactical counter move",
                                "risk": "LOW | MEDIUM | HIGH",
                            }
                        ],
                    },
                    "stakeholders": [s.model_dump() for s in state.config.stakeholders],
                    "transcript": _transcript(state),
                    "event_log": state.event_log[-20:],
                    "heatmap": state.heatmap.model_dump(),
                    "sentiment": state.sentiment,
                    "coalitions": [c.model_dump() for c in state.coalitions],
                    "leverage_shifts": [ls.model_dump() for ls in state.leverage_shifts],
                    "deadlock_risk_score": state.deadlock_risk_score,
                }
            ),
        },
    ]


def _postmortem_from_payload(
    simulation_id: str, payload: dict[str, object], mocked: bool
) -> Postmortem:
    return Postmortem(
        simulation_id=simulation_id,
        confidence_score=int(payload.get("confidence_score", 60)),
        confidence_trend=int(payload.get("confidence_trend", 0)),
        unanticipated_objections=int(payload.get("unanticipated_objections", 0)),
        unanticipated_note=str(payload.get("unanticipated_note", "")),
        consensus_rating=int(payload.get("consensus_rating", 60)),
        objection_topology=[
            TopologyNode(**item)
            for item in payload.get("objection_topology", [])
            if isinstance(item, dict)
        ],
        alignment_deltas=[
            AlignmentDelta(**item)
            for item in payload.get("alignment_deltas", [])
            if isinstance(item, dict)
        ],
        strategy_cards=[
            StrategyCard(**item)
            for item in payload.get("strategy_cards", [])
            if isinstance(item, dict)
        ],
        mocked=mocked,
    )


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
    """Simple rule-based memory extraction matching postgres.py logic."""
    import re
    if action_type == "compromise":
        return "concession"
    text = content.lower()
    if re.search(r'\b(believe|think|position|stance|support|oppose|agree|disagree)\b', text):
        return "position"
    if re.search(r'\b(never|cannot|red line|under no circumstances|will not|won\'t|refuse)\b', text):
        return "red_line"
    if re.search(r'\b(concede|concession|willing to|open to|flexible on)\b', text):
        return "concession"
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


@app.get("/simulations")
async def list_simulations_v2() -> list[dict]:
    # List from new schema, unioned with in-memory active streams
    db = get_database()
    active = [
        {"simulation_id": sid, "subject": entry["config"].get("subject", {}), "status": entry["status"],
         "stakeholder_count": len(entry["config"].get("stakeholders", [])), "voltage": entry["config"].get("voltage", 50)}
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


def _mock_postmortem_from_raw(
    simulation_id: str, turns: list[dict], cfg: dict
) -> dict:
    """Generate mock postmortem from raw v2 data (no LLM)."""
    stakeholders = cfg.get("stakeholders", [])
    objections = [t for t in turns if t.get("action_type") in ("challenge", "escalate")]
    total_turns = len(turns)
    sentiment_values = [t.get("sentiment", 0) for t in turns if isinstance(t.get("sentiment"), (int, float))]
    avg_sentiment = sum(sentiment_values) / len(sentiment_values) if sentiment_values else 0.0
    consensus = max(0, min(100, int(55 + avg_sentiment * 30 + total_turns)))

    alignment_deltas = []
    for s in stakeholders:
        s_name = s.get("name", "")
        alignment_deltas.append({
            "stakeholder_id": s.get("id", s_name),
            "name": s_name,
            "role": s.get("role", ""),
            "delta": 10 if s.get("tag") in ("AGREEABLE", "VISIONARY") else -5,
            "quote": turns[-1].get("content", "No transcript available.") if turns else "No transcript available.",
        })

    speaker_turns: dict[str, int] = {}
    for t in turns:
        speaker = t.get("speaker", t.get("agent_name", "unknown"))
        speaker_turns[speaker] = speaker_turns.get(speaker, 0) + 1
    leaderboard = [
        {"name": s.get("name", ""), "turns": speaker_turns.get(s.get("name", ""), 0)}
        for s in stakeholders
    ]
    leaderboard.sort(key=lambda x: x["turns"], reverse=True)

    return {
        "simulation_id": simulation_id,
        "confidence_score": max(0, min(100, consensus - 5)),
        "confidence_trend": int(avg_sentiment * 20),
        "unanticipated_objections": len(objections),
        "unanticipated_note": (
            f"Mock summary: finance and legal pressure created the main negotiation drag. "
            f"Detected {len(leaderboard)} stakeholder(s) and {total_turns} turn(s)."
        ),
        "consensus_rating": consensus,
        "objection_topology": [
            {"id": "root", "label": "Partnership term sheet", "kind": "root", "parents": []},
            {"id": "commercial-risk", "label": "Commercial risk and clawbacks", "kind": "objection", "parents": ["root"]},
            {"id": "phased-pilot", "label": "Phased pilot with clearer carve-outs", "kind": "resolution", "parents": ["commercial-risk"]},
        ],
        "alignment_deltas": alignment_deltas,
        "strategy_cards": [
            {"objection": "Revenue share and clawback ambiguity", "counter": "Offer a phased pilot with explicit downside caps and milestone gates.", "risk": "MEDIUM"},
            {"objection": "Compliance and data ownership uncertainty", "counter": "Attach a compliance pack with data boundaries and SLA remedies.", "risk": "HIGH"},
        ],
        "mocked": True,
    }


@app.post("/simulations/{simulation_id}/postmortem")
async def postmortem_v2(simulation_id: str) -> dict:
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
    try:
        if hasattr(db, 'get_turns_by_simulation'):
            turns = await db.get_turns_by_simulation(simulation_id)
        else:
            turns = []
    except Exception:
        turns = []

    cfg = entry["config"]

    # Check DB cache first
    db = get_database()
    if hasattr(db, 'get_postmortem'):
        cached = await db.get_postmortem(simulation_id)
        if cached:
            cached_d = json.loads(cached) if isinstance(cached, str) else cached
            return cached_d

    # Generate postmortem (try LLM, fall back to mock)
    result = None
    if config.OPENROUTER_API_KEY and turns:
        try:
            transcript = "\n".join(
                f"{t.get('turn_index', i)}. {t.get('speaker', t.get('agent_name', 'unknown'))}: {t.get('content', '')}"
                for i, t in enumerate(turns)
            )

            messages = [
                {
                    "role": "system",
                    "content": (
                        "Create a detailed postmortem for a simulated boardroom partnership negotiation. "
                        "Analyze the transcript for real tensions, coalition dynamics, leverage shifts, and unresolved issues. "
                        "Return only valid JSON matching the requested fields."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({
                        "schema": {
                            "confidence_score": "integer 0-100",
                            "confidence_trend": "integer delta, can be negative",
                            "unanticipated_objections": "integer",
                            "unanticipated_note": "brief analytical summary of unexpected dynamics",
                            "consensus_rating": "integer 0-100",
                            "objection_topology": [
                                {"id": "string", "label": "string", "kind": "root | objection | resolution", "parents": ["parent ids"]}
                            ],
                            "alignment_deltas": [
                                {"stakeholder_id": "string", "name": "string", "role": "string", "delta": "integer -100..100", "quote": "short quote from transcript"}
                            ],
                            "strategy_cards": [
                                {"objection": "string — specific objection raised", "counter": "string — tactical counter move", "risk": "LOW | MEDIUM | HIGH"}
                            ],
                        },
                        "stakeholders": cfg.get("stakeholders", []),
                        "transcript": transcript,
                        "num_turns": len(turns),
                    }),
                },
            ]

            text, _mocked, _metadata = await openrouter_completion(
                messages,
                temperature=0.4,
                simulation_id=simulation_id,
            )
            if text and text != "{}":
                payload = parse_json_object(text)
                pm = _postmortem_from_payload(simulation_id, payload, mocked=False)
                result = pm.model_dump()
        except Exception as exc:
            logger.warning("LLM postmortem failed, falling back to mock: %s", exc)

    if result is None:
        result = _mock_postmortem_from_raw(simulation_id, turns, cfg)

    # Save to DB cache
    if hasattr(db, 'save_postmortem'):
        await db.save_postmortem(simulation_id, json.dumps(result))

    return result


@app.get("/agents/{name}/detail")
async def agent_detail(name: str) -> dict:
    """Comprehensive agent/persona detail view."""
    db = get_database()
    profile = await db.get_agent_by_name(name)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"Agent '{name}' not found")

    sims = await db.get_agent_simulations(name)
    turns = await db.get_agent_turns(name)
    from .database.postgres import get_agent_memories as _get_memories
    memories = await _get_memories(db, name)

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

    return {
        "profile": profile,
        "simulations": sims,
        "recent_turns": turns[:20],
        "memories": memories,
        "emotional_arc": emotional_arc,
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


