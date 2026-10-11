"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export const LABEL = "font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function Icon({ name, className = "", filled = false }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span
      aria-hidden
      className={`material-symbols-outlined leading-none ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {name}
    </span>
  );
}

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; children: ReactNode };

/** A pill that is either picked or not; font size comes from the wrapper (see globals.css `font: inherit`). */
export function Chip({ active = false, className = "", children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 transition active:scale-[0.97] ${
        active
          ? "border-ink bg-ink text-on-dark"
          : "border-hairline bg-surface-card text-muted hover:border-ink/30 hover:text-ink"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Small round icon button, e.g. a seat's Swap / Remove. */
export function IconButton({
  icon,
  label,
  active = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-full transition ${
        active ? "bg-primary text-on-dark" : "text-muted hover:bg-ink/5 hover:text-ink"
      } ${className}`}
      {...props}
    >
      <Icon name={icon} className="text-[18px]" />
    </button>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
