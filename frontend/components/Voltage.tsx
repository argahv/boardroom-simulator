"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

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
  const barRef = useRef<HTMLDivElement>(null);
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  useEffect(() => {
    if (!barRef.current) return;
    gsap.fromTo(
      barRef.current,
      { width: `${gsap.getProperty(barRef.current, "width")}px` },
      { width: `${pct}%`, duration: 0.6, ease: "power3.out" },
    );
  }, [pct]);

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
        ref={barRef}
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 9999,
        }}
      />
    </div>
  );
}
