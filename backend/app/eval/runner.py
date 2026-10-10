"""Run benchmark scenarios and score the resulting recordings."""

from __future__ import annotations

import logging
from typing import Any

from app.eval import judge as judge_mod
from app.eval import scorecard
from app.eval.recording import Recording
from app.eval.scenarios import Scenario
from app.eval.stub_llm import StubLLM, stub_judge
from app.runtime.context import build_context
from app.runtime.simulation import run_simulation

logger = logging.getLogger(__name__)


def make_llm(kind: str, config, seed: int):
    if kind == "stub":
        return StubLLM(config, seed=seed)
    if kind == "openrouter":
        from app import config as app_config
        from app.llm import openrouter_completion
        if not app_config.OPENROUTER_API_KEY:
            raise SystemExit("OPENROUTER_API_KEY is not set — use --llm stub for an offline run.")
        return openrouter_completion
    raise ValueError(f"unknown llm kind {kind!r}")


def make_judge(kind: str):
    if kind == "none":
        return None
    if kind == "stub":
        return stub_judge
    if kind == "llm":
        from app import config as app_config
        from app.llm import openrouter_completion
        if not app_config.OPENROUTER_API_KEY:
            raise SystemExit("OPENROUTER_API_KEY is not set — the LLM judge needs it.")
        if app_config.EVAL_JUDGE_MODEL == app_config.OPENROUTER_MODEL:
            logger.warning("EVAL_JUDGE_MODEL equals OPENROUTER_MODEL: the generator is grading itself.")
        return openrouter_completion
    raise ValueError(f"unknown judge kind {kind!r}")


async def run_scenario(scenario: Scenario, seed: int = 0, llm_kind: str = "stub") -> Recording:
    config = scenario.build()
    sim_id = f"eval-{scenario.key}-s{seed}"
    ctx = build_context(config, sim_id)
    llm = make_llm(llm_kind, config, seed)
    pending = sorted(scenario.injections, key=lambda i: i.after_turns)
    agent_turns = 0
    async for event in run_simulation(config, sim_id, context=ctx, llm=llm):
        if event.get("type") == "turn" and not event.get("is_human"):
            agent_turns += 1
            while pending and agent_turns >= pending[0].after_turns:
                inj = pending.pop(0)
                speaker = next(s for s in config.stakeholders if s.id == inj.stakeholder_id)
                await ctx.space.inject_turn(speaker.name, inj.content, agent_id=speaker.id,
                                            action_type=inj.action_type, directed_at=inj.directed_at)
    return Recording.from_context(ctx, meta={"scenario": scenario.key, "seed": seed, "llm": llm_kind})


async def evaluate(rec: Recording, scenario: Scenario | None = None, judge_kind: str = "none",
                   judge_sample: float = 1.0, judge_max: int | None = None, seed: int = 0) -> dict:
    judge_llm = make_judge(judge_kind)
    judged: dict[str, Any] | None = None
    if judge_llm is not None:
        judged = await judge_mod.judge_recording(rec, llm=judge_llm, sample=judge_sample,
                                                 max_turns=judge_max, seed=seed)
    return scorecard.build(rec, scenario=scenario, judge=judged)
