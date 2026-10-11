"use client";

import type { RoomPoint } from "@/lib/use-simulation-state";

type Tone = "risk" | "calm" | "clash" | "trust" | "pressure";

interface Marker {
  atTurn: number;
  label: string;
  tone: Tone;
}

interface NarrativeTimelineProps {
  /** Current room turn index (0-based). */
  turn: number;
  totalTurns: number;
  /** Snapshot history up to the current turn; markers are derived from it. */
  simState?: { roomHistory?: RoomPoint[] } | null;
  dark?: boolean;
}

const TONE_STYLES: Record<Tone, { dot: string; text: string }> = {
  risk: { dot: "bg-primary", text: "text-primary" },
  calm: { dot: "bg-accent-teal", text: "text-accent-teal" },
  clash: { dot: "bg-primary-active", text: "text-primary-active" },
  trust: { dot: "bg-accent-amber", text: "text-accent-amber" },
  pressure: { dot: "bg-secondary", text: "text-secondary" },
};

// The backend changes behaviour at these levels: agents shift tactics at deadlock risk 0.6,
// and the scheduler announces time pressure at 0.5 and 0.8.
const DEADLOCK_LEVEL = 0.6;
const PRESSURE_LEVELS: [number, string][] = [
  [0.5, "Time pressure 50%"],
  [0.8, "Time pressure critical"],
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

function deriveMarkers(history: RoomPoint[]): Marker[] {
  const pts = history.filter((p) => p.turn >= 0);
  const markers: Marker[] = [];

  const firstRisk = pts.find((p) => (p.deadlockRisk ?? 0) >= DEADLOCK_LEVEL);
  if (firstRisk) {
    markers.push({ atTurn: firstRisk.turn, label: `Deadlock risk ${pct(firstRisk.deadlockRisk ?? 0)}`, tone: "risk" });
    const eased = pts.find(
      (p) => p.turn > firstRisk.turn && p.deadlockRisk !== null && p.deadlockRisk < DEADLOCK_LEVEL
    );
    if (eased) markers.push({ atTurn: eased.turn, label: "Deadlock risk eased", tone: "calm" });
  }

  const tension = pts.filter((p) => p.tension !== null);
  if (tension.length >= 2) {
    const peak = tension.reduce((a, b) => ((b.tension ?? 0) > (a.tension ?? 0) ? b : a));
    if (peak.turn !== tension[0].turn) {
      markers.push({ atTurn: peak.turn, label: `Tension peak ${pct(peak.tension ?? 0)}`, tone: "clash" });
    }
  }

  const trust = pts.filter((p) => p.trust !== null);
  if (trust.length >= 2) {
    const low = trust.reduce((a, b) => ((b.trust ?? 1) < (a.trust ?? 1) ? b : a));
    if (low.turn !== trust[0].turn) {
      markers.push({ atTurn: low.turn, label: `Trust low ${pct(low.trust ?? 0)}`, tone: "trust" });
    }
  }

  for (const [level, label] of PRESSURE_LEVELS) {
    const hit = pts.find((p) => (p.timePressure ?? 0) >= level);
    if (hit) markers.push({ atTurn: hit.turn, label, tone: "pressure" });
  }

  return markers.sort((a, b) => a.atTurn - b.atTurn);
}

export function NarrativeTimeline({
  turn,
  totalTurns,
  simState,
  dark = false,
}: NarrativeTimelineProps) {
  const total = Math.max(totalTurns, 1);
  const pct100 = Math.min(100, ((turn + 1) / total) * 100);
  const markers = deriveMarkers(simState?.roomHistory ?? []);
  const position = (t: number) => Math.min(100, ((t + 1) / total) * 100);

  return (
    <div
      className={`rounded-xl px-[18px] py-[14px] ${
        dark
          ? "bg-surface-dark text-canvas"
          : "bg-surface-card text-ink"
      }`}
    >
      <div className="mb-[10px] flex items-baseline justify-between">
        <span
          className={`font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
            dark ? "text-canvas/50" : "text-muted"
          }`}
        >
          Timeline · turn {turn + 1} / {totalTurns}
        </span>
        <span
          className={`font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
            dark ? "text-canvas/50" : "text-muted"
          }`}
        >
          {Math.round(pct100)}%
        </span>
      </div>

      <div
        className={`relative h-3 rounded-full ${
          dark ? "bg-[#262320]" : "bg-ink/10"
        }`}
      >
        <div
          className="absolute inset-0 rounded-full transition-all duration-[600ms]"
          style={{ width: `${pct100}%`, background: dark ? "var(--color-primary)" : "var(--color-ink)" }}
        />

        {markers.map((m) => (
          <div
            key={`${m.tone}-${m.label}`}
            title={`T${m.atTurn + 1} · ${m.label}`}
            className={`absolute top-1/2 h-[7px] w-[7px] rounded-full ring-2 ${
              dark ? "ring-surface-dark" : "ring-surface-card"
            } ${TONE_STYLES[m.tone].dot}`}
            style={{ left: `${position(m.atTurn)}%`, transform: "translate(-50%, -50%)" }}
          />
        ))}
      </div>

      {markers.length > 0 && (
        <div className="mt-[8px] flex flex-wrap gap-x-3 gap-y-1">
          {markers.map((m) => (
            <span
              key={`${m.tone}-${m.label}`}
              className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.08em]"
            >
              <span className={`inline-block h-[6px] w-[6px] rounded-full ${TONE_STYLES[m.tone].dot}`} />
              <span className={dark ? "text-canvas/50" : "text-muted"}>T{m.atTurn + 1}</span>
              <span className={TONE_STYLES[m.tone].text}>{m.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
