"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { createSimulationV2, fetchTemplates, type TemplateListItem } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickPlayLoading, setQuickPlayLoading] = useState(false);

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const launchSim = async (t: TemplateListItem) => {
    if (!t.config) return;
    const { simulation_id } = await createSimulationV2(t.config as any);
    router.push(`/simulate/${simulation_id}`);
  };

  const handleQuickPlay = async () => {
    setQuickPlayLoading(true);
    try {
      const first = templates.find((t) => t.category === "Fundraising") ?? templates[0];
      if (first) await launchSim(first);
    } catch {
      setQuickPlayLoading(false);
    }
  };

  const voltageBadge = (v: number) => {
    if (v >= 70) return "text-error border-error/30 bg-error/10";
    if (v >= 55) return "text-accent-amber border-accent-amber/30 bg-accent-amber/10";
    return "text-accent-teal border-accent-teal/30 bg-accent-teal/10";
  };

  const difficultyBadge = (d: string) => {
    switch (d) {
      case "easy": return "text-accent-teal bg-accent-teal/10";
      case "medium": return "text-accent-amber bg-accent-amber/10";
      case "hard": return "text-error bg-error/10";
      default: return "text-muted bg-surface-card";
    }
  };

  const heroRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  // Hero section staggered entrance
  useGSAP(
    () => {
      gsap.from("[data-anim='hero']", {
        y: 24,
        opacity: 0,
        duration: 0.5,
        stagger: 0.12,
        ease: "power2.out",
        clearProps: "transform",
      });
    },
    { scope: heroRef },
  );

  // Scenario cards staggered entrance
  useGSAP(
    () => {
      gsap.from("[data-anim='card']", {
        y: 20,
        opacity: 0,
        duration: 0.4,
        stagger: { amount: 0.4, from: "start" },
        ease: "power2.out",
        clearProps: "transform",
      });
    },
    { scope: cardsRef, dependencies: [templates], revertOnUpdate: true },
  );

  if (loading) {
    return (
      <AppShell>
        <div className="px-8 py-8 animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-ink/10" />
          <div className="h-12 w-96 rounded bg-ink/10" />
          <div className="h-6 w-72 rounded bg-ink/10" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-8 py-8">
        <div ref={heroRef} className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section>
            <p data-anim="hero" className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
              Simulation Console
            </p>
            <h2 data-anim="hero" className="mt-4 max-w-3xl font-display text-6xl font-semibold leading-[0.9] tracking-display md:text-7xl">
              Rehearse the room before you enter it.
            </h2>
            <p data-anim="hero" className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              {templates.length} pre-built scenarios across multiple sectors. Pick one
              and launch a boardroom simulation in seconds.
            </p>
            <div data-anim="hero" className="mt-8 inline-block">
              <Link href="/simulate/new"><Button>Custom Setup</Button></Link>
            </div>
          </section>

          <section className="rounded-[2rem] bg-surface-card p-6">
            <div className="rounded-[1.5rem] bg-surface-dark p-5 text-canvas">
              <div className="mb-6 flex items-center justify-between">
                <span className="text-sm text-canvas/60">Ready to launch</span>
                <span className="rounded-full border border-primary/50 px-3 py-1 text-xs text-primary">
                  {templates.length} scenarios
                </span>
              </div>
              <div className="space-y-2">
                {templates.slice(0, 4).map((t) => (
                  <div key={t.slug} className="rounded-2xl border border-canvas/10 bg-canvas/5 p-3">
                    <p className="text-xs text-canvas/75">{t.category}</p>
                    <p className="mt-0.5 text-sm">{t.name}</p>
                  </div>
                ))}
                {templates.length > 4 && (
                  <p className="text-xs text-canvas/50 text-center pt-1">+{templates.length - 4} more</p>
                )}
              </div>
            </div>
          </section>
        </div>

        <section className="mt-16">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-primary text-2xl">bolt</span>
            <h3 className="font-display text-3xl font-semibold tracking-display">Jump right in</h3>
          </div>
          <p className="text-muted mb-6">Launch a pre-built simulation in one click.</p>

          <button
            onClick={handleQuickPlay}
            disabled={quickPlayLoading}
            className="w-full flex items-center justify-center gap-3 rounded-2xl bg-primary px-8 py-5 text-lg font-semibold text-on-dark shadow-[0_16px_30px_rgba(204,120,92,0.28)] hover:bg-primary-active transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {quickPlayLoading ? (
              <>
                <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Launching simulation...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-2xl">bolt</span>
                Quick Play
              </>
            )}
          </button>
        </section>

        <section className="mt-10">
          <h4 data-anim="hero" className="text-sm font-semibold uppercase tracking-[0.28em] text-muted mb-4">
            All Scenarios ({templates.length})
          </h4>
          <div ref={cardsRef} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.slug}
                data-anim="card"
                onClick={() => launchSim(t)}
                className="text-left rounded-2xl border border-hairline bg-surface-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {t.category}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${voltageBadge(t.voltage)}`}>
                    {t.voltage}v
                  </span>
                </div>
                <h5 className="font-display text-lg font-semibold mb-1">{t.name}</h5>
                <p className="text-sm text-muted leading-relaxed line-clamp-2">{t.description}</p>
                <div className="flex items-center gap-3 mt-4 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">group</span>
                    {t.stakeholder_count}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${difficultyBadge(t.difficulty)}`}>
                    {t.difficulty}
                  </span>
                  {t.estimated_duration && <span>{t.estimated_duration}</span>}
                </div>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-8 text-center">
          <Link
            href="/simulate/new"
            className="text-sm text-muted hover:text-ink underline underline-offset-4 transition-colors"
          >
            Or configure a custom simulation from scratch
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
