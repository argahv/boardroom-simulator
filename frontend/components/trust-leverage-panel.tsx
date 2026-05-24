"use client";

interface TrustLeveragePanelProps {
  trustScores?: Record<string, number>;
  leverageScores?: Record<string, number>;
}

export default function TrustLeveragePanel({ trustScores = {}, leverageScores = {} }: TrustLeveragePanelProps) {
  const agents = [...new Set([...Object.keys(trustScores), ...Object.keys(leverageScores)])];
  if (agents.length === 0) return <div className="text-sm text-zinc-500">No data</div>;

  return (
    <div className="space-y-2 text-sm">
      {agents.map((a) => (
        <div key={a} className="flex items-center gap-3 rounded border p-2">
          <span className="w-16 font-medium">{a}</span>
          <div className="flex items-center gap-2">
            <span className="w-8 text-xs">Trust</span>
            <div className="h-2 w-16 rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-green-500" style={{width: `${(trustScores[a]||0.5)*100}%`}} />
            </div>
            <span className="w-6 text-xs tabular-nums">{Math.round((trustScores[a]||0.5)*100)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-8 text-xs">Lev</span>
            <div className="h-2 w-16 rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-amber-500" style={{width: `${leverageScores[a]||50}%`}} />
            </div>
            <span className="w-6 text-xs tabular-nums">{leverageScores[a]||50}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
