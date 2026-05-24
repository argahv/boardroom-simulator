"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSimulationReplay } from "@/lib/api";
import type {
  StateSnapshotData,
  SocialPhysicsSnapshot,
  AgentStateSnapshot,
  StateSnapshotEvent,
} from "@/lib/types";

// ── Options ────────────────────────────────────────────────

export type UseSimulationStateOptions = {
  mode?: "live" | "replay";
  events?: Record<string, unknown>[];
  simulationId?: string;
  turnIndex?: number;
};

// ── Hook ───────────────────────────────────────────────────

export function useSimulationState(options: UseSimulationStateOptions): SimulationStateData {
  const { mode = "live", events, simulationId, turnIndex } = options;

  const [cachedSnapshots, setCachedSnapshots] = useState<StateSnapshotEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "replay" || !simulationId) {
      setCachedSnapshots([]);
      return;
    }
    setLoading(true);
    setError(null);
    fetchSimulationReplay(simulationId)
      .then((data) => {
        setCachedSnapshots(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err instanceof Error ? err.message : "Failed to fetch replay data");
        setLoading(false);
      });
  }, [mode, simulationId]);

  const computed = useMemo(() => {
    let rawSnapshots: { turn_index: number; data: StateSnapshotData }[];

    if (mode === "live") {
      rawSnapshots = (events ?? []).filter(
        (e): e is { type: "state_snapshot"; turn_index: number; data: StateSnapshotData } =>
          e.type === "state_snapshot" && typeof e.turn_index === "number"
      );
    } else {
      rawSnapshots = cachedSnapshots;
    }

    let effectiveSnapshots: { turn_index: number; data: StateSnapshotData }[];
    let latestData: StateSnapshotData | null;

    if (mode === "replay" && turnIndex !== undefined) {
      effectiveSnapshots = rawSnapshots.filter((s) => s.turn_index <= turnIndex);
      latestData = rawSnapshots.find((s) => s.turn_index === turnIndex)?.data ?? null;
    } else {
      effectiveSnapshots = rawSnapshots;
      latestData = rawSnapshots[rawSnapshots.length - 1]?.data ?? null;
    }

    // ── Time-series ─────────────────────────────────────────────
    const trustHistory: TrustPoint[] = [];
    const sentimentHistory: SentimentPoint[] = [];
    const leverageHistory: { turn: number; agent: string; leverage: number }[] = [];

    for (const snap of effectiveSnapshots) {
      const d = snap.data;
      const turn = snap.turn_index;

      const relMat = d.relationship_matrix ?? {};
      for (const [from, targets] of Object.entries(relMat)) {
        for (const [to, entry] of Object.entries(targets)) {
          trustHistory.push({ turn, from, to, trust: entry.trust });
        }
      }

      const spEntries = Object.values(d.social_physics ?? {});
      const avgSentiment =
        spEntries.length > 0
          ? spEntries.reduce((s, sp) => s + (sp.trust ?? 0.5), 0) / spEntries.length
          : 0.5;
      sentimentHistory.push({ turn, value: avgSentiment });

      for (const [agent, sp] of Object.entries(d.social_physics ?? {})) {
        leverageHistory.push({ turn, agent, leverage: sp.leverage });
      }
    }

    // ── Latest values ─────────────────────────────────────────────
    const trustMatrix: Record<string, Record<string, number>> = {};
    if (latestData?.relationship_matrix) {
      for (const [from, targets] of Object.entries(latestData.relationship_matrix)) {
        trustMatrix[from] = {};
        for (const [to, entry] of Object.entries(targets)) {
          trustMatrix[from][to] = entry.trust;
        }
      }
    }

    const socialPhysics = latestData?.social_physics ?? {};
    const agentIds = Object.keys(socialPhysics);

    const leaderboard = agentIds
      .map((id) => {
        const sp = socialPhysics[id];
        return {
          agent: id,
          score: Math.round((sp.credibility * 0.4 + sp.trust * 0.3 + sp.momentum * 0.3) * 100),
          delta: 0,
          leverage: sp.leverage,
          tension: sp.tension,
          dominance: sp.dominance,
          credibility: sp.credibility,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, i, arr) => ({
        ...entry,
        delta: i > 0 ? entry.score - arr[i - 1].score : 0,
        rank: i + 1,
      }));

    const leverageScores: Record<string, number> = {};
    for (const [id, sp] of Object.entries(socialPhysics)) {
      leverageScores[id] = sp.leverage;
    }

    const coalitions = computeCoalitions(effectiveSnapshots);

    const agentPlans: Record<string, Array<{goal_text: string; status: string; confidence: number; subgoal_count: number; completed_subgoals: number}>> =
      latestData?.agent_plans ?? {};

    return {
      latestSnapshot: latestData,
      snapshots: effectiveSnapshots,
      trustHistory,
      sentimentHistory,
      leverageHistory,
      trustMatrix,
      leaderboard,
      leverageScores,
      coalitions,
      socialPhysics,
      agentStates: latestData?.agent_states ?? {},
      totalTurns: rawSnapshots[rawSnapshots.length - 1]?.data.turn_count ?? 0,
      getAgentState: (id: string) => latestData?.agent_states?.[id] ?? null,
      getSocialPhysics: (id: string) => socialPhysics[id] ?? null,
      agentPlans,
    };
  }, [mode, events, cachedSnapshots, turnIndex]);

  return {
    ...computed,
    loading: mode === "replay" ? loading : false,
    error: mode === "replay" ? error : null,
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

  useEffect(() => {
    if (!isPlaying) return;
    if (currentTurn >= totalTurns - 1) {
      setIsPlaying(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      setCurrentTurn((t) => Math.min(totalTurns - 1, t + 1));
    }, 3800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentTurn, totalTurns]);

  const play = useCallback(() => setIsPlaying(true), []);
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

  return { play, pause, stepForward, stepBack, goToTurn, isPlaying, currentTurn, totalTurns };
}

// ── Derived data ─────────────────────────────────────────────

function computeCoalitions(
  snapshots: { turn_index: number; data: StateSnapshotData }[]
): CoalitionDisplay[] {
  const seen = new Set<string>();
  const result: CoalitionDisplay[] = [];

  for (const snap of snapshots) {
    const relMat = snap.data.relationship_matrix ?? {};
    for (const [a, targets] of Object.entries(relMat)) {
      for (const [b, entry] of Object.entries(targets)) {
        if (entry.alliance && !seen.has(`${a}-${b}`) && !seen.has(`${b}-${a}`)) {
          seen.add(`${a}-${b}`);
          const issue = snap.data.agent_states?.[a]?.focus ?? "alignment";
          result.push({
            agentA: a,
            agentB: b,
            strength: entry.trust,
            issue,
            formedTurn: snap.turn_index,
          });
        }
      }
    }
  }

  return result;
}

// ── Types ────────────────────────────────────────────────────

export type TrustPoint = {
  turn: number;
  from: string;
  to: string;
  trust: number;
};

export type SentimentPoint = {
  turn: number;
  value: number;
};

export type LeaderboardEntry = {
  agent: string;
  score: number;
  delta: number;
  rank: number;
  leverage: number;
  tension: number;
  dominance: number;
  credibility: number;
};

export type CoalitionDisplay = {
  agentA: string;
  agentB: string;
  strength: number;
  issue: string;
  formedTurn: number;
};

export type StateSnapshot = StateSnapshotData;

export type SimulationStateData = {
  latestSnapshot: StateSnapshotData | null;
  snapshots: { turn_index: number; data: StateSnapshotData }[];
  trustHistory: TrustPoint[];
  sentimentHistory: SentimentPoint[];
  leverageHistory: { turn: number; agent: string; leverage: number }[];
  trustMatrix: Record<string, Record<string, number>>;
  leaderboard: LeaderboardEntry[];
  leverageScores: Record<string, number>;
  coalitions: CoalitionDisplay[];
  socialPhysics: Record<string, SocialPhysicsSnapshot>;
  agentStates: Record<string, AgentStateSnapshot>;
  totalTurns: number;
  getAgentState: (id: string) => AgentStateSnapshot | null;
  getSocialPhysics: (id: string) => SocialPhysicsSnapshot | null;
  agentPlans: Record<string, Array<{goal_text: string; status: string; confidence: number; subgoal_count: number; completed_subgoals: number}>>;
  loading: boolean;
  error: string | null;
};
