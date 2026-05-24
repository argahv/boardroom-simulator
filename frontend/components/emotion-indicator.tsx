"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

interface EmotionIndicatorProps {
  emotions: Record<string, number>;
  size?: "sm" | "md" | "lg";
}

const EMOTION_ICONS: Record<string, string> = {
  anger: "😠",
  fear: "😨",
  joy: "😊",
  shame: "😳",
  surprise: "😮",
};

const EMOTION_COLORS: Record<string, string> = {
  anger: "#ef4444",
  fear: "#a855f7",
  joy: "#22c55e",
  shame: "#f59e0b",
  surprise: "#3b82f6",
};

export default function EmotionIndicator({ emotions, size = "md" }: EmotionIndicatorProps) {
  const entries = Object.entries(emotions).filter(([_, v]) => v > 0.3);
  const dominant = entries.length > 0
    ? entries.reduce((a, b) => (a[1] > b[1] ? a : b))
    : null;

  const dotSize = size === "sm" ? 8 : size === "lg" ? 16 : 12;

  const dotRef = useRef<HTMLSpanElement>(null);

  // Pulse animation when dominant emotion changes
  useEffect(() => {
    if (!dotRef.current || !dominant) return;
    gsap.fromTo(
      dotRef.current,
      { scale: 1.4, opacity: 0.7 },
      { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)" },
    );
  }, [dominant?.[0]]);

  if (dominant) {
    return (
      <span
        className="inline-flex items-center gap-1"
        title={`${dominant[0]}: ${Math.round(dominant[1] * 100)}%`}
      >
        <span
          ref={dotRef}
          className="inline-block rounded-full"
          style={{
            width: dotSize,
            height: dotSize,
            backgroundColor: EMOTION_COLORS[dominant[0]] || "#888",
          }}
        />
        {size !== "sm" && (
          <span className="text-xs capitalize text-[var(--color-secondary)]">
            {dominant[0]}
          </span>
        )}
      </span>
    );
  }

  return null;
}
