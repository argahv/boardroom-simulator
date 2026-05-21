from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

ActionType = Literal["statement", "question", "challenge", "compromise", "coalition_signal", "interrupt", "escalate"]
ModelTemperature = Literal["stable", "volatile"]
SimulationStatus = Literal["idle", "running", "complete"]
InterruptType = Literal["cut_off", "reframe", "pile_on", "deflect"]


ToolProfile = Literal["financial", "legal", "technical", "comms", "none"]


class Stakeholder(BaseModel):
    id: str
    name: str
    role: str
    focus: str
    incentive_tuning: int = Field(default=50, ge=0, le=100)
    hidden_agenda: str = ""
    tag: Optional[str] = None  # SKEPTICAL / AGREEABLE / LOCKED / CALIBRATING / VISIONARY
    tool_profile: ToolProfile = "none"  # determines which tools this agent gets


class ScenarioTemplate(BaseModel):
    """A reusable scenario blueprint stored in the DB; not hardcoded."""
    id: str
    name: str
    description: str
    default_background: str
    default_primary_goal: str
    default_voltage: int = Field(default=50, ge=0, le=100)
    default_model_temperature: ModelTemperature = "stable"
    suggested_persona_ids: list[str] = Field(default_factory=list)


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

    # production-grade negotiation dynamics
    interrupt_bid: float = Field(default=0.0, ge=0.0, le=1.0)  # urgency to grab floor
    position_delta: dict[str, str] = Field(default_factory=dict)  # e.g. {"pricing": "accept pilot"}
    leverage_delta: dict[str, int] = Field(default_factory=dict)  # e.g. {"self": +5, "other_id": -5}


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

    # production dynamics
    trust_matrix: dict[str, dict[str, int]] = Field(default_factory=dict)
    leverage_scores: dict[str, int] = Field(default_factory=dict)
    agent_objectives: dict[str, list[str]] = Field(default_factory=dict)


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
