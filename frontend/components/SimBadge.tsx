"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import gsap from "gsap";

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
  const ref = useRef<HTMLSpanElement>(null);
  const { bg, fg } = TONE_STYLES[tone] ?? TONE_STYLES.neutral;

  // Scale-in entrance on mount
  useEffect(() => {
    if (!ref.current) return;
    gsap.from(ref.current, {
      scale: 0.85,
      opacity: 0,
      duration: 0.25,
      ease: "back.out(1.7)",
      clearProps: "transform",
    });
  }, []);

  // Animate background color transition on tone change
  useEffect(() => {
    if (!ref.current) return;
    gsap.to(ref.current, {
      background: bg,
      color: fg,
      duration: 0.3,
      ease: "power2.out",
    });
  }, [tone, bg, fg]);

  return (
    <span
      ref={ref}
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
