"use client";

interface TrustLeveragePanelProps {
  trustScores?: Record<string, number>;
  leverageScores?: Record<string, number>;
  nameMap?: Record<string, string>;
}

// Scores arrive as 0–1 from the behavior engine; older data may already be 0–100.
const toPct = (v: number | undefined) => {
  if (v === undefined || Number.isNaN(v)) return 50;
  return Math.round(v <= 1 ? v * 100 : v);
};

export default function TrustLeveragePanel({ trustScores = {}, leverageScores = {}, nameMap = {} }: TrustLeveragePanelProps) {
  const agents = [...new Set([...Object.keys(trustScores), ...Object.keys(leverageScores)])];
  if (agents.length === 0) return <div className="text-sm text-zinc-500">No data</div>;

  return (
    <div className="space-y-2 text-sm">
      {agents.map((a) => {
        const trust = toPct(trustScores[a]);
        const lev = toPct(leverageScores[a]);
        return (
          <div key={a} className="rounded border p-2">
            <div className="mb-1 truncate font-medium" title={nameMap[a] ?? a}>{nameMap[a] ?? a}</div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 text-xs">Trust</span>
              <div className="h-2 w-16 rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${trust}%` }} />
              </div>
              <span className="w-6 text-xs tabular-nums">{trust}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 text-xs">Lev</span>
              <div className="h-2 w-16 rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${lev}%` }} />
              </div>
              <span className="w-6 text-xs tabular-nums">{lev}</span>
            </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
