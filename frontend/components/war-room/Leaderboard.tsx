"use client";

import { Avatar, initialsFromName } from "@/components/Avatar";

interface StakeholderScore {
  id: string;
  name: string;
  score: number;
  delta: number;
  reason: string;
}

interface LeaderboardProps {
  stakeholders: { id: string; name: string; stance: string }[];
  turn: number;
}

export function Leaderboard({ stakeholders, turn }: LeaderboardProps) {
  const board: StakeholderScore[] = stakeholders.map((s, i) => ({
    id: s.id,
    name: s.name,
    score: 50 + Math.round((turn + i * 3) * 1.5),
    delta: turn > 0 ? Math.round(Math.sin(turn + i) * 5) : 0,
    reason:
      s.stance === "champion"
        ? "Driving the narrative"
        : s.stance === "detractor"
          ? "Challenging assumptions"
          : "Observing",
  }));

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Who's winning</span>
        <span className="text-[11px] text-muted">Live score</span>
      </div>
      <div className="flex flex-col gap-2">
        {board.map((row, i) => {
          const isTop = i === 0;
          return (
            <div
              key={row.id}
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
                #{i + 1}
              </div>
              <Avatar
                initials={initialsFromName(row.name)}
                size={28}
                accent={isTop ? "coral" : "ink"}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{row.name.split(" ")[0]}</div>
                <div
                  className={`truncate text-[11px] ${
                    isTop ? "text-canvas/50" : "text-muted"
                  }`}
                >
                  {row.reason}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[14px]">{row.score}</div>
                <div
                  className={`font-mono text-[11px] ${
                    row.delta > 0
                      ? isTop
                        ? "text-[#a3d3ae]"
                        : "text-secondary"
                      : "text-error"
                  }`}
                >
                  {row.delta > 0 ? "▲" : "▼"} {Math.abs(row.delta)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
