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
import {
  fetchSimulation, fetchSimulationTurns, fetchSimulationRecording, streamSimulation, fetchPostmortem,
  injectTurn, exportSimulation, stopSimulation, type SimulationOutcome,
} from "@/lib/api";
import { useSimulationState } from "@/lib/use-simulation-state";
import type { Postmortem, SimulationConfig } from "@/lib/types";
import type { Turn } from "@/components/war-room/TranscriptStream";
import { Avatar, initialsFromName } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { TwistMenu } from "@/components/TwistMenu";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ seat?: string | string[] }> };

type RawEvent = Record<string, unknown>;

const optStr = (v: unknown): string | undefined =>
  v === undefined || v === null || v === "" ? undefined : String(v);

// Turn number for a row appended after `prev`: agent turns carry their own.
const lastTurnNumber = (prev: Turn[]) => (prev.length ? prev[prev.length - 1].turn_number : 0);

// Floor grants, bid rounds and "Turn N." announcements are procedure, not story.
const isProcedural = (evt: RawEvent) =>
  evt.bid_round !== undefined || evt.granted_to !== undefined || /^Turn \d+\.?$/.test(String(evt.content ?? ""));

/** A transcript row for a stream/recording/DB event, or null when it is not part of the transcript. */
function toRow(evt: RawEvent, prev: Turn[]): Turn | null {
  const _index = typeof evt._index === "number" ? evt._index : undefined;
  if (evt.type === "turn") {
    return {
      turn_index: prev.length,
      // Stored turns keep the room clock in turn_number (their turn_index is the event position).
      turn_number: Number(evt.turn_number ?? evt.turn_index ?? 0),
      speaker: String(evt.speaker ?? evt.agent_name ?? ""),
      content: String(evt.content ?? ""),
      kind: "agent",
      speaker_role: optStr(evt.speaker_role) ?? optStr(evt.role) ?? optStr(evt.agent_role),
      stance: optStr(evt.stance),
      reasoning: optStr(evt.reasoning) ?? optStr(evt.internal_reasoning),
      action_type: optStr(evt.action_type),
      agent_id: optStr(evt.agent_id),
      directed_at: optStr(evt.directed_at) ?? null,
      directed_at_name: optStr(evt.directed_at_name) ?? null,
      vote: optStr(evt.vote) ?? null,
      is_human: Boolean(evt.is_human),
      _index,
    };
  }
  if (evt.type === "system" && !isProcedural(evt)) {
    return {
      turn_index: prev.length,
      turn_number: lastTurnNumber(prev),
      speaker: "⚙ System",
      content: String(evt.content ?? ""),
      kind: "system",
      subtype: optStr(evt.subtype),
      target_agent: optStr(evt.target_agent) ?? optStr(evt.departed) ?? optStr(evt.timed_out),
      _index,
    };
  }
  return null;
}

function outcomeOf(evt: RawEvent): SimulationOutcome | null {
  // A bare done (e.g. the stored-turns fallback stream) says nothing about how the run ended.
  if (!evt.reason && !evt.outcome_type) return null;
  return {
    reason: optStr(evt.reason),
    outcome_type: optStr(evt.outcome_type),
    summary: optStr(evt.summary),
    confidence: typeof evt.confidence === "number" ? evt.confidence : undefined,
    vote_breakdown: (evt.vote_breakdown as Record<string, number> | undefined) ?? undefined,
    agreed_issues: Array.isArray(evt.agreed_issues) ? (evt.agreed_issues as SimulationOutcome["agreed_issues"]) : undefined,
    walkaway_party: optStr(evt.walkaway_party) ?? null,
    judge_notes: optStr(evt.judge_notes),
    total_turns: typeof evt.total_turns === "number" ? evt.total_turns : undefined,
  };
}

// One snapshot per turn: a later snapshot for the same turn replaces the earlier one.
function upsertSnapshot(list: RawEvent[], evt: RawEvent): RawEvent[] {
  const idx = list.findIndex((s) => s.turn_index === evt.turn_index);
  if (idx < 0) return [...list, evt];
  const next = [...list];
  next[idx] = evt;
  return next;
}

type Tone = "positive" | "negative" | "walkaway" | "neutral";

