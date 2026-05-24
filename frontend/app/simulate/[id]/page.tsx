"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ControlBar, type WarRoomLayout, type PlaybackStatus, type SpeedMultiplier } from "@/components/ControlBar";
import { RosterLayout } from "@/components/war-room/RosterLayout";
import { TableLayout } from "@/components/war-room/TableLayout";
import dynamic from "next/dynamic";
const GraphLayout = dynamic(() => import("@/components/war-room/GraphLayout").then((m) => ({ default: m.GraphLayout })), { ssr: false });
import { fetchSimulationV2, streamSimulationV2, postmortemV2, exportSimulation } from "@/lib/api";
import { useSimulationState, type SimulationStateData } from "@/lib/use-simulation-state";
import type { SimulationV2Config } from "@/lib/types";

type PageProps = { params: Promise<{ id: string }> };

type V2Turn = {
  turn_index: number;
  speaker: string;
  speaker_role?: string;
  content: string;
  stance?: string;
  reasoning?: string;
  action_type?: string;
};

export default function WarRoomPage({ params }: PageProps) {
  const { id } = use(params);

  const [config, setConfig] = useState<SimulationV2Config | null>(null);
  const [turns, setTurns] = useState<V2Turn[]>([]);
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

  const streamCtrl = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const persistKey = `wr-session-${id}`;
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  const baseInterval = 3800;

  const simState = useSimulationState({
    mode: isReplay ? "replay" : "live",
    events: stateSnapshots,
    simulationId: isReplay ? id : undefined,
    turnIndex: isReplay ? playTurn : undefined,
  });

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
    fetchSimulationV2(id)
      .then((data) => {
        setConfig(data.config ?? null);
        if (data.status === "complete") {
          setIsReplay(true);
        } else {
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
    if (status === "running" || isReplay) return;
    setError("");
    setStatus("running");
    setPlaying(true);
    streamCtrl.current = streamSimulationV2(
      id,
      (event) => {
        const evt = event as Record<string, unknown>;
        if (evt.type === "turn") {
          const turn: V2Turn = {
            turn_index: Number(evt.turn_index ?? turns.length),
            speaker: String(evt.speaker ?? ""),
            speaker_role: evt.speaker_role ? String(evt.speaker_role) : evt.role ? String(evt.role) : undefined,
            content: String(evt.content ?? ""),
            stance: evt.stance ? String(evt.stance) : undefined,
            reasoning: evt.reasoning ? String(evt.reasoning) : undefined,
            action_type: evt.action_type ? String(evt.action_type) : undefined,
          };
          setTurns((prev) => {
            const updated = [...prev, turn];
            setPlayTurn(updated.length - 1);
            return updated;
          });
        } else if (evt.type === "system") {
          setTurns((prev) => {
            const systemTurn: V2Turn = {
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
      const result = await postmortemV2(id);
      setPostmortem(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Postmortem failed");
    } finally {
      setLoadingPostmortem(false);
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
    t: t.turn_index, text: `[agent] ${t.speaker} — ${t.content.slice(0, 60)}${t.content.length > 60 ? "…" : ""}`, type: "agent" as const,
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
        <div style={{ padding: "24px 32px", borderBottom: "1px solid var(--color-hairline)" }}>
          <h1 style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 48, fontWeight: 700, marginBottom: 12 }}>
            {subjectName}
            {isReplay && (
              <span style={{ marginLeft: 12, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", verticalAlign: "middle", padding: "4px 10px", borderRadius: 9999, background: "var(--color-primary)", color: "#fff" }}>
                REPLAY
              </span>
            )}
          </h1>
          {config?.subject?.description && (
            <p style={{ color: "var(--color-muted)", fontSize: 14, maxWidth: "50%", lineHeight: 1.6 }}>
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

          {(!isReplay || !simState.loading) && layout === "roster" && (
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
          {(!isReplay || !simState.loading) && layout === "table" && (
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
          {(!isReplay || !simState.loading) && layout === "graph" && (
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

          {/* Outcome Banner — shown when simulation completes */}
          {outcome && (
            <div style={{
              padding: "16px 24px",
              margin: "0 16px 16px",
              borderRadius: 12,
              background: outcome.outcome_type === "agreement" ? "rgba(34,197,94,0.12)" 
                         : outcome.outcome_type === "walkaway" ? "rgba(234,179,8,0.12)"
                         : "rgba(186,26,26,0.08)",
              border: `1px solid ${
                outcome.outcome_type === "agreement" ? "rgba(34,197,94,0.3)"
                : outcome.outcome_type === "walkaway" ? "rgba(234,179,8,0.3)"
                : "rgba(186,26,26,0.3)"
              }`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{
                  fontSize: 24,
                  color: outcome.outcome_type === "agreement" ? "#22c55e"
                         : outcome.outcome_type === "walkaway" ? "#eab308"
                         : "#ba1a1a",
                }}>
                  {outcome.outcome_type === "agreement" ? "✅" : outcome.outcome_type === "walkaway" ? "⚠️" : "❌"}
                </span>
                <div>
                  <span style={{
                    display: "inline-block",
                    padding: "2px 10px",
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    background: outcome.outcome_type === "agreement" ? "rgba(34,197,94,0.2)"
                               : outcome.outcome_type === "walkaway" ? "rgba(234,179,8,0.2)"
                               : "rgba(186,26,26,0.2)",
                    color: outcome.outcome_type === "agreement" ? "#22c55e"
                           : outcome.outcome_type === "walkaway" ? "#eab308"
                           : "#ba1a1a",
                    marginBottom: 2,
                  }}>
                    {outcome.outcome_type === "agreement" ? "Deal Reached"
                     : outcome.outcome_type === "walkaway" ? "Walkaway"
                     : outcome.outcome_type === "judge_ruling" ? "Judge Ruling"
                     : "No Consensus"}
                  </span>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)", margin: 0 }}>
                    {outcome.summary || `Simulation ended via ${outcome.reason || "unknown"}.`}
                  </p>
                </div>
                {outcome.confidence !== undefined && (
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <span style={{ fontSize: 11, color: "var(--color-muted)" }}>Confidence</span>
                    <p style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono)", margin: 0 }}>
                      {Math.round(outcome.confidence * 100)}%
                    </p>
                  </div>
                )}
              </div>

              {/* Vote breakdown */}
              {outcome.vote_breakdown && Object.keys(outcome.vote_breakdown).length > 0 && (
                <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                  {Object.entries(outcome.vote_breakdown).map(([key, val]) => (
                    <div key={key} style={{ textAlign: "center" }}>
                      <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{String(val)}</span>
                      <p style={{ fontSize: 10, color: "var(--color-muted)", textTransform: "capitalize", margin: 0 }}>{key}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Judge notes */}
              {outcome.judge_notes && (
                <p style={{ fontSize: 12, color: "var(--color-muted)", fontStyle: "italic", marginTop: 8 }}>
                  Judge: {outcome.judge_notes}
                </p>
              )}

              {/* Walkaway party */}
              {outcome.walkaway_party && (
                <p style={{ fontSize: 12, color: "#eab308", marginTop: 4 }}>
                  Party walked away: {outcome.walkaway_party}
                </p>
              )}
            </div>
          )}

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
              <div style={{ background: "#141312", borderRadius: 12, padding: 24, color: "#fff" }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--color-primary)", marginBottom: 4 }}>Post-Mortem</p>
                <h3 style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 32, fontWeight: 700, marginBottom: 16 }}>{String(postmortem.subject || "Debate")}</h3>

                {/* Show verdict if available */}
                {!!postmortem.verdict && (
                  <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)" }}>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0 }}>
                      <strong style={{ color: "#fff" }}>Verdict:</strong> {String(postmortem.verdict)}
                    </p>
                    {!!postmortem.end_reason && (
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
                        Ended via: {String(postmortem.end_reason)}
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
                  <div style={{ borderRadius: 12, background: "rgba(255,255,255,0.05)", padding: 16 }}>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Total turns</p>
                    <p style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 28, fontWeight: 700 }}>{String(postmortem.total_turns ?? 0)}</p>
                  </div>
                  <div style={{ borderRadius: 12, background: "rgba(255,255,255,0.05)", padding: 16 }}>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Participants</p>
                    <p style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 28, fontWeight: 700 }}>{String(postmortem.stakeholder_count ?? 0)}</p>
                  </div>
                  <div style={{ borderRadius: 12, background: "rgba(255,255,255,0.05)", padding: 16 }}>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Voltage</p>
                    <p style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 28, fontWeight: 700 }}>{String(postmortem.voltage || 0)}</p>
                  </div>
                </div>

                {/* Summary if available */}
                {!!postmortem.summary && (
                  <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                    <p style={{ fontSize: 12, color: "var(--color-primary)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Summary</p>
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.85)", margin: 0 }}>{String(postmortem.summary)}</p>
                  </div>
                )}

                {(postmortem.leaderboard as Array<{ name: string; stance: string; turns: number }>)?.map((entry, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: i === 0 ? "rgba(255,255,255,0.08)" : "transparent", borderRadius: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 20, width: 24, color: i === 0 ? "#fff" : "rgba(255,255,255,0.4)" }}>#{i + 1}</span>
                    <div style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>{entry.name}</span><span style={{ marginLeft: 8, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{entry.stance}</span></div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{entry.turns} turns</span>
                  </div>
                ))}
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
