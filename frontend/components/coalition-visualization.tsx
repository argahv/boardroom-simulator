"use client";

import React from "react";

interface Coalition {
  agentA: string;
  agentB: string;
  issue: string;
  strength: number;
}

interface CoalitionVisualizationProps {
  coalitions?: Coalition[];
}

export default function CoalitionVisualization({ coalitions = [] }: CoalitionVisualizationProps) {
  if (coalitions.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-secondary)]">
        No active coalitions
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3 text-sm">
      <div className="mb-2 font-semibold text-[var(--color-primary)]">Coalitions</div>
      <div className="space-y-2">
        {coalitions.map((c, i) => (
          <div key={i} className="flex items-center gap-2 rounded bg-[var(--color-bg)] p-2">
            <span className="font-medium">{c.agentA}</span>
            <span className="text-[var(--color-secondary)]">⇄</span>
            <span className="font-medium">{c.agentB}</span>
            <div className="ml-auto flex items-center gap-1">
              <div className="h-2 w-12 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${c.strength * 100}%` }} />
              </div>
              <span className="text-xs tabular-nums">{Math.round(c.strength * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
      {coalitions.some((c) => c.issue) && (
        <div className="mt-2 space-y-1">
          {coalitions.filter((c) => c.issue).map((c, i) => (
            <div key={i} className="text-xs text-[var(--color-secondary)]">
              {c.agentA}+{c.agentB}: {c.issue}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
