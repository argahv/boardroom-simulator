"""How a meeting reaches (or fails to reach) a decision, and how pressure shapes goals.

Covers the end conditions (vote tally and roll call, walkouts, explicit
agreement, consensus counting), the goal layer's reaction to pressure, and the
prompt cues that make these reachable for a real model. No DB, no API key.
"""

from __future__ import annotations

import pytest

from app.models import (
    ActionSpace, AgentConfig, ConsensusCondition, PersonalityProfile, SimulationConfig,
    SpeakerRules, Subject, TimeoutCondition, VoteCondition,
)
from app.runtime.context import allowed_actions, build_context, voters_of
from app.runtime.goal_evolution import GoalEvolution
from app.runtime.scheduler import (
    ExplicitAgreementChecker, Scheduler, SocialPhysicsChecker, TerminationContext, VoteChecker,
    WalkawayChecker,
)
from app.runtime.space import SharedSpace
from app.runtime.strategic_plan import PlanManager


def _cfg(end=None, stakeholders=None, **kw) -> SimulationConfig:
    return SimulationConfig(
        subject=Subject(name="Office Move", description="Move headquarters to the city centre"),
        stakeholders=stakeholders or [
            AgentConfig(id="a", name="Ann", role="CEO", stance="champion", archetype="agitator"),
            AgentConfig(id="b", name="Ben", role="CFO", stance="detractor"),
            AgentConfig(id="c", name="Cy", role="COO", stance="neutral"),
            AgentConfig(id="m", name="Mo", role="Chair", stance="moderator"),
        ],
        action_space=ActionSpace(),
        speaker_rules=SpeakerRules(mode="weighed_random"),
        end_condition=end or TimeoutCondition(max_normal_turns=12),
        **kw,
    )


def _space(cfg, turns) -> SharedSpace:
    space = SharedSpace(cfg)
    for i, (agent, action, extra) in enumerate(turns):
        space.events.append({"type": "turn", "_index": i, "agent_id": agent, "action_type": action,
                             "content": f"{agent} {action}", **extra})
    return space


def _ctx(cfg, space, turn=6) -> TerminationContext:
    return TerminationContext(config=cfg, space=space, turn_count=turn)


# ── votes ─────────────────────────────────────────────────────────────

VOTE = VoteCondition(voters=["a", "b", "c"], threshold=0.75, max_turns=12)


@pytest.mark.asyncio
async def test_completed_vote_short_of_threshold_fails():
    cfg = _cfg(VOTE)
    space = _space(cfg, [("a", "vote", {"vote": "yes"}), ("b", "vote", {"vote": "no"}),
                         ("c", "vote", {"vote": "yes"})])
    r = await VoteChecker(VOTE).check(_ctx(cfg, space))
    assert r.outcome_type == "rejected" and r.reason == "vote_majority"
    assert r.vote_breakdown == {"for": 2, "against": 1, "abstain": 0}


@pytest.mark.asyncio
async def test_vote_closes_early_once_majority_is_out_of_reach():
    cfg = _cfg(VOTE)
    space = _space(cfg, [("b", "vote", {"vote": "no"})])
    r = await VoteChecker(VOTE).check(_ctx(cfg, space))
    assert r is not None and r.outcome_type == "rejected"  # 3 of 3 yes now impossible


@pytest.mark.asyncio
async def test_incomplete_vote_at_the_cap_reports_what_was_cast():
    cfg = _cfg(VoteCondition(voters=["a", "b", "c"], threshold=0.5, max_turns=12))
    space = _space(cfg, [("a", "vote", {"vote": "yes"})])
    checker = VoteChecker(cfg.end_condition)
    assert await checker.check(_ctx(cfg, space, turn=6)) is None
    r = await checker.check(_ctx(cfg, space, turn=12))
    assert r.reason == "vote_incomplete" and r.outcome_type == "no_decision"
    assert r.vote_breakdown["for"] == 1


@pytest.mark.asyncio
async def test_departed_voters_leave_the_denominator():
    cfg = _cfg(VoteCondition(voters=["a", "b", "c"], threshold=0.6, max_turns=12))
    space = _space(cfg, [("a", "vote", {"vote": "yes"}), ("c", "vote", {"vote": "yes"})])
    space.departed.add("b")
    r = await VoteChecker(cfg.end_condition).check(_ctx(cfg, space))
    assert r.outcome_type == "agreement"


def test_threshold_accepts_percentages():
    assert VoteCondition(voters=["a"], threshold=60).threshold == pytest.approx(0.6)
    assert VoteCondition(voters=["a"], threshold=0.75).threshold == 0.75
    with pytest.raises(ValueError):
        VoteCondition(voters=["a"], threshold=150)