function verdictOf(o: SimulationOutcome): { label: string; tone: Tone; icon: string } {
  switch (o.outcome_type) {
    case "agreement":
      if (o.reason === "vote_majority") return { label: "Motion carried", tone: "positive", icon: "gavel" };
      if (o.reason === "explicit_agreement") return { label: "Deal reached", tone: "positive", icon: "handshake" };
      if (o.reason === "consensus") return { label: "Consensus reached", tone: "positive", icon: "handshake" };
      return { label: "Agreement", tone: "positive", icon: "handshake" };
    case "rejected":
      return { label: "Motion rejected", tone: "negative", icon: "gavel" };
    case "walkaway":
      return { label: "Walkaway", tone: "walkaway", icon: "logout" };
    case "impasse":
      return { label: "Impasse", tone: "negative", icon: "block" };
    case "judge_ruling":
      return { label: "Judge ruling", tone: "positive", icon: "balance" };
    default:
      if (o.reason === "vote_incomplete") return { label: "Vote incomplete", tone: "neutral", icon: "how_to_vote" };
      if (o.reason === "stopped") return { label: "Stopped", tone: "neutral", icon: "stop_circle" };
      return { label: "No decision", tone: "neutral", icon: "remove" };
  }
}

const TONE_STYLES: Record<Tone, { bg: string; border: string; text: string }> = {
  positive: { bg: "rgba(110,116,72,0.10)", border: "rgba(110,116,72,0.20)", text: "var(--color-secondary)" },
  negative: { bg: "rgba(186,26,26,0.08)", border: "rgba(186,26,26,0.15)", text: "var(--color-error)" },
  walkaway: { bg: "rgba(233,185,74,0.10)", border: "rgba(233,185,74,0.20)", text: "var(--color-accent-amber)" },
  neutral: { bg: "var(--color-surface-container-low)", border: "var(--color-hairline)", text: "var(--color-muted)" },
};

// Only vote shares and judge confidence are real measures; other checkers report a fixed or derived number.
function outcomeMeasure(o: SimulationOutcome): { label: string; value: number } | null {
  if (o.confidence === undefined) return null;
  if (o.reason === "vote_majority") {
    // Carried reports the yes share; rejected reports its complement.
    return { label: "Support", value: o.outcome_type === "rejected" ? 1 - o.confidence : o.confidence };
  }
  if (o.reason === "judge_verdict" && o.confidence > 0) return { label: "Confidence", value: o.confidence };
  return null;
}

