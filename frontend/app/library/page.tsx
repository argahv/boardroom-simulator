"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { fetchStakeholders } from "@/lib/api";
import type { Stakeholder } from "@/lib/types";

export default function LibraryPage() {
  const [personas, setPersonas] = useState<Stakeholder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStakeholders()
      .then(setPersonas)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell activeTab="Personas">
      <div className="px-8 py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Library</p>
        <h2 className="mt-2 font-display text-4xl font-semibold tracking-display">Persona Assets</h2>
        <p className="mt-2 text-sm text-muted max-w-xl">Reusable stakeholder personas available for your simulations.</p>

        {loading ? (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="rounded-xl border border-hairline bg-surface-card p-5 animate-pulse h-28" />)}
          </div>
        ) : personas.length === 0 ? (
          <div className="mt-8 rounded-xl border-2 border-dashed border-hairline bg-surface-card/50 p-10 text-center">
            <p className="text-sm text-muted">No personas in the library yet.</p>
            <a href="/personas" className="mt-3 inline-block text-sm text-primary hover:underline">Create personas →</a>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {personas.map((p) => (
              <div key={p.id} className="rounded-xl border border-hairline bg-surface-card p-5 hover:border-primary/30 transition">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-surface-container-higher flex items-center justify-center text-sm font-bold text-ink">
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{p.name}</h3>
                    <p className="text-xs text-muted">{p.role}</p>
                  </div>
                </div>
                <p className="text-xs text-muted italic">{p.focus}</p>
                {p.tag && <span className="mt-2 inline-block rounded-full bg-canvas/80 px-2.5 py-0.5 text-[10px] font-medium border border-hairline">{p.tag}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
