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
import { RoomStatePanel } from "./RoomStatePanel";
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

// Only champion/detractor carry colour; neutral, moderator and the rest read as muted.
const STANCE_BADGE: Record<string, string> = {
  champion: "bg-primary/15 text-primary",
  detractor: "bg-error-soft text-error",
  wildcard: "bg-accent-amber/20 text-ink",
};

const VOTE_CHIP: Record<string, string> = {
  yes: "bg-secondary/15 text-secondary",
  no: "bg-error-soft text-error",
  abstain: "bg-ink/10 text-muted",
};

const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-mono text-[9px] font-bold uppercase tracking-[0.12em]";

/** Each person's most recent ballot, keyed by agent id. */
function latestVotes(turns: Turn[], stakeholders: RosterStakeholder[]): Record<string, string> {
  const votes: Record<string, string> = {};
  for (const t of turns) {
    if (t.kind !== "agent" || t.action_type !== "vote" || !t.vote) continue;
    const id = t.agent_id ?? stakeholders.find((s) => s.name === t.speaker)?.id;
    if (id) votes[id] = t.vote.toLowerCase();
  }
  return votes;
}

function StakeholderCard({
  s,
  speaking,
  agentState,
  departed,
  vote,
}: {
  s: RosterStakeholder;
  speaking: boolean;
  agentState: { emotion?: Record<string, number> } | null | undefined;
  departed: boolean;
  vote: string | null;
}) {
  return (
    <div
      data-speaking={speaking}
      data-departed={departed}
      className={`rounded-xl p-[14px] transition-all duration-200 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-md ${
        speaking
          ? "bg-ink text-canvas shadow-[0_0_20px_rgba(237,111,92,0.20)]"
          : `bg-surface-card text-ink border border-hairline ${departed ? "opacity-60" : ""}`
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
                : STANCE_BADGE[s.stance] ?? "bg-ink/10 text-muted"
            }`}
          >
            {speaking ? "SPEAKING" : s.stance}
          </span>
        </div>
      </div>
      {(departed || vote) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {departed && (
            <span
              className={`${CHIP} ${speaking ? "bg-canvas/15 text-canvas" : "bg-accent-amber/20 text-ink"}`}
              title="Left the room before the end"
            >
              <span className="material-symbols-outlined text-[12px]" aria-hidden>logout</span>
              Walked out
            </span>
          )}
          {vote && (
            <span className={`${CHIP} ${speaking ? "bg-canvas/15 text-canvas" : VOTE_CHIP[vote] ?? VOTE_CHIP.abstain}`}>
              Voted {vote}
            </span>
          )}
        </div>
      )}
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
  // System rows never hold the floor; speakerId is only set for agent turns.
  const speakerAgentId = useMemo(() => {
    if (!speakerId) return null;
    if (current?.kind === "agent" && current.agent_id) return current.agent_id;
    return stakeholders.find((st) => st.name === speakerId)?.id ?? null;
  }, [speakerId, current, stakeholders]);

  const votes = useMemo(() => latestVotes(turns, stakeholders), [turns, stakeholders]);
  const departed = useMemo(() => new Set(simState?.departed ?? []), [simState?.departed]);

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
    <div className="grid min-h-[calc(100vh-220px)] grid-cols-1 gap-4 p-4 lg:grid-cols-[260px_minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-[10px]">
        <span className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
          The room
        </span>
        {stakeholders.map((s) => {
          const speaking = s.id === speakerAgentId;
          const agentState = simState?.getAgentState(s.id);
          return (
            <StakeholderCard
              key={s.id}
              s={s}
              speaking={speaking}
              agentState={agentState}
              departed={departed.has(s.id)}
              vote={votes[s.id] ?? null}
            />
          );
        })}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <NarrativeTimeline turn={turn} totalTurns={totalTurns} simState={simState} />
        <TranscriptStream turns={turns} playing={playing} scrollRef={scrollRef} />
        <EventLog events={eventLog} />
      </div>

      {/* ── Right column: data panels ── */}
      <div className="flex min-w-0 flex-col gap-[14px]">
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)", marginBottom: -4 }}>
          Intelligence
        </div>
        <RoomStatePanel simState={simState} nameMap={nameMap} focusAgentId={speakerAgentId} />
        <IncentiveHeatmap
          socialPhysics={simState?.socialPhysics}
          totalAgents={stakeholders.length}
          deadlockRisk={simState?.deadlockRisk}
        />
        <TrustLeveragePanel
          trustScores={avgTrustPerAgent}
          leverageScores={simState?.leverageScores}
          nameMap={nameMap}
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
            emotions={simState?.getAgentState(speakerAgentId)?.emotion}
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
