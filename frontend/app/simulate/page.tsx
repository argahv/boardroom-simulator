"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { fetchSimulationsV2, createSimulationV2, fetchTemplates, type TemplateListItem, type SimulationListItem } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  idle: "bg-accent-amber/20 text-accent-amber",
  running: "bg-accent-teal/20 text-accent-teal",
  complete: "bg-green-500/20 text-green-700",
};

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

export default function SimulationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SimulationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchSimulationsV2(),
      fetchTemplates(),
    ])
      .then(([sims, tmpls]) => { if (alive) { setItems(sims); setTemplates(tmpls); } })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : "Failed to load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

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

  return (
    <AppShell activeTab="War Room">
      <div className="px-8 py-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Simulations</p>
            <h2 className="mt-2 font-display text-4xl font-normal tracking-display text-ink">War Room Sessions</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted leading-relaxed">
              Browse active and completed simulations. Open detail view for live stream and postmortem.
            </p>
          </div>
          <Link href="/simulate/new">
            <Button>Create Simulation</Button>
          </Link>
        </div>

        {error && (
          <div className="mb-5 rounded-xl bg-primary/10 p-4 text-sm text-primary-active">{error}</div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-xl border border-ink/10 bg-surface-card p-5 animate-pulse">
                <div className="h-4 w-28 rounded bg-ink/10" /><div className="mt-3 h-6 w-3/4 rounded bg-ink/10" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/20 bg-surface-card p-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Simulations</p>
            <h3 className="mt-3 font-display text-3xl font-normal tracking-display text-ink">No simulations yet</h3>
            <p className="mt-2 text-sm text-muted">Launch a pre-built scenario or create a custom one</p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button onClick={handleQuickPlay} disabled={creating}>
                {creating ? "Launching..." : "Quick Play"}
              </Button>
              <Link href="/simulate/new">
                <Button variant="ghost">Custom Setup</Button>
              </Link>
            </div>
            <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
              {templates.slice(0, 3).map((t) => (
                <div key={t.slug} className="rounded-lg border border-ink/10 bg-surface-subtle p-4 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t.category}</p>
                  <p className="mt-2 text-sm font-semibold text-ink">{t.name}</p>
                  <p className="mt-1 text-xs text-muted line-clamp-2">{t.description}</p>
                  <div className="mt-3 flex gap-2 text-xs text-muted">
                    <span>{t.stakeholder_count} stakeholders</span>
                    <span>·</span>
                    <span>{t.voltage}v</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((sim) => (
              <article key={sim.simulation_id} className="group rounded-xl border border-ink/10 bg-surface-card p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${STATUS_STYLE[sim.status] ?? "bg-canvas/10 text-canvas/70"}`}>{sim.status}</span>
                  {sim.created_at && (
                    <span className="text-[11px] text-muted/60">{timeAgo(sim.created_at)}</span>
                  )}
                </div>
                <h3 className="font-display text-2xl tracking-display text-ink line-clamp-1">{sim.subject?.name || "Untitled"}</h3>
                {sim.subject?.description && (
                  <p className="mt-1.5 text-xs text-muted/80 leading-relaxed line-clamp-2">{sim.subject.description}</p>
                )}
                <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-muted">
                  <div><p className="uppercase tracking-wider text-muted">Stakeholders</p><p className="mt-1 font-semibold text-ink">{sim.stakeholder_count}</p></div>
                  <div><p className="uppercase tracking-wider text-muted">Voltage</p><p className="mt-1 font-semibold text-ink">{sim.voltage}%</p></div>
                  <div><p className="uppercase tracking-wider text-muted">Temp</p><p className="mt-1 font-semibold text-ink capitalize">{sim.model_temperature ?? "stable"}</p></div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href={`/simulate/${sim.simulation_id}`}><Button>Open War Room</Button></Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
