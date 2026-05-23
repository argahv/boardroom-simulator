"use client";

import { use, useEffect, useReducer, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ControlBar, type WarRoomLayout, type PlaybackStatus, type SpeedMultiplier } from "@/components/ControlBar";
import { RosterLayout } from "@/components/layouts/RosterLayout";
import { TableLayout } from "@/components/layouts/TableLayout";
import { GraphLayout } from "@/components/layouts/GraphLayout";
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
  HeatmapState,
  LeverageShift,
  Postmortem,
  SimulationState,
  Turn,
} from "@/lib/types";

type PageProps = { params: Promise<{ id: string }> };

type SimState = {
  turns: Turn[];
  heatmap: HeatmapState | null;
  sentiment: number[];
  eventLog: string[];
  coalitions: CoalitionSignal[];
  leverageShifts: LeverageShift[];
  leaderboard: NonNullable<SimulationState["leaderboard"]>;
  activeId: string | null;
  deadlockScore: number;
};

type SimAction =
  | { type: "TURN_APPENDED"; turn: Turn; summary: { heatmap: HeatmapState; active_speaker_id: string | null; deadlock_risk_score: number; coalitions: CoalitionSignal[]; leverage_shifts: LeverageShift[]; event_log: string[]; sentiment: number[]; leaderboard?: NonNullable<SimulationState["leaderboard"]> } }
  | { type: "SIMULATION_LOADED"; state: SimulationState }
  | { type: "RESET" }
  | { type: "STEP_BACK" }
  | { type: "STEP_TO"; index: number; allTurns: Turn[]; state: SimulationState };

const initialSimState: SimState = {
  turns: [],
  heatmap: null,
  sentiment: [],
  eventLog: [],
  coalitions: [],
  leverageShifts: [],
  leaderboard: [],
  activeId: null,
  deadlockScore: 0,
};

function simReducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case "TURN_APPENDED":
      return {
        ...state,
        turns: [...state.turns, action.turn],
        heatmap: action.summary.heatmap,
        sentiment: action.summary.sentiment,
        eventLog: action.summary.event_log,
        coalitions: action.summary.coalitions,
        leverageShifts: action.summary.leverage_shifts,
        leaderboard: action.summary.leaderboard ?? state.leaderboard,
        activeId: action.summary.active_speaker_id,
        deadlockScore: action.summary.deadlock_risk_score,
      };
    case "SIMULATION_LOADED":
      return {
        ...state,
        turns: action.state.turns,
        heatmap: action.state.heatmap,
        sentiment: action.state.sentiment,
        eventLog: action.state.event_log,
        coalitions: action.state.coalitions ?? [],
        leverageShifts: action.state.leverage_shifts ?? [],
        leaderboard: action.state.leaderboard ?? [],
        deadlockScore: action.state.deadlock_risk_score ?? 0,
      };
    case "RESET":
      return { ...initialSimState };
    case "STEP_BACK":
      return { ...state, turns: state.turns.slice(0, -1) };
    case "STEP_TO": {
      const turnsUpTo = action.allTurns.slice(0, action.index + 1);
      return {
        ...state,
        turns: turnsUpTo,
        activeId: turnsUpTo[turnsUpTo.length - 1]?.stakeholder_id ?? null,
        heatmap: action.state.heatmap,
        sentiment: action.state.sentiment,
        eventLog: action.state.event_log,
        coalitions: action.state.coalitions ?? [],
        leverageShifts: action.state.leverage_shifts ?? [],
        leaderboard: action.state.leaderboard ?? [],
      };
    }
    default:
      return state;
  }
}

