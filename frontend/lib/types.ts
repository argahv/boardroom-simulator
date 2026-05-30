export type ModelTemperature = "stable" | "volatile";

export type EnvFlags = {
  hidden_motives: boolean;
  time_pressure: boolean;
  external_leaks: boolean;
  deadlock_risk: boolean;
};

export type Stakeholder = {
  id: string;
  name: string;
  role: string;
  focus: string;
  incentive_tuning: number;
  hidden_agenda: string;
  tag?: string | null;
  sim_count?: number;
  total_turns?: number;
  templates?: string[];
  evolution_pending?: boolean;
  // Unified persona fields (optional for backwards compat with legacy records)
  backstory?: string;
  stance?: AgentStance;
  personality?: PersonalityProfile;
  tools?: string[];
};

export type SimulationCreate = {
  background: string;
  primary_goal: string;
  stakeholders: Stakeholder[];
  voltage: number;
  env_flags: EnvFlags;
  model_temperature: ModelTemperature;
};

export type ActionType =
  | "statement"
  | "question"
  | "challenge"
  | "compromise"
  | "coalition_signal"
  | "interrupt"
  | "escalate"
  | "vote"
  | "walkaway";

export type InterruptType = "cut_off" | "reframe" | "pile_on" | "deflect";

export type Turn = {
  turn_index: number;
  stakeholder_id: string;
  stakeholder_name: string;
  role: string;
  content: string;
  internal_reasoning: string;
  action_type: ActionType;
  interrupt_type?: InterruptType | null;
  directed_at?: string | null;
  coalition_with?: string | null;
  leverage_gained?: boolean;
  emotional_tone?: string | null;
  is_human?: boolean;
};

export type HeatmapState = {
  commercial_gain: number;
  tech_integrity: number;
  legal_safety: number;
  recommendation: string;
};

export type CoalitionSignal = {
  agent_a: string;
  agent_b: string;
  issue: string;
};

export type LeverageShift = {
  turn_index: number;
  from_agent: string;
  to_agent: string;
  reason: string;
};

export type ConflictPoint = {
  step: number;
  label: string;
  type: "intro" | "clash" | "closure" | "neutral";
};

export type LeaderboardEntry = {
  agent_id: string;
  name: string;
  score: number;
  delta: number;
  delta_reason: string;
  rank: number;
};

export type SimulationState = {
  simulation_id: string;
  config: SimulationCreate;
  turns: Turn[];
  heatmap: HeatmapState;
  sentiment: number[];
  event_log: string[];
  conflict_timeline: ConflictPoint[];
  active_speaker_id?: string | null;
  status: "idle" | "running" | "complete";
  mocked?: boolean;
  coalitions: CoalitionSignal[];
  leverage_shifts: LeverageShift[];
  deadlock_risk_score: number;
  current_agenda_item: number;
  runtime_status?: "idle" | "ai_turn" | "awaiting_human" | "complete";
  player_mode?: boolean;
  state_version?: number;
  leaderboard?: LeaderboardEntry[];
  winning_context?: string;
};

export type StrategyCard = {
  objection: string;
  counter: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
};

export type AlignmentDelta = {
  stakeholder_id: string;
  name: string;
  role: string;
  delta: number;
  quote: string;
};

export type TopologyNode = {
  id: string;
  label: string;
  kind: "root" | "objection" | "resolution";
  parents: string[];
};

export type TerminationResult = {
  reason: string;
  outcome_type: string;
  total_turns: number;
  summary?: string;
  confidence?: number;
  vote_breakdown?: Record<string, number>;
  judge_notes?: string;
  walkaway_party?: string;
  agreed_issues?: Array<{ issue?: string; value?: string; parties?: string[] }>;
};

export type TopicSummary = {
  topic: string;
  first_raised_turn?: number;
  last_discussed_turn?: number;
  mention_count?: number;
  proposers?: string[];
  positions?: Record<string, string>;
  resolved?: boolean;
  resolution?: string;
};

