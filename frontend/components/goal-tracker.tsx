"use client";

import React from "react";

interface Goal {
  text: string;
  priority: number;
  confidence: number;
}

interface GoalTrackerProps {
  goals?: Goal[];
}

export default function GoalTracker({ goals = [] }: GoalTrackerProps) {
  if (goals.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-secondary)]">
        No active goals
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3 text-sm">
      <div className="mb-2 font-semibold text-[var(--color-primary)]">
        Active Goals
      </div>
      <div className="space-y-2">
        {goals.map((goal, i) => (
          <div key={i} className="border-l-2 border-blue-500 pl-2">
            <div className="text-xs font-medium">{goal.text}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-secondary)]">Priority</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${(goal.priority / 5) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-secondary)]">Confidence</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{ width: `${goal.confidence * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
