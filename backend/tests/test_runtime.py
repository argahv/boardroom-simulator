from __future__ import annotations

import asyncio
import json

import pytest

from app.models import (
    Subject,
    AgentConfig,
    PersonalityProfile,
    ActionSpace,
    CustomActionDef,
    SpeakerRules,
    TimeoutCondition,
    SimulationConfig,
)
from app.runtime.space import SharedSpace
from app.runtime.scheduler import Scheduler
from app.runtime.simulation import run_simulation


# ── helpers ────────────────────────────────────────────────────────────────

def make_config(max_turns: int = 4) -> SimulationConfig:
    return SimulationConfig(
        subject=Subject(name="Test Subject", description="A test debate"),
        stakeholders=[
            AgentConfig(
                id="s1", name="Alpha", role="Champion",
                stance="champion",
                personality=PersonalityProfile(aggressiveness=70, verbosity=50),
            ),
            AgentConfig(
                id="s2", name="Beta", role="Detractor",
                stance="detractor",
                personality=PersonalityProfile(empathy=60, stubbornness=80),
            ),
            AgentConfig(
                id="s3", name="Gamma", role="Moderator",
                stance="moderator",
                personality=PersonalityProfile(verbosity=30),
            ),
            AgentConfig(
                id="s4", name="Delta", role="Analyst",
                stance="neutral",
                personality=PersonalityProfile(aggressiveness=40, empathy=70),
            ),
        ],
        action_space=ActionSpace(actions=[
            CustomActionDef(name="fact_check", description="Cite evidence", trust_delta=5),
        ]),
        speaker_rules=SpeakerRules(mode="alternating"),
        end_condition=TimeoutCondition(type="timeout", max_normal_turns=max_turns),
        voltage=50,
    )


MOCK_TURN = json.dumps({
    "content": "I believe this is a critical issue that needs attention.",
    "action_type": "statement",
    "internal_reasoning": "The evidence supports my position.",
})


async def mock_llm(messages, temperature=0.6, simulation_id=None, turn_index=None, agent_id=None):
    return MOCK_TURN, True, {"model": "mock", "token_count": 50}


# ── SharedSpace tests ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_space_lifecycle():
    cfg = make_config()
    space = SharedSpace(cfg)
    assert space.is_running() is True
    assert len(space.events) == 0

    await space.publish({"type": "turn", "agent_id": "s1", "content": "hello"})
    assert len(space.events) == 1
    assert space.events[0]["content"] == "hello"
    assert "_index" in space.events[0]
    assert "_timestamp" in space.events[0]

    space.shutdown()
    assert space.is_running() is False


@pytest.mark.asyncio
async def test_space_wait_for_change():
    cfg = make_config()
    space = SharedSpace(cfg)

    async def publisher():
        await asyncio.sleep(0.05)
        await space.publish({"type": "turn", "agent_id": "s1", "content": "hello"})
        await asyncio.sleep(0.05)
        space.shutdown()

    async def waiter():
        v1 = await space.wait_for_change(known_version=-1)
        assert v1 > -1
        v2 = await space.wait_for_change(known_version=v1)
        assert v2 > v1

    await asyncio.gather(publisher(), waiter())


@pytest.mark.asyncio
async def test_space_bidding():
    cfg = make_config()
    space = SharedSpace(cfg)

    space.submit_bid("s1", urgency=80)
    space.submit_bid("s2", urgency=30)
    space.submit_bid("s3", urgency=90)

    winner = await space.resolve_bid()
    assert winner == "s3"

    winner = await space.resolve_bid()
    assert winner == "s1"

    winner = await space.resolve_bid()
    assert winner == "s2"


@pytest.mark.asyncio
async def test_space_floor():
    cfg = make_config()
    space = SharedSpace(cfg)

    assert space.current_speaker is None
    await space.grant_floor("s1")
    assert space.current_speaker == "s1"
    space.release_floor()
    assert space.current_speaker is None


# ── Scheduler tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_scheduler_alternating():
    cfg = make_config(max_turns=4)
    space = SharedSpace(cfg)
    scheduler = Scheduler(cfg, space, "test-sim")

    scheduler.turn_count = 0
    winner1 = await scheduler._resolve_next_speaker()
    scheduler.turn_count = 1
    winner2 = await scheduler._resolve_next_speaker()
    scheduler.turn_count = 2
    winner3 = await scheduler._resolve_next_speaker()
    scheduler.turn_count = 3
    winner4 = await scheduler._resolve_next_speaker()

    champions = {s.id for s in cfg.stakeholders if s.stance == "champion"}
    detractors = {s.id for s in cfg.stakeholders if s.stance == "detractor"}

    assert winner1 in champions
    assert winner2 in detractors
    assert winner3 in champions
    assert winner4 in detractors


@pytest.mark.asyncio
async def test_scheduler_end_condition():
    from app.runtime.scheduler import TimeoutChecker, TerminationContext

    cfg = make_config(max_turns=4)
    ctx = TerminationContext(config=cfg, space=SharedSpace(cfg), turn_count=0)

    checker = TimeoutChecker(cfg.end_condition)  # type: ignore

    ctx.turn_count = 3
    r1 = await checker.check(ctx)
    assert r1 is None, "Should not trigger at turn 3"

    ctx.turn_count = 4
    r2 = await checker.check(ctx)
    assert r2 is not None, "Should trigger at turn 4"
    assert r2.reason == "timeout"
    assert r2.outcome_type == "no_decision"


# ── Integration tests ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_simulation_with_mock_llm(monkeypatch):
    monkeypatch.setattr("app.runtime.simulation.openrouter_completion", mock_llm)

    cfg = make_config(max_turns=4)

    events: list[dict] = []
    async for event in run_simulation(cfg, simulation_id="test-int"):
        events.append(event)

    assert len(events) > 0

    start_events = [e for e in events if e.get("type") == "system" and e.get("content") == "Simulation started."]
    assert len(start_events) == 1

    turn_events = [e for e in events if e.get("type") == "turn"]
    assert len(turn_events) >= 1

    done_events = [e for e in events if e.get("type") == "done"]
    assert len(done_events) == 1

    done = done_events[0]
    assert "total_turns" in done
    assert done["total_turns"] >= 1


@pytest.mark.asyncio
async def test_all_agents_speak(monkeypatch):
    monkeypatch.setattr("app.runtime.simulation.openrouter_completion", mock_llm)

    cfg = make_config(max_turns=8)
    cfg.speaker_rules.mode = "alternating"
    # Give Gamma and Delta opposing stances so they get turns in alternating mode
    cfg.stakeholders[2].stance = "champion"
    cfg.stakeholders[3].stance = "detractor"
    events: list[dict] = []
    async for event in run_simulation(cfg, simulation_id="test-all-speak"):
        events.append(event)

    speakers = {e.get("agent_id") for e in events if e.get("type") == "turn"}

    for s in cfg.stakeholders:
        assert s.id in speakers, f"Agent {s.name} ({s.id}) never spoke"


@pytest.mark.asyncio
async def test_scheduler_moderator_led(monkeypatch):
    monkeypatch.setattr("app.runtime.simulation.openrouter_completion", mock_llm)

    cfg = make_config(max_turns=4)
    cfg.speaker_rules.mode = "moderator_led"
    cfg.stakeholders[2].stance = "moderator"  # Gamma is moderator

    events: list[dict] = []
    async for event in run_simulation(cfg, simulation_id="test-moderator"):
        events.append(event)

    done_events = [e for e in events if e.get("type") == "done"]
    assert len(done_events) == 1
