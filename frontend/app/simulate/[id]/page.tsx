"use client";

import { use, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { TurnDisplay } from "@/components/TurnDisplay";
import { createPostmortemAsync, fetchJob, fetchPostmortem, fetchSimulation, runSimulationAsync, streamSimulation } from "@/lib/api";
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

const HEATMAP_COLOR = (v: number) =>
  v >= 60 ? "bg-green-500" : v >= 35 ? "bg-accent-amber" : "bg-primary";

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
  const [jobStatus, setJobStatus] = useState<"queued" | "running" | "succeeded" | "failed" | null>(null);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const streamControllerRef = useRef<AbortController | null>(null);

  // Load initial simulation state
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
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Unable to load simulation.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [id]);

  // Auto-scroll transcript
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
          // append conflict point
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
      const status = res.job.status;
      setJobStatus(status);

      if (status === "succeeded") {
        setActiveJobId(null);
        return res.job;
      }

      if (status === "failed") {
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
      const res = await createPostmortemAsync(id);
      const job = await pollJobUntilDone(res.job.id);
      if (job.result) {
        setPostmortem(job.result as Postmortem);
      } else {
        setPostmortem(await fetchPostmortem(id));
      }
      setToast("Async postmortem generated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate async postmortem.");
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
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
              Active Session
            </span>
            {status === "running" && (
              <span 
                className="h-2 w-2 rounded-full bg-green-400 animate-pulse"
                role="status"
                aria-label="Simulation running"
              />
            )}
          </div>
          <h2 className="font-display text-4xl font-normal tracking-display text-ink">
            {simulation?.config.background?.slice(0, 48) ?? "Simulation"}&hellip;
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted leading-relaxed">
            {simulation?.config.primary_goal ?? "Loading context..."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={() => window.history.back()} 
            variant="ghost"
            aria-label="Back to previous page"
          >
            ← Back
          </Button>
          {status === "running" ? (
            <Button onClick={stopStream} variant="primary" aria-label="Pause simulation">
              Pause
            </Button>
          ) : (
            <>
              <Button 
                onClick={launch} 
                disabled={status === "complete" && turns.length > 0}
                aria-label={turns.length > 0 ? "Re-run simulation" : "Launch simulation"}
              >
                {turns.length > 0 ? "Re-run" : "Launch Simulation"}
              </Button>
              <Button
                variant="ghost"
                onClick={launchAsync}
                disabled={Boolean(activeJobId)}
                aria-label="Run simulation asynchronously"
              >
                {activeJobId && jobStatus !== "succeeded" ? `Async ${jobStatus ?? "queued"}` : "Run Async"}
              </Button>
            </>
          )}
          <Button 
            variant="ghost" 
            onClick={() => window.location.reload()}
            aria-label="Restart simulation"
          >
            Restart
          </Button>
        </div>
      </div>

      {toast && (
        <div 
          className="mb-4 rounded-xl bg-ink p-4 text-sm text-canvas"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
      {error && (
        <div 
          className="mb-4 rounded-xl bg-primary/10 p-4 text-sm text-primary-active"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}
      {simulation && (
        <section className="mb-5 rounded-xl border border-ink/10 bg-surface-card p-4">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Simulation ID</p>
              <p className="mt-1 font-mono text-xs text-ink break-all">{simulation.simulation_id}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Stakeholders</p>
              <p className="mt-1 font-semibold text-ink">{simulation.config.stakeholders.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Voltage</p>
              <p className="mt-1 font-semibold text-ink">{simulation.config.voltage}%</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Model Mode</p>
              <p className="mt-1 font-semibold text-ink capitalize">{simulation.config.model_temperature}</p>
            </div>
          </div>
        </section>
      )}

      {loading && (
        <div className="mb-5 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-xl border border-canvas/10 p-4 animate-pulse bg-surface-dark">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="space-y-2">
                  <div className="h-4 bg-canvas/10 rounded w-24" />
                  <div className="h-3 bg-canvas/10 rounded w-16" />
                </div>
                <div className="h-6 bg-canvas/10 rounded w-16" />
              </div>
              <div className="space-y-2 mt-4">
                <div className="h-3 bg-canvas/10 rounded w-full" />
                <div className="h-3 bg-canvas/10 rounded w-5/6" />
                <div className="h-3 bg-canvas/10 rounded w-4/6" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent cards grid (from mockup) */}
      {stakeholders.length > 0 && (
        <div className="mb-5 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {stakeholders.map((s) => {
            const isActive = s.id === activeId;
            const lastTurn = [...turns].reverse().find((t) => t.stakeholder_id === s.id);
            return (
              <div
                key={s.id}
                className={`rounded-xl border p-4 transition-all duration-300 bg-surface-dark text-canvas ${
                  isActive
                    ? "border-primary shadow-lg shadow-primary/20"
                    : "border-canvas/10"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-sm">{s.name}</p>
                    <p className="text-xs text-canvas/50">{s.role}</p>
                  </div>
                  {lastTurn?.action_type && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ACTION_COLORS[lastTurn.action_type] ?? "bg-canvas/10"}`}>
                      {lastTurn.action_type.replace("_", " ")}
                    </span>
                  )}
                </div>
                {isActive && (
                  <span className="block text-[10px] uppercase tracking-widest text-primary mb-2 font-semibold">
                    Active Speaker
                  </span>
                )}
                {lastTurn ? (
                  <p className="text-xs text-canvas/65 leading-relaxed line-clamp-3 font-mono">
                    &ldquo;{lastTurn.content}&rdquo;
                  </p>
                ) : (
                  <p className="text-xs text-canvas/70 italic">Awaiting turn...</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Main content: transcript + sidebar */}
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">

        {/* Transcript */}
        <section className="rounded-xl bg-surface-dark p-5 text-canvas flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-2xl font-normal tracking-display">Transcript</h3>
            <div className="flex items-center gap-3">
              {deadlockScore > 50 && (
                <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs text-red-300 font-semibold">
                  Deadlock Risk {deadlockScore}%
                </span>
              )}
              <span className="rounded-full border border-canvas/10 px-3 py-1 text-xs text-canvas/50">
                {status} · {turns.length} turns
              </span>
            </div>
          </div>

          <div
            ref={transcriptRef}
            className="space-y-3 overflow-y-auto max-h-[28rem] pr-1"
          >
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
              <div className="rounded-xl border border-dashed border-canvas/15 p-8 text-canvas/75 text-sm text-center space-y-4">
                <p>No turns yet. Launch the simulation to begin the negotiation.</p>
                <Button onClick={launch} variant="primary">
                  Start Simulation
                </Button>
              </div>
            )}
          </div>

          {/* Conflict timeline bar */}
          {conflictTimeline.length > 0 && (
            <div className="mt-4 pt-4 border-t border-canvas/10">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-canvas/75 uppercase tracking-wider">Conflict Timeline</p>
                <p className="text-xs text-canvas/70">Step {turns.length}/{requestedMaxTurns}</p>
              </div>
              <div className="relative h-3 rounded-full bg-canvas/10">
                {conflictTimeline.map((point) => {
                  const pct = (point.step / requestedMaxTurns) * 100;
                  const dotColor =
                    point.type === "intro"
                      ? "bg-canvas/40"
                      : point.type === "closure"
                      ? "bg-green-400"
                      : "bg-primary";
                  return (
                    <div
                      key={point.step}
                      title={point.label}
                      className={`absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full ${dotColor}`}
                      style={{ left: `${pct}%` }}
                    />
                  );
                })}
                <div
                  className="h-3 rounded-full bg-primary/30"
                  style={{ width: `${(turns.length / requestedMaxTurns) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-canvas/70 mt-1">
                <span>Intro</span>
                <span className="text-primary">Current</span>
                <span>Closure</span>
              </div>
            </div>
          )}
        </section>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Incentive Heatmap */}
          <Widget title="Incentive Heatmap">
            {heatmapEntries.length > 0 ? (
              <>
                <div className="space-y-3">
                  {heatmapEntries.map(([label, value, colorClass]) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="uppercase tracking-wider text-muted">{label}</span>
                        <span className={`font-semibold ${value < 35 ? "text-primary" : value < 60 ? "text-accent-amber" : "text-green-600"}`}>
                          {value}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-ink/10">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${colorClass}`}
                          style={{ width: `${value}%` }}
                          role="progressbar"
                          aria-valuenow={value}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${label}: ${value}%`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {heatmap?.recommendation && (
                  <p className="mt-3 text-xs text-muted leading-relaxed border-t border-ink/10 pt-3">
                    {heatmap.recommendation}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="mb-1 flex justify-between">
                      <div className="h-3 bg-ink/10 rounded w-24" />
                      <div className="h-3 bg-ink/10 rounded w-12" />
                    </div>
                    <div className="h-2 rounded-full bg-ink/10" />
                  </div>
                ))}
              </div>
            )}
          </Widget>

          {/* Sentiment graph */}
          <Widget title="Sentiment Graph">
            <div className="flex h-24 items-end gap-1">
              {sentiment.length > 0 ? (
                sentiment.map((score, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t transition-all duration-300 ${score < 0 ? "bg-primary/60" : "bg-accent-teal/70"}`}
                    style={{ height: `${Math.max(6, Math.abs(score) * 100)}%` }}
                    role="img"
                    aria-label={`Turn ${i + 1}: ${score > 0 ? 'positive' : 'negative'} sentiment`}
                  />
                ))
              ) : (
                Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-muted/10 rounded-t animate-pulse"
                    style={{ height: '30%' }}
                  />
                ))
              )}
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted">
              <span className="text-primary/70">● Negative</span>
              <span className="text-accent-teal/70">● Positive</span>
            </div>
          </Widget>

          {/* Coalitions */}
          {coalitions.length > 0 && (
            <Widget title="Active Coalitions">
              <div className="space-y-2">
                {coalitions.map((c, i) => (
                  <div key={i} className="rounded-lg bg-accent-amber/10 border border-accent-amber/20 p-2 text-xs">
                    <p className="font-semibold text-accent-amber">{c.agent_a} ⚡ {c.agent_b}</p>
                    <p className="text-muted mt-0.5 leading-relaxed">{c.issue}</p>
                  </div>
                ))}
              </div>
            </Widget>
          )}

          {/* Leverage shifts */}
          {leverageShifts.length > 0 && (
            <Widget title="Leverage Shifts">
              <div className="space-y-2">
                {leverageShifts.slice(-4).map((ls, i) => (
                  <div key={i} className="text-xs text-muted border-l-2 border-primary pl-2">
                    <span className="text-primary font-semibold">{ls.to_agent}</span>
                    {" gained over "}
                    <span>{ls.from_agent}</span>
                    <p className="text-muted mt-0.5 truncate">{ls.reason}</p>
                  </div>
                ))}
              </div>
            </Widget>
          )}

          {/* Event log */}
          <Widget title="Event Log">
            <div className="space-y-1.5 font-mono text-xs text-muted max-h-40 overflow-y-auto">
              {eventLog.length > 0 ? (
                eventLog.map((evt, i) => (
                  <p key={i} className={i === eventLog.length - 1 ? "text-primary" : ""}>{evt}</p>
                ))
              ) : (
                <p className="text-muted/50">Awaiting simulation events.</p>
              )}
            </div>
          </Widget>

          <div className="grid grid-cols-1 gap-2">
            <Button
              onClick={loadPostmortem}
              disabled={loadingPostmortem || turns.length === 0}
              className="w-full"
            >
              {loadingPostmortem ? "Generating..." : "Generate Postmortem"}
            </Button>
            <Button
              onClick={loadPostmortemAsync}
              disabled={loadingPostmortem || turns.length === 0 || Boolean(activeJobId)}
              variant="ghost"
              className="w-full"
            >
              {activeJobId && jobStatus ? `Async ${jobStatus}` : "Generate Postmortem Async"}
            </Button>
          </div>
        </aside>
      </div>

      {/* Postmortem */}
      {postmortem && <PostmortemPanel postmortem={postmortem} />}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Postmortem panel
// ---------------------------------------------------------------------------

function PostmortemPanel({ postmortem }: { postmortem: Postmortem }) {
  const RISK_STYLE: Record<string, string> = {
    LOW: "bg-green-500/15 text-green-700",
    MEDIUM: "bg-accent-amber/15 text-amber-700",
    HIGH: "bg-primary/15 text-primary-active",
  };

  return (
    <section className="mt-6 rounded-xl bg-surface-card p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary mb-1">
        Post-Mortem Analysis
      </p>
      <h3 className="font-display text-3xl font-normal tracking-display text-ink mb-4">
        Negotiation Debrief
      </h3>
      {postmortem.mocked && (
        <p className="mb-4 rounded-lg bg-accent-amber/10 px-4 py-2 text-xs text-amber-700">
          Running in mock mode — configure OPENROUTER_API_KEY for AI-generated analysis.
        </p>
      )}

      {/* Scores */}
      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <Metric label="Confidence Score" value={`${postmortem.confidence_score}%`} />
        <Metric
          label="Trend"
          value={`${postmortem.confidence_trend >= 0 ? "+" : ""}${postmortem.confidence_trend}`}
        />
        <Metric label="Consensus Rating" value={`${postmortem.consensus_rating}%`} />
      </div>

      {postmortem.unanticipated_note && (
        <p className="mb-5 text-sm text-muted leading-relaxed">{postmortem.unanticipated_note}</p>
      )}

      {/* Alignment deltas */}
      {postmortem.alignment_deltas.length > 0 && (
        <div className="mb-5 rounded-xl bg-surface-dark p-4">
          <p className="text-xs text-canvas/75 uppercase tracking-wider mb-3">Stakeholder Delta</p>
          <div className="space-y-2">
            {postmortem.alignment_deltas.map((ad) => (
              <div key={ad.stakeholder_id} className="flex items-center justify-between text-sm">
                <span className="text-canvas/70 font-medium">{ad.name}</span>
                <span className={`font-semibold ${ad.delta >= 0 ? "text-green-400" : "text-primary"}`}>
                  {ad.delta >= 0 ? "+" : ""}{ad.delta}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strategy cards */}
      {postmortem.strategy_cards.length > 0 && (
        <div>
          <p className="text-xs text-muted uppercase tracking-wider mb-3">
            Meeting Strategy Guide — {postmortem.strategy_cards.length} Patterns
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {postmortem.strategy_cards.map((card) => (
              <article key={card.objection} className="rounded-xl bg-white/45 p-4 border border-ink/8">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
                  The Objection
                </p>
                <p className="text-sm font-medium italic text-ink leading-snug mb-3">
                  &ldquo;{card.objection}&rdquo;
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
                  The Counter
                </p>
                <p className="text-sm text-muted leading-relaxed mb-3">{card.counter}</p>
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

// ---------------------------------------------------------------------------
// Reusable components
// ---------------------------------------------------------------------------

function Widget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/45 p-4 border border-ink/8">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="font-display text-3xl font-normal tracking-display">{value}</p>
    </div>
  );
}
