"use client";

interface ConflictTimelineProps {
  turn: number;
  totalTurns: number;
  dark?: boolean;
}

export function ConflictTimeline({ turn, totalTurns, dark = false }: ConflictTimelineProps) {
  const pct = Math.min(100, ((turn + 1) / Math.max(totalTurns, 1)) * 100);
  return (
    <div className={`rounded-xl px-[18px] py-[14px] ${dark ? 'bg-surface-dark text-canvas' : 'bg-surface-card text-ink'}`}>
      <div className="mb-[10px] flex items-baseline justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${dark ? 'text-canvas/50' : 'text-muted'}`}>
          Timeline · turn {turn + 1} / {totalTurns}
        </span>
      </div>
      <div className={`relative h-3 rounded-full ${dark ? 'bg-[#262320]' : 'bg-ink/10'}`}>
        <div
          className="absolute inset-0 rounded-full transition-all duration-[600ms]"
          style={{ width: `${pct}%`, background: dark ? 'var(--color-primary)' : 'var(--color-ink)' }}
        />
      </div>
    </div>
  );
}
