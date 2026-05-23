"use client";

import { Avatar, initialsFromName } from "@/components/Avatar";

interface CoalitionTrackerProps {
  current?: { speaker: string; content: string };
}

export function CoalitionTracker({ current }: CoalitionTrackerProps) {
  const active: { pair: string[]; issue: string }[] = [];
  if (current) {
    active.push({ pair: [current.speaker, "Moderator"], issue: current.content.slice(0, 60) + "…" });
  }

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Coalitions</span>
        <span className="text-[11px] text-muted">{active.length} formed</span>
      </div>
      <div className="flex flex-col gap-[10px]">
        {active.length === 0 && (
          <span className="text-[12px] italic text-muted">None yet — room is still individual.</span>
        )}
        {active.map((c, i) => (
          <div
            key={i}
            className="flex items-center gap-[10px] rounded-lg border border-hairline bg-canvas px-3 py-[10px]"
          >
            <div className="flex">
              <Avatar initials={initialsFromName(c.pair[0])} size={28} />
              <div className="-ml-[10px]">
                <Avatar initials={initialsFromName(c.pair[1])} size={28} accent="teal" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">
                {c.pair[0].split(" ")[0]} + {c.pair[1].split(" ")[0]}
              </div>
              <div className="truncate text-[11px] text-muted">{c.issue}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
