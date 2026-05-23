"use client";

import type { CSSProperties, ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "skeptical"
  | "agreeable"
  | "calibrating"
  | "locked"
  | "visionary"
  | "coral"
  | "dark"
  | "soft"
  | "speaking"
  | "amber"
  | "teal";

const TONE_STYLES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral:     { bg: "var(--color-surface-card)",          fg: "var(--color-ink)" },
  skeptical:   { bg: "#f1dcd4",                            fg: "#7a3422" },
  agreeable:   { bg: "#dceee5",                            fg: "#1f5e44" },
  calibrating: { bg: "#f4e6cc",                            fg: "#7a5818" },
  locked:      { bg: "var(--color-ink)",                   fg: "var(--color-on-dark)" },
  visionary:   { bg: "#e2ddf0",                            fg: "#4a3d7a" },
  coral:       { bg: "var(--color-primary)",               fg: "#fff" },
  dark:        { bg: "var(--color-surface-dark)",          fg: "var(--color-on-dark)" },
  soft:        { bg: "var(--color-hairline)",              fg: "var(--color-muted)" },
  speaking:    { bg: "var(--color-primary)",               fg: "#fff" },
  amber:       { bg: "var(--color-accent-amber)",          fg: "var(--color-ink)" },
  teal:        { bg: "var(--color-accent-teal)",           fg: "#fff" },
};

interface SimBadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  style?: CSSProperties;
}

export function SimBadge({ children, tone = "neutral", style }: SimBadgeProps) {
  const { bg, fg } = TONE_STYLES[tone] ?? TONE_STYLES.neutral;
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: "3px 8px",
        borderRadius: 9999,
        fontSize: 10,
        letterSpacing: "0.1em",
        fontWeight: 700,
        textTransform: "uppercase",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function dispositionTone(actionType: string): BadgeTone {
  const map: Record<string, BadgeTone> = {
    statement:       "neutral",
    question:        "calibrating",
    challenge:       "skeptical",
    compromise:      "agreeable",
    coalition_signal:"teal",
    interrupt:       "locked",
    escalate:        "locked",
  };
  return map[actionType] ?? "neutral";
}

export function tagTone(tag: string): BadgeTone {
  const map: Record<string, BadgeTone> = {
    SKEPTICAL:   "skeptical",
    AGREEABLE:   "agreeable",
    CALIBRATING: "calibrating",
    LOCKED:      "locked",
    VISIONARY:   "visionary",
    NEUTRAL:     "neutral",
    ALIGNED:     "teal",
    HOSTILE:     "locked",
  };
  return map[tag] ?? "neutral";
}
