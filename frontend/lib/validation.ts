import { z } from "zod/v4";

const HeatmapStateSchema = z.object({
  commercial_gain: z.number(),
  tech_integrity: z.number(),
  legal_safety: z.number(),
  recommendation: z.string(),
});

const CoalitionSignalSchema = z.object({
  agent_a: z.string(),
  agent_b: z.string(),
  issue: z.string(),
});

const LeverageShiftSchema = z.object({
  turn_index: z.number(),
  from_agent: z.string(),
  to_agent: z.string(),
  reason: z.string(),
});

const LeaderboardEntrySchema = z.object({
  agent_id: z.string(),
  name: z.string(),
  score: z.number(),
  delta: z.number(),
  delta_reason: z.string(),
  rank: z.number(),
});

const ConflictPointSchema = z.object({
  step: z.number(),
  label: z.string(),
  type: z.enum(["intro", "clash", "closure", "neutral"]),
});

const TurnSchema = z.object({
  turn_index: z.number(),
  stakeholder_id: z.string(),
  stakeholder_name: z.string(),
  role: z.string(),
  content: z.string(),
  internal_reasoning: z.string(),
  action_type: z.string(),
  interrupt_type: z.string().nullable().optional(),
  directed_at: z.string().nullable().optional(),
  coalition_with: z.string().nullable().optional(),
  leverage_gained: z.boolean().optional(),
  emotional_tone: z.string().nullable().optional(),
  is_human: z.boolean().optional(),
});

const StakeholderSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  focus: z.string(),
  incentive_tuning: z.number(),
  hidden_agenda: z.string(),
  tag: z.string().nullable().optional(),
});

const SimulationConfigSchema = z.object({
  background: z.string(),
  primary_goal: z.string(),
  stakeholders: z.array(StakeholderSchema),
  voltage: z.number(),
});

export const SimulationStateSchema = z.object({
  simulation_id: z.string(),
  config: SimulationConfigSchema,
  turns: z.array(TurnSchema),
  heatmap: HeatmapStateSchema,
  sentiment: z.array(z.number()),
  event_log: z.array(z.string()),
  conflict_timeline: z.array(ConflictPointSchema).optional().default([]),
  active_speaker_id: z.string().nullable().optional(),
  status: z.enum(["idle", "running", "complete"]),
  mocked: z.boolean().optional(),
  coalitions: z.array(CoalitionSignalSchema).default([]),
  leverage_shifts: z.array(LeverageShiftSchema).default([]),
  deadlock_risk_score: z.number().default(0),
  current_agenda_item: z.number().default(0),
  runtime_status: z.enum(["idle", "ai_turn", "awaiting_human", "complete"]).optional(),
  player_mode: z.boolean().optional(),
  state_version: z.number().optional(),
  leaderboard: z.array(LeaderboardEntrySchema).optional(),
  winning_context: z.string().optional(),
});

export type ValidatedSimulationState = z.infer<typeof SimulationStateSchema>;

export function validateSimulationState(data: unknown): ValidatedSimulationState {
  return SimulationStateSchema.parse(data);
}

export function safeValidateSimulationState(data: unknown): { ok: true; data: ValidatedSimulationState } | { ok: false; error: string } {
  const result = SimulationStateSchema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, error: result.error.message };
}
