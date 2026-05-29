"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import {
  fetchSimulations,
  createSimulation,
  fetchTemplates,
  type TemplateListItem,
  type SimulationListItem,
} from "@/lib/api";

// ── Constants ──

const CATEGORY_ICONS: Record<string, string> = {
  Fundraising: "account_balance",
  Merger: "merge",
  Partnership: "handshake",
  Legal: "gavel",
  Strategy: "psychology",
  Default: "business",
};

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string; accent: string }> = {
  running: { bg: "bg-success-soft", text: "text-success", label: "Running", accent: "bg-success" },
  idle: { bg: "bg-warning-soft", text: "text-warning", label: "Idle", accent: "bg-warning" },
  complete: { bg: "bg-ink/8", text: "text-muted", label: "Complete", accent: "bg-hairline" },
};

const VOLTAGE_COLORS = [
  "bg-primary",
  "bg-accent-amber",
  "bg-accent-teal",
] as const;

function voltageBar(v: number) {
  const pct = Math.min(Math.max(v, 0), 100);
  const color = pct >= 70 ? VOLTAGE_COLORS[0] : pct >= 45 ? VOLTAGE_COLORS[1] : VOLTAGE_COLORS[2];
  return { pct, color };
}

function sparklineD(seed: number, pts = 8, w = 200, h = 40): string {
  const values: number[] = [];
  let s = seed * 2654435761;
  for (let i = 0; i < pts; i++) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    values.push(20 + ((s >>> 0) % 25));
  }
  const step = w / (pts - 1);
  return values.map((v, i) => {
    const x = i * step;
    const y = h - (v / 50) * h * 0.7 - h * 0.1;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
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

type Stats = { total: number; avgVoltage: number; totalStakeholders: number; activeCount: number };

function computeStats(items: SimulationListItem[]): Stats {
  const total = items.length;
  return {
    total,
    avgVoltage: total ? Math.round(items.reduce((s, i) => s + i.voltage, 0) / total) : 0,
    totalStakeholders: items.reduce((s, i) => s + i.stakeholder_count, 0),
    activeCount: items.filter((i) => i.status === "running" || i.status === "idle").length,
  };
}

// ── Animated Stat Card ──

function AnimatedStatCard({ label, value, bar, delay }: { label: string; value: string; bar: { pct: number; color: string }; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLParagraphElement>(null);

  useGSAP(() => {
    if (!numRef.current || !ref.current) return;
    gsap.from(ref.current, { y: 12, opacity: 0, duration: 0.35, delay, ease: "power2.out", clearProps: "transform" });
    const target = parseInt(value.replace(/\D/g, "")) || 0;
    if (target > 0) {
      gsap.from({ val: 0 }, {
        val: target, duration: 0.8, delay: delay + 0.2, ease: "power2.out",
        onUpdate: function () { if (numRef.current) numRef.current.textContent = String(Math.round(this.targets()[0].val)); },
      });
    }
  }, { dependencies: [value], revertOnUpdate: true });

  return (
    <div ref={ref} className="bg-surface-container-low rounded-xl p-6 border border-hairline/60">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-1.5">{label}</p>
      <p ref={numRef} className="font-serif-title text-[2.25rem] leading-none tracking-display text-ink">{value}</p>
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
        {[1, 2, 3].map((j) => (<div key={j} className="w-7 h-7 rounded-full bg-ink/10" />))}
      </div>
    </div>
  );
}

// ── Confirm Dialog ──

function ConfirmDialog({ open, title, message, onConfirm, onCancel }: { open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-surface-card rounded-2xl p-6 max-w-sm mx-4 shadow-xl border border-hairline" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold tracking-display text-ink mb-2">{title}</h3>
        <p className="text-sm text-muted mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="rounded-full px-5 py-2 text-sm font-medium text-muted hover:text-ink border border-hairline transition-colors cursor-pointer">Cancel</button>
          <button onClick={onConfirm} className="rounded-full px-5 py-2 text-sm font-semibold text-on-dark bg-primary hover:bg-primary-active transition-colors cursor-pointer">Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── Snackbar ──

function Snackbar({ message, visible, onUndo }: { message: string; visible: boolean; onUndo?: () => void }) {
  useGSAP(() => {
    if (!visible) return;
    gsap.fromTo("[data-snackbar]", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" });
  }, { dependencies: [visible] });
  if (!visible) return null;
  return (
    <div data-snackbar className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 bg-ink text-on-dark rounded-full px-5 py-3 shadow-lg text-sm">
      <span>{message}</span>
      {onUndo && <button onClick={onUndo} className="text-primary font-semibold hover:text-primary-active transition-colors cursor-pointer">Undo</button>}
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"newest" | "voltage" | "status">("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; undo?: () => void } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [cardsReady, setCardsReady] = useState(false);

  useEffect(() => { document.title = "Simulations — Vantage Boardroom"; }, []);

  // Onboarding: show for first visit
  const onboardRef = useRef(false);
  useEffect(() => {
    if (onboardRef.current) return;
    const seen = sessionStorage.getItem("sim-page-onboarded");
    if (!seen && !loading && items.length > 0) {
      onboardRef.current = true;
      setShowOnboarding(true);
      sessionStorage.setItem("sim-page-onboarded", "1");
    }
  }, [loading, items.length]);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchSimulations(), fetchTemplates()])
      .then(([sims, tmpls]) => { if (alive) { setItems(sims); setTemplates(tmpls); } })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : "Failed to load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const stats = useMemo(() => computeStats(items), [items]);
  const featured = useMemo(() => items.find((i) => i.status === "running") ?? items[0] ?? null, [items]);

  useEffect(() => {
    if (!loading && items.length > 0 && !cardsReady) requestAnimationFrame(() => setCardsReady(true));
  }, [loading, items.length, cardsReady]);

  useGSAP(() => {
    if (!cardsReady) return;
    gsap.from("[data-anim='sim-card']", { y: 12, opacity: 0, duration: 0.25, stagger: { amount: 0.2, from: "start" }, ease: "power2.out", clearProps: "transform" });
  }, { dependencies: [cardsReady], revertOnUpdate: true });

  const filteredItems = useMemo(() => {
    let result = [...items];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => s.subject?.name?.toLowerCase().includes(q) || s.subject?.description?.toLowerCase().includes(q) || s.status?.toLowerCase().includes(q));
    }
    switch (sortBy) {
      case "voltage": result.sort((a, b) => b.voltage - a.voltage); break;
      case "status": result.sort((a) => (a.status === "running" ? -1 : a.status === "idle" ? -1 : 1)); break;
      case "newest": default: result.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    }
    return result;
  }, [items, searchQuery, sortBy]);

  const handleQuickPlay = async () => {
    setCreating(true);
    try {
      const first = templates.find((t) => t.category === "Fundraising") ?? templates[0];
      if (!first || !first.config) return;
      const res = await createSimulation(first.config as any);
      router.push(`/simulate/${res.simulation_id}`);
    } catch { setError("Failed to launch quick play."); setCreating(false); }
  };

  const handleRetry = () => { setError(""); setLoading(true); window.location.reload(); };
  const handleDelete = (id: string) => { setConfirmDeleteId(id); setOpenMenuId(null); };
  const confirmDelete = () => {
    if (!confirmDeleteId) return;
    setItems((prev) => prev.filter((i) => i.simulation_id !== confirmDeleteId));
    setConfirmDeleteId(null);
    setSnackbar({ message: "Simulation deleted", undo: () => window.location.reload() });
  };

  const closeMenu = useCallback(() => setOpenMenuId(null), []);

  // ── Empty State ──

  if (!loading && items.length === 0) {
    return (
      <AppShell activeTab="War Room" hideTopNav>
        <div className="max-w-lg mx-auto py-24 px-8 text-center">
          <div className="w-14 h-14 rounded-xl bg-surface-container-low flex items-center justify-center mx-auto mb-6 border border-hairline">
            <span className="material-symbols-outlined text-2xl text-muted">precision_manufacturing</span>
          </div>
          <h1 className="font-serif-title text-3xl tracking-display text-ink mb-2">No simulations yet</h1>
          <p className="text-sm text-muted mb-8 leading-relaxed">Launch a pre-built scenario or design a custom one from scratch. Your war room is ready when you are.</p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={handleQuickPlay} disabled={creating}>{creating ? "Launching..." : "Quick Play"}</Button>
            <Link href="/simulate/new"><Button variant="ghost">Custom Setup</Button></Link>
          </div>
          {templates.length > 0 && (
            <div className="mt-12">
              <p className="text-xs text-muted mb-4 uppercase tracking-widest font-semibold">Try one of these pre-built scenarios</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                {templates.slice(0, 3).map((t) => (
                  <button key={t.slug} onClick={() => handleQuickPlay()} className="rounded-xl border border-hairline bg-surface-container-low p-4 text-left hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">{t.category}</p>
                    <p className="mt-2 text-sm font-semibold text-ink">{t.name}</p>
                    <p className="mt-1 text-xs text-muted line-clamp-2 leading-relaxed">{t.description}</p>
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
                      <span>{t.stakeholder_count} stakeholders</span>
                      <span className="w-1 h-1 rounded-full bg-hairline" />
                      <span>{t.voltage}v</span>
                    </div>
                  </button>
                ))}
              </div>
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
        <div className="mx-8 mt-8 mb-4 rounded-xl bg-error-soft px-5 py-3 text-sm text-error flex items-center gap-3">
          <span className="material-symbols-outlined text-lg">error_outline</span>
          <span className="flex-1">{error}</span>
          <button onClick={handleRetry} className="text-error font-semibold hover:underline cursor-pointer">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="max-w-[1200px] mx-auto py-10 px-8 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface-container-low rounded-xl p-6 border border-hairline/60">
                <div className="h-3 w-24 rounded bg-ink/8 anim-shimmer mb-3" />
                <div className="h-8 w-16 rounded bg-ink/8 anim-shimmer" />
                <div className="mt-4 h-[3px] w-full rounded bg-ink/8 anim-shimmer" />
              </div>
            ))}
          </div>
          <div className="bg-surface-dark rounded-2xl min-h-[340px] overflow-hidden">
            <div className="p-10 space-y-5">
              <div className="h-4 w-32 rounded bg-white/8 anim-shimmer" />
              <div className="h-10 w-3/4 rounded bg-white/8 anim-shimmer" />
              <div className="h-4 w-1/2 rounded bg-white/8 anim-shimmer" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (<CardSkeleton key={i} />))}
          </div>
        </div>
      ) : (
        <div className="max-w-[1200px] mx-auto py-10">
          {/* ── Quick Stats ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12 px-8">
            <AnimatedStatCard label="Active Simulations" value={String(stats.activeCount)} bar={voltageBar(stats.activeCount ? Math.round((stats.activeCount / stats.total) * 100) : 0)} delay={0} />
            <AnimatedStatCard label="Total Stakeholders" value={String(stats.totalStakeholders)} bar={voltageBar(stats.totalStakeholders ? Math.min(stats.totalStakeholders * 4, 100) : 0)} delay={0.08} />
            <AnimatedStatCard label="Avg. Voltage" value={`${stats.avgVoltage}%`} bar={voltageBar(stats.avgVoltage)} delay={0.16} />
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
                                  i === 0 ? "var(--color-chart-1)" : i === 1 ? "var(--color-chart-2)" : "var(--color-chart-3)",
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
                          stroke="var(--color-chart-1)"
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
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="font-serif-title text-2xl tracking-display text-ink">Simulation Library</h2>
                <p className="text-sm text-muted mt-1">{filteredItems.length} simulations</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                    viewMode === "grid"
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-hairline text-muted hover:text-ink hover:bg-surface-container-low"
                  }`}
                  aria-label="Grid view"
                >
                  <span className="material-symbols-outlined text-lg">grid_view</span>
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                    viewMode === "list"
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-hairline text-muted hover:text-ink hover:bg-surface-container-low"
                  }`}
                  aria-label="List view"
                >
                  <span className="material-symbols-outlined text-lg">list</span>
                </button>
              </div>
            </div>

            {/* Search + Sort */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted material-symbols-outlined text-[18px] pointer-events-none">search</span>
                <input
                  type="text"
                  placeholder="Search simulations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-full border border-hairline bg-surface-card/70 pl-9 pr-4 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-full border border-hairline bg-surface-card/70 px-4 py-2 text-sm text-ink outline-none focus:border-primary transition-colors cursor-pointer"
              >
                <option value="newest">Newest</option>
                <option value="voltage">Highest voltage</option>
                <option value="status">Running first</option>
              </select>
            </div>

            <div className={viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
              : "flex flex-col gap-3"
            }>
              {filteredItems.length === 0 && (
                <div className="col-span-full text-center py-16 rounded-2xl border-2 border-dashed border-hairline bg-surface-card/50">
                  <p className="text-sm text-muted font-medium">No simulations match your search</p>
                  <button onClick={() => { setSearchQuery(""); setSortBy("newest"); }} className="mt-2 text-xs text-primary hover:underline cursor-pointer">Clear filters</button>
                </div>
              )}
              {filteredItems.map((sim) => {
                const badge = STATUS_BADGE[sim.status] ?? { bg: "bg-ink/8", text: "text-muted", label: sim.status, accent: "bg-hairline" };
                const { pct, color } = voltageBar(sim.voltage);
                const catIcon = CATEGORY_ICONS[sim.subject?.name ?? ""] ?? CATEGORY_ICONS.Default;
                const menuOpen = openMenuId === sim.simulation_id;

                return (
                  <article
                    key={sim.simulation_id}
                    data-anim="sim-card"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") router.push(`/simulate/${sim.simulation_id}`); }}
                    onClick={() => { if (viewMode === "list") router.push(`/simulate/${sim.simulation_id}`); }}
                    className={`relative overflow-hidden transition-all duration-200 cursor-pointer ${
                      sim.status === "running"
                        ? "shadow-[0_0_0_1px_var(--color-success)] hover:shadow-[0_0_0_1px_var(--color-success),_0_4px_16px_rgba(0,0,0,0.08)]"
                        : "border border-hairline/60 hover:shadow-md hover:border-hairline"
                    } hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-primary ${
                      viewMode === "list"
                        ? "rounded-xl p-3 flex items-center gap-4 bg-surface-container-low"
                        : "rounded-xl p-[18px] bg-surface-container-low"
                    }`}
                  >
                    {/* Status accent bar — left edge */}
                    <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${badge.accent} ${viewMode === "list" ? "rounded-r-sm" : "rounded-br-sm"}`} />

                    {/* Click overlay for grid mode (list mode navigates on card click) */}
                    {viewMode === "grid" && (
                      <Link href={`/simulate/${sim.simulation_id}`} className="absolute inset-0 z-10" aria-label={sim.subject?.name || "Untitled"} />
                    )}

                    {/* Category icon — visual scannability */}
                    {viewMode === "grid" && (
                      <span className="absolute top-4 right-4 text-[20px] text-muted/20 material-symbols-outlined pointer-events-none">{catIcon}</span>
                    )}

                    {viewMode === "grid" ? (
                      <>
                        <div className="flex items-start justify-between mb-3 relative z-20">
                          <span className={`inline-block text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>{badge.label}</span>
                        </div>

                        <div className="relative z-20">
                          <h3 className="font-serif-title text-xl tracking-display text-ink mb-1 line-clamp-1">{sim.subject?.name || "Untitled"}</h3>
                          {sim.subject?.description && <p className="text-sm text-muted leading-relaxed line-clamp-2 mb-3">{sim.subject.description}</p>}
                        </div>

                        <div className="mb-3 relative z-20">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-medium text-muted">Voltage</span>
                            <span className="text-sm font-semibold text-ink tabular-nums">{pct}%</span>
                          </div>
                          <div className="h-[3px] rounded-full overflow-hidden bg-hairline">
                            <div className={`h-full rounded-full transition-all duration-700 ease-out ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 relative z-20">
                          <div className="flex -space-x-2">
                            {Array.from({ length: Math.min(sim.stakeholder_count, 4) }).map((_, idx) => (
                              <div key={idx} className="w-7 h-7 rounded-full border-2 border-surface-container-low flex items-center justify-center text-[9px] font-bold text-white"
                                style={{ backgroundColor: ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-muted)"][idx], zIndex: 4 - idx }}>
                                {idx >= 3 && sim.stakeholder_count > 4 ? `+${sim.stakeholder_count - 3}` : ""}
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            {sim.created_at && <span className="text-[11px] text-muted/60">{timeAgo(sim.created_at)}</span>}
                            {/* Kebab menu */}
                            <div className="relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpenMenuId(menuOpen ? null : sim.simulation_id); }}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-muted/40 hover:text-muted hover:bg-black/5 transition-colors cursor-pointer relative z-30"
                                aria-label="Simulation actions"
                              >
                                <span className="material-symbols-outlined text-lg">more_vert</span>
                              </button>
                              {menuOpen && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                                  <div className="absolute right-0 top-full mt-1 z-50 bg-surface-card rounded-xl border border-hairline shadow-lg py-1 min-w-[160px]">
                                    <Link href={`/simulate/${sim.simulation_id}`} className="block px-4 py-2 text-sm text-ink hover:bg-surface-container-low transition-colors no-underline">Open</Link>
                                    <button onClick={() => { setOpenMenuId(null); }} className="block w-full text-left px-4 py-2 text-sm text-ink hover:bg-surface-container-low transition-colors cursor-pointer">Rename</button>
                                    <button onClick={() => { setOpenMenuId(null); }} className="block w-full text-left px-4 py-2 text-sm text-ink hover:bg-surface-container-low transition-colors cursor-pointer">Duplicate</button>
                                    <div className="h-px bg-hairline my-1" />
                                    <button onClick={() => handleDelete(sim.simulation_id)} className="block w-full text-left px-4 py-2 text-sm text-error hover:bg-error-soft transition-colors cursor-pointer">Delete</button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 flex-1 min-w-0 relative z-20">
                          <span className={`shrink-0 inline-block text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>{badge.label}</span>
                          <span className="text-sm font-semibold text-ink truncate">{sim.subject?.name || "Untitled"}</span>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 text-xs text-muted relative z-20">
                          <span className="tabular-nums">{pct}%</span>
                          <div className="flex -space-x-1.5">
                            {Array.from({ length: Math.min(sim.stakeholder_count, 3) }).map((_, idx) => (
                              <div key={idx} className="w-5 h-5 rounded-full border border-surface-container-low flex items-center justify-center text-[7px] font-bold text-white"
                                style={{ backgroundColor: ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)"][idx] }}>
                                {idx === 2 && sim.stakeholder_count > 3 ? `+${sim.stakeholder_count - 2}` : ""}
                              </div>
                            ))}
                          </div>
                          {sim.created_at && <span className="text-[11px] text-muted/60">{timeAgo(sim.created_at)}</span>}
                          <button
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpenMenuId(menuOpen ? null : sim.simulation_id); }}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-muted/40 hover:text-muted hover:bg-black/5 transition-colors cursor-pointer relative z-30"
                            aria-label="Simulation actions"
                          >
                            <span className="material-symbols-outlined text-lg">more_vert</span>
                          </button>
                          {menuOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                              <div className="absolute right-0 top-full mt-1 z-50 bg-surface-card rounded-xl border border-hairline shadow-lg py-1 min-w-[160px]">
                                <Link href={`/simulate/${sim.simulation_id}`} className="block px-4 py-2 text-sm text-ink hover:bg-surface-container-low transition-colors no-underline">Open</Link>
                                <button onClick={() => { setOpenMenuId(null); }} className="block w-full text-left px-4 py-2 text-sm text-ink hover:bg-surface-container-low transition-colors cursor-pointer">Rename</button>
                                <button onClick={() => { setOpenMenuId(null); }} className="block w-full text-left px-4 py-2 text-sm text-ink hover:bg-surface-container-low transition-colors cursor-pointer">Duplicate</button>
                                <div className="h-px bg-hairline my-1" />
                                <button onClick={() => handleDelete(sim.simulation_id)} className="block w-full text-left px-4 py-2 text-sm text-error hover:bg-error-soft transition-colors cursor-pointer">Delete</button>
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          {/* ── Confirm Delete Dialog ── */}
          <ConfirmDialog
            open={!!confirmDeleteId}
            title="Delete simulation?"
            message="This action cannot be undone. The simulation and all its data will be permanently removed."
            onConfirm={confirmDelete}
            onCancel={() => setConfirmDeleteId(null)}
          />

          {/* ── Snackbar ── */}
          <Snackbar message={snackbar?.message ?? ""} visible={!!snackbar} onUndo={snackbar?.undo} />

          {/* ── Onboarding hint ── */}
          {showOnboarding && (
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
              <div className="bg-surface-dark text-on-dark rounded-2xl px-6 py-4 shadow-xl max-w-sm text-center border border-white/10">
                <p className="text-sm font-medium">Click any simulation to enter the War Room</p>
                <p className="text-xs text-on-dark-soft mt-1">Search, sort, or switch to list view to find simulations faster.</p>
                <button onClick={() => setShowOnboarding(false)} className="mt-3 text-xs text-primary font-semibold hover:underline cursor-pointer">Got it</button>
              </div>
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-surface-dark rotate-45 border-l border-t border-white/10" />
            </div>
          )}

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
