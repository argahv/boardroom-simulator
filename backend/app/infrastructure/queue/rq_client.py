from __future__ import annotations

from redis import Redis
from rq import Queue

from app import config


def get_redis() -> Redis:
    return Redis.from_url(config.REDIS_URL)


def get_simulation_queue() -> Queue:
    return Queue(config.RQ_QUEUE_SIMULATION, connection=get_redis(), default_timeout=config.RQ_JOB_TIMEOUT_SECONDS)


def get_postmortem_queue() -> Queue:
    return Queue(config.RQ_QUEUE_POSTMORTEM, connection=get_redis(), default_timeout=config.RQ_JOB_TIMEOUT_SECONDS)
