"use client";

import { useMemo } from "react";
import type {
  StateSnapshotData,
  SocialPhysicsSnapshot,
  AgentStateSnapshot,
} from "@/lib/types";

/**
 * Accumulates state_snapshot events from the SSE stream into
 * time-series data + latest values for all dashboard components.
 */
export function useSimulationState(
  sseEvents: Record<string, unknown>[]
): SimulationStateData {
  return useMemo(() => {
    const snapshots = sseEvents.filter(
      (e): e is { type: "state_snapshot"; turn_index: number; data: StateSnapshotData } =>
        e.type === "state_snapshot" && typeof e.turn_index === "number"
    );

    const latest = snapshots[snapshots.length - 1]?.data ?? null;

    // ── Time-series ─────────────────────────────────────────────

    // Trust history: per-pair trust over turns
    const trustHistory: TrustPoint[] = [];
    // Aggregate sentiment (avg of all agent momentum/trust per turn)
    const sentimentHistory: SentimentPoint[] = [];
    // Leverage per agent per turn
    const leverageHistory: { turn: number; agent: string; leverage: number }[] = [];

    for (const snap of snapshots) {
      const d = snap.data;
      const turn = snap.turn_index;

      // Trust — flatten relationship_matrix
      const relMat = d.relationship_matrix ?? {};
      for (const [from, targets] of Object.entries(relMat)) {
        for (const [to, entry] of Object.entries(targets)) {
          trustHistory.push({ turn, from, to, trust: entry.trust });
        }
      }

      // Sentiment = average trust across all pairs or average momentum
      const spEntries = Object.values(d.social_physics ?? {});
      const avgSentiment =
        spEntries.length > 0
          ? spEntries.reduce((s, sp) => s + (sp.trust ?? 0.5), 0) / spEntries.length
          : 0.5;
      sentimentHistory.push({ turn, value: avgSentiment });

      // Leverage per agent
      for (const [agent, sp] of Object.entries(d.social_physics ?? {})) {
        leverageHistory.push({ turn, agent, leverage: sp.leverage });
      }
    }

    // ── Latest values ─────────────────────────────────────────────

    const trustMatrix: Record<string, Record<string, number>> = {};
    if (latest?.relationship_matrix) {
      for (const [from, targets] of Object.entries(latest.relationship_matrix)) {
        trustMatrix[from] = {};
        for (const [to, entry] of Object.entries(targets)) {
          trustMatrix[from][to] = entry.trust;
        }
      }
    }

    const socialPhysics = latest?.social_physics ?? {};
    const agentIds = Object.keys(socialPhysics);

    const leaderboard = agentIds
      .map((id) => {
        const sp = socialPhysics[id];
        return {
          agent: id,
          score: Math.round((sp.credibility * 0.4 + sp.trust * 0.3 + sp.momentum * 0.3) * 100),
          delta: 0, // computed below
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

    const coalitions = computeCoalitions(snapshots);

    return {
      latestSnapshot: latest,
      snapshots,
      trustHistory,
      sentimentHistory,
      leverageHistory,
      trustMatrix,
      leaderboard,
      leverageScores,
      coalitions,
      socialPhysics,
      agentStates: latest?.agent_states ?? {},
      totalTurns: latest?.turn_count ?? 0,
      getAgentState: (id: string) => latest?.agent_states?.[id] ?? null,
      getSocialPhysics: (id: string) => socialPhysics[id] ?? null,
    };
  }, [sseEvents]);
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
};
