"""Multi-turn strategic planning system.

Agents create plans with subgoals, track progress, and integrate
with GoalEvolution for trigger-driven plan creation.
"""

from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from typing import Self


MAX_ACTIVE_PLANS = 2
PLAN_STALE_TURNS = 6


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
    action_types: list[str] = field(default_factory=list)  # actions that advance this subgoal


@dataclass
class Plan:
    id: str
    agent_id: str
    goal_text: str             # "push the vote in my favor"
    created_turn: int
    subgoals: list[SubGoal] = field(default_factory=list)
    status: str = "active"     # active | completed | abandoned
    confidence: float = 1.0    # 0.0-1.0
    source: str = "initial"    # initial (the stance plan) | pressure (a tactical response)


class PlanManager:
    """Manages multi-turn plans for all agents."""

    def __init__(self) -> None:
        self._plans: dict[str, Plan] = {}  # plan_id -> Plan
        self._agent_plans: dict[str, list[str]] = {}  # agent_id -> [plan_ids]

    def create_plan(self, agent_id: str, goal_text: str,
                    subgoals: list[SubGoal] | None = None,
                    created_turn: int = 0, source: str = "initial") -> Plan:
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
            source=source,
        )
        self._recalculate_progress(plan)
        self._plans[plan_id] = plan
        if agent_id not in self._agent_plans:
            self._agent_plans[agent_id] = []
        self._agent_plans[agent_id].append(plan_id)
        # Keep focus: abandon the oldest plans beyond the cap. The stance plan is the
        # agent's reason for being in the room, so tactical plans make way first.
        active = self.get_active_plans(agent_id)
        excess = len(active) - MAX_ACTIVE_PLANS
        for old in sorted(active[:-1], key=lambda p: p.source == "initial"):
            if excess <= 0:
                break
            old.status = "abandoned"
            excess -= 1
        return plan

    def abandon_plans_for(self, agent_id: str, goal_text: str) -> None:
        for plan in self.get_active_plans(agent_id):
            if plan.goal_text == goal_text and plan.source != "initial":
                plan.status = "abandoned"

    def core_and_tactic(self, agent_id: str) -> tuple[Plan | None, Plan | None]:
        """The agent's standing (stance) plan and its latest tactical plan, if any."""
        active = self.get_active_plans(agent_id)
        core = next((p for p in reversed(active) if p.source == "initial"), None)
        tactic = next((p for p in reversed(active) if p.source != "initial"), None)
        if core is None and tactic is None and active:
            core = active[-1]
        return core, tactic

    def _auto_generate_subgoals(self, goal_text: str) -> list[SubGoal]:
        """Auto-generate subgoals based on goal text patterns.

        Each subgoal lists the action types that count as progress on it, so
        plan progress can be tracked from what the agent actually does.
        """
        text = goal_text.lower()
        if any(k in text for k in ("deescalate", "rebuild", "repair")):
            specs = [
                ("acknowledge concerns", "validate the other side's position before arguing",
                 2, 0.8, ["question", "agreement", "statement"]),
                ("offer concessions", "propose a compromise on secondary issues",
                 4, 0.6, ["compromise", "coalition_signal"]),
            ]
        elif any(k in text for k in ("defend", "leverage", "regain")):
            specs = [
                ("restate position with evidence", "cite data and concrete facts",
                 1, 0.9, ["statement"]),
                ("expose weakness in opposition", "challenge their assumptions directly",
                 3, 0.7, ["challenge", "question"]),
            ]
        elif "autonomy" in text or "assert" in text:
            specs = [
                ("push back on the dominant voice", "refuse to be steamrolled; contest their framing",
                 2, 0.8, ["challenge", "interrupt"]),
                ("reframe the agenda", "redirect the discussion to your priorities",
                 4, 0.6, ["statement", "question"]),
            ]
        elif "guide the room" in text:  # the moderator's standing plan
            specs = [
                ("surface each side's bottom line", "ask each party what they need to say yes",
                 2, 0.8, ["question"]),
                ("test a middle ground", "float terms that address both sides' core concerns",
                 4, 0.6, ["question", "compromise"]),
                ("call for a decision", "ask the room to accept, reject or vote on what is on the table",
                 6, 0.5, ["question", "statement", "vote"]),
            ]
        else:
            specs = [
                ("establish position", "state your case clearly",
                 1, 0.7, ["statement", "challenge"]),
                ("build support", "find common ground with potential allies",
                 3, 0.5, ["coalition_signal", "compromise", "question", "agreement"]),
                ("secure a decision", "push the room toward a resolution on your terms",
                 6, 0.5, ["vote", "compromise", "escalate"]),
            ]
        return [
            SubGoal(id=uuid.uuid4().hex[:8], description=desc, strategy_hint=hint,
                    turn_target=target, priority=prio, dependencies=[],
                    status="pending", progress=0.0, action_types=actions)
            for desc, hint, target, prio, actions in specs
        ]

    def evaluate_turn(self, agent_id: str, action_type: str, turn: int = 0) -> list[str]:
        """Advance the agent's active plans based on the action it just took.

        Returns the descriptions of subgoals completed by this action.
        Plans whose subgoals are long overdue are abandoned so stale plans
        do not crowd out new ones.
        """
        completed: list[str] = []
        for plan in self.get_active_plans(agent_id):
            for sg in plan.subgoals:
                if sg.status not in ("pending", "in_progress"):
                    continue
                if any(self._subgoal_status(plan, dep) != "completed" for dep in sg.dependencies):
                    continue
                if action_type in sg.action_types:
                    sg.status = "completed"
                    sg.progress = 1.0
                    completed.append(sg.description)
                else:
                    sg.status = "in_progress"
                    sg.progress = max(sg.progress, 0.25)
                break  # only the first open subgoal of each plan is in focus
            self._recalculate_progress(plan)
            open_sgs = [sg for sg in plan.subgoals if sg.status != "completed"]
            if plan.status == "active" and open_sgs and turn - plan.created_turn > max(
                    sg.turn_target for sg in plan.subgoals) + PLAN_STALE_TURNS:
                plan.status = "abandoned"
        return completed

    def _subgoal_status(self, plan: Plan, subgoal_id: str) -> str:
        for sg in plan.subgoals:
            if sg.id == subgoal_id:
                return sg.status
        return "completed"

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
        """Plan summary for the prompt: the standing plan, plus any tactical adjustment."""
        core, tactic = self.core_and_tactic(agent_id)
        if core is None and tactic is None:
            return ""
        parts = []
        if core is not None:
            parts.append(f"Active plan: {core.goal_text.replace('_', ' ')}.{_next_step(core)}")
        if tactic is not None:
            label = "Tactical adjustment" if core is not None else "Active plan"
            parts.append(f"{label}: {tactic.goal_text.replace('_', ' ')}.{_next_step(tactic)}")
        return "\n".join(parts)

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
                        "action_types": sg.action_types,
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


def _next_step(plan: Plan) -> str:
    open_sgs = [sg for sg in plan.subgoals if sg.status in ("pending", "in_progress")]
    if not open_sgs:
        return ""
    return f" Next step: {open_sgs[0].description} ({open_sgs[0].strategy_hint})."
