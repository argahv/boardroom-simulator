"""Multi-turn strategic planning system.

Agents create plans with subgoals, track progress, and integrate
with GoalEvolution for trigger-driven plan creation.
"""

from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from typing import Self


@dataclass
class SubGoal:
    id: str
    description: str           # "weaken CFO credibility"
    strategy_hint: str         # "question their financial projections publicly"
    turn_target: int           # expected turn to complete by
    priority: float            # 0.0-1.0
    dependencies: list[str]    # subgoal IDs that must complete first
    status: str = "pending"    # pending | in_progress | completed | failed
    progress: float = 0.0      # 0.0-1.0


@dataclass
class Plan:
    id: str
    agent_id: str
    goal_text: str             # "push the vote in my favor"
    created_turn: int
    subgoals: list[SubGoal] = field(default_factory=list)
    status: str = "active"     # active | completed | abandoned
    confidence: float = 1.0    # 0.0-1.0


class PlanManager:
    """Manages multi-turn plans for all agents."""

    def __init__(self) -> None:
        self._plans: dict[str, Plan] = {}  # plan_id -> Plan
        self._agent_plans: dict[str, list[str]] = {}  # agent_id -> [plan_ids]

    def create_plan(self, agent_id: str, goal_text: str,
                    subgoals: list[SubGoal] | None = None,
                    created_turn: int = 0) -> Plan:
        """Create a new plan from a goal and optional subgoals."""
        plan_id = uuid.uuid4().hex[:12]
        if subgoals is None:
            subgoals = self._auto_generate_subgoals(goal_text)
        plan = Plan(
            id=plan_id,
            agent_id=agent_id,
            goal_text=goal_text,
            created_turn=created_turn,
            subgoals=subgoals,
        )
        self._plans[plan_id] = plan
        if agent_id not in self._agent_plans:
            self._agent_plans[agent_id] = []
        self._agent_plans[agent_id].append(plan_id)
        return plan

    def _auto_generate_subgoals(self, goal_text: str) -> list[SubGoal]:
        """Auto-generate simple subgoals based on goal text patterns."""
        subgoals = []
        if "deescalate" in goal_text.lower() or "rebuild" in goal_text.lower() or "repair" in goal_text.lower():
            subgoals = [
                SubGoal(id=uuid.uuid4().hex[:8], description="acknowledge concerns",
                        strategy_hint="validate the other side's position", turn_target=2,
                        priority=0.8, dependencies=[], status="pending", progress=0.0),
                SubGoal(id=uuid.uuid4().hex[:8], description="offer concessions",
                        strategy_hint="propose a compromise on secondary issues", turn_target=4,
                        priority=0.6, dependencies=[], status="pending", progress=0.0),
            ]
        elif "defend" in goal_text.lower() or "leverage" in goal_text.lower():
            subgoals = [
                SubGoal(id=uuid.uuid4().hex[:8], description="restate position with evidence",
                        strategy_hint="cite data and past agreements", turn_target=1,
                        priority=0.9, dependencies=[], status="pending", progress=0.0),
                SubGoal(id=uuid.uuid4().hex[:8], description="expose weakness in opposition",
                        strategy_hint="challenge their assumptions", turn_target=3,
                        priority=0.7, dependencies=[], status="pending", progress=0.0),
            ]
        else:
            subgoals = [
                SubGoal(id=uuid.uuid4().hex[:8], description="establish position",
                        strategy_hint="state your case clearly", turn_target=1,
                        priority=0.7, dependencies=[], status="pending", progress=0.0),
                SubGoal(id=uuid.uuid4().hex[:8], description="build support",
                        strategy_hint="find common ground with allies", turn_target=3,
                        priority=0.5, dependencies=[], status="pending", progress=0.0),
            ]
        return subgoals

    def advance_subgoal(self, plan_id: str, subgoal_id: str) -> Plan | None:
        """Mark a subgoal as completed, advancing plan progress."""
        plan = self._plans.get(plan_id)
        if plan is None or plan.status != "active":
            return plan

        for sg in plan.subgoals:
            if sg.id == subgoal_id:
                sg.status = "completed"
                sg.progress = 1.0
                break

        self._recalculate_progress(plan)
        return plan

    def _recalculate_progress(self, plan: Plan) -> None:
        """Recalculate overall plan progress from subgoal statuses."""
        if not plan.subgoals:
            return
        completed = sum(1 for sg in plan.subgoals if sg.status == "completed")
        in_progress = sum(1 for sg in plan.subgoals if sg.status == "in_progress")
        total = len(plan.subgoals)
        weighted = completed + (in_progress * 0.5)
        plan.confidence = max(0.1, min(1.0, weighted / max(total, 1)))

        if all(sg.status == "completed" for sg in plan.subgoals):
            plan.status = "completed"

    def abandon_plan(self, plan_id: str) -> Plan | None:
        """Mark a plan as abandoned."""
        plan = self._plans.get(plan_id)
        if plan:
            plan.status = "abandoned"
        return plan

    def get_active_plans(self, agent_id: str) -> list[Plan]:
        """Get all active plans for an agent."""
        plan_ids = self._agent_plans.get(agent_id, [])
        return [self._plans[pid] for pid in plan_ids
                if pid in self._plans and self._plans[pid].status == "active"]

    def get_plan_progress(self, plan_id: str) -> float:
        """Get progress of a specific plan (0.0-1.0)."""
        plan = self._plans.get(plan_id)
        if not plan or not plan.subgoals:
            return 0.0
        completed = sum(1 for sg in plan.subgoals if sg.status == "completed")
        return completed / max(len(plan.subgoals), 1)

    def get_plan_summary(self, agent_id: str) -> str:
        """Produce a concise plan summary for LLM injection (under 200 chars)."""
        plans = self.get_active_plans(agent_id)
        if not plans:
            return ""
        plan = plans[0]
        active_sgs = [sg for sg in plan.subgoals if sg.status in ("pending", "in_progress")]
        if active_sgs:
            next_sg = active_sgs[0]
            return (
                f"Active plan: {plan.goal_text} (confidence {plan.confidence:.1f}). "
                f"Current objective: {next_sg.description}. "
                f"Strategy: {next_sg.strategy_hint}"
            )
        return f"Active plan: {plan.goal_text} (confidence {plan.confidence:.1f})"

    def serialize(self) -> dict:
        """Serialize all plans for snapshot persistence."""
        plans_data = {}
        for pid, plan in self._plans.items():
            plans_data[pid] = {
                "id": plan.id,
                "agent_id": plan.agent_id,
                "goal_text": plan.goal_text,
                "created_turn": plan.created_turn,
                "status": plan.status,
                "confidence": plan.confidence,
                "subgoals": [
                    {
                        "id": sg.id,
                        "description": sg.description,
                        "strategy_hint": sg.strategy_hint,
                        "turn_target": sg.turn_target,
                        "priority": sg.priority,
                        "dependencies": sg.dependencies,
                        "status": sg.status,
                        "progress": sg.progress,
                    }
                    for sg in plan.subgoals
                ],
            }
        return {"plans": plans_data, "agent_plans": dict(self._agent_plans)}

    @classmethod
    def deserialize(cls, data: dict) -> PlanManager:
        """Restore PlanManager from serialized data."""
        pm = cls()
        plans_data = data.get("plans", {})
        for pid, pd in plans_data.items():
            subgoals = [SubGoal(**sg) for sg in pd.get("subgoals", [])]
            plan = Plan(
                id=pd["id"],
                agent_id=pd["agent_id"],
                goal_text=pd["goal_text"],
                created_turn=pd["created_turn"],
                subgoals=subgoals,
                status=pd.get("status", "active"),
                confidence=pd.get("confidence", 1.0),
            )
            pm._plans[pid] = plan
            aid = plan.agent_id
            if aid not in pm._agent_plans:
                pm._agent_plans[aid] = []
            pm._agent_plans[aid].append(pid)
        return pm


def make_plan_manager() -> PlanManager:
    return PlanManager()
