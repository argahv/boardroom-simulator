"use client";

import type { EmotionalAnalyticsData } from "@/lib/types";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type Props = { data: EmotionalAnalyticsData };

const EMOTIONS = ["anger", "fear", "joy", "shame", "surprise"] as const;

const LABELS: Record<string, string> = {
  anger: "Anger",
  fear: "Fear",
  joy: "Joy",
  shame: "Shame",
  surprise: "Surprise",
};

const COLORS: Record<string, string> = {
  anger: "var(--color-chart-1)",
  fear: "var(--color-chart-3)",
  joy: "var(--color-chart-2)",
  shame: "var(--color-chart-5)",
  surprise: "var(--color-chart-4)",
};

function buildRadarData(dist: Record<string, number>) {
  return EMOTIONS.map((e) => ({
    emotion: LABELS[e],
    value: dist[e] ?? 0,
  }));
}

function buildPieData(trajectory: EmotionalAnalyticsData["trajectory"]) {
  const counts: Record<string, number> = {};
  const emotionKeys = ["anger", "fear", "joy", "shame", "surprise"] as const;
  for (const entry of trajectory) {
    let maxE: string = emotionKeys[0];
    let maxV = entry[emotionKeys[0]];
    for (const e of emotionKeys) {
      if (entry[e] > maxV) {
        maxV = entry[e];
        maxE = e;
      }
    }
    counts[maxE] = (counts[maxE] ?? 0) + 1;
  }
  return EMOTIONS.filter((e) => (counts[e] ?? 0) > 0).map((e) => ({
    name: LABELS[e],
    value: counts[e] ?? 0,
    color: COLORS[e],
  }));
}

export function EmotionalAnalyticsSection({ data }: Props) {
  const hasDistribution = Object.keys(data.emotion_distribution).length > 0;
  const hasTrajectory = data.trajectory.length > 0;

  if (!hasDistribution && !hasTrajectory) {
    return (
      <section aria-label="Emotional analytics">
        <div className="analytics-empty">
          <p>No emotional data available</p>
        </div>
      </section>
    );
  }

  const radarData = buildRadarData(data.emotion_distribution);
  const pieData = buildPieData(data.trajectory);

  const tooltipStyle = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-hairline)",
    borderRadius: 8,
    fontSize: 13,
  };

  return (
    <section aria-label="Emotional analytics" className="space-y-6">
      {/* Emotion Distribution — Radar */}
      {hasDistribution && (
        <div className="analytics-card">
          <h3 className="analytics-card-title">Emotion Distribution</h3>
          <p className="text-sm text-[var(--color-muted)] mb-4">
            Average emotional levels across all simulations
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="var(--color-hairline)" />
              <PolarAngleAxis
                dataKey="emotion"
                tick={{ fill: "var(--color-muted)", fontSize: 12 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 1]}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
              />
              <Radar
                name="Average"
                dataKey="value"
                stroke="var(--color-chart-1)"
                fill="var(--color-chart-1)"
                fillOpacity={0.2}
                strokeWidth={2}
              />
              <Tooltip contentStyle={tooltipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Emotion Trajectory — Line */}
      {hasTrajectory && (
        <div className="analytics-card">
          <h3 className="analytics-card-title">Emotion Trajectory</h3>
          <p className="text-sm text-[var(--color-muted)] mb-4">
            Per-simulation emotion levels over turn index
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.trajectory}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-hairline)"
              />
              <XAxis
                dataKey="turn"
                tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                stroke="var(--color-hairline)"
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                stroke="var(--color-hairline)"
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              {EMOTIONS.map((e) => (
                <Line
                  key={e}
                  type="monotone"
                  dataKey={e}
                  name={LABELS[e]}
                  stroke={COLORS[e]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Dominant Emotion — Pie */}
      {pieData.length > 0 && (
        <div className="analytics-card">
          <h3 className="analytics-card-title">Dominant Emotion</h3>
          <p className="text-sm text-[var(--color-muted)] mb-4">
            Most frequent dominant emotion across turns
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
