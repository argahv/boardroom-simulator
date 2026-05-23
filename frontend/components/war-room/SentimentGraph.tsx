"use client";

interface SentimentGraphProps {
  turn: number;
  totalTurns: number;
}

export function SentimentGraph({ turn, totalTurns }: SentimentGraphProps) {
  const data = Array.from({ length: totalTurns }, (_, i) => ({
    tone: Math.sin(i * 0.7) * 0.5 + (i % 3 === 0 ? -0.3 : 0.2),
  }));

  const aggressiveCount = data.filter((x, i) => i <= turn && x.tone < -0.3).length;

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Sentiment by turn</span>
        <span className="text-[11px] text-muted">Aggressive ↔ aligned</span>
      </div>
      <div className="flex h-[90px] items-end gap-[2px] border-y border-hairline px-0 py-2">
        {data.map((e, i) => {
          const filled = i <= turn;
          const h = (Math.abs(e.tone) / 1) * 38;
          const pos = e.tone >= 0;
          return (
            <div key={i} className="flex h-full flex-1 flex-col items-center">
              <div className="flex w-full flex-1 items-end">
                {pos && (
                  <div
                    className={`w-full rounded-t-sm ${filled ? "bg-secondary" : "bg-hairline"}`}
                    style={{ height: h }}
                  />
                )}
              </div>
              <div className="h-px w-full bg-hairline" />
              <div className="flex w-full flex-1 items-start">
                {!pos && (
                  <div
                    className={`w-full rounded-b-sm ${filled ? "bg-error" : "bg-hairline"}`}
                    style={{ height: h }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>T0</span>
        <span className="text-[10px] text-error">{aggressiveCount} aggressive turns</span>
        <span>T{totalTurns - 1}</span>
      </div>
    </div>
  );
}
