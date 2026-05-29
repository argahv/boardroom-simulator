"use client";

import { useState, useRef, useEffect } from "react";
import gsap from "gsap";

export type WarRoomLayout = "roster" | "table" | "graph";
export type PlaybackStatus = "idle" | "running" | "complete";
export type SpeedMultiplier = 0.5 | 1 | 2;

interface ControlBarProps {
  turn: number;
  total: number;
  status: PlaybackStatus;
  speedMul: SpeedMultiplier;
  layout: WarRoomLayout;
  scenarioLabel?: string;
  voltage?: number;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSpeedChange: (s: SpeedMultiplier) => void;
  onLayoutChange: (l: WarRoomLayout) => void;
}

function RosterGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1.5" y="2" width="3.5" height="10" rx="0.7" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="6" y="2" width="6.5" height="10" rx="0.7" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}

function TableGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <ellipse cx="7" cy="7" rx="5.5" ry="3.5" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="3" r="0.9" fill="currentColor"/>
      <circle cx="7" cy="11" r="0.9" fill="currentColor"/>
      <circle cx="2" cy="7" r="0.9" fill="currentColor"/>
      <circle cx="12" cy="7" r="0.9" fill="currentColor"/>
    </svg>
  );
}

function GraphGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="11" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="4" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="4" y1="4" x2="6.5" y2="10" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="10" y1="5" x2="7.5" y2="10" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}

function PlaybackBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30,
        height: 30,
        borderRadius: 9999,
        background: "transparent",
        color: "var(--color-ink)",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

const LAYOUT_OPTS: { id: WarRoomLayout; label: string; glyph: React.ReactNode }[] = [
  { id: "roster", label: "Roster", glyph: <RosterGlyph /> },
  { id: "table",  label: "Table",  glyph: <TableGlyph /> },
  { id: "graph",  label: "Graph",  glyph: <GraphGlyph /> },
];

const SPEEDS: SpeedMultiplier[] = [0.5, 1, 2];

export function ControlBar({
  turn,
  total,
  status,
  speedMul,
  layout,
  scenarioLabel,
  voltage,
  onPlay,
  onPause,
  onRestart,
  onStepBack,
  onStepForward,
  onSpeedChange,
  onLayoutChange,
}: ControlBarProps) {
  const playing = status === "running";
  const done = status === "complete";
  const liveDotRef = useRef<HTMLDivElement>(null);
  const turnRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const [hoveredLayout, setHoveredLayout] = useState<WarRoomLayout | null>(null);

  // Turn counter count-up
  useEffect(() => {
    if (!turnRef.current) return;
    const obj = { val: parseInt(turnRef.current.textContent?.replace(/\D/g, "") || "0") };
    gsap.to(obj, {
      val: turn,
      duration: 0.3,
      ease: "power2.out",
      onUpdate: () => {
        if (turnRef.current) {
          turnRef.current.textContent = `T${String(Math.round(obj.val)).padStart(2, "0")}`;
        }
      },
    });
  }, [turn]);

  return (
    <div
      ref={barRef}
      style={{
        borderBottom: "1px solid var(--color-hairline)",
        background: "var(--color-surface-card)",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        gap: 18,
        flexWrap: "wrap",
        position: "sticky",
        top: 64,
        zIndex: 40,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            ref={liveDotRef}
            className={playing ? "anim-glow" : ""}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background:
                playing ? "var(--color-primary)" : done ? "var(--color-muted)" : "var(--color-hairline)",
              transition: "background 240ms ease",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: playing
                ? "var(--color-primary)"
                : done
                ? "var(--color-muted)"
                : "var(--color-muted)",
            }}
          >
            {done ? "Concluded" : playing ? "Live" : "Paused"}
          </span>
        </div>

        <div style={{ width: 1, height: 22, background: "var(--color-hairline)" }} />

        <div style={{ fontSize: 12, color: "var(--color-muted)", whiteSpace: "nowrap" }}>
          {scenarioLabel && (
            <span style={{ color: "var(--color-ink)", fontWeight: 500 }}>{scenarioLabel}</span>
          )}
          {voltage !== undefined && (
            <>
              <span style={{ margin: "0 6px" }}>·</span>
              <span>voltage {voltage}</span>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          border: "1px solid var(--color-hairline)",
          borderRadius: 9999,
          background: "var(--color-surface-card)",
          margin: "0 auto",
        }}
      >
        <PlaybackBtn onClick={onRestart} title="Restart">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 8a4 4 0 1 0 1.2-2.85M4 3v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </PlaybackBtn>

        <PlaybackBtn onClick={onStepBack} title="Previous turn">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6l4 4M3 2v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </PlaybackBtn>

        <button
          onClick={playing ? onPause : onPlay}
          title={playing ? "Pause" : "Play"}
          style={{
            width: 38,
            height: 32,
            borderRadius: 9999,
            background: "var(--color-ink)",
            color: "var(--color-on-dark)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {playing ? (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <rect x="3" y="2" width="2" height="8" fill="currentColor"/>
              <rect x="7" y="2" width="2" height="8" fill="currentColor"/>
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M3 2v8l7-4z" fill="currentColor"/>
            </svg>
          )}
        </button>

        <PlaybackBtn onClick={onStepForward} title="Next turn">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2l4 4-4 4M9 2v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </PlaybackBtn>

        <div style={{ width: 1, height: 16, background: "var(--color-hairline)", margin: "0 4px" }} />

        <div style={{ display: "flex", gap: 2 }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              title={`${s}× speed`}
              style={{
                background: speedMul === s ? "var(--color-ink)" : "transparent",
                color: speedMul === s ? "var(--color-on-dark)" : "var(--color-muted)",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                padding: "5px 9px",
                borderRadius: 9999,
              }}
            >
              {s}×
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 16, background: "var(--color-hairline)", margin: "0 4px" }} />

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--color-ink)",
            padding: "0 8px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span ref={turnRef}>T{String(turn).padStart(2, "0")}</span> / T{String(Math.max(0, total - 1)).padStart(2, "0")}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-muted)",
            alignSelf: "center",
            marginRight: 4,
          }}
        >
          Layout
        </span>
        {LAYOUT_OPTS.map((opt) => {
          const active = layout === opt.id;
          const hovered = hoveredLayout === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onLayoutChange(opt.id)}
              onMouseEnter={() => setHoveredLayout(opt.id)}
              onMouseLeave={() => setHoveredLayout(null)}
              title={`Layout: ${opt.label}`}
              data-layout-btn
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                background: active
                  ? "var(--color-ink)"
                  : hovered
                  ? "var(--color-surface-card)"
                  : "transparent",
                color: active ? "var(--color-on-dark)" : "var(--color-ink)",
                border: `1px solid ${active ? "var(--color-ink)" : "var(--color-hairline)"}`,
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
                fontSize: 13,
                cursor: "pointer",
                transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
              }}
            >
              {opt.glyph}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
