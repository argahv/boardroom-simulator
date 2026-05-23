"use client";

interface IncentiveHeatmapProps {
  turn: number;
  turns?: { speaker: string; stance?: string }[];
}

export function IncentiveHeatmap({ turn, turns }: IncentiveHeatmapProps) {
  const championCount = turns?.filter((t) => t.stance === "champion").length ?? 0;
  const detractorCount = turns?.filter((t) => t.stance === "detractor").length ?? 0;
  const totalTurns = turns?.length || 1;

  const bars = [
    {
      label: "Debate Engagement",
      value: Math.min(96, Math.max(20, 50 + totalTurns * 2)),
      hint: `${totalTurns} turns completed`,
    },
    {
      label: "Stance Conflict",
      value: Math.min(96, Math.max(20, 50 + ((championCount - detractorCount) / Math.max(totalTurns, 1)) * 20)),
      hint: `${championCount} champion / ${detractorCount} detractor turns`,
    },
    {
      label: "Voltage",
      value: Math.min(96, Math.max(20, 50 + Math.sin(turn * 0.3) * 15)),
      hint: "Debate intensity",
    },
  ];

  const barColor = (v: number) =>
    v >= 60 ? "bg-secondary" : v >= 35 ? "bg-accent-amber" : "bg-primary";

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Incentive heatmap</span>
        <span className="text-[11px] text-muted">Where the room is pulling</span>
      </div>
      <div className="flex flex-col gap-[14px]">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="mb-1 flex justify-between">
              <span className="text-[13px] font-medium text-ink">{b.label}</span>
              <span className="font-mono text-[12px] text-ink">{Math.round(b.value)}%</span>
            </div>
            <div className="h-[6px] overflow-hidden rounded-full bg-ink/10">
              <div
                className={`h-full rounded-full transition-all duration-[500ms] ${barColor(b.value)}`}
                style={{ width: `${b.value}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-muted">{b.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
