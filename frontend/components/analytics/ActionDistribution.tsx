"use client";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ActionDistributionData } from "@/lib/types";

type Props = { data: ActionDistributionData };

const ACTION_TYPES = [
  "statement",
  "question",
  "challenge",
  "compromise",
  "coalition_signal",
  "interrupt",
  "escalate",
  "vote",
  "walkaway",
] as const;

const ACTION_LABELS: Record<string, string> = {
  statement: "Statement",
  question: "Question",
  challenge: "Challenge",
  compromise: "Compromise",
  coalition_signal: "Coalition Signal",
  interrupt: "Interrupt",
  escalate: "Escalate",
  vote: "Vote",
  walkaway: "Walkaway",
};

const ACTION_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
];

const STANCE_LABELS: Record<string, string> = {
  champion: "Champion",
  detractor: "Detractor",
  neutral: "Neutral",
  moderator: "Moderator",
  wildcard: "Wildcard",
};

const STANCE_COLORS: Record<string, string> = {
  champion: "var(--color-primary)",
  detractor: "var(--color-error)",
  neutral: "var(--color-muted)",
  moderator: "var(--color-accent-teal)",
  wildcard: "var(--color-accent-amber)",
};

/* ── empty state ── */
function EmptyState() {
  return (
    <div className="analytics-empty">
      <p>No action data available</p>
    </div>
  );
}

/* ── pie chart (total breakdown) ── */
function TotalPie({ data }: { data: Record<string, number> }) {
  const chartData = ACTION_TYPES.map((t) => ({
    name: ACTION_LABELS[t],
    value: data[t] ?? 0,
  })).filter((d) => d.value > 0);

  if (chartData.length === 0) return <EmptyState />;

  return (
    <div className="space-y-2">
      <h3 className="analytics-card-title">Total by Action Type</h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, i) => (
              <Cell
                key={entry.name}
                fill={`var(--color-chart-${(i % 5) + 1})`}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-card-elevated)",
              border: "1px solid var(--color-hairline)",
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <Legend
            formatter={(value: string) => (
              <span style={{ color: "var(--color-ink)", fontSize: 12 }}>
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── stacked bar chart (per simulation) ── */
function PerSimulationStacked({
  per_simulation,
}: {
  per_simulation: ActionDistributionData["per_simulation"];
}) {
  const chartData = per_simulation.map((sim) => {
    const name = sim.subject_name || "";
    const row: Record<string, string | number> = {
      name: name.length > 24 ? name.slice(0, 24) + "…" : name,
      _fullName: name,
    };
    for (const t of ACTION_TYPES) {
      row[t] = sim.breakdown[t] ?? 0;
    }
    return row;
  });

  if (chartData.length === 0) return <EmptyState />;

  return (
    <div className="space-y-2">
      <h3 className="analytics-card-title">Per-Simulation Breakdown</h3>
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40 + 60)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ left: 100, right: 20, top: 8, bottom: 8 }}
        >
          <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            tick={({ x, y, payload }: any) => {
              const item = chartData.find((d) => d.name === payload.value);
              const full = item?._fullName as string | undefined;
              const isTruncated = full && full.length > 24;
              return (
                <g transform={`translate(${x},${y})`}>
                  <text x={-8} y={0} dy="0.35em" textAnchor="end" fill="var(--color-ink)" fontSize={11}>
                    {payload.value}
                  </text>
                  {isTruncated && (
                    <title>{full}</title>
                  )}
                </g>
              );
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-card-elevated)",
              border: "1px solid var(--color-hairline)",
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <Legend
            formatter={(value: string) => (
              <span style={{ color: "var(--color-ink)", fontSize: 12 }}>
                {ACTION_LABELS[value] ?? value}
              </span>
            )}
          />
          {ACTION_TYPES.map((t, i) => (
            <Bar
              key={t}
              dataKey={t}
              stackId="a"
              fill={`var(--color-chart-${(i % 5) + 1})`}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── heatmap (action type × stance) ── */
function StanceHeatmap({
  by_stance,
}: {
  by_stance: Record<string, Record<string, number>>;
}) {
  const stances = Object.keys(by_stance).sort();
  if (stances.length === 0) return <EmptyState />;

  // compute global max for opacity scaling
  let globalMax = 0;
  const matrix: Record<string, Record<string, number>> = {};
  for (const stance of stances) {
    matrix[stance] = {};
    for (const t of ACTION_TYPES) {
      const val = by_stance[stance]?.[t] ?? 0;
      matrix[stance][t] = val;
      if (val > globalMax) globalMax = val;
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="analytics-card-title">Action Type vs Stance</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left font-medium text-muted px-2 py-1.5 border-b border-hairline">
                Action
              </th>
              {stances.map((s) => (
                <th
                  key={s}
                  className="text-center font-medium px-2 py-1.5 border-b border-hairline"
                >
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{ color: STANCE_COLORS[s] ?? "var(--color-muted)" }}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: STANCE_COLORS[s] ?? "var(--color-muted)" }}
                    />
                    {STANCE_LABELS[s] ?? s}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACTION_TYPES.map((t) => {
              const total = stances.reduce(
                (sum, s) => sum + (matrix[s][t] ?? 0),
                0,
              );
              if (total === 0) return null;
              return (
                <tr key={t}>
                  <td className="text-left font-medium text-ink px-2 py-1.5 border-b border-hairline whitespace-nowrap">
                    {ACTION_LABELS[t]}
                  </td>
                  {stances.map((s) => {
                    const val = matrix[s][t] ?? 0;
                    const opacity = globalMax > 0 ? val / globalMax : 0;
                    return (
                      <td
                        key={s}
                        className="text-center px-2 py-1.5 border-b border-hairline font-mono text-xs font-semibold"
                        style={{
                          background: `color-mix(in srgb, ${STANCE_COLORS[s] ?? "var(--color-muted)"} ${Math.round(opacity * 70)}%, transparent)`,
                          color:
                            opacity > 0.5
                              ? "var(--color-on-dark)"
                              : "var(--color-ink)",
                        }}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── section component ── */
export function ActionDistributionSection({ data }: Props) {
  const hasData =
    Object.keys(data.total_by_type).length > 0 ||
    data.per_simulation.length > 0 ||
    Object.keys(data.by_stance).length > 0;

  if (!hasData) return <EmptyState />;

  return (
    <section aria-label="Action type distribution" className="space-y-8">
      <TotalPie data={data.total_by_type} />
      <PerSimulationStacked per_simulation={data.per_simulation} />
      <StanceHeatmap by_stance={data.by_stance} />
    </section>
  );
}
