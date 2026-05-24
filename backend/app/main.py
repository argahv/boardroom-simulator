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
    SimulationV2Config,
    StakeholderV2,
    PersonalityProfile,
)
from .runtime import run_simulation_v2

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


@app.on_event("startup")
async def startup_event() -> None:
    await initialize_database()
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


# ── v2 Stakeholders (replaces v1 /api/stakeholders) ────────────────────────

_v2_stakeholders: dict[str, dict] = {}
from .models import PersonalityProfile

@app.get("/stakeholders", response_model=list[StakeholderV2])
async def list_v2_stakeholders() -> list[StakeholderV2]:
    return [StakeholderV2(**s) for s in _v2_stakeholders.values()]

@app.post("/stakeholders", response_model=StakeholderV2, status_code=201)
async def create_v2_stakeholder(payload: StakeholderV2) -> StakeholderV2:
    sid = str(uuid4())
    s = payload.model_copy(update={"id": sid})
    _v2_stakeholders[sid] = s.model_dump()
    return s

@app.put("/stakeholders/{stakeholder_id}", response_model=StakeholderV2)
async def update_v2_stakeholder(stakeholder_id: str, payload: StakeholderV2) -> StakeholderV2:
    if stakeholder_id not in _v2_stakeholders:
        raise HTTPException(status_code=404, detail="Stakeholder not found")
    s = payload.model_copy(update={"id": stakeholder_id})
    _v2_stakeholders[stakeholder_id] = s.model_dump()
    return s

@app.delete("/stakeholders/{stakeholder_id}")
async def delete_v2_stakeholder(stakeholder_id: str) -> Response:
    if stakeholder_id not in _v2_stakeholders:
        raise HTTPException(status_code=404, detail="Stakeholder not found")
    del _v2_stakeholders[stakeholder_id]
    return Response(status_code=204)

# ── v2 Agentic Simulation endpoints ─────────────────────────────────────────

from .database import get_database

_v2_simulations: dict[str, dict] = {}
_v2_active_streams: set[str] = set()

async def _load_v2_sims() -> None:
    global _v2_simulations
    pass

async def _save_v2_sim(simulation_id: str, config_json: str) -> None:
    db = get_database()
    try:
        await db.create_v2_simulation(simulation_id, config_json)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("V2_DB_SAVE_ERR %s: %s", simulation_id, exc)

async def _update_v2_status(simulation_id: str, status: str) -> None:
    db = get_database()
    try:
        await db.update_v2_simulation_status(simulation_id, status)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("V2_DB_STATUS_ERR %s: %s", simulation_id, exc)

async def _save_v2_turn(simulation_id: str, turn_index: int, turn_json: str) -> None:
    db = get_database()
    try:
        await db.insert_v2_turn(simulation_id, turn_index, turn_json)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("V2_DB_TURN_ERR %s: %s", simulation_id, exc)


@app.get("/simulations")
async def list_simulations_v2() -> list[dict]:
    return [
        {"simulation_id": sid, "subject": entry["config"].get("subject", {}), "status": entry["status"], "stakeholder_count": len(entry["config"].get("stakeholders", [])), "voltage": entry["config"].get("voltage", 50)}
        for sid, entry in _v2_simulations.items()
    ]


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
    await _save_v2_sim(simulation_id, json.dumps(config_json))
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
        await _update_v2_status(simulation_id, "running")

    async def event_stream():
        try:
            if already_complete:
                db = get_database()
                try:
                    turns = await db.get_v2_turns(simulation_id)
                except Exception:
                    turns = []
                for turn in turns:
                    yield f"data: {json.dumps(turn)}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'total_turns': len(turns)})}\n\n"
                return

            # Create BehaviorEngine for this simulation
            _be = create_engine([s.id for s in config.stakeholders])
            async for event in run_simulation_v2(config, simulation_id, behavior_engine=_be):
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") == "turn" and event.get("turn_index") is not None:
                    asyncio.ensure_future(_save_v2_turn(simulation_id, event["turn_index"], json.dumps(event)))
                if event.get("type") == "done":
                    break
        except asyncio.CancelledError:
            yield f"data: {json.dumps({'type': 'cancelled'})}\n\n"
        except Exception as exc:
            logger.exception("V2_SIM_STREAM_ERR simulation_id=%s", simulation_id)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        finally:
            if not already_complete:
                entry["status"] = "complete"
                await _update_v2_status(simulation_id, "complete")

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
        row = await db.get_v2_simulation(simulation_id)
        if row is not None:
            return row
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="Simulation not found")


@app.post("/simulations/{simulation_id}/postmortem")
async def postmortem_v2(simulation_id: str) -> dict:
    entry = _v2_simulations.get(simulation_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Simulation not found")

    db = get_database()
    try:
        turns = await db.get_v2_turns(simulation_id)
    except Exception:
        turns = []

    config = entry["config"]
    stakeholders = config.get("stakeholders", [])
    subject = config.get("subject", {})

    speaker_turns: dict[str, int] = {}
    stance_counts: dict[str, int] = {}
    for t in turns:
        speaker = t.get("speaker", t.get("agent_name", "unknown"))
        speaker_turns[speaker] = speaker_turns.get(speaker, 0) + 1
        stance = t.get("stance", "neutral")
        stance_counts[stance] = stance_counts.get(stance, 0) + 1

    leaderboard = [
        {"name": s.get("name", ""), "stance": s.get("stance", ""), "turns": speaker_turns.get(s.get("name", ""), 0)}
        for s in stakeholders
    ]
    leaderboard.sort(key=lambda x: x["turns"], reverse=True)

    return {
        "simulation_id": simulation_id,
        "subject": subject.get("name", ""),
        "total_turns": len(turns),
        "stakeholder_count": len(stakeholders),
        "speaker_turns": speaker_turns,
        "stances": stance_counts,
        "leaderboard": leaderboard,
        "voltage": config.get("voltage", 50),
        "status": entry["status"],
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
    await _save_v2_turn(simulation_id, turn.get("turn_index", 0), json.dumps(turn))
    return {"status": "ok", "turn": turn}


