"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface SentimentGraphProps {
  sentimentHistory?: { turn: number; value: number }[];
}

export function SentimentGraph({ sentimentHistory }: SentimentGraphProps) {
  if (!sentimentHistory || sentimentHistory.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
        <div className="mb-[14px] flex items-baseline justify-between">
          <span className="text-[13px] font-semibold text-ink">Sentiment by turn</span>
          <span className="text-[11px] text-muted">Aggressive ↔ aligned</span>
        </div>
        <div className="flex h-[90px] items-center justify-center border-y border-hairline">
          <span className="text-[12px] italic text-muted">Awaiting data…</span>
        </div>
      </div>
    );
  }

  const data = sentimentHistory.map((s) => ({
    turn: s.turn,
    value: Math.round(s.value * 100),
  }));

  const lastVal = data[data.length - 1]?.value ?? 50;
  const lineColor = lastVal >= 50 ? "#22c55e" : "#ef4444";

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Sentiment by turn</span>
        <span className="text-[11px] text-muted">Aggressive ↔ aligned</span>
      </div>
      <div className="h-[100px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="sentimentFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
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
              formatter={(val) => [`${val}`, "Sentiment"]}
              labelFormatter={(label) => `Turn ${label}`}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={1.5}
              fill="url(#sentimentFill)"
              dot={false}
              activeDot={{ r: 3, fill: lineColor }}
              isAnimationActive={true}
              animationDuration={400}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>T0</span>
        <span className="text-[10px]">{data.filter((d) => d.value < 40).length} aggressive turns</span>
        <span>T{data.length - 1}</span>
      </div>
    </div>
  );
}
