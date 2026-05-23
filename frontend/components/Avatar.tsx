"use client";

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
  const bg = ACCENT_VARS[accent] ?? accent;
  const fg = needsDarkText(accent) ? "var(--color-ink)" : "var(--color-on-dark)";
  const fontSize = Math.round(size * 0.38);

  let boxShadow = "none";
  if (speaking) {
    boxShadow = "0 0 0 3px var(--color-canvas), 0 0 0 5px var(--color-primary)";
  } else if (active) {
    boxShadow = "0 0 0 2px var(--color-canvas), 0 0 0 3px var(--color-hairline)";
  }

  return (
    <div
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
        transition: "box-shadow 200ms ease",
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
