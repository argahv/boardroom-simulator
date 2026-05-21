from __future__ import annotations

import asyncio
import json
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from . import config, store
from .database import initialize_database, close_database
from .engine import advance_turn, run_simulation
from .llm import openrouter_completion, parse_json_object
from .infrastructure.queue.enqueue import enqueue_postmortem, enqueue_simulation, retry_job
from .infrastructure.queue import jobs_repo
from .models import (
    AlignmentDelta,
    Postmortem,
    ScenarioTemplate,
    SimulationCreate,
    SimulationState,
    Stakeholder,
    StrategyCard,
    TopologyNode,
)
from .seeds import run as run_seeds

app = FastAPI(title="Boardroom Simulator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event() -> None:
    await initialize_database()
    try:
        await run_seeds()
    except Exception as exc:
        print(f"⚠ Error during seed loading: {exc}")
        raise


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await close_database()



class RunRequest(BaseModel):
    max_turns: int | None = Field(default=None, gt=0)

class CreateStakeholderRequest(BaseModel):
    name: str = Field(..., min_length=1)
    role: str = Field(..., min_length=1)
    focus: str = Field(..., min_length=1)
    incentive_tuning: int = Field(default=50, ge=0, le=100)
    hidden_agenda: str = ""
    tag: str | None = None
    tool_profile: str = "none"

class UpdateStakeholderRequest(BaseModel):
    name: str | None = None
    role: str | None = None
    focus: str | None = None
    incentive_tuning: int | None = Field(default=None, ge=0, le=100)
    hidden_agenda: str | None = None
    tag: str | None = None
    tool_profile: str | None = None


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
    return {"ok": True, "mode": "production"}


# ---------------------------------------------------------------------------
# Scenario templates
# ---------------------------------------------------------------------------

@app.get("/templates", response_model=list[ScenarioTemplate])
async def list_templates() -> list[ScenarioTemplate]:
    return await store.list_templates()


@app.get("/templates/{template_id}", response_model=ScenarioTemplate)
async def get_template(template_id: str) -> ScenarioTemplate:
    template = await store.get_template(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@app.get("/templates/{template_id}/personas", response_model=list[Stakeholder])
async def get_template_personas(template_id: str) -> list[Stakeholder]:
    template = await store.get_template(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return await store.get_template_personas(template_id)


@app.get("/library")
async def library_compat() -> dict:
    """
    Backwards-compat shim for frontend fetchLibrary().
    Returns all stakeholders in the old {default_library, partnership_defaults} shape.
    partnership_defaults = suggested personas for the partnership_negotiation template.
    default_library = everything else.
    """
    all_personas = await store.get_all_stakeholders()
    partnership_personas = await store.get_template_personas("partnership_negotiation")
    partnership_ids = {p.id for p in partnership_personas}
    return {
        "partnership_defaults": [p.model_dump() for p in partnership_personas],
        "default_library": [p.model_dump() for p in all_personas if p.id not in partnership_ids],
    }

@app.get("/api/stakeholders", response_model=list[Stakeholder])
async def list_stakeholders() -> list[Stakeholder]:
    return await store.get_all_stakeholders()

@app.post("/api/stakeholders", response_model=Stakeholder, status_code=201)
async def create_stakeholder(payload: CreateStakeholderRequest) -> Stakeholder:
    stakeholder = Stakeholder(
        id=str(uuid4()),
        name=payload.name,
        role=payload.role,
        focus=payload.focus,
        incentive_tuning=payload.incentive_tuning,
        hidden_agenda=payload.hidden_agenda,
        tag=payload.tag,
        tool_profile=payload.tool_profile,
    )
    return await store.add_stakeholder(stakeholder)

@app.put("/api/stakeholders/{stakeholder_id}", response_model=Stakeholder)
async def update_stakeholder(
    stakeholder_id: str, payload: UpdateStakeholderRequest
) -> Stakeholder:
    existing = await store.get_stakeholder(stakeholder_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Stakeholder not found")

    updated = Stakeholder(
        id=stakeholder_id,
        name=payload.name if payload.name is not None else existing.name,
        role=payload.role if payload.role is not None else existing.role,
        focus=payload.focus if payload.focus is not None else existing.focus,
        incentive_tuning=payload.incentive_tuning if payload.incentive_tuning is not None else existing.incentive_tuning,
        hidden_agenda=payload.hidden_agenda if payload.hidden_agenda is not None else existing.hidden_agenda,
        tag=payload.tag if payload.tag is not None else existing.tag,
        tool_profile=payload.tool_profile if payload.tool_profile is not None else existing.tool_profile,
    )
    return await store.update_stakeholder(stakeholder_id, updated)

@app.delete("/api/stakeholders/{stakeholder_id}")
async def delete_stakeholder(stakeholder_id: str) -> Response:
    if not await store.delete_stakeholder(stakeholder_id):
        raise HTTPException(status_code=404, detail="Stakeholder not found")
    return Response(status_code=204)

@app.post("/simulations", response_model=SimulationState)
async def create_simulation(payload: SimulationCreate) -> SimulationState:
    state = SimulationState(
        simulation_id=str(uuid4()),
        config=payload,
        mocked=False,
    )
    return await store.put(state)


@app.get("/simulations", response_model=list[SimulationState])
async def list_simulations() -> list[SimulationState]:
    return await store.list_simulations()


@app.get("/simulations/{simulation_id}", response_model=SimulationState)
async def get_simulation(simulation_id: str) -> SimulationState:
    return await _get_state_or_404(simulation_id)


@app.get("/simulations/{simulation_id}/checkpoint")
async def get_checkpoint_info(simulation_id: str) -> dict:
    from .persistence import get_checkpoint_manager
    
    checkpoint_manager = get_checkpoint_manager()
    metadata = checkpoint_manager.get_checkpoint_metadata(simulation_id)
    
    if metadata is None:
        raise HTTPException(status_code=404, detail="No checkpoint found for this simulation")
    
    return metadata


@app.get("/simulations/{simulation_id}/jobs")
async def get_simulation_jobs(simulation_id: str) -> dict:
    await _get_state_or_404(simulation_id)
    jobs = jobs_repo.list_for_simulation(simulation_id)
    return {"jobs": [j.to_dict() for j in jobs]}


@app.post("/jobs/{job_id}/retry")
def retry_existing_job(job_id: str) -> dict:
    retried = retry_job(job_id)
    if retried is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job": retried.to_dict()}


@app.get("/simulations/{simulation_id}/stream")
async def stream_simulation(simulation_id: str, max_turns: int = 20) -> StreamingResponse:
    state = await _get_state_or_404(simulation_id)

    async def _generate():
        nonlocal state
        limit = min(max_turns, config.MAX_TURNS)
        current_state = state.model_copy(deep=True)
        current_state.status = "running"

        try:
            while len(current_state.turns) < limit:
                prev_count = len(current_state.turns)
                current_state = await advance_turn(current_state)
                await store.put(current_state)

                if len(current_state.turns) == prev_count:
                    break

                last_turn = current_state.turns[-1]
                event = {
                    "type": "turn",
                    "turn": last_turn.model_dump(),
                    "state_summary": {
                        "heatmap": current_state.heatmap.model_dump(),
                        "active_speaker_id": current_state.active_speaker_id,
                        "deadlock_risk_score": current_state.deadlock_risk_score,
                        "coalitions": [c.model_dump() for c in current_state.coalitions],
                        "leverage_shifts": [ls.model_dump() for ls in current_state.leverage_shifts],
                        "event_log": current_state.event_log[-5:],
                        "sentiment": current_state.sentiment,
                        "turn_count": len(current_state.turns),
                        "trust_matrix": current_state.trust_matrix,
                        "leverage_scores": current_state.leverage_scores,
                    },
                }
                yield f"data: {json.dumps(event)}\n\n"
                await asyncio.sleep(0)

            current_state.status = "complete"
            await store.put(current_state)
            done_event = {"type": "done", "state": current_state.model_dump()}
            yield f"data: {json.dumps(done_event)}\n\n"

        except Exception as exc:
            error_event = {"type": "error", "message": str(exc)}
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/simulations/{simulation_id}/postmortem", response_model=Postmortem)
async def create_postmortem(simulation_id: str) -> Postmortem:
    state = await _get_state_or_404(simulation_id)

    raw, mocked, _meta = await openrouter_completion(
        _postmortem_messages(state),
        temperature=0.3,
        simulation_id=simulation_id,
    )
    try:
        return _postmortem_from_payload(simulation_id, parse_json_object(raw), mocked)
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Postmortem parsing failed: {exc}")
