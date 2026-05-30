"use client";

import { use, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { ExpandableText } from "@/components/ExpandableText";
import { fetchPostmortem } from "@/lib/api";
import type { AlignmentDelta, Postmortem, StrategyCard, TopologyNode } from "@/lib/types";

type PageProps = { params: Promise<{ id: string }> };

const RISK_STYLE: Record<string, string> = {
  LOW: "bg-green-500/15 text-green-700",
  MEDIUM: "bg-accent-amber/15 text-amber-700",
  HIGH: "bg-primary/15 text-primary-active",
};

export default function PostmortemPage({ params }: PageProps) {
  const { id } = use(params);

  const [postmortem, setPostmortem] = useState<Postmortem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchPostmortem(id)
      .then((data) => { if (alive) setPostmortem(data); })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Failed to generate postmortem.");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  return (
    <AppShell activeTab="War Room">
      <div className="px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary mb-1">
            Simulation · {id.slice(0, 8)}
          </p>
          <h2 className="font-display text-5xl font-normal tracking-display text-ink">
            Post-Mortem Analysis
          </h2>
          <p className="mt-2 text-sm text-muted">
            AI-generated negotiation debrief — strategy cards, alignment deltas, and risk zones.
          </p>
        </div>
        <Button variant="ghost" onClick={() => window.history.back()}>
          ← Back to War Room
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-muted text-sm">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          Generating postmortem analysis...
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-primary/10 p-4 text-sm text-primary-active">{error}</div>
      )}

      {postmortem && (
        <div className="space-y-6">
          {postmortem.mocked && (
            <div className="rounded-xl bg-accent-amber/10 px-4 py-3 text-xs text-amber-700">
              Running in mock mode — set <code className="font-mono">OPENROUTER_API_KEY</code> for AI-generated analysis.
            </div>
          )}

          {/* Score row */}
          <div className="grid gap-3 sm:grid-cols-3">
            <ScoreCard label="Confidence Score" value={`${postmortem.confidence_score}%`} />
            <ScoreCard
              label="Confidence Trend"
              value={`${postmortem.confidence_trend >= 0 ? "+" : ""}${postmortem.confidence_trend}`}
              positive={postmortem.confidence_trend >= 0}
            />
            <ScoreCard label="Consensus Rating" value={`${postmortem.consensus_rating}%`} />
          </div>

          {postmortem.unanticipated_note && (
            <div className="rounded-xl bg-surface-card p-5">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Unanticipated Dynamics
              </p>
              <p className="text-sm text-ink leading-relaxed">{postmortem.unanticipated_note}</p>
            </div>
          )}

          {/* Alignment deltas */}
          {postmortem.alignment_deltas?.length > 0 && (
            <section className="rounded-xl bg-surface-dark p-5 text-canvas">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-canvas/75 mb-4">
                Stakeholder Alignment Delta
              </h3>
              <div className="space-y-3">
                {postmortem.alignment_deltas.map((ad: AlignmentDelta) => (
                  <div key={ad.stakeholder_id} className="flex items-center gap-4">
                    <span className="w-36 shrink-0 text-sm font-medium text-canvas/80 truncate">
                      {ad.name}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-canvas/10">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          ad.delta >= 0 ? "bg-accent-teal" : "bg-primary"
                        }`}
                        style={{ width: `${Math.min(100, Math.abs(ad.delta))}%` }}
                      />
                    </div>
                    <span
                      className={`w-10 text-right text-sm font-semibold ${
                        ad.delta >= 0 ? "text-accent-teal" : "text-primary"
                      }`}
                    >
                      {ad.delta >= 0 ? "+" : ""}{ad.delta}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Objection topology */}
          {postmortem.objection_topology && postmortem.objection_topology.length > 0 && (
            <section className="rounded-xl bg-surface-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">
                Objection Topology
              </h3>
              <div className="space-y-2">
                {postmortem.objection_topology.map((node: TopologyNode) => (
                  <div key={node.id} className="flex items-start gap-3 text-sm">
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        node.kind === "root"
                          ? "bg-ink"
                          : node.kind === "resolution"
                          ? "bg-accent-teal"
                          : "bg-primary"
                      }`}
                    />
                    <span className="text-ink leading-relaxed">{node.label}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Strategy cards */}
          {postmortem.strategy_cards?.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">
                Meeting Strategy Guide — {postmortem.strategy_cards.length} Patterns
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {postmortem.strategy_cards.map((card: StrategyCard) => (
                  <article key={card.objection} className="rounded-xl bg-surface-card border border-hairline p-5">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
                      The Objection
                    </p>
                    <p className="text-sm font-medium italic text-ink leading-snug mb-4">
                      &ldquo;{card.objection}&rdquo;
                    </p>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
                      The Counter
                    </p>
                    <p className="text-sm text-muted leading-relaxed mb-4">{card.counter}</p>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                        RISK_STYLE[card.risk] ?? "bg-ink/10 text-muted"
                      }`}
                    >
                      {card.risk} Risk
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              1.  Executive Summary — verdict + end_reason banner
             ═══════════════════════════════════════════════════════════════ */}
          {(postmortem.summary || postmortem.verdict || postmortem.end_reason) && (
            <section className="rounded-xl bg-surface-dark p-6 text-canvas">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-canvas/75 mb-3">
                Executive Summary
              </h3>

              {/* Verdict banner */}
              {postmortem.verdict && (
                <div className={`rounded-lg px-4 py-3 mb-4 text-sm font-semibold ${
                  postmortem.verdict.toLowerCase().includes("deal") ||
                  postmortem.verdict.toLowerCase().includes("agreement")
                    ? "bg-accent-teal/20 text-accent-teal"
                    : postmortem.verdict.toLowerCase().includes("walk")
                    ? "bg-primary/20 text-primary"
                    : "bg-accent-amber/20 text-amber-300"
                }`}>
                  {postmortem.verdict}
                </div>
              )}

              {postmortem.end_reason && (
                <p className="text-xs text-canvas/60 mb-3 font-mono">
                  {postmortem.end_reason}
                </p>
              )}

              {postmortem.summary && (
                <p className="text-sm leading-relaxed text-canvas/85">
                  {postmortem.summary}
                </p>
              )}

              {postmortem.narrative_arc && postmortem.narrative_arc.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {postmortem.narrative_arc.map((phase, i) => (
                    <span key={i} className="rounded-full bg-canvas/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-canvas/70">
                      {phase}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              2.  Termination Details — vote breakdown, judge notes
             ═══════════════════════════════════════════════════════════════ */}
          {postmortem.termination && (
            <section className="rounded-xl bg-surface-card border border-hairline p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">
                Termination Details
              </h3>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
                <div className="rounded-lg bg-ink/5 p-3">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Reason</p>
                  <p className="text-sm text-ink">{postmortem.termination.reason || "—"}</p>
                </div>
                <div className="rounded-lg bg-ink/5 p-3">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Outcome</p>
                  <p className="text-sm text-ink">{postmortem.termination.outcome_type || "—"}</p>
                </div>
                <div className="rounded-lg bg-ink/5 p-3">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Total Turns</p>
                  <p className="text-sm text-ink">{postmortem.termination.total_turns ?? "—"}</p>
                </div>
                <div className="rounded-lg bg-ink/5 p-3">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Walkaway Party</p>
                  <p className="text-sm text-ink">{postmortem.termination.walkaway_party || "—"}</p>
                </div>
              </div>

              {/* Vote breakdown */}
              {postmortem.termination.vote_breakdown && Object.keys(postmortem.termination.vote_breakdown).length > 0 && (
                <div className="mb-4">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Vote Breakdown</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(postmortem.termination.vote_breakdown).map(([agent, vote]) => (
                      <div key={agent} className="flex items-center justify-between rounded-lg bg-ink/5 px-3 py-2 text-sm">
                        <span className="text-ink/80">{agent}</span>
                        <span className={`font-semibold ${
                          String(vote).toLowerCase().includes("yes") || String(vote).toLowerCase().includes("for")
                            ? "text-accent-teal" : "text-primary"
                        }`}>{String(vote)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Judge notes */}
              {postmortem.termination.judge_notes && (
                <div className="rounded-lg bg-primary/5 p-4">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Judge Notes</p>
                  <p className="text-sm text-ink leading-relaxed">{postmortem.termination.judge_notes}</p>
                </div>
              )}

              {/* Agreed issues */}
              {postmortem.termination.agreed_issues && postmortem.termination.agreed_issues.length > 0 && (
                <div className="mt-4">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Agreed Issues</p>
                  <div className="space-y-2">
                    {postmortem.termination.agreed_issues.map((issue, i) => (
                      <div key={i} className="rounded-lg bg-accent-teal/5 px-3 py-2 text-sm text-ink/80">
                        {issue.issue || issue.value || `Issue #${i + 1}`}
                        {issue.parties && <span className="text-muted"> — {issue.parties.join(", ")}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              3.  Topic Summary — positions per stakeholder
             ═══════════════════════════════════════════════════════════════ */}
          {postmortem.topics && postmortem.topics.length > 0 && (
            <section className="rounded-xl bg-surface-card border border-hairline p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">
                Topic Summary — {postmortem.topics.length} topics
                {postmortem.topic_agreement_rate !== undefined && (
                  <span className="ml-2 text-muted/60">
                    ({(postmortem.topic_agreement_rate * 100).toFixed(0)}% agreement)
                  </span>
                )}
              </h3>
              <div className="space-y-4">
                {postmortem.topics.map((topic, i) => {
                  const positions = topic.positions ?? {};
                  return (
                    <div key={i} className="rounded-lg bg-ink/5 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-semibold text-ink">{topic.topic || `Topic ${i + 1}`}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          topic.resolved
                            ? "bg-accent-teal/15 text-accent-teal"
                            : "bg-accent-amber/15 text-amber-700"
                        }`}>
                          {topic.resolved ? "Resolved" : "Open"}
                        </span>
                      </div>

                      {topic.mention_count !== undefined && (
                        <p className="text-xs text-muted mb-2">
                          {topic.mention_count} mentions · Turn {topic.first_raised_turn ?? "?"}–{topic.last_discussed_turn ?? "?"}
                          {topic.proposers && topic.proposers.length > 0 && ` · Proposed by ${topic.proposers.join(", ")}`}
                        </p>
                      )}

                      {/* Positions as map entries */}
                      {Object.keys(positions).length > 0 && (
                        <div>
                          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5">Positions</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(positions).map(([stakeholder, pos]) => (
                              <span key={stakeholder} className="rounded-md bg-canvas/50 px-2.5 py-1 text-xs text-ink/80">
                                <span className="font-medium">{stakeholder}</span>: {pos}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {topic.resolution && (
                        <p className="mt-2 text-xs text-accent-teal">{topic.resolution}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              4.  Stakeholder Reports — position shifts, key arguments
             ═══════════════════════════════════════════════════════════════ */}
          {postmortem.stakeholder_reports && postmortem.stakeholder_reports.length > 0 && (
            <section className="rounded-xl bg-surface-card border border-hairline p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">
                Stakeholder Reports
              </h3>
              <div className="space-y-4">
                {postmortem.stakeholder_reports.map((report, i) => (
                    <div key={report.agent_id ?? i} className="rounded-lg border border-hairline bg-ink/[0.02] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{report.name}</p>
                          <p className="text-xs text-muted">{report.role}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {report.stance && (
                            <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                              {report.stance}
                            </span>
                          )}
                          {report.alignment_delta !== undefined && (
                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              report.alignment_delta >= 0 ? "bg-accent-teal/15 text-accent-teal" : "bg-primary/15 text-primary"
                            }`}>
                              {report.alignment_delta >= 0 ? "+" : ""}{report.alignment_delta}Δ
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Position shifts */}
                      {(report.initial_position || report.final_position) && (
                        <div className="mb-3 grid gap-2 sm:grid-cols-2">
                          {report.initial_position && (
                            <div className="rounded bg-ink/5 px-3 py-2">
                              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-0.5">Initial Position</p>
                              <p className="text-xs text-ink/80">{report.initial_position}</p>
                            </div>
                          )}
                          {report.final_position && (
                            <div className="rounded bg-accent-teal/5 px-3 py-2">
                              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-0.5">Final Position</p>
                              <p className="text-xs text-ink/80">{report.final_position}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Stats row */}
                      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
                        {report.total_turns !== undefined && <span>{report.total_turns} turns</span>}
                        {report.position_shifts !== undefined && <span>{report.position_shifts} shifts</span>}
                        {report.dominant_action && <span>Dominant: {report.dominant_action}</span>}
                        {report.leverage_trajectory && (
                          <span className={report.leverage_trajectory === "falling" ? "text-primary" : report.leverage_trajectory === "rising" ? "text-accent-teal" : ""}>
                            Leverage: {report.leverage_trajectory}
                          </span>
                        )}
                      </div>

                      {/* Key statements */}
                      {report.key_statements && report.key_statements.length > 0 && (
                        <div>
                          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5">Key Statements</p>
                          <div className="space-y-1.5">
                            {report.key_statements.map((stmt, j) => (
                              <p key={j} className="rounded bg-ink/[0.03] px-3 py-1.5 text-xs italic text-ink/70 leading-relaxed">
                                &ldquo;<ExpandableText text={stmt} limit={200} />&rdquo;
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Goals */}
                      {((report.goals_achieved?.length ?? 0) > 0 || (report.goals_unmet?.length ?? 0) > 0) && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {(report.goals_achieved?.length ?? 0) > 0 && (
                            <div>
                              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-teal mb-1">Achieved</p>
                              <ul className="space-y-0.5">
                                {report.goals_achieved!.map((g, j) => (
                                  <li key={j} className="text-xs text-ink/70">✓ {g}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {(report.goals_unmet?.length ?? 0) > 0 && (
                            <div>
                              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">Unmet</p>
                              <ul className="space-y-0.5">
                                {report.goals_unmet!.map((g, j) => (
                                  <li key={j} className="text-xs text-ink/70">✗ {g}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              5.  Key Moments Timeline
             ═══════════════════════════════════════════════════════════════ */}
          {postmortem.key_moments && postmortem.key_moments.length > 0 && (
            <section className="rounded-xl bg-surface-card border border-hairline p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">
                Key Moments — {postmortem.key_moments.length} events
              </h3>
              <div className="relative space-y-0">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-hairline" />
                {postmortem.key_moments.map((moment, i) => {
                  const kind = moment.kind || moment.type || "event";
                  const actors = moment.actors ?? moment.stakeholders ?? [];
                  const style = kind === "walkaway" || kind === "escalation" ? "border-primary/30 bg-primary/5"
                    : kind === "compromise" || kind === "agreement" ? "border-accent-teal/30 bg-accent-teal/5"
                    : kind === "coalition" || kind === "vote" ? "border-accent-amber/30 bg-accent-amber/5"
                    : "border-hairline bg-ink/[0.02]";
                  const dotColor = kind === "walkaway" || kind === "escalation" ? "bg-primary"
                    : kind === "compromise" || kind === "agreement" ? "bg-accent-teal"
                    : kind === "coalition" || kind === "vote" ? "bg-accent-amber"
                    : "bg-muted";
                  return (
                    <div key={i} className={`relative ml-6 rounded-lg border p-3 ${style}`}>
                      {/* Timeline dot */}
                      <div className={`absolute -left-[19px] top-4 h-[14px] w-[14px] rounded-full border-2 border-canvas ${dotColor}`} />
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 font-mono text-[10px] font-semibold text-muted uppercase">
                          T{moment.turn}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-ink uppercase tracking-wider mb-0.5">{kind}</p>
                          <p className="text-xs text-ink/70 leading-relaxed">
                            {moment.description}
                          </p>
                          {moment.impact && (
                            <p className="text-[10px] text-muted mt-1 italic">{moment.impact}</p>
                          )}
                          {actors.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {actors.map((a, j) => (
                                <span key={j} className="rounded-full bg-canvas/50 px-2 py-0.5 text-[10px] text-muted">
                                  {a}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              6.  Social Dynamics — trust/tension summaries
             ═══════════════════════════════════════════════════════════════ */}
          {postmortem.social_dynamics && (
            <section className="rounded-xl bg-surface-card border border-hairline p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">
                Social Dynamics
              </h3>

              {/* Stats grid */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
                {[
                  { label: "Avg Trust", value: postmortem.social_dynamics.avg_trust, pct: true },
                  { label: "Avg Tension", value: postmortem.social_dynamics.avg_tension, pct: true },
                  { label: "Peak Tension", value: postmortem.social_dynamics.peak_tension, pct: true },
                  { label: "Coalitions", value: postmortem.social_dynamics.coalition_count },
                  { label: "Deadlock Episodes", value: postmortem.social_dynamics.deadlock_episodes },
                  { label: "Dominant Agent", value: postmortem.social_dynamics.dominant_agent },
                ].map((stat) => (
                  stat.value !== undefined && stat.value !== null && stat.value !== "" ? (
                    <div key={stat.label} className="rounded-lg bg-ink/5 p-3">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">{stat.label}</p>
                      <p className="text-sm font-semibold text-ink">
                        {typeof stat.value === "number" && stat.pct
                          ? `${(stat.value * 100).toFixed(0)}%`
                          : String(stat.value)}
                      </p>
                    </div>
                  ) : null
                ))}
              </div>

              {/* Trust arc mini-visualization */}
              {postmortem.social_dynamics.trust_arc && postmortem.social_dynamics.trust_arc.length > 0 && (
                <div className="mb-3">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Trust Arc</p>
                  <div className="flex items-end gap-[2px] h-12">
                    {postmortem.social_dynamics.trust_arc.map((pt, i) => {
                      const v = Math.max(2, (pt.value ?? 0.5) * 100);
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t-sm bg-accent-teal/60 hover:bg-accent-teal transition-colors"
                          style={{ height: `${v}%` }}
                          title={`Turn ${pt.turn}: ${(pt.value * 100).toFixed(0)}%`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted mt-1">
                    <span>T{postmortem.social_dynamics.trust_arc[0]?.turn ?? 0}</span>
                    <span>T{postmortem.social_dynamics.trust_arc[postmortem.social_dynamics.trust_arc.length - 1]?.turn ?? ""}</span>
                  </div>
                </div>
              )}

              {/* Tension arc mini-visualization */}
              {postmortem.social_dynamics.tension_arc && postmortem.social_dynamics.tension_arc.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Tension Arc</p>
                  <div className="flex items-end gap-[2px] h-12">
                    {postmortem.social_dynamics.tension_arc.map((pt, i) => {
                      const v = Math.max(2, (pt.value ?? 0.3) * 100);
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t-sm bg-primary/60 hover:bg-primary transition-colors"
                          style={{ height: `${v}%` }}
                          title={`Turn ${pt.turn}: ${(pt.value * 100).toFixed(0)}%`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted mt-1">
                    <span>T{postmortem.social_dynamics.tension_arc[0]?.turn ?? 0}</span>
                    <span>T{postmortem.social_dynamics.tension_arc[postmortem.social_dynamics.tension_arc.length - 1]?.turn ?? ""}</span>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              7.  Lessons Learned
             ═══════════════════════════════════════════════════════════════ */}
          {((postmortem.lessons_learned ?? []).length > 0 || (postmortem.what_could_have_changed?.length ?? 0) > 0) && (
            <section className="rounded-xl bg-surface-card border border-hairline p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">
                Lessons &amp; Counterfactuals
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {(postmortem.lessons_learned?.length ?? 0) > 0 && (
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-teal mb-2">
                      Lessons Learned
                    </p>
                    <ul className="space-y-2">
                      {(postmortem.lessons_learned ?? []).map((lesson, i) => (
                        <li key={i} className="rounded-lg bg-ink/5 px-3 py-2 text-xs text-ink/80 leading-relaxed">
                          {lesson}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(postmortem.what_could_have_changed && postmortem.what_could_have_changed.length > 0) && (
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-amber mb-2">
                      What Could Have Changed
                    </p>
                    <ul className="space-y-2">
                      {postmortem.what_could_have_changed.map((cf, i) => (
                        <li key={i} className="rounded-lg bg-ink/5 px-3 py-2 text-xs text-ink/80 leading-relaxed">
                          {cf}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Vote events sub-section */}
              {postmortem.vote_events && postmortem.vote_events.length > 0 && (
                <div className="mt-4 pt-4 border-t border-hairline">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Vote Events</p>
                  <div className="space-y-2">
                    {postmortem.vote_events.map((ve, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg bg-ink/5 px-3 py-2 text-xs">
                        <span className="shrink-0 font-mono text-muted">T{ve.turn}</span>
                        <span className="font-medium text-ink/80">{ve.agent_id || "—"}</span>
                        <span className="text-muted">{ve.position || "—"}</span>
                        {ve.rationale && <span className="text-ink/60 italic">— {ve.rationale}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Judge events sub-section */}
              {postmortem.judge_events && postmortem.judge_events.length > 0 && (
                <div className="mt-4 pt-4 border-t border-hairline">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Judge Events</p>
                  <div className="space-y-2">
                    {postmortem.judge_events.map((je, i) => (
                        <div key={i} className="rounded-lg bg-primary/5 px-4 py-3">
                          <div className="flex items-center gap-3 text-xs mb-1">
                            <span className="font-mono text-muted">T{je.turn}</span>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                              {je.verdict || "ruling"}
                            </span>
                          </div>
                          {je.reasoning && (
                            <p className="text-xs text-ink/70 leading-relaxed">{je.reasoning}</p>
                          )}
                        </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
      </div>
    </AppShell>
  );
}

function ScoreCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-card border border-hairline p-5">
      <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted mb-2">{label}</p>
      <p
        className={`font-display text-4xl font-normal tracking-display ${
          positive === undefined
            ? "text-ink"
            : positive
            ? "text-accent-teal"
            : "text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
