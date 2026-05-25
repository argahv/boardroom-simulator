"use client";

import { useMemo, useRef, useCallback } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { NarrativeTimeline } from "./NarrativeTimeline";
import { TranscriptStream, type V2Turn } from "./TranscriptStream";
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

gsap.registerPlugin(useGSAP);

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
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    gsap.to(cardRef.current, {
      y: -4, scale: 1.02, boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
      duration: 0.3, ease: "back.out(1.7)",
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    gsap.to(cardRef.current, {
      y: 0, scale: 1, boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
      duration: 0.3, ease: "back.out(1.7)",
    });
  }, []);

  useGSAP(() => {
    if (!speaking || !cardRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.to(cardRef.current, {
        borderColor: "var(--color-primary)",
        boxShadow: "0 0 20px rgba(237,111,92,0.20), 0 0 40px rgba(237,111,92,0.08)",
        duration: 0.8, repeat: -1, yoyo: true, ease: "sine.inOut",
      });
    });
    return () => mm.revert();
  }, { dependencies: [speaking], revertOnUpdate: true });

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ border: "1px solid var(--color-hairline)" }}
      className={`rounded-xl p-[14px] transition-colors duration-[240ms] ${
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