export type StakeholderReport = {
  agent_id?: string;
  name: string;
  role?: string;
  stance?: string;
  initial_position?: string;
  final_position?: string;
  position_shifts?: number;
  total_turns?: number;
  dominant_action?: string;
  alignment_delta?: number;
  leverage_trajectory?: string;
  key_statements?: string[];
  goals_achieved?: string[];
  goals_unmet?: string[];
};

export type KeyMoment = {
  turn: number;
  kind?: string;
  type?: string;
  description?: string;
  actors?: string[];
  stakeholders?: string[];
  impact?: string;
};

export type SocialDynamicsSummary = {
  trust_arc?: { turn: number; value: number }[];
  tension_arc?: { turn: number; value: number }[];
  leverage_arc?: { turn: number; value: number }[];
  avg_trust?: number;
  avg_tension?: number;
  peak_tension?: number;
  peak_tension_turn?: number;
  coalition_count?: number;
  deadlock_episodes?: number;
  dominant_agent?: string;
};

export type VoteEvent = {
  turn: number;
  agent_id: string;
  position: string;
  rationale: string;
};

export type JudgeEvent = {
  turn: number;
  verdict: string;
  reasoning: string;
  criteria_evaluations: Record<string, string>;
};

export type Postmortem = {
  simulation_id: string;
  confidence_score: number;
  confidence_trend: number;
  unanticipated_objections: number;
  unanticipated_note: string;
  consensus_rating: number;
  objection_topology: TopologyNode[];
  alignment_deltas: AlignmentDelta[];
  strategy_cards: StrategyCard[];
  mocked?: boolean;
  summary?: string;
  verdict?: string;
  end_reason?: string;
  termination?: TerminationResult;
  topics?: TopicSummary[];
  stakeholder_reports?: StakeholderReport[];
  key_moments?: KeyMoment[];
  social_dynamics?: SocialDynamicsSummary;
  lessons_learned?: string[];
  vote_events?: VoteEvent[];
  judge_events?: JudgeEvent[];
  narrative_arc?: string[];
  what_could_have_changed?: string[];
  topic_agreement_rate?: number;
  graph_analytics?: Record<string, unknown>;
};

// SSE event types from /stream
export type StreamTurnEvent = {
  type: "turn";
  turn: Turn;
  state_summary: {
    heatmap: HeatmapState;
    active_speaker_id: string | null;
    deadlock_risk_score: number;
    coalitions: CoalitionSignal[];
    leverage_shifts: LeverageShift[];
    event_log: string[];
    sentiment: number[];
    turn_count: number;
    leaderboard?: LeaderboardEntry[];
    winning_context?: string;
    trust_matrix?: Record<string, Record<string, number>>;
    leverage_scores?: Record<string, number>;
    runtime_status?: "idle" | "ai_turn" | "awaiting_human" | "complete";
  };
};

export type StreamDoneEvent = {
  type: "done";
  reason?: string;
  outcome_type?: "agreement" | "impasse" | "walkaway" | "judge_ruling" | "no_decision";
  summary?: string;
  confidence?: number;
  total_turns?: number;
  vote_breakdown?: Record<string, number>;
  agreed_issues?: Array<{issue?: string; value?: string; parties?: string[]}>;
  judge_notes?: string;
  walkaway_party?: string;
  state?: SimulationState;
};

export type StreamErrorEvent = {
  type: "error";
  message: string;
};

export type StreamEvent = StreamTurnEvent | StreamDoneEvent | StreamErrorEvent;

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type AsyncJob = {
  id: string;
  type: "simulation" | "postmortem";
  status: JobStatus;
  simulation_id: string;
  idempotency_key: string;
  rq_job_id?: string | null;
  result?: unknown;
  error?: string | null;
  created_at: number;
  updated_at: number;
};

export type JobResponse = {
  job: AsyncJob;
};

