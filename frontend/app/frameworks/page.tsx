"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { createSimulation, fetchTemplates, type TemplateListItem } from "@/lib/api";

export default function FrameworksPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch((err) => console.error("Failed to load:", err))
      .finally(() => setLoading(false));
  }, []);

  const categories = ["all", ...new Set(templates.map((t) => t.category).filter(Boolean))];
  const filtered = category === "all" ? templates : templates.filter((t) => t.category === category);

  const handleLaunch = async (t: TemplateListItem) => {
    setCreating(t.slug);
    try {
      if (!t.config) throw new Error("Template has no config");
      const res = await createSimulation(t.config as any);
      router.push(`/simulate/${res.simulation_id}`);
    } catch {
      setCreating(null);
    }
  };

  const voltageColor = (v: number) => {
    if (v >= 70) return "text-error border-error/30 bg-error/10";
    if (v >= 55) return "text-accent-amber border-accent-amber/30 bg-accent-amber/10";
    return "text-accent-teal border-accent-teal/30 bg-accent-teal/10";
  };

  const diffColor = (d: string) => {
    switch (d) {
      case "easy": return "text-accent-teal bg-accent-teal/10";
      case "medium": return "text-accent-amber bg-accent-amber/10";
      case "hard": return "text-error bg-error/10";
      default: return "text-muted bg-surface-card";
    }
  };

  return (
    <AppShell activeTab="Frameworks">
      <div className="px-8 py-8">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Frameworks</p>
          <h2 className="mt-2 font-display text-4xl font-semibold tracking-display">Scenario Templates</h2>
          <p className="mt-2 text-sm text-muted max-w-xl">
            Pre-built negotiation frameworks across {categories.length - 1} sectors.
            Launch any template with one click.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="rounded-xl border border-hairline bg-surface-card p-5 animate-pulse">
                <div className="h-4 w-20 rounded bg-ink/10 mb-3" />
                <div className="h-5 w-3/4 rounded bg-ink/10 mb-2" />
                <div className="h-4 w-full rounded bg-ink/10 mb-4" />
                <div className="h-8 w-full rounded-full bg-ink/10" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* ── Category filters ── */}
            <div className="mb-6 flex flex-wrap gap-2">
              {categories.map((c) => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`text-xs font-medium px-4 py-2 rounded-full transition ${
                    category === c ? "bg-primary text-canvas" : "bg-surface-card text-muted hover:text-ink border border-hairline"
                  }`}>{c === "all" ? `All (${templates.length})` : c}</button>
              ))}
            </div>

            {/* ── Template grid ── */}
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-hairline bg-surface-card/50 p-10 text-center">
                <p className="text-sm text-muted">No templates in this category yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((t) => (
                  <div key={t.slug} className="rounded-xl border border-hairline bg-surface-card p-5 hover:border-primary/30 transition flex flex-col">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">{t.category}</span>
                        <div className="flex gap-1.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${voltageColor(t.voltage)}`}>
                            {t.voltage}v
                          </span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${diffColor(t.difficulty)}`}>
                            {t.difficulty}
                          </span>
                        </div>
                      </div>
                      <h3 className="font-semibold">{t.name}</h3>
                      <p className="text-xs text-muted mt-1 line-clamp-2">{t.description}</p>
                      <div className="mt-3 flex gap-3 text-xs text-muted">
                        <span>{t.stakeholder_count} stakeholders</span>
                        {t.estimated_duration && <><span>·</span><span>{t.estimated_duration}</span></>}
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button variant="ghost" className="w-full" onClick={() => handleLaunch(t)} disabled={creating !== null}>
                        {creating === t.slug ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                            Launching...
                          </span>
                        ) : "Launch"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
