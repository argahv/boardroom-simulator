"use client";

interface Phase {
  atTurn: number;
  label: string;
  type: "intro" | "clash" | "escalation" | "resolution" | "conclusion";
}

interface NarrativeTimelineProps {
  turn: number;
  totalTurns: number;
  phases?: Phase[];
  dark?: boolean;
}

const PHASE_STYLES: Record<
  Phase["type"],
  { dot: string; text: string; hex: string }
> = {
  intro: {
    dot: "bg-accent-teal",
    text: "text-accent-teal",
    hex: "var(--color-accent-teal)",
  },
  clash: {
    dot: "bg-primary",
    text: "text-primary",
    hex: "var(--color-primary)",
  },
  escalation: {
    dot: "bg-primary-active",
    text: "text-primary-active",
    hex: "var(--color-primary-active)",
  },
  resolution: {
    dot: "bg-accent-amber",
    text: "text-accent-amber",
    hex: "var(--color-accent-amber)",
  },
  conclusion: {
    dot: "bg-green-500",
    text: "text-green-500",
    hex: "#22c55e",
  },
};

function defaultPhases(totalTurns: number): Phase[] {
  const t = Math.max(totalTurns, 1);
  return [
    { atTurn: Math.floor(t * 0.1), label: "Intro", type: "intro" },
    { atTurn: Math.floor(t * 0.3), label: "First Clash", type: "clash" },
    { atTurn: Math.floor(t * 0.55), label: "Escalation", type: "escalation" },
    { atTurn: Math.floor(t * 0.8), label: "Resolution", type: "resolution" },
    { atTurn: Math.floor(t * 0.95), label: "Conclusion", type: "conclusion" },
  ];
}

export function NarrativeTimeline({
  turn,
  totalTurns,
  phases,
  dark = false,
}: NarrativeTimelineProps) {
  const pct = Math.min(
    100,
    ((turn + 1) / Math.max(totalTurns, 1)) * 100
  );
  const resolved = phases ?? defaultPhases(totalTurns);

  let activeIdx = -1;
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (turn >= resolved[i].atTurn) {
      activeIdx = i;
      break;
    }
  }
  const activePhase = activeIdx >= 0 ? resolved[activeIdx] : null;
  const barColor = activePhase
    ? PHASE_STYLES[activePhase.type].hex
    : dark
      ? "var(--color-primary)"
      : "var(--color-ink)";

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
          {Math.round(pct)}%
        </span>
      </div>

      <div
        className={`relative h-3 rounded-full ${
          dark ? "bg-[#262320]" : "bg-ink/10"
        }`}
      >
        <div
          className="absolute inset-0 rounded-full transition-all duration-[600ms]"
          style={{ width: `${pct}%`, background: barColor }}
        />

        {resolved.map((phase) => {
          const pos =
            (phase.atTurn / Math.max(totalTurns, 1)) * 100;
          const isActive = turn >= phase.atTurn;
          const s = PHASE_STYLES[phase.type];
          return (
            <div
              key={phase.type}
              className={`absolute top-1/2 h-[7px] w-[7px] rounded-full transition-all duration-300 ${
                isActive
                  ? s.dot
                  : dark
                    ? "bg-canvas/15"
                    : "bg-ink/20"
              }`}
              style={{
                left: `${pos}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          );
        })}
      </div>

      <div className="relative mt-[6px] h-[16px]">
        {resolved.map((phase) => {
          const pos =
            (phase.atTurn / Math.max(totalTurns, 1)) * 100;
          const isActive = turn >= phase.atTurn;
          const s = PHASE_STYLES[phase.type];
          return (
            <div
              key={phase.type}
              className="absolute top-0 whitespace-nowrap"
              style={{
                left: `${pos}%`,
                transform: "translateX(-50%)",
              }}
            >
              <span
                className={`text-[9px] font-bold uppercase tracking-[0.08em] transition-colors duration-300 ${
                  isActive
                    ? s.text
                    : dark
                      ? "text-canvas/25"
                      : "text-muted/40"
                }`}
              >
                {phase.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