// ═══════════════════════════════════════════════════════════════════════════
// Agentic Architecture Types (user-defined config, engine has zero opinions)
// ═══════════════════════════════════════════════════════════════════════════

export type AgentStance = "champion" | "detractor" | "neutral" | "moderator" | "wildcard";

export type Subject = {
  name: string;
  description: string;
  attributes: Record<string, string | number | boolean>;
  evidence_items: string[];
  stakes_description: string;
};

export type PersonalityProfile = {
  aggressiveness: number;
  empathy: number;
  stubbornness: number;
  verbosity: number;
};

export type CustomActionDef = {
  name: string;
  description: string;
  trust_delta: number;
  leverage_delta: number;
};

export type ActionSpace = {
  actions: CustomActionDef[];
  default_trust_deltas: Record<string, number>;
  default_leverage_deltas: Record<string, number>;
};

export type SpeakerRules = {
  mode: "moderator_led" | "alternating" | "freeform" | "weighed_random";
};

export type VoteCondition = {
  type: "vote";
  voters: string[];
  threshold: number;
  max_turns: number;
};

export type TimeoutCondition = {
  type: "timeout";
  max_normal_turns: number;
};

export type JudgeCondition = {
  type: "judge";
  judge_id: string;
  criteria: string[];
};

export type ConsensusCondition = {
  type: "consensus";
  sensitivity: "diplomatic" | "balanced" | "sensitive";
  detection_mode: "both" | "agreement_only" | "deadlock_only";
  max_turns: number;
};

export type HybridCondition = {
  type: "hybrid";
  conditions: (VoteCondition | ConsensusCondition | JudgeCondition)[];
  max_turns: number;
};

export type EndCondition = VoteCondition | TimeoutCondition | JudgeCondition
  | ConsensusCondition | HybridCondition;

export type AgentConfig = {
  id: string;
  name: string;
  role: string;
  backstory: string;
  stance: AgentStance;
  personality: PersonalityProfile;
  hidden_agenda: string;
  tools: string[];
};

export type SimulationConfig = {
  subject: Subject;
  stakeholders: AgentConfig[];
  action_space: ActionSpace;
  speaker_rules: SpeakerRules;
  end_condition: EndCondition;
  system_prompt_template: string;
  voltage: number;
  player_mode: boolean;
  env_flags: Record<string, boolean>;
  model_temperature: string;
  auto_research?: boolean;
  research_topics?: string[];
  inject_knowledge?: boolean;
};

export type DocumentMeta = {
  id: string;
  persona_id: string;
  filename: string;
  size_bytes: number;
  content_type: string;
  status: "pending" | "ready" | "failed";
  created_at: string;
};

export type KnowledgeQueryResult = {
  results: Array<{
    chunk_id: string;
    text: string;
    score: number;
    metadata: any;
  }>;
};

// ═══════════════════════════════════════════════════════════════════════════
// State Snapshot types (from behavior_engine -> SSE state_snapshot events)
// ═══════════════════════════════════════════════════════════════════════════

export type RelationshipEntry = {
  trust: number;
  fear: number;
  admiration: number;
  rivalry: number;
  alliance: boolean;
  dependency: number;
};

export type SocialPhysicsSnapshot = {
  trust: number;
  leverage: number;
  tension: number;
  dominance: number;
  credibility: number;
  momentum: number;
  triggers: string[];
};

export type AgentStateSnapshot = {
  emotion: Record<string, number>;
  confidence: number;
  certainty: number;
  focus: string;
  goal_priority?: number;
  modulation?: {
    interrupt_bias: number;
    challenge_bias: number;
    compromise_bias: number;
    coalition_bias: number;
    escalate_bias: number;
    statement_bias: number;
    question_bias: number;
    urgency_modifier: number;
  };
};

export type StateSnapshotData = {
  turn_count: number;
  relationship_matrix: Record<string, Record<string, RelationshipEntry>>;
  social_physics: Record<string, SocialPhysicsSnapshot>;
  agent_states: Record<string, AgentStateSnapshot>;
  agent_plans?: Record<string, Array<{
    goal_text: string;
    status: string;
    confidence: number;
    subgoal_count: number;
    completed_subgoals: number;
  }>>;
};

