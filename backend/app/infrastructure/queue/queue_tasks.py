from __future__ import annotations

import asyncio

from app.engine import run_simulation
from app.llm import openrouter_completion, parse_json_object
from app.postmortem_service import postmortem_from_payload, postmortem_messages
from app.models import SimulationState
from app import store
from . import jobs_repo


def run_simulation_job(job_id: str, simulation_id: str, max_turns: int | None = None) -> dict:
    jobs_repo.update_status(job_id, jobs_repo.JobStatus.RUNNING)
    state = store.get(simulation_id)
    if state is None:
        jobs_repo.update_status(job_id, jobs_repo.JobStatus.FAILED, error="Simulation not found")
        return {"ok": False, "error": "Simulation not found"}

    try:
        next_state = run_simulation(state, max_turns=max_turns)
        store.put(next_state)
        jobs_repo.update_status(job_id, jobs_repo.JobStatus.SUCCEEDED, result={"simulation_id": simulation_id, "turns": len(next_state.turns)})
        return {"ok": True, "simulation_id": simulation_id, "turns": len(next_state.turns)}
    except Exception as exc:
        jobs_repo.update_status(job_id, jobs_repo.JobStatus.FAILED, error=str(exc))
        return {"ok": False, "error": str(exc)}


def generate_postmortem_job(job_id: str, simulation_id: str) -> dict:
    jobs_repo.update_status(job_id, jobs_repo.JobStatus.RUNNING)
    state = store.get(simulation_id)
    if state is None:
        jobs_repo.update_status(job_id, jobs_repo.JobStatus.FAILED, error="Simulation not found")
        return {"ok": False, "error": "Simulation not found"}

    async def _run() -> dict:
        raw, mocked, _meta = await openrouter_completion(
            postmortem_messages(state),
            temperature=0.3,
            simulation_id=simulation_id,
        )
        parsed = parse_json_object(raw)
        result = postmortem_from_payload(simulation_id, parsed, mocked)
        return result.model_dump()

    try:
        result = asyncio.run(_run())
        jobs_repo.update_status(job_id, jobs_repo.JobStatus.SUCCEEDED, result=result)
        return {"ok": True, "postmortem": result}
    except Exception as exc:
        jobs_repo.update_status(job_id, jobs_repo.JobStatus.FAILED, error=str(exc))
        return {"ok": False, "error": str(exc)}
