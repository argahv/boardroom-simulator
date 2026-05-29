"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { fetchSimulationAnalytics, fetchSimulations } from "@/lib/api";
import type { SimulationAnalytics } from "@/lib/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const STANCE_COLORS: Record<string, string> = {
  champion: "var(--color-chart-2)",
  detractor: "var(--color-chart-1)",
  neutral: "var(--color-muted)",
  moderator: "var(--color-chart-4)",
  wildcard: "var(--color-chart-3)",
};

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<SimulationAnalytics | null>(null);
  const [recentSims, setRecentSims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchSimulationAnalytics(), fetchSimulations()])
      .then(([analyticsData, simsData]) => {
        setAnalytics(analyticsData);
        setRecentSims(simsData.slice(0, 5));
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load analytics data");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppShell activeTab="Analytics">
        <div className="px-8 py-8 space-y-8">
          <div className="h-8 w-40 rounded bg-ink/8 anim-shimmer" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-surface-card rounded-xl p-6 border border-hairline/60">
                <div className="h-8 w-16 rounded bg-ink/8 anim-shimmer mb-2" />
                <div className="h-3 w-20 rounded bg-ink/8 anim-shimmer" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="bg-surface-card rounded-xl p-6 h-[340px] border border-hairline/60">
                <div className="h-5 w-32 rounded bg-ink/8 anim-shimmer mb-6" />
                <div className="h-[260px] rounded bg-ink/8 anim-shimmer" />
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!analytics || analytics.total_simulations === 0) {
    return (
      <AppShell activeTab="Analytics">
        <div className="px-8 py-8">
          <h1 className="font-display text-4xl font-semibold tracking-display">
            Analytics
          </h1>
          <p className="text-sm text-muted mt-1">Cross-simulation insights</p>
          <div className="mt-20 flex flex-col items-center justify-center text-center">
            <h3 className="font-display text-2xl font-semibold text-muted">
              No simulations yet
            </h3>
            <p className="mt-2 text-sm text-muted/70 max-w-md">
              Run your first simulation to unlock cross-session insights, persona trends, and stance distributions.
            </p>
            <Link
              href="/simulate/new"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-dark transition hover:bg-primary-active"
            >
              Start a Simulation
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const personaData = analytics.top_personas.map(([name, count]) => ({
    name,
    count,
  }));

  const stanceData = Object.entries(analytics.stance_distribution).map(
    ([name, value]) => ({ name, value })
  );

  const totalStances = stanceData.reduce((sum, d) => sum + d.value, 0);

  return (
    <AppShell activeTab="Analytics">
      <div className="px-8 py-8">
          <h1 className="font-display text-4xl font-semibold tracking-display">
            Analytics
          </h1>
          <p className="text-sm text-muted mt-1">Cross-simulation insights</p>

        {error && <div className="p-4 bg-error-soft text-error rounded-xl text-sm">{error}</div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          <div className="bg-surface-card rounded-xl p-6">
            <p className="text-3xl font-bold">
              {analytics.total_simulations.toLocaleString()}
            </p>
            <p className="text-sm text-muted mt-1">simulations</p>
          </div>
          <div className="bg-surface-card rounded-xl p-6">
            <p className="text-3xl font-bold">
              {analytics.total_turns.toLocaleString()}
            </p>
            <p className="text-sm text-muted mt-1">turns</p>
          </div>
          <div className="bg-surface-card rounded-xl p-6">
            <p className="text-3xl font-bold">
              {analytics.avg_voltage.toFixed(1)}
            </p>
            <p className="text-sm text-muted mt-1">voltage</p>
          </div>
          <div className="bg-surface-card rounded-xl p-6">
            <p className="text-3xl font-bold">
              {analytics.top_personas.length}
            </p>
            <p className="text-sm text-muted mt-1">unique personas</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <div className="bg-surface-card rounded-xl p-6">
            <h2 className="font-display text-lg font-semibold mb-4">
              Top Personas
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={personaData}
                layout="vertical"
                margin={{ left: 100 }}
              >
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Bar
                  dataKey="count"
                  fill="var(--color-chart-1)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-surface-card rounded-xl p-6">
            <h2 className="font-display text-lg font-semibold mb-4">
              Stance Distribution
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stanceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  nameKey="name"
                  label={({ value }) =>
                    `${((value / totalStances) * 100).toFixed(0)}%`
                  }
                >
                  {stanceData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={STANCE_COLORS[entry.name] ?? "#999"}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  formatter={(value) => (
                    <span className="text-sm capitalize">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {recentSims.length > 0 && (
          <div className="bg-surface-card rounded-xl p-6 mt-6">
            <h2 className="font-display text-lg font-semibold mb-4">
              Recent Simulations
            </h2>
            <div className="space-y-2">
              {recentSims.map((sim) => (
                <Link
                  key={sim.simulation_id}
                  href={`/simulate/${sim.simulation_id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-container-low transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {sim.subject?.name ?? "Untitled"}
                    </p>
                    <p className="text-xs text-muted">
                      {sim.stakeholder_count} stakeholders
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {sim.voltage?.toFixed(1)}v
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-card border border-hairline text-muted capitalize">
                      {sim.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href="/simulate"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-dark transition hover:bg-primary-active active:scale-[0.97] duration-150"
          >
            View all simulations
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