def test_vote_is_offered_only_when_something_tallies_it():
    assert "vote" not in allowed_actions(_cfg())
    assert "vote" in allowed_actions(_cfg(VOTE))
    assert "agreement" in allowed_actions(_cfg())


def test_voters_default_to_principals():
    cfg = _cfg(VoteCondition(voters=[], threshold=0.5))
    assert voters_of(cfg) == ["a", "b", "c"]


def test_roll_call_asks_each_voter_then_holdouts_once_more():
    cfg = _cfg(VOTE)
    ctx = build_context(cfg, "roll-call")
    sched = Scheduler(cfg, ctx.space, "roll-call", context=ctx)
    sched._vote_called = True
    sched._last_speaker = "a"
    asked = [sched._next_roll_call()]
    sched._last_speaker = asked[-1]
    asked.append(sched._next_roll_call())
    sched._last_speaker = asked[-1]
    asked.append(sched._next_roll_call())
    assert asked == ["b", "a", "c"], "everyone once, in order, never the last speaker"
    ctx.space.events.append({"type": "turn", "agent_id": "b", "action_type": "vote", "vote": "no"})
    sched._last_speaker = "a"
    second = [sched._next_roll_call()]
    sched._last_speaker = second[-1]
    second.append(sched._next_roll_call())
    assert second == ["c", "a"], "holdouts are asked a second time; voters are not"
    sched._last_speaker = "a"
    assert sched._next_roll_call() is None, "two asks at most"


# ── walkouts ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_walkout_ends_a_deal_even_with_a_moderator_left():
    cfg = _cfg(stakeholders=[
        AgentConfig(id="buyer", name="Grant", stance="champion"),
        AgentConfig(id="seller", name="Iris", stance="detractor"),
        AgentConfig(id="banker", name="Paul", stance="moderator"),
    ])
    space = _space(cfg, [("buyer", "walkaway", {})])
    space.departed.add("buyer")
    r = await WalkawayChecker().check(_ctx(cfg, space))
    assert r.outcome_type == "walkaway" and r.walkaway_party == "buyer"


@pytest.mark.asyncio
async def test_walkout_by_one_of_several_on_a_side_keeps_the_room_going():
    cfg = _cfg(stakeholders=[
        AgentConfig(id="a1", name="A1", stance="champion"), AgentConfig(id="a2", name="A2", stance="champion"),
        AgentConfig(id="b1", name="B1", stance="detractor"), AgentConfig(id="b2", name="B2", stance="detractor"),
    ])
    space = _space(cfg, [("b1", "walkaway", {})])
    space.departed.add("b1")
    assert await WalkawayChecker().check(_ctx(cfg, space)) is None
    space.departed.add("b2")
    assert (await WalkawayChecker().check(_ctx(cfg, space))).outcome_type == "walkaway"


# ── explicit agreement ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_everyone_accepting_the_offer_on_the_table_is_an_agreement():
    cfg = _cfg()
    space = _space(cfg, [("a", "challenge", {}), ("b", "compromise", {"content": "Phase it over two years."}),
                         ("c", "agreement", {}), ("m", "question", {}), ("a", "agreement", {})])
    r = await ExplicitAgreementChecker().check(_ctx(cfg, space))
    assert r.outcome_type == "agreement" and r.agreed_issues[0]["proposed_by"] == "b"


@pytest.mark.asyncio
async def test_no_agreement_while_a_party_still_objects_or_the_offer_changed():
    cfg = _cfg()
    objecting = _space(cfg, [("b", "compromise", {}), ("c", "agreement", {}), ("a", "agreement", {}),
                             ("a", "challenge", {})])
    assert await ExplicitAgreementChecker().check(_ctx(cfg, objecting)) is None
    new_offer = _space(cfg, [("b", "compromise", {}), ("c", "agreement", {}), ("a", "compromise", {})])
    assert await ExplicitAgreementChecker().check(_ctx(cfg, new_offer)) is None
    mood_only = _space(cfg, [("a", "statement", {}), ("b", "coalition_signal", {}), ("c", "question", {})])
    assert await ExplicitAgreementChecker().check(_ctx(cfg, mood_only)) is None


class _WarmRoom:
    def get_public_state(self):
        return {"social_physics": {a: {"trust": 0.9, "tension": 0.05} for a in "abc"}}


