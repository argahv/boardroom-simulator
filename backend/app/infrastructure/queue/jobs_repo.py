from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional
from uuid import uuid4


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class JobType(str, Enum):
    SIMULATION = "simulation"
    POSTMORTEM = "postmortem"


@dataclass
class Job:
    id: str
    type: JobType
    status: JobStatus
    simulation_id: str
    idempotency_key: str
    payload: Dict[str, Any]
    rq_job_id: Optional[str] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value,
            "status": self.status.value,
            "simulation_id": self.simulation_id,
            "idempotency_key": self.idempotency_key,
            "rq_job_id": self.rq_job_id,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


_STORE: Dict[str, Job] = {}
_IDEMPOTENCY_INDEX: Dict[str, str] = {}


def create(
    job_type: JobType,
    simulation_id: str,
    idempotency_key: str,
    payload: Dict[str, Any],
) -> Job:
    existing_id = _IDEMPOTENCY_INDEX.get(idempotency_key)
    if existing_id:
        existing = _STORE.get(existing_id)
        if existing and existing.status in (JobStatus.QUEUED, JobStatus.RUNNING):
            return existing

    job = Job(
        id=str(uuid4()),
        type=job_type,
        status=JobStatus.QUEUED,
        simulation_id=simulation_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    _STORE[job.id] = job
    _IDEMPOTENCY_INDEX[idempotency_key] = job.id
    return job


def get(job_id: str) -> Optional[Job]:
    return _STORE.get(job_id)


def update_status(
    job_id: str,
    status: JobStatus,
    rq_job_id: Optional[str] = None,
    result: Optional[Any] = None,
    error: Optional[str] = None,
) -> Optional[Job]:
    job = _STORE.get(job_id)
    if not job:
        return None
    job.status = status
    job.updated_at = time.time()
    if rq_job_id is not None:
        job.rq_job_id = rq_job_id
    if result is not None:
        job.result = result
    if error is not None:
        job.error = error
    return job


def list_for_simulation(simulation_id: str) -> list[Job]:
    jobs = [j for j in _STORE.values() if j.simulation_id == simulation_id]
    jobs.sort(key=lambda j: j.created_at, reverse=True)
    return jobs


def list_all() -> list[Job]:
    jobs = list(_STORE.values())
    jobs.sort(key=lambda j: j.created_at, reverse=True)
    return jobs
