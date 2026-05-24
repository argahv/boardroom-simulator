"use client";

import { Avatar, initialsFromName } from "@/components/Avatar";

interface CoalitionEntry {
  agentA: string;
  agentB: string;
  strength: number;
  issue: string;
}

interface CoalitionTrackerProps {
  coalitions?: CoalitionEntry[];
  nameMap?: Record<string, string>;
}

export function CoalitionTracker({ coalitions, nameMap }: CoalitionTrackerProps) {
  const active = coalitions ?? [];

  const resolveName = (id: string) => nameMap?.[id] ?? id;

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
        {active.map((c, i) => {
          const nameA = resolveName(c.agentA);
          const nameB = resolveName(c.agentB);
          return (
            <div
              key={i}
              className="flex items-center gap-[10px] rounded-lg border border-hairline bg-canvas px-3 py-[10px]"
            >
              <div className="flex">
                <Avatar initials={initialsFromName(nameA)} size={28} />
                <div className="-ml-[10px]">
                  <Avatar initials={initialsFromName(nameB)} size={28} accent="teal" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">
                  {nameA.split(" ")[0]} + {nameB.split(" ")[0]}
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-secondary"
                      style={{ width: `${Math.round(c.strength * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted">
                    {Math.round(c.strength * 100)}%
                  </span>
                </div>
                {c.issue && (
                  <div className="truncate text-[11px] text-muted">{c.issue}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
