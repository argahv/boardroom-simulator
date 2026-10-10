"""End-to-end behavioral flow: one run exercises every layer of the engine.

A scripted LLM drives four agents through challenges, compromises, coalition
signals, votes and a walkaway, and the tests check that each layer reacts:
bidding → social physics → relationships/coalitions → emotions → goals/plans
→ memory → private thought → environment pressure → termination.
"""

from __future__ import annotations

import json

import pytest

from app.models import (
    ActionSpace, AgentConfig, PersonalityProfile, SimulationConfig, SpeakerRules,
    Subject, TimeoutCondition, VoteCondition,
)
from app.runtime.context import build_context
from app.runtime.simulation import run_simulation

SCRIPTS: dict[str, list[dict]] = {
    "alice": [
        {"content": "Bob, your cost numbers are wrong and you know it. We will never accept another delay.",
         "action_type": "challenge", "directed_at": "Bob",
         "internal_reasoning": "Bob is the main obstacle; pressure him."},
    ],
    "bob": [
        {"content": "Alice, I'm willing to phase the rollout if we cap the budget.",
         "action_type": "compromise", "directed_at": "Alice",
         "internal_reasoning": "A phased plan protects my budget."},
        {"content": "Carol, you and I want the same safeguards — let's align on them.",
         "action_type": "coalition_signal", "directed_at": "Carol",
         "internal_reasoning": "Carol is persuadable."},
    ],
    "carol": [
        {"content": "Alice, what evidence supports the timeline?", "action_type": "question",
         "directed_at": "alice", "internal_reasoning": "Need data first."},
        {"content": "Bob, I agree — safeguards first.", "action_type": "coalition_signal",
         "directed_at": "Bob", "internal_reasoning": "Bob's plan is safer."},
    ],
    "dave": [
        {"content": "This is a farce, Alice. I'm escalating this to the board.", "action_type": "escalate",
         "directed_at": "Alice", "internal_reasoning": "Shake things up."},
    ],
}


def _make_llm(scripts: dict[str, list[dict]]):
    counters: dict[str, int] = {}

    async def llm(messages, temperature=0.6, simulation_id=None, turn_index=None, agent_id=None):
        last = messages[-1]["content"] if messages else ""
        if "Return ONLY a number" in last:
            return "70", True, {}
        script = scripts.get(agent_id or "", [{"content": "Noted.", "action_type": "statement"}])
        i = counters.get(agent_id, 0)
        counters[agent_id] = i + 1
        return json.dumps(script[i % len(script)]), True, {}

    return llm


def _config(**overrides) -> SimulationConfig:
    base = dict(
        subject=Subject(name="Platform Migration", description="Move to the new platform this quarter"),
        stakeholders=[
            AgentConfig(id="alice", name="Alice", role="CTO", stance="champion", archetype="agitator",
                        hidden_agenda="Wants the migration on her résumé",
                        personality=PersonalityProfile(aggressiveness=80)),
            AgentConfig(id="bob", name="Bob", role="CFO", stance="detractor", archetype="diplomat",
                        personality=PersonalityProfile(empathy=70)),
            AgentConfig(id="carol", name="Carol", role="COO", stance="neutral"),
            AgentConfig(id="dave", name="Dave", role="Board liaison", stance="wildcard"),
        ],
        action_space=ActionSpace(),
        speaker_rules=SpeakerRules(mode="weighed_random"),
        end_condition=TimeoutCondition(max_normal_turns=12),
        env_flags={"hidden_motives": True, "time_pressure": True, "external_leaks": True, "deadlock_risk": True},
        scenario_type="partnership",
    )
    base.update(overrides)
    return SimulationConfig(**base)


async def _run(cfg: SimulationConfig, scripts=SCRIPTS, sim_id: str = "flow-test"):
    ctx = build_context(cfg, sim_id)
    events = []
    async for event in run_simulation(cfg, sim_id, context=ctx, llm=_make_llm(scripts)):
        events.append(event)
    return ctx, events


@pytest.mark.asyncio
async def test_full_behavioral_flow():
    cfg = _config()
    ctx, events = await _run(cfg)

    done = [e for e in events if e.get("type") == "done"]
    assert len(done) == 1
    turns = [e for e in events if e.get("type") == "turn"]
    assert len(turns) == 12

    # Procedural layer: real bidding rounds with several bidders each turn
    floor_events = [e for e in events if e.get("granted_to")]
    assert floor_events and all(len(e.get("bids", {})) >= 2 for e in floor_events)
    assert all(a["agent_id"] != b["agent_id"] for a, b in zip(turns, turns[1:])), "no one speaks twice in a row"
    assert {t["agent_id"] for t in turns} == {"alice", "bob", "carol", "dave"}

    # Turns are addressed to real people
    for t in turns:
        if t["action_type"] in ("challenge", "compromise", "coalition_signal", "question", "escalate"):
            assert t["directed_at"] in {"alice", "bob", "carol", "dave"}
            assert t["directed_at"] != t["agent_id"]

    snapshots = [e for e in events if e.get("type") == "state_snapshot" and not e.get("initial")]
    assert len(snapshots) == 12
    assert [e for e in events if e.get("initial")], "an initial snapshot precedes the first turn"
    final = snapshots[-1]["data"]

    # Relationship layer: challenges breed rivalry, compromise/coalition build trust
    matrix = final["relationship_matrix"]
    assert matrix["bob"]["alice"]["rivalry"] > 0.2
    assert matrix["bob"]["carol"]["trust"] > 0.5
    assert final["coalitions"], "coalition signals between Bob and Carol should form a coalition"

    # Cognitive layer: being challenged/escalated at makes Alice/Bob angrier than baseline
    scenario_anger = 0.15  # partnership profile
    assert final["agent_states"]["bob"]["emotion"]["anger"] > scenario_anger
    assert final["archetypes"] == {"alice": "agitator", "bob": "diplomat"}

    # Strategic layer: plans exist and the actions taken advance subgoals
    plans = ctx.plans
    completed = [sg for pid in plans._plans for sg in plans._plans[pid].subgoals if sg.status == "completed"]
    assert completed, "taking actions should complete plan subgoals"
    assert final["agent_goals"]["alice"], "agents carry goals"
    assert any(g["source"] == "hidden" for g in final["agent_goals"]["alice"])

    # Memory + private thought
    assert final["memory"]["alice"]["red_lines"], "'never accept' is remembered as a red line"
    assert final["memory"]["bob"]["concessions"]
    assert ctx.thoughts.get_private("bob"), "internal reasoning is kept as private thought"

    # Environment: external event + time pressure announced
    subtypes = {e.get("subtype") for e in events if e.get("type") == "system"}
    assert "external_event" in subtypes
    assert "time_pressure" in subtypes
    assert 0.0 <= final["deadlock_risk"] <= 1.0