@pytest.mark.asyncio
async def test_consensus_needs_explicit_acts_and_counts_each_turn_once():
    cfg = _cfg(ConsensusCondition(max_turns=30))
    checker = SocialPhysicsChecker(cfg.end_condition)
    space = _space(cfg, [("a", "statement", {}), ("b", "question", {}), ("c", "statement", {})])
    ctx = TerminationContext(config=cfg, space=space, turn_count=5, behavior_engine=_WarmRoom())
    for turn in (5, 5, 6, 6, 7, 7):  # checked before and after each turn
        ctx.turn_count = turn
        assert await checker.check(ctx) is None, "a warm room alone is not a deal"
    assert checker._consecutive_agreement == 3
    space.events.extend({"type": "turn", "agent_id": a, "action_type": act}
                        for a, act in (("a", "compromise"), ("b", "agreement"), ("c", "agreement")))
    ctx.turn_count = 8
    assert (await checker.check(ctx)).outcome_type == "agreement"


# ── goals under pressure ─────────────────────────────────────────────

def test_an_attacker_is_not_told_to_deescalate_its_own_attack():
    goals = GoalEvolution(plan_manager=PlanManager())
    goals.update_priorities("agi", ["escalation_risk", "trust_collapse"], received_pressure=False)
    assert not goals.get_active_goals("agi")
    goals.update_priorities("dip", ["escalation_risk"], received_pressure=True)
    assert [g.goal_text for g in goals.get_active_goals("dip")] == ["deescalate"]


def test_pressure_goals_and_their_tactics_expire_when_the_pressure_passes():
    plans = PlanManager()
    goals = GoalEvolution(plan_manager=plans)
    plans.create_plan("x", "block the move", source="initial")
    goals.add_goal("x", "block the move", 3.0)
    goals.decay_all(1)
    goals.update_priorities("x", ["credibility_crisis"], received_pressure=True)
    assert goals.get_active_goals("x", 1)[0].goal_text == "defend_position"
    for turn in (2, 3):  # still felt: reinforced
        goals.decay_all(turn)
        goals.update_priorities("x", ["credibility_crisis"])
    for turn in range(4, 8):  # gone
        goals.decay_all(turn)
        goals.update_priorities("x", [])
    assert [g.goal_text for g in goals.get_active_goals("x")] == ["block the move"]
    assert [p.goal_text for p in plans.get_active_plans("x")] == ["block the move"]


def test_stance_plan_survives_the_plan_cap():
    plans = PlanManager()
    plans.create_plan("x", "win support", source="initial")
    plans.create_plan("x", "deescalate", source="pressure")
    plans.create_plan("x", "defend_position", source="pressure")
    core, tactic = plans.core_and_tactic("x")
    assert core.goal_text == "win support" and tactic.goal_text == "defend_position"
    summary = plans.get_plan_summary("x")
    assert summary.startswith("Active plan: win support") and "Tactical adjustment: defend position" in summary
    assert "progress" not in summary


# ── prompt cues ───────────────────────────────────────────────────────

async def _prompt(cfg, agent_id="a", memory=None, turn=0):
    from app.runtime.agent import AgentRuntime
    ctx = build_context(cfg, "prompt")
    ctx.turn_count = turn
    agent = AgentRuntime(config=next(s for s in cfg.stakeholders if s.id == agent_id), space=ctx.space,
                         llm=None, system_prompt_template="", simulation_id="prompt", context=ctx)
    agent.memory = memory or []
    return await agent._build_turn_prompt()


@pytest.mark.asyncio
async def test_prompt_has_no_placeholders_and_defines_every_action():
    messages = await _prompt(_cfg())
    system, last = messages[0]["content"], messages[-1]["content"]
    assert "None" not in system and "(none)" not in system and "confidence" not in system
    assert "You are an agitator" in system
    for action in allowed_actions(_cfg()):
        assert f"- {action}:" in last
    assert '"vote"' not in last, "no vote field where nothing tallies votes"
    assert "NEW point" not in last and "About 12 turns are left" in last


@pytest.mark.asyncio
async def test_roll_call_puts_the_vote_request_last():
    cfg = _cfg(VoteCondition(voters=["a", "b", "c"], threshold=0.75, max_turns=12))
    memory = [{"type": "system", "subtype": "vote_called", "content": "The chair calls the vote."},
              {"type": "system", "subtype": "roll_call", "target_agent": "a", "content": "The chair asks Ann."}]
    messages = await _prompt(cfg, memory=memory, turn=8)
    last = messages[-1]["content"]
    assert last.rstrip().endswith("The no-repetition rule does not apply to your vote.")
    assert "THE CHAIR IS ASKING FOR YOUR VOTE NOW" in last and "0 of 3 have voted" in last
    assert any("[ROOM EVENT] The chair asks Ann." == m["content"] for m in messages)


def test_tracing_hooks_are_inert_for_plain_callables():
    from app.llm import trace_kwargs, traced_span, under_run

    async def stub(*a, **k):
        return "", False, {}
    assert trace_kwargs(stub, "speak · Ann") == {}
    with traced_span("x") as run, under_run(None):
        assert run is None or hasattr(run, "add_outputs")