const VOTE_KEYS: Array<[string, string]> = [["for", "For"], ["against", "Against"], ["abstain", "Abstain"]];

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n)}…` : text);

export default function WarRoomPage({ params, searchParams }: PageProps) {
  const { id } = use(params);
  // "That's me" in the Room links here with ?seat=<stakeholderId>, so the inject box speaks as that seat.
  const { seat } = use(searchParams);

  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState("");
  const [layout, setLayout] = useState<WarRoomLayout>("roster");
  const [speedMul, setSpeedMul] = useState<SpeedMultiplier>(1);
  const [playTurn, setPlayTurn] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [postmortem, setPostmortem] = useState<Postmortem | null>(null);
  const [loadingPostmortem, setLoadingPostmortem] = useState(false);
  const [stateSnapshots, setStateSnapshots] = useState<RawEvent[]>([]);
  const [isReplay, setIsReplay] = useState(false);
  // Where a replay's turns and snapshots come from: the saved recording (full fidelity) or the DB.
  const [replaySource, setReplaySource] = useState<"recording" | "db" | null>(null);
  const [failed, setFailed] = useState(false);
  const failedRef = useRef(false);
  const [outcome, setOutcome] = useState<SimulationOutcome | null>(null);

  const [humanContent, setHumanContent] = useState("");
  const [selectedStakeholder, setSelectedStakeholder] = useState(typeof seat === "string" ? seat : "");
  const [sendingHumanTurn, setSendingHumanTurn] = useState(false);
  const [humanError, setHumanError] = useState("");

  const streamCtrl = useRef<AbortController | null>(null);
  const streamStartedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const persistKey = `wr-session-${id}`;
  // Mirrors `playing` for the stream callback, which would otherwise see a stale value.
  const followRef = useRef(true);

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



  useEffect(() => { followRef.current = playing; }, [playing]);

  const simState = useSimulationState({
    mode: isReplay ? "replay" : "live",
    // A replay from the recording brings its own snapshots; the DB fallback fetches /replay.
    events: isReplay && replaySource !== "recording" ? undefined : stateSnapshots,
    simulationId: isReplay && replaySource === "db" ? id : undefined,
    turnIndex: turns.length ? turns[Math.min(playTurn, turns.length - 1)]?.turn_number : undefined,
  });

  useEffect(() => {
    document.title = "War Room — Vantage Boardroom";
  }, []);

  // Only view preferences persist: the stream replays the whole run on reconnect,
  // so restoring old turns would duplicate them.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(persistKey);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.speedMul) setSpeedMul(state.speedMul);
        if (state.layout) setLayout(state.layout);
      }
    } catch {}
  }, [persistKey]);

  useEffect(() => {
    try { sessionStorage.setItem(persistKey, JSON.stringify({ speedMul, layout })); } catch {}
  }, [speedMul, layout, persistKey]);

  // Replays prefer the saved recording (system events, snapshots, verdict); runs without one
  // fall back to the stored turns, /replay snapshots and the outcome kept with the simulation.
  const loadReplay = async (storedOutcome: SimulationOutcome | null, isCancelled: () => boolean) => {
    try {
      const rec = await fetchSimulationRecording(id);
      const rows: Turn[] = [];
      let snaps: RawEvent[] = [];
      let recorded: SimulationOutcome | null = null;
      for (const evt of rec.events ?? []) {
        if (evt.type === "state_snapshot") snaps = upsertSnapshot(snaps, evt);
        else if (evt.type === "done") recorded = outcomeOf(evt);
        else {
          const row = toRow(evt, rows);
          if (row) rows.push(row);
        }
      }
      if (rows.some((r) => r.kind === "agent")) {
        if (isCancelled()) return;
        setTurns(rows);
        setStateSnapshots(snaps);
        setOutcome(recorded ?? storedOutcome);
        setReplaySource("recording");
        setStatus("complete");
        return;
      }
    } catch {
      // No recording for this run.
    }
    try {
      const stored = await fetchSimulationTurns(id);
      if (isCancelled()) return;
      const rows: Turn[] = [];
      for (const t of stored) {
        const row = toRow({ ...t, type: "turn" }, rows);
        if (row) rows.push(row);
      }
      setTurns(rows);
      setOutcome(storedOutcome);
      setReplaySource("db");
      setStatus("complete");
    } catch (err) {
      if (!isCancelled()) setError(err instanceof Error ? err.message : "Could not load the transcript");
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchSimulation(id)
      .then((data) => {
        setConfig(data.config ?? null);
        if (data.status === "complete") {
          setIsReplay(true);
          setPlaying(false);
          loadReplay(data.outcome ?? null, () => cancelled);
        } else if (data.status === "running" || data.status === "idle") {
          // Starts the run if it has not started; otherwise attaches to it and catches up.
          startStream();
        } else {
          setError(`This simulation ended with an error (${data.status}).`);
          setFailed(true);
        }
      })
      .catch(() => {
        setIsReplay(false);
      });
    return () => {
      cancelled = true;
      // Disconnecting only detaches this viewer; the run carries on server-side.
      streamCtrl.current?.abort();
      streamStartedRef.current = false;
    };
  }, [id]);

  useEffect(() => {
    if (!playing) { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } return; }
    const maxTurn = turns.length - 1;
    if (maxTurn <= 0) return;
    if (playTurn >= maxTurn && status === "complete") { setPlaying(false); return; }
    if (playTurn >= maxTurn) return;
    const interval = baseInterval / speedMul;
    timerRef.current = setTimeout(() => setPlayTurn((t) => Math.min(maxTurn, t + 1)), interval);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, playTurn, turns.length, speedMul, status]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [playTurn]);

  const startStream = () => {
    if (status === "running" || isReplay || streamStartedRef.current) return;
    streamStartedRef.current = true;
    failedRef.current = false;
    setError("");
    setStatus("running");
    setPlaying(true);
    streamCtrl.current = streamSimulation(
      id,
      (event) => {
        const evt = event as Record<string, unknown>;
        if (evt.type === "turn" || evt.type === "system") {
          setTurns((prev) => {
            const row = toRow(evt, prev);
            if (!row) return prev;
            const updated = [...prev, row];
            // Follow the live edge only while playing; paused, the view stays put.
            if (followRef.current) setPlayTurn(updated.length - 1);
            return updated;
          });
        } else if (evt.type === "done") {
          setStatus("complete");
          const o = outcomeOf(evt);
          if (o) setOutcome(o);
        } else if (evt.type === "state_snapshot") {
          setStateSnapshots((prev) => upsertSnapshot(prev, evt));
        } else if (evt.type === "error") {
          failedRef.current = true;
          setFailed(true);
          setError(String(evt.message ?? "Unknown error"));
          setStatus("idle");
        }
      },
      (err) => { failedRef.current = true; setFailed(true); setError(err.message); setStatus("idle"); },
      // A stream that ends after an error is not a completed meeting.
      () => setStatus((s) => (failedRef.current ? s : "complete")),
    );
  };

  const handleStop = async () => {
    try {
      await stopSimulation(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop the simulation");
    }
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
    const content = humanContent.trim();
    try {
      // The stream echoes the injected turn back, so it is not added here.
      await injectTurn(id, selectedStakeholder, content);
      setHumanContent("");
    } catch (err) {
      setHumanError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSendingHumanTurn(false);
    }
  };

  useEffect(() => {
    if (isReplay || failed || !outcome || turns.length === 0) return;
    const simDone = status === "complete" && playTurn >= turns.length - 1;
    if (simDone && !postmortem && !loadingPostmortem) {
      loadPostmortem();
    }
  }, [status, playTurn, turns.length, postmortem, loadingPostmortem, isReplay, failed, outcome]);

  const nameMap: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of config?.stakeholders ?? []) {
      map[s.id] = s.name;
    }
    return map;
  }, [config]);

  // Rows up to the playhead. Older stored turns lack target names, and human interjections
  // carry no stance; both come from the config.
  const shownTurns = useMemo(() => {
    const stanceOf = new Map((config?.stakeholders ?? []).map((s) => [s.id, s.stance as string | undefined]));
    return turns.slice(0, playTurn + 1).map((t) => {
      if (t.kind !== "agent") return t;
      const needsName = !!t.directed_at && !t.directed_at_name;
      const needsStance = !t.stance && !!t.agent_id && !!stanceOf.get(t.agent_id);
      if (!needsName && !needsStance) return t;
      return {
        ...t,
        directed_at_name: needsName ? nameMap[t.directed_at as string] ?? null : t.directed_at_name,
        stance: needsStance ? stanceOf.get(t.agent_id as string) : t.stance,
      };
    });
  }, [turns, playTurn, nameMap, config]);
  // The latest speech at the playhead; room events between turns do not take the floor.
  const current = useMemo(
    () => [...shownTurns].reverse().find((t) => t.kind === "agent") ?? shownTurns[shownTurns.length - 1],
    [shownTurns],
  );
  // Panels and timelines use the room's turn clock, not the row position.
  const stateTurn = turns[playTurn]?.turn_number ?? 0;
  const ec = config?.end_condition as Record<string, unknown> | undefined;
  const totalTurns = Math.max(1, simState.maxTurns ?? Number(ec?.max_normal_turns ?? ec?.max_turns ?? turns.length));
  const atEnd = turns.length > 0 && playTurn >= turns.length - 1;
  const done = status === "complete" && atEnd;
  const live = !isReplay && status === "running";
  const speakerId = current?.kind === "agent" ? current.speaker : null;
  const subjectName = config?.subject?.name ?? "Debate";
  const replayLoading = isReplay && !error && (replaySource === null || simState.loading);
  // The verdict lands when playback reaches the end, live or replay.
  const showVerdict = !!outcome && (atEnd || turns.length === 0);

  const stakeholders = (config?.stakeholders ?? []).map((s) => ({
    id: s.id, name: s.name, role: s.role, stance: s.stance,
    lastContent: [...shownTurns].reverse().find((t) => t.kind === "agent" && (t.agent_id ? t.agent_id === s.id : t.speaker === s.name))?.content ?? null,
  }));

  const eventLog = useMemo(() => {
    const entries = shownTurns.map((t) => {
      if (t.kind === "system") {
        const text = t.subtype === "external_event" ? t.content.replace(/^⚡\s*/, "") : t.content;
        return { t: t.turn_number + 1, text: clip(text, 160), type: t.subtype ?? "system", full: t.content };
      }
      const target = t.directed_at_name ? ` → ${t.directed_at_name}` : "";
      const vote = t.action_type === "vote" && t.vote ? ` votes ${t.vote.toUpperCase()}` : "";
      return {
        t: t.turn_number + 1,
        text: `${t.speaker}${target}${vote}: ${clip(t.content, 120)}`,
        type: t.is_human ? "human" : t.action_type ?? "statement",
        full: t.content,
      };
    });
    if (showVerdict && outcome) {
      const v = verdictOf(outcome);
      entries.push({
        t: (shownTurns.length ? shownTurns[shownTurns.length - 1].turn_number : 0) + 1,
        text: outcome.summary ? `${v.label} — ${clip(outcome.summary, 140)}` : v.label,
        type: "outcome",
        full: outcome.summary ?? v.label,
      });
    }
    return entries;
  }, [shownTurns, showVerdict, outcome]);

  return (
    <AppShell>
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
          turn={stateTurn}
          total={totalTurns}
          status={isReplay || status === "complete" ? "complete" : live ? "running" : "idle"}
          playing={playing}
          onStop={live ? handleStop : undefined}
          speedMul={speedMul}
          layout={layout}
          scenarioLabel={subjectName.split(" ")[0]}
          voltage={config?.voltage}
          onPlay={() => {
            if (!isReplay && turns.length === 0) startStream();
            // Resuming a live run jumps back to the newest turn.
            if (live) setPlayTurn(Math.max(0, turns.length - 1));
            else if (playTurn >= turns.length - 1) setPlayTurn(0);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onRestart={() => { setPlayTurn(0); setPlaying(true); }}
          onStepBack={() => { setPlaying(false); setPlayTurn((t) => Math.max(0, t - 1)); }}
          onStepForward={() => setPlayTurn((t) => Math.min(turns.length - 1, t + 1))}
          onSpeedChange={setSpeedMul}
          onLayoutChange={setLayout}
        />

        <div style={{ flex: 1, overflowY: "auto", background: "var(--color-canvas)" }}>
          {replayLoading && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 64, flexDirection: "column", gap: 16 }}>
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
              <span style={{ fontSize: 13, color: "var(--color-muted)" }}>Loading replay…</span>
            </div>
          )}

          {!replayLoading && (
          <div ref={layoutRef}>
            {displayedLayout === "roster" && (
              <RosterLayout
                turn={stateTurn}
                current={current}
                playing={playing && live}
                stakeholders={stakeholders}
                speakerId={speakerId}
                eventLog={eventLog}
                turns={shownTurns}
                scrollRef={scrollRef}
                totalTurns={totalTurns}
                simState={simState}
                nameMap={nameMap}
              />
            )}
            {displayedLayout === "table" && (
              <TableLayout
                turn={stateTurn}
                current={current}
                playing={playing && live}
                stakeholders={stakeholders}
                speakerId={speakerId}
                eventLog={eventLog}
                turns={shownTurns}
                totalTurns={totalTurns}
                simState={simState}
                nameMap={nameMap}
              />
            )}
            {displayedLayout === "graph" && (
              <GraphLayout
                turn={stateTurn}
                current={current}
                playing={playing && live}
                stakeholders={stakeholders}
                speakerId={speakerId}
                turns={shownTurns}
                totalTurns={totalTurns}
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
          {showVerdict && outcome && (() => {
            const v = verdictOf(outcome);
            const tone = TONE_STYLES[v.tone];
            const measure = outcomeMeasure(outcome);
            const deal = outcome.reason === "explicit_agreement" ? outcome.agreed_issues?.[0] : undefined;
            const proposer = deal?.proposed_by ? nameMap[deal.proposed_by] ?? deal.proposed_by : null;
            const walker = outcome.walkaway_party ? nameMap[outcome.walkaway_party] ?? outcome.walkaway_party : null;
            const breakdown = outcome.vote_breakdown ?? {};
            const hasVotes = VOTE_KEYS.some(([k]) => breakdown[k] !== undefined);
            return (
            <div style={{
              padding: "18px 24px", margin: "0 16px 16px", borderRadius: 12,
              background: tone.bg, border: `1px solid ${tone.border}`,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9999, display: "flex", alignItems: "center", justifyContent: "center",
                  background: tone.text, color: "#fff",
                  flexShrink: 0, marginTop: 2,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>{v.icon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: tone.text,
                    }}>
                      {v.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)", margin: 0, lineHeight: 1.4 }}>
                    {deal && proposer
                      ? `Every party accepted ${proposer}'s proposal.`
                      : outcome.summary || `The meeting ended (${(outcome.reason ?? "unknown").replace(/_/g, " ")}).`}
                  </p>

                  {deal?.proposal && (
                    <blockquote style={{ margin: "10px 0 0", paddingLeft: 12, borderLeft: `2px solid ${tone.text}`, fontSize: 13, lineHeight: 1.55, color: "var(--color-ink)", maxWidth: 620 }}>
                      &ldquo;{clip(deal.proposal, 600)}&rdquo;
                      {proposer && (
                        <span style={{ display: "block", marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-muted)" }}>
                          Proposed by {proposer}
                        </span>
                      )}
                    </blockquote>
                  )}

                  {hasVotes && (
                    <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
                      {VOTE_KEYS.map(([key, label]) => (
                        <div key={key} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", color: "var(--color-ink)" }}>{breakdown[key] ?? 0}</div>
                          <div style={{ fontSize: 9, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600, marginTop: 1 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {outcome.judge_notes && (
                    <p style={{ fontSize: 12, color: "var(--color-muted)", fontStyle: "italic", lineHeight: 1.5, marginTop: 8, maxWidth: 520 }}>
                      &ldquo;{outcome.judge_notes}&rdquo;
                    </p>
                  )}
                  {walker && (
                    <p style={{ fontSize: 11, color: "var(--color-accent-amber)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                      {walker} walked out
                    </p>
                  )}
                </div>

                {measure && (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)" }}>{measure.label}</span>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", color: "var(--color-ink)" }}>
                      {Math.round(measure.value * 100)}<span style={{ fontSize: 14, color: "var(--color-muted)" }}>%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            );
          })()}

          {/* ── Try again with… — a new run from this setup plus one twist ── */}
          {(showVerdict || done) && config && (
            <div className="mx-4 mb-4 rounded-xl border border-hairline bg-surface-card px-4 py-3 sm:px-5">
              <TwistMenu simulationId={id} config={config} seat={typeof seat === "string" ? seat : null} />
            </div>
          )}

          {postmortem && (() => {
            const reports = [...(postmortem.stakeholder_reports ?? [])].sort((a, b) => (b.total_turns ?? 0) - (a.total_turns ?? 0));
            const totalTurnsPm = postmortem.termination?.total_turns ?? outcome?.total_turns ?? turns.filter((t) => t.kind === "agent").length;
            const participants = reports.length || config?.stakeholders?.length || 0;
            const tile = (label: string, value: string | number) => (
              <div style={{ borderRadius: 12, background: "var(--color-surface-dark-elevated)", padding: 16 }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-on-dark-soft)", marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</p>
                <p style={{ fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{value}</p>
              </div>
            );
            return (
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
                {config?.subject?.name && (
                  <h3 style={{ fontFamily: "var(--font-display), 'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 16 }}>{config.subject.name}</h3>
                )}

                {!!postmortem.verdict && (
                  <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "var(--color-surface-dark-elevated)" }}>
                    <p style={{ fontSize: 13, color: "var(--color-on-dark-soft)", margin: 0 }}>
                      <strong style={{ color: "var(--color-on-dark)" }}>Verdict:</strong> {postmortem.verdict}
                    </p>
                    {!!postmortem.end_reason && (
                      <p style={{ fontSize: 12, color: "var(--color-on-dark-soft)", margin: "4px 0 0" }}>
                        Ended via: {postmortem.end_reason.replace(/_/g, " ")}
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
                  {tile("Total turns", totalTurnsPm)}
                  {participants > 0 && tile("Participants", participants)}
                  {config?.voltage !== undefined && tile("Voltage", config.voltage)}
                </div>

                {!!postmortem.summary && (
                  <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "var(--color-surface-dark-soft)" }}>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-primary)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>Summary</p>
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-on-dark-soft)", margin: 0 }}>{postmortem.summary}</p>
                  </div>
                )}

                {reports.map((r, i) => (
                  <div key={r.agent_id ?? r.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: i === 0 ? "var(--color-surface-dark-elevated)" : "transparent", borderRadius: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      {r.stance && <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-on-dark-soft)" }}>{r.stance}</span>}
                      {!!r.position_shifts && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--color-on-dark-soft)" }}>{r.position_shifts} shift{r.position_shifts === 1 ? "" : "s"}</span>}
                    </div>
                    {r.dominant_action && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-on-dark-soft)" }}>mostly {r.dominant_action.replace(/_/g, " ")}</span>
                    )}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-on-dark-soft)" }}>{r.total_turns ?? 0} turns</span>
                  </div>
                ))}
              </div>
            </div>
            </>
            );
          })()}
        </div>

        {/* ── Human Turn Input (only while the room is live) ── */}
        {live && (
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
        )}
      </div>
    </AppShell>
  );
}