@pytest.mark.asyncio
async def test_prompt_carries_every_layer():
    from app.runtime.agent import AgentRuntime

    cfg = _config()
    ctx, _ = await _run(cfg, sim_id="prompt-test")
    ctx.space._running = True  # reuse the finished room to build a prompt
    ctx.space.current_speaker = None
    agent = AgentRuntime(config=cfg.stakeholders[0], space=ctx.space, llm=None,
                         system_prompt_template="", simulation_id="prompt-test", context=ctx)
    agent.memory = list(ctx.space.events)
    messages = await agent._build_turn_prompt()
    system = messages[0]["content"]
    assert "Hidden agenda: Wants the migration" in system
    assert "agitator" in system
    assert "Your current priorities" in system
    assert "Active plan:" in system
    assert "## Your Memory" in system
    assert "emotional state" in system.lower()
    assert any("[ROOM EVENT]" in m["content"] for m in messages[1:-1])
    assert '"directed_at"' in messages[-1]["content"]


@pytest.mark.asyncio
async def test_hidden_motives_flag_off_hides_agenda():
    from app.runtime.agent import AgentRuntime

    cfg = _config(env_flags={"hidden_motives": False})
    ctx = build_context(cfg, "hidden-off")
    agent = AgentRuntime(config=cfg.stakeholders[0], space=ctx.space, llm=None,
                         system_prompt_template="", simulation_id="hidden-off", context=ctx)
    system = await agent._build_system_prompt()
    assert "résumé" not in system


@pytest.mark.asyncio
async def test_walkaway_ends_negotiation():
    scripts = {
        "alice": [{"content": "Final offer.", "action_type": "statement"}],
        "bob": [{"content": "I'm done. I'm walking out.", "action_type": "walkaway"}],
    }
    cfg = _config(
        stakeholders=[
            AgentConfig(id="alice", name="Alice", role="CTO", stance="champion"),
            AgentConfig(id="bob", name="Bob", role="CFO", stance="detractor"),
        ],
        speaker_rules=SpeakerRules(mode="alternating"),
        env_flags={},
    )
    ctx, events = await _run(cfg, scripts=scripts, sim_id="walkaway-test")
    done = [e for e in events if e.get("type") == "done"][0]
    assert done["outcome_type"] == "walkaway"
    assert done["walkaway_party"] == "bob"
    assert "bob" in ctx.space.departed
    # Bob never speaks again after walking out
    bob_turns = [e for e in events if e.get("type") == "turn" and e.get("agent_id") == "bob"]
    assert len(bob_turns) == 1


@pytest.mark.asyncio
async def test_vote_settles_the_decision():
    scripts = {
        "alice": [{"content": "I vote yes.", "action_type": "vote", "vote": "yes"}],
        "bob": [{"content": "Fine — yes from me, with the budget cap.", "action_type": "vote", "vote": "yes"}],
        "carol": [{"content": "I know there are risks, but yes.", "action_type": "vote", "vote": "yes"}],
    }
    cfg = _config(
        stakeholders=[
            AgentConfig(id="alice", name="Alice", role="CTO", stance="champion"),
            AgentConfig(id="bob", name="Bob", role="CFO", stance="detractor"),
            AgentConfig(id="carol", name="Carol", role="COO", stance="neutral"),
        ],
        speaker_rules=SpeakerRules(mode="freeform"),
        end_condition=VoteCondition(voters=["alice", "bob", "carol"], threshold=0.6, max_turns=10),
        env_flags={},
    )
    _, events = await _run(cfg, scripts=scripts, sim_id="vote-test")
    done = [e for e in events if e.get("type") == "done"][0]
    assert done["reason"] == "vote_majority"
    assert done["outcome_type"] == "agreement"
    assert done["vote_breakdown"]["for"] >= 2


@pytest.mark.asyncio
async def test_human_injection_reaches_the_room():
    cfg = _config(env_flags={}, end_condition=TimeoutCondition(max_normal_turns=3))
    ctx = build_context(cfg, "inject-test")
    await ctx.space.inject_turn("Carol", "Alice, I flatly reject this plan.", agent_id="carol",
                                action_type="challenge", directed_at="alice")
    events = []
    async for event in run_simulation(cfg, "inject-test", context=ctx, llm=_make_llm(SCRIPTS)):
        events.append(event)
    assert ctx.memory.get_summary("carol")["positions"] or ctx.memory.get_recent("carol")
    matrix = ctx.behavior_engine.get_public_state()["relationship_matrix"]
    assert matrix["carol"]["alice"]["rivalry"] > 0.2
