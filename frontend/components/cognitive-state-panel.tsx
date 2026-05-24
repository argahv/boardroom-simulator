"use client";

import React from "react";

interface EmotionState {
  anger: number;
  fear: number;
  joy: number;
  shame: number;
  surprise: number;
}

interface CognitiveStatePanelProps {
  agentId: string;
  emotions?: EmotionState;
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

export default function CognitiveStatePanel({
  agentId,
  emotions = { anger: 0.2, fear: 0.2, joy: 0.5, shame: 0.2, surprise: 0.2 },
  confidence = 0.5,
  certainty = 0.5,
  focus = "",
  goalPriority = 3,
}: CognitiveStatePanelProps) {
  const emotionEntries = Object.entries(emotions) as [string, number][];

  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3 text-sm">
      <div className="mb-2 font-semibold text-[var(--color-primary)]">
        Cognitive State — {agentId}
      </div>

      {/* Emotion bars */}
      <div className="mb-3 space-y-1.5">
        <div className="text-xs text-[var(--color-secondary)]">Emotions</div>
        {emotionEntries.map(([name, val]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="w-14 text-right text-xs capitalize">{name}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round(val * 100)}%`,
                  backgroundColor: EMOTION_COLORS[name] || "#888",
                }}
              />
            </div>
            <span className="w-8 text-right text-xs tabular-nums">
              {Math.round(val * 100)}%
            </span>
          </div>
        ))}
      </div>

      {/* Confidence & Certainty */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs">Confidence</span>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs tabular-nums">
            {Math.round(confidence * 100)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs">Certainty</span>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-purple-500 transition-all duration-300"
              style={{ width: `${Math.round(certainty * 100)}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs tabular-nums">
            {Math.round(certainty * 100)}%
          </span>
        </div>
      </div>

      {focus && (
        <div className="mt-2 text-xs text-[var(--color-secondary)]">
          Focus: <span className="font-medium text-[var(--color-primary)]">{focus}</span>
        </div>
      )}
    </div>
  );
}
