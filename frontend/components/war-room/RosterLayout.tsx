"use client";

import { useMemo } from "react";
import { NarrativeTimeline } from "./NarrativeTimeline";
import { TranscriptStream, type Turn } from "./TranscriptStream";
import { EventLog } from "./EventLog";
import { IncentiveHeatmap } from "./IncentiveHeatmap";
import { SentimentGraph } from "./SentimentGraph";
import { LeverageShifts } from "./LeverageShifts";
import { CoalitionTracker } from "./CoalitionTracker";
import { StateDiffPanel } from "./StateDiffPanel";
import { EmotionalInfluencePanel } from "./EmotionalInfluencePanel";
import { StrategicPlanPanel } from "./StrategicPlanPanel";
import { Avatar, initialsFromName } from "@/components/Avatar";
import EmotionIndicator from "@/components/emotion-indicator";
import CognitiveStatePanel from "@/components/cognitive-state-panel";
import TrustLeveragePanel from "@/components/trust-leverage-panel";
import type { SimulationStateData } from "@/lib/use-simulation-state";

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
  current?: Turn;
  playing: boolean;
  stakeholders: RosterStakeholder[];
  speakerId: string | null;
  eventLog: EventLogEntry[];
  turns: Turn[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  totalTurns: number;
  simState?: SimulationStateData;
  nameMap?: Record<string, string>;
}

function StakeholderCard({
  s,
  speaking,
  agentState,
}: {
  s: RosterStakeholder;
  speaking: boolean;
  agentState: { emotion?: Record<string, number> } | null | undefined;
}) {
  return (
    <div
      data-speaking={speaking}
      className={`rounded-xl p-[14px] transition-all duration-200 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-md ${
        speaking
          ? "bg-ink text-canvas shadow-[0_0_20px_rgba(237,111,92,0.20)]"
          : "bg-surface-card text-ink border border-hairline"
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
        <div className="flex flex-col items-end gap-1">
          {agentState?.emotion && (
            <EmotionIndicator emotions={agentState.emotion} size="sm" />
          )}
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
  simState,
  nameMap,
}: RosterLayoutProps) {
  const speakerAgentId = useMemo(() => {
    if (!speakerId) return null;
    const s = stakeholders.find((st) => st.name === speakerId);
    return s?.id ?? null;
  }, [speakerId, stakeholders]);

  const avgTrustPerAgent: Record<string, number> = useMemo(() => {
    const tm = simState?.trustMatrix;
    if (!tm) return {};
    const result: Record<string, number> = {};
    for (const [from, targets] of Object.entries(tm)) {
      let sum = 0;
      let count = 0;
      for (const to of Object.keys(targets)) {
        if (to !== from) {
          sum += targets[to];
          count++;
        }
      }
      result[from] = count > 0 ? sum / count : 0.5;
    }
    return result;
  }, [simState?.trustMatrix]);

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
          const agentState = simState?.getAgentState(s.id);
          return (
            <StakeholderCard
              key={s.id}
              s={s}
              speaking={speaking}
              agentState={agentState}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <NarrativeTimeline turn={turn} totalTurns={totalTurns} />
        <TranscriptStream turns={turns} playing={playing} scrollRef={scrollRef} />
        <EventLog events={eventLog} />
      </div>

      {/* ── Right column: data panels ── */}
      <div className="flex flex-col gap-[14px]">
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)", marginBottom: -4 }}>
          Intelligence
        </div>
        <IncentiveHeatmap
          socialPhysics={simState?.socialPhysics}
          totalAgents={stakeholders.length}
        />
        <TrustLeveragePanel
          trustScores={avgTrustPerAgent}
          leverageScores={simState?.leverageScores}
        />
        {speakerAgentId && (
          <CognitiveStatePanel
            agentId={nameMap?.[speakerAgentId] ?? speakerAgentId}
            emotions={simState?.getAgentState(speakerAgentId)?.emotion as { anger: number; fear: number; joy: number; shame: number; surprise: number } | undefined}
            confidence={simState?.getAgentState(speakerAgentId)?.confidence}
            certainty={simState?.getAgentState(speakerAgentId)?.certainty}
            focus={simState?.getAgentState(speakerAgentId)?.focus}
          />
        )}
        <SentimentGraph sentimentHistory={simState?.sentimentHistory} />
        <LeverageShifts leverageHistory={simState?.leverageHistory} nameMap={nameMap} />
        <CoalitionTracker coalitions={simState?.coalitions} nameMap={nameMap} />
        {speakerAgentId && (
          <EmotionalInfluencePanel
            modulation={simState?.getAgentState(speakerAgentId)?.modulation ?? undefined}
            agentName={nameMap?.[speakerAgentId] ?? speakerAgentId}
          />
        )}
        <StrategicPlanPanel
          plans={simState?.agentPlans}
          nameMap={nameMap}
        />
        <StateDiffPanel
          snapshots={simState?.snapshots ?? []}
          currentTurn={turn}
          nameMap={nameMap}
        />
      </div>
    </div>
  );
}
