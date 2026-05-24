"use client";

import { Avatar, initialsFromName } from "@/components/Avatar";

interface LeaderboardEntry {
  agent: string;
  score: number;
  delta: number;
  rank: number;
  leverage: number;
  tension: number;
  credibility: number;
}

interface LeaderboardProps {
  leaderboard?: LeaderboardEntry[];
  nameMap?: Record<string, string>;
}

export function Leaderboard({ leaderboard, nameMap }: LeaderboardProps) {
  if (!leaderboard || leaderboard.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
        <div className="mb-[14px] flex items-baseline justify-between">
          <span className="text-[13px] font-semibold text-ink">Who's winning</span>
          <span className="text-[11px] text-muted">Live score</span>
        </div>
        <div className="flex h-[80px] items-center justify-center">
          <span className="text-[12px] italic text-muted">Awaiting data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Who's winning</span>
        <span className="text-[11px] text-muted">Live score</span>
      </div>
      <div className="flex flex-col gap-2">
        {leaderboard.map((row, i) => {
          const isTop = i === 0;
          const displayName = nameMap?.[row.agent] ?? row.agent;
          return (
            <div
              key={row.agent}
              className={`flex items-center gap-[10px] rounded-lg border px-3 py-[10px] ${
                isTop
                  ? "border-ink bg-ink text-canvas"
                  : "border-hairline bg-canvas text-ink"
              }`}
            >
              <div
                className={`w-6 font-display text-[22px] ${
                  isTop ? "text-canvas/50" : "text-muted"
                }`}
              >
                #{row.rank}
              </div>
              <Avatar
                initials={initialsFromName(displayName)}
                size={28}
                accent={isTop ? "coral" : "ink"}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{displayName.split(" ")[0]}</div>
                <div
                  className={`truncate text-[11px] ${
                    isTop ? "text-canvas/50" : "text-muted"
                  }`}
                >
                  credibility {Math.round(row.credibility * 100)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[14px]">{row.score}</div>
                <div
                  className={`font-mono text-[11px] ${
                    row.delta >= 0
                      ? isTop
                        ? "text-[#a3d3ae]"
                        : "text-secondary"
                      : "text-error"
                  }`}
                >
                  {row.delta >= 0 ? "▲" : "▼"} {Math.abs(row.delta)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
