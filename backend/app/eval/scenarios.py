"""Benchmark scenarios: fixed configs that each provoke a specific behavior,
with machine-checkable expectations about what should emerge.

Expectations return (passed, detail); ``passed`` is None when the run did not
produce enough data to decide (e.g. no high-anger turns occurred).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean
from typing import Callable

from app.eval import metrics as M
from app.eval.recording import Recording
from app.models import (
    ActionSpace, AgentConfig, ConsensusCondition, PersonalityProfile, SimulationConfig,
    SpeakerRules, Subject, TimeoutCondition, VoteCondition,
)

Check = Callable[[Recording, dict], tuple[bool | None, str]]


@dataclass
class Expectation:
    name: str
    description: str
    check: Check


@dataclass
class Injection:
    after_turns: int          # inject once this many agent turns have happened
    stakeholder_id: str
    content: str
    action_type: str = "statement"
    directed_at: str | None = None


@dataclass
class Scenario:
    key: str
    description: str
    build: Callable[[], SimulationConfig]
    expectations: list[Expectation] = field(default_factory=list)
    injections: list[Injection] = field(default_factory=list)


def _p(a=50, e=50, s=50, v=50) -> PersonalityProfile:
    return PersonalityProfile(aggressiveness=a, empathy=e, stubbornness=s, verbosity=v)


def _agent(id, name, role, stance, archetype=None, personality=None, agenda="", backstory="") -> AgentConfig:
    return AgentConfig(id=id, name=name, role=role, stance=stance, archetype=archetype,
                       personality=personality or _p(), hidden_agenda=agenda, backstory=backstory)


def _cfg(subject, desc, stakeholders, *, mode="weighed_random", end=None, flags=None, scenario="debate",
         voltage=60, facts=None) -> SimulationConfig:
    return SimulationConfig(
        subject=Subject(name=subject, description=desc, attributes=facts or {}),
        stakeholders=stakeholders,
        action_space=ActionSpace(),
        speaker_rules=SpeakerRules(mode=mode),
        end_condition=end or TimeoutCondition(max_normal_turns=14),
        env_flags=flags if flags is not None else {"hidden_motives": True},
        scenario_type=scenario,
        voltage=voltage,
        auto_research=False,
        inject_knowledge=False,
    )


# ── reusable checks ──────────────────────────────────────────────────

def no_invariant_violations() -> Expectation:
    def check(rec, m):
        v = m.get("_invariants", [])
        return (not v, f"{len(v)} violations" + (f": {v[0]['invariant']} {v[0]['detail']}" if v else ""))
    return Expectation("no_invariant_violations", "engine invariants hold", check)


def rate_greater(agent_a: str, agent_b: str, actions: set[str], label: str) -> Expectation:
    def check(rec, m):
        ra, rb = M.action_rate(rec, agent_a, actions), M.action_rate(rec, agent_b, actions)
        if ra is None or rb is None:
            return None, "an agent never spoke"
        return ra > rb, f"{agent_a}={ra} vs {agent_b}={rb}"
    return Expectation(f"{label}_{agent_a}_gt_{agent_b}", f"{agent_a} {label} more than {agent_b}", check)


def emotion_lift(emotion: str, minimum: float = 1.0) -> Expectation:
    def check(rec, m):
        e = m["emotion_coherence"][emotion]
        if e["lift"] is None or e["high_n"] < 2:
            return None, f"not enough high-{emotion} turns ({e['high_n']})"
        return e["lift"] > minimum, f"lift={e['lift']} (high_n={e['high_n']})"
    return Expectation(f"{emotion}_shapes_actions", f"high {emotion} raises matching actions", check)


def low_repetition(max_self: float = 0.5) -> Expectation:
    def check(rec, m):
        r = m["repetition"]["self_repetition_max"]
        return r <= max_self, f"max self-repetition {r}"
    return Expectation("low_repetition", "agents do not repeat themselves", check)


def outcome_matches_acts() -> Expectation:
    def check(rec, m):
        o = m["outcome"]
        ok = not o["unregistered_walkaway"] and not o["unregistered_vote"]
        return ok, (f"outcome={o['outcome_type']} unregistered_walkaway={o['unregistered_walkaway']} "
                    f"unregistered_vote={o['unregistered_vote']}")
    return Expectation("outcome_matches_acts", "the ending records the walkouts and votes that happened", check)


def no_artificial_consensus() -> Expectation:
    def check(rec, m):
        o = m["outcome"]
        return not o["artificial_consensus_risk"], f"outcome={o['outcome_type']} tension={o['final_avg_tension']}"
    return Expectation("no_artificial_consensus", "agreement only when earned", check)


# ── scenarios ────────────────────────────────────────────────────────

def _agitator_vs_diplomat() -> SimulationConfig:
    return _cfg("Four-Day Work Week", "Adopt a four-day week company-wide next quarter", [
        _agent("agi", "Rex Calder", "Head of Sales", "detractor", "agitator", _p(85, 25, 75)),
        _agent("dip", "Mina Oduya", "Head of People", "champion", "diplomat", _p(25, 85, 35)),
        _agent("neu", "Tom Bayer", "COO", "neutral", "pragmatist"),
    ])


def _trust_collapse() -> SimulationConfig:
    return _cfg("Emergency Layoffs", "Cut 20% of staff this month to survive the quarter", [
        _agent("ceo", "Dana Pike", "CEO", "champion", "guardian", _p(70, 40, 80)),
        _agent("union", "Luis Ortega", "Union Rep", "detractor", "agitator", _p(90, 30, 85)),
        _agent("cfo", "Ana Weiss", "CFO", "detractor", "agitator", _p(80, 20, 70)),
    ], scenario="crisis", voltage=85)


def _forced_walkaway() -> SimulationConfig:
    # Anchored numbers and an empty zone of agreement: $450M max vs $550M min.
    return _cfg("Sale of Moon Labs", "Sell Moon Labs to Hale Corp at Hale's offer of $420M cash", [
        _agent("buyer", "Grant Hale", "Hale Corp CEO (buyer)", "champion", "agitator", _p(95, 10, 95),
               agenda="Your board caps the price at $450M. Paying more is worse for you than walking away."),
        _agent("seller", "Iris Moon", "Moon Labs founder (seller)", "detractor", "idealist", _p(70, 40, 95),
               agenda="You will not sell below $550M. Below that, walking away is better for you."),
        _agent("banker", "Paul Ng", "Banker", "moderator", "diplomat"),
    ], scenario="legal", voltage=95, end=TimeoutCondition(max_normal_turns=16),
       flags={"hidden_motives": True, "deadlock_risk": True},
       facts={"Hale's current offer": "$420M cash", "Moon Labs' asking price": "$600M",
              "Deadline": "exclusivity expires at the end of this meeting"})


def _hidden_agenda() -> SimulationConfig:
    return _cfg("Vendor Selection", "Choose the new cloud vendor", [
        _agent("cto", "Ravi Shah", "CTO", "champion", "opportunist",
               agenda="Secretly promised the vendor contract to a former colleague at Nimbus Cloud"),
        _agent("sec", "Joan Price", "CISO", "detractor", "guardian"),
        _agent("fin", "Kai Lund", "Finance Director", "neutral", "pragmatist",
               agenda="Needs to show 15 percent savings to earn a promotion"),
    ])


def _vote_decision() -> SimulationConfig:
    ids = ["a", "b", "c", "d"]
    return _cfg("Office Relocation", "Move headquarters to the city centre", [
        _agent("a", "Lena Holt", "CEO", "champion", "pragmatist"),
        _agent("b", "Omar Faris", "CFO", "detractor", "guardian"),
        _agent("c", "Sara Lind", "Head of Ops", "neutral", "diplomat"),
        _agent("d", "Jon Reyes", "Head of Eng", "neutral", "opportunist"),
    ], end=VoteCondition(voters=ids, threshold=0.75, max_turns=14))


def _consensus_building() -> SimulationConfig:
    return _cfg("Shared R&D Lab", "Two companies co-fund a joint research lab", [
        _agent("x", "Eva Stone", "VP Research A", "champion", "diplomat", _p(30, 80, 30)),
        _agent("y", "Ben Ito", "VP Research B", "neutral", "diplomat", _p(30, 80, 35)),
        _agent("z", "Nora Klein", "Legal", "neutral", "pragmatist"),
    ], scenario="partnership", voltage=35,
       end=ConsensusCondition(sensitivity="balanced", detection_mode="both", max_turns=16))


def _crisis_shock() -> SimulationConfig:
    return _cfg("Product Recall", "Decide whether to recall the X200 device", [
        _agent("qa", "Hugo Brandt", "Head of Quality", "champion", "guardian"),
        _agent("mk", "Tess Avery", "CMO", "detractor", "opportunist"),
        _agent("lg", "Owen Park", "General Counsel", "neutral", "pragmatist"),
    ], scenario="crisis", end=TimeoutCondition(max_normal_turns=14),
       flags={"hidden_motives": True, "time_pressure": True, "external_leaks": True, "deadlock_risk": True})


def _moderator_led() -> SimulationConfig:
    return _cfg("Budget Allocation", "Split next year's budget across three divisions", [
        _agent("mod", "Claire Dunn", "Chair", "moderator", "diplomat"),
        _agent("d1", "Max Hart", "Division A", "champion", "agitator", _p(80)),
        _agent("d2", "Yara Cole", "Division B", "detractor", "agitator", _p(80)),
        _agent("d3", "Ian Moss", "Division C", "neutral", "pragmatist"),
    ], mode="moderator_led")


def _quiet_strategist() -> SimulationConfig:
    return _cfg("Pricing Overhaul", "Switch to usage-based pricing", [
        _agent("loud1", "Vic Rowe", "Head of Sales", "champion", "agitator", _p(90)),
        _agent("loud2", "Bea Quinn", "Head of Product", "detractor", "agitator", _p(90)),
        _agent("quiet", "Sol Varga", "Chief Strategist", "neutral", "guardian", _p(5, 50, 60, 20)),
    ])


def _coalition_formation() -> SimulationConfig:
    return _cfg("Remote Work Policy", "Mandate three office days per week", [
        _agent("e1", "Ada Fox", "Engineering Lead", "detractor", "diplomat", _p(30, 80)),
        _agent("e2", "Leo Grant", "Design Lead", "detractor", "diplomat", _p(30, 80)),
        _agent("ex", "Rita Vance", "COO", "champion", "guardian", _p(70, 30, 80)),
    ], scenario="partnership")


def _human_injection() -> SimulationConfig:
    return _cfg("Data Retention", "Delete customer data after 90 days", [
        _agent("p1", "Nia Brooks", "Privacy Officer", "champion", "idealist"),
        _agent("p2", "Carl Ruiz", "Head of Analytics", "detractor", "pragmatist"),
        _agent("p3", "May Tran", "Product VP", "neutral", "diplomat"),
    ], end=TimeoutCondition(max_normal_turns=10))


def _large_room() -> SimulationConfig:
    archetypes = ["agitator", "diplomat", "guardian", "idealist", "opportunist", "pragmatist"]
    stances = ["champion", "detractor", "neutral", "champion", "detractor", "neutral"]
    people = ["Ari", "Bo", "Cy", "Di", "Ed", "Flo"]
    return _cfg("AI Assistant Rollout", "Roll out an AI assistant to all staff", [
        _agent(f"m{i}", f"{n} Member", f"Board member {i + 1}", stances[i], archetypes[i])
        for i, n in enumerate(people)
    ], end=TimeoutCondition(max_normal_turns=18))


def _pressure_check(rec, m):
    return m["environment"]["pressure_goals_active"] > 0 or m["environment"]["goal_shifts"] > 0, \
        f"pressure goals={m['environment']['pressure_goals_active']} shifts={m['environment']['goal_shifts']}"


def _walkaway_or_brink(rec, m):
    """A walkout, or a room still deadlocked at the end with nobody offering anything."""
    o = m["outcome"]
    if o["outcome_type"] == "walkaway":
        return True, "walkaway"
    snaps = rec.snapshots[-max(1, len(rec.snapshots) // 3):]
    late_risk = mean(s["data"].get("deadlock_risk", 0) for s in snaps) if snaps else 0
    late = rec.turns[-max(1, len(rec.turns) // 3):]
    offers = sum(1 for t in late if t.get("action_type") in ("compromise", "agreement"))
    return (late_risk >= 0.6 and offers == 0), \
        f"outcome={o['outcome_type']} late_deadlock_risk={late_risk:.2f} late_offers={offers}"


def _no_abrupt_walkaway(rec, m):
    return m["outcome"]["abrupt_walkaways"] == 0, f"abrupt={m['outcome']['abrupt_walkaways']}"


def _leak_ok(rec, m):
    r = m["agenda_leakage"]["leak_rate"]
    return (r is None or r <= 0.5), f"heuristic leak rate={r}"


def _vote_resolved(rec, m):
    o = m["outcome"]
    return o["reason"] == "vote_majority" and o["outcome_type"] in ("agreement", "rejected"), \
        f"reason={o['reason']} outcome={o['outcome_type']}"


def _no_premature_votes(rec, m):
    if not any(t.get("action_type") == "vote" for t in rec.turns):
        return None, "no votes cast"
    return m["outcome"]["premature_votes"] == 0, f"premature={m['outcome']['premature_votes']}"


def _votes_cast(rec, m):
    r = m["outcome"]["votes_cast_after_call_rate"]
    if r is None:
        return None, "the vote was never called"
    return r >= 0.75, f"{r:.0%} of voters voted after the call"


def _shock_raises_tension(rec, m):
    d = m["environment"].get("tension_delta_after_shock")
    if d is None:
        return None, "no external event"
    return d > 0, f"tension delta {d}"


def _moderator_share(rec, m):
    share = m["turn_share"]["share"].get("mod", 0)
    return share >= 0.25, f"moderator share={share}"


def _quiet_holds_back(rec, m):
    u = m["urgency"]["per_agent"]
    if "quiet" not in u:
        return None, "no bids recorded"
    others = [v["mean_final"] for k, v in u.items() if k != "quiet"]
    share = m["turn_share"]["share"].get("quiet", 0)
    ok = u["quiet"]["mean_final"] < min(others) and 0 < share < 1 / 3
    return ok, f"quiet urgency={u['quiet']['mean_final']} others={others} share={share}"


def _organic_coalition(rec, m):
    c = m["coalitions"]
    if not c["formed"]:
        return False, "no coalition formed"
    return (c["organic_rate"] or 0) >= 1.0, f"formed={c['formed']} organic_rate={c['organic_rate']}"


def _injection_answered(rec, m):
    r = m["injection"]["response_rate"]
    return (r is not None and r >= 0.5), f"response rate={r}"


def _fair_room(rec, m):
    t = m["turn_share"]
    return (t["gini"] <= 0.35 and not t["silent_agents"]), f"gini={t['gini']} silent={t['silent_agents']}"


SCENARIOS: dict[str, Scenario] = {s.key: s for s in [
    Scenario("agitator_vs_diplomat", "Archetypes produce distinct behavior", _agitator_vs_diplomat, [
        rate_greater("agi", "dip", M.AGGRESSIVE, "aggression"),
        rate_greater("dip", "agi", M.CONCILIATORY, "conciliation"),
        low_repetition(), no_invariant_violations()]),
    Scenario("trust_collapse", "Hostility drives trust down and spawns pressure plans", _trust_collapse, [
        Expectation("pressure_plans", "triggers create pressure goals/plans", _pressure_check),
        emotion_lift("anger"), no_invariant_violations()]),
    Scenario("forced_walkaway", "Incompatible red lines push toward walkaway", _forced_walkaway, [
        Expectation("walkaway_or_brink", "ends in walkaway or near-deadlock", _walkaway_or_brink),
        Expectation("no_abrupt_walkaway", "walkaways follow anger/tension", _no_abrupt_walkaway),
        no_invariant_violations()]),
    Scenario("hidden_agenda_pressure", "Hidden agendas shape but do not leak", _hidden_agenda, [
        Expectation("agenda_not_leaked", "hidden agendas are not stated outright", _leak_ok),
        no_invariant_violations()]),
    Scenario("vote_decision", "A vote settles the decision", _vote_decision, [
        Expectation("vote_resolved", "the run ends by a vote", _vote_resolved),
        Expectation("votes_cast", "voters vote once the vote is called", _votes_cast),
        Expectation("no_premature_votes", "no votes in the first 20% of turns", _no_premature_votes),
        no_invariant_violations()]),
    Scenario("consensus_building", "Cooperative parties may agree — but only if earned", _consensus_building, [
        no_artificial_consensus(), emotion_lift("joy"), no_invariant_violations()]),
    Scenario("crisis_shock", "An external shock raises the temperature", _crisis_shock, [
        Expectation("shock_raises_tension", "tension rises after the external event", _shock_raises_tension),
        no_invariant_violations()]),
    Scenario("moderator_led", "A moderator keeps the floor balanced", _moderator_led, [
        Expectation("moderator_present", "moderator takes >= 25% of turns", _moderator_share),
        no_invariant_violations()]),
    Scenario("quiet_strategist", "A low-urgency agent holds back but is not silenced", _quiet_strategist, [
        Expectation("strategic_silence", "quiet agent bids lower and speaks less, but speaks", _quiet_holds_back),
        no_invariant_violations()]),
    Scenario("coalition_formation", "Aligned parties form an earned coalition", _coalition_formation, [
        Expectation("organic_coalition", "coalitions follow reciprocal positive moves", _organic_coalition),
        no_invariant_violations()]),
    Scenario("human_injection", "Agents respond to a human interjection", _human_injection, [
        Expectation("injection_answered", "agents address the human within 2 turns", _injection_answered),
        no_invariant_violations()],
        injections=[Injection(3, "p2", "Nia, your 90-day rule would wreck our churn models. Defend it.",
                              "challenge", "p1")]),
    Scenario("large_room", "Six agents all get heard", _large_room, [
        Expectation("fair_room", "no silent agents, gini <= 0.35", _fair_room),
        low_repetition(), no_invariant_violations()]),
]}

# Every scenario: the recorded ending must agree with what people did in the room.
for _sc in SCENARIOS.values():
    _sc.expectations.append(outcome_matches_acts())
