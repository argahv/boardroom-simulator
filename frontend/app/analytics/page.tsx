"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { fetchAnalyticsDashboard } from "@/lib/api";
import type { DashboardAnalytics } from "@/lib/types";
import {
  KpiHeroSection,
  SocialDynamicsSection,
  AgentIntelligenceSection,
  ActionDistributionSection,
  RelationshipNetworkSection,
  EmotionalAnalyticsSection,
  SimulationOutcomesSection,
  TemporalTimelineSection,
} from "@/components/analytics";
import { SectionErrorBoundary } from "@/components/analytics/SectionErrorBoundary";

const SECTION_LINKS = [
  { id: "kpi", label: "KPI" },
  { id: "social", label: "Social Dynamics" },
  { id: "agents", label: "Agents" },
  { id: "actions", label: "Actions" },
  { id: "network", label: "Network" },
  { id: "emotions", label: "Emotions" },
  { id: "outcomes", label: "Outcomes" },
  { id: "timeline", label: "Timeline" },
] as const;

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

const SKELETON_SECTIONS = [
  { id: "kpi", cols: "col-span-full" },
  { id: "social", cols: "col-span-full lg:col-span-6" },
  { id: "agent", cols: "col-span-full lg:col-span-6" },
  { id: "action", cols: "col-span-full lg:col-span-6" },
  { id: "relationship", cols: "col-span-full lg:col-span-6" },
  { id: "emotional", cols: "col-span-full lg:col-span-6" },
  { id: "outcomes", cols: "col-span-full lg:col-span-6" },
  { id: "timeline", cols: "col-span-full" },
] as const;

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={className ?? ""}>
      <div className="analytics-card h-[340px] flex flex-col">
        <div className="h-5 w-1/3 rounded bg-ink/8 anim-shimmer mb-6" />
        <div className="flex-1 rounded bg-ink/8 anim-shimmer" />
      </div>
    </div>
  );
}

function NavLink({ id, label }: { id: string; label: string }) {
  return (
    <a
      href={`#section-${id}`}
      className="whitespace-nowrap text-xs font-medium text-muted transition hover:text-ink"
    >
      {label}
    </a>
  );
}

