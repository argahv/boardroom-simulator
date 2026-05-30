"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { AppShell } from "@/components/AppShell";
import { ControlBar, type WarRoomLayout, type PlaybackStatus, type SpeedMultiplier } from "@/components/ControlBar";
import { RosterLayout } from "@/components/war-room/RosterLayout";
import { TableLayout } from "@/components/war-room/TableLayout";
import dynamic from "next/dynamic";
const GraphLayout = dynamic(() => import("@/components/war-room/GraphLayout").then((m) => ({ default: m.GraphLayout })), { ssr: false });
import { fetchSimulation, fetchSimulationTurns, streamSimulation, fetchPostmortem, injectTurn, exportSimulation } from "@/lib/api";
import { useSimulationState, type SimulationStateData } from "@/lib/use-simulation-state";
import type { SimulationConfig } from "@/lib/types";
import { Avatar, initialsFromName } from "@/components/Avatar";
import { Button } from "@/components/Button";

type PageProps = { params: Promise<{ id: string }> };

type Turn = {
  turn_index: number;
  speaker: string;
  speaker_role?: string;
  content: string;
  stance?: string;
  reasoning?: string;
  action_type?: string;
  _index?: number;
  agent_name?: string;
  agent_role?: string;
  internal_reasoning?: string;
};

