import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";

export default function Home() {
  return (
    <AppShell>
      <div className="px-8 py-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">Simulation Console</p>
          <h2 className="mt-4 max-w-3xl font-display text-6xl font-semibold leading-[0.9] tracking-display md:text-7xl">
            Rehearse the room before you enter it.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Build a tense stakeholder panel, tune incentives, then launch a Vantage-style negotiation
            war room against a FastAPI simulation backend.
          </p>
          <Link href="/simulate/new" className="mt-8 inline-block">
            <Button>Start a simulation</Button>
          </Link>
        </section>

        <section className="rounded-[2rem] bg-surface-card p-6">
          <div className="rounded-[1.5rem] bg-surface-dark p-5 text-canvas">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-sm text-canvas/60">Live War Room</span>
              <span className="rounded-full border border-primary/50 px-3 py-1 text-xs text-primary">
                Standby
              </span>
            </div>
            {["CFO challenges payback", "Legal flags data export", "Champion pushes rollout"].map(
              (event, index) => (
                <div key={event} className="mb-3 rounded-2xl border border-canvas/10 bg-canvas/5 p-4">
                  <p className="text-xs text-canvas/75">Turn {index + 1}</p>
                  <p className="mt-1 text-sm">{event}</p>
                </div>
              )
            )}
          </div>
        </section>
      </div>
      </div>
    </AppShell>
  );
}
