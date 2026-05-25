"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import {
  fetchSimulationsV2,
  createSimulationV2,
  fetchTemplates,
  type TemplateListItem,
  type SimulationListItem,
} from "@/lib/api";

// ── Constants ──

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  running: { bg: "bg-accent-teal/10", text: "text-accent-teal", label: "Running" },
  idle: { bg: "bg-accent-amber/10", text: "text-accent-amber", label: "Idle" },
  complete: { bg: "bg-ink/10", text: "text-muted", label: "Complete" },
};

const VOLTAGE_COLORS = [
  "bg-accent-teal",
  "bg-accent-amber",
  "bg-primary",
] as const;

function voltageBar(v: number) {
  const pct = Math.min(Math.max(v, 0), 100);
  const color = pct >= 70 ? VOLTAGE_COLORS[0] : pct >= 45 ? VOLTAGE_COLORS[1] : VOLTAGE_COLORS[2];
  return { pct, color };
}

// Deterministic sparkline from a number seed
function sparklineD(seed: number, pts = 8, w = 200, h = 40): string {
  const values: number[] = [];
  let s = seed * 2654435761;
  for (let i = 0; i < pts; i++) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    values.push(20 + ((s >>> 0) % 25)); // range 20–44
  }
  const step = w / (pts - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = h - (v / 50) * h * 0.7 - h * 0.1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type Stats = {
  total: number;
  avgVoltage: number;
  totalStakeholders: number;
  activeCount: number;
};

function computeStats(items: SimulationListItem[]): Stats {
  const total = items.length;
  return {
    total,
    avgVoltage: total ? Math.round(items.reduce((s, i) => s + i.voltage, 0) / total) : 0,
    totalStakeholders: items.reduce((s, i) => s + i.stakeholder_count, 0),
    activeCount: items.filter((i) => i.status === "running" || i.status === "idle").length,
  };
}

// ── Sub-components ──

function StatCard({ label, value, bar }: { label: string; value: string; bar: { pct: number; color: string } }) {
  return (
    <div className="bg-surface-container-low rounded-xl p-6 border border-hairline/60">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-1.5">{label}</p>
      <p className="font-serif-title text-[2.25rem] leading-none tracking-display text-ink">{value}</p>
      <div className="mt-4 h-[3px] w-full rounded-full overflow-hidden bg-hairline">
        <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.pct}%` }} />
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-surface-container-low rounded-xl p-6 animate-pulse border border-hairline/60">
      <div className="h-3 w-20 rounded bg-ink/10 mb-4" />
      <div className="h-5 w-3/4 rounded bg-ink/10 mb-2" />
      <div className="h-3 w-full rounded bg-ink/10 mb-5" />
      <div className="h-[3px] w-full rounded bg-ink/10 mb-4" />
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((j) => (
          <div key={j} className="w-7 h-7 rounded-full bg-ink/10" />
        ))}
      </div>
    </div>
  );
}

// ── Page ──

export default function SimulationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SimulationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchSimulationsV2(), fetchTemplates()])
      .then(([sims, tmpls]) => {
        if (alive) {
          setItems(sims);
          setTemplates(tmpls);
        }
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(() => computeStats(items), [items]);

  const featured = useMemo(() => items.find((i) => i.status === "running") ?? items[0] ?? null, [items]);

  const handleQuickPlay = async () => {
    setCreating(true);
    try {
      const first = templates.find((t) => t.category === "Fundraising") ?? templates[0];
      if (!first || !first.config) return;
      const res = await createSimulationV2(first.config as any);
      router.push(`/simulate/${res.simulation_id}`);
    } catch {
      setError("Failed to launch quick play.");
      setCreating(false);
    }
  };

  // ── Empty State ──

  if (!loading && items.length === 0) {
    return (
      <AppShell activeTab="War Room" hideTopNav>
        <div className="max-w-lg mx-auto py-24 px-8 text-center">
          <div className="w-14 h-14 rounded-xl bg-surface-container-low flex items-center justify-center mx-auto mb-6 border border-hairline">
            <span className="material-symbols-outlined text-2xl text-muted">precision_manufacturing</span>
          </div>
          <h1 className="font-serif-title text-3xl tracking-display text-ink mb-2">No simulations yet</h1>
          <p className="text-sm text-muted mb-8 leading-relaxed">
            Launch a pre-built scenario or design a custom one from scratch.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={handleQuickPlay} disabled={creating}>
              {creating ? "Launching..." : "Quick Play"}
            </Button>
            <Link href="/simulate/new">
              <Button variant="ghost">Custom Setup</Button>
            </Link>
          </div>
          {templates.length > 0 && (
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              {templates.slice(0, 3).map((t) => (
                <div key={t.slug} className="rounded-xl border border-hairline bg-surface-container-low p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">{t.category}</p>
                  <p className="mt-2 text-sm font-semibold text-ink">{t.name}</p>
                  <p className="mt-1 text-xs text-muted line-clamp-2 leading-relaxed">{t.description}</p>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
                    <span>{t.stakeholder_count} stakeholders</span>
                    <span className="w-1 h-1 rounded-full bg-hairline" />
                    <span>{t.voltage}v</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  // ── Main ──

  return (
    <AppShell activeTab="War Room" hideTopNav>
      {error && (
        <div className="mx-8 mt-8 mb-4 rounded-xl bg-error-container/60 px-5 py-3 text-sm text-on-error-container flex items-center gap-3">
          <span className="material-symbols-outlined text-lg">error_outline</span>
          {error}
        </div>
      )}

      {loading ? (
        <div className="max-w-[1200px] mx-auto py-10 px-8 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface-container-low rounded-xl p-6 animate-pulse border border-hairline/60">
                <div className="h-3 w-28 rounded bg-ink/10 mb-2" />
                <div className="h-8 w-20 rounded bg-ink/10" />
                <div className="mt-4 h-[3px] w-full rounded bg-ink/10" />
              </div>
            ))}
          </div>
          <div className="bg-surface-dark rounded-xl min-h-[320px] animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-[1200px] mx-auto py-10">
          {/* ── Quick Stats ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12 px-8">
            <StatCard
              label="Active Simulations"
              value={String(stats.activeCount)}
              bar={voltageBar(stats.activeCount ? Math.round((stats.activeCount / stats.total) * 100) : 0)}
            />
            <StatCard
              label="Total Stakeholders"
              value={String(stats.totalStakeholders)}
              bar={voltageBar(stats.totalStakeholders ? Math.min(stats.totalStakeholders * 4, 100) : 0)}
            />
            <StatCard
              label="Avg. Voltage"
              value={`${stats.avgVoltage}%`}
              bar={voltageBar(stats.avgVoltage)}
            />
          </div>

          {/* ── Featured Simulation ── */}
          {featured && (
            <section className="mb-14 px-8">
              <div className="relative bg-surface-dark rounded-xl overflow-hidden min-h-[360px] flex flex-col md:flex-row">
                {/* Decorative side panel */}
                <div className="hidden lg:flex w-[30%] bg-surface-dark-soft items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.04]">
                    <div className="absolute top-1/4 left-1/4 w-48 h-48 rounded-full bg-primary blur-3xl" />
                    <div className="absolute bottom-1/4 right-1/4 w-36 h-36 rounded-full bg-accent-teal blur-3xl" />
                  </div>
                  <span className="material-symbols-outlined text-[6rem] text-white/10 relative">account_balance</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-surface-dark to-transparent" />
                </div>

                {/* Content */}
                <div className="flex-1 p-8 md:p-12 lg:p-14 flex flex-col justify-center relative">
                  {/* Status pill */}
                  <div className="flex items-center gap-2 mb-6">
                    <span className="w-2 h-2 rounded-full bg-accent-teal indicator-pulse" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-accent-teal">
                      {featured.status === "running" ? "Active Simulation" : "Latest Simulation"}
                    </span>
                  </div>

                  <h1 className="font-serif-title text-3xl md:text-4xl lg:text-5xl tracking-display text-white mb-3 leading-[1.15]">
                    {featured.subject?.name || "Untitled"}
                  </h1>
                  {featured.subject?.description && (
                    <p className="text-sm text-white/60 max-w-xl leading-relaxed mb-8">
                      {featured.subject.description}
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-8 mb-8">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                        Stakeholders
                      </p>
                      <div className="flex items-center gap-2.5">
                        <div className="flex -space-x-2">
                          {Array.from({ length: Math.min(featured.stakeholder_count, 3) }).map((_, i) => (
                            <div
                              key={i}
                              className="w-8 h-8 rounded-full border-2 border-surface-dark flex items-center justify-center text-[10px] font-bold text-white"
                              style={{
                                backgroundColor:
                                  i === 0 ? "#924a31" : i === 1 ? "#5db8a6" : "#e8a55a",
                              }}
                            >
                              {i === 2 && featured.stakeholder_count > 3
                                ? `+${featured.stakeholder_count - 2}`
                                : ""}
                            </div>
                          ))}
                        </div>
                        <span className="text-sm font-medium text-white">{featured.stakeholder_count}</span>
                      </div>
                    </div>
                    <div className="w-px h-10 bg-white/10" />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                        Voltage
                      </p>
                      <svg width="160" height="32" viewBox="0 0 160 32" className="overflow-visible">
                        <path
                          className="sparkline-path"
                          d={sparklineD(
                            featured.simulation_id.split("").reduce((a, c) => a + c.charCodeAt(0), 0),
                          )}
                          fill="none"
                          stroke="#cc785c"
                          strokeWidth="2"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <Link href={`/simulate/${featured.simulation_id}`}>
                      <Button>Enter War Room</Button>
                    </Link>
                    <button className="rounded-full px-5 py-3 text-sm font-semibold text-white/70 border border-white/15 hover:bg-white/5 hover:text-white transition-colors cursor-pointer">
                      View Logs
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Divider ── */}
          <div className="h-px bg-hairline mx-8 mb-12" />

          {/* ── Simulation Library ── */}
          <section className="px-8">
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="font-serif-title text-2xl tracking-display text-ink">Simulation Library</h2>
                <p className="text-sm text-muted mt-1">Archived and ongoing strategic evaluations.</p>
              </div>
              <div className="flex gap-2">
                <button className="w-9 h-9 rounded-lg border border-hairline flex items-center justify-center text-muted hover:text-ink hover:bg-surface-container-low transition-colors cursor-pointer">
                  <span className="material-symbols-outlined text-lg">grid_view</span>
                </button>
                <button className="w-9 h-9 rounded-lg border border-hairline flex items-center justify-center text-muted hover:text-ink hover:bg-surface-container-low transition-colors cursor-pointer">
                  <span className="material-symbols-outlined text-lg">list</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((sim) => {
                const badge = STATUS_BADGE[sim.status] ?? {
                  bg: "bg-ink/10",
                  text: "text-muted",
                  label: sim.status,
                };
                const { pct, color } = voltageBar(sim.voltage);

                return (
                  <article
                    key={sim.simulation_id}
                    className="group bg-surface-container-low border border-hairline/60 rounded-xl p-6 transition-all duration-200 hover:shadow-md hover:border-hairline hover:-translate-y-0.5"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <span
                        className={`inline-block text-[11px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}
                      >
                        {badge.label}
                      </span>
                      <button className="w-7 h-7 flex items-center justify-center rounded-md text-muted/40 hover:text-muted hover:bg-black/5 transition-colors cursor-pointer -mr-1 -mt-1">
                        <span className="material-symbols-outlined text-lg">more_vert</span>
                      </button>
                    </div>

                    {/* Body */}
                    <Link href={`/simulate/${sim.simulation_id}`} className="block group/link">
                      <h3 className="font-serif-title text-xl tracking-display text-ink mb-1 line-clamp-1 group-hover/link:text-primary transition-colors">
                        {sim.subject?.name || "Untitled"}
                      </h3>
                      {sim.subject?.description && (
                        <p className="text-sm text-muted leading-relaxed line-clamp-2 mb-4">
                          {sim.subject.description}
                        </p>
                      )}
                    </Link>

                    {/* Progress */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-medium text-muted">Probability</span>
                        <span className="text-sm font-semibold text-ink tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-[3px] rounded-full overflow-hidden bg-hairline">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex -space-x-2">
                        {Array.from({ length: Math.min(sim.stakeholder_count, 4) }).map((_, idx) => (
                          <div
                            key={idx}
                            className="w-7 h-7 rounded-full border-2 border-surface-container-low flex items-center justify-center text-[9px] font-bold text-white"
                            style={{
                              backgroundColor:
                                [ "#924a31", "#5db8a6", "#e8a55a", "#6c6a64" ][idx],
                              zIndex: 4 - idx,
                            }}
                          >
                            {idx >= 3 && sim.stakeholder_count > 4
                              ? `+${sim.stakeholder_count - 3}`
                              : ""}
                          </div>
                        ))}
                      </div>
                      {sim.created_at && (
                        <span className="text-[11px] text-muted/60">{timeAgo(sim.created_at)}</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* ── CTA ── */}
          <div className="h-px bg-hairline mx-8 my-14" />
          <section className="text-center max-w-xl mx-auto px-8 pb-10">
            <h2 className="font-serif-title text-3xl tracking-display text-ink mb-3">
              Ready to stress-test your next move?
            </h2>
            <p className="text-sm text-muted mb-8 leading-relaxed">
              Vantage models the irrational human element of high-stakes business strategy, surfacing
              objections others are too polite to say.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/simulate/new">
                <Button>Start New Simulation</Button>
              </Link>
              <Link href="/library">
                <Button variant="ghost">Explore Library</Button>
              </Link>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
