"use client";

import { ExpandableText } from "@/components/ExpandableText";

interface PlanEntry {
  goal_text: string;
  status: string;
  confidence: number;
  subgoal_count: number;
  completed_subgoals: number;
}

interface StrategicPlanPanelProps {
  plans?: Record<string, PlanEntry[]>;
  nameMap?: Record<string, string>;
}

export function StrategicPlanPanel({ plans, nameMap }: StrategicPlanPanelProps) {
  if (!plans || Object.keys(plans).length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
        <span className="text-[13px] font-semibold text-ink">Strategic Plans</span>
        <div className="mt-2 flex h-[60px] items-center justify-center">
          <span className="text-[12px] italic text-muted">No active plans</span>
        </div>
      </div>
    );
  }

  const allPlans = Object.entries(plans).flatMap(([agentId, agentPlans]) =>
    agentPlans.map(p => ({ agentId, ...p }))
  );

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Strategic Plans</span>
        <span className="text-[11px] text-muted">{allPlans.length} active</span>
      </div>
      <div className="flex flex-col gap-[10px]">
        {allPlans.map((plan, i) => {
          const name = nameMap?.[plan.agentId] ?? plan.agentId;
          const progress = plan.subgoal_count > 0 ? plan.completed_subgoals / plan.subgoal_count : 0;
          return (
            <div key={i} className="rounded-lg border border-hairline bg-canvas px-3 py-[10px]">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${plan.status === 'active' ? 'bg-success' : 'bg-muted'}`} />
                  <span className="text-[12px] font-medium text-ink">{name}</span>
                </div>
                <span className="font-mono text-[10px] text-muted">{Math.round(plan.confidence * 100)}%</span>
              </div>
              <p className="mb-1.5 text-[11px] text-ink/80 leading-relaxed"><ExpandableText text={plan.goal_text} limit={150} /></p>
              <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
                <div className="h-full rounded-full bg-secondary" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted">
                <span>{plan.completed_subgoals}/{plan.subgoal_count} subgoals</span>
                <span className="capitalize">{plan.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
