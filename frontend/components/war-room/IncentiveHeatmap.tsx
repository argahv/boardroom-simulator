"use client";

interface IncentiveHeatmapProps {
  socialPhysics?: Record<string, { trust: number; leverage: number; tension: number; dominance?: number }>;
  /** Kept for existing call sites; the bars only use snapshot data. */
  totalAgents?: number;
  /** Backend deadlock score (0-1) from the latest snapshot. */
  deadlockRisk?: number | null;
}

type Direction = "higher-worse" | "higher-better" | "neutral";

const avg = (values: number[]) => {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length ? finite.reduce((s, v) => s + v, 0) / finite.length : null;
};

function barColor(pct: number, direction: Direction) {
  if (direction === "neutral") return "bg-ink/60";
  const bad = direction === "higher-worse" ? pct : 100 - pct;
  return bad >= 60 ? "bg-primary" : bad >= 35 ? "bg-accent-amber" : "bg-secondary";
}

export function IncentiveHeatmap({ socialPhysics, deadlockRisk }: IncentiveHeatmapProps) {
  const sp = Object.values(socialPhysics ?? {});
  const leverages = sp.map((s) => s.leverage).filter((v) => Number.isFinite(v));
  const leverageSpread = leverages.length > 1 ? Math.max(...leverages) - Math.min(...leverages) : null;

  const bars: { label: string; value: number | null; hint: string; direction: Direction; hidden?: boolean }[] = [
    {
      label: "Tension",
      value: avg(sp.map((s) => s.tension)),
      hint: "Room average",
      direction: "higher-worse",
    },
    {
      label: "Deadlock risk",
      value: typeof deadlockRisk === "number" ? deadlockRisk : null,
      hint: "Tension, distrust and rivalries combined",
      direction: "higher-worse",
      // Callers that don't pass the score get no row rather than an empty one.
      hidden: deadlockRisk === undefined,
    },
    {
      label: "Trust",
      value: avg(sp.map((s) => s.trust)),
      hint: "Room average",
      direction: "higher-better",
    },
    {
      label: "Leverage",
      value: avg(leverages),
      hint:
        leverageSpread === null
          ? "Room average"
          : `Room average · ${Math.round(leverageSpread * 100)} pt gap between strongest and weakest`,
      direction: "neutral",
    },
  ];

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Room pressure</span>
        <span className="text-[11px] text-muted">As of this turn</span>
      </div>
      <div className="flex flex-col gap-[14px]">
        {bars.filter((b) => !b.hidden).map((b) => {
          const pct = b.value === null ? null : Math.max(0, Math.min(100, Math.round(b.value * 100)));
          return (
            <div key={b.label}>
              <div className="mb-1 flex justify-between">
                <span className="text-[13px] font-medium text-ink">{b.label}</span>
                <span className="font-mono text-[12px] text-ink">{pct === null ? "—" : `${pct}%`}</span>
              </div>
              <div className="h-[6px] overflow-hidden rounded-full bg-ink/10">
                {pct !== null && (
                  <div
                    className={`h-full rounded-full transition-all duration-[500ms] ${barColor(pct, b.direction)}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
              <div className="mt-1 text-[11px] text-muted">{pct === null ? "No data yet" : b.hint}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
