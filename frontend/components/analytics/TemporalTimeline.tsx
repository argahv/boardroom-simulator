"use client";
import { useState, useMemo } from "react";
import type { TemporalTimelineData, TimelineMoment } from "@/lib/types";
import Link from "next/link";

type Props = { data: TemporalTimelineData };

const KIND_COLORS: Record<string, string> = {
  proposal: "var(--color-chart-4)",
  coalition: "var(--color-chart-2)",
  challenge: "var(--color-chart-1)",
  compromise: "var(--color-chart-3)",
  turning_point: "var(--color-chart-5)",
};

const KIND_BG: Record<string, string> = {
  proposal: "rgba(79,139,201,0.12)",
  coalition: "rgba(61,158,140,0.12)",
  challenge: "rgba(237,111,92,0.12)",
  compromise: "rgba(201,149,46,0.12)",
  turning_point: "rgba(139,111,158,0.12)",
};

function kindColor(kind: string): string {
  return KIND_COLORS[kind] ?? "var(--color-muted)";
}

function kindBg(kind: string): string {
  return KIND_BG[kind] ?? "rgba(90,84,72,0.10)";
}

function formatKind(kind: string): string {
  return kind
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TemporalTimelineSection({ data }: Props) {
  const moments = useMemo(() => data.moments.slice(0, 100), [data.moments]);
  const topicCounts = data.topic_counts;
  const maxTopicCount = useMemo(
    () => Math.max(...topicCounts.map((t) => t.count), 1),
    [topicCounts],
  );

  const simGroups = useMemo(() => {
    const map = new Map<string, TimelineMoment[]>();
    for (const m of moments) {
      const arr = map.get(m.simulation_id) ?? [];
      arr.push(m);
      map.set(m.simulation_id, arr);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const aMin = Math.min(...a.map((m) => m.turn));
      const bMin = Math.min(...b.map((m) => m.turn));
      return aMin - bMin;
    });
  }, [moments]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (moments.length === 0) {
    return (
      <section
        aria-label="Temporal timeline of key moments"
        className="analytics-section"
      >
        <h2 className="analytics-card-title">Temporal Timeline</h2>
        <div className="analytics-empty">
          <p>No timeline events recorded</p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Temporal timeline of key moments"
      className="analytics-section space-y-6"
    >
      <h2 className="analytics-card-title">Temporal Timeline</h2>

      {/* Topic frequency bars */}
      {topicCounts.length > 0 && (
        <div className="analytics-card">
          <h3 className="text-sm font-semibold text-ink mb-3">
            Topic Frequency
          </h3>
          <div className="space-y-2">
            {topicCounts.map((t) => (
              <div key={t.topic} className="flex items-center gap-3">
                <span className="w-28 text-xs text-muted truncate shrink-0 font-medium">
                  {t.topic}
                </span>
                <div className="flex-1 h-5 rounded-full bg-hairline overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(t.count / maxTopicCount) * 100}%`,
                      background: "var(--color-chart-4)",
                    }}
                  />
                </div>
                <span className="text-xs font-semibold text-muted w-6 text-right shrink-0">
                  {t.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-simulation collapsible groups */}
      <div className="space-y-4">
        {simGroups.map(([simId, simMoments]) => {
          const isCollapsed = collapsed.has(simId);
          const name = simMoments[0].subject_name;
          return (
            <div key={simId} className="analytics-card">
              <button
                onClick={() => toggle(simId)}
                className="flex items-center gap-2 w-full text-left cursor-pointer"
                aria-expanded={!isCollapsed}
              >
                <span
                  className="text-xs font-mono transition-transform duration-200 inline-block"
                  style={{
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  }}
                >
                  ▼
                </span>
                <Link
                  href={`/simulate/${simId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  {name}
                </Link>
                <span className="text-xs text-muted ml-auto">
                  {simMoments.length} event
                  {simMoments.length !== 1 ? "s" : ""}
                </span>
              </button>

              {!isCollapsed && (
                <div className="mt-4 relative pl-8">
                  {/* Vertical timeline line */}
                  <div
                    className="absolute left-[15px] top-2 bottom-2 w-px bg-hairline"
                  />

                  <div className="space-y-5">
                    {simMoments
                      .slice()
                      .sort((a, b) => a.turn - b.turn)
                      .map((m, i) => (
                        <div
                          key={`${m.turn}-${i}`}
                          className="relative anim-slide-up"
                          style={{ animationDelay: `${i * 30}ms` }}
                        >
                          {/* Turn badge on timeline */}
                          <div
                            className="absolute -left-8 top-0 w-[30px] h-[30px] rounded-full flex items-center justify-center text-xs font-bold font-mono border-2 z-10"
                            style={{
                              background: "var(--color-surface-card)",
                              borderColor: kindColor(m.kind),
                              color: kindColor(m.kind),
                            }}
                          >
                            {m.turn}
                          </div>

                          {/* Moment card */}
                          <div
                            className="rounded-lg p-3 border"
                            style={{
                              background: "var(--color-surface-container-low)",
                              borderColor: "var(--color-hairline)",
                            }}
                          >
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <span
                                className="analytics-badge"
                                style={{
                                  background: kindBg(m.kind),
                                  color: kindColor(m.kind),
                                }}
                              >
                                {formatKind(m.kind)}
                              </span>
                              <Link
                                href={`/simulate/${m.simulation_id}`}
                                className="text-xs text-primary hover:underline font-medium"
                              >
                                {m.subject_name}
                              </Link>
                            </div>
                            <p className="text-sm text-ink leading-relaxed">
                              {m.description}
                            </p>
                            {m.actors.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {m.actors.map((actor) => (
                                  <span
                                    key={actor}
                                    className="text-xs px-1.5 py-0.5 rounded bg-hairline text-muted"
                                  >
                                    {actor}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {data.moments.length > 100 && (
        <p className="text-xs text-muted text-center">
          Showing 100 of {data.moments.length} moments
        </p>
      )}
    </section>
  );
}
