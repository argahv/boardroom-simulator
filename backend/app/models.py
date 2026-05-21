from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

ActionType = Literal["statement", "question", "challenge", "compromise", "coalition_signal", "interrupt", "escalate"]
ModelTemperature = Literal["stable", "volatile"]
SimulationStatus = Literal["idle", "running", "complete"]
InterruptType = Literal["cut_off", "reframe", "pile_on", "deflect"]


class Stakeholder(BaseModel):
    id: str
    name: str
    role: str
    focus: str
    incentive_tuning: int = Field(default=50, ge=0, le=100)
    hidden_agenda: str = ""
    tag: Optional[str] = None  # SKEPTICAL / AGREEABLE / LOCKED / CALIBRATING / VISIONARY


class EnvFlags(BaseModel):
    hidden_motives: bool = True
    time_pressure: bool = False
    external_leaks: bool = False
    deadlock_risk: bool = False


class SimulationCreate(BaseModel):
    background: str
    primary_goal: str
    stakeholders: list[Stakeholder]
    voltage: int = Field(default=50, ge=0, le=100)
    env_flags: EnvFlags = Field(default_factory=EnvFlags)
    model_temperature: ModelTemperature = "stable"


class CoalitionSignal(BaseModel):
    """Two agents that are temporarily aligned."""
    agent_a: str
    agent_b: str
    issue: str  # what they're aligned on


class LeverageShift(BaseModel):
    """Records when bargaining power noticeably shifts."""
    turn_index: int
    from_agent: str
    to_agent: str
    reason: str


class AgentMemory(BaseModel):
    """Per-agent persistent memory of key positions stated so far."""
    agent_id: str
    positions: list[str] = Field(default_factory=list)  # key stances taken
    concessions: list[str] = Field(default_factory=list)  # concessions made
    red_lines: list[str] = Field(default_factory=list)  # hard nos stated


class Turn(BaseModel):
    turn_index: int
    stakeholder_id: str
    stakeholder_name: str
    role: str
    content: str
    internal_reasoning: str
    action_type: ActionType
    interrupt_type: Optional[InterruptType] = None  # set when action_type == "interrupt"
    directed_at: Optional[str] = None  # stakeholder_id this turn is addressed to
    coalition_with: Optional[str] = None  # stakeholder_id forming a coalition signal with
    leverage_gained: bool = False  # orchestrator flags leverage shift
    emotional_tone: Optional[str] = None  # tense / neutral / heated / conciliatory


class HeatmapState(BaseModel):
    commercial_gain: int = 50
    tech_integrity: int = 50
    legal_safety: int = 50
    recommendation: str = ""


class ConflictPoint(BaseModel):
    step: int
    label: str
    type: Literal["intro", "clash", "closure", "neutral"] = "neutral"


class SimulationState(BaseModel):
    simulation_id: str
    config: SimulationCreate
    turns: list[Turn] = Field(default_factory=list)
    heatmap: HeatmapState = Field(default_factory=HeatmapState)
    sentiment: list[float] = Field(default_factory=list)
    event_log: list[str] = Field(default_factory=list)
    conflict_timeline: list[ConflictPoint] = Field(default_factory=list)
    active_speaker_id: Optional[str] = None
    status: SimulationStatus = "idle"
    mocked: bool = False
    # enriched negotiation state
    coalitions: list[CoalitionSignal] = Field(default_factory=list)
    leverage_shifts: list[LeverageShift] = Field(default_factory=list)
    agent_memories: list[AgentMemory] = Field(default_factory=list)
    current_agenda_item: int = 0  # index into a conceptual agenda
    deadlock_risk_score: int = 0  # 0-100, rises with repeated challenge/escalate


class StrategyCard(BaseModel):
    objection: str
    counter: str
    risk: Literal["LOW", "MEDIUM", "HIGH"]


class AlignmentDelta(BaseModel):
    stakeholder_id: str
    name: str
    role: str
    delta: int  # -100..100
    quote: str


class TopologyNode(BaseModel):
    id: str
    label: str
    kind: Literal["root", "objection", "resolution"]
    parents: list[str] = Field(default_factory=list)


class Postmortem(BaseModel):
    simulation_id: str
    confidence_score: int  # 0..100
    confidence_trend: int  # +/- delta
    unanticipated_objections: int
    unanticipated_note: str
    consensus_rating: int  # 0..100
    objection_topology: list[TopologyNode]
    alignment_deltas: list[AlignmentDelta]
    strategy_cards: list[StrategyCard]
    mocked: bool = False
