"use client";
import type { SimulationOutcomesData } from "@/lib/types";
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
  ScatterChart,
  Scatter,
  CartesianGrid,
} from "recharts";

type Props = { data: SimulationOutcomesData };

const STATUS_COLORS: Record<string, string> = {
  idle: "var(--color-muted)",
  running: "var(--color-chart-4)",
  complete: "var(--color-chart-2)",
};

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  running: "Running",
  complete: "Complete",
};

function asPct(v: number, total: number): string {
  if (!total) return "0%";
  return `${((v / total) * 100).toFixed(0)}%`;
}

export function SimulationOutcomesSection({ data }: Props) {
  const statusTotal = Object.values(data.status_breakdown).reduce(
    (s, v) => s + v,
    0,
  );
  const statusPie = Object.entries(data.status_breakdown).map(
    ([key, value]) => ({
      name: STATUS_LABELS[key] ?? key,
      value,
      color: STATUS_COLORS[key] ?? "var(--color-muted)",
    }),
  );

  const hasVoltageData =
    Array.isArray(data.voltage_distribution) &&
    data.voltage_distribution.length > 0;
  const hasAvgTurns = Object.values(data.avg_turns_per_status).some(
    (v) => v > 0,
  );
  const hasModelTemp =
    Array.isArray(data.model_temp_comparison) &&
    data.model_temp_comparison.length > 0;

  // Transform flat model_temp_comparison into grouped bar format
  // [{ temperature, idle:N, running:N, complete:N }]
  const tempGrouped = hasModelTemp
    ? Object.entries(
        data.model_temp_comparison.reduce<
          Record<string, Record<string, number>>
        >((acc, { temperature, status, count }) => {
          if (!acc[temperature]) acc[temperature] = { idle: 0, running: 0, complete: 0 };
          acc[temperature][status] = (acc[temperature][status] ?? 0) + count;
          return acc;
        }, {}),
      ).map(([temperature, counts]) => ({ temperature, ...counts }))
    : [];

  return (
    <section aria-label="Simulation outcome analysis">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── 1. Status Breakdown Pie ── */}
        <div className="analytics-card">
          <h3 className="analytics-card-title">Status Breakdown</h3>
          {statusTotal > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusPie}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusPie.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  formatter={(value: string) => (
                    <span style={{ color: "var(--color-ink)" }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="analytics-empty">No outcome data available</p>
          )}
        </div>

        {/* ── 2. Voltage Distribution Bar ── */}
        <div className="analytics-card">
          <h3 className="analytics-card-title">Voltage Distribution</h3>
          {hasVoltageData ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.voltage_distribution}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-hairline)"
                />
                <XAxis
                  dataKey="range"
                  tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                  axisLine={{ stroke: "var(--color-hairline)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-card)",
                    border: "1px solid var(--color-hairline)",
                    borderRadius: "0.5rem",
                    color: "var(--color-ink)",
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="var(--color-chart-4)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="analytics-empty">No outcome data available</p>
          )}
        </div>

        {/* ── 3. Avg Turns per Status (horizontal) ── */}
        <div className="analytics-card">
          <h3 className="analytics-card-title">Avg Turns per Status</h3>
          {hasAvgTurns ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={Object.entries(data.avg_turns_per_status).map(
                  ([key, value]) => ({
                    name: STATUS_LABELS[key] ?? key,
                    turns: value,
                  }),
                )}
                layout="vertical"
                margin={{ left: 60, right: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-hairline)"
                />
                <XAxis
                  type="number"
                  tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                  axisLine={{ stroke: "var(--color-hairline)" }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-card)",
                    border: "1px solid var(--color-hairline)",
                    borderRadius: "0.5rem",
                    color: "var(--color-ink)",
                  }}
                />
                <Bar
                  dataKey="turns"
                  fill="var(--color-chart-2)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="analytics-empty">No outcome data available</p>
          )}
        </div>

        {/* ── 4. Model Temperature vs Outcomes ── */}
        <div className="analytics-card">
          <h3 className="analytics-card-title">
            Model Temperature vs Outcomes
          </h3>
          {hasModelTemp ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={tempGrouped}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-hairline)"
                />
                <XAxis
                  dataKey="temperature"
                  tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                  axisLine={{ stroke: "var(--color-hairline)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-card)",
                    border: "1px solid var(--color-hairline)",
                    borderRadius: "0.5rem",
                    color: "var(--color-ink)",
                  }}
                />
                <Legend
                  formatter={(value: string) => (
                    <span style={{ color: "var(--color-ink)" }}>{value}</span>
                  )}
                />
                <Bar
                  dataKey="idle"
                  name="Idle"
                  fill="var(--color-muted)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="running"
                  name="Running"
                  fill="var(--color-chart-4)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="complete"
                  name="Complete"
                  fill="var(--color-chart-2)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="analytics-empty">No outcome data available</p>
          )}
        </div>

        {/* ── 5. Voltage vs Turns Scatter ── */}
        <div className="analytics-card md:col-span-2">
          <h3 className="analytics-card-title">Voltage vs Turns</h3>
          <p className="analytics-empty">
            Scatter chart requires per-simulation voltage/turns data from the
            backend. No data available.
          </p>
        </div>
      </div>
    </section>
  );
}
