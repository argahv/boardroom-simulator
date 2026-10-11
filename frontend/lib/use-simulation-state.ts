"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSimulationReplay } from "@/lib/api";
import type {
  StateSnapshotData,
  SocialPhysicsSnapshot,
  AgentStateSnapshot,
} from "@/lib/types";

// ── Snapshot shape ─────────────────────────────────────────
// What scheduler.public_state() sends on top of the base StateSnapshotData type.

export type PlanSubgoal = { description: string; status: string };

export type AgentPlan = {
  goal_text: string;
  status: string;
  confidence: number;
  subgoal_count: number;
  completed_subgoals: number;
  subgoals?: PlanSubgoal[];
};

export type AgentGoal = { goal_text: string; priority: number; source: string };

export type PrivateThought = {
  public_position?: string;
  private_concern?: string;
  strategy_hint?: string;
  confidence?: number;
  last_revised?: number;
};

export type BackendCoalition = {
  members: string[];
  issue?: string;
  strength?: number;
  formed_turn?: number;
};

export type RoomSnapshotData = StateSnapshotData & {
  archetypes?: Record<string, string>;
  coalitions?: BackendCoalition[];
  deadlock_risk?: number;
  agent_plans?: Record<string, AgentPlan[]>;
  agent_goals?: Record<string, AgentGoal[]>;
  private_thoughts?: Record<string, PrivateThought>;
  time_pressure?: number;
  max_turns?: number;
  departed?: string[];
};

type Snapshot = { turn_index: number; data: RoomSnapshotData };

const NO_SNAPSHOTS: Snapshot[] = [];

/** How the leaderboard's standing score is built from social physics. */
export const STANDING_FORMULA = "40% credibility + 30% trust + 30% momentum";

