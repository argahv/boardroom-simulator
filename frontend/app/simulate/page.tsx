"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { fetchSimulationJobs, fetchSimulations, retryJob } from "@/lib/api";
import type { AsyncJob, SimulationState } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  idle: "bg-accent-amber/20 text-accent-amber",
  running: "bg-accent-teal/20 text-accent-teal",
  complete: "bg-green-500/20 text-green-700",
};

const JOB_STATUS_STYLE: Record<string, string> = {
  queued: "bg-accent-amber/20 text-accent-amber",
  running: "bg-accent-teal/20 text-accent-teal",
  succeeded: "bg-green-500/20 text-green-700",
  failed: "bg-primary/20 text-primary-active",
};

export default function SimulationsPage() {
  const [items, setItems] = useState<SimulationState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [jobsBySimulation, setJobsBySimulation] = useState<Record<string, AsyncJob[]>>({});
  const [loadingJobsFor, setLoadingJobsFor] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSimulations()
      .then((data) => {
        if (!alive) return;
        setItems(data);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load simulations.");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => b.turns.length - a.turns.length);
  }, [items]);

  const loadJobs = async (simulationId: string) => {
    setLoadingJobsFor(simulationId);
    try {
      const res = await fetchSimulationJobs(simulationId);
      setJobsBySimulation((prev) => ({ ...prev, [simulationId]: res.jobs }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs.");
    } finally {
      setLoadingJobsFor(null);
    }
  };

  const retry = async (jobId: string, simulationId: string) => {
    setRetryingJobId(jobId);
    try {
      await retryJob(jobId);
      await loadJobs(simulationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry job.");
    } finally {
      setRetryingJobId(null);
    }
  };

  return (
    <AppShell activeTab="War Room">
      <div className="px-8 py-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Simulations</p>
          <h2 className="mt-2 font-display text-4xl font-normal tracking-display text-ink">War Room Sessions</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted leading-relaxed">
            Browse active and completed simulations. Open detail view for live stream and postmortem.
          </p>
        </div>
        <Link href="/simulate/new">
          <Button>Create Simulation</Button>
        </Link>
      </div>

      {error && (
        <div className="mb-5 rounded-xl bg-primary/10 p-4 text-sm text-primary-active" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl border border-ink/10 bg-surface-card p-5 animate-pulse">
              <div className="h-4 w-28 rounded bg-ink/10" />
              <div className="mt-3 h-6 w-3/4 rounded bg-ink/10" />
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full rounded bg-ink/10" />
                <div className="h-3 w-5/6 rounded bg-ink/10" />
              </div>
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/20 bg-surface-card p-10 text-center">
          <p className="text-sm text-muted">No simulations yet.</p>
          <div className="mt-4">
            <Link href="/simulate/new">
              <Button>Create your first simulation</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((sim) => {
            const goal = sim.config.primary_goal || "No goal provided";
            const statusStyle = STATUS_STYLE[sim.status] ?? "bg-canvas/10 text-canvas/70";
            return (
              <article key={sim.simulation_id} className="rounded-xl border border-ink/10 bg-surface-card p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${statusStyle}`}>
                    {sim.status}
                  </span>
                  <span className="text-xs text-muted">{sim.turns.length} turns</span>
                </div>

                <h3 className="font-display text-2xl tracking-display text-ink line-clamp-2">
                  {sim.config.background.slice(0, 70)}
                </h3>
                <p className="mt-2 text-sm text-muted leading-relaxed line-clamp-3">{goal}</p>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted">
                  <div>
                    <p className="uppercase tracking-wider text-muted">Stakeholders</p>
                    <p className="mt-1 font-semibold text-ink">{sim.config.stakeholders.length}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider text-muted">Voltage</p>
                    <p className="mt-1 font-semibold text-ink">{sim.config.voltage}%</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-ink/10 bg-canvas/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Jobs</p>
                    <Button
                      variant="ghost"
                      onClick={() => loadJobs(sim.simulation_id)}
                      disabled={loadingJobsFor === sim.simulation_id}
                    >
                      {loadingJobsFor === sim.simulation_id ? "Loading..." : "Refresh"}
                    </Button>
                  </div>

                  {jobsBySimulation[sim.simulation_id]?.length ? (
                    <div className="space-y-2">
                      {jobsBySimulation[sim.simulation_id].slice(0, 3).map((job) => (
                        <div key={job.id} className="rounded-md border border-ink/10 bg-white/40 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono text-ink/70">{job.type}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${JOB_STATUS_STYLE[job.status] ?? "bg-canvas/10 text-canvas/70"}`}>
                              {job.status}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[11px] text-muted">{job.id}</p>
                          {job.status === "failed" && (
                            <div className="mt-2">
                              <Button
                                onClick={() => retry(job.id, sim.simulation_id)}
                                disabled={retryingJobId === job.id}
                              >
                                {retryingJobId === job.id ? "Retrying..." : "Retry"}
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">No jobs loaded. Click refresh.</p>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href={`/simulate/${sim.simulation_id}`}>
                    <Button>Open War Room</Button>
                  </Link>
                  <Link href={`/simulate/${sim.simulation_id}/postmortem`}>
                    <Button variant="ghost">Postmortem</Button>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
      </div>
    </AppShell>
  );
}
