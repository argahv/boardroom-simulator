"use client";

import { useMemo } from "react";
import type { V2Turn } from "./TranscriptStream";
import { Avatar, initialsFromName } from "@/components/Avatar";
import { ConflictTimeline } from "./ConflictTimeline";
import { EventLog } from "./EventLog";
import { Leaderboard } from "./Leaderboard";
import { CoalitionTracker } from "./CoalitionTracker";

interface GraphStakeholder {
  id: string;
  name: string;
  role: string;
  stance: string;
}

interface EventLogEntry {
  t: number;
  text: string;
  type: string;
}

interface GraphLayoutProps {
  turn: number;
  current?: V2Turn;
  playing: boolean;
  stakeholders: GraphStakeholder[];
  speakerId: string | null;
  turns: V2Turn[];
  totalTurns: number;
  eventLog: EventLogEntry[];
}

export function GraphLayout({
  turn,
  current,
  stakeholders,
  speakerId,
  turns,
  totalTurns,
  eventLog,
}: GraphLayoutProps) {
  const positions = useMemo(() => {
    const grid = [
      { x: 30, y: 28 }, { x: 70, y: 30 }, { x: 80, y: 65 },
      { x: 50, y: 78 }, { x: 18, y: 65 },
    ];
    return stakeholders.map((s, i) => ({
      id: s.id,
      x: grid[i % grid.length]?.x ?? 50,
      y: grid[i % grid.length]?.y ?? 50,
    }));
  }, [stakeholders]);

  const edges = useMemo(() => {
    const m: Record<string, number> = {};
    for (let i = 1; i < turns.length; i++) {
      const a = turns[i - 1]?.speaker;
      const b = turns[i]?.speaker;
      if (!a || !b || a === b) continue;
      const key = [a, b].sort().join("-");
      m[key] = (m[key] || 0) + 1;
    }
    return m;
  }, [turns]);

  const coords = (id: string) => positions.find((p) => p.id === id) ?? { x: 50, y: 50 };

  return (
    <div
      className="grid min-h-[calc(100vh-220px)] gap-4 p-4"
      style={{ gridTemplateColumns: "1fr 360px" }}
    >
      <div className="flex flex-col gap-3">
         <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-hairline bg-surface-card">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="dtg" width="4" height="4" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="0.18" fill="var(--color-muted)" opacity="0.4" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#dtg)" />
            {Object.entries(edges).map(([key, count]) => {
              const [a, b] = key.split("-");
              const pa = positions.find((p) => stakeholders.find((s) => s.name === a)?.id === p.id);
              const pb = positions.find((p) => stakeholders.find((s) => s.name === b)?.id === p.id);
              if (!pa || !pb) return null;
              return (
                <line
                  key={key}
                  x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                  stroke="var(--color-ink)"
                  strokeWidth={Math.min(0.15 + count * 0.08, 0.45)}
                  opacity={0.32}
                />
              );
            })}
            {speakerId && (
              <circle
                cx={coords(speakerId).x}
                cy={coords(speakerId).y}
                r={3}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth={0.3}
                opacity={0.6}
              />
            )}
          </svg>

          {stakeholders.map((s) => {
            const p = positions.find((pos) => pos.id === s.id);
            if (!p) return null;
            const speaking = s.name === speakerId;
            return (
              <div
                key={s.id}
                className="absolute text-center"
                style={{
                  left: `${p.x}%`, top: `${p.y}%`,
                  transform: `translate(-50%, -50%) scale(${speaking ? 1.15 : 1})`,
                  transition: "transform 300ms",
                }}
              >
                <Avatar
                  initials={initialsFromName(s.name)}
                  size={speaking ? 56 : 48}
                  speaking={speaking}
                />
                <div className="mt-[6px] inline-block whitespace-nowrap rounded-full border border-hairline bg-canvas px-2 py-[3px] text-[12px] font-medium text-ink">
                  {s.name.split(" ")[0]} ·{" "}
                  <span className="text-muted">{s.role.split(" ")[0] || s.stance}</span>
                </div>
              </div>
            );
          })}

          <div className="absolute bottom-3 left-3 flex gap-4 rounded-full border border-hairline bg-canvas px-[14px] py-2">
            <span className="flex items-center gap-[6px] text-[11px] text-muted">
              <span className="h-[2px] w-[18px] bg-ink" /> exchange
            </span>
            <span className="flex items-center gap-[6px] text-[11px] text-muted">
              <span className="h-[2px] w-[18px] bg-primary" /> coalition
            </span>
            <span className="flex items-center gap-[6px] text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full bg-primary" /> speaking now
            </span>
          </div>

          {current && speakerId && (() => {
            const sp = coords(speakerId);
            const right = sp.x < 50;
            return (
              <div
                className="pointer-events-none absolute rounded-xl border border-hairline bg-canvas px-[14px] py-3 shadow-sm"
                style={{
                  left: right ? `calc(${sp.x}% + 50px)` : "auto",
                  right: !right ? `calc(${100 - sp.x}% + 50px)` : "auto",
                  top: `${sp.y}%`,
                  transform: "translateY(-50%)",
                  maxWidth: 260,
                }}
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                  Statement
                </div>
                <div className="font-newsreader text-[15px] leading-[1.35] tracking-[-0.2px] text-ink">
                  &ldquo;{current.content.slice(0, 120)}{current.content.length > 120 ? "…" : ""}&rdquo;
                </div>
              </div>
            );
          })()}
        </div>

        <ConflictTimeline turn={turn} totalTurns={totalTurns} />
        <EventLog events={eventLog} />
      </div>
      <div className="flex flex-col gap-[14px]">
        <Leaderboard stakeholders={stakeholders} turn={turn} />
        <CoalitionTracker current={current} />
      </div>
    </div>
  );
}
