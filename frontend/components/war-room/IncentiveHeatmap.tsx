"use client";

interface IncentiveHeatmapProps {
  socialPhysics?: Record<string, { trust: number; leverage: number; tension: number }>;
  totalAgents?: number;
}

export function IncentiveHeatmap({ socialPhysics, totalAgents = 0 }: IncentiveHeatmapProps) {
  const spValues = Object.values(socialPhysics ?? {});

  const engagement = Math.min(96, Math.max(20, totalAgents * 15 + 20));

  const avgTension =
    spValues.length > 0
      ? spValues.reduce((s, sp) => s + sp.tension, 0) / spValues.length
      : 0.5;
  const stanceConflict = Math.min(96, Math.max(20, Math.round(avgTension * 100)));

  const avgTrust =
    spValues.length > 0
      ? spValues.reduce((s, sp) => s + sp.trust, 0) / spValues.length
      : 0.5;
  const voltage = Math.min(96, Math.max(20, Math.round((1 - avgTrust) * 100)));

  const bars = [
    {
      label: "Debate Engagement",
      value: engagement,
      hint: `${totalAgents} participants`,
    },
    {
      label: "Stance Conflict",
      value: stanceConflict,
      hint: `${spValues.length > 0 ? Math.round(avgTension * 100) : "--"}% avg tension`,
    },
    {
      label: "Voltage",
      value: voltage,
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
