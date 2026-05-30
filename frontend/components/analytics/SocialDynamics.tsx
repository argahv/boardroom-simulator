"use client";

import { useMemo, useState } from "react";
import type { SocialDynamicsData } from "@/lib/types";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceDot,
} from "recharts";

type Props = { data: SocialDynamicsData };
type ViewMode = "aggregate" | "per-sim";

// ── helpers ───────────────────────────────────────────────────────────────

const CHART_CSS_VARS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

/** Flatten per-sim arcs → single aggregate series (average per turn) */
function buildAggregate(
  arcs: {
    simulation_id: string;
    subject_name: string;
    points: { turn: number; value: number }[];
  }[],
): { turn: number; value: number }[] {
  const turnMap = new Map<number, number[]>();
  for (const sim of arcs) {
    for (const pt of sim.points) {
      const bucket = turnMap.get(pt.turn);
      if (bucket) bucket.push(pt.value);
      else turnMap.set(pt.turn, [pt.value]);
    }
  }
  return Array.from(turnMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([turn, vals]) => ({
      turn,
      value: vals.reduce((s, v) => s + v, 0) / vals.length,
    }));
}

/** Build per-sim columns for Recharts grouped data */
function buildPerSim(
  arcs: {
    simulation_id: string;
    subject_name: string;
    points: { turn: number; value: number }[];
  }[],
): { data: Record<string, number>[]; simNames: string[] } {
  const simNames = [...new Set(arcs.map((a) => a.subject_name))];
  const turnMap = new Map<number, Record<string, number>>();
  for (const sim of arcs) {
    for (const pt of sim.points) {
      if (!turnMap.has(pt.turn)) turnMap.set(pt.turn, { turn: pt.turn });
      turnMap.get(pt.turn)![sim.subject_name] = pt.value;
    }
  }
  return {
    data: Array.from(turnMap.values()).sort((a, b) => a.turn - b.turn),
    simNames: simNames.filter((n) =>
      arcs.some((a) => a.subject_name === n && a.points.length > 0),
    ),
  };
}

function computeStats(data: SocialDynamicsData) {
  const allTrust = data.trust_arcs.flatMap((s) =>
    s.points.map((p) => p.value),
  );
  const allTension = data.tension_arcs.flatMap((s) =>
    s.points.map((p) => p.value),
  );
  const avgTrust =
    allTrust.length
      ? allTrust.reduce((a, b) => a + b, 0) / allTrust.length
      : 0;
  const avgTension =
    allTension.length
      ? allTension.reduce((a, b) => a + b, 0) / allTension.length
      : 0;
  const peakTension = data.peak_tension_summary?.max_value ?? 0;
  const dominantAgent =
    Object.entries(data.dominant_agent_frequency).sort(
      ([, a], [, b]) => b - a,
    )[0]?.[0] ?? "-";
  return { avgTrust, avgTension, peakTension, dominantAgent };
}

// ── sub-components ────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-bold text-ink">{value}</p>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
        active
          ? "bg-primary text-on-dark"
          : "bg-surface-container-low text-muted hover:bg-surface-container-high"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted">
      No social dynamics data
    </div>
  );
}

/** Generic custom tooltip for all three charts */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-hairline bg-surface-card-elevated px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold text-ink">Turn {label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}:{" "}
          {typeof entry.value === "number"
            ? entry.value.toFixed(3)
            : entry.value}
        </p>
      ))}
    </div>
  );
}

// ── chart wrappers ────────────────────────────────────────────────────────

