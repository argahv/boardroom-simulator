"use client";

import { useMemo, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { Turn } from "./TranscriptStream";
import { Avatar, initialsFromName } from "@/components/Avatar";
import { ActionGlyph, actionLabel } from "@/components/ActionGlyph";
import { ConflictTimeline } from "./ConflictTimeline";
import { EventLog } from "./EventLog";
import { Leaderboard } from "./Leaderboard";
import { IncentiveHeatmap } from "./IncentiveHeatmap";
import { LeverageShifts } from "./LeverageShifts";
import { StateDiffPanel } from "./StateDiffPanel";
import { EmotionalInfluencePanel } from "./EmotionalInfluencePanel";
import { StrategicPlanPanel } from "./StrategicPlanPanel";
import { RoomStatePanel } from "./RoomStatePanel";
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
  current?: Turn;
  playing: boolean;
  stakeholders: TableStakeholder[];
  speakerId: string | null;
  eventLog: EventLogEntry[];
  turns: Turn[];
  totalTurns: number;
  simState?: SimulationStateData;
  nameMap?: Record<string, string>;
}

// The stage is dark, so neutral and moderator take the on-dark muted tone.
const MUTED_ON_DARK = "var(--color-on-dark-soft)";

const STANCE_COLORS: Record<string, string> = {
  champion: "var(--color-primary)",
  detractor: "var(--color-error)",
  neutral: MUTED_ON_DARK,
  moderator: MUTED_ON_DARK,
  wildcard: "var(--color-accent-amber)",
};

const VOTE_CHIP: Record<string, string> = {
  yes: "bg-secondary text-on-dark",
  no: "bg-error text-on-dark",
  abstain: "bg-on-dark/15 text-on-dark-soft",
};

const SEAT_CHIP = "rounded-full px-1.5 py-[1px] font-mono text-[8px] font-bold uppercase tracking-[0.1em]";

/** Each person's most recent ballot, keyed by agent id. */
function latestVotes(turns: Turn[], stakeholders: TableStakeholder[]): Record<string, string> {
  const votes: Record<string, string> = {};
  for (const t of turns) {
    if (t.kind !== "agent" || t.action_type !== "vote" || !t.vote) continue;
    const id = t.agent_id ?? stakeholders.find((s) => s.name === t.speaker)?.id;
    if (id) votes[id] = t.vote.toLowerCase();
  }
  return votes;
}

function stanceTint(stance: string): { background: string; color: string } {
  const c = STANCE_COLORS[stance] ?? MUTED_ON_DARK;
  return { background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c };
}

function SpeakingPulse({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="absolute inset-[-6px] rounded-full">
      <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
      <span className="absolute inset-0 animate-pulse rounded-full bg-primary/20" />
    </span>
  );
}

