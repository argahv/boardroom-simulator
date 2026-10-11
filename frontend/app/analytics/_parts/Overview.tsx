import Link from "next/link";
import type { Insights } from "@/lib/api";
import { Icon } from "@/components/room/ui";
import { Card, Empty, LABEL, OUTCOME_COLOR, Stat, pct } from "./ui";

export type Tab = "overview" | "outcomes" | "people" | "tactics" | "quality";

const TONE = {
  good: { icon: "trending_up", ring: "border-success/30 bg-success-soft/40", text: "text-success" },
  warn: { icon: "warning", ring: "border-warning/40 bg-warning-soft/40", text: "text-warning" },
  info: { icon: "lightbulb", ring: "border-hairline bg-surface-card", text: "text-primary" },
} as const;

const ago = (iso: string | null) => {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

export function OutcomeMix({ data, tall = false }: { data: Insights["outcomes"]; tall?: boolean }) {
  const total = data.mix.reduce((n, m) => n + m.count, 0);
  if (!total) return <Empty>No meetings in this period.</Empty>;
  return (
    <div>
      <div className={`flex w-full overflow-hidden rounded-full ${tall ? "h-5" : "h-3"}`} role="img"
        aria-label={data.mix.map((m) => `${m.label}: ${m.count}`).join(", ")}>
        {data.mix.map((m) => (
          <span key={m.kind} title={`${m.label}: ${m.count}`} style={{ width: `${(m.count / total) * 100}%`, background: OUTCOME_COLOR[m.kind] }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {data.mix.map((m) => (
          <li key={m.kind} className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: OUTCOME_COLOR[m.kind] }} />
            <span className="text-body-strong">{m.label}</span>
            <span className="tabular-nums text-muted">{m.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Overview({ data, onOpen }: { data: Insights; onOpen: (t: Tab) => void }) {
  const o = data.outcomes;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Meetings" value={data.totals.meetings} sub={`${data.totals.finished} finished · ${data.totals.turns} turns`} />
        <Stat label="Reached a decision" value={pct(o.decision_rate)} sub={`${data.totals.decided} of ${o.finished} finished`}
          tone={o.decision_rate != null && o.finished >= 3 ? (o.decision_rate >= 0.5 ? "good" : o.decision_rate < 0.25 ? "warn" : undefined) : undefined} />
        <Stat label="Turns to decide" value={o.median_turns_to_decision ?? "—"}
          sub={o.median_turns_stalled ? `stalled rooms quit at ${o.median_turns_stalled}` : "median"} />
        <Stat label="Walkouts" value={pct(o.walkout_rate)} sub="of finished meetings" />
      </div>

      <div>
        <p className={LABEL}>What stands out</p>
        {data.headlines.length === 0 ? (
          <div className="mt-2"><Empty>Run a few more meetings: patterns show once there are at least 3 to compare.</Empty></div>
        ) : (
          <ul className="mt-2 grid gap-3 md:grid-cols-2">
            {data.headlines.map((h) => {
              const t = TONE[h.tone];
              return (
                <li key={h.title}>
                  <button type="button" onClick={() => onOpen(h.area)}
                    className={`group flex h-full w-full cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition hover:border-primary/40 ${t.ring}`}>
                    <Icon name={t.icon} className={`mt-0.5 text-[20px] ${t.text}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{h.title}</span>
                      <span className="mt-0.5 block text-sm text-muted">{h.body}</span>
                    </span>
                    <Icon name="arrow_forward" className="mt-0.5 text-[18px] text-muted opacity-0 transition group-hover:opacity-100" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
        <Card title="How meetings end" className="lg:col-span-2">
          <OutcomeMix data={o} />
        </Card>
        <Card title="Latest meetings" className="lg:col-span-3">
          <ul className="-my-2 divide-y divide-hairline">
            {data.recent.map((m) => (
              <li key={m.id}>
                <Link href={m.kind === "unfinished" ? `/simulate/${m.id}` : `/simulate/${m.id}/postmortem`}
                  className="flex items-center gap-3 py-2.5 text-sm transition hover:text-primary">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: OUTCOME_COLOR[m.kind] }} />
                  <span className="min-w-0 flex-1 truncate text-ink">{m.subject}</span>
                  <span className="hidden shrink-0 text-muted sm:inline">{m.label}</span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">{ago(m.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
