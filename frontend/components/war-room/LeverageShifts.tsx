"use client";

import { useMemo } from "react";
import { Avatar, initialsFromName } from "@/components/Avatar";

interface LeverageShiftsProps {
  leverageHistory?: { turn: number; agent: string; leverage: number }[];
  nameMap?: Record<string, string>;
}

interface ShiftEvent {
  agent: string;
  /** Signed change in leverage between consecutive snapshots. */
  delta: number;
  t: number;
}

export function LeverageShifts({ leverageHistory, nameMap }: LeverageShiftsProps) {
  const events: ShiftEvent[] = useMemo(() => {
    if (!leverageHistory || leverageHistory.length < 2) return [];

    const byAgent: Record<string, { turn: number; leverage: number }[]> = {};
    for (const lh of leverageHistory) {
      if (!byAgent[lh.agent]) byAgent[lh.agent] = [];
      byAgent[lh.agent].push({ turn: lh.turn, leverage: lh.leverage });
    }

    const result: ShiftEvent[] = [];

    for (const [agent, history] of Object.entries(byAgent)) {
      history.sort((a, b) => a.turn - b.turn);
      for (let i = 1; i < history.length; i++) {
        const delta = history[i].leverage - history[i - 1].leverage;
        if (Math.abs(delta) > 0.1) {
          result.push({ agent, delta, t: history[i].turn });
        }
      }
    }

    return result.sort((a, b) => b.t - a.t).slice(0, 5);
  }, [leverageHistory]);

  const resolveName = (id: string) => nameMap?.[id] ?? id;

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
        <div className="mb-[14px] flex items-baseline justify-between">
          <span className="text-[13px] font-semibold text-ink">Leverage shifts</span>
          <span className="text-[11px] text-muted">Moves over 10 pts in a turn</span>
        </div>
        <div className="flex flex-col gap-[10px]">
          <span className="text-[12px] italic text-muted">Balanced — no shifts yet.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Leverage shifts</span>
        <span className="text-[11px] text-muted">Moves over 10 pts in a turn</span>
      </div>
      <div className="flex flex-col gap-[10px]">
        {events.map((e, i) => {
          const name = resolveName(e.agent);
          const gained = e.delta > 0;
          return (
            <div
              key={`${e.agent}-${e.t}`}
              className="rounded-lg border border-hairline bg-canvas p-[10px] animate-enter-stagger"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="mb-1 flex items-center gap-2">
                <Avatar initials={initialsFromName(name)} size={24} accent={gained ? "coral" : "ink"} />
                <span className="truncate text-[13px] font-medium text-ink">{name.split(" ")[0]}</span>
                <span className={`ml-auto font-mono text-[12px] ${gained ? "text-primary" : "text-muted"}`}>
                  {gained ? "+" : "−"}{Math.abs(e.delta).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[12px] text-muted">
                <span>{gained ? "Gained leverage" : "Lost leverage"}</span>
                <span className="font-mono text-[10px]">T{e.t + 1}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
