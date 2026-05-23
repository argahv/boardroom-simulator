"use client";

import { ConflictTimeline } from "./ConflictTimeline";
import { TranscriptStream, type V2Turn } from "./TranscriptStream";
import { EventLog } from "./EventLog";
import { IncentiveHeatmap } from "./IncentiveHeatmap";
import { SentimentGraph } from "./SentimentGraph";
import { LeverageShifts } from "./LeverageShifts";
import { CoalitionTracker } from "./CoalitionTracker";
import { Avatar, initialsFromName } from "@/components/Avatar";

interface RosterStakeholder {
  id: string;
  name: string;
  role: string;
  stance: string;
  lastContent: string | null;
}

interface EventLogEntry {
  t: number;
  text: string;
  type: string;
}

interface RosterLayoutProps {
  turn: number;
  current?: V2Turn;
  playing: boolean;
  stakeholders: RosterStakeholder[];
  speakerId: string | null;
  eventLog: EventLogEntry[];
  turns: V2Turn[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  totalTurns: number;
}

export function RosterLayout({
  turn,
  current,
  playing,
  stakeholders,
  speakerId,
  eventLog,
  turns,
  scrollRef,
  totalTurns,
}: RosterLayoutProps) {
  return (
    <div
      className="grid min-h-[calc(100vh-220px)] gap-4 p-4"
      style={{ gridTemplateColumns: "260px 1fr 340px" }}
    >
      <div className="flex flex-col gap-[10px]">
        <span className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
          The room
        </span>
        {stakeholders.map((s) => {
          const speaking = s.name === speakerId;
          return (
            <div
              key={s.id}
              className={`rounded-xl p-[14px] transition-all duration-[240ms] ${
                speaking
                  ? "bg-ink text-canvas"
                  : "bg-surface-card text-ink"
              }`}
            >
              <div className="mb-2 flex items-center gap-[10px]">
                <Avatar
                  initials={initialsFromName(s.name)}
                  size={36}
                  accent={speaking ? "coral" : "ink"}
                  speaking={speaking}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold leading-[1.2]">{s.name}</div>
                  <div
                    className={`text-[11px] leading-[1.3] ${
                      speaking ? "text-canvas/50" : "text-muted"
                    }`}
                  >
                    {s.role || s.stance}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.12em] ${
                    speaking
                      ? "bg-primary text-canvas"
                      : "bg-ink/10 text-muted"
                  }`}
                >
                  {speaking ? "SPEAKING" : s.stance}
                </span>
              </div>
              {s.lastContent && (
                <div
                  className={`line-clamp-2 text-[12px] italic leading-[1.4] ${
                    speaking ? "text-canvas/50" : "text-muted"
                  }`}
                >
                  &ldquo;{s.lastContent}&rdquo;
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <ConflictTimeline turn={turn} totalTurns={totalTurns} />
        <TranscriptStream turns={turns} playing={playing} scrollRef={scrollRef} />
        <EventLog events={eventLog} />
      </div>

      <div className="flex flex-col gap-[14px]">
        <IncentiveHeatmap turn={turn} turns={turns} />
        <SentimentGraph turn={turn} totalTurns={totalTurns} />
        <LeverageShifts turn={turn} stakeholders={stakeholders} />
        <CoalitionTracker current={current} />
      </div>
    </div>
  );
}
