"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { ExpandableText } from "@/components/ExpandableText";
import {
  fetchAgentDetail,
  fetchPersonaResearch,
  fetchPersonaResearchConfig,
  triggerPersonaResearch,
  listPersonaDocuments,
  deletePersonaDocument,
  queryPersonaKnowledge,
  fetchPendingEvolutions,
  approveEvolution,
  rejectEvolution,
  fetchEvolutionHistory,
  type AgentDetailResponse,
  type PersonaResearchEntry,
} from "@/lib/api";
import type { DocumentMeta, EvolutionProposal, KnowledgeQueryResult } from "@/lib/types";

type PageProps = { params: Promise<{ slug: string }> };

export default function AgentDetailPage({ params }: PageProps) {
  const { slug } = use(params);
  const [data, setData] = useState<AgentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [researchHistory, setResearchHistory] = useState<PersonaResearchEntry[]>([]);
  const [researchTopic, setResearchTopic] = useState("");
  const [researchRunning, setResearchRunning] = useState(false);
  const [tavilyConfigured, setTavilyConfigured] = useState(false);
  const [researchLoading, setResearchLoading] = useState(false);

  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeResults, setKnowledgeResults] = useState<KnowledgeQueryResult | null>(null);
  const [knowledgeSearching, setKnowledgeSearching] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");

  const [pendingEvolutions, setPendingEvolutions] = useState<EvolutionProposal[]>([]);
  const [evolutionHistory, setEvolutionHistory] = useState<EvolutionProposal[]>([]);
  const [evolutionsLoading, setEvolutionsLoading] = useState(false);
  const [evolutionActionLoading, setEvolutionActionLoading] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchAgentDetail(slug)
      .then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Failed to load agent"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (!data?.profile?.id) return;
    const pid = data.profile.id as string;
    let alive = true;
    setResearchLoading(true);
    Promise.all([
      fetchPersonaResearchConfig(pid),
      fetchPersonaResearch(pid),
    ]).then(([cfg, history]) => {
      if (!alive) return;
      setTavilyConfigured(cfg.tavily_configured);
      setResearchHistory(history);
    }).catch(() => {})
    .finally(() => { if (alive) setResearchLoading(false); });
    return () => { alive = false; };
  }, [data?.profile?.id]);

  useEffect(() => {
    if (!data?.profile?.id) return;
    const pid = data.profile.id as string;
    let alive = true;
    setDocumentsLoading(true);
    listPersonaDocuments(pid).then((docs) => {
      if (alive) setDocuments(docs);
    }).catch(() => {})
    .finally(() => { if (alive) setDocumentsLoading(false); });
    return () => { alive = false; };
  }, [data?.profile?.id]);

  useEffect(() => {
    if (!data?.profile?.id) return;
    const pid = data.profile.id as string;
    let alive = true;
    setEvolutionsLoading(true);
    Promise.all([
      fetchPendingEvolutions(pid).catch(() => [] as EvolutionProposal[]),
      fetchEvolutionHistory(pid).catch(() => [] as EvolutionProposal[]),
    ]).then(([pending, history]) => {
      if (!alive) return;
      setPendingEvolutions(pending);
      setEvolutionHistory(history);
    }).finally(() => {
      if (alive) setEvolutionsLoading(false);
    });
    return () => { alive = false; };
  }, [data?.profile?.id]);

  const profile = data?.profile as Record<string, any> | undefined;
  const personality = profile?.personality
    ? typeof profile.personality === "string" ? JSON.parse(profile.personality) : profile.personality
    : {};

  const handleRunResearch = async () => {
    const pid = data?.profile?.id as string;
    if (!pid || researchRunning) return;
    setResearchRunning(true);
    try {
      await triggerPersonaResearch(pid, researchTopic || undefined);
      setResearchTopic("");
      setTimeout(async () => {
        const updated = await fetchPersonaResearch(pid);
        setResearchHistory(updated);
        setResearchRunning(false);
      }, 1500);
    } catch {
      setResearchRunning(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    const pid = data?.profile?.id as string;
    if (!pid) return;
    try {
      await deletePersonaDocument(pid, docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch { /* ignore */ }
  };

  const handleKnowledgeSearch = async () => {
    const pid = data?.profile?.id as string;
    if (!pid || !knowledgeQuery.trim() || knowledgeSearching) return;
    setKnowledgeSearching(true);
    setKnowledgeError("");
    setKnowledgeResults(null);
    try {
      const res = await queryPersonaKnowledge(pid, knowledgeQuery.trim());
      setKnowledgeResults(res);
    } catch {
      setKnowledgeError("Search failed. Try again.");
    } finally {
      setKnowledgeSearching(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const traitColors: Record<string, string> = {
    aggressiveness: "#ef4444",
    empathy: "var(--color-accent-teal)",
    stubbornness: "#6366f1",
    verbosity: "var(--color-accent-amber)",
  };
  const allTraits = ["aggressiveness", "empathy", "stubbornness", "verbosity"];
  const trendData = (() => {
    const sorted = [...evolutionHistory]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return sorted.map((evo) => {
      const snap: Record<string, number> = (() => { try { return JSON.parse(evo.before_snapshot); } catch { return {}; } })();
      return {
        dateLabel: new Date(evo.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        aggressiveness: snap.aggressiveness ?? 50,
        empathy: snap.empathy ?? 50,
        stubbornness: snap.stubbornness ?? 50,
        verbosity: snap.verbosity ?? 50,
      };
    });
  })();

  // GSAP entrance animations removed

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
            <div className="space-y-8 max-w-5xl">
            {/* ── Profile Header ── */}
            <div className="flex items-start gap-6 flex-wrap">
              <div  className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-canvas text-3xl font-bold font-serif-title">
                  {profile?.name ? (profile.name as string).charAt(0) : "?"}
                </span>
              </div>
              <div  className="flex-1 min-w-0">
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
              <div className="grid grid-cols-3 gap-4 text-center">
                <div  className="rounded-xl bg-surface-card border border-hairline p-4 min-w-[100px]">
                  <p className="font-display text-2xl font-semibold">{data.stats.total_simulations}</p>
                  <p className="text-xs text-muted mt-1">Simulations</p>
                </div>
                <div  className="rounded-xl bg-surface-card border border-hairline p-4">
                  <p className="font-display text-2xl font-semibold">{data.stats.total_turns}</p>
                  <p className="text-xs text-muted mt-1">Total Turns</p>
                </div>
                <div  className="rounded-xl bg-surface-card border border-hairline p-4">
                  <p className="font-display text-2xl font-semibold">{data.stats.total_memories}</p>
                  <p className="text-xs text-muted mt-1">Memories</p>
                </div>
              </div>
            </div>

            {/* ── Personality ── */}
            {Object.keys(personality).length > 0 && (
              <section className="rounded-xl bg-surface-card border border-hairline p-6">
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-4">Personality Profile</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Object.entries(personality).map(([trait, val]) => (
                    <div key={trait}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted capitalize">{trait}</span>
                        <span className="font-mono text-xs">{val as number}</span>
                      </div>
                      <div className="h-2 rounded-full bg-ink/10">
                        <div  className="h-2 rounded-full bg-primary" style={{ width: `${val as number}%` }} />
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

            {/* ── Pending Evolution ── */}
            {evolutionsLoading ? (
              <div className="flex items-center gap-3 text-muted text-sm">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Loading evolutions...
              </div>
            ) : pendingEvolutions.length > 0 ? (
              <section className="rounded-xl border-2 border-accent-amber/40 bg-accent-amber/5 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent-amber animate-pulse" />
                  <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-accent-amber">
                    Pending Evolution
                  </h3>
                </div>
                <div className="space-y-4">
                  {pendingEvolutions.map((evo) => {
                    const deltas: Record<string, number> = (() => {
                      try { return JSON.parse(evo.proposed_deltas); } catch { return {}; }
                    })();
                    const before: Record<string, number> = (() => {
                      try { return JSON.parse(evo.before_snapshot); } catch { return {}; }
                    })();
                    const after: Record<string, number> = {};
                    for (const trait of Object.keys({ ...before, ...deltas })) {
                      after[trait] = Math.max(0, Math.min(100, (before[trait] ?? 50) + (deltas[trait] ?? 0)));
                    }
                    const allTraits = ["aggressiveness", "empathy", "stubbornness", "verbosity"];
                    return (
                      <div key={evo.id} className="rounded-xl bg-surface-card border border-hairline p-4">
                        <p className="text-xs text-muted mb-3">
                          From simulation <span className="font-mono text-primary">{evo.simulation_id.slice(0, 8)}</span>
                          {" · "}{new Date(evo.created_at).toLocaleDateString()}
                        </p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
                          {allTraits.map((trait) => {
                            const b = before[trait] ?? 50;
                            const a = after[trait] ?? 50;
                            const delta = a - b;
                            if (delta === 0) return null;
                            return (
                              <div key={trait}>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="capitalize text-muted">{trait}</span>
                                  <span className="font-mono">
                                    <span className="text-muted">{b}</span>
                                    <span className={delta > 0 ? "text-accent-teal ml-1" : "text-primary ml-1"}>
                                      {delta > 0 ? `+${delta}` : delta}
                                    </span>
                                    <span className="text-muted ml-1">→ {a}</span>
                                  </span>
                                </div>
                                <div className="relative h-2 rounded-full bg-ink/10">
                                  <div
                                    className="absolute h-2 rounded-full opacity-60"
                                    style={{ width: `${b}%`, background: "var(--color-ink)" }}
                                  />
                                  <div
                                    className="absolute h-2 rounded-full opacity-30"
                                    style={{ width: `${a}%`, background: delta > 0 ? "var(--color-accent-teal)" : "var(--color-primary)" }}
                                  />
                                  <div
                                    className="absolute h-2 rounded-full border-2 transition-all"
                                    style={{
                                      left: `${Math.min(b, a)}%`,
                                      width: `${Math.abs(delta)}%`,
                                      borderColor: delta > 0 ? "var(--color-accent-teal)" : "var(--color-primary)",
                                      background: delta > 0 ? "var(--color-accent-teal)" : "var(--color-primary)",
                                      opacity: 0.5,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={async () => {
                              setEvolutionActionLoading(evo.id);
                              try {
                                await approveEvolution(evo.id);
                                setPendingEvolutions((prev) => prev.filter((e) => e.id !== evo.id));
                                const history = await fetchEvolutionHistory(evo.persona_id);
                                setEvolutionHistory(history);
                              } catch { /* ignore */ }
                              finally { setEvolutionActionLoading(null); }
                            }}
                            disabled={evolutionActionLoading === evo.id}
                            className="flex-1 rounded-lg bg-accent-teal px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 transition-opacity disabled:opacity-40"
                          >
                            {evolutionActionLoading === evo.id ? (
                              <span className="flex items-center justify-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-canvas animate-pulse" />
                                Approving...
                              </span>
                            ) : "Approve"}
                          </button>
                          <button
                            onClick={async () => {
                              setEvolutionActionLoading(evo.id);
                              try {
                                await rejectEvolution(evo.id);
                                setPendingEvolutions((prev) => prev.filter((e) => e.id !== evo.id));
                              } catch { /* ignore */ }
                              finally { setEvolutionActionLoading(null); }
                            }}
                            disabled={evolutionActionLoading === evo.id}
                            className="flex-1 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* ── Evolution Timeline ── */}
            {evolutionHistory.length === 0 && pendingEvolutions.length === 0 ? (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-4">
                  Evolution Timeline
                </h3>
                <div className="rounded-xl border border-dashed border-hairline bg-surface-card/50 p-8 text-center">
                  <p className="text-sm text-muted">No evolutions yet.</p>
                </div>
              </section>
            ) : evolutionHistory.length > 0 ? (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-4">
                  Evolution Timeline ({evolutionHistory.length})
                </h3>
                <div className="space-y-4">
                  {/* ── Personality Trend Chart ── */}
                  {trendData.length >= 2 && (
                    <div className="rounded-xl border border-hairline bg-surface-card p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Personality Trend</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={trendData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" />
                          <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={{ stroke: "var(--color-hairline)" }} tickLine={false} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ background: "var(--color-surface-card)", border: "1px solid var(--color-hairline)", borderRadius: 8, fontSize: 12 }}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                          {allTraits.map((trait) => (
                            <Line key={trait} type="monotone" dataKey={trait} stroke={traitColors[trait]} strokeWidth={2} dot={{ r: 3, fill: traitColors[trait] }} activeDot={{ r: 5 }} name={trait.charAt(0).toUpperCase() + trait.slice(1)} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* ── Timeline Entries ── */}
                  <div className="space-y-2">
                    {[...evolutionHistory]
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((evo) => {
                        const deltas: Record<string, number> = (() => {
                          try { return JSON.parse(evo.proposed_deltas); } catch { return {}; }
                        })();
                        const before: Record<string, number> = (() => {
                          try { return JSON.parse(evo.before_snapshot); } catch { return {}; }
                        })();
                        const after: Record<string, number> = {};
                        for (const trait of allTraits) {
                          after[trait] = Math.max(0, Math.min(100, (before[trait] ?? 50) + (deltas[trait] ?? 0)));
                        }
                        const statusColors: Record<string, string> = {
                          approved: "bg-accent-teal/10 text-accent-teal",
                          rejected: "bg-primary/10 text-primary",
                          pending: "bg-accent-amber/10 text-accent-amber",
                        };
                        const isApproved = evo.status === "approved";
                        const hasDeltas = allTraits.some((t) => deltas[t] !== 0);
                        return (
                          <div key={evo.id} className="rounded-xl border border-hairline bg-surface-card p-4">
                            <div className="flex items-center gap-3 mb-3">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${evo.status === "approved" ? "bg-accent-teal" : evo.status === "rejected" ? "bg-primary" : "bg-accent-amber"}`} />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-ink">
                                  Simulation <span className="font-mono">{evo.simulation_id.slice(0, 8)}</span>
                                </span>
                                <span className="text-xs text-muted ml-2">{new Date(evo.created_at).toLocaleDateString()}</span>
                              </div>
                              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${statusColors[evo.status] ?? "bg-muted/10 text-muted"}`}>
                                {evo.status}
                              </span>
                            </div>

                            {isApproved && hasDeltas ? (
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                {allTraits.map((trait) => {
                                  const b = before[trait] ?? 50;
                                  const a = after[trait] ?? 50;
                                  const delta = a - b;
                                  if (delta === 0) return null;
                                  return (
                                    <div key={trait}>
                                      <div className="flex justify-between text-xs mb-1">
                                        <span className="capitalize text-muted">{trait}</span>
                                        <span className="font-mono">
                                          <span className="text-muted">{b}</span>
                                          <span className={delta > 0 ? "text-accent-teal ml-1" : "text-primary ml-1"}>
                                            {delta > 0 ? `+${delta}` : delta}
                                          </span>
                                          <span className="text-muted ml-1">→ {a}</span>
                                        </span>
                                      </div>
                                      <div className="relative h-2 rounded-full bg-ink/10">
                                        <div className="absolute h-2 rounded-full opacity-60" style={{ width: `${b}%`, background: "var(--color-ink)" }} />
                                        <div className="absolute h-2 rounded-full opacity-30" style={{ width: `${a}%`, background: delta > 0 ? "var(--color-accent-teal)" : "var(--color-primary)" }} />
                                        <div className="absolute h-2 rounded-full border-2 transition-all" style={{ left: `${Math.min(b, a)}%`, width: `${Math.abs(delta)}%`, borderColor: delta > 0 ? "var(--color-accent-teal)" : "var(--color-primary)", background: delta > 0 ? "var(--color-accent-teal)" : "var(--color-primary)", opacity: 0.5 }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                                {hasDeltas ? allTraits.map((trait) => {
                                  const d = deltas[trait] ?? 0;
                                  if (d === 0) return null;
                                  return (
                                    <span key={trait} className="capitalize">
                                      {trait}: <span className={d > 0 ? "text-accent-teal" : "text-primary"}>{d > 0 ? `+${d}` : d}</span>
                                    </span>
                                  );
                                }) : <span className="italic">No personality changes proposed</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </section>
            ) : null}

            {/* ── Simulation History ── */}
            <section>
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
                              <span className="text-ink"><ExpandableText text={g.goal_text} limit={150} /></span>
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
            <section>
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
                    <div key={i}  className="rounded-xl border border-hairline bg-surface-card p-4 flex items-start gap-3">
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
                        <p className="text-sm text-ink leading-relaxed"><ExpandableText text={mem.content} limit={200} /></p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Research ── */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-4">
                Web Research ({researchHistory.length})
              </h3>
              <div className="rounded-xl bg-surface-card border border-hairline p-4 mb-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={researchTopic}
                    onChange={(e) => setResearchTopic(e.target.value)}
                    placeholder={tavilyConfigured ? "Research topic (e.g. 'AI regulation trends 2025')..." : "Tavily API key not configured"}
                    disabled={!tavilyConfigured || researchRunning}
                    className="flex-1 rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-primary disabled:opacity-40"
                    onKeyDown={(e) => { if (e.key === "Enter") handleRunResearch(); }}
                  />
                  <button
                    onClick={handleRunResearch}
                    disabled={!tavilyConfigured || researchRunning}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    {researchRunning ? (
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-canvas animate-pulse" />
                        Running
                      </span>
                    ) : "Run Research"}
                  </button>
                </div>
                {!tavilyConfigured && (
                  <p className="text-xs text-muted mt-2">Set TAVILY_API_KEY in backend .env to enable web research.</p>
                )}
              </div>
              {researchLoading && (
                <div className="flex items-center gap-3 text-muted text-sm mb-4">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  Loading research history...
                </div>
              )}
              {researchHistory.length === 0 && !researchLoading ? (
                <div className="rounded-xl border border-dashed border-hairline bg-surface-card/50 p-8 text-center">
                  <p className="text-sm text-muted">No research entries yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {researchHistory.map((entry) => {
                    let results: Array<{ title?: string; url?: string; content?: string }> = [];
                    try {
                      const parsed = JSON.parse(entry.results);
                      results = Array.isArray(parsed) ? parsed : [];
                    } catch { /* empty */ }
                    return (
                      <details key={entry.id} className="group rounded-xl border border-hairline bg-surface-card overflow-hidden">
                        <summary className="cursor-pointer px-4 py-3 hover:bg-primary/5 transition-colors flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-ink">{entry.query}</span>
                            <span className="text-xs text-muted ml-3">{new Date(entry.created_at).toLocaleDateString()}</span>
                          </div>
                          <span className="text-xs text-muted shrink-0 ml-2">{results.length} sources</span>
                        </summary>
                        <div className="px-4 pb-3 space-y-2 border-t border-hairline pt-2">
                          {results.length === 0 && (
                            <p className="text-xs text-muted italic">Research in progress or no results found.</p>
                          )}
                          {results.map((r, i) => (
                            <div key={i} className="rounded-lg bg-canvas p-3 text-sm">
                              <a
                                href={r.url ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-primary hover:underline"
                              >
                                {r.title ?? `Source ${i + 1}`}
                              </a>
                              {r.content && (
                                <p className="text-xs text-muted mt-1 leading-relaxed"><ExpandableText text={r.content} limit={160} /></p>
                              )}
                              {r.url && (
                                <p className="text-[11px] text-muted/60 mt-1 truncate font-mono">{r.url}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Knowledge Base ── */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted mb-4">
                Knowledge Base ({documents.length} documents
                {knowledgeResults?.results ? ` · ${knowledgeResults.results.length} chunks` : ""})
              </h3>

              <div className="rounded-xl bg-surface-card border border-hairline p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Uploaded Documents</h4>
                  {documents.length > 0 && (
                    <span className="text-xs text-muted font-mono">
                      {documents.reduce((acc, d) => acc + d.size_bytes, 0) > 0
                        ? `${formatSize(documents.reduce((acc, d) => acc + d.size_bytes, 0))} total`
                        : ""}
                    </span>
                  )}
                </div>
                {documentsLoading ? (
                  <div className="flex items-center gap-3 text-muted text-sm py-4">
                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    Loading documents...
                  </div>
                ) : documents.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-hairline bg-canvas/50 p-6 text-center">
                    <p className="text-sm text-muted">No documents uploaded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2 text-sm">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="material-symbols-outlined text-[16px] text-muted shrink-0">description</span>
                          <span className="truncate text-ink font-medium">{doc.filename}</span>
                          <span className="text-xs text-muted shrink-0 font-mono">{formatSize(doc.size_bytes)}</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize ${
                            doc.status === "ready" ? "bg-accent-teal/10 text-accent-teal" :
                            doc.status === "failed" ? "bg-primary/10 text-primary" :
                            "bg-accent-amber/10 text-accent-amber"
                          }`}>{doc.status}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-muted">{new Date(doc.created_at).toLocaleDateString()}</span>
                          <button
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="text-muted hover:text-primary transition-colors p-1"
                            title="Delete document"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-surface-card border border-hairline p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Knowledge Search</h4>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={knowledgeQuery}
                    onChange={(e) => setKnowledgeQuery(e.target.value)}
                    placeholder="Search uploaded documents..."
                    className="flex-1 rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-primary"
                    onKeyDown={(e) => { if (e.key === "Enter") handleKnowledgeSearch(); }}
                  />
                  <button
                    onClick={handleKnowledgeSearch}
                    disabled={knowledgeSearching || !knowledgeQuery.trim()}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    {knowledgeSearching ? (
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-canvas animate-pulse" />
                        Searching
                      </span>
                    ) : "Search"}
                  </button>
                </div>

                {knowledgeError && (
                  <p className="text-xs text-primary mt-2">{knowledgeError}</p>
                )}

                {knowledgeResults && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs text-muted">
                      Top {knowledgeResults.results.length} matching chunk{knowledgeResults.results.length !== 1 ? "s" : ""}
                    </p>
                    {knowledgeResults.results.map((chunk: { chunk_id: string; text: string; score: number; metadata: any }) => (
                      <div key={chunk.chunk_id} className="rounded-lg bg-canvas p-3 border border-hairline/50">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 h-1.5 rounded-full bg-ink/10">
                            <div
                              className="h-1.5 rounded-full bg-accent-teal"
                              style={{ width: `${Math.round(chunk.score * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-muted shrink-0">{Math.round(chunk.score * 100)}%</span>
                        </div>
                        <p className="text-sm text-ink leading-relaxed">{chunk.text}</p>
                        {chunk.metadata?.source && (
                          <p className="text-[11px] text-muted/60 mt-1 truncate font-mono">{chunk.metadata.source}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                      <p className="text-sm text-ink leading-relaxed"><ExpandableText text={t.content} limit={300} /></p>
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
