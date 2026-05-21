"use client";

import { use, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Unanticipated Dynamics
              </p>
              <p className="text-sm text-ink leading-relaxed">{postmortem.unanticipated_note}</p>
            </div>
          )}

          {/* Alignment deltas */}
          {postmortem.alignment_deltas.length > 0 && (
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
          {postmortem.strategy_cards.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">
                Meeting Strategy Guide — {postmortem.strategy_cards.length} Patterns
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {postmortem.strategy_cards.map((card: StrategyCard) => (
                  <article key={card.objection} className="rounded-xl bg-white/60 border border-ink/8 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
                      The Objection
                    </p>
                    <p className="text-sm font-medium italic text-ink leading-snug mb-4">
                      &ldquo;{card.objection}&rdquo;
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
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
    <div className="rounded-xl bg-white/60 border border-ink/8 p-5">
      <p className="text-xs text-muted mb-2">{label}</p>
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
