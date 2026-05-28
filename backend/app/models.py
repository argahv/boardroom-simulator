from __future__ import annotations

from typing import Annotated, Literal, Optional
from pydantic import BaseModel, Field

ActionType = Literal["statement", "question", "challenge", "compromise", "coalition_signal", "interrupt", "escalate", "vote", "walkaway"]
ModelTemperature = Literal["stable", "volatile"]
SimulationStatus = Literal["idle", "running", "complete"]
RuntimeStatus = Literal["idle", "ai_turn", "awaiting_human", "complete"]
InterruptType = Literal["cut_off", "reframe", "pile_on", "deflect"]


ToolProfile = Literal["financial", "legal", "technical", "comms", "none"]

class Objective(BaseModel):
    id: str
    text: str
    source: Literal["initial","concession","opportunity","coalition","pressure"]
    priority: float = Field(default=1.0, ge=0.0, le=5.0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    topic: str = ""
    created_at_turn: int = 0
    last_reinforced_turn: int = 0
    decay_rate: float = Field(default=0.05, ge=0.0, le=1.0)
    ttl_turns: int = 50
    is_active: bool = True

class ObjectiveStore(BaseModel):
    objectives: list[Objective] = Field(default_factory=list)
    max_active: int = 8

    def top(self, n: int = 5) -> list[Objective]:
        active = [o for o in self.objectives if o.is_active]
        return sorted(active, key=lambda o: o.priority * o.confidence, reverse=True)[:n]

    def add(self, obj: Objective) -> None:
        existing = next((o for o in self.objectives if o.id == obj.id), None)
        if existing:
            existing.priority = min(5.0, existing.priority + 0.5)
            existing.confidence = min(1.0, existing.confidence + 0.1)
            existing.last_reinforced_turn = obj.created_at_turn
        else:
            self.objectives.append(obj)
        self._enforce_cap()

    def decay(self, current_turn: int) -> None:
        for o in self.objectives:
            if not o.is_active:
                continue
            age = current_turn - o.last_reinforced_turn
            if age > o.ttl_turns:
                o.is_active = False
            else:
                o.priority = max(0.1, o.priority - o.decay_rate)

    def _enforce_cap(self) -> None:
        active = [o for o in self.objectives if o.is_active]
        if len(active) > self.max_active:
            active.sort(key=lambda o: o.priority * o.confidence)
            for o in active[:len(active) - self.max_active]:
                o.is_active = False

class Stakeholder(BaseModel):
    id: str
    name: str
    role: str
    focus: str
    incentive_tuning: int = Field(default=50, ge=0, le=100)
    hidden_agenda: str = ""
    tag: Optional[str] = None  # SKEPTICAL / AGREEABLE / LOCKED / CALIBRATING / VISIONARY
    tool_profile: ToolProfile = "none"  # determines which tools this agent gets
    backstory: str = ""
    stance: str = "neutral"
    personality: str = "{}"
    tools: str = "[]"


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
    player_mode: bool = False


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
    is_human: bool = False
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


class LeaderboardEntry(BaseModel):
    agent_id: str
    name: str
    score: float
    delta: float
    delta_reason: str
    rank: int

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
    objective_stores: dict[str, dict] = Field(default_factory=dict)

    # player-mode runtime state
    runtime_status: RuntimeStatus = "idle"
    player_mode: bool = False
    state_version: int = 0
    inject_idempotency_keys: list[str] = Field(default_factory=list)
    leaderboard: list[LeaderboardEntry] = Field(default_factory=list)
    winning_context: str = ""


# ═══════════════════════════════════════════════════════════════════════
# Agentic Architecture Models (user-defined config, engine has zero opinions)
# ═══════════════════════════════════════════════════════════════════════

class Subject(BaseModel):
    """What the simulation is ABOUT — first-class entity."""
    name: str
    description: str = ""
    attributes: dict[str, str | int | float | bool] = Field(default_factory=dict)
    evidence_items: list[str] = Field(default_factory=list)
    stakes_description: str = ""


AgentStance = Literal["champion", "detractor", "neutral", "moderator", "wildcard"]


class PersonalityProfile(BaseModel):
    aggressiveness: int = Field(default=50, ge=0, le=100)
    empathy: int = Field(default=50, ge=0, le=100)
    stubbornness: int = Field(default=50, ge=0, le=100)
    verbosity: int = Field(default=50, ge=0, le=100)


class CustomActionDef(BaseModel):
    """An action type defined by the user for this simulation."""
    name: str
    description: str = ""
    trust_delta: int = 0
    leverage_delta: int = 0


class ActionSpace(BaseModel):
    actions: list[CustomActionDef] = Field(default_factory=list)
    default_trust_deltas: dict[str, int] = Field(default_factory=dict)
    default_leverage_deltas: dict[str, int] = Field(default_factory=dict)


class SpeakerRules(BaseModel):
    mode: Literal["moderator_led", "alternating", "freeform", "weighed_random"] = "weighed_random"


class VoteCondition(BaseModel):
    type: Literal["vote"] = "vote"
    voters: list[str]
    threshold: float = 0.5
    max_turns: int = 10


class TimeoutCondition(BaseModel):
    type: Literal["timeout"] = "timeout"
    max_normal_turns: int = 20


class JudgeCondition(BaseModel):
    type: Literal["judge"] = "judge"
    judge_id: str
    criteria: list[str] = Field(default_factory=list)


class ConsensusCondition(BaseModel):
    """Social-physics-based termination. Detects agreement or deadlock from
    trust/tension dynamics. Sensitivity maps to internal thresholds."""
    type: Literal["consensus"] = "consensus"
    sensitivity: Literal["diplomatic", "balanced", "sensitive"] = "balanced"
    detection_mode: Literal["both", "agreement_only", "deadlock_only"] = "both"
    max_turns: int = 30


class HybridCondition(BaseModel):
    """Multiple conditions active — first to trigger wins."""
    type: Literal["hybrid"] = "hybrid"
    conditions: list[VoteCondition | ConsensusCondition | JudgeCondition]
    max_turns: int = 30


EndCondition = Annotated[
    VoteCondition | TimeoutCondition | JudgeCondition | ConsensusCondition | HybridCondition,
    Field(discriminator="type"),
]


class AgentConfig(BaseModel):
    """A stakeholder with stance + personality. No hardcoded tags."""
    id: str
    name: str
    role: str = ""
    backstory: str = ""
    stance: AgentStance = "neutral"
    personality: PersonalityProfile = Field(default_factory=PersonalityProfile)
    hidden_agenda: str = ""
    tools: list[str] = Field(default_factory=list)
    inject_knowledge: bool | None = None  # Per-agent override (None = use global config)


class SimulationConfig(BaseModel):
    """Full user-defined simulation config — engine has zero domain opinions."""
    subject: Subject
    stakeholders: list[AgentConfig]
    action_space: ActionSpace
    speaker_rules: SpeakerRules = Field(default_factory=SpeakerRules)
    end_condition: EndCondition = Field(default_factory=lambda: TimeoutCondition())
    system_prompt_template: str = ""
    voltage: int = Field(default=50, ge=0, le=100)
    player_mode: bool = False
    env_flags: dict[str, bool] = Field(default_factory=lambda: {
        "hidden_motives": True, "time_pressure": False,
        "external_leaks": False, "deadlock_risk": False,
    })
    model_temperature: str = "volatile"
    auto_research: bool = True
    research_topics: list[str] = Field(default_factory=list)
    inject_knowledge: bool = True  # Global toggle for Chroma RAG injection

# Backward compatibility aliases
StakeholderV2 = AgentConfig
SimulationV2Config = SimulationConfig


class SimulationDocument(BaseModel):
    """Metadata-only document attached to a simulation (file stored externally)."""
    id: str
    simulation_id: str
    filename: str
    filepath: str = ""
    size_bytes: int = 0
    content_type: str = "application/octet-stream"
    extracted_text: str | None = None
    status: str = "pending"  # pending | ready | failed
    created_at: str = ""


class PersonaDocument(BaseModel):
    """Document attached to a persona for knowledge base."""
    id: str
    persona_id: str
    filename: str = ""
    filepath: str = ""
    content_type: str = "application/octet-stream"
    size_bytes: int = 0
    status: str = "pending"
    extracted_text: str | None = None
    embedding_id: str | None = None
    created_at: str = ""


class PersonaEvolution(BaseModel):
    """Proposed personality/stance evolution for a persona after simulation."""
    id: str
    persona_id: str
    simulation_id: str = ""
    proposed_deltas: str = "{}"
    before_snapshot: str = "{}"
    status: str = "pending"
    applied_at: str | None = None
    created_at: str = ""


class PersonaResearch(BaseModel):
    """Web research result attached to a persona."""
    id: str
    persona_id: str
    query: str = ""
    results: str = "[]"
    created_at: str = ""


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


class TopicSummary(BaseModel):
    """An agenda item or topic discussed during the simulation."""
    topic: str
    first_raised_turn: int = 0
    last_discussed_turn: int = 0
    mention_count: int = 0
    proposers: list[str] = Field(default_factory=list)
    positions: dict[str, str] = Field(default_factory=dict)
    resolved: bool = False
    resolution: str = ""


class KeyMoment(BaseModel):
    """A significant event in the negotiation arc."""
    turn: int
    kind: Literal["proposal", "coalition", "challenge", "compromise",
                   "vote", "escalation", "walkaway", "judge_ruling",
                   "turning_point"] = "turning_point"
    description: str = ""
    actors: list[str] = Field(default_factory=list)
    impact: str = ""


class StakeholderReport(BaseModel):
    """Per-stakeholder report card in the postmortem."""
    agent_id: str
    name: str
    role: str = ""
    stance: str = "neutral"
    initial_position: str = ""
    final_position: str = ""
    position_shifts: int = 0
    total_turns: int = 0
    dominant_action: str = "statement"
    alignment_delta: int = 0
    leverage_trajectory: str = "stable"
    key_statements: list[str] = Field(default_factory=list)
    goals_achieved: list[str] = Field(default_factory=list)
    goals_unmet: list[str] = Field(default_factory=list)


class TVector(BaseModel):
    turn: int
    value: float


class SocialDynamicsSummary(BaseModel):
    """Aggregate social physics across the simulation."""
    trust_arc: list[TVector] = Field(default_factory=list)
    tension_arc: list[TVector] = Field(default_factory=list)
    leverage_arc: list[TVector] = Field(default_factory=list)
    avg_trust: float = 0.0
    avg_tension: float = 0.0
    peak_tension: float = 0.0
    peak_tension_turn: int = 0
    coalition_count: int = 0
    deadlock_episodes: int = 0
    dominant_agent: str = ""


class VoteEvent(BaseModel):
    turn: int = 0
    agent_id: str = ""
    position: str = ""
    rationale: str = ""


class JudgeEvent(BaseModel):
    turn: int = 0
    verdict: str = ""
    reasoning: str = ""
    criteria_evaluations: dict[str, str] = Field(default_factory=dict)


class TerminationResult(BaseModel):
    """Structured outcome from whichever checker triggered termination."""
    reason: str = "timeout"
    outcome_type: str = "no_decision"
    summary: str = ""
    confidence: float = 0.0
    total_turns: int = 0
    vote_breakdown: dict[str, int] = Field(default_factory=dict)
    agreed_issues: list[dict] = Field(default_factory=list)
    judge_notes: str = ""
    walkaway_party: str | None = None


class Postmortem(BaseModel):
    simulation_id: str

    # I. Existing fields
    confidence_score: int = 0
    confidence_trend: int = 0
    unanticipated_objections: int = 0
    unanticipated_note: str = ""
    consensus_rating: int = 0
    objection_topology: list[TopologyNode] = Field(default_factory=list)
    alignment_deltas: list[AlignmentDelta] = Field(default_factory=list)
    strategy_cards: list[StrategyCard] = Field(default_factory=list)
    mocked: bool = False
    graph_analytics: Optional["GraphAnalytics"] = None

    # II. Executive Summary
    summary: str = ""
    verdict: str = ""

    # III. Conclusion Details
    end_reason: str = ""
    termination: TerminationResult = Field(default_factory=TerminationResult)

    # IV. Topics
    topics: list[TopicSummary] = Field(default_factory=list)
    topic_agreement_rate: float = 0.0

    # V. Stakeholder Reports
    stakeholder_reports: list[StakeholderReport] = Field(default_factory=list)

    # VI. Key Moments
    key_moments: list[KeyMoment] = Field(default_factory=list)
    narrative_arc: list[str] = Field(default_factory=list)

    # VII. Social Dynamics
    social_dynamics: SocialDynamicsSummary = Field(default_factory=SocialDynamicsSummary)

    # VIII. Lessons
    lessons_learned: list[str] = Field(default_factory=list)
    what_could_have_changed: list[str] = Field(default_factory=list)

    # IX. Vote/Judge events
    vote_events: list[VoteEvent] = Field(default_factory=list)
    judge_events: list[JudgeEvent] = Field(default_factory=list)


# ── Neo4j Graph Analytics Models ────────────────────────────────────────────

class HostilePair(BaseModel):
    """Two agents with persistently low mutual trust."""
    agent_a: str
    agent_b: str
    final_trust_a_to_b: int
    final_trust_b_to_a: int
    clash_count: int


class InfluenceNode(BaseModel):
    """Node in the influence chain showing who shaped the negotiation most."""
    agent_id: str
    name: str
    out_degree: int          # number of agents this agent influenced
    avg_leverage_delta: float


class CoalitionEvolution(BaseModel):
    """How a coalition formed and evolved across turns."""
    agent_a: str
    agent_b: str
    issue: str
    first_turn: int
    last_turn: int
    duration_turns: int


class InterruptEvent(BaseModel):
    """A single interrupt edge in the graph."""
    interrupter_id: str
    interrupted_id: str
    interrupt_type: str
    turn_index: int


class CrossSimPattern(BaseModel):
    """Pattern observed across multiple simulations."""
    agent_id: str
    name: str
    avg_final_leverage: float
    sim_count: int


class GraphAnalytics(BaseModel):
    """
    Full graph analytics payload appended to Postmortem when Neo4j is available.
    All fields are optional — partial results are valid if some queries fail.
    """
    hostile_pairs: list[HostilePair] = Field(default_factory=list)
    influence_chain: list[InfluenceNode] = Field(default_factory=list)
    coalition_evolution: list[CoalitionEvolution] = Field(default_factory=list)
    interrupt_chain: list[InterruptEvent] = Field(default_factory=list)
    cross_sim_patterns: list[CrossSimPattern] = Field(default_factory=list)
    neo4j_available: bool = False
