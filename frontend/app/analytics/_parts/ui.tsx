import type { ReactNode } from "react";
import type { OutcomeKind } from "@/lib/api";

export const LABEL = "font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted";

export const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
export const moveName = (a: string) => { const s = a.replace(/_/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };

export const OUTCOME_COLOR: Record<OutcomeKind, string> = {
  carried: "var(--color-success)",
  agreed: "var(--color-accent-teal)",
  voted_down: "var(--color-accent-blue)",
  walkout: "var(--color-error)",
  impasse: "var(--color-warning)",
  stalled: "var(--color-accent-amber)",
  stopped: "color-mix(in srgb, var(--color-ink) 25%, transparent)",
  unfinished: "color-mix(in srgb, var(--color-ink) 10%, transparent)",
};

export function Card({ title, hint, children, className = "" }: { title?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-hairline bg-surface-card p-5 sm:p-6 ${className}`}>
      {title && <h2 className="font-serif-title text-lg font-semibold text-ink">{title}</h2>}
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      <div className={title || hint ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "warn" }) {
  return (
    <div className="min-w-0 rounded-2xl border border-hairline bg-surface-card px-5 py-4">
      <p className={LABEL}>{label}</p>
      <p className={`mt-1.5 font-serif-title text-3xl font-semibold tabular-nums ${tone === "warn" ? "text-error" : tone === "good" ? "text-success" : "text-ink"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** One labelled horizontal bar; faded when the group is too small to read anything into. */
export function RateBar({ label, value, note, faded = false, color = "var(--color-primary)", max = 1 }: {
  label: ReactNode; value: number | null; note?: ReactNode; faded?: boolean; color?: string; max?: number;
}) {
  const w = value == null || max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className={`grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 text-sm sm:grid-cols-[8rem_1fr_4rem] ${faded ? "opacity-45" : ""}`}>
      <span className="truncate text-body-strong">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-ink/5">
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${w}%`, background: color }} />
      </span>
      <span className="text-right tabular-nums text-ink">{note ?? pct(value)}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export function TooFew() {
  return <span className="text-xs text-muted">Faded rows have fewer than 3 meetings — too few to read into.</span>;
}
