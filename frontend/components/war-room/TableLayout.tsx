"use client";

import { useMemo, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { V2Turn } from "./TranscriptStream";
import { Avatar, initialsFromName } from "@/components/Avatar";
import { ConflictTimeline } from "./ConflictTimeline";
import { EventLog } from "./EventLog";
import { Leaderboard } from "./Leaderboard";
import { IncentiveHeatmap } from "./IncentiveHeatmap";
import { LeverageShifts } from "./LeverageShifts";
import { StateDiffPanel } from "./StateDiffPanel";
import { EmotionalInfluencePanel } from "./EmotionalInfluencePanel";
import { StrategicPlanPanel } from "./StrategicPlanPanel";
import EmotionIndicator from "@/components/emotion-indicator";
import type { SimulationStateData } from "@/lib/use-simulation-state";

gsap.registerPlugin(useGSAP);

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
  simState?: SimulationStateData;
  nameMap?: Record<string, string>;
}

const STANCE_COLORS: Record<string, string> = {
  champion: "#22c55e",
  detractor: "#ef4444",
  neutral: "#a3a3a3",
  moderator: "#3b82f6",
  wildcard: "#f59e0b",
};

function SpeakingPulse({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="absolute inset-[-6px] rounded-full">
      <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
      <span className="absolute inset-0 animate-pulse rounded-full bg-primary/20" />
    </span>
  );
}

