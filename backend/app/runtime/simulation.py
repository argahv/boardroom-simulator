from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator

from app.models import SimulationV2Config
from app.runtime.space import SharedSpace
from app.runtime.agent import AgentRuntime
from app.runtime.scheduler import Scheduler
from app.llm import openrouter_completion, _trace_context

logger = logging.getLogger(__name__)


async def run_simulation_v2(
    config: SimulationV2Config,
    simulation_id: str,
    behavior_engine: Any = None,
    memory_system: Any = None,
    plan_manager: Any = None,
) -> AsyncIterator[dict]:
    space = SharedSpace(config)

    agents = [
        AgentRuntime(
            config=s,
            space=space,
            llm=openrouter_completion,
            system_prompt_template=config.system_prompt_template,
            simulation_id=simulation_id,
            behavior_engine=behavior_engine,
            memory_system=memory_system,
            plan_manager=plan_manager,
        )
        for s in config.stakeholders
    ]
    scheduler = Scheduler(config, space, simulation_id, behavior_engine=behavior_engine)

    agent_tasks = [asyncio.create_task(a.run()) for a in agents]
    scheduler_task = asyncio.create_task(scheduler.run())

    logger.info("Simulation %s started: subject=%s stakeholders=%d", simulation_id, config.subject.name, len(config.stakeholders), extra={"simulation_id": simulation_id, "subject": config.subject.name, "stakeholders": len(config.stakeholders), "event": "simulation_started"})

    try:
        with _trace_context(name="boardroom_simulation", run_type="chain",
                            inputs={"simulation_id": simulation_id,
                                    "subject": config.subject.name,
                                    "stakeholders": len(config.stakeholders)}):
            async for event in space.stream():
                yield event
                if event.get("type") == "done":
                    break
    except Exception as exc:
        logger.exception("V2_SIM_STREAM_ERR simulation_id=%s", simulation_id, extra={"simulation_id": simulation_id, "event": "simulation_error"})
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
