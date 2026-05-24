"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ControlBar, type WarRoomLayout, type PlaybackStatus, type SpeedMultiplier } from "@/components/ControlBar";
import { RosterLayout } from "@/components/war-room/RosterLayout";
import { TableLayout } from "@/components/war-room/TableLayout";
import dynamic from "next/dynamic";
const GraphLayout = dynamic(() => import("@/components/war-room/GraphLayout").then((m) => ({ default: m.GraphLayout })), { ssr: false });
import { fetchSimulationV2, streamSimulationV2, postmortemV2 } from "@/lib/api";
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

  const streamCtrl = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const persistKey = `wr-session-${id}`;
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  const baseInterval = 3800;

  useEffect(() => {
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
  }, [id]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        sessionStorage.setItem(persistKey, JSON.stringify({
          turns, playTurn, speedMul, layout, playing, status, postmortem, stateSnapshots,
        }));
      } catch {}
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [turns, playTurn, speedMul, layout, playing, status, postmortem, stateSnapshots, persistKey]);

  useEffect(() => {
    fetchSimulationV2(id)
      .then((data) => setConfig(data.config ?? null))
      .catch(() => {});
    // Always start stream — backend handles replay for completed sims via DB turns
    startStream();
    return () => streamCtrl.current?.abort();
  }, [id]);

  useEffect(() => {
    if (!playing || turns.length === 0) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      return;
    }
    if (playTurn >= turns.length - 1 && status === "complete") { setPlaying(false); return; }
    if (playTurn >= turns.length - 1) return;
    const interval = baseInterval / speedMul;
    timerRef.current = setTimeout(() => setPlayTurn((t) => Math.min(turns.length - 1, t + 1)), interval);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, playTurn, turns.length, speedMul, status]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [playTurn]);

  const startStream = () => {
    if (status === "running") return;
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
    const simDone = status === "complete" && playTurn >= turns.length - 1;
    if (simDone && !postmortem && !loadingPostmortem) {
      loadPostmortem();
    }
  }, [status, playTurn, turns.length, postmortem, loadingPostmortem]);

  const current = turns[playTurn];
  const done = status === "complete" && playTurn >= turns.length - 1;
  const live = status === "running";
  const speakerId = current?.speaker ?? null;
  const subjectName = config?.subject?.name ?? "Debate";

  const stakeholders = (config?.stakeholders ?? []).map((s) => ({
    id: s.id, name: s.name, role: s.role, stance: s.stance,
    lastContent: [...turns.slice(0, playTurn + 1)].reverse().find((t) => t.speaker === s.name)?.content ?? null,
  }));

  const eventLog = turns.slice(0, playTurn + 1).map((t) => ({
    t: t.turn_index, text: `[agent] ${t.speaker} — ${t.content.slice(0, 60)}${t.content.length > 60 ? "…" : ""}`, type: "agent" as const,
  }));

  const simState = useSimulationState(stateSnapshots as Record<string, unknown>[]);

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
          total={Math.max(turns.length, 30)}
          status={done ? "complete" : playing && live ? "running" : "idle"}
          speedMul={speedMul}
          layout={layout}
          scenarioLabel={subjectName.split(" ")[0]}
          voltage={config?.voltage}
          onPlay={() => { if (turns.length === 0) startStream(); setPlaying(true); }}
          onPause={() => setPlaying(false)}
          onRestart={() => { setPlayTurn(0); setPlaying(true); }}
          onStepBack={() => setPlayTurn((t) => Math.max(0, t - 1))}
          onStepForward={() => setPlayTurn((t) => Math.min(turns.length - 1, t + 1))}
          onSpeedChange={setSpeedMul}
          onLayoutChange={setLayout}
        />

        <div style={{ flex: 1, overflowY: "auto", background: "var(--color-canvas)" }}>
          {layout === "roster" && (
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
          {layout === "table" && (
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
          {layout === "graph" && (
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
            <div style={{ textAlign: "center", padding: "12px 16px 24px" }}>
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
            </div>
          )}

          {postmortem && (
            <>
              <div style={{ padding: 16, maxWidth: 700, margin: "0 auto 0" }}>
                <div className="mb-4 text-center">
                  <a
                    href={`/simulate/${id}/postmortem`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-canvas transition hover:bg-ink/80 no-underline"
                  >
                    View full postmortem analysis
                    <span className="text-lg">→</span>
                  </a>
                </div>
              </div>
              <div style={{ padding: "0 16px 32px", maxWidth: 700, margin: "0 auto" }}>
              <div style={{ background: "#141312", borderRadius: 12, padding: 24, color: "#fff" }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--color-primary)", marginBottom: 4 }}>Post-Mortem</p>
                <h3 style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 32, fontWeight: 700, marginBottom: 16 }}>{String(postmortem.subject || "Debate")}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
                  <div style={{ borderRadius: 12, background: "rgba(255,255,255,0.05)", padding: 16 }}>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Total turns</p>
                    <p style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 28, fontWeight: 700 }}>{String(postmortem.total_turns || 0)}</p>
                  </div>
                  <div style={{ borderRadius: 12, background: "rgba(255,255,255,0.05)", padding: 16 }}>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Participants</p>
                    <p style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 28, fontWeight: 700 }}>{String(postmortem.stakeholder_count || 0)}</p>
                  </div>
                  <div style={{ borderRadius: 12, background: "rgba(255,255,255,0.05)", padding: 16 }}>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Voltage</p>
                    <p style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 28, fontWeight: 700 }}>{String(postmortem.voltage || 0)}</p>
                  </div>
                </div>
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
