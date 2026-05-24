"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { fetchAgentDetail, type AgentDetailResponse } from "@/lib/api";

gsap.registerPlugin(useGSAP);

type PageProps = { params: Promise<{ slug: string }> };

export default function AgentDetailPage({ params }: PageProps) {
  const { slug } = use(params);
  const [data, setData] = useState<AgentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchAgentDetail(slug)
      .then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Failed to load agent"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  const profile = data?.profile as Record<string, any> | undefined;
  const personality = profile?.personality
    ? typeof profile.personality === "string" ? JSON.parse(profile.personality) : profile.personality
    : {};

  const headerRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const personalityRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const memoriesRef = useRef<HTMLDivElement>(null);
  const simCountRef = useRef<HTMLParagraphElement>(null);
  const turnCountRef = useRef<HTMLParagraphElement>(null);
  const memCountRef = useRef<HTMLParagraphElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!data) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      if (headerRef.current) {
        gsap.from(headerRef.current.querySelectorAll("[data-anim='fade']"), {
          y: -20, opacity: 0, duration: 0.5, ease: "power2.out", stagger: 0.08, clearProps: "transform",
        });
      }
      if (statsRef.current) {
        gsap.from(statsRef.current.querySelectorAll("[data-anim='stat']"), {
          scale: 0.6, opacity: 0, duration: 0.4, ease: "back.out(1.7)", stagger: 0.06,
        });
      }
      if (simCountRef.current) {
        const o = { v: 0 }; gsap.to(o, { v: data.stats.total_simulations, duration: 0.8, ease: "power2.out", onUpdate: () => { simCountRef.current!.textContent = String(Math.round(o.v)); } });
      }
      if (turnCountRef.current) {
        const o = { v: 0 }; gsap.to(o, { v: data.stats.total_turns, duration: 0.8, ease: "power2.out", onUpdate: () => { turnCountRef.current!.textContent = String(Math.round(o.v)); } });
      }
      if (memCountRef.current) {
        const o = { v: 0 }; gsap.to(o, { v: data.stats.total_memories, duration: 0.8, ease: "power2.out", onUpdate: () => { memCountRef.current!.textContent = String(Math.round(o.v)); } });
      }
      if (personalityRef.current) {
        gsap.from(personalityRef.current.querySelectorAll("[data-anim='pbar']"), {
          width: "0%", duration: 0.5, stagger: 0.04, ease: "power3.out",
        });
      }
      if (historyRef.current) {
        gsap.from(historyRef.current.querySelectorAll("[data-anim='hcard']"), {
          y: 24, opacity: 0, duration: 0.4, ease: "back.out(1.7)", stagger: 0.08, clearProps: "transform",
        });
      }
      if (memoriesRef.current) {
        gsap.from(memoriesRef.current.querySelectorAll("[data-anim='mcard']"), {
          y: 16, opacity: 0, duration: 0.4, ease: "power2.out", stagger: 0.06, clearProps: "transform",
        });
      }
    });
    return () => mm.revert();
  }, { scope: sectionRef, dependencies: [data], revertOnUpdate: true });

  return (
    <AppShell activeTab="Personas">
      <div className="px-8 py-8">
        <Link href="/personas" className="text-xs text-muted hover:text-ink transition-colors inline-flex items-center gap-1 mb-6">
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back to Personas
        </Link>

        {loading && (
          <div className="flex items-center gap-3 text-muted text-sm">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Loading agent data...
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-sm text-primary-active">{error}</div>
        )}

        {data && (
          <div ref={sectionRef} className="space-y-8 max-w-5xl">
            {/* ── Profile Header ── */}
            <div ref={headerRef} className="flex items-start gap-6 flex-wrap">
              <div data-anim="fade" className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-canvas text-3xl font-bold font-serif-title">
                  {profile?.name ? (profile.name as string).charAt(0) : "?"}
                </span>
              </div>
              <div data-anim="fade" className="flex-1 min-w-0">
                <h1 className="font-display text-4xl font-semibold tracking-display">
                  {profile?.name as string}
                </h1>
                <p className="text-muted mt-1">{profile?.role as string}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {data.stats.stances.map((s) => (
                    <span key={s} className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium capitalize">{s}</span>
                  ))}
                  {(profile?.tags as string[])?.map((t: string) => (
                    <span key={t} className="rounded-full bg-surface-card border border-hairline px-3 py-1 text-xs font-medium">{t}</span>
                  ))}
                </div>
              </div>
              <div ref={statsRef} className="grid grid-cols-3 gap-4 text-center">
                <div data-anim="stat" className="rounded-xl bg-surface-card border border-hairline p-4 min-w-[100px]">
                  <p ref={simCountRef} className="font-display text-2xl font-semibold">{data.stats.total_simulations}</p>
                  <p className="text-xs text-muted mt-1">Simulations</p>
                </div>
                <div data-anim="stat" className="rounded-xl bg-surface-card border border-hairline p-4">
                  <p ref={turnCountRef} className="font-display text-2xl font-semibold">{data.stats.total_turns}</p>
                  <p className="text-xs text-muted mt-1">Total Turns</p>
                </div>
                <div data-anim="stat" className="rounded-xl bg-surface-card border border-hairline p-4">
                  <p ref={memCountRef} className="font-display text-2xl font-semibold">{data.stats.total_memories}</p>
                  <p className="text-xs text-muted mt-1">Memories</p>
                </div>
              </div>
            </div>

            {/* ── Personality ── */}
            {Object.keys(personality).length > 0 && (
              <section ref={personalityRef} className="rounded-xl bg-surface-card border border-hairline p-6">
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-4">Personality Profile</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Object.entries(personality).map(([trait, val]) => (
                    <div key={trait}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted capitalize">{trait}</span>
                        <span className="font-mono text-xs">{val as number}</span>
                      </div>
                      <div className="h-2 rounded-full bg-ink/10">
                        <div data-anim="pbar" className="h-2 rounded-full bg-primary" style={{ width: `${val as number}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Backstory ── */}
            {(profile?.backstory || profile?.hidden_agenda) && (
              <section className="rounded-xl bg-surface-card border border-hairline p-6 space-y-3">
                {profile?.backstory && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-1">Backstory</h3>
                    <p className="text-sm text-ink leading-relaxed">{profile?.backstory as string}</p>
                  </div>
                )}
                {profile?.hidden_agenda && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-1">Hidden Agenda</h3>
                    <p className="text-sm italic text-primary leading-relaxed">{profile?.hidden_agenda as string}</p>
                  </div>
                )}
              </section>
            )}

            {/* ── Simulation History ── */}
            <section ref={historyRef}>
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-4">
                Simulation History ({data.simulations.length})
              </h3>
              {data.simulations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-hairline bg-surface-card/50 p-8 text-center">
                  <p className="text-sm text-muted">This agent hasn't participated in any simulations yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.simulations.map((sim: any) => (
                    <Link key={sim.id} href={`/simulate/${sim.id}`}
                      data-anim="hcard"
                      className="block rounded-xl border border-hairline bg-surface-card p-4 hover:border-primary/30 transition">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full ${
                            sim.status === "complete" ? "bg-green-500" : sim.status === "running" ? "bg-accent-amber" : "bg-muted"
                          }`} />
                          <span className="font-semibold">{sim.subject_name}</span>
                          <span className="text-xs text-muted capitalize">{sim.stance}</span>
                        </div>
                        <div className="flex gap-4 text-xs text-muted">
                          <span>{sim.turn_count} turns</span>
                          <span>{sim.voltage}v</span>
                          <span className="capitalize">{sim.status}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* ── Goals & Strategy ── */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-4">Goals & Strategy</h3>
              {data.goals.length === 0 && data.strategies.length === 0 && data.hidden_motive_scores.length === 0 ? (
                <div className="rounded-xl border border-dashed border-hairline bg-surface-card/50 p-8 text-center">
                  <p className="text-sm text-muted">No goal data yet.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {data.goals.length > 0 && (
                    <div className="rounded-xl bg-surface-card border border-hairline p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Active Goals</h4>
                      <div className="space-y-3">
                        {data.goals.map((g: any) => (
                          <div key={g.id}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-ink">{g.goal_text}</span>
                              <span className="font-mono text-xs text-muted">p{g.priority.toFixed(1)}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-ink/10">
                              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(g.priority / 5) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.strategies.length > 0 && (
                    <div className="rounded-xl bg-surface-card border border-hairline p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Strategy Hints</h4>
                      <div className="space-y-3">
                        {data.strategies.map((st: any) => (
                          <details key={st.simulation_id} className="group">
                            <summary className="cursor-pointer text-sm font-medium text-ink hover:text-primary transition-colors">
                              {st.subject_name}
                              <span className="text-xs text-muted ml-2">({st.strategy_hints.length} hints)</span>
                            </summary>
                            <div className="mt-2 space-y-1 pl-2 border-l-2 border-hairline">
                              {st.strategy_hints.map((h: any, i: number) => (
                                <p key={i} className="text-xs text-muted leading-relaxed">
                                  <span className="font-mono text-primary">T{h.turn_index}:</span> {h.hint}
                                </p>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.hidden_motive_scores.length > 0 && (
                    <div className="rounded-xl bg-surface-card border border-hairline p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Hidden Motive Detection</h4>
                      <div className="space-y-2">
                        {data.hidden_motive_scores.map((hm: any) => (
                          <div key={hm.simulation_id} className="flex items-center justify-between text-sm">
                            <span className="text-ink">{hm.subject_name}</span>
                            <span className={`font-mono text-xs px-2 py-0.5 rounded-full ${
                              hm.consistency_score > 0.5 ? "bg-primary/10 text-primary" : "bg-accent-teal/10 text-accent-teal"
                            }`}>
                              {hm.consistency_score.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ── Semantic Memories ── */}
            <section ref={memoriesRef}>
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-4">
                Semantic Memories ({data.memories.length})
              </h3>
              {data.memories.length === 0 ? (
                <div className="rounded-xl border border-dashed border-hairline bg-surface-card/50 p-8 text-center">
                  <p className="text-sm text-muted">No semantic memories extracted yet. Position, concession, and red-line data will appear here after simulations.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.memories.map((mem: any, i: number) => (
                    <div key={i} data-anim="mcard" className="rounded-xl border border-hairline bg-surface-card p-4 flex items-start gap-3">
                      <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                        mem.memory_type === "position" ? "bg-accent-teal" :
                        mem.memory_type === "red_line" ? "bg-primary" :
                        mem.memory_type === "concession" ? "bg-accent-amber" : "bg-muted"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold uppercase tracking-wider capitalize">{mem.memory_type}</span>
                          <span className="text-xs text-muted">{mem.subject_name}</span>
                          {mem.turn_index !== null && <span className="text-xs text-muted font-mono">T{mem.turn_index}</span>}
                        </div>
                        <p className="text-sm text-ink leading-relaxed">{mem.content.slice(0, 200)}{mem.content.length > 200 ? "…" : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Recent Turns ── */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-4">
                Recent Activity ({data.recent_turns.length} turns)
              </h3>
              {data.recent_turns.length === 0 ? (
                <div className="rounded-xl border border-dashed border-hairline bg-surface-card/50 p-8 text-center">
                  <p className="text-sm text-muted">No turns recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.recent_turns.map((t: any, i: number) => (
                    <div key={i} className="rounded-xl border border-hairline bg-surface-card p-4">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{t.subject_name}</span>
                        <span className="font-mono text-xs text-muted">T{t.turn_index}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-ink/10 capitalize">{t.action_type}</span>
                      </div>
                      <p className="text-sm text-ink leading-relaxed">{t.content.slice(0, 300)}{t.content.length > 300 ? "…" : ""}</p>
                      {t.internal_reasoning && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted">Reasoning</summary>
                          <p className="mt-1 text-xs italic text-muted">{t.internal_reasoning}</p>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Emotional Arc ── */}
            {data.emotional_arc.length > 0 && (
              <section className="rounded-xl bg-surface-card border border-hairline p-6">
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-4">Emotional Arc</h3>
                <div className="overflow-x-auto">
                  <div className="flex gap-[2px] min-w-[300px]" style={{ height: 120 }}>
                    {data.emotional_arc.map((point: any, i: number) => {
                      const confidence = point.confidence ?? 0.5;
                      const h = confidence * 100;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end">
                          <div
                            className="w-full rounded-t-sm transition-all"
                            style={{
                              height: `${h}%`,
                              background: confidence > 0.6 ? "var(--color-accent-teal)" : confidence > 0.3 ? "var(--color-accent-amber)" : "var(--color-primary)",
                              opacity: 0.7,
                            }}
                            title={`T${point.turn_index}: confidence ${(confidence * 100).toFixed(0)}%`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted mt-2">
                  <span>T{String(data.emotional_arc[0]?.turn_index ?? 0)}</span>
                  <span className="text-muted">Confidence over time</span>
                  <span>T{String(data.emotional_arc[data.emotional_arc.length - 1]?.turn_index ?? 0)}</span>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
