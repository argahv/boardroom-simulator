"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { fetchSimulationsV2 } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  idle: "bg-accent-amber/20 text-accent-amber",
  running: "bg-accent-teal/20 text-accent-teal",
  complete: "bg-green-500/20 text-green-700",
};

export default function SimulationsPage() {
  const [items, setItems] = useState<{ simulation_id: string; subject: { name: string }; status: string; stakeholder_count: number; voltage: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchSimulationsV2()
      .then((data) => { if (alive) setItems(data); })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : "Failed to load simulations."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

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
          <div className="rounded-xl border border-dashed border-ink/20 bg-surface-card p-10 text-center">
            <p className="text-sm text-muted">No simulations yet.</p>
            <div className="mt-4"><Link href="/simulate/new"><Button>Create your first simulation</Button></Link></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((sim) => (
              <article key={sim.simulation_id} className="rounded-xl border border-ink/10 bg-surface-card p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${STATUS_STYLE[sim.status] ?? "bg-canvas/10 text-canvas/70"}`}>{sim.status}</span>
                </div>
                <h3 className="font-display text-2xl tracking-display text-ink line-clamp-2">{sim.subject?.name || "Untitled"}</h3>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted">
                  <div><p className="uppercase tracking-wider text-muted">Stakeholders</p><p className="mt-1 font-semibold text-ink">{sim.stakeholder_count}</p></div>
                  <div><p className="uppercase tracking-wider text-muted">Voltage</p><p className="mt-1 font-semibold text-ink">{sim.voltage}%</p></div>
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
