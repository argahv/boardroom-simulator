"use client";

import type { ReactNode } from "react";
import type { SimulationStateData } from "@/lib/use-simulation-state";

interface RoomStatePanelProps {
  simState?: SimulationStateData;
  nameMap?: Record<string, string>;
  focusAgentId?: string | null;
}

const SOURCE_BADGE: Record<string, { label: string; className: string; title: string }> = {
  pressure: {
    label: "pressure",
    className: "bg-accent-amber/20 text-ink",
    title: "Goal added by pressure during the meeting",
  },
  hidden: {
    label: "hidden",
    className: "bg-primary/15 text-primary",
    title: "From the hidden agenda: pursued quietly, not stated to the room",
  },
};

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const color = pct >= 60 ? "bg-primary" : pct >= 35 ? "bg-accent-amber" : "bg-secondary";
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-[12px] font-medium text-ink">{label}</span>
        <span className="font-mono text-[12px] text-ink">{pct}%</span>
      </div>
      <div className="h-[6px] overflow-hidden rounded-full bg-ink/10">
        <div className={`h-full rounded-full transition-all duration-[500ms] ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-muted">{hint}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{children}</div>
  );
}

export function RoomStatePanel({ simState, nameMap, focusAgentId }: RoomStatePanelProps) {
  const resolveName = (id: string) => nameMap?.[id] ?? id;

  const header = (
    <div className="mb-[14px] flex items-baseline justify-between">
      <span className="text-[13px] font-semibold text-ink">Room state</span>
      <span className="text-[11px] text-muted">Goals and pressures</span>
    </div>
  );

  if (!simState?.latestSnapshot) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
        {header}
        <div className="flex h-[60px] items-center justify-center">
          <span className="text-[12px] italic text-muted">Awaiting data…</span>
        </div>
      </div>
    );
  }

  const { deadlockRisk, timePressure, departed, agentGoals, privateThoughts, archetypes } = simState;
  const departedSet = new Set(departed);

  const goalAgents = Object.keys(agentGoals)
    .filter((id) => agentGoals[id]?.length > 0)
    .sort((a, b) => {
      if (a === focusAgentId) return -1;
      if (b === focusAgentId) return 1;
      return Number(departedSet.has(a)) - Number(departedSet.has(b));
    });

  const thought = focusAgentId ? privateThoughts[focusAgentId] : undefined;
  const publicPosition = thought?.public_position?.trim();
  // The backend's thought snapshot carries a strategy hint; a private concern only when it sends one.
  const privateText = thought?.private_concern?.trim() || thought?.strategy_hint?.trim();
  const privateLabel = thought?.private_concern?.trim() ? "Private concern" : "Private strategy";

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      {header}
      <div className="flex flex-col gap-[14px]">
        {(deadlockRisk !== null || timePressure !== null) && (
          <div className="flex flex-col gap-[10px]">
            {deadlockRisk !== null && (
              <Meter label="Deadlock risk" value={deadlockRisk} hint="Tension, distrust and rivalries combined" />
            )}
            {timePressure !== null && (
              <Meter
                label="Time pressure"
                value={timePressure}
                hint={simState.maxTurns ? `Rises toward the ${simState.maxTurns}-turn limit` : "Rises toward the turn limit"}
              />
            )}
          </div>
        )}

        {departed.length > 0 && (
          <div>
            <SectionLabel>Left the room</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {departed.map((id) => (
                <span key={id} className="rounded-full bg-ink/5 px-2 py-[2px] text-[11px] text-ink line-through decoration-muted">
                  {resolveName(id)}
                </span>
              ))}
            </div>
          </div>
        )}

        {focusAgentId && (
          <div>
            <SectionLabel>{resolveName(focusAgentId)} · said vs held</SectionLabel>
            {!publicPosition && !privateText ? (
              <span className="text-[12px] italic text-muted">No position recorded yet.</span>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                <div className="rounded-lg border border-hairline bg-canvas px-3 py-2">
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Public position</div>
                  <div className="text-[12px] leading-relaxed text-ink">
                    {publicPosition || <span className="italic text-muted">Not stated</span>}
                  </div>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">{privateLabel}</div>
                  <div className="text-[12px] leading-relaxed text-ink">
                    {privateText || <span className="italic text-muted">None recorded</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <SectionLabel>Top goals</SectionLabel>
          {goalAgents.length === 0 ? (
            <span className="text-[12px] italic text-muted">No goals reported yet.</span>
          ) : (
            <div className="flex flex-col gap-2">
              {goalAgents.map((id) => {
                const goals = [...agentGoals[id]].sort((a, b) => b.priority - a.priority).slice(0, 2);
                const isFocus = id === focusAgentId;
                const left = departedSet.has(id);
                return (
                  <div
                    key={id}
                    className={`rounded-lg border px-3 py-2 ${
                      isFocus ? "border-ink/40 bg-canvas" : "border-hairline bg-canvas"
                    } ${left ? "opacity-60" : ""}`}
                  >
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] font-medium text-ink">
                        {resolveName(id)}
                        {left && <span className="ml-1 text-[10px] font-normal text-muted">(left)</span>}
                      </span>
                      {archetypes[id] && (
                        <span className="shrink-0 font-mono text-[10px] capitalize text-muted">{archetypes[id]}</span>
                      )}
                    </div>
                    <ul className="flex flex-col gap-1">
                      {goals.map((g, i) => {
                        const badge = SOURCE_BADGE[g.source];
                        return (
                          <li key={`${g.goal_text}-${i}`} className="flex items-start gap-2 text-[11px] leading-snug text-ink/80">
                            <span className="mt-[1px] shrink-0 font-mono text-[10px] text-muted" title="Goal priority (0-5)">
                              {typeof g.priority === "number" ? g.priority.toFixed(1) : "–"}
                            </span>
                            <span className="min-w-0 flex-1">{g.goal_text}</span>
                            {badge && (
                              <span
                                className={`shrink-0 rounded px-1 py-[1px] font-mono text-[9px] uppercase ${badge.className}`}
                                title={badge.title}
                              >
                                {badge.label}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