// Mounted with a key per turn, so each new turn types out from the start.
function TypewriterText({ text }: { text: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setShown(i);
      if (i >= text.length) clearInterval(timer);
    }, 18);
    return () => clearInterval(timer);
  }, [text]);

  return (
    <>
      &ldquo;{text.slice(0, shown)}
      {shown < text.length && (
        <span className="inline-block h-[0.85em] w-[2px] animate-pulse bg-primary align-middle" />
      )}
      &rdquo;
    </>
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

  // System rows (room events) never take the floor.
  const speech = current?.kind === "agent" ? current : undefined;

  const speakerAgentId = useMemo(() => {
    if (!speech) return null;
    if (speech.agent_id) return speech.agent_id;
    const name = speakerId ?? speech.speaker;
    return stakeholders.find((s) => s.name === name)?.id ?? null;
  }, [speech, speakerId, stakeholders]);

  const votes = useMemo(() => latestVotes(turns, stakeholders), [turns, stakeholders]);
  const departed = useMemo(() => new Set(simState?.departed ?? []), [simState?.departed]);

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

  // Current speaker trust connections to others; pairs with no recorded trust get no line.
  const trustMatrix = simState?.trustMatrix;
  const speakerConnections = useMemo(() => {
    const row = speakerAgentId ? trustMatrix?.[speakerAgentId] : undefined;
    if (!row) return [];
    const conns: { target: string; trust: number }[] = [];
    for (const s of stakeholders) {
      const trust = row[s.id];
      if (s.id === speakerAgentId || typeof trust !== "number" || !Number.isFinite(trust)) continue;
      conns.push({ target: s.id, trust });
    }
    return conns;
  }, [speakerAgentId, trustMatrix, stakeholders]);

  // Animate table entrance. The page rebuilds `stakeholders` on every render, so key on who is
  // seated; re-running a from-tween mid-flight would leave seats stuck part-faded.
  const seatKey = stakeholders.map((s) => s.id).join("|");
  useGSAP(() => {
    if (!tableRef.current) return;
    gsap.fromTo(
      tableRef.current.querySelectorAll("[data-anim='seat']"),
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.06, duration: 0.5, ease: "back.out(1.7)", clearProps: "opacity" },
    );
  }, { dependencies: [seatKey] });

  const speakerPos = positions.find((p) => p.id === speakerAgentId);
  const speechVote = speech?.action_type === "vote" && speech.vote ? speech.vote.toLowerCase() : null;
  const speechTarget = speech ? speech.directed_at_name ?? speech.directed_at ?? null : null;

  return (
    <div className="grid min-h-[calc(100vh-220px)] grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── Main table view ── */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative">
          <div
            ref={tableRef}
            className="relative aspect-square overflow-hidden rounded-xl sm:aspect-[16/10]"
            style={{
              background: "radial-gradient(circle at center, var(--color-surface-dark-soft) 0%, var(--color-surface-dark) 100%)",
            }}
          >
            {/* Table surface — mahogany oval */}
            <div
              className="absolute inset-6 rounded-full"
              style={{
                background: "radial-gradient(ellipse at center, var(--color-surface-dark-elevated) 0%, var(--color-surface-dark) 60%, var(--color-surface-dark-soft) 100%)",
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow: "inset 0 0 60px rgba(0,0,0,0.5)",
              }}
            />

            {/* Table center glow — coral accent */}
            <div
              className="absolute left-1/2 top-1/2 h-16 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: "radial-gradient(ellipse, rgba(237,111,92,0.10) 0%, transparent 70%)",
              }}
            />

            {/* Trust connection lines from speaker */}
            <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              {speakerPos && speakerConnections.map((conn) => {
                const targetPos = positions.find((p) => p.id === conn.target);
                if (!targetPos) return null;
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
              const speaking = s.id === speakerAgentId;
              const left = departed.has(s.id);
              const vote = votes[s.id];
              const agentState = agentEmotions[s.id];
              return (
                <div
                  key={s.id}
                  data-anim="seat"
                  data-departed={left}
                  className="absolute flex flex-col items-center max-sm:scale-[0.85]"
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
                        transition: "transform 350ms cubic-bezier(.34,1.56,.64,1), opacity 300ms",
                        opacity: left && !speaking ? 0.35 : 1,
                        filter: left && !speaking ? "grayscale(1)" : undefined,
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
                        color: speaking ? "#fff" : left ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.7)",
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
                    {(left || vote) && (
                      <div className="mt-0.5 flex items-center justify-center gap-1">
                        {left && (
                          <span className={`${SEAT_CHIP} bg-accent-amber/25 text-accent-amber`} title="Left the room before the end">
                            Walked out
                          </span>
                        )}
                        {vote && (
                          <span className={`${SEAT_CHIP} ${VOTE_CHIP[vote] ?? VOTE_CHIP.abstain}`} title={`Voted ${vote}`}>
                            {vote}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Emotion indicator */}
                    {agentState?.emotion && !left && (
                      <div className="mt-0.5 scale-[0.7] origin-center">
                        <EmotionIndicator emotions={agentState.emotion} size="sm" />
                      </div>
                    )}
                  </div>

                  {/* Stance dot */}
                  <div
                    className="mt-1 h-1.5 w-1.5 rounded-full"
                    title={s.stance}
                    style={{
                      background: STANCE_COLORS[s.stance] ?? MUTED_ON_DARK,
                      opacity: speaking ? 1 : 0.5,
                      transition: "opacity 300ms",
                    }}
                  />
                </div>
              );
            })}

            {!speech && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="text-3xl text-canvas/20" style={{ fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif" }}>Empty table</div>
                <div className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-canvas/30">
                  Awaiting first speaker
                </div>
              </div>
            )}

            {/* Status bar */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 rounded-full border border-hairline/30 bg-ink/60 px-3 py-1.5 backdrop-blur-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-secondary animate-pulse" />
                <span className="truncate text-[10px] text-canvas/60">
                  {stakeholders.length - departed.size} at table · turn {turn + 1}/{totalTurns}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {stakeholders.map((s) => (
                  <div
                    key={s.id}
                    className="h-1.5 w-1.5 rounded-full transition-all duration-300"
                    style={{
                      background: STANCE_COLORS[s.stance] ?? MUTED_ON_DARK,
                      opacity: s.id === speakerAgentId ? 1 : departed.has(s.id) ? 0.1 : 0.3,
                      transform: s.id === speakerAgentId ? "scale(1.5)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Current speech bubble: centred on the table from sm up, below it on phones ── */}
          {speech && (
            <div className="mt-3 sm:absolute sm:left-1/2 sm:top-1/2 sm:mt-0 sm:flex sm:max-h-[85%] sm:w-[42%] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:flex-col">
              <div
                className="rounded-xl border p-4 backdrop-blur-sm sm:min-h-0 sm:overflow-y-auto"
                style={{
                  background: "rgba(30,28,25,0.92)",
                  borderColor: "rgba(237,111,92,0.25)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(237,111,92,0.08) inset",
                }}
              >
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-primary" style={{ fontFamily: "var(--font-mono)" }}>
                    T{String(speech.turn_number + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] font-medium text-canvas/50">{speech.speaker}</span>
                  {speech.is_human && (
                    <span
                      className="rounded-full bg-canvas px-[6px] py-[1px] font-mono text-[8px] font-bold tracking-[0.12em] text-ink"
                      title="Typed by a person in the room, not generated"
                    >
                      HUMAN
                    </span>
                  )}
                  {speechTarget && (
                    <span className="text-[10px] text-canvas/40">→ {speechTarget}</span>
                  )}
                </div>
                <div className="min-h-[2.5em] text-[17px] leading-[1.35] text-canvas" style={{ fontFamily: "var(--font-body), Inter, sans-serif", letterSpacing: "-0.01em" }}>
                  <TypewriterText key={speech.turn_index} text={speech.content ?? ""} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-canvas/40">
                  {speech.stance && (
                    <span
                      className="rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase"
                      style={stanceTint(speech.stance)}
                    >
                      {speech.stance}
                    </span>
                  )}
                  {speech.action_type && (
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.08em] text-canvas/50">
                      <ActionGlyph type={speech.action_type} size={11} />
                      {actionLabel(speech.action_type)}
                    </span>
                  )}
                  {speechVote && (
                    <span className={`${SEAT_CHIP} ${VOTE_CHIP[speechVote] ?? VOTE_CHIP.abstain}`}>
                      {speechVote}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <ConflictTimeline turn={turn} totalTurns={totalTurns} simState={simState} dark />
        <EventLog events={eventLog} />
      </div>

      {/* ── Sidebar ── */}
      <div className="flex min-w-0 flex-col gap-[14px]">
        <RoomStatePanel simState={simState} nameMap={nameMap} focusAgentId={speakerAgentId} />
        <Leaderboard leaderboard={simState?.leaderboard} nameMap={nameMap} />
        <IncentiveHeatmap socialPhysics={simState?.socialPhysics} totalAgents={stakeholders.length} deadlockRisk={simState?.deadlockRisk} />
        <LeverageShifts leverageHistory={simState?.leverageHistory} nameMap={nameMap} />
        {speakerAgentId && (
          <EmotionalInfluencePanel
            modulation={simState?.getAgentState(speakerAgentId)?.modulation ?? undefined}
            emotions={simState?.getAgentState(speakerAgentId)?.emotion}
            agentName={nameMap?.[speakerAgentId] ?? speech?.speaker ?? speakerAgentId}
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
