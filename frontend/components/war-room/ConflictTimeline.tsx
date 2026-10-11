"use client";

import type { RoomPoint } from "@/lib/use-simulation-state";

interface ConflictTimelineProps {
  /** Current room turn index (0-based). */
  turn: number;
  totalTurns: number;
  /** Snapshot history up to the current turn. */
  simState?: { roomHistory?: RoomPoint[] } | null;
  dark?: boolean;
}

const TENSION_COLOR = "var(--color-primary)";
const DEADLOCK_COLOR = "var(--color-accent-amber)";

function linePoints(points: RoomPoint[], key: "tension" | "deadlockRisk", x: (t: number) => number) {
  return points
    .filter((p) => p[key] !== null)
    .map((p) => `${x(p.turn).toFixed(2)},${(100 - Math.max(0, Math.min(1, p[key] ?? 0)) * 100).toFixed(2)}`)
    .join(" ");
}

export function ConflictTimeline({ turn, totalTurns, simState, dark = false }: ConflictTimelineProps) {
  const total = Math.max(totalTurns, 1);
  const pct = Math.min(100, ((turn + 1) / total) * 100);
  const x = (t: number) => Math.min(100, ((t + 1) / total) * 100);

  const points = (simState?.roomHistory ?? []).filter((p) => p.turn >= 0);
  const hasTension = points.some((p) => p.tension !== null);
  const hasDeadlock = points.some((p) => p.deadlockRisk !== null);
  const last = points[points.length - 1];
  const muted = dark ? "text-canvas/50" : "text-muted";

  return (
    <div className={`rounded-xl px-[18px] py-[14px] ${dark ? 'bg-surface-dark text-canvas' : 'bg-surface-card text-ink'}`}>
      <div className="mb-[10px] flex items-baseline justify-between gap-3">
        <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${muted}`}>
          Timeline · turn {turn + 1} / {totalTurns}
        </span>
        {last && (hasTension || hasDeadlock) && (
          <span className="flex items-center gap-3 font-mono text-[10px]">
            {last.tension !== null && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-[2px] w-3" style={{ background: TENSION_COLOR }} />
                <span className={muted}>tension</span> {Math.round(last.tension * 100)}%
              </span>
            )}
            {last.deadlockRisk !== null && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-[2px] w-3" style={{ background: DEADLOCK_COLOR }} />
                <span className={muted}>deadlock</span> {Math.round(last.deadlockRisk * 100)}%
              </span>
            )}
          </span>
        )}
      </div>

      {(hasTension || hasDeadlock) && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="mb-[6px] block h-[40px] w-full"
          role="img"
          aria-label="Room tension and deadlock risk by turn"
        >
          {/* 60%: the deadlock-risk level at which agents change tactics */}
          <line x1="0" x2="100" y1="40" y2="40" stroke="var(--color-hairline)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          {hasDeadlock && (
            <polyline
              points={linePoints(points, "deadlockRisk", x)}
              fill="none"
              stroke={DEADLOCK_COLOR}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {hasTension && (
            <polyline
              points={linePoints(points, "tension", x)}
              fill="none"
              stroke={TENSION_COLOR}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}

      <div className={`relative h-3 rounded-full ${dark ? 'bg-[#262320]' : 'bg-ink/10'}`}>
        <div
          className="absolute inset-0 rounded-full transition-all duration-[600ms]"
          style={{ width: `${pct}%`, background: dark ? 'var(--color-primary)' : 'var(--color-ink)' }}
        />
      </div>
    </div>
  );
}