function standingScore(sp: SocialPhysicsSnapshot | undefined): number | null {
  if (!sp) return null;
  const v = sp.credibility * 0.4 + sp.trust * 0.3 + sp.momentum * 0.3;
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

function mean(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length ? finite.reduce((s, v) => s + v, 0) / finite.length : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toSnapshots(events: Record<string, unknown>[] | undefined): Snapshot[] {
  if (!events?.length) return NO_SNAPSHOTS;
  const snaps = events.filter(
    (e): e is Snapshot & Record<string, unknown> =>
      e.type === "state_snapshot" && typeof e.turn_index === "number" && !!e.data
  );
  if (!snaps.length) return NO_SNAPSHOTS;
  return snaps
    .map((e) => ({ turn_index: e.turn_index, data: e.data }))
    .sort((a, b) => a.turn_index - b.turn_index);
}

// ── Options ────────────────────────────────────────────────

export type UseSimulationStateOptions = {
  mode?: "live" | "replay";
  /** state_snapshot events. In replay mode, passing any skips the /replay fetch. */
  events?: Record<string, unknown>[];
  simulationId?: string;
  turnIndex?: number;
};

// ── Hook ───────────────────────────────────────────────────

export function useSimulationState(options: UseSimulationStateOptions): SimulationStateData {
  const { mode = "live", events, simulationId, turnIndex } = options;

  const eventSnapshots = useMemo(() => toSnapshots(events), [events]);
  const shouldFetch = mode === "replay" && !!simulationId && eventSnapshots.length === 0;

  const [replay, setReplay] = useState<{ id: string; snapshots: Snapshot[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!shouldFetch || !simulationId) return;
    let cancelled = false;
    fetchSimulationReplay(simulationId)
      .then((data) => {
        if (cancelled) return;
        const snapshots = toSnapshots(data as unknown as Record<string, unknown>[]);
        setReplay({ id: simulationId, snapshots, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReplay({
          id: simulationId,
          snapshots: NO_SNAPSHOTS,
          error: err instanceof Error ? err.message : "Failed to fetch replay data",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetch, simulationId]);

  const fetched = shouldFetch && replay?.id === simulationId ? replay : null;
  const rawSnapshots = shouldFetch ? fetched?.snapshots ?? NO_SNAPSHOTS : eventSnapshots;

  const computed = useMemo(() => {
    // The state as of this turn: the latest snapshot at or before it. Turns without
    // their own snapshot (timeouts, human interjections) show the state they happened in.
    const effectiveSnapshots =
      turnIndex !== undefined ? rawSnapshots.filter((s) => s.turn_index <= turnIndex) : rawSnapshots;
    const latestData = effectiveSnapshots[effectiveSnapshots.length - 1]?.data ?? null;
    const previousData = effectiveSnapshots[effectiveSnapshots.length - 2]?.data ?? null;
    const runData = rawSnapshots[rawSnapshots.length - 1]?.data;

    // ── Time-series ─────────────────────────────────────────────
    const trustHistory: TrustPoint[] = [];
    const sentimentHistory: SentimentPoint[] = [];
    const roomHistory: RoomPoint[] = [];
    const leverageHistory: { turn: number; agent: string; leverage: number }[] = [];

    for (const snap of effectiveSnapshots) {
      const d = snap.data;
      const turn = snap.turn_index;
      if (turn < 0) continue; // initial pre-turn state: not a point on the turn axis

      for (const [from, targets] of Object.entries(d.relationship_matrix ?? {})) {
        for (const [to, entry] of Object.entries(targets)) {
          trustHistory.push({ turn, from, to, trust: entry.trust });
        }
      }

      const sp = Object.values(d.social_physics ?? {});
      const trust = mean(sp.map((x) => x.trust));
      const tension = mean(sp.map((x) => x.tension));
      if (trust !== null) sentimentHistory.push({ turn, value: trust, tension: tension ?? undefined });
      roomHistory.push({
        turn,
        trust,
        tension,
        deadlockRisk: num(d.deadlock_risk),
        timePressure: num(d.time_pressure),
      });

      for (const [agent, s] of Object.entries(d.social_physics ?? {})) {
        leverageHistory.push({ turn, agent, leverage: s.leverage });
      }
    }

    // ── Latest values ─────────────────────────────────────────────
    const trustMatrix: Record<string, Record<string, number>> = {};
    for (const [from, targets] of Object.entries(latestData?.relationship_matrix ?? {})) {
      trustMatrix[from] = {};
      for (const [to, entry] of Object.entries(targets)) {
        trustMatrix[from][to] = entry.trust;
      }
    }

    const socialPhysics = latestData?.social_physics ?? {};
    const departed = Array.isArray(latestData?.departed) ? latestData.departed : [];

    const leaderboard: LeaderboardEntry[] = Object.entries(socialPhysics)
      .map(([id, sp]) => {
        const score = standingScore(sp) ?? 0;
        const prevScore = standingScore(previousData?.social_physics?.[id]);
        return {
          agent: id,
          score,
          prevScore,
          delta: prevScore === null ? 0 : score - prevScore,
          rank: 0,
          leverage: sp.leverage,
          tension: sp.tension,
          dominance: sp.dominance,
          credibility: sp.credibility,
          trust: sp.trust,
          momentum: sp.momentum,
          departed: departed.includes(id),
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

    const leverageScores: Record<string, number> = {};
    for (const [id, sp] of Object.entries(socialPhysics)) {
      leverageScores[id] = sp.leverage;
    }

    return {
      latestSnapshot: latestData,
      snapshots: effectiveSnapshots,
      trustHistory,
      sentimentHistory,
      roomHistory,
      leverageHistory,
      trustMatrix,
      leaderboard,
      leverageScores,
      coalitions: computeCoalitions(effectiveSnapshots),
      socialPhysics,
      agentStates: latestData?.agent_states ?? {},
      totalTurns: runData?.turn_count ?? 0,
      maxTurns: num(runData?.max_turns) ?? undefined,
      getAgentState: (id: string) => latestData?.agent_states?.[id] ?? null,
      getSocialPhysics: (id: string) => socialPhysics[id] ?? null,
      agentPlans: latestData?.agent_plans ?? {},
      deadlockRisk: num(latestData?.deadlock_risk),
      agentGoals: latestData?.agent_goals ?? {},
      privateThoughts: latestData?.private_thoughts ?? {},
      departed,
      timePressure: num(latestData?.time_pressure),
      archetypes: latestData?.archetypes ?? {},
    };
  }, [rawSnapshots, turnIndex]);

  return {
    ...computed,
    loading: shouldFetch && !fetched,
    error: fetched?.error ?? null,
  };
}

// ── Replay Navigation ──────────────────────────────────────

export type ReplayControls = {
  play: () => void;
  pause: () => void;
  stepForward: () => void;
  stepBack: () => void;
  goToTurn: (n: number) => void;
  isPlaying: boolean;
  currentTurn: number;
  totalTurns: number;
};

export function useReplayNavigation(totalTurns: number): ReplayControls {
  const [currentTurn, setCurrentTurn] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const atEnd = currentTurn >= totalTurns - 1;

  useEffect(() => {
    if (!isPlaying || atEnd) return;
    timerRef.current = setTimeout(() => {
      const next = Math.min(totalTurns - 1, currentTurn + 1);
      setCurrentTurn(next);
      if (next >= totalTurns - 1) setIsPlaying(false);
    }, 3800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, atEnd, currentTurn, totalTurns]);

  const play = useCallback(() => setIsPlaying(!atEnd), [atEnd]);
  const pause = useCallback(() => setIsPlaying(false), []);
  const stepForward = useCallback(
    () => setCurrentTurn((t) => Math.min(totalTurns - 1, t + 1)),
    [totalTurns]
  );
  const stepBack = useCallback(
    () => setCurrentTurn((t) => Math.max(0, t - 1)),
    []
  );
  const goToTurn = useCallback(
    (n: number) => setCurrentTurn(Math.max(0, Math.min(totalTurns - 1, n))),
    [totalTurns]
  );

  return { play, pause, stepForward, stepBack, goToTurn, isPlaying: isPlaying && !atEnd, currentTurn, totalTurns };
}

// ── Derived data ─────────────────────────────────────────────

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Coalitions standing in the latest snapshot; ones the backend dissolved simply drop out. */
function computeCoalitions(snapshots: Snapshot[]): CoalitionDisplay[] {
  const latest = snapshots[snapshots.length - 1]?.data;
  if (!latest) return [];

  if (Array.isArray(latest.coalitions)) {
    // The backend keeps one record per signal, so a pair that re-signals has several.
    const byPair = new Map<string, CoalitionDisplay>();
    for (const c of latest.coalitions) {
      const members = Array.from(new Set(c.members ?? [])).filter(Boolean);
      if (members.length < 2) continue;
      const key = [...members].sort().join("|");
      const formedTurn = num(c.formed_turn);
      const strength = num(c.strength);
      const prev = byPair.get(key);
      if (!prev) {
        byPair.set(key, {
          members,
          agentA: members[0],
          agentB: members[1],
          strength,
          issue: c.issue ?? "",
          formedTurn,
          pacts: 1,
        });
        continue;
      }
      const newer = (formedTurn ?? -Infinity) >= (prev.formedTurn ?? -Infinity);
      byPair.set(key, {
        ...prev,
        strength: strength === null ? prev.strength : Math.max(strength, prev.strength ?? 0),
        issue: newer && c.issue ? c.issue : prev.issue,
        formedTurn:
          formedTurn === null ? prev.formedTurn : Math.min(formedTurn, prev.formedTurn ?? formedTurn),
        pacts: prev.pacts + 1,
      });
    }
    return Array.from(byPair.values()).sort((a, b) => (b.formedTurn ?? 0) - (a.formedTurn ?? 0));
  }

  // Runs recorded before snapshots carried `coalitions`: alliances standing right now,
  // dated from the start of their current unbroken run.
  const allied = (data: RoomSnapshotData, a: string, b: string) =>
    !!(data.relationship_matrix?.[a]?.[b]?.alliance || data.relationship_matrix?.[b]?.[a]?.alliance);
  const result = new Map<string, CoalitionDisplay>();
  for (const [a, targets] of Object.entries(latest.relationship_matrix ?? {})) {
    for (const [b, entry] of Object.entries(targets)) {
      const key = pairKey(a, b);
      if (!entry.alliance || result.has(key)) continue;
      let formedTurn = snapshots[snapshots.length - 1].turn_index;
      for (let i = snapshots.length - 2; i >= 0 && allied(snapshots[i].data, a, b); i--) {
        formedTurn = snapshots[i].turn_index;
      }
      result.set(key, { members: [a, b], agentA: a, agentB: b, strength: null, issue: "", formedTurn, pacts: 1 });
    }
  }
  return Array.from(result.values());
}

// ── Types ────────────────────────────────────────────────────

export type TrustPoint = {
  turn: number;
  from: string;
  to: string;
  trust: number;
};

/** Room-average trust (`value`) and tension at a turn. */
export type SentimentPoint = {
  turn: number;
  value: number;
  tension?: number;
};

export type RoomPoint = {
  turn: number;
  trust: number | null;
  tension: number | null;
  deadlockRisk: number | null;
  timePressure: number | null;
};

export type LeaderboardEntry = {
  agent: string;
  /** Standing score, see STANDING_FORMULA. */
  score: number;
  /** Standing in the previous snapshot; null when there is none to compare with. */
  prevScore: number | null;
  /** score - prevScore (0 when prevScore is null). */
  delta: number;
  rank: number;
  leverage: number;
  tension: number;
  dominance: number;
  credibility: number;
  trust: number;
  momentum: number;
  departed: boolean;
};

export type CoalitionDisplay = {
  members: string[];
  agentA: string;
  agentB: string;
  strength: number | null;
  issue: string;
  formedTurn: number | null;
  /** Backend coalition records merged into this one (same members). */
  pacts: number;
};

export type StateSnapshot = RoomSnapshotData;

export type SimulationStateData = {
  latestSnapshot: RoomSnapshotData | null;
  snapshots: Snapshot[];
  trustHistory: TrustPoint[];
  sentimentHistory: SentimentPoint[];
  roomHistory: RoomPoint[];
  leverageHistory: { turn: number; agent: string; leverage: number }[];
  trustMatrix: Record<string, Record<string, number>>;
  leaderboard: LeaderboardEntry[];
  leverageScores: Record<string, number>;
  coalitions: CoalitionDisplay[];
  socialPhysics: Record<string, SocialPhysicsSnapshot>;
  agentStates: Record<string, AgentStateSnapshot>;
  totalTurns: number;
  /** The run's turn limit, from the latest snapshot. */
  maxTurns?: number;
  getAgentState: (id: string) => AgentStateSnapshot | null;
  getSocialPhysics: (id: string) => SocialPhysicsSnapshot | null;
  agentPlans: Record<string, AgentPlan[]>;
  /** Backend deadlock score (0-1): 50% tension, 35% distrust, 15% rivalries. */
  deadlockRisk: number | null;
  agentGoals: Record<string, AgentGoal[]>;
  privateThoughts: Record<string, PrivateThought>;
  departed: string[];
  timePressure: number | null;
  archetypes: Record<string, string>;
  loading: boolean;
  error: string | null;
};