function SectionHeading({ title, tooltip }: { title: string; tooltip: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <h2 className="analytics-card-title">{title}</h2>
      <button
        className="relative inline-flex items-center justify-center w-4 h-4 rounded-full bg-ink/10 text-[10px] text-muted font-bold hover:bg-ink/20 transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label={`Info about ${title}`}
      >
        ?
        {show && (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 rounded-lg bg-ink text-on-dark text-xs shadow-lg z-10 pointer-events-none">
            {tooltip}
          </span>
        )}
      </button>
    </div>
  );
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [showAll, setShowAll] = useState(false);
  const COLLAPSIBLE_SECTION_IDS = ['actions', 'network', 'emotions', 'outcomes', 'timeline'];
  const prevAnalyticsRef = useRef<DashboardAnalytics | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalyticsDashboard();
      setAnalytics(data);
      setLastRefreshed(new Date());
    } catch {
      setError("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Scroll-to-top on data change (skip initial mount)
  useEffect(() => {
    if (analytics && analytics !== prevAnalyticsRef.current) {
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      prevAnalyticsRef.current = analytics;
    }
  }, [analytics]);

  // ── Loading state (initial only) ──
  if (loading && !analytics) {
    return (
      <AppShell activeTab="Analytics">
        <div className="px-8 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-9 w-32 rounded bg-ink/8 anim-shimmer" />
              <div className="h-4 w-48 rounded bg-ink/8 anim-shimmer mt-2" />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {SKELETON_SECTIONS.map((s) => (
              <SkeletonCard key={s.id} className={s.cols} />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <AppShell activeTab="Analytics">
        <div className="px-8 py-8">
          <h1 className="font-display text-4xl font-semibold tracking-display">
            Analytics
          </h1>
          <p className="text-sm text-muted mt-1">Cross-simulation insights</p>
          <div className="mt-20 flex flex-col items-center justify-center text-center">
            <div className="rounded-xl bg-error-soft p-6 max-w-md w-full">
              <p className="text-sm text-error font-medium">{error}</p>
              <button
                onClick={loadData}
                disabled={loading}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-dark transition hover:bg-primary-active active:scale-[0.97] duration-150 disabled:opacity-50"
              >
                {loading ? "Retrying\u2026" : "Retry"}
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Empty state ──
  if (!analytics || analytics.kpi.total_simulations === 0) {
    return (
      <AppShell activeTab="Analytics">
        <div className="px-8 py-8">
          <h1 className="font-display text-4xl font-semibold tracking-display">
            Analytics
          </h1>
          <p className="text-sm text-muted mt-1">Cross-simulation insights</p>
          <div className="mt-20 flex flex-col items-center justify-center text-center analytics-empty">
            <h3 className="font-display text-2xl font-semibold text-muted">
              No simulations yet
            </h3>
            <p className="mt-2 text-sm text-muted/70 max-w-md">
              Run your first simulation to unlock cross-session insights, persona
              trends, and stance distributions.
            </p>
            <Link
              href="/simulate/new"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-dark transition hover:bg-primary-active active:scale-[0.97] duration-150"
            >
              Start a Simulation
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Data state ──
  return (
    <AppShell activeTab="Analytics">
      <div className="px-8 py-8 space-y-0">
        {/* Page heading */}
        <div className="flex items-start justify-between pb-6">
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-display">
              Analytics
            </h1>
            <p className="text-sm text-muted mt-1">Cross-simulation insights</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastRefreshed && (
              <p className="text-xs text-muted tabular-nums">
                Last refreshed {formatRelativeTime(lastRefreshed)}
              </p>
            )}
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-container-low active:scale-[0.97] duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Refresh analytics"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={loading ? "animate-spin" : ""}
              >
                <path d="M21 12a9 9 0 1 1-9-9" />
                <path d="M21 3v6h-6" />
              </svg>
              {loading ? "Loading\u2026" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Sticky section anchor nav */}
        <div className="sticky top-0 z-10 -mx-8 border-b border-hairline bg-canvas/90 backdrop-blur-sm">
          <nav
            className="flex items-center gap-6 overflow-x-auto px-8 py-3"
            aria-label="Section quick nav"
          >
            {SECTION_LINKS.map((link) => (
              <NavLink key={link.id} id={link.id} label={link.label} />
            ))}
          </nav>
        </div>

        {/* Section grid — all 8 sections in a single 12-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6">
          {/* KPI Hero — full width */}
          <section
            id="section-kpi"
            className="col-span-full analytics-section anim-stagger"
            aria-label="Key performance indicators"
          >
            <SectionHeading title="KPI Overview" tooltip="Key metrics across all simulations — volume, intensity, and completion trends" />
            <SectionErrorBoundary title="KPI Overview">
              <KpiHeroSection data={analytics.kpi} />
            </SectionErrorBoundary>
          </section>

          <section
            id="section-social"
            className="col-span-full lg:col-span-6 analytics-section anim-stagger"
            aria-label="Social dynamics"
          >
            <div className="analytics-card">
              <SectionHeading title="Social Dynamics" tooltip="How trust, tension, and leverage evolved over each simulation's timeline" />
              <SectionErrorBoundary title="Social Dynamics">
                <SocialDynamicsSection data={analytics.social_dynamics} />
              </SectionErrorBoundary>
            </div>
          </section>

          <section
            id="section-agents"
            className="col-span-full lg:col-span-6 analytics-section anim-stagger"
            aria-label="Agent intelligence"
          >
            <div className="analytics-card">
              <SectionHeading title="Agent Intelligence" tooltip="Cross-simulation performance breakdown for every participant" />
              <SectionErrorBoundary title="Agent Intelligence">
                <AgentIntelligenceSection data={analytics.agent_intelligence} />
              </SectionErrorBoundary>
            </div>
          </section>

          {/* Progressive disclosure toggle */}
          {!showAll && COLLAPSIBLE_SECTION_IDS.length > 0 && (
            <div className="col-span-full text-center py-8">
              <button
                onClick={() => setShowAll(true)}
                className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-6 py-3 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
              >
                Show all {COLLAPSIBLE_SECTION_IDS.length + 3} sections
              </button>
            </div>
          )}

          {showAll && (
          <section
            id="section-actions"
            className="col-span-full lg:col-span-6 analytics-section anim-stagger"
            aria-label="Action distribution"
          >
            <div className="analytics-card">
              <SectionHeading title="Action Distribution" tooltip="How agents acted — which negotiation tactics were used most" />
              <SectionErrorBoundary title="Action Distribution">
                <ActionDistributionSection data={analytics.action_distribution} />
              </SectionErrorBoundary>
            </div>
          </section>
          )}

          {showAll && (
          <section
            id="section-network"
            className="col-span-full lg:col-span-6 analytics-section anim-stagger"
            aria-label="Relationship network"
          >
            <div className="analytics-card">
              <SectionHeading title="Relationship Network" tooltip="Force-directed graph of agent relationships based on trust and rivalry scores" />
              <SectionErrorBoundary title="Relationship Network">
                <RelationshipNetworkSection data={analytics.relationship_network} />
              </SectionErrorBoundary>
            </div>
          </section>
          )}

          {showAll && (
          <section
            id="section-emotions"
            className="col-span-full lg:col-span-6 analytics-section anim-stagger"
            aria-label="Emotional analytics"
          >
            <div className="analytics-card">
              <SectionHeading title="Emotional Analytics" tooltip="Aggregate emotional states: anger, fear, joy, shame, surprise across agents and turns" />
              <SectionErrorBoundary title="Emotional Analytics">
                <EmotionalAnalyticsSection data={analytics.emotional_analytics} />
              </SectionErrorBoundary>
            </div>
          </section>
          )}

          {showAll && (
          <section
            id="section-outcomes"
            className="col-span-full lg:col-span-6 analytics-section anim-stagger"
            aria-label="Simulation outcomes"
          >
            <div className="analytics-card">
              <SectionHeading title="Simulation Outcomes" tooltip="How simulations ended — status distribution, voltage patterns, and model temperature effects" />
              <SectionErrorBoundary title="Simulation Outcomes">
                <SimulationOutcomesSection data={analytics.simulation_outcomes} />
              </SectionErrorBoundary>
            </div>
          </section>
          )}

          {/* Timeline — full width */}
          {showAll && (
          <section
            id="section-timeline"
            className="col-span-full analytics-section anim-stagger"
            aria-label="Temporal timeline"
          >
            <div className="analytics-card">
              <SectionHeading title="Temporal Timeline" tooltip="Chronological log of key events, turning points, and topic frequency across all simulations" />
              <SectionErrorBoundary title="Temporal Timeline">
                <TemporalTimelineSection data={analytics.temporal_timeline} />
              </SectionErrorBoundary>
            </div>
          </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
