"""Per-simulation wiring of every behavioral subsystem.

One ``SimulationContext`` is built per run and shared by the scheduler and all
agents, so each layer of the architecture (procedural → social physics →
relationships → cognition → strategy → narrative) reads and writes the same
state.
"""

from __future__ import annotations

import random
import zlib
from dataclasses import dataclass, field
from typing import Any

from app.models import (
    SimulationConfig, TimeoutCondition, VoteCondition, ConsensusCondition,
    HybridCondition, JudgeCondition,
)
from app.runtime.space import SharedSpace
from app.runtime.behavior_engine import make_engine
from app.runtime.memory_system import MemorySystem, make_memory_system
from app.runtime.strategic_plan import PlanManager
from app.runtime.goal_evolution import GoalEvolution
from app.runtime.private_thought import PrivateThoughtSystem, make_private_thought_system
from app.runtime.time_pressure import TimePressure
from app.runtime.external_events import ExternalEventInjector

DEFAULT_ACTIONS: list[str] = [
    "statement", "question", "challenge", "compromise", "coalition_signal",
    "interrupt", "escalate", "vote", "walkaway",
]

# Starting objective for each stance. {subject} is filled with the subject name.
STANCE_GOALS: dict[str, str] = {
    "champion": "win the room's support for {subject}",
    "detractor": "block {subject} or force major changes to it",
    "neutral": "reach the best-informed decision on {subject}",
    "moderator": "guide the room to a clear, fair decision",
    "wildcard": "extract maximum personal advantage from {subject}",
}

# Domain-agnostic external shocks used when env_flags.external_leaks is on.
EXTERNAL_EVENT_TEMPLATES: list[dict[str, Any]] = [
    {
        "kind": "leak",
        "content": "An internal memo about '{subject}' has leaked, exposing the room's private doubts.",
        "social": {"tension": 0.12, "trust": -0.08},
        "emotion": {"surprise": 0.3, "fear": 0.1},
    },
    {
        "kind": "deadline",
        "content": "An outside deadline has been imposed: a decision on '{subject}' is required immediately.",
        "social": {"tension": 0.1, "momentum": 0.1},
        "emotion": {"fear": 0.15, "surprise": 0.2},
    },
    {
        "kind": "news",
        "content": "Breaking news has raised the stakes on '{subject}' — new information changes the picture.",
        "social": {"tension": 0.08, "credibility": -0.05},
        "emotion": {"surprise": 0.3},
    },
    {
        "kind": "defection",
        "content": "A key outside backer of '{subject}' has publicly withdrawn their support.",
        "social": {"tension": 0.1, "leverage": -0.05},
        "emotion": {"fear": 0.15, "anger": 0.1, "surprise": 0.2},
    },
]


def max_turns_for(config: SimulationConfig) -> int:
    ec = config.end_condition
    if isinstance(ec, TimeoutCondition):
        return ec.max_normal_turns
    if isinstance(ec, (VoteCondition, ConsensusCondition, HybridCondition)):
        return ec.max_turns
    if isinstance(ec, JudgeCondition):
        return 30
    return 20


def uses_vote(config: SimulationConfig) -> bool:
    ec = config.end_condition
    if isinstance(ec, VoteCondition):
        return True
    if isinstance(ec, HybridCondition):
        return any(isinstance(c, VoteCondition) for c in ec.conditions)
    return False


def allowed_actions(config: SimulationConfig) -> list[str]:
    custom = [a.name for a in config.action_space.actions if a.name]
    return DEFAULT_ACTIONS + [c for c in custom if c not in DEFAULT_ACTIONS]


def custom_action_deltas(config: SimulationConfig) -> dict[str, dict[str, float]]:
    """User-defined action deltas (ints in -100..100) as social-physics deltas."""
    out: dict[str, dict[str, float]] = {}
    for a in config.action_space.actions:
        if a.name and a.name not in DEFAULT_ACTIONS:
            out[a.name] = {"trust": a.trust_delta / 100.0, "leverage": a.leverage_delta / 100.0}
    return out


@dataclass
class SimulationContext:
    config: SimulationConfig
    simulation_id: str
    space: SharedSpace
    behavior_engine: Any
    memory: MemorySystem
    plans: PlanManager
    goals: GoalEvolution
    thoughts: PrivateThoughtSystem
    max_turns: int
    time_pressure: TimePressure | None = None
    external_events: ExternalEventInjector | None = None
    external_event_turn: int | None = None
    turn_count: int = 0
    announced_pressure: set[str] = field(default_factory=set)

    def flag(self, name: str) -> bool:
        return bool((self.config.env_flags or {}).get(name, False))

    def name_of(self, agent_id: str) -> str:
        for s in self.config.stakeholders:
            if s.id == agent_id:
                return s.name
        return agent_id

    def pressure(self) -> float:
        return self.time_pressure.get_pressure() if self.time_pressure else 0.0


def build_context(
    config: SimulationConfig,
    simulation_id: str,
    behavior_engine: Any = None,
    memory_system: MemorySystem | None = None,
    plan_manager: PlanManager | None = None,
    space: SharedSpace | None = None,
) -> SimulationContext:
    ids = [s.id for s in config.stakeholders]
    if behavior_engine is None:
        behavior_engine = make_engine(
            ids,
            scenario_type=config.scenario_type,
            personas=[s.personality for s in config.stakeholders],
            archetypes=[s.archetype for s in config.stakeholders],
            custom_actions=custom_action_deltas(config),
        )
    plans = plan_manager or PlanManager()
    if hasattr(behavior_engine, "set_plan_manager"):
        behavior_engine.set_plan_manager(plans)
    goals = GoalEvolution(plan_manager=plans)
    ctx = SimulationContext(
        config=config,
        simulation_id=simulation_id,
        space=space or SharedSpace(config),
        behavior_engine=behavior_engine,
        memory=memory_system or make_memory_system(),
        plans=plans,
        goals=goals,
        thoughts=make_private_thought_system(ids),
        max_turns=max_turns_for(config),
    )

    subject = config.subject.name
    for s in config.stakeholders:
        goal_text = STANCE_GOALS.get(s.stance, STANCE_GOALS["neutral"]).format(subject=subject)
        goals.add_goal(s.id, goal_text, priority=3.0, source="initial")
        if s.hidden_agenda and ctx.flag("hidden_motives"):
            goals.add_goal(s.id, f"quietly advance: {s.hidden_agenda}", priority=2.5, source="hidden")
        plans.create_plan(s.id, goal_text, created_turn=0)
        if hasattr(behavior_engine, "shift_focus"):
            behavior_engine.shift_focus(s.id, goal_text, 3)
        goals.has_goal_shifted(s.id)  # prime "last top goal" so the first real shift is detected

    if ctx.flag("time_pressure"):
        ctx.time_pressure = TimePressure()

    if ctx.flag("external_leaks"):
        rng = random.Random(zlib.crc32(simulation_id.encode()))
        template = rng.choice(EXTERNAL_EVENT_TEMPLATES)
        turn = max(2, int(ctx.max_turns * rng.uniform(0.35, 0.6)))
        event = dict(template)
        event["content"] = template["content"].format(subject=subject)
        ctx.external_events = ExternalEventInjector()
        ctx.external_events.add_event(event, turn)
        ctx.external_event_turn = turn

    return ctx
