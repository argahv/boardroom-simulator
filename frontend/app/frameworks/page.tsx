"use client";
import { AppShell } from "@/components/AppShell";

export default function FrameworksPage() {
  const fws = [
    { name: "Series B Fundraise", ctx: "VC term-sheet negotiation", s: 5, v: 62 },
    { name: "Merger Negotiation", ctx: "Cross-company merger terms", s: 6, v: 75 },
    { name: "Partnership Renewal", ctx: "Enterprise agreement renegotiation", s: 4, v: 50 },
  ];
  return (
    <AppShell activeTab="Frameworks">
      <div className="px-8 py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Frameworks</p>
        <h2 className="mt-2 font-display text-4xl font-semibold tracking-display">Scenario Templates</h2>
        <p className="mt-2 text-sm text-muted max-w-xl">Pre-built negotiation frameworks to quickly start a simulation.</p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {fws.map(fw => (
            <div key={fw.name} className="rounded-xl border border-hairline bg-surface-card p-5 hover:border-primary/30 transition">
              <h3 className="font-semibold">{fw.name}</h3>
              <p className="text-xs text-muted mt-1">{fw.ctx}</p>
              <div className="mt-4 flex gap-3 text-xs text-muted"><span>{fw.s} stakeholders</span><span>·</span><span>{fw.v}v</span></div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
