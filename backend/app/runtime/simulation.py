from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator

from app.models import SimulationV2Config
from app.runtime.space import SharedSpace
from app.runtime.agent import AgentRuntime
from app.runtime.scheduler import Scheduler
from app.llm import openrouter_completion

logger = logging.getLogger(__name__)


async def run_simulation_v2(
    config: SimulationV2Config, simulation_id: str
) -> AsyncIterator[dict]:
    """
    Spawn agent loops + scheduler, then STREAM events LIVE via SharedSpace.

    Yields every event (system announcements, agent turns, final result)
    as dicts as soon as they're published -- no buffering.
    """
    space = SharedSpace(config)

    agents = [
        AgentRuntime(
            config=s,
            space=space,
            llm=openrouter_completion,
            system_prompt_template=config.system_prompt_template,
            simulation_id=simulation_id,
        )
        for s in config.stakeholders
    ]
    scheduler = Scheduler(config, space, simulation_id)

    agent_tasks = [asyncio.create_task(a.run()) for a in agents]
    scheduler_task = asyncio.create_task(scheduler.run())

    try:
        async for event in space.stream():
            yield event
            if event.get("type") == "done":
                break
    except Exception as exc:
        logger.exception("V2_SIM_STREAM_ERR simulation_id=%s", simulation_id)
        raise
    finally:
        space.shutdown()
        for t in agent_tasks:
            t.cancel()
        try:
            await asyncio.wait_for(
                asyncio.gather(*agent_tasks, scheduler_task, return_exceptions=True),
                timeout=3.0,
            )
        except asyncio.TimeoutError:
            pass