export default function WarRoomPage({ params }: PageProps) {
  const { id } = use(params);

  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [sim, dispatch] = useReducer(simReducer, initialSimState);
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [layout, setLayout] = useState<WarRoomLayout>("roster");
  const [speedMul, setSpeedMul] = useState<SpeedMultiplier>(1);

  const [postmortem, setPostmortem] = useState<Postmortem | null>(null);
  const [error, setError] = useState("");
  const [loadingPostmortem, setLoadingPostmortem] = useState(false);
  const [asyncJobId, setAsyncJobId] = useState<string | null>(null);
  const [asyncJobStatus, setAsyncJobStatus] = useState<"queued" | "running" | "succeeded" | "failed" | null>(null);
  const [humanStakeholderId, setHumanStakeholderId] = useState("");
  const [humanContent, setHumanContent] = useState("");

  const streamControllerRef = useRef<AbortController | null>(null);

  const { turns, heatmap, sentiment, eventLog, coalitions, leverageShifts, leaderboard, activeId, deadlockScore } = sim;

  useEffect(() => {
    let alive = true;
    fetchSimulation(id)
      .then((data) => {
        if (!alive) return;
        setSimulation(data);
        dispatch({ type: "SIMULATION_LOADED", state: data });
        if (data.status === "complete") {
          setStatus("complete");
        }
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Unable to load simulation.");
      })
      .finally(() => { });
    return () => { alive = false; };
  }, [id]);

  const launch = () => {
    if (status === "running") return;
    setError("");
    setStatus("running");

    const ctrl = streamSimulation(
      id,
      20,
      (event) => {
        if (event.type === "turn") {
          dispatch({ type: "TURN_APPENDED", turn: event.turn, summary: event.state_summary });
        } else if (event.type === "done") {
          setSimulation(event.state);
          dispatch({ type: "SIMULATION_LOADED", state: event.state });
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
    const content = humanContent.trim().slice(0, 2000);
    if (!content || !humanStakeholderId) return;
    setError("");
    setHumanContent("");

    const stakeholderName = stakeholders.find((s) => s.id === humanStakeholderId)?.name ?? "You";
    const optimisticTurn: Turn = {
      turn_index: turns.length,
      stakeholder_id: humanStakeholderId,
      stakeholder_name: stakeholderName,
      role: stakeholders.find((s) => s.id === humanStakeholderId)?.role ?? "",
      content,
      internal_reasoning: "",
      action_type: "statement",
      is_human: true,
    };
    dispatch({ type: "TURN_APPENDED", turn: optimisticTurn, summary: {
      heatmap: heatmap ?? { commercial_gain: 0, tech_integrity: 0, legal_safety: 0, recommendation: "" },
      active_speaker_id: humanStakeholderId,
      deadlock_risk_score: deadlockScore,
      coalitions,
      leverage_shifts: leverageShifts,
      event_log: eventLog,
      sentiment,
      leaderboard,
    }});

    try {
      const updated = await injectHumanTurn(id, {
        stakeholder_id: humanStakeholderId,
        content,
        action_type: "statement",
      });
      setSimulation(updated);
      dispatch({ type: "SIMULATION_LOADED", state: updated });
    } catch (err) {
      dispatch({ type: "STEP_BACK" });
      setHumanContent(content);
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

  const loadPostmortemAsync = async () => {
    setError("");
    try {
      const res = await runSimulationAsync(id, 20);
      const jobId = res.job.id;
      setAsyncJobId(jobId);
      setAsyncJobStatus("queued");

      for (let i = 0; i < 120; i++) {
        const { job } = await fetchJob(jobId);
        setAsyncJobStatus(job.status);
        if (job.status === "succeeded") {
          setAsyncJobId(null);
          const refreshed = await fetchSimulation(id);
          setSimulation(refreshed);
          dispatch({ type: "SIMULATION_LOADED", state: refreshed });
          return;
        }
        if (job.status === "failed") {
          setAsyncJobId(null);
          throw new Error(job.error ?? "Async job failed");
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      throw new Error("Async job timed out");
    } catch (err) {
      setAsyncJobId(null);
      setAsyncJobStatus(null);
      setError(err instanceof Error ? err.message : "Async simulation failed.");
    }
  };

  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleStepBack = () => {
    if (turns.length > 0) {
      dispatch({ type: "STEP_BACK" });
      setStatus("idle" as PlaybackStatus);
    }
  };

  const handleStepForward = () => {
    if (simulation && turns.length < simulation.turns.length) {
      dispatch({ type: "STEP_TO", index: turns.length, allTurns: simulation.turns, state: simulation });
    }
  };

  const handleRestart = () => {
    dispatch({ type: "RESET" });
    setStatus("idle" as PlaybackStatus);
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
  };

  const togglePlay = () => {
    if (status === "running") {
      setStatus("idle" as PlaybackStatus);
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    } else {
      setStatus("running" as PlaybackStatus);
    }
  };

  useEffect(() => {
    if (status !== "running" || !simulation) return;
    if (turns.length >= simulation.turns.length) {
      setStatus("complete");
      return;
    }

    const baseInterval = 3800;
    const interval = baseInterval / speedMul;
    
    const currentTurnCountRef = { value: turns.length };

    playbackIntervalRef.current = setInterval(() => {
      if (currentTurnCountRef.value < simulation.turns.length) {
        dispatch({ type: "STEP_TO", index: currentTurnCountRef.value, allTurns: simulation.turns, state: simulation });
        currentTurnCountRef.value += 1;
      } else {
        setStatus("complete");
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
      }
    }, interval);

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    };
  }, [status, simulation, turns.length, speedMul]);

  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
      streamControllerRef.current?.abort();
    };
  }, []);

  const stakeholders = simulation?.config.stakeholders ?? [];

  return (
    <AppShell activeTab="War Room">
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <div style={{ padding: "24px 32px", background: "var(--color-canvas)", borderBottom: "1px solid var(--color-hairline)" }}>
          <h1 style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 48, fontWeight: 700, marginBottom: 12 }}>
            {simulation?.config.background?.slice(0, 55) ?? "Negotiation"}
          </h1>
          <p style={{ color: "var(--color-muted)", fontSize: 16, maxWidth: "50%", lineHeight: 1.6 }}>
            {simulation?.config.primary_goal ?? "Loading context..."}
          </p>
        </div>

        {error && (
          <div style={{ padding: "12px 32px" }}>
            <div
              style={{
                background: "rgba(186,26,26,0.08)",
                border: "1px solid rgba(186,26,26,0.3)",
                borderRadius: 8,
                padding: 12,
                fontSize: 12,
                color: "var(--color-error)",
              }}
            >
              {error}
            </div>
          </div>
        )}

        <ControlBar
          turn={turns.length}
          total={simulation?.turns.length ?? 20}
          status={status}
          speedMul={speedMul}
          layout={layout}
          scenarioLabel={simulation?.config.background?.split(" ")[0]}
          voltage={simulation?.config.voltage}
          onPlay={togglePlay}
          onPause={togglePlay}
          onRestart={handleRestart}
          onStepBack={handleStepBack}
          onStepForward={handleStepForward}
          onSpeedChange={setSpeedMul}
          onLayoutChange={setLayout}
        />

        {layout === "roster" && (
          <RosterLayout
            turns={turns}
            activeId={activeId}
            stakeholders={stakeholders}
            heatmap={heatmap}
            sentiment={sentiment}
            coalitions={coalitions}
            leverageShifts={leverageShifts}
            leaderboard={leaderboard ?? []}
            eventLog={eventLog}
            conflictStep={turns.length}
            totalSteps={20}
          />
        )}

        {layout === "table" && (
          <TableLayout
            turns={turns}
            activeId={activeId}
            stakeholders={stakeholders}
            heatmap={heatmap}
            coalitions={coalitions}
            leverageShifts={leverageShifts}
            leaderboard={leaderboard ?? []}
            eventLog={eventLog}
          />
        )}

        {layout === "graph" && (
          <GraphLayout
            turns={turns}
            activeId={activeId}
            stakeholders={stakeholders}
            coalitions={coalitions}
            leaderboard={leaderboard ?? []}
            eventLog={eventLog}
          />
        )}

        {stakeholders.length > 0 && (
          <div style={{ margin: "0 32px 16px", padding: 16, background: "var(--color-surface-card)", borderRadius: 12, border: "1px solid var(--color-hairline)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-muted)", marginBottom: 12 }}>
              Inject Turn
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                value={humanStakeholderId}
                onChange={(e) => setHumanStakeholderId(e.target.value)}
                style={{ borderRadius: 8, border: "1px solid var(--color-hairline)", padding: "8px 12px", fontSize: 13, background: "var(--color-canvas)", color: "var(--color-ink)", flex: "0 0 auto" }}
              >
                <option value="">Select stakeholder…</option>
                {stakeholders.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                value={humanContent}
                onChange={(e) => setHumanContent(e.target.value.slice(0, 2000))}
                placeholder="Type your statement… (2000 chars max)"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitHumanTurn(); } }}
                style={{ flex: 1, minWidth: 200, borderRadius: 8, border: "1px solid var(--color-hairline)", padding: "8px 12px", fontSize: 13, background: "var(--color-canvas)", color: "var(--color-ink)" }}
              />
              <button
                onClick={submitHumanTurn}
                disabled={!humanContent.trim() || !humanStakeholderId}
                style={{ borderRadius: 8, padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Inject
              </button>
            </div>
          </div>
        )}

        {postmortem && <PostmortemPanel postmortem={postmortem} />}

        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            background: "rgba(20, 20, 19, 0.9)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 9999,
            boxShadow: "0 20px 25px rgba(0, 0, 0, 0.2)",
          }}
        >
          <button
            onClick={launch}
            disabled={status === "running"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 9999,
              background: "var(--color-primary)",
              color: "#fff",
              border: "none",
              fontSize: 12,
              fontWeight: 600,
              cursor: status === "running" ? "not-allowed" : "pointer",
              opacity: status === "running" ? 0.5 : 1,
            }}
          >
            {turns.length === 0 ? "Start" : "Restart"} Simulation
          </button>
          <button
            onClick={loadPostmortem}
            disabled={loadingPostmortem || turns.length === 0}
            style={{
              padding: "10px 20px",
              borderRadius: 9999,
              background: "var(--color-surface-dark-elevated)",
              color: "var(--color-on-dark-soft)",
              border: "none",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              opacity: loadingPostmortem || turns.length === 0 ? 0.5 : 1,
            }}
          >
            {loadingPostmortem ? "Generating…" : "Postmortem"}
          </button>
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.15)" }} />
          <button
            onClick={loadPostmortemAsync}
            disabled={Boolean(asyncJobId) || turns.length === 0}
            style={{
              padding: "10px 20px",
              borderRadius: 9999,
              background: "var(--color-surface-dark-elevated)",
              color: asyncJobId ? "var(--color-accent-amber)" : "var(--color-on-dark-soft)",
              border: "none",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              opacity: turns.length === 0 ? 0.5 : 1,
            }}
          >
            {asyncJobId ? `⟳ ${asyncJobStatus ?? "queued"}` : "Async Run"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function PostmortemPanel({ postmortem }: { postmortem: Postmortem }) {
  return (
    <section style={{ margin: "32px 32px", borderRadius: 12, background: "var(--color-surface-dark-elevated)", border: "1px solid rgba(255,255,255,0.1)", padding: 24 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--color-primary)", marginBottom: 4 }}>
        Post-Mortem Analysis
      </p>
      <h3 style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 32, fontWeight: 700, color: "var(--color-on-dark)", marginBottom: 16 }}>
        Negotiation Debrief
      </h3>
      {postmortem.mocked && (
        <p style={{ background: "var(--color-accent-amber)/10", border: "1px solid var(--color-accent-amber)/30", borderRadius: 8, padding: 12, fontSize: 12, color: "var(--color-accent-amber)", marginBottom: 16 }}>
          Running in mock mode — configure OPENROUTER_API_KEY for AI-generated analysis.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Confidence Score" value={`${postmortem.confidence_score}%`} />
        <MetricCard label="Trend" value={`${postmortem.confidence_trend >= 0 ? "+" : ""}${postmortem.confidence_trend}`} />
        <MetricCard label="Consensus Rating" value={`${postmortem.consensus_rating}%`} />
      </div>
      {postmortem.unanticipated_note && (
        <p style={{ fontSize: 14, color: "var(--color-on-dark-soft)", lineHeight: 1.6, marginBottom: 20 }}>{postmortem.unanticipated_note}</p>
      )}
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 12, background: "var(--color-surface-dark)", padding: 16, border: "1px solid rgba(255,255,255,0.1)" }}>
      <p style={{ fontSize: 12, color: "var(--color-on-dark-soft)", marginBottom: 4 }}>{label}</p>
      <p style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 32, fontWeight: 700, color: "var(--color-on-dark)" }}>{value}</p>
    </div>
  );
}
