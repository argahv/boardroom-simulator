from __future__ import annotations

from typing import Any, Self

from pydantic import BaseModel, Field


class GoalState(BaseModel):
    goal_id: str = ""
    agent_id: str = ""
    goal_text: str = ""
    priority: float = Field(default=1.0, ge=0.0, le=5.0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    source: str = "initial"
    created_turn: int = 0
    last_reinforced_turn: int = 0
    decay_rate: float = Field(default=0.05, ge=0.0, le=1.0)
    ttl_turns: int = 50
    is_active: bool = True


TRIGGER_GOAL_MAP: dict[str, tuple[str, float]] = {
    "escalation_risk": ("deescalate", 4.0),
    "trust_collapse": ("rebuild_trust", 5.0),
    "credibility_crisis": ("defend_position", 4.5),
    "domination_threat": ("assert_autonomy", 3.5),
    "leverage_collapse": ("regain_leverage", 4.0),
}


class GoalEvolution:
    def __init__(self, plan_manager: Any = None) -> None:
        self._goals: dict[str, list[GoalState]] = {}
        self._last_top_goal: dict[str, str | None] = {}
        self._turn: int = 0
        self._plan_manager = plan_manager

    def _agent_goals(self, agent_id: str) -> list[GoalState]:
        if agent_id not in self._goals:
            self._goals[agent_id] = []
            self._last_top_goal[agent_id] = None
        return self._goals[agent_id]

    def add_goal(self, agent_id: str, goal_text: str, priority: float = 1.0,
                 source: str = "initial", turn: int = 0) -> Self:
        import uuid
        goal = GoalState(
            goal_id=uuid.uuid4().hex[:12], agent_id=agent_id,
            goal_text=goal_text, priority=priority, confidence=1.0,
            source=source, created_turn=turn, last_reinforced_turn=turn,
        )
        self._agent_goals(agent_id).append(goal)
        return self

    def update_priorities(self, agent_id: str, triggers: list[str]) -> Self:
        for trigger in triggers:
            if trigger in TRIGGER_GOAL_MAP:
                text, prio = TRIGGER_GOAL_MAP[trigger]
                if not self._has_active_goal_text(agent_id, text):
                    self.add_goal(agent_id, text, prio, source="pressure", turn=self._turn)
                    if self._plan_manager is not None:
                        self._plan_manager.create_plan(agent_id, text, created_turn=self._turn)
            elif trigger == "gaining_traction":
                active = self.get_active_goals(agent_id, 10)
                if active:
                    top = max(active, key=lambda g: g.confidence)
                    top.priority = min(5.0, top.priority + 0.5)
                    top.last_reinforced_turn = self._turn
            elif trigger == "leverage_advantage":
                active = self.get_active_goals(agent_id, 10)
                if active:
                    top = max(active, key=lambda g: g.priority)
                    top.priority = min(5.0, top.priority + 1.0)
                    top.last_reinforced_turn = self._turn
        return self

    def decay_all(self, current_turn: int) -> Self:
        self._turn = current_turn
        for agent_goals in self._goals.values():
            for goal in agent_goals:
                if not goal.is_active:
                    continue
                age = current_turn - goal.last_reinforced_turn
                if age > goal.ttl_turns:
                    goal.is_active = False
                else:
                    goal.priority = max(0.1, goal.priority - goal.decay_rate)
                    goal.confidence = max(0.1, goal.confidence - goal.decay_rate / 2)
        return self

    def get_active_goals(self, agent_id: str, n: int = 3) -> list[GoalState]:
        goals = [g for g in self._goals.get(agent_id, []) if g.is_active]
        goals.sort(key=lambda g: g.priority * g.confidence, reverse=True)
        return goals[:n]

    def has_goal_shifted(self, agent_id: str) -> bool:
        active = self.get_active_goals(agent_id, 1)
        current_top = active[0].goal_id if active else None
        previous = self._last_top_goal.get(agent_id)
        self._last_top_goal[agent_id] = current_top
        if current_top is None and previous is None:
            return False
        return current_top != previous

    def reinforce_goal(self, agent_id: str, goal_id: str, current_turn: int = 0) -> Self:
        for goal in self._agent_goals(agent_id):
            if goal.goal_id == goal_id and goal.is_active:
                goal.last_reinforced_turn = current_turn
                goal.confidence = min(1.0, goal.confidence + 0.1)
                goal.priority = min(5.0, goal.priority + 0.1)
                break
        return self

    def get_all_goals(self, agent_id: str) -> list[GoalState]:
        return self._goals.get(agent_id, [])

    def _has_active_goal_text(self, agent_id: str, text: str) -> bool:
        return any(g.goal_text == text and g.is_active
                   for g in self._goals.get(agent_id, []))


def make_goal_evolution(plan_manager: Any = None) -> GoalEvolution:
    return GoalEvolution(plan_manager=plan_manager)
