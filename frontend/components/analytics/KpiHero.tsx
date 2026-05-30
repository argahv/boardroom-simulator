"use client";
import type { KpiOverview } from "@/lib/types";

type Props = { data: KpiOverview };

function fmt(n: number): string {
  return n >= 1_000_000
    ? (n / 1_000_000).toFixed(1) + "M"
    : n >= 1_000
      ? (n / 1_000).toFixed(1) + "K"
      : n.toLocaleString();
}

function voltageColor(v: number): string {
  if (v < 40) return "var(--color-chart-4)"; // cool blue
  if (v <= 60) return "var(--color-chart-3)"; // amber / neutral
  return "var(--color-chart-1)"; // warm coral
}

function voltageBg(v: number): string {
  if (v < 40) return "rgba(79,139,201,0.12)";
  if (v <= 60) return "rgba(201,149,46,0.12)";
  return "rgba(237,111,92,0.12)";
}

function trendArrow(data: KpiOverview): "up" | "down" | "flat" {
  const m = data.sims_per_month;
  if (m.length < 2) return "flat";
  const last = m[m.length - 1].count;
  const prev = m[m.length - 2].count;
  if (last > prev) return "up";
  if (last < prev) return "down";
  return "flat";
}

export function KpiHeroSection({ data }: Props) {
  const trend = trendArrow(data);
  return (
    <section aria-label="Key performance indicators">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Simulations */}
        <div className="analytics-card">
          <div className="analytics-stat-label">Total Simulations</div>
          <div className="flex items-baseline gap-2">
            <span className="analytics-stat">{fmt(data.total_simulations)}</span>
            <span
              className="text-sm font-medium"
              style={{
                color:
                  trend === "up"
                    ? "var(--color-success)"
                    : trend === "down"
                      ? "var(--color-error)"
                      : "var(--color-muted)",
              }}
              aria-label={`Trend ${trend}`}
            >
              {trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2192"}
            </span>
          </div>
        </div>

        {/* Total Turns */}
        <div className="analytics-card">
          <div className="analytics-stat-label">Total Turns</div>
          <span className="analytics-stat">{fmt(data.total_turns)}</span>
        </div>

        {/* Avg Voltage */}
        <div className="analytics-card">
          <div className="analytics-stat-label">Avg Voltage</div>
          <div className="flex items-center gap-3">
            <span className="analytics-stat">{data.avg_voltage.toFixed(1)}</span>
            <span
              className="analytics-badge"
              style={{
                background: voltageBg(data.avg_voltage),
                color: voltageColor(data.avg_voltage),
              }}
            >
              {data.avg_voltage < 40
                ? "Cool"
                : data.avg_voltage <= 60
                  ? "Moderate"
                  : "Intense"}
            </span>
          </div>
        </div>

        {/* Avg Participants */}
        <div className="analytics-card">
          <div className="analytics-stat-label">Avg Participants</div>
          <span className="analytics-stat">
            {data.avg_participants.toFixed(1)}
          </span>
        </div>

        {/* Completion Rate */}
        <div className="analytics-card">
          <div className="analytics-stat-label">Completion Rate</div>
          <span className="analytics-stat">{data.completion_rate}</span>
          <div
            className="mt-2 h-1.5 w-full rounded-full"
            style={{ background: "var(--color-hairline)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: data.completion_rate,
                background: "var(--color-chart-2)",
              }}
            />
          </div>
        </div>

        {/* Total Postmortems */}
        <div className="analytics-card">
          <div className="analytics-stat-label">Total Postmortems</div>
          <span className="analytics-stat">
            {fmt(data.total_postmortems)}
          </span>
        </div>
      </div>
    </section>
  );
}