export default function WarRoomPage({ params }: PageProps) {
  const { id } = use(params);

  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState("");
  const [layout, setLayout] = useState<WarRoomLayout>("roster");
  const [speedMul, setSpeedMul] = useState<SpeedMultiplier>(1);
  const [playTurn, setPlayTurn] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [postmortem, setPostmortem] = useState<Record<string, unknown> | null>(null);
  const [loadingPostmortem, setLoadingPostmortem] = useState(false);
  const [stateSnapshots, setStateSnapshots] = useState<Record<string, unknown>[]>([]);
  const [isReplay, setIsReplay] = useState(false);
  const [outcome, setOutcome] = useState<{
    reason?: string;
    outcome_type?: string;
    summary?: string;
    confidence?: number;
    vote_breakdown?: Record<string, number>;
    judge_notes?: string;
    walkaway_party?: string;
  } | null>(null);

  const [humanContent, setHumanContent] = useState("");
  const [selectedStakeholder, setSelectedStakeholder] = useState("");
  const [sendingHumanTurn, setSendingHumanTurn] = useState(false);
  const [humanError, setHumanError] = useState("");

  const streamCtrl = useRef<AbortController | null>(null);
  const streamStartedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const persistKey = `wr-session-${id}`;
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  const baseInterval = 3800;

  const [displayedLayout, setDisplayedLayout] = useState<WarRoomLayout>(layout);
  const layoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (layout === displayedLayout) return;
    const el = layoutRef.current;
    if (!el) { setDisplayedLayout(layout); return; }
    gsap.to(el, {
      opacity: 0, y: 4, duration: 0.12, ease: "power2.in",
      onComplete: () => setDisplayedLayout(layout),
    });
  }, [layout, displayedLayout]);

  const layoutMounted = useRef(false);
  useGSAP(() => {
    if (!layoutMounted.current) { layoutMounted.current = true; return; }
    if (layoutRef.current) {
      gsap.fromTo(layoutRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.2, ease: "power2.out" }
      );
    }
  }, { dependencies: [displayedLayout], revertOnUpdate: true });



  const simState = useSimulationState({
    mode: isReplay ? "replay" : "live",
    events: stateSnapshots,
    simulationId: isReplay ? id : undefined,
    turnIndex: isReplay ? playTurn : undefined,
  });

  useEffect(() => {
    document.title = "War Room — Vantage Boardroom";
  }, []);

  useEffect(() => {
    if (isReplay) return;
    try {
      const saved = sessionStorage.getItem(persistKey);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.turns) setTurns(state.turns);
        if (typeof state.playTurn === "number") setPlayTurn(state.playTurn);
        if (state.speedMul) setSpeedMul(state.speedMul);
        if (state.layout) setLayout(state.layout);
        if (state.postmortem) setPostmortem(state.postmortem);
        if (typeof state.playing === "boolean") setPlaying(state.playing);
        if (state.status) setStatus(state.status);
        if (state.stateSnapshots?.length) setStateSnapshots(state.stateSnapshots);
      }
    } catch {}
  }, [id, isReplay]);

  useEffect(() => {
    if (isReplay) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        sessionStorage.setItem(persistKey, JSON.stringify({
          turns, playTurn, speedMul, layout, playing, status, postmortem, stateSnapshots,
        }));
      } catch {}
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [turns, playTurn, speedMul, layout, playing, status, postmortem, stateSnapshots, persistKey, isReplay]);

  useEffect(() => {
    fetchSimulation(id)
      .then((data) => {
        setConfig(data.config ?? null);
        if (data.status === "complete" || data.status === "running") {
          setIsReplay(true);
          fetchSimulationTurns(id).then((turns) => {
            const mapped = (turns as Array<Record<string, unknown>>).map((t) => ({
              turn_index: Number(t.turn_index ?? 0),
              speaker: String(t.speaker ?? ""),
              speaker_role: t.speaker_role ? String(t.speaker_role) : t.role ? String(t.role) : undefined,
              content: String(t.content ?? ""),
              stance: t.stance ? String(t.stance) : undefined,
              reasoning: t.internal_reasoning ? String(t.internal_reasoning) : undefined,
              action_type: t.action_type ? String(t.action_type) : undefined,
            }));
            setTurns(mapped);
            setStatus("complete");
          }).catch(() => {});
        } else if (data.status === "idle") {
          startStream();
        }
      })
      .catch(() => {
        setIsReplay(false);
      });
    return () => streamCtrl.current?.abort();
  }, [id]);

  useEffect(() => {
    if (!playing) { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } return; }
    const maxTurn = isReplay ? Math.max(0, simState.totalTurns - 1) : turns.length - 1;
    if (maxTurn <= 0) return;
    if (playTurn >= maxTurn && status === "complete") { setPlaying(false); return; }
    if (playTurn >= maxTurn) return;
    const interval = baseInterval / speedMul;
    timerRef.current = setTimeout(() => setPlayTurn((t) => Math.min(maxTurn, t + 1)), interval);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, playTurn, turns.length, speedMul, status, isReplay, simState.totalTurns]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [playTurn]);

  const startStream = () => {
    if (status === "running" || isReplay || streamStartedRef.current) return;
    streamStartedRef.current = true;
    setError("");
    setStatus("running");
    setPlaying(true);
    streamCtrl.current = streamSimulation(
      id,
      (event) => {
        const evt = event as Record<string, unknown>;
        if (evt.type === "turn") {
          const turn: Turn = {
            turn_index: Number(evt.turn_index ?? evt._index ?? turns.length),
            speaker: String(evt.speaker ?? evt.agent_name ?? ""),
            speaker_role: evt.speaker_role ? String(evt.speaker_role) : evt.role ? String(evt.role) : evt.agent_role ? String(evt.agent_role) : undefined,
            content: String(evt.content ?? ""),
            stance: evt.stance ? String(evt.stance) : undefined,
            reasoning: evt.reasoning ? String(evt.reasoning) : evt.internal_reasoning ? String(evt.internal_reasoning) : undefined,
            action_type: evt.action_type ? String(evt.action_type) : undefined,
          };
          setTurns((prev) => {
            const updated = [...prev, turn];
            setPlayTurn(updated.length - 1);
            return updated;
          });
        } else if (evt.type === "system") {
          setTurns((prev) => {
            const systemTurn: Turn = {
              turn_index: prev.length,
              speaker: "⚙ System",
              content: String(evt.content ?? ""),
            };
            const updated = [...prev, systemTurn];
            return updated;
          });
        } else if (evt.type === "done") {
          setStatus("complete");
          // Capture structured outcome data
          setOutcome({
            reason: evt.reason as string | undefined,
            outcome_type: evt.outcome_type as string | undefined,
            summary: evt.summary as string | undefined,
            confidence: evt.confidence as number | undefined,
            vote_breakdown: evt.vote_breakdown as Record<string, number> | undefined,
            judge_notes: evt.judge_notes as string | undefined,
            walkaway_party: evt.walkaway_party as string | undefined,
          });
        } else if (evt.type === "state_snapshot") {
          setStateSnapshots((prev) => {
            // Deduplicate: if we already have a snapshot for this turn, replace it
            const idx = evt.turn_index as number;
            const existing = prev.findIndex((s) => (s as any).turn_index === idx);
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = evt;
              return next;
            }
            return [...prev, evt];
          });
        } else if (evt.type === "error") {
          setError(String(evt.message ?? "Unknown error"));
          setStatus("idle");
        }
      },
      (err) => { setError(err.message); setStatus("idle"); },
      () => setStatus("complete"),
    );
  };

  const loadPostmortem = async () => {
    setLoadingPostmortem(true);
    try {
      const result = await fetchPostmortem(id);
      setPostmortem(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Postmortem failed");
    } finally {
      setLoadingPostmortem(false);
    }
  };

  const handleSendHumanTurn = async () => {
    if (!humanContent.trim() || !selectedStakeholder) return;
    setSendingHumanTurn(true);
    setHumanError("");
    const stakeholder = config?.stakeholders.find((s) => s.id === selectedStakeholder);
    const optimisticTurn: Turn = {
      turn_index: turns.length,
      speaker: stakeholder?.name ?? "Human",
      speaker_role: stakeholder?.role,
      content: humanContent.trim(),
      action_type: "human_input",
    };
    setTurns((prev) => [...prev, optimisticTurn]);
    setPlayTurn((t) => t + 1);
    setHumanContent("");
    try {
      await injectTurn(id, selectedStakeholder, humanContent.trim());
    } catch (err) {
      setHumanError(err instanceof Error ? err.message : "Failed to send");
      setTurns((prev) => prev.filter((t) => t !== optimisticTurn));
      setPlayTurn((t) => Math.max(0, t - 1));
    } finally {
      setSendingHumanTurn(false);
    }
  };

  useEffect(() => {
    if (isReplay) return;
    const simDone = status === "complete" && playTurn >= turns.length - 1;
    if (simDone && !postmortem && !loadingPostmortem) {
      loadPostmortem();
    }
  }, [status, playTurn, turns.length, postmortem, loadingPostmortem, isReplay]);

  const current = turns[playTurn];
  const done = !isReplay && status === "complete" && playTurn >= turns.length - 1;
  const live = !isReplay && status === "running";
  const speakerId = current?.speaker ?? null;
  const subjectName = config?.subject?.name ?? "Debate";

  const stakeholders = (config?.stakeholders ?? []).map((s) => ({
    id: s.id, name: s.name, role: s.role, stance: s.stance,
    lastContent: [...turns.slice(0, playTurn + 1)].reverse().find((t) => t.speaker === s.name)?.content ?? null,
  }));

  const eventLog = turns.slice(0, playTurn + 1).map((t) => ({
    t: t.turn_index, text: `[agent] ${t.speaker} — ${t.content.slice(0, 120)}${t.content.length > 120 ? "…" : ""}`, full: t.content, type: "agent" as const,
  }));

  const nameMap: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of config?.stakeholders ?? []) {
      map[s.id] = s.name;
    }
    return map;
  }, [config]);

  return (
    <AppShell activeTab="War Room">
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* ── The Brief — editorial header stripe ── */}
        <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid var(--color-hairline)", background: "var(--color-surface-card)" }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)" }}>
              The Brief
              {isReplay && (
                <span style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 9999, background: "var(--color-primary)", color: "var(--color-on-dark)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", opacity: 0.7 }} />
                  REPLAY
                </span>
              )}
            </span>
          </div>
          <h1 style={{ fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", fontSize: "clamp(28px,3.5vw,42px)", fontWeight: 700, letterSpacing: "-0.04em", margin: 0, lineHeight: 1.15 }}>
            {subjectName}
          </h1>
          {config?.subject?.description && (
            <p style={{ color: "var(--color-muted)", fontSize: 14, maxWidth: "min(50%,600px)", lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
              {config.subject.description}
            </p>
          )}
        </div>

        {error && (
          <div style={{ padding: "12px 32px" }}>
            <div style={{ background: "rgba(186,26,26,0.08)", border: "1px solid rgba(186,26,26,0.3)", borderRadius: 8, padding: 12, fontSize: 12, color: "var(--color-error)" }}>{error}</div>
          </div>
        )}

        <ControlBar
          turn={playTurn}
          total={isReplay ? Math.max(1, simState.totalTurns) : Math.max(turns.length, 30)}
          status={isReplay ? "complete" : (done ? "complete" : playing && live ? "running" : "idle")}
          speedMul={speedMul}
          layout={layout}
          scenarioLabel={subjectName.split(" ")[0]}
          voltage={config?.voltage}
          onPlay={() => { if (isReplay) { setPlaying(true); return; } if (turns.length === 0) startStream(); setPlaying(true); }}
          onPause={() => setPlaying(false)}
          onRestart={() => { setPlayTurn(0); setPlaying(true); }}
          onStepBack={() => setPlayTurn((t) => Math.max(0, t - 1))}
          onStepForward={() => setPlayTurn((t) => {
            const max = isReplay ? Math.max(0, simState.totalTurns - 1) : turns.length - 1;
            return Math.min(max, t + 1);
          })}
          onSpeedChange={setSpeedMul}
          onLayoutChange={setLayout}
        />

        <div style={{ flex: 1, overflowY: "auto", background: "var(--color-canvas)" }}>
          {isReplay && simState.loading && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 64, flexDirection: "column", gap: 16 }}>
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
              <span style={{ fontSize: 13, color: "var(--color-muted)" }}>Loading replay snapshots…</span>
            </div>
          )}

          {(!isReplay || !simState.loading) && (
          <div ref={layoutRef}>
            {displayedLayout === "roster" && (
              <RosterLayout
                turn={playTurn}
                current={current}
                playing={playing && live}
                stakeholders={stakeholders}
                speakerId={speakerId}
                eventLog={eventLog}
                turns={turns.slice(0, playTurn + 1)}
                scrollRef={scrollRef}
                totalTurns={Math.max(turns.length, 30)}
                simState={simState}
                nameMap={nameMap}
              />
            )}
            {displayedLayout === "table" && (
              <TableLayout
                turn={playTurn}
                current={current}
                playing={playing && live}
                stakeholders={stakeholders}
                speakerId={speakerId}
                eventLog={eventLog}
                turns={turns.slice(0, playTurn + 1)}
                totalTurns={Math.max(turns.length, 30)}
                simState={simState}
                nameMap={nameMap}
              />
            )}
            {displayedLayout === "graph" && (
              <GraphLayout
                turn={playTurn}
                current={current}
                playing={playing && live}
                stakeholders={stakeholders}
                speakerId={speakerId}
                turns={turns.slice(0, playTurn + 1)}
                totalTurns={Math.max(turns.length, 30)}
                eventLog={eventLog}
                simState={simState}
                nameMap={nameMap}
              />
            )}
          </div>
          )}

          {done && !postmortem && (
            <div style={{ textAlign: "center", padding: "12px 16px 24px", display: "flex", justifyContent: "center", gap: 12 }}>
              <button
                onClick={loadPostmortem}
                disabled={loadingPostmortem}
                style={{ padding: "10px 24px", borderRadius: 9999, background: "var(--color-ink)", color: "var(--color-on-dark)", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                {loadingPostmortem ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Analyzing…
                  </span>
                ) : "Generate postmortem"}
              </button>
              <a
                href={exportSimulation(id)}
                download
                style={{ padding: "10px 24px", borderRadius: 9999, background: "transparent", color: "var(--color-ink)", border: "1px solid var(--color-ink)", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
              >
                Export JSON
              </a>
            </div>
          )}

          {/* ── Verdict — outcome banner ── */}
          {outcome && (() => {
            const type = outcome.outcome_type;
            const isAgree = type === "agreement";
            const isWalkaway = type === "walkaway";
            const tintBg = isAgree ? "rgba(110,116,72,0.10)" : isWalkaway ? "rgba(233,185,74,0.10)" : "rgba(186,26,26,0.08)";
            const tintBorder = isAgree ? "rgba(110,116,72,0.20)" : isWalkaway ? "rgba(233,185,74,0.20)" : "rgba(186,26,26,0.15)";
            const tintText = isAgree ? "var(--color-secondary)" : isWalkaway ? "var(--color-accent-amber)" : "var(--color-error)";
            return (
            <div style={{
              padding: "18px 24px", margin: "0 16px 16px", borderRadius: 12,
              background: tintBg, border: `1px solid ${tintBorder}`,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9999, display: "flex", alignItems: "center", justifyContent: "center",
                  background: tintText, color: "#fff", fontSize: 11, fontWeight: 700,
                  flexShrink: 0, marginTop: 2,
                }}>
                  {isAgree ? "A" : isWalkaway ? "W" : "X"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: tintText,
                    }}>
                      {isAgree ? "Deal Reached" : isWalkaway ? "Walkaway" : type === "judge_ruling" ? "Judge Ruling" : "No Consensus"}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)", margin: 0, lineHeight: 1.4 }}>
                    {outcome.summary || `Simulation ended via ${outcome.reason || "unknown"}.`}
                  </p>

                  {/* Vote breakdown */}
                  {outcome.vote_breakdown && Object.keys(outcome.vote_breakdown).length > 0 && (
                    <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
                      {Object.entries(outcome.vote_breakdown).map(([key, val]) => (
                        <div key={key} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", color: "var(--color-ink)" }}>{String(val)}</div>
                          <div style={{ fontSize: 9, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600, marginTop: 1 }}>{key}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {outcome.judge_notes && (
                    <p style={{ fontSize: 12, color: "var(--color-muted)", fontStyle: "italic", lineHeight: 1.5, marginTop: 8, maxWidth: 520 }}>
                      &ldquo;{outcome.judge_notes}&rdquo;
                    </p>
                  )}
                  {outcome.walkaway_party && (
                    <p style={{ fontSize: 11, color: "var(--color-accent-amber)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                      Walked: {outcome.walkaway_party}
                    </p>
                  )}
                </div>

                {outcome.confidence !== undefined && (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)" }}>Confidence</span>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", color: "var(--color-ink)" }}>
                      {Math.round(outcome.confidence * 100)}<span style={{ fontSize: 14, color: "var(--color-muted)" }}>%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            );
          })()}

          {postmortem && (
            <>
              <div style={{ padding: 16, maxWidth: 700, margin: "0 auto 0" }}>
                <div className="mb-4 text-center" style={{ display: "flex", justifyContent: "center", gap: 12 }}>
                  <a
                    href={`/simulate/${id}/postmortem`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-canvas transition hover:bg-ink/80 no-underline"
                  >
                    View full postmortem analysis
                    <span className="text-lg">→</span>
                  </a>
                  <a
                    href={exportSimulation(id)}
                    download
                    style={{ padding: "10px 24px", borderRadius: 9999, background: "transparent", color: "var(--color-ink)", border: "1px solid var(--color-ink)", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Export JSON
                  </a>
                </div>
              </div>
              <div style={{ padding: "0 16px 32px", maxWidth: 700, margin: "0 auto" }}>
              <div style={{ background: "var(--color-surface-dark)", borderRadius: 12, padding: 24, color: "var(--color-on-dark)" }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--color-primary)", marginBottom: 4 }}>Post-Mortem</p>
                <h3 style={{ fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 16 }}>{String(postmortem.subject || "Debate")}</h3>

                {/* Show verdict if available */}
                {!!postmortem.verdict && (
                  <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "var(--color-surface-dark-elevated)" }}>
                    <p style={{ fontSize: 13, color: "var(--color-on-dark-soft)", margin: 0 }}>
                      <strong style={{ color: "var(--color-on-dark)" }}>Verdict:</strong> {String(postmortem.verdict)}
                    </p>
                    {!!postmortem.end_reason && (
                      <p style={{ fontSize: 12, color: "var(--color-on-dark-soft)", margin: "4px 0 0" }}>
                        Ended via: {String(postmortem.end_reason)}
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
                  <div style={{ borderRadius: 12, background: "var(--color-surface-dark-elevated)", padding: 16 }}>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-on-dark-soft)", marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Total turns</p>
                    <p style={{ fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{String(postmortem.total_turns ?? 0)}</p>
                  </div>
                  <div style={{ borderRadius: 12, background: "var(--color-surface-dark-elevated)", padding: 16 }}>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-on-dark-soft)", marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Participants</p>
                    <p style={{ fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{String(postmortem.stakeholder_count ?? 0)}</p>
                  </div>
                  <div style={{ borderRadius: 12, background: "var(--color-surface-dark-elevated)", padding: 16 }}>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-on-dark-soft)", marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Voltage</p>
                    <p style={{ fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{String(postmortem.voltage || 0)}</p>
                  </div>
                </div>

                {/* Summary if available */}
                {!!postmortem.summary && (
                  <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "var(--color-surface-dark-soft)" }}>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-primary)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>Summary</p>
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-on-dark-soft)", margin: 0 }}>{String(postmortem.summary)}</p>
                  </div>
                )}

                {(postmortem.leaderboard as Array<{ name: string; stance: string; turns: number }>)?.map((entry, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: i === 0 ? "var(--color-surface-dark-elevated)" : "transparent", borderRadius: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", fontSize: 20, width: 28, letterSpacing: "-0.03em", color: i === 0 ? "var(--color-on-dark)" : "var(--color-on-dark-soft)" }}>#{i + 1}</span>
                    <div style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>{entry.name}</span><span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-on-dark-soft)" }}>{entry.stance}</span></div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-on-dark-soft)" }}>{entry.turns} turns</span>
                  </div>
                ))}
              </div>
            </div>
            </>
          )}
        </div>

        {/* ── Human Turn Input ── */}
        <div className="flex-shrink-0 border-t border-hairline bg-surface-card px-4 py-3 anim-slide-up">
          <div className="flex items-center gap-2">
            {/* Stakeholder selector with inline context */}
            <div className="relative shrink-0">
              {selectedStakeholder ? (
                <div className="flex items-center gap-2 rounded-xl border border-hairline bg-canvas px-3 py-2 min-w-[140px]">
                  <Avatar
                    initials={initialsFromName(
                      config?.stakeholders.find((s) => s.id === selectedStakeholder)?.name ?? ""
                    )}
                    size={22}
                    accent={(() => {
                      const stance = config?.stakeholders.find((s) => s.id === selectedStakeholder)?.stance;
                      return stance === "champion" ? "coral" : stance === "detractor" ? "ink" : "muted";
                    })()}
                  />
                  <select
                    value={selectedStakeholder}
                    onChange={(e) => setSelectedStakeholder(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    aria-label="Select stakeholder"
                  >
                    <option value="">Speak as…</option>
                    {config?.stakeholders.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <span className="text-sm font-medium text-ink">
                    {config?.stakeholders.find((s) => s.id === selectedStakeholder)?.name}
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-muted">expand_more</span>
                </div>
              ) : (
                <select
                  value={selectedStakeholder}
                  onChange={(e) => setSelectedStakeholder(e.target.value)}
                  className="rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-muted outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all cursor-pointer min-w-[140px] appearance-none"
                  aria-label="Select stakeholder"
                >
                  <option value="">Speak as…</option>
                  {config?.stakeholders.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Message input */}
            <div className="relative flex-1">
              <textarea
                value={humanContent}
                onChange={(e) => {
                  setHumanContent(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendHumanTurn(); } }}
                placeholder={selectedStakeholder ? "Type your intervention…" : "Select a stakeholder to speak as…"}
                rows={1}
                disabled={!selectedStakeholder}
                className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all resize-none min-h-[36px] max-h-[120px] leading-relaxed placeholder:text-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <span className="absolute right-3 bottom-2 text-[10px] text-muted/40 font-medium pointer-events-none">
                {humanContent.length}
              </span>
            </div>

            {/* Send button */}
            <Button
              variant="dark"
              onClick={handleSendHumanTurn}
              disabled={sendingHumanTurn || !humanContent.trim() || !selectedStakeholder}
              className="shrink-0"
            >
              {sendingHumanTurn ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span className="hidden sm:inline">Sending</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="hidden sm:inline">Send</span>
                  <span className="material-symbols-outlined text-[16px]">send</span>
                </span>
              )}
            </Button>
          </div>

          {/* Hints row */}
          <div className="flex items-center justify-between mt-1.5 px-1">
            {selectedStakeholder ? (
              <span className="text-[10px] text-muted/40">
                <kbd className="font-mono text-[9px] px-1 py-0.5 rounded border border-hairline bg-canvas">↵</kbd> Send ·{' '}
                <kbd className="font-mono text-[9px] px-1 py-0.5 rounded border border-hairline bg-canvas">⇧↵</kbd> New line
              </span>
            ) : (
              <span className="text-[10px] text-muted/40">Select a stakeholder above to speak</span>
            )}
            {!sendingHumanTurn && humanContent.length > 0 && (
              <span className="text-[10px] text-muted/40">{humanContent.length} chars</span>
            )}
          </div>

          {/* Error state */}
          {humanError && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-error-soft px-3 py-2 text-xs text-error">
              <span className="material-symbols-outlined text-[14px]">error_outline</span>
              <span className="flex-1">{humanError}</span>
              <button
                onClick={() => setHumanError("")}
                className="text-error/60 hover:text-error transition-colors cursor-pointer"
                aria-label="Dismiss error"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
