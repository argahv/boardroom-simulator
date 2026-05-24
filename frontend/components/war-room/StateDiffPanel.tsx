"use client";

import { useMemo, useState } from "react";
import type { StateSnapshotData } from "@/lib/types";

interface DiffEntry {
  field: string;
  from: number;
  to: number;
  delta: number;
  positive: boolean;
}

interface AgentDiff {
  agentId: string;
  agentName: string;
  diffs: DiffEntry[];
  relationshipChanges: string[];
  triggerActivations: string[];
}

interface StateDiffPanelProps {
  snapshots: Array<{ turn_index: number; data: StateSnapshotData }>;
  currentTurn: number;
  nameMap?: Record<string, string>;
}

const SOCIAL_FIELDS: { key: "trust" | "leverage" | "tension" | "dominance" | "credibility" | "momentum"; label: string; higherBetter: boolean }[] = [
  { key: "trust", label: "Trust", higherBetter: true },
  { key: "leverage", label: "Leverage", higherBetter: true },
  { key: "tension", label: "Tension", higherBetter: false },
  { key: "dominance", label: "Dominance", higherBetter: false },
  { key: "credibility", label: "Credibility", higherBetter: true },
  { key: "momentum", label: "Momentum", higherBetter: true },
];

function formatDelta(delta: number): string {
  return delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
}

export function StateDiffPanel({ snapshots, currentTurn, nameMap }: StateDiffPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const diffs = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];

    const currSnap = snapshots.find((s) => s.turn_index === currentTurn);
    if (!currSnap) return [];

    // Turn 0: show starting state
    if (currentTurn === 0) {
      const d = currSnap.data;
      const agentIds = Object.keys(d.social_physics ?? {});
      return agentIds.map((id) => {
        const sp = d.social_physics[id];
        return {
          agentId: id,
          agentName: nameMap?.[id] ?? id,
          diffs: SOCIAL_FIELDS.map((f) => ({
            field: f.label,
            from: sp[f.key],
            to: sp[f.key],
            delta: 0,
            positive: true,
          })),
          relationshipChanges: [],
          triggerActivations: sp.triggers ?? [],
        } satisfies AgentDiff;
      });
    }

    const prevSnap = snapshots.find((s) => s.turn_index === currentTurn - 1);
    if (!prevSnap) return [];

    const curr = currSnap.data;
    const prev = prevSnap.data;
    const agentIds = Object.keys(curr.social_physics ?? {});
    const result: AgentDiff[] = [];

    for (const id of agentIds) {
      const currSp = curr.social_physics[id];
      const prevSp = prev.social_physics[id];
      if (!currSp || !prevSp) continue;

      const agentDiffs: DiffEntry[] = [];
      for (const f of SOCIAL_FIELDS) {
        const from = prevSp[f.key];
        const to = currSp[f.key];
        const delta = to - from;
        if (Math.abs(delta) > 0.02) {
          agentDiffs.push({
            field: f.label,
            from,
            to,
            delta,
            positive: f.higherBetter ? delta > 0 : delta < 0,
          });
        }
      }

      const relChanges: string[] = [];
      const prevRel = prev.relationship_matrix?.[id] ?? {};
      const currRel = curr.relationship_matrix?.[id] ?? {};
      for (const [target, currEntry] of Object.entries(currRel)) {
        const prevEntry = prevRel[target];
        const targetName = nameMap?.[target] ?? target;
        if (prevEntry) {
          if (!prevEntry.alliance && currEntry.alliance) {
            relChanges.push(`Alliance formed with ${targetName}`);
          }
          if (currEntry.rivalry - prevEntry.rivalry > 0.1) {
            relChanges.push(`Rivalry spikes with ${targetName}`);
          }
        }
      }

      const triggers = currSp.triggers ?? [];

      result.push({
        agentId: id,
        agentName: nameMap?.[id] ?? id,
        diffs: agentDiffs,
        relationshipChanges: relChanges,
        triggerActivations: triggers,
      });
    }

    return result;
  }, [snapshots, currentTurn, nameMap]);

  const toggleAgent = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const showStarting = currentTurn === 0;

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">
          {showStarting ? "Initial State" : `Turn ${currentTurn} Changes`}
        </span>
        {!showStarting && (
          <span className="text-[11px] text-muted">
            vs turn {currentTurn - 1}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-[10px]">
        {diffs.length === 0 && (
          <span className="text-[12px] italic text-muted">
            {showStarting ? "No agents loaded." : "No changes this turn."}
          </span>
        )}
        {diffs.map((agent) => {
          const isExpanded = expanded.has(agent.agentId);
          const meaningful =
            agent.diffs.length > 0 ||
            agent.relationshipChanges.length > 0 ||
            agent.triggerActivations.length > 0;

          return (
            <div
              key={agent.agentId}
              className="overflow-hidden rounded-lg border border-hairline bg-canvas"
            >
              <button
                onClick={() => toggleAgent(agent.agentId)}
                className="flex w-full items-center justify-between px-3 py-[10px] text-left text-[13px] font-medium"
              >
                <span>{agent.agentName}</span>
                <span className="flex items-center gap-2">
                  {meaningful && !showStarting && (
                    <span className="rounded-full bg-primary/10 px-2 py-[1px] text-[10px] text-primary">
                      {agent.diffs.length}
                    </span>
                  )}
                  <span
                    className={`text-[10px] text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  >
                    ▾
                  </span>
                </span>
              </button>
              {isExpanded && (
                <div className="border-t border-hairline px-3 py-2 text-[12px]">
                  {!meaningful && (
                    <span className="italic text-muted">No significant changes</span>
                  )}

                  {agent.diffs.length > 0 && (
                    <div className="mb-2 flex flex-col gap-1">
                      {agent.diffs.map((d) => (
                        <div key={d.field} className="flex items-center justify-between">
                          <span className="text-muted">{d.field}</span>
                          <span className={d.positive ? "text-emerald-600" : "text-red-500"}>
                            {d.from.toFixed(2)} → {d.to.toFixed(2)} ({formatDelta(d.delta)})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {agent.relationshipChanges.length > 0 && (
                    <div className="mb-2">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Relations
                      </div>
                      {agent.relationshipChanges.map((rc, i) => (
                        <div key={i} className="text-[11px] text-blue-600">
                          {rc}
                        </div>
                      ))}
                    </div>
                  )}

                  {agent.triggerActivations.length > 0 && (
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Triggers
                      </div>
                      {agent.triggerActivations.map((t, i) => (
                        <div key={i} className="text-[11px] text-amber-600">
                          {t}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
