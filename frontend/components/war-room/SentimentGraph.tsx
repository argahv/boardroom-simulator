"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface SentimentGraphProps {
  /** Room-average trust (`value`, 0-1) and tension per snapshot turn index. */
  sentimentHistory?: { turn: number; value: number; tension?: number }[];
}

const TRUST_COLOR = "var(--color-secondary)";
const TENSION_COLOR = "var(--color-primary)";

function Header() {
  return (
    <div className="mb-[14px] flex items-baseline justify-between">
      <span className="text-[13px] font-semibold text-ink">Room trust by turn</span>
      <span className="flex items-center gap-2 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-3" style={{ background: TRUST_COLOR }} />
          trust
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-3" style={{ background: TENSION_COLOR }} />
          tension
        </span>
      </span>
    </div>
  );
}

export function SentimentGraph({ sentimentHistory }: SentimentGraphProps) {
  if (!sentimentHistory || sentimentHistory.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
        <Header />
        <div className="flex h-[90px] items-center justify-center border-y border-hairline">
          <span className="text-[12px] italic text-muted">Awaiting data…</span>
        </div>
      </div>
    );
  }

  // Snapshot turn indexes are 0-based; the axis shows turn numbers as the timeline does.
  const data = sentimentHistory.map((s) => ({
    turn: s.turn + 1,
    trust: Math.round(s.value * 100),
    tension: typeof s.tension === "number" ? Math.round(s.tension * 100) : null,
  }));
  const hasTension = data.some((d) => d.tension !== null);
  const first = data[0];
  const last = data[data.length - 1];

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <Header />
      <div className="h-[100px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="roomTrustFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TRUST_COLOR} stopOpacity={0.3} />
                <stop offset="100%" stopColor={TRUST_COLOR} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" vertical={false} />
            <XAxis
              dataKey="turn"
              tick={{ fontSize: 10, fill: "var(--color-muted)" }}
              axisLine={{ stroke: "var(--color-hairline)" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "var(--color-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface-card)",
                border: "1px solid var(--color-hairline)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(val, name) => [`${val}%`, name === "tension" ? "Avg tension" : "Avg trust"]}
              labelFormatter={(label) => `Turn ${label}`}
            />
            <Area
              type="monotone"
              dataKey="trust"
              stroke={TRUST_COLOR}
              strokeWidth={1.5}
              fill="url(#roomTrustFill)"
              dot={false}
              activeDot={{ r: 3, fill: TRUST_COLOR }}
              isAnimationActive={true}
              animationDuration={400}
            />
            {hasTension && (
              <Area
                type="monotone"
                dataKey="tension"
                stroke={TENSION_COLOR}
                strokeWidth={1.5}
                fill="none"
                dot={false}
                activeDot={{ r: 3, fill: TENSION_COLOR }}
                isAnimationActive={true}
                animationDuration={400}
                connectNulls
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted">
        <span>T{first.turn}</span>
        <span className="text-[10px]">
          trust {last.trust}%{last.tension !== null ? ` · tension ${last.tension}%` : ""}
        </span>
        <span>T{last.turn}</span>
      </div>
    </div>
  );
}
