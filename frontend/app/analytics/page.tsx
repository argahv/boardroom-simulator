"use client";
import { AppShell } from "@/components/AppShell";

export default function AnalyticsPage() {
  return (
    <AppShell>
      <div className="px-8 py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Analytics</p>
        <h2 className="mt-2 font-display text-4xl font-semibold tracking-display">Cross-Simulation Insights</h2>
        <p className="mt-2 text-sm text-muted max-w-xl">Aggregated performance metrics and negotiation trend analysis across all simulations.</p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-hairline bg-surface-card p-5">
            <p className="text-xs text-muted uppercase tracking-wider font-semibold">Total Simulations</p>
            <p className="font-display text-3xl mt-2 font-semibold">—</p>
          </div>
          <div className="rounded-xl border border-hairline bg-surface-card p-5">
            <p className="text-xs text-muted uppercase tracking-wider font-semibold">Avg. Voltage</p>
            <p className="font-display text-3xl mt-2 font-semibold">—</p>
          </div>
          <div className="rounded-xl border border-hairline bg-surface-card p-5">
            <p className="text-xs text-muted uppercase tracking-wider font-semibold">Total Turns</p>
            <p className="font-display text-3xl mt-2 font-semibold">—</p>
          </div>
        </div>
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-surface-card/50 p-10 text-center">
          <p className="text-sm text-muted">Analytics will populate as simulations are completed. Post-mortem data and cross-session comparisons coming soon.</p>
        </div>
      </div>
    </AppShell>
  );
}
