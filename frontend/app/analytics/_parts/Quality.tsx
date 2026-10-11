import type { Insights } from "@/lib/api";
import { Card, LABEL, Stat, pct } from "./ui";

type Check = { label: string; value: number | null; warnAt: number; meaning: string };

export function Quality({ data }: { data: Insights["quality"] }) {
  const checks: Check[] = [
    { label: "Canned fallbacks", value: data.fallback_rate, warnAt: 0.05, meaning: "The model failed or timed out, so the agent said a stock line." },
    { label: "Unreadable replies", value: data.parse_fail_rate, warnAt: 0.05, meaning: "The reply couldn't be parsed and was salvaged." },
    { label: "Moves relabelled", value: data.relabelled_rate, warnAt: 0.15, meaning: "The agent named a move that didn't match what it said." },
    { label: "Targets guessed", value: data.target_guessed_rate, warnAt: 0.2, meaning: "Who a turn was aimed at had to be inferred." },
  ];
  const ms = (x: number | null) => (x == null ? "—" : x >= 1000 ? `${(x / 1000).toFixed(1)}s` : `${Math.round(x)}ms`);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Can these results be trusted? Checked across {data.turns_checked} turns. High numbers here mean the meetings say more about the
        model than about the people in them.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {checks.map((c) => {
          const bad = c.value != null && c.value >= c.warnAt;
          return (
            <div key={c.label} className={`rounded-2xl border px-5 py-4 ${bad ? "border-warning/40 bg-warning-soft/40" : "border-hairline bg-surface-card"}`}>
              <p className={LABEL}>{c.label}</p>
              <p className={`mt-1.5 font-serif-title text-3xl font-semibold tabular-nums ${bad ? "text-warning" : "text-ink"}`}>{pct(c.value)}</p>
              <p className="mt-1 text-xs text-muted">{c.meaning}</p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Reply time" value={ms(data.p50_latency_ms)} sub={`slowest 5%: ${ms(data.p95_latency_ms)}`} />
        <Stat label="Tokens / meeting" value={data.tokens_per_meeting?.toLocaleString() ?? "—"} sub="model output" />
        <Stat label="Stopped early" value={data.stopped} sub="ended by hand" />
        <Stat label="Never finished" value={data.never_finished} sub="created, not run to the end" />
      </div>
      {Object.keys(data.models).length > 0 && (
        <Card title="Models used">
          <ul className="flex flex-wrap gap-2 text-sm">
            {Object.entries(data.models).map(([m, n]) => (
              <li key={m} className="rounded-full border border-hairline px-3 py-1">
                <span className="text-ink">{m === "unknown" ? "Default model" : m}</span> <span className="tabular-nums text-muted">{n} turns</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
