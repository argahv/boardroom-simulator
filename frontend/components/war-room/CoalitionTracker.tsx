"use client";

import { Avatar, initialsFromName } from "@/components/Avatar";
import type { CoalitionDisplay } from "@/lib/use-simulation-state";

interface CoalitionTrackerProps {
  coalitions?: CoalitionDisplay[];
  nameMap?: Record<string, string>;
}

const ACCENTS = ["ink", "teal", "coral"] as const;

export function CoalitionTracker({ coalitions, nameMap }: CoalitionTrackerProps) {
  const active = coalitions ?? [];

  const resolveName = (id: string) => nameMap?.[id] ?? id;

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Coalitions</span>
        <span className="text-[11px] text-muted">{active.length} standing</span>
      </div>
      <div className="flex flex-col gap-[10px]">
        {active.length === 0 && (
          <span className="text-[12px] italic text-muted">None standing — room is still individual.</span>
        )}
        {active.map((c) => {
          const members = c.members?.length ? c.members : [c.agentA, c.agentB];
          const names = members.map(resolveName);
          const strengthPct = c.strength === null ? null : Math.round(c.strength * 100);
          return (
            <div
              key={[...members].sort().join("|")}
              className="flex items-center gap-[10px] rounded-lg border border-hairline bg-canvas px-3 py-[10px]"
            >
              <div className="flex">
                {names.slice(0, 3).map((n, i) => (
                  <div key={members[i]} className={i > 0 ? "-ml-[10px]" : ""}>
                    <Avatar initials={initialsFromName(n)} size={28} accent={ACCENTS[i % ACCENTS.length]} />
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">
                    {names.map((n) => n.split(" ")[0]).join(" + ")}
                  </span>
                  {c.formedTurn !== null && (
                    <span className="shrink-0 font-mono text-[10px] text-muted">
                      {c.formedTurn < 0 ? "from start" : `since T${c.formedTurn + 1}`}
                    </span>
                  )}
                </div>
                {strengthPct !== null && (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                      <div
                        className="h-full rounded-full bg-secondary"
                        style={{ width: `${Math.max(0, Math.min(100, strengthPct))}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-muted" title="Coalition strength; decays each turn">
                      {strengthPct}%
                    </span>
                  </div>
                )}
                {c.issue && (
                  <div className="truncate text-[11px] text-muted" title={c.issue}>
                    {c.issue}
                    {c.pacts > 1 && <span className="ml-1 font-mono text-[10px]">· {c.pacts} pacts</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
