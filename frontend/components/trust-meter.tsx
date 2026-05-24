"use client";

interface TrustMeterProps {
  trust: number; // 0–1
  size?: "small" | "medium" | "large";
}

const SIZE_CFG = {
  small:  { w: 80,  bh: 6,  fs: 10, mw: 32 },
  medium: { w: 140, bh: 8,  fs: 12, mw: 40 },
  large:  { w: 200, bh: 12, fs: 14, mw: 48 },
};

/** Map trust 0–1 → hue 0–120 (red→green) */
function trustHue(t: number): number {
  return Math.round(Math.max(0, Math.min(1, t)) * 120);
}

export function TrustMeter({ trust, size = "medium" }: TrustMeterProps) {
  const cfg = SIZE_CFG[size];
  const pct = Math.round(Math.max(0, Math.min(1, trust)) * 100);
  const hue = trustHue(trust);
  const color = `hsl(${hue}, 65%, ${pct < 25 ? 42 : 38}%)`;

  return (
    <span className="inline-flex items-center gap-1.5" style={{ minWidth: cfg.w + cfg.mw + 8 }}>
      <span
        style={{
          width: cfg.w,
          height: cfg.bh,
          borderRadius: 9999,
          background: "var(--color-hairline)",
          overflow: "hidden",
          display: "inline-block",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: `${pct}%`,
            height: "100%",
            display: "block",
            background: color,
            borderRadius: 9999,
            transition: "width 500ms cubic-bezier(.4,0,.2,1), background 500ms",
          }}
        />
      </span>
      <span
        style={{
          fontSize: cfg.fs,
          fontWeight: 600,
          fontFamily: "var(--font-mono), monospace",
          color,
          minWidth: cfg.mw,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pct}%
      </span>
    </span>
  );
}