export type StateSnapshotEvent = {
  type: "state_snapshot";
  turn_index: number;
  data: StateSnapshotData;
};

// ═══════════════════════════════════════════════════════════════════════════
// Analytics
// ═══════════════════════════════════════════════════════════════════════════

export type SimulationAnalytics = {
  total_simulations: number;
  total_turns: number;
  avg_voltage: number;
  top_personas: [string, number][];
  stance_distribution: Record<string, number>;
};

// ═══════════════════════════════════════════════════════════════════════════
// Evolution
// ═══════════════════════════════════════════════════════════════════════════

export type EvolutionProposal = {
  id: string;
  persona_id: string;
  simulation_id: string;
  proposed_deltas: string;  // JSON-serialized trait deltas
  before_snapshot: string;  // JSON-serialized current personality
  status: "pending" | "approved" | "rejected";
  applied_at: string | null;
  created_at: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard Analytics (from GET /analytics/dashboard)
// ═══════════════════════════════════════════════════════════════════════════

export type KpiOverview = {
  total_simulations: number;
  total_turns: number;
  avg_voltage: number;
  avg_participants: number;
  completion_rate: string;
  total_postmortems: number;
  sims_per_month: { month: string; count: number }[];
};

export type SocialDynamicsData = {
  trust_arcs: { simulation_id: string; subject_name: string; points: { turn: number; value: number }[] }[];
  tension_arcs: { simulation_id: string; subject_name: string; points: { turn: number; value: number }[] }[];
  leverage_arcs: { simulation_id: string; subject_name: string; points: { turn: number; value: number }[] }[];
  peak_tension_summary: { max_value: number; simulation_id: string; turn: number } | null;
  dominant_agent_frequency: Record<string, number>;
};

export type AgentIntelligenceData = {
  agents: {
    name: string;
    role: string;
    total_sims: number;
    total_turns: number;
    avg_turn_count: number;
    stances: string[];
  }[];
};

export type ActionDistributionData = {
  total_by_type: Record<string, number>;
  per_simulation: {
    simulation_id: string;
    subject_name: string;
    breakdown: Record<string, number>;
  }[];
  by_stance: Record<string, Record<string, number>>;
};

export type RelationNode = {
  id: string;
  name: string;
  sim_count: number;
};

export type RelationEdge = {
  source: string;
  target: string;
  trust: number;
  fear: number;
  rivalry: number;
};

export type RelationshipNetworkData = {
  nodes: RelationNode[];
  edges: RelationEdge[];
};

export type EmotionalAnalyticsData = {
  emotion_distribution: Record<string, number>;
  trajectory: {
    turn: number;
    simulation_id: string;
    anger: number;
    fear: number;
    joy: number;
    shame: number;
    surprise: number;
  }[];
};

export type SimulationOutcomesData = {
  status_breakdown: Record<string, number>;
  voltage_distribution: { range: string; count: number }[];
  avg_turns_per_status: Record<string, number>;
  model_temp_comparison: { temperature: string; status: string; count: number }[];
};

export type TimelineMoment = {
  turn: number;
  kind: string;
  description: string;
  actors: string[];
  simulation_id: string;
  subject_name: string;
};

export type TemporalTimelineData = {
  moments: TimelineMoment[];
  topic_counts: { topic: string; count: number }[];
};

export type DashboardAnalytics = {
  kpi: KpiOverview;
  social_dynamics: SocialDynamicsData;
  agent_intelligence: AgentIntelligenceData;
  action_distribution: ActionDistributionData;
  relationship_network: RelationshipNetworkData;
  emotional_analytics: EmotionalAnalyticsData;
  simulation_outcomes: SimulationOutcomesData;
  temporal_timeline: TemporalTimelineData;
};
