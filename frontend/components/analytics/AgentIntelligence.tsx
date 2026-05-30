"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { AgentIntelligenceData } from "@/lib/types";

// ── Types ──

type SortKey = "name" | "role" | "total_sims" | "total_turns" | "avg_turn_count";
type SortDir = "asc" | "desc";
type Props = { data: AgentIntelligenceData };

// ── Constants ──

const PAGE_SIZE = 20;

const STANCE_COLORS: Record<string, string> = {
  champion: "var(--color-chart-2)",
  detractor: "var(--color-chart-1)",
  neutral: "var(--color-muted)",
  moderator: "var(--color-chart-4)",
  wildcard: "var(--color-chart-3)",
};

const STANCE_ORDER = ["champion", "moderator", "neutral", "detractor", "wildcard"];

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "role", label: "Role" },
  { key: "total_sims", label: "Sims" },
  { key: "total_turns", label: "Turns" },
  { key: "avg_turn_count", label: "Avg Turns" },
];

// ── Helpers ──

function getStanceCounts(stances: string[]): { stance: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const s of stances) {
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return STANCE_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((stance) => ({
    stance,
    count: counts[stance],
  }));
}

// ── Component ──

export function AgentIntelligenceSection({ data }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  // Filtered + sorted list (memoised)
  const filtered = useMemo(() => {
    let agents = data.agents;
    if (search.trim()) {
      const q = search.toLowerCase();
      agents = agents.filter((a) => a.name.toLowerCase().includes(q));
    }
    return [...agents].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "role":
          cmp = a.role.localeCompare(b.role);
          break;
        case "total_sims":
          cmp = a.total_sims - b.total_sims;
          break;
        case "total_turns":
          cmp = a.total_turns - b.total_turns;
          break;
        case "avg_turn_count":
          cmp = a.avg_turn_count - b.avg_turn_count;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data.agents, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageAgents = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  // ── Empty state ──
  if (data.agents.length === 0) {
    return (
      <div className="analytics-empty">
        <p>No agent data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        type="text"
        placeholder="Search agents by name..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        className="w-full rounded-lg border border-hairline bg-surface-card px-3 py-2 text-sm text-ink placeholder:text-muted/50 outline-none focus:border-primary transition"
        aria-label="Search agents"
      />

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs font-semibold text-muted uppercase tracking-wider">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="py-2 pr-3 cursor-pointer select-none hover:text-ink transition"
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key ? (
                      <span className="text-ink">{sortDir === "asc" ? "↑" : "↓"}</span>
                    ) : (
                      <span className="text-muted/30">↕</span>
                    )}
                  </span>
                </th>
              ))}
              <th className="py-2 pr-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Stances
              </th>
              <th className="py-2 text-xs font-semibold text-muted uppercase tracking-wider">
                Distribution
              </th>
            </tr>
          </thead>
          <tbody>
            {pageAgents.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 2}
                  className="py-8 text-center text-sm text-muted"
                >
                  No agents match your search
                </td>
              </tr>
            ) : (
              pageAgents.map((agent) => {
                const stanceData = getStanceCounts(agent.stances);
                return (
                  <tr
                    key={agent.name}
                    className="border-b border-hairline/50 last:border-0 hover:bg-surface-container-low/40 transition"
                  >
                    <td className="py-2.5 pr-3 font-medium text-ink whitespace-nowrap">
                      {agent.name}
                    </td>
                    <td className="py-2.5 pr-3 text-muted whitespace-nowrap">
                      {agent.role}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs">
                      {agent.total_sims}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs">
                      {agent.total_turns}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs">
                      {agent.avg_turn_count.toFixed(1)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {[...new Set(agent.stances)].map((stance) => (
                          <span
                            key={stance}
                            className="analytics-badge leading-4"
                            style={{
                              backgroundColor: `${STANCE_COLORS[stance] ?? "var(--color-muted)"}1A`,
                              color: STANCE_COLORS[stance] ?? "var(--color-muted)",
                            }}
                          >
                            {stance}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 w-32 min-w-[100px]">
                      <ResponsiveContainer width="100%" height={36}>
                        <BarChart
                          data={stanceData}
                          layout="vertical"
                          margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
                          barCategoryGap={2}
                        >
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="stance" hide />
                          <Tooltip
                            cursor={false}
                            contentStyle={{
                              background: "var(--color-surface-card-elevated)",
                              border: "1px solid var(--color-hairline)",
                              borderRadius: 6,
                              fontSize: 12,
                              color: "var(--color-ink)",
                            }}
                            formatter={(_value: unknown, _name: unknown, props: unknown) => {
                              const p = props as { payload: { stance: string } };
                              return [p.payload.stance, _value as number] as const;
                            }}
                          />
                          <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={8}>
                            {stanceData.map((entry) => (
                              <Cell
                                key={entry.stance}
                                fill={
                                  STANCE_COLORS[entry.stance] ?? "var(--color-muted)"
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 border-t border-hairline">
          <span className="text-xs text-muted">
            {filtered.length} agent{filtered.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-xs font-medium text-muted hover:text-ink disabled:text-muted/30 disabled:cursor-not-allowed transition"
            >
              ← Prev
            </button>
            <span className="text-xs text-muted">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-xs font-medium text-muted hover:text-ink disabled:text-muted/30 disabled:cursor-not-allowed transition"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
