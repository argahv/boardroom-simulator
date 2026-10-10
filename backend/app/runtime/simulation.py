from __future__ import annotations

import asyncio
import logging
from typing import Any, AsyncIterator

from app.models import SimulationConfig
from app.runtime.space import SharedSpace
from app.runtime.agent import AgentRuntime
from app.runtime.scheduler import Scheduler
from app.runtime.context import SimulationContext, build_context
from app.llm import openrouter_completion, _trace_context

logger = logging.getLogger(__name__)


async def run_simulation(
    config: SimulationConfig,
    simulation_id: str,
    behavior_engine: Any = None,
    memory_system: Any = None,
    plan_manager: Any = None,
    context: SimulationContext | None = None,
    llm: Any = None,
) -> AsyncIterator[dict]:
    """Run one simulation and yield every event as it happens.

    ``context`` lets the caller keep a handle on the live run (e.g. to inject
    human turns into its shared space); one is built when not supplied.
    """
    ctx = context or build_context(
        config, simulation_id,
        behavior_engine=behavior_engine,
        memory_system=memory_system,
        plan_manager=plan_manager,
    )
    space = ctx.space
    # Resolved at call time so tests can monkeypatch the module attribute.
    llm_func = llm or globals()["openrouter_completion"]

    agents = [
        AgentRuntime(
            config=s,
            space=space,
            llm=llm_func,
            system_prompt_template=config.system_prompt_template,
            simulation_id=simulation_id,
            context=ctx,
        )
        for s in config.stakeholders
    ]
    scheduler = Scheduler(config, space, simulation_id, context=ctx, llm=llm_func)

    async def _run_scheduler() -> None:
        # Never leave the stream hanging if the scheduler crashes.
        try:
            await scheduler.run()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Scheduler crashed simulation_id=%s", simulation_id)
            await space.publish({"type": "error", "message": f"Simulation engine error: {exc}"})
            await space.publish({"type": "done", "agent_id": "__scheduler__", "reason": "error",
                                 "outcome_type": "no_decision", "summary": "Simulation stopped by an engine error.",
                                 "total_turns": scheduler.turn_count})
            space.shutdown()

    agent_tasks = [asyncio.create_task(a.run()) for a in agents]
    scheduler_task = asyncio.create_task(_run_scheduler())

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
    except Exception:
        logger.exception("SIM_STREAM_ERR simulation_id=%s", simulation_id, extra={"simulation_id": simulation_id, "event": "simulation_error"})
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
