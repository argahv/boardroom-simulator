from __future__ import annotations

from . import jobs_repo
from .queue_tasks import run_simulation_job, generate_postmortem_job
from .rq_client import get_postmortem_queue, get_simulation_queue


def enqueue_simulation(simulation_id: str, max_turns: int | None = None) -> jobs_repo.Job:
    idempotency_key = f"simulation:{simulation_id}:{max_turns or 'default'}"
    job = jobs_repo.create(
        jobs_repo.JobType.SIMULATION,
        simulation_id,
        idempotency_key,
        payload={"max_turns": max_turns},
    )
    if job.status in (jobs_repo.JobStatus.QUEUED, jobs_repo.JobStatus.RUNNING) and job.rq_job_id:
        return job

    rq_job = get_simulation_queue().enqueue(run_simulation_job, job.id, simulation_id, max_turns)
    jobs_repo.update_status(job.id, jobs_repo.JobStatus.QUEUED, rq_job_id=rq_job.id)
    return jobs_repo.get(job.id) or job


def enqueue_postmortem(simulation_id: str) -> jobs_repo.Job:
    idempotency_key = f"postmortem:{simulation_id}"
    job = jobs_repo.create(
        jobs_repo.JobType.POSTMORTEM,
        simulation_id,
        idempotency_key,
        payload={},
    )
    if job.status in (jobs_repo.JobStatus.QUEUED, jobs_repo.JobStatus.RUNNING) and job.rq_job_id:
        return job

    rq_job = get_postmortem_queue().enqueue(generate_postmortem_job, job.id, simulation_id)
    jobs_repo.update_status(job.id, jobs_repo.JobStatus.QUEUED, rq_job_id=rq_job.id)
    return jobs_repo.get(job.id) or job


def retry_job(job_id: str) -> jobs_repo.Job | None:
    job = jobs_repo.get(job_id)
    if job is None:
        return None

    if job.type == jobs_repo.JobType.SIMULATION:
        return enqueue_simulation(job.simulation_id, max_turns=job.payload.get("max_turns"))

    if job.type == jobs_repo.JobType.POSTMORTEM:
        return enqueue_postmortem(job.simulation_id)

    return None
