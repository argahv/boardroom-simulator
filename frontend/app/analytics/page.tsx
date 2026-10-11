"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Chip, Icon } from "@/components/room/ui";
import { fetchInsights, type Insights } from "@/lib/api";
import { Overview, type Tab } from "./_parts/Overview";
import { Outcomes } from "./_parts/Outcomes";
import { People } from "./_parts/People";
import { Tactics } from "./_parts/Tactics";
import { Quality } from "./_parts/Quality";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "dashboard" },
  { id: "outcomes", label: "Outcomes", icon: "flag" },
  { id: "people", label: "People", icon: "groups" },
  { id: "tactics", label: "Tactics", icon: "swap_calls" },
  { id: "quality", label: "Run quality", icon: "verified" },
];

const RANGES: { days?: number; label: string }[] = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { label: "All time" },
];

const isTab = (v: string): v is Tab => TABS.some((t) => t.id === v);

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [days, setDays] = useState<number | undefined>(undefined);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The tab lives in the URL hash so a link can open, say, People directly.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (isTab(h)) setTab(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const open = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "overview" ? window.location.pathname : `#${t}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Bumped by "Try again" to refetch the same range.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    fetchInsights(days)
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch(() => { if (live) setError("Couldn't load analytics. Is the backend running?"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [days, attempt]);

  const pickRange = (d?: number) => {
    if (d === days) return;
    setLoading(true);
    setDays(d);
  };
  const retry = () => {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  };

  const empty = data && data.totals.meetings === 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif-title text-4xl font-semibold tracking-tight text-ink">Analytics</h1>
            <p className="mt-1 text-sm text-muted">What your meetings say so far: how they end, who drives them, what moves them.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <Chip key={r.label} active={days === r.days} onClick={() => pickRange(r.days)}>{r.label}</Chip>
            ))}
          </div>
        </header>

        <nav className="sticky top-16 z-10 -mx-4 mt-6 border-b border-hairline bg-canvas/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" aria-label="Analytics sections">
          <ul className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => open(t.id)} aria-current={tab === t.id ? "page" : undefined}
                  className={`relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 text-sm font-medium transition ${
                    tab === t.id ? "text-ink" : "text-muted hover:text-ink"
                  }`}>
                  <Icon name={t.icon} className="text-[18px]" />
                  {t.label}
                  {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className={`pt-6 transition-opacity ${loading && data ? "opacity-60" : ""}`} aria-busy={loading}>
          {error ? (
            <div className="mx-auto mt-12 max-w-md rounded-2xl bg-error-soft p-6 text-center">
              <p className="text-sm font-medium text-error">{error}</p>
              <button type="button" onClick={retry}
                className="mt-4 inline-flex min-h-10 cursor-pointer items-center rounded-full bg-primary px-5 text-sm font-semibold text-on-dark hover:bg-primary-active">
                Try again
              </button>
            </div>
          ) : !data ? (
            <div className="grid gap-3 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className={`anim-shimmer rounded-2xl bg-ink/5 ${i < 4 ? "h-24" : "h-48 lg:col-span-2"}`} />
              ))}
            </div>
          ) : empty ? (
            <div className="mx-auto mt-12 max-w-md text-center">
              <h2 className="font-serif-title text-2xl font-semibold text-ink">
                {days ? `No meetings in the last ${days} days` : "No meetings yet"}
              </h2>
              <p className="mt-2 text-sm text-muted">Run a meeting and this page fills in: how it ended, who held the floor, which moves paid off.</p>
              <div className="mt-6 flex justify-center gap-3 text-sm font-semibold">
                {days && (
                  <button type="button" onClick={() => pickRange(undefined)} className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-hairline px-5 text-ink hover:border-ink/30">
                    Show all time
                  </button>
                )}
                <Link href="/simulate/new" className="inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-on-dark hover:bg-primary-active">
                  New simulation
                </Link>
              </div>
            </div>
          ) : tab === "overview" ? (
            <Overview data={data} onOpen={open} />
          ) : tab === "outcomes" ? (
            <Outcomes data={data.outcomes} />
          ) : tab === "people" ? (
            <People data={data.people} />
          ) : tab === "tactics" ? (
            <Tactics data={data.tactics} />
          ) : (
            <Quality data={data.quality} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
