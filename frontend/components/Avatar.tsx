"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";

export type AvatarAccent = "ink" | "amber" | "teal" | "coral" | "muted" | string;

interface AvatarProps {
  initials: string;
  size?: number;
  accent?: AvatarAccent;
  speaking?: boolean;
  active?: boolean;
  label?: string;
}

const ACCENT_VARS: Record<string, string> = {
  ink:   "var(--color-ink)",
  amber: "var(--color-accent-amber)",
  teal:  "var(--color-accent-teal)",
  coral: "var(--color-primary)",
  muted: "var(--color-muted)",
};

function needsDarkText(accent: string): boolean {
  return accent === "amber" || accent === "var(--color-accent-amber)";
}

export function Avatar({
  initials,
  size = 44,
  accent = "ink",
  speaking = false,
  active = false,
  label,
}: AvatarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const bg = ACCENT_VARS[accent] ?? accent;
  const fg = needsDarkText(accent) ? "var(--color-ink)" : "var(--color-on-dark)";
  const fontSize = Math.round(size * 0.38);

  // Speaking ring animation
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    if (speaking) {
      gsap.set(el, { boxShadow: "0 0 0 3px var(--color-canvas), 0 0 0 5px var(--color-primary)" });
      gsap.to(el, {
        boxShadow: "0 0 0 3px var(--color-canvas), 0 0 0 8px var(--color-primary-active)",
        duration: 0.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    } else if (active) {
      gsap.killTweensOf(el, "boxShadow");
      gsap.to(el, {
        boxShadow: "0 0 0 2px var(--color-canvas), 0 0 0 3px var(--color-hairline)",
        duration: 0.2,
      });
    } else {
      gsap.killTweensOf(el, "boxShadow");
      gsap.to(el, { boxShadow: "none", duration: 0.2 });
    }
    return () => { gsap.killTweensOf(el, "boxShadow"); };
  }, [speaking, active]);

  // Entrance scale-in
  useEffect(() => {
    if (!ref.current) return;
    gsap.from(ref.current, {
      scale: 0.85,
      opacity: 0,
      duration: 0.25,
      ease: "back.out(1.4)",
      clearProps: "transform",
    });
  }, []);

  let boxShadow = "none";
  if (speaking) {
    boxShadow = "0 0 0 3px var(--color-canvas), 0 0 0 5px var(--color-primary)";
  } else if (active) {
    boxShadow = "0 0 0 2px var(--color-canvas), 0 0 0 3px var(--color-hairline)";
  }

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label ?? initials}
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        background: bg,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display), var(--font-newsreader), serif",
        fontSize,
        letterSpacing: "-0.5px",
        fontWeight: 500,
        flexShrink: 0,
        boxShadow,
        userSelect: "none",
      }}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function initialsFromName(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
