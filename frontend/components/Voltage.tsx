"use client";

interface VoltageProps {
  value: number;
  max?: number;
  height?: number;
  color?: string;
  bg?: string;
}

export function Voltage({
  value,
  max = 100,
  height = 6,
  color = "var(--color-primary)",
  bg = "var(--color-hairline)",
}: VoltageProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      style={{
        background: bg,
        height,
        borderRadius: 9999,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 9999,
          transition: "width 600ms cubic-bezier(.4,0,.2,1)",
        }}
      />
    </div>
  );
}
