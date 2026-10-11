"use client";

import { ExpandableText } from "@/components/ExpandableText";
import type { AgentPlan, PlanSubgoal } from "@/lib/use-simulation-state";

interface StrategicPlanPanelProps {
  plans?: Record<string, AgentPlan[]>;
  nameMap?: Record<string, string>;
}

/** The subgoal the agent is working on: in progress first, else the next pending one. */
function openSubgoal(subgoals: PlanSubgoal[] | undefined): PlanSubgoal | null {
  if (!subgoals?.length) return null;
  return (
    subgoals.find((s) => s.status === "in_progress") ??
    subgoals.find((s) => s.status === "pending") ??
    null
  );
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-success",
  completed: "bg-secondary",
  abandoned: "bg-muted",
};

export function StrategicPlanPanel({ plans, nameMap }: StrategicPlanPanelProps) {
  const byAgent = Object.entries(plans ?? {}).filter(([, agentPlans]) => agentPlans?.length > 0);
  const planCount = byAgent.reduce((n, [, p]) => n + p.length, 0);

  if (byAgent.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
        <span className="text-[13px] font-semibold text-ink">Strategic Plans</span>
        <div className="mt-2 flex h-[60px] items-center justify-center">
          <span className="text-[12px] italic text-muted">No active plans</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Strategic Plans</span>
        <span className="text-[11px] text-muted">
          {planCount} across {byAgent.length} {byAgent.length === 1 ? "agent" : "agents"}
        </span>
      </div>
      <div className="flex flex-col gap-[12px]">
        {byAgent.map(([agentId, agentPlans]) => (
          <div key={agentId}>
            <div className="mb-1.5 text-[12px] font-medium text-ink">{nameMap?.[agentId] ?? agentId}</div>
            <div className="flex flex-col gap-[8px]">
              {agentPlans.map((plan, i) => {
                const progress = plan.subgoal_count > 0 ? plan.completed_subgoals / plan.subgoal_count : 0;
                const next = openSubgoal(plan.subgoals);
                return (
                  <div key={`${plan.goal_text}-${i}`} className="rounded-lg border border-hairline bg-canvas px-3 py-[10px]">
                    <div className="mb-1 flex items-start gap-2">
                      <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[plan.status] ?? "bg-muted"}`} />
                      <p className="text-[11px] leading-relaxed text-ink/80">
                        <ExpandableText text={plan.goal_text} limit={150} />
                      </p>
                    </div>
                    {next && (
                      <div className="mb-1.5 rounded bg-ink/5 px-2 py-1 text-[11px] text-ink">
                        <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                          {next.status === "in_progress" ? "Working on" : "Next"}
                        </span>
                        {next.description}
                      </div>
                    )}
                    <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
                      <div className="h-full rounded-full bg-secondary" style={{ width: `${progress * 100}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted">
                      <span>{plan.completed_subgoals}/{plan.subgoal_count} subgoals done</span>
                      <span className="capitalize">{plan.status.replace("_", " ")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