function TrustChart({
  data,
  perSim,
  isAgg,
}: {
  data: SocialDynamicsData;
  perSim: ReturnType<typeof buildPerSim>;
  isAgg: boolean;
}) {
  const agg = useMemo(() => buildAggregate(data.trust_arcs), [data.trust_arcs]);
  const chartData = isAgg ? agg : perSim.data;

  if (!chartData.length) return null;

  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
        Trust
      </h3>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="trustGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-chart-1)"
                stopOpacity={0.3}
              />
              <stop
                offset="100%"
                stopColor="var(--color-chart-1)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-hairline)"
          />
          <XAxis
            dataKey="turn"
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted)"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted)"
            domain={[0, 1]}
          />
          <Tooltip content={<ChartTooltip />} />
          {isAgg ? (
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-chart-1)"
              fill="url(#trustGrad)"
              strokeWidth={2}
              name="Avg Trust"
            />
          ) : (
            <>
              {perSim.simNames.map((name, i) => (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={CHART_CSS_VARS[i % CHART_CSS_VARS.length]}
                  fill="none"
                  strokeWidth={1.5}
                  dot={false}
                  name={name}
                />
              ))}
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="line"
                iconSize={10}
              />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TensionChart({
  data,
  perSim,
  isAgg,
}: {
  data: SocialDynamicsData;
  perSim: ReturnType<typeof buildPerSim>;
  isAgg: boolean;
}) {
  const agg = useMemo(() => buildAggregate(data.tension_arcs), [data.tension_arcs]);
  const peakTurn = data.peak_tension_summary?.turn;
  const peakVal = data.peak_tension_summary?.max_value;
  const chartData = isAgg ? agg : perSim.data;

  if (!chartData.length) return null;

  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
        Tension
      </h3>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-hairline)"
          />
          <XAxis
            dataKey="turn"
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted)"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted)"
            domain={[0, 1]}
          />
          <Tooltip content={<ChartTooltip />} />
          {isAgg ? (
            <>
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-chart-3)"
                strokeWidth={2}
                dot={false}
                name="Avg Tension"
              />
              {peakTurn != null && peakVal != null && (
                <ReferenceDot
                  x={peakTurn}
                  y={peakVal}
                  r={5}
                  fill="var(--color-error)"
                  stroke="var(--color-surface-card)"
                  strokeWidth={2}
                    label={{
                      value: "Peak",
                      position: "top",
                      fill: "var(--color-error)",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                />
              )}
            </>
          ) : (
            <>
              {perSim.simNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={CHART_CSS_VARS[(i + 2) % CHART_CSS_VARS.length]}
                  strokeWidth={1.5}
                  dot={false}
                  name={name}
                />
              ))}
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="line"
                iconSize={10}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LeverageChart({
  data,
  perSim,
  isAgg,
}: {
  data: SocialDynamicsData;
  perSim: ReturnType<typeof buildPerSim>;
  isAgg: boolean;
}) {
  const agg = useMemo(() => buildAggregate(data.leverage_arcs), [data.leverage_arcs]);
  const chartData = isAgg ? agg : perSim.data;

  if (!chartData.length) return null;

  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
        Leverage
      </h3>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="levGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-chart-2)"
                stopOpacity={0.3}
              />
              <stop
                offset="100%"
                stopColor="var(--color-chart-2)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-hairline)"
          />
          <XAxis
            dataKey="turn"
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted)"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted)"
            domain={[0, 1]}
          />
          <Tooltip content={<ChartTooltip />} />
          {isAgg ? (
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-chart-2)"
              fill="url(#levGrad)"
              strokeWidth={2}
              name="Avg Leverage"
            />
          ) : (
            <>
              {perSim.simNames.map((name, i) => (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={CHART_CSS_VARS[(i + 3) % CHART_CSS_VARS.length]}
                  fill="none"
                  strokeWidth={1.5}
                  dot={false}
                  name={name}
                />
              ))}
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="line"
                iconSize={10}
              />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────

export function SocialDynamicsSection({ data }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("aggregate");
  const isAgg = viewMode === "aggregate";

  const hasData =
    data.trust_arcs.length > 0 ||
    data.tension_arcs.length > 0 ||
    data.leverage_arcs.length > 0;

  if (!hasData) return <EmptyState />;

  const stats = useMemo(() => computeStats(data), [data]);
  const trustPerSim = useMemo(() => buildPerSim(data.trust_arcs), [data.trust_arcs]);
  const tensionPerSim = useMemo(
    () => buildPerSim(data.tension_arcs),
    [data.tension_arcs],
  );
  const leveragePerSim = useMemo(
    () => buildPerSim(data.leverage_arcs),
    [data.leverage_arcs],
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Avg Trust" value={stats.avgTrust.toFixed(3)} />
        <StatCard label="Avg Tension" value={stats.avgTension.toFixed(3)} />
        <StatCard label="Peak Tension" value={stats.peakTension.toFixed(3)} />
        <StatCard label="Dominant Agent" value={stats.dominantAgent} />
      </div>

      {/* Toggle */}
      <div className="flex gap-1">
        <ToggleBtn
          active={isAgg}
          onClick={() => setViewMode("aggregate")}
        >
          Aggregate
        </ToggleBtn>
        <ToggleBtn
          active={!isAgg}
          onClick={() => setViewMode("per-sim")}
        >
          Per Simulation
        </ToggleBtn>
      </div>

      {/* Charts */}
      <TrustChart data={data} perSim={trustPerSim} isAgg={isAgg} />
      <TensionChart data={data} perSim={tensionPerSim} isAgg={isAgg} />
      <LeverageChart data={data} perSim={leveragePerSim} isAgg={isAgg} />
    </div>
  );
}
