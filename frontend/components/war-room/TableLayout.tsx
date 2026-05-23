"use client";

import { useMemo } from "react";
import type { V2Turn } from "./TranscriptStream";
import { Avatar, initialsFromName } from "@/components/Avatar";
import { ConflictTimeline } from "./ConflictTimeline";
import { EventLog } from "./EventLog";
import { Leaderboard } from "./Leaderboard";
import { IncentiveHeatmap } from "./IncentiveHeatmap";
import { LeverageShifts } from "./LeverageShifts";

interface TableStakeholder {
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

interface TableLayoutProps {
  turn: number;
  current?: V2Turn;
  playing: boolean;
  stakeholders: TableStakeholder[];
  speakerId: string | null;
  eventLog: EventLogEntry[];
  turns: V2Turn[];
  totalTurns: number;
}

export function TableLayout({
  turn,
  current,
  stakeholders,
  speakerId,
  eventLog,
  turns,
  totalTurns,
}: TableLayoutProps) {
  const positions = useMemo(() => {
    const cx = 50, cy = 50, rx = 38, ry = 30;
    return stakeholders.map((s, i) => {
      const angle = (i / stakeholders.length) * Math.PI * 2 - Math.PI / 2 + Math.PI / stakeholders.length;
      return { id: s.id, x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
    });
  }, [stakeholders]);

  return (
    <div
      className="grid min-h-[calc(100vh-220px)] gap-4 p-4"
      style={{ gridTemplateColumns: "1fr 340px" }}
    >
      <div className="flex flex-col gap-3">
          <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-surface-dark">
          <div
            className="absolute inset-6 rounded-full"
            style={{
              background: "radial-gradient(ellipse at center, #2a2725 0%, #1f1c19 70%, #181715 100%)",
              border: "1px solid #2e2b27",
            }}
          />
          {current && (
            <div className="absolute left-1/2 top-1/2 w-[44%] -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-canvas/50">
                T{String(turn).padStart(2, "0")} · Statement
              </div>
              <div className="font-newsreader text-[22px] leading-[1.25] tracking-[-0.4px] text-canvas">
                &ldquo;{current.content.slice(0, 120)}{current.content.length > 120 ? "…" : ""}&rdquo;
              </div>
              <div className="mt-[14px] text-[12px] text-canvas/50">
                &mdash; {current.speaker}
              </div>
            </div>
          )}
          {!current && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-[0.12em] text-canvas/50">
              Awaiting first turn
            </div>
          )}
          {positions.map((p) => {
            const s = stakeholders.find((st) => st.id === p.id);
            if (!s) return null;
            const speaking = s.name === speakerId;
            return (
              <div
                key={s.id}
                className="absolute text-center"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  transform: `translate(-50%, -50%) scale(${speaking ? 1.12 : 1})`,
                  transition: "transform 300ms cubic-bezier(.4,0,.2,1)",
                }}
              >
                <Avatar
                  initials={initialsFromName(s.name)}
                  size={speaking ? 60 : 52}
                  speaking={speaking}
                />
                <div
                  className={`mt-[6px] text-[13px] font-medium ${
                    speaking ? "text-canvas" : "text-canvas/60"
                  }`}
                >
                  {s.name.split(" ")[0]}
                </div>
                <div className="text-[10px] text-canvas/40">
                  {s.role.split(" ")[0] || s.stance}
                </div>
              </div>
            );
          })}
        </div>
        <ConflictTimeline turn={turn} totalTurns={totalTurns} dark />
        <EventLog events={eventLog} />
      </div>
      <div className="flex flex-col gap-[14px]">
        <Leaderboard stakeholders={stakeholders} turn={turn} />
        <IncentiveHeatmap turn={turn} turns={turns} />
        <LeverageShifts turn={turn} stakeholders={stakeholders} />
      </div>
    </div>
  );
}
