"use client";

import { Avatar, initialsFromName } from "@/components/Avatar";
import { STANDING_FORMULA } from "@/lib/use-simulation-state";

interface LeaderboardEntry {
  agent: string;
  score: number;
  /** Change vs the agent's standing in the previous snapshot. */
  delta: number;
  prevScore?: number | null;
  rank: number;
  leverage: number;
  tension: number;
  credibility: number;
  trust?: number;
  momentum?: number;
  departed?: boolean;
}

interface LeaderboardProps {
  leaderboard?: LeaderboardEntry[];
  nameMap?: Record<string, string>;
}

function Header() {
  return (
    <div className="mb-[14px]">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Standing</span>
        <span className="font-mono text-[11px] text-muted">Δ vs last snapshot</span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted">standing = {STANDING_FORMULA}</div>
    </div>
  );
}

const pct = (v: number | undefined) => (typeof v === "number" ? Math.round(v * 100) : null);

export function Leaderboard({ leaderboard, nameMap }: LeaderboardProps) {
  if (!leaderboard || leaderboard.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
        <Header />
        <div className="flex h-[80px] items-center justify-center">
          <span className="text-[12px] italic text-muted">Awaiting data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <Header />
      <div className="flex flex-col gap-2">
        {leaderboard.map((row, i) => {
          const isTop = i === 0;
          const displayName = nameMap?.[row.agent] ?? row.agent;
          const hasPrev = row.prevScore !== null && row.prevScore !== undefined;
          const parts = [
            `cred ${pct(row.credibility)}`,
            pct(row.trust) !== null ? `trust ${pct(row.trust)}` : null,
            pct(row.momentum) !== null ? `mom ${pct(row.momentum)}` : null,
          ].filter(Boolean);
          const deltaClass = !hasPrev || row.delta === 0
            ? isTop ? "text-canvas/50" : "text-muted"
            : row.delta > 0
              ? isTop ? "text-[#a3d3ae]" : "text-secondary"
              : "text-error";
          return (
            <div
              key={row.agent}
              className={`flex items-center gap-[10px] rounded-lg border px-3 py-[10px] ${
                isTop
                  ? "border-ink bg-ink text-canvas"
                  : "border-hairline bg-canvas text-ink"
              } ${row.departed ? "opacity-60" : ""}`}
            >
              <div
                className={`w-6 text-[22px] ${
                  isTop ? "text-canvas/50" : "text-muted"
                }`}
                style={{ fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", letterSpacing: "-0.04em" }}
              >
                #{row.rank}
              </div>
              <Avatar
                initials={initialsFromName(displayName)}
                size={28}
                accent={isTop ? "coral" : "ink"}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">
                  {displayName.split(" ")[0]}
                  {row.departed && <span className="ml-1 text-[10px] font-normal">(left)</span>}
                </div>
                <div
                  className={`truncate font-mono text-[10px] ${
                    isTop ? "text-canvas/50" : "text-muted"
                  }`}
                >
                  {parts.join(" · ")}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[14px]">{row.score}</div>
                <div
                  className={`font-mono text-[11px] ${deltaClass}`}
                  title={hasPrev ? `was ${row.prevScore}` : "No earlier snapshot"}
                >
                  {!hasPrev ? "—" : row.delta === 0 ? "±0" : `${row.delta > 0 ? "▲" : "▼"} ${Math.abs(row.delta)}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