export function TableLayout({
  turn,
  current,
  stakeholders,
  speakerId,
  eventLog,
  turns,
  totalTurns,
  simState,
  nameMap,
}: TableLayoutProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [typewriter, setTypewriter] = useState("");
  const typewriterIdx = useRef(0);
  const prevSpeakerRef = useRef<string | null>(null);

  // Per-agent emotion mapping
  const agentEmotions = useMemo(() => {
    const map: Record<string, { emotion: Record<string, number> } | null> = {};
    for (const s of stakeholders) {
      map[s.id] = simState?.getAgentState(s.id) ?? null;
    }
    return map;
  }, [stakeholders, simState]);

  // Positions around the table
  const positions = useMemo(() => {
    const cx = 50, cy = 50, rx = 38, ry = 30;
    return stakeholders.map((s, i) => {
      const angle = (i / stakeholders.length) * Math.PI * 2 - Math.PI / 2 + Math.PI / stakeholders.length;
      return { id: s.id, x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
    });
  }, [stakeholders]);

  // Current speaker trust connections to others
  const speakerConnections = useMemo(() => {
    if (!speakerId || !simState?.trustMatrix) return [];
    const tm = simState.trustMatrix;
    const speakerNode = stakeholders.find((s) => s.name === speakerId);
    if (!speakerNode) return [];
    return stakeholders
      .filter((s) => s.id !== speakerNode.id)
      .map((s) => ({
        target: s.id,
        trust: tm[speakerNode.id]?.[s.id] ?? 0.5,
      }));
  }, [speakerId, simState?.trustMatrix, stakeholders]);

  // Animate table entrance
  useGSAP(() => {
    if (!tableRef.current) return;
    gsap.from(tableRef.current.querySelectorAll("[data-anim='seat']"), {
      y: 20,
      opacity: 0,
      stagger: 0.06,
      duration: 0.5,
      ease: "back.out(1.7)",
    });
  }, { dependencies: [stakeholders] });

  // Typewriter effect for current speech
  useEffect(() => {
    if (!current) { setTypewriter(""); typewriterIdx.current = 0; return; }
    const speakerChanged = current.speaker !== prevSpeakerRef.current;
    prevSpeakerRef.current = current.speaker ?? null;
    if (speakerChanged) {
      setTypewriter("");
      typewriterIdx.current = 0;
      const full = current.content ?? "";
      const speed = 18;
      const timer = setInterval(() => {
        typewriterIdx.current++;
        setTypewriter(full.slice(0, typewriterIdx.current));
        if (typewriterIdx.current >= full.length) clearInterval(timer);
      }, speed);
      return () => clearInterval(timer);
    } else {
      setTypewriter(current.content ?? "");
    }
  }, [current]);

  return (
    <div
      className="grid min-h-[calc(100vh-220px)] gap-4 p-4"
      style={{ gridTemplateColumns: "1fr 340px" }}
    >
      {/* ── Main table view ── */}
      <div className="flex flex-col gap-3">
        <div
          ref={tableRef}
          className="relative aspect-[16/10] overflow-hidden rounded-xl"
          style={{ background: "linear-gradient(145deg, #1a1816 0%, #12110f 100%)" }}
        >
          {/* Table surface */}
          <div
            className="absolute inset-6 rounded-full"
            style={{
              background: "radial-gradient(ellipse at center, #2a2725 0%, #1f1c19 60%, #141210 100%)",
              border: "1px solid #2e2b27",
              boxShadow: "inset 0 0 60px rgba(0,0,0,0.5)",
            }}
          />

          {/* Table center glow */}
          <div
            className="absolute left-1/2 top-1/2 h-16 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: "radial-gradient(ellipse, rgba(146,74,49,0.08) 0%, transparent 70%)",
            }}
          />

          {/* Trust connection lines from speaker */}
          <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100">
            {speakerConnections.map((conn) => {
              const speakerPos = positions.find((p) => stakeholders.find((s) => s.name === speakerId)?.id === p.id);
              const targetPos = positions.find((p) => p.id === conn.target);
              if (!speakerPos || !targetPos) return null;
              const trustWidth = 0.06 + conn.trust * 0.2;
              return (
                <line
                  key={conn.target}
                  x1={speakerPos.x} y1={speakerPos.y}
                  x2={targetPos.x} y2={targetPos.y}
                  stroke={conn.trust > 0.6 ? "#22c55e" : conn.trust > 0.3 ? "#a3a3a3" : "#ef4444"}
                  strokeWidth={trustWidth}
                  opacity={0.25}
                  strokeDasharray="1 1.5"
                />
              );
            })}
          </svg>

          {/* Seat markers */}
          {positions.map((p) => {
            const s = stakeholders.find((st) => st.id === p.id);
            if (!s) return null;
            const speaking = s.name === speakerId;
            const agentState = agentEmotions[s.id];
            return (
              <div
                key={s.id}
                data-anim="seat"
                className="absolute flex flex-col items-center"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  transform: `translate(-50%, -50%)`,
                  transition: "all 400ms cubic-bezier(.4,0,.2,1)",
                }}
              >
                {/* Avatar with speaking pulse */}
                <div className="relative mb-1">
                  <SpeakingPulse active={speaking} />
                  <div
                    style={{
                      transform: speaking ? "translateY(-4px) scale(1.1)" : "translateY(0) scale(1)",
                      transition: "transform 350ms cubic-bezier(.34,1.56,.64,1)",
                    }}
                  >
                    <Avatar
                      initials={initialsFromName(s.name)}
                      size={speaking ? 64 : 52}
                      speaking={speaking}
                    />
                  </div>
                </div>

                {/* Name + stance */}
                <div className="text-center">
                  <div
                    className="text-[13px] font-semibold leading-tight"
                    style={{
                      color: speaking ? "#fff" : "rgba(255,255,255,0.7)",
                      transition: "color 300ms",
                    }}
                  >
                    {s.name.split(" ")[0]}
                  </div>
                  <div
                    className="text-[10px]"
                    style={{
                      color: speaking ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.35)",
                      transition: "color 300ms",
                    }}
                  >
                    {s.role.split(" ")[0] || s.stance}
                  </div>
                  {/* Emotion indicator */}
                  {agentState?.emotion && (
                    <div className="mt-0.5 scale-[0.7] origin-center">
                      <EmotionIndicator emotions={agentState.emotion} size="sm" />
                    </div>
                  )}
                </div>

                {/* Stance dot */}
                <div
                  className="mt-1 h-1.5 w-1.5 rounded-full"
                  style={{
                    background: STANCE_COLORS[s.stance] ?? "#a3a3a3",
                    opacity: speaking ? 1 : 0.5,
                    transition: "opacity 300ms",
                  }}
                />
              </div>
            );
          })}

          {/* ── Current speech bubble ── */}
          {current && speakerId && (
            <div className="absolute left-1/2 top-1/2 w-[42%] -translate-x-1/2 -translate-y-1/2">
              <div
                className="rounded-xl border p-4 backdrop-blur-sm"
                style={{
                  background: "rgba(24,23,21,0.85)",
                  borderColor: "rgba(146,74,49,0.3)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-primary">
                    T{String(turn).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] font-medium text-canvas/50">{current.speaker}</span>
                </div>
                <div className="font-newsreader min-h-[2.5em] text-[17px] leading-[1.3] tracking-[-0.3px] text-canvas">
                  &ldquo;{typewriter}
                  {(typewriter.length < (current.content?.length ?? 0)) && (
                    <span className="inline-block h-[0.85em] w-[2px] animate-pulse bg-primary align-middle" />
                  )}
                  &rdquo;
                </div>
                <div className="mt-2 text-[10px] text-canvas/40">
                  {current.stance && (
                    <span
                      className="mr-2 rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase"
                      style={{
                        background: `${STANCE_COLORS[current.stance] ?? "#666"}22`,
                        color: STANCE_COLORS[current.stance] ?? "#666",
                      }}
                    >
                      {current.stance}
                    </span>
                  )}
                  {current.action_type && (
                    <span className="text-canvas/30">{current.action_type.replace("_", " ")}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {!current && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="font-newsreader text-3xl text-canvas/20">Empty table</div>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-canvas/30">
                Awaiting first speaker
              </div>
            </div>
          )}

          {/* Status bar */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full border border-hairline/30 bg-ink/60 px-3 py-1.5 backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-secondary animate-pulse" />
              <span className="text-[10px] text-canvas/60">
                {stakeholders.length} at table · turn {turn+1}/{totalTurns}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {stakeholders.map((s) => (
                <div
                  key={s.id}
                  className="h-1.5 w-1.5 rounded-full transition-all duration-300"
                  style={{
                    background: STANCE_COLORS[s.stance] ?? "#666",
                    opacity: s.name === speakerId ? 1 : 0.3,
                    transform: s.name === speakerId ? "scale(1.5)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <ConflictTimeline turn={turn} totalTurns={totalTurns} dark />
        <EventLog events={eventLog} />
      </div>

      {/* ── Sidebar ── */}
      <div className="flex flex-col gap-[14px]">
        <Leaderboard leaderboard={simState?.leaderboard} nameMap={nameMap} />
        <IncentiveHeatmap socialPhysics={simState?.socialPhysics} totalAgents={stakeholders.length} />
        <LeverageShifts leverageHistory={simState?.leverageHistory} nameMap={nameMap} />
        {speakerId && (() => {
          const sid = stakeholders.find(s => s.name === speakerId)?.id;
          return sid ? (
            <EmotionalInfluencePanel
              modulation={simState?.getAgentState(sid)?.modulation ?? undefined}
              agentName={speakerId}
            />
          ) : null;
        })()}
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
