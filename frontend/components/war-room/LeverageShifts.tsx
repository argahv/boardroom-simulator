"use client";

import { Avatar, initialsFromName } from "@/components/Avatar";

interface LeverageShiftsProps {
  turn: number;
  stakeholders: { id: string; name: string }[];
}

export function LeverageShifts({ turn, stakeholders }: LeverageShiftsProps) {
  const events =
    turn > 3 && stakeholders.length >= 2
      ? [
          {
            from: stakeholders[1]?.name ?? "",
            to: stakeholders[0]?.name ?? "",
            delta: (turn % 5) + 1,
            reason: "Gained positional advantage from recent exchange",
            t: turn - 1,
          },
        ]
      : [];

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Leverage shifts</span>
        <span className="text-[11px] text-muted">Power transfers</span>
      </div>
      <div className="flex flex-col gap-[10px]">
        {events.length === 0 && (
          <span className="text-[12px] italic text-muted">Balanced — no shifts yet.</span>
        )}
        {events.map((e, i) => (
          <div
            key={i}
            className="rounded-lg border border-hairline bg-canvas p-[10px]"
          >
            <div className="mb-1 flex items-center gap-2">
              <Avatar initials={initialsFromName(e.from)} size={24} accent="ink" />
              <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                <path d="M1 5h16M13 1l4 4-4 4" stroke="var(--color-ink)" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <Avatar initials={initialsFromName(e.to)} size={24} accent="coral" />
              <span className="ml-auto font-mono text-[12px] text-primary">+{e.delta}</span>
            </div>
            <div className="text-[12px] text-muted">{e.reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
