"use client";

import React from "react";

interface CognitiveStatePanelProps {
  agentId: string;
  emotions?: Record<string, number>;
  /** Accepted for existing callers but not shown: it is seeded from empathy, not a live state. */
  confidence?: number;
  certainty?: number;
  focus?: string;
  goalPriority?: number;
}

const EMOTION_COLORS: Record<string, string> = {
  anger: "#ef4444",
  fear: "#a855f7",
  joy: "#22c55e",
  shame: "#f59e0b",
  surprise: "#3b82f6",
};

const EMOTION_ORDER = ["anger", "fear", "joy", "shame", "surprise"];

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-right text-xs capitalize">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right text-xs tabular-nums">{pct}%</span>
    </div>
  );
}

export default function CognitiveStatePanel({ agentId, emotions, certainty, focus }: CognitiveStatePanelProps) {
  const emotionEntries = Object.entries(emotions ?? {})
    .filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]))
    .sort(([a], [b]) => {
      const ia = EMOTION_ORDER.indexOf(a);
      const ib = EMOTION_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const hasCertainty = typeof certainty === "number" && Number.isFinite(certainty);
  const hasData = emotionEntries.length > 0 || hasCertainty || !!focus;

  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3 text-sm">
      <div className="mb-2 font-semibold text-[var(--color-primary)]">
        Cognitive State — {agentId}
      </div>

      {!hasData && (
        <div className="py-3 text-center text-xs italic text-[var(--color-muted)]">
          No state snapshot for this agent yet
        </div>
      )}

      {emotionEntries.length > 0 && (
        <div className="mb-3 space-y-1.5">
          <div className="text-xs text-[var(--color-secondary)]">Emotions</div>
          {emotionEntries.map(([name, val]) => (
            <Bar key={name} label={name} value={val} color={EMOTION_COLORS[name] || "#888"} />
          ))}
        </div>
      )}

      {hasCertainty && (
        <div
          className="space-y-1.5"
          title="Seeded from stubbornness; drops when questioned, rises when compromises land"
        >
          <Bar label="Certainty" value={certainty} color="#a855f7" />
        </div>
      )}

      {focus && (
        <div className="mt-2 text-xs text-[var(--color-secondary)]">
          Focus: <span className="font-medium text-[var(--color-primary)]">{focus}</span>
        </div>
      )}
    </div>
  );
}
