"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { fetchTemplates, createSimulationV2, type TemplateListItem } from "@/lib/api";

export default function LibraryPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [category, setCategory] = useState("all");

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categories = ["all", ...new Set(templates.map((t) => t.category).filter(Boolean))];
  const filtered = category === "all" ? templates : templates.filter((t) => t.category === category);
  const totalPersonas = new Set(templates.flatMap((t) => {
    const cfg = t.config as Record<string, any> | undefined;
    return cfg?.stakeholders?.map((s: any) => s.name) ?? [];
  })).size;

  const handleLaunch = async (t: TemplateListItem) => {
    setCreating(t.slug);
    try {
      if (!t.config) return;
      const res = await createSimulationV2(t.config as any);
      router.push(`/simulate/${res.simulation_id}`);
    } catch {
      setCreating(null);
    }
  };

  return (
    <AppShell>
      <div className="px-8 py-8">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Library</p>
          <h2 className="mt-2 font-display text-4xl font-semibold tracking-display">Scenario Blueprint Library</h2>
          <p className="mt-2 text-sm text-muted max-w-xl">
            {templates.length} templates across {categories.length - 1} sectors featuring {totalPersonas} unique stakeholder personas.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <div key={i} className="rounded-xl border border-hairline bg-surface-card p-5 animate-pulse h-28" />)}
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-hairline bg-surface-card/50 p-10 text-center">
            <p className="text-sm text-muted">No templates in the library yet.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-2">
              {categories.map((c) => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`text-xs font-medium px-4 py-2 rounded-full transition ${
                    category === c ? "bg-primary text-canvas" : "bg-surface-card text-muted hover:text-ink border border-hairline"
                  }`}>{c === "all" ? `All (${templates.length})` : c}</button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((t) => {
                const stakeholders: any[] = (t.config as any)?.stakeholders ?? [];
                return (
                  <div key={t.slug} className="rounded-xl border border-hairline bg-surface-card p-5 transition flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary">{t.category}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        t.voltage >= 70 ? "text-error border-error/30 bg-error/10" :
                        t.voltage >= 55 ? "text-accent-amber border-accent-amber/30 bg-accent-amber/10" :
                        "text-accent-teal border-accent-teal/30 bg-accent-teal/10"
                      }`}>{t.voltage}v</span>
                    </div>
                    <h3 className="font-semibold">{t.name}</h3>
                    <p className="text-xs text-muted mt-1 line-clamp-2">{t.description}</p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {stakeholders.map((s: any) => (
                        <span key={s.id} className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          s.stance === "champion" ? "border-accent-teal/30 text-accent-teal" :
                          s.stance === "detractor" ? "border-primary/30 text-primary" :
                          "border-hairline text-muted"
                        }`}>{s.name}</span>
                      ))}
                    </div>

                    <div className="mt-auto pt-4">
                      <Button variant="ghost" className="w-full" onClick={() => handleLaunch(t)} disabled={creating !== null}>
                        {creating === t.slug ? "Launching..." : "Launch Scenario"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
