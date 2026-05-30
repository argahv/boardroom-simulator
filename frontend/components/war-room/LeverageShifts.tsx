"use client";

import { useMemo } from "react";
import { Avatar, initialsFromName } from "@/components/Avatar";

interface LeverageShiftsProps {
  leverageHistory?: { turn: number; agent: string; leverage: number }[];
  nameMap?: Record<string, string>;
}

interface ShiftEvent {
  from: string;
  to: string;
  delta: number;
  reason: string;
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
          result.push({
            from: delta > 0 ? "" : agent,
            to: delta > 0 ? agent : "",
            delta: Math.abs(delta),
            reason: delta > 0 ? "Gained leverage" : "Lost leverage",
            t: history[i].turn,
          });
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
          <span className="text-[11px] text-muted">Power transfers</span>
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
        <span className="text-[11px] text-muted">Power transfers</span>
      </div>
      <div className="flex flex-col gap-[10px]">
        {events.map((e, i) => {
          const fromName = e.from ? resolveName(e.from) : "System";
          const toName = e.to ? resolveName(e.to) : "System";
          return (
            <div
              key={i}
              className="rounded-lg border border-hairline bg-canvas p-[10px] animate-enter-stagger"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="mb-1 flex items-center gap-2">
                {e.from && <Avatar initials={initialsFromName(fromName)} size={24} accent="ink" />}
                <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                  <path d="M1 5h16M13 1l4 4-4 4" stroke="var(--color-ink)" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                {e.to && <Avatar initials={initialsFromName(toName)} size={24} accent="coral" />}
                <span className="ml-auto font-mono text-[12px] text-primary">+{e.delta.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[12px] text-muted">
                <span>{e.reason}</span>
                <span className="font-mono text-[10px]">T{e.t}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
