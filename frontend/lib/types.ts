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
  | "escalate";

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
  };
};

export type StreamDoneEvent = {
  type: "done";
  state: SimulationState;
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
