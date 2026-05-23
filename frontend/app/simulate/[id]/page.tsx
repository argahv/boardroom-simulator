"use client";

import { use, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { TurnDisplay } from "@/components/TurnDisplay";
import {
  fetchJob,
  fetchPostmortem,
  fetchSimulation,
  injectHumanTurn,
  runSimulationAsync,
  streamSimulation,
} from "@/lib/api";
import type {
  CoalitionSignal,
  ConflictPoint,
  HeatmapState,
  LeverageShift,
  Postmortem,
  SimulationState,
  Turn,
} from "@/lib/types";

type PageProps = { params: Promise<{ id: string }> };

const ACTION_COLORS: Record<string, string> = {
  statement: "bg-canvas/10 text-canvas/70",
  question: "bg-accent-teal/20 text-accent-teal",
  challenge: "bg-primary/25 text-primary",
  compromise: "bg-green-500/20 text-green-300",
  coalition_signal: "bg-accent-amber/20 text-accent-amber",
  interrupt: "bg-red-500/25 text-red-300",
  escalate: "bg-red-700/30 text-red-200",
};

const DISPOSITION_LABELS: Record<string, string> = {
  statement: "NEUTRAL",
  question: "CALIBRATING",
  challenge: "SKEPTICAL",
  compromise: "AGREEABLE",
  coalition_signal: "ALIGNED",
  interrupt: "LOCKED",
  escalate: "HOSTILE",
};

const DISPOSITION_COLORS: Record<string, string> = {
  statement: "text-on-dark-soft border-on-dark-soft/40",
  question: "text-accent-amber border-accent-amber/60",
  challenge: "text-accent-amber border-accent-amber/60",
  compromise: "text-secondary border-secondary/60",
  coalition_signal: "text-accent-teal border-accent-teal/60",
  interrupt: "text-error border-error/60",
  escalate: "text-error border-error/70",
};

const TONE_INDICATOR: Record<string, string> = {
  neutral: "🟡",
  tense: "🟠",
  heated: "🔴",
  conciliatory: "🟢",
};

const HEATMAP_COLOR = (v: number) =>
  v >= 60 ? "bg-secondary" : v >= 35 ? "bg-accent-amber" : "bg-primary";

export default function WarRoomPage({ params }: PageProps) {
  const { id } = use(params);

  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapState | null>(null);
  const [sentiment, setSentiment] = useState<number[]>([]);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [coalitions, setCoalitions] = useState<CoalitionSignal[]>([]);
  const [leverageShifts, setLeverageShifts] = useState<LeverageShift[]>([]);
  const [conflictTimeline, setConflictTimeline] = useState<ConflictPoint[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deadlockScore, setDeadlockScore] = useState(0);
  const [status, setStatus] = useState<"idle" | "running" | "complete">("idle");

  const [postmortem, setPostmortem] = useState<Postmortem | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingPostmortem, setLoadingPostmortem] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<
    "queued" | "running" | "succeeded" | "failed" | null
  >(null);
  const [humanStakeholderId, setHumanStakeholderId] = useState("");
  const [humanContent, setHumanContent] = useState("");
  const [leaderboard, setLeaderboard] = useState<SimulationState["leaderboard"]>([]);
  const [winningContext, setWinningContext] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<string>("idle");

  const transcriptRef = useRef<HTMLDivElement>(null);
  const streamControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSimulation(id)
      .then((data) => {
        if (!alive) return;
        setSimulation(data);
        setTurns(data.turns);
        setHeatmap(data.heatmap);
        setSentiment(data.sentiment);
        setEventLog(data.event_log);
        setCoalitions(data.coalitions ?? []);
        setLeverageShifts(data.leverage_shifts ?? []);
        setConflictTimeline(data.conflict_timeline ?? []);
        setStatus(data.status);
        setDeadlockScore(data.deadlock_risk_score ?? 0);
        setLeaderboard(data.leaderboard ?? []);
        setWinningContext(data.winning_context ?? "");
        setRuntimeStatus(data.runtime_status ?? "idle");
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Unable to load simulation.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [turns.length]);

  const launch = () => {
    if (status === "running") return;
    setError("");
    setStatus("running");

    const requestedMaxTurns = 20;
    const ctrl = streamSimulation(
      id,
      requestedMaxTurns,
      (event) => {
        if (event.type === "turn") {
          setTurns((prev) => [...prev, event.turn]);
          setActiveId(event.state_summary.active_speaker_id ?? null);
          setHeatmap(event.state_summary.heatmap);
          setSentiment(event.state_summary.sentiment);
          setEventLog(event.state_summary.event_log);
          setCoalitions(event.state_summary.coalitions);
          setLeverageShifts(event.state_summary.leverage_shifts);
          setDeadlockScore(event.state_summary.deadlock_risk_score);
          setLeaderboard(event.state_summary.leaderboard ?? []);
          setWinningContext(event.state_summary.winning_context ?? "");
          if (event.state_summary.runtime_status) {
            setRuntimeStatus(event.state_summary.runtime_status);
          }
          const t = event.turn;
          setConflictTimeline((prev) => [
            ...prev,
            { step: t.turn_index, label: `${t.stakeholder_name}: ${t.action_type}`, type: "clash" },
          ]);
        } else if (event.type === "done") {
          const s = event.state;
          setSimulation(s);
          setTurns(s.turns);
          setHeatmap(s.heatmap);
          setSentiment(s.sentiment);
          setEventLog(s.event_log);
          setCoalitions(s.coalitions ?? []);
          setLeverageShifts(s.leverage_shifts ?? []);
          setConflictTimeline(s.conflict_timeline ?? []);
          setDeadlockScore(s.deadlock_risk_score ?? 0);
          setLeaderboard(s.leaderboard ?? []);
          setWinningContext(s.winning_context ?? "");
          setRuntimeStatus(s.runtime_status ?? "idle");
          setStatus("complete");
        } else if (event.type === "error") {
          setError(event.message);
          setStatus("idle");
        }
      },
      (err) => {
        setError(err.message);
        setStatus("idle");
      },
      () => setStatus("complete")
    );
    streamControllerRef.current = ctrl;
  };

  const stopStream = () => {
    streamControllerRef.current?.abort();
    setStatus("idle");
  };

  const submitHumanTurn = async () => {
    if (!humanContent.trim() || !humanStakeholderId) return;
    setError("");
    try {
      const updated = await injectHumanTurn(id, {
        stakeholder_id: humanStakeholderId,
        content: humanContent.trim(),
        action_type: "statement",
      });
      setTurns(updated.turns);
      setEventLog(updated.event_log);
      setHumanContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to inject turn.");
    }
  };

  const loadPostmortem = async () => {
    setLoadingPostmortem(true);
    setError("");
    try {
      setPostmortem(await fetchPostmortem(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate postmortem.");
    } finally {
      setLoadingPostmortem(false);
    }
  };

  const pollJobUntilDone = async (jobId: string) => {
    setActiveJobId(jobId);
    setJobStatus("queued");

    for (let i = 0; i < 120; i++) {
      const res = await fetchJob(jobId);
      const jobStatusVal = res.job.status;
      setJobStatus(jobStatusVal);

      if (jobStatusVal === "succeeded") {
        setActiveJobId(null);
        return res.job;
      }

      if (jobStatusVal === "failed") {
        setActiveJobId(null);
        throw new Error(res.job.error || "Async job failed");
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    setActiveJobId(null);
    throw new Error("Async job polling timed out");
  };

  const launchAsync = async () => {
    setError("");
    try {
      const res = await runSimulationAsync(id, 20);
      await pollJobUntilDone(res.job.id);
      const refreshed = await fetchSimulation(id);
      setSimulation(refreshed);
      setTurns(refreshed.turns);
      setHeatmap(refreshed.heatmap);
      setSentiment(refreshed.sentiment);
      setEventLog(refreshed.event_log);
      setCoalitions(refreshed.coalitions ?? []);
      setLeverageShifts(refreshed.leverage_shifts ?? []);
      setConflictTimeline(refreshed.conflict_timeline ?? []);
      setStatus(refreshed.status);
      setDeadlockScore(refreshed.deadlock_risk_score ?? 0);
      setToast("Async simulation completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run async simulation.");
    }
  };

  const loadPostmortemAsync = async () => {
    setError("");
    setLoadingPostmortem(true);
    try {
      const data = await fetchPostmortem(id);
      setPostmortem(data);
      setToast("Postmortem generated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate postmortem.");
    } finally {
      setLoadingPostmortem(false);
    }
  };

  const stakeholders = simulation?.config.stakeholders ?? [];
  const requestedMaxTurns = 20;
  const heatmapEntries: [string, number, string][] = heatmap
    ? [
        ["Commercial Gain", heatmap.commercial_gain, HEATMAP_COLOR(heatmap.commercial_gain)],
        ["Tech Integrity", heatmap.tech_integrity, HEATMAP_COLOR(heatmap.tech_integrity)],
        ["Legal Safety", heatmap.legal_safety, HEATMAP_COLOR(heatmap.legal_safety)],
      ]
    : [];

  return (
    <AppShell activeTab="War Room">
      <div className="flex flex-col min-h-screen">
        <div className="px-8 py-10 bg-canvas border-b border-hairline">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
              Active Session
            </span>
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "running" ? "bg-primary animate-pulse" : "bg-primary/40"
              }`}
            />
            {simulation?.player_mode && (
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                runtimeStatus === "awaiting_human"
                  ? "bg-accent-amber/20 border-accent-amber/60 text-accent-amber"
                  : "bg-primary/20 border-primary/40 text-primary"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${runtimeStatus === "awaiting_human" ? "bg-accent-amber animate-pulse" : "bg-primary"}`} />
                {runtimeStatus === "awaiting_human" ? "Awaiting Your Turn" : "AI Turn"}
              </span>
            )}
          </div>
          <h1 className="font-serif-title text-[56px] font-bold text-ink leading-tight mb-3">
            {simulation?.config.background?.slice(0, 55) ?? "Negotiation"}
          </h1>
          <p className="text-muted text-base max-w-2xl leading-relaxed">
            {simulation?.config.primary_goal ?? "Loading context..."}
          </p>
        </div>

        {(toast || error) && (
          <div className="px-8 pt-4">
            {toast && (
              <div
                className="mb-3 rounded-lg bg-surface-card border border-hairline p-3 text-xs text-body-strong"
                role="status"
                aria-live="polite"
              >
                {toast}
              </div>
            )}
            {error && (
              <div
                className="mb-3 rounded-lg bg-error/10 border border-error/30 p-3 text-xs text-error"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            )}
          </div>
        )}

        <div className="war-room-gradient flex-1 p-8 flex flex-col lg:flex-row gap-8">
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            {stakeholders.length > 0 && (
              <div className="grid grid-cols-2 gap-5">
                {stakeholders.map((s) => {
                  const isActive = s.id === activeId;
                  const lastTurn = [...turns].reverse().find((t) => t.stakeholder_id === s.id);
                  const initials = s.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2);
                  const disposition = lastTurn?.action_type;

                  return (
                    <div
                      key={s.id}
                      className={`relative rounded-lg bg-surface-dark-elevated transition-all duration-300 hover:-translate-y-1 p-4 ${
                        isActive
                          ? "border-2 border-primary ring-4 ring-primary/10"
                          : "border border-white/5 hover:border-white/20"
                      }`}
                    >
                      {isActive && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                          <span className="px-3 py-0.5 rounded-full bg-primary text-on-dark text-[9px] font-bold uppercase tracking-widest shadow">
                            Active Speaker
                          </span>
                        </div>
                      )}

                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                              isActive
                                ? "bg-primary/30 text-on-dark"
                                : "bg-surface-dark text-on-dark-soft grayscale"
                            }`}
                          >
                            {initials}
                          </div>
                          <div>
                            <p className="font-semibold text-on-dark text-sm leading-tight">{s.name}</p>
                            <p className="text-[11px] text-on-dark-soft leading-tight mt-0.5">{s.role}</p>
                          </div>
                        </div>
                        {disposition && (
                          <span
                            className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 shrink-0 ${
                              DISPOSITION_COLORS[disposition] ?? "text-on-dark-soft border-on-dark-soft/40"
                            }`}
                          >
                            {DISPOSITION_LABELS[disposition] ?? disposition.replace("_", " ")}
                          </span>
                        )}
                      </div>

                      {lastTurn ? (
                        <p className={`font-code text-[14px] leading-relaxed ${isActive ? "text-on-dark" : "text-on-dark-soft"}`}>
                          &ldquo;{lastTurn.content.slice(0, 130)}{lastTurn.content.length > 130 ? "…" : ""}&rdquo;
                        </p>
                      ) : (
                        <p className="font-code text-[14px] text-on-dark-soft/40 italic">Awaiting turn…</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="bg-surface-dark rounded-lg border border-white/10 p-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-on-dark">Conflict Timeline</h3>
                <span className="font-code text-[12px] text-on-dark-soft">
                  Sim Step: {turns.length}/{requestedMaxTurns}
                </span>
              </div>

              <div className="relative h-16 flex items-center">
                <div className="absolute left-0 right-0 h-[1px] bg-white/10" />
                <div
                  className="absolute left-0 h-[1px] bg-primary transition-all duration-500"
                  style={{ width: `${(turns.length / requestedMaxTurns) * 100}%` }}
                />
                {conflictTimeline.map((point) => {
                  const pct = (point.step / requestedMaxTurns) * 100;
                  const isPast = point.step <= turns.length;
                  const isCurrent = point.step === turns.length;
                  return (
                    <div
                      key={point.step}
                      title={point.label}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 top-1/2 rounded-full ${
                        isCurrent
                          ? "w-4 h-4 bg-primary pulse-coral shadow-[0_0_15px_rgba(143,72,47,0.8)]"
                          : isPast
                            ? "w-3 h-3 bg-primary"
                            : "w-2 h-2 bg-white/20"
                      }`}
                      style={{ left: `${pct}%` }}
                    />
                  );
                })}
              </div>

              <div className="flex justify-between text-[10px] uppercase tracking-wider mt-1">
                <span className="text-on-dark-soft">INTRO</span>
                <span className="text-primary font-semibold">CURRENT CLASH</span>
                <span className="text-on-dark-soft">CLOSURE</span>
              </div>
            </div>

            <details className="bg-surface-dark-elevated border border-white/10 rounded-lg p-4">
              <summary className="text-sm font-semibold text-on-dark cursor-pointer hover:text-on-dark/80 mb-3">
                Full Transcript ({turns.length} turns)
              </summary>
              <div ref={transcriptRef} className="space-y-3 overflow-y-auto max-h-96 pr-2">
                {turns.length > 0 ? (
                  turns.map((turn) => {
                    const isActive = turn.stakeholder_id === activeId && turn.turn_index === turns.length;
                    return (
                      <TurnDisplay
                        key={`${turn.stakeholder_id}-${turn.turn_index}`}
                        turn={turn}
                        isActive={isActive}
                      />
                    );
                  })
                ) : (
                  <p className="text-xs text-on-dark-soft italic">No turns yet.</p>
                )}
              </div>
            </details>
          </div>

          <aside className="w-full lg:w-80 flex flex-col gap-4">
            <div className="bg-surface-card rounded-lg border border-hairline p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-body-strong">Incentive Heatmap</h3>
                <span className="material-symbols-outlined text-[18px] text-muted" aria-hidden="true">filter_center_focus</span>
              </div>
              <div className="space-y-3">
                {heatmapEntries.length > 0 ? (
                  heatmapEntries.map(([label, value, colorClass]) => (
                    <div key={label}>
                      <div className="flex justify-between text-[10px] mb-1.5">
                        <span className="uppercase tracking-widest text-muted">{label}</span>
                        <span className={`font-bold ${value >= 60 ? "text-secondary" : value >= 35 ? "text-accent-amber" : "text-primary"}`}>
                          {value}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-hairline overflow-hidden">
                        <div className={`h-1.5 rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-1.5 bg-hairline rounded-full" />
                      </div>
                    ))}
                  </div>
                )}
                {heatmap?.recommendation && (
                  <p className="text-[11px] text-muted leading-relaxed border-t border-hairline pt-3 mt-2 italic">
                    &ldquo;{heatmap.recommendation}&rdquo;
                  </p>
                )}
              </div>
            </div>

            <div className="bg-surface-card rounded-lg border border-hairline p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-body-strong">Sentiment Graph</h3>
                <span className="material-symbols-outlined text-[18px] text-muted" aria-hidden="true">show_chart</span>
              </div>
              <div className="flex h-32 items-end gap-0.5">
                {sentiment.length > 0 ? (
                  sentiment.map((score, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm transition-all duration-300 ${score < 0 ? "bg-error/60" : "bg-primary/60"}`}
                      style={{ height: `${Math.max(8, Math.abs(score) * 100)}%` }}
                      role="img"
                      aria-label={`Turn ${i + 1}: ${score > 0 ? "positive" : "negative"} sentiment`}
                    />
                  ))
                ) : (
                  Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="flex-1 bg-hairline rounded-sm" style={{ height: `${[32,45,28,55,38,62,24,48,36,52,30,42][i]}%` }} />
                  ))
                )}
              </div>
              <div className="mt-3 flex items-center gap-2 text-[10px] text-muted">
                <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                <span className="italic">Aggressive Negotiation Phase</span>
              </div>
            </div>

            {coalitions.length > 0 && (
              <div className="bg-surface-card rounded-lg border border-hairline p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-body-strong mb-3">Active Coalitions</h3>
                <div className="space-y-2">
                  {coalitions.map((c, i) => (
                    <div key={i} className="rounded-lg bg-accent-amber/10 border border-accent-amber/30 p-2">
                      <p className="font-semibold text-primary text-xs">{c.agent_a} ⚡ {c.agent_b}</p>
                      <p className="text-xs mt-0.5 leading-relaxed text-muted">{c.issue}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {leaderboard && leaderboard.length > 0 && (
              <div className="bg-surface-card rounded-lg border border-hairline p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-body-strong">Who's Winning</h3>
                </div>
                {winningContext && (
                  <p className="text-xs text-muted italic mb-3 leading-relaxed">{winningContext}</p>
                )}
                <div className="space-y-2">
                  {leaderboard.map((entry) => (
                    <div key={entry.agent_id} className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold w-4 shrink-0 ${entry.rank === 1 ? "text-accent-amber" : "text-muted"}`}>
                        #{entry.rank}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-body-strong truncate">{entry.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="font-code text-xs font-bold text-body-strong">{entry.score.toFixed(1)}</span>
                            {entry.delta !== 0 && (
                              <span className={`text-[10px] font-bold ${entry.delta > 0 ? "text-secondary" : "text-error"}`}>
                                {entry.delta > 0 ? "▲" : "▼"}{Math.abs(entry.delta).toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-1 rounded-full bg-hairline mt-1 overflow-hidden">
                          <div
                            className={`h-1 rounded-full transition-all duration-500 ${entry.rank === 1 ? "bg-accent-amber" : "bg-primary/50"}`}
                            style={{ width: `${Math.min(100, entry.score)}%` }}
                          />
                        </div>
                        {entry.delta_reason && entry.delta_reason !== "stable" && (
                          <p className="text-[10px] text-muted mt-0.5 truncate">{entry.delta_reason}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {leverageShifts.length > 0 && (
              <div className="bg-surface-card rounded-lg border border-hairline p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-body-strong mb-3">Leverage Shifts</h3>
                <div className="space-y-2">
                  {leverageShifts.slice(-4).map((ls, i) => (
                    <div key={i} className="text-xs text-muted border-l-2 border-primary pl-2">
                      <span className="text-primary font-semibold">{ls.to_agent}</span>
                      {" gained over "}
                      <span>{ls.from_agent}</span>
                      <p className="text-muted/70 mt-0.5 truncate">{ls.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-surface-dark-soft rounded-lg border border-white/10 p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-dark-soft mb-2.5 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-accent-amber" aria-hidden="true">terminal</span>
                EVENT_LOG
              </h3>
              <div className="space-y-1 font-code text-[11px] text-on-dark-soft max-h-28 overflow-y-auto">
                {eventLog.length > 0 ? (
                  eventLog.map((evt, i) => (
                    <p key={i} className={`leading-relaxed ${i === eventLog.length - 1 ? "text-primary" : ""}`}>
                      &gt; {evt}
                    </p>
                  ))
                ) : (
                  <p className="text-on-dark-soft/40">Awaiting events…</p>
                )}
                <div className="w-2 h-4 bg-primary inline-block animate-pulse ml-1 align-middle" />
              </div>
            </div>

            <div className="space-y-2">
              <Button
                onClick={loadPostmortem}
                disabled={loadingPostmortem || turns.length === 0}
                className="w-full bg-primary hover:bg-primary-active text-on-dark"
              >
                {loadingPostmortem ? "Generating..." : "Generate Postmortem"}
              </Button>
              <Button
                onClick={loadPostmortemAsync}
                disabled={loadingPostmortem || turns.length === 0 || Boolean(activeJobId)}
                variant="ghost"
                className="w-full text-on-dark-soft hover:text-on-dark border border-white/20 hover:border-white/40"
              >
                {activeJobId && jobStatus ? `Async ${jobStatus}` : "Generate Async"}
              </Button>
            </div>
          </aside>
        </div>

        {postmortem && <PostmortemPanel postmortem={postmortem} />}

        <div className="mx-8 mb-4 rounded-lg bg-surface-card border border-hairline p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-body-strong mb-2">Player Mode</p>
          {(!simulation?.player_mode || runtimeStatus === "awaiting_human") ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select
                value={humanStakeholderId}
                onChange={(e) => setHumanStakeholderId(e.target.value)}
                className="md:col-span-1 rounded-md border border-hairline bg-white px-3 py-2 text-sm"
              >
                <option value="">Select stakeholder</option>
                {stakeholders.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                value={humanContent}
                onChange={(e) => setHumanContent(e.target.value)}
                placeholder="Type your turn..."
                className="md:col-span-2 rounded-md border border-hairline bg-white px-3 py-2 text-sm"
              />
              <button
                onClick={submitHumanTurn}
                className="md:col-span-1 rounded-md bg-primary hover:bg-primary-active text-on-dark px-3 py-2 text-sm font-semibold"
              >
                Inject Turn
              </button>
            </div>
          ) : (
            <div className="rounded-md border border-hairline bg-hairline/20 px-3 py-2 text-sm text-muted">
              Waiting for AI...
            </div>
          )}
        </div>

        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-full bg-ink/90 backdrop-blur-md border border-white/10 shadow-2xl">
          {status === "running" ? (
            <button
              onClick={stopStream}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-primary hover:bg-primary-active text-on-dark text-xs font-semibold transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">pause</span>
              Pause
            </button>
          ) : (
            <button
              onClick={launch}
              disabled={status === "complete" && turns.length > 0}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-primary hover:bg-primary-active disabled:opacity-40 text-on-dark text-xs font-semibold transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                {turns.length === 0 ? "play_arrow" : "replay"}
              </span>
              {turns.length === 0 ? "Start" : "Restart"}
            </button>
          )}

          <button
            onClick={launch}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-dark-elevated hover:bg-surface-dark text-on-dark-soft hover:text-on-dark text-xs font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">restart_alt</span>
            Restart
          </button>

          <div className="w-[1px] h-6 bg-white/20" role="separator" />

          <button
            onClick={launchAsync}
            disabled={Boolean(activeJobId)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-dark-elevated hover:bg-surface-dark disabled:opacity-40 text-on-dark-soft hover:text-on-dark text-xs font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">fork_right</span>
            {activeJobId && jobStatus !== "succeeded" ? `⟳ ${jobStatus}` : "Fork Scenario"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function PostmortemPanel({ postmortem }: { postmortem: Postmortem }) {
  const RISK_STYLE: Record<string, string> = {
    LOW: "bg-secondary/15 text-secondary",
    MEDIUM: "bg-accent-amber/15 text-accent-amber",
    HIGH: "bg-error/15 text-error",
  };

  return (
    <section className="mx-8 mb-8 rounded-xl bg-surface-dark-elevated border border-white/10 p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary mb-1">
        Post-Mortem Analysis
      </p>
      <h3 className="font-serif-title text-3xl font-bold text-on-dark mb-4">
        Negotiation Debrief
      </h3>
      {postmortem.mocked && (
        <p className="mb-4 rounded-lg bg-accent-amber/10 px-4 py-2 text-xs text-accent-amber border border-accent-amber/30">
          Running in mock mode — configure OPENROUTER_API_KEY for AI-generated analysis.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <Metric label="Confidence Score" value={`${postmortem.confidence_score}%`} />
        <Metric
          label="Trend"
          value={`${postmortem.confidence_trend >= 0 ? "+" : ""}${postmortem.confidence_trend}`}
        />
        <Metric label="Consensus Rating" value={`${postmortem.consensus_rating}%`} />
      </div>

      {postmortem.unanticipated_note && (
        <p className="mb-5 text-sm text-on-dark-soft leading-relaxed">{postmortem.unanticipated_note}</p>
      )}

      {postmortem.alignment_deltas.length > 0 && (
        <div className="mb-5 rounded-xl bg-surface-dark p-4 border border-white/10">
          <p className="text-xs text-on-dark-soft uppercase tracking-wider mb-3">Stakeholder Delta</p>
          <div className="space-y-2">
            {postmortem.alignment_deltas.map((ad) => (
              <div key={ad.stakeholder_id} className="flex items-center justify-between text-sm">
                <span className="text-on-dark font-medium">{ad.name}</span>
                <span className={`font-semibold ${ad.delta >= 0 ? "text-secondary" : "text-error"}`}>
                  {ad.delta >= 0 ? "+" : ""}{ad.delta}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {postmortem.strategy_cards.length > 0 && (
        <div>
          <p className="text-xs text-on-dark-soft uppercase tracking-wider mb-3">
            Meeting Strategy Guide — {postmortem.strategy_cards.length} Patterns
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {postmortem.strategy_cards.map((card) => (
              <article key={card.objection} className="rounded-xl bg-surface-dark p-4 border border-white/10">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-on-dark-soft mb-1">
                  The Objection
                </p>
                <p className="text-sm font-medium italic text-on-dark leading-snug mb-3">
                  &ldquo;{card.objection}&rdquo;
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-on-dark-soft mb-1">
                  The Counter
                </p>
                <p className="text-sm text-on-dark-soft leading-relaxed mb-3">{card.counter}</p>
                <span className={`rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${RISK_STYLE[card.risk]}`}>
                  {card.risk}
                </span>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-dark p-4 border border-white/10">
      <p className="text-xs text-on-dark-soft mb-1">{label}</p>
      <p className="font-serif-title text-3xl font-bold text-on-dark">{value}</p>
    </div>
  );
}
