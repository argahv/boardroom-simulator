"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StanceRing } from "@/components/PersonaCard";
import { deleteStakeholder, fetchStakeholders } from "@/lib/api";
import { ARCHETYPES, ARCHETYPE_META, STANCE_CYCLE, STANCE_META, behaviourLine, fromStakeholder } from "@/lib/persona";
import type { AgentArchetype, AgentStance, Stakeholder } from "@/lib/types";
import { errorText, firstName } from "./_lib/files";

type StanceFilter = "all" | AgentStance;
type ArchetypeFilter = "all" | "none" | AgentArchetype;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Stakeholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [stance, setStance] = useState<StanceFilter>("all");
  const [archetype, setArchetype] = useState<ArchetypeFilter>("all");

  useEffect(() => {
    let alive = true;
    fetchStakeholders()
      .then((data) => { if (alive) setPersonas(data); })
      .catch((err: unknown) => { if (alive) setLoadError(errorText(err, "Couldn't load the library.")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reload]);

  const stanceCounts = useMemo(() => {
    const counts = new Map<AgentStance, number>();
    for (const p of personas) {
      const s = p.stance && STANCE_META[p.stance] ? p.stance : "neutral";
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return counts;
  }, [personas]);

  const archetypeCounts = useMemo(() => {
    const counts = new Map<AgentArchetype | "none", number>();
    for (const p of personas) {
      const a = p.archetype && ARCHETYPE_META[p.archetype] ? p.archetype : "none";
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    return counts;
  }, [personas]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return personas.filter((p) => {
      if (stance !== "all" && (p.stance ?? "neutral") !== stance) return false;
      if (archetype !== "all" && (p.archetype ?? "none") !== archetype) return false;
      if (!q) return true;
      return [p.name, p.role, p.focus, p.backstory].some((f) => (f ?? "").toLowerCase().includes(q));
    });
  }, [personas, query, stance, archetype]);

  const filtered = stance !== "all" || archetype !== "all" || query.trim() !== "";
  const anyArchetype = ARCHETYPES.some((a) => archetypeCounts.has(a));
  const clearFilters = () => {
    setQuery("");
    setStance("all");
    setArchetype("all");
  };

  const stanceOptions: FilterOption<StanceFilter>[] = [
    { value: "all", label: "Anyone" },
    ...STANCE_CYCLE.filter((s) => stanceCounts.has(s) || stance === s).map((s) => ({
      value: s,
      label: STANCE_META[s].label,
      count: stanceCounts.get(s) ?? 0,
      dot: STANCE_META[s].color,
    })),
  ];
  const archetypeOptions: FilterOption<ArchetypeFilter>[] = [
    { value: "all", label: "Any" },
    ...ARCHETYPES.filter((a) => archetypeCounts.has(a) || archetype === a).map((a) => ({
      value: a,
      label: ARCHETYPE_META[a].label,
      count: archetypeCounts.get(a) ?? 0,
      title: ARCHETYPE_META[a].description,
    })),
    ...(archetypeCounts.has("none") ? [{ value: "none" as const, label: "Not set", count: archetypeCounts.get("none") ?? 0 }] : []),
  ];

  const empty = !loading && !loadError && personas.length === 0;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Persona library</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-display sm:text-5xl">The people you negotiate with</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Each one remembers past meetings and can be seated in any simulation.
            </p>
          </div>
          {!empty && (
            <div className="text-sm font-semibold">
              <Link
                href="/personas/new"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-on-dark transition hover:bg-primary-active"
              >
                <span aria-hidden className="material-symbols-outlined text-[18px]">person_add</span>
                New persona
              </Link>
            </div>
          )}
        </header>

        {loadError && (
          <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-error-soft px-4 py-3 text-sm text-error">
            <span className="min-w-0 flex-1">{loadError}</span>
            <span className="text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setLoadError("");
                  setReload((n) => n + 1);
                }}
                className="min-h-8 cursor-pointer rounded-full border border-error/40 px-3 text-error transition hover:bg-error/10"
              >
                Try again
              </button>
            </span>
          </div>
        )}

        {personas.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="relative max-w-md">
              <span aria-hidden className="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-muted">search</span>
              <div className="text-sm">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, role or backstory"
                  aria-label="Search personas"
                  className="w-full rounded-full border border-hairline bg-surface-card/70 py-2.5 pl-10 pr-4 text-ink outline-none transition placeholder:text-muted/70 focus:border-primary"
                />
              </div>
            </div>
            <FilterRow label="Side" options={stanceOptions} value={stance} onChange={setStance} />
            {anyArchetype && <FilterRow label="Temperament" options={archetypeOptions} value={archetype} onChange={setArchetype} />}
          </div>
        )}

        {loading ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading personas">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <li key={i} className="h-44 animate-pulse rounded-2xl border border-hairline bg-surface-card p-4">
                <div className="flex gap-3">
                  <div className="h-11 w-11 rounded-full bg-ink/8" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 w-32 rounded bg-ink/8" />
                    <div className="h-3 w-24 rounded bg-ink/8" />
                  </div>
                </div>
                <div className="mt-5 h-3 w-3/4 rounded bg-ink/8" />
              </li>
            ))}
          </ul>
        ) : empty ? (
          <div className="rounded-2xl border-2 border-dashed border-hairline bg-surface-card/50 px-6 py-14 text-center">
            <p className="font-display text-2xl font-semibold">No personas yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Add someone you&apos;re about to negotiate with. &ldquo;Dana Okafor, CFO&rdquo; is enough to start.
            </p>
            <div className="mt-5 text-sm font-semibold">
              <Link
                href="/personas/new"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-on-dark transition hover:bg-primary-active"
              >
                <span aria-hidden className="material-symbols-outlined text-[18px]">person_add</span>
                Add your first persona
              </Link>
            </div>
          </div>
        ) : visible.length === 0 && personas.length > 0 ? (
          <div className="rounded-2xl border border-dashed border-hairline bg-surface-card/50 px-6 py-10 text-center text-sm text-muted">
            Nobody matches.{" "}
            <span className="font-semibold">
              <button type="button" onClick={clearFilters} className="cursor-pointer text-primary-active underline underline-offset-4">
                Clear filters
              </button>
            </span>
          </div>
        ) : (
          <>
            {filtered && (
              <p className="mb-3 text-xs text-muted" aria-live="polite">
                Showing {visible.length} of {plural(personas.length, "persona")}
              </p>
            )}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((p) => (
                <LibraryCard
                  key={p.id}
                  persona={p}
                  onDeleted={() => setPersonas((prev) => prev.filter((x) => x.id !== p.id))}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </AppShell>
  );
}

type FilterOption<T extends string> = { value: T; label: string; count?: number; dot?: string; title?: string };

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FilterOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold" role="group" aria-label={label}>
      <span className="mr-1 w-full font-mono text-[10px] uppercase tracking-[0.15em] text-muted sm:w-24">{label}</span>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            title={o.title}
            onClick={() => onChange(active && o.value !== "all" ? ("all" as T) : o.value)}
            className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 transition ${
              active ? "border-ink bg-ink text-on-dark" : "border-hairline bg-surface-card/60 text-muted hover:border-ink/30 hover:text-ink"
            }`}
          >
            {o.dot && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: o.dot }} />}
            {o.label}
            {o.count !== undefined && <span className={`font-mono font-normal ${active ? "text-on-dark/70" : "text-muted/80"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function LibraryCard({ persona, onDeleted }: { persona: Stakeholder; onDeleted: () => void }) {
  const draft = fromStakeholder(persona);
  const meta = STANCE_META[draft.stance];
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const href = `/personas/${encodeURIComponent(persona.id)}`;
  const sims = persona.sim_count ?? 0;

  const remove = async () => {
    setDeleting(true);
    setError("");
    try {
      await deleteStakeholder(persona.id);
      onDeleted();
    } catch (err) {
      setError(errorText(err, "Couldn't delete. Try again."));
      setDeleting(false);
    }
  };

  return (
    <li className="anim-slide-up group relative flex flex-col rounded-2xl border border-hairline bg-surface-card p-4 transition hover:border-primary/40 hover:shadow-sm focus-within:border-primary/40">
      <div className="flex items-start gap-3">
        <StanceRing stance={draft.stance} name={draft.name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            <span>{meta.label}</span>
            {draft.archetype && <span className="font-normal">· {ARCHETYPE_META[draft.archetype].label}</span>}
          </p>
          <h2 className="truncate font-display text-xl font-semibold leading-tight text-ink">
            {/* The stretched link makes the whole card open the persona; actions sit above it. */}
            <Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:underline">
              {draft.name || "Unnamed"}
            </Link>
          </h2>
          <p className="truncate text-sm text-muted">{draft.role || "No role yet"}</p>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-snug text-body-strong">{behaviourLine(draft)}</p>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <p className="min-w-0 flex-1 truncate text-xs text-muted">
          {sims > 0 ? plural(sims, "meeting") : "No meetings yet"}
          {persona.document_count !== undefined && persona.document_count > 0 && ` · ${plural(persona.document_count, "doc")}`}
        </p>
        <div className="relative z-10 flex shrink-0 items-center gap-1 text-xs font-semibold">
          <Link
            href={`/simulate/new?with=${encodeURIComponent(persona.id)}`}
            className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-primary-active transition hover:bg-primary-soft"
            title={`Start a meeting with ${draft.name}`}
          >
            <span aria-hidden className="material-symbols-outlined text-[16px]">play_arrow</span>
            Rehearse
          </Link>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${draft.name}`}
            title="Delete"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-error-soft hover:text-error"
          >
            <span aria-hidden className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>

      {confirming && (
        <div className="relative z-10 mt-3 rounded-xl bg-error-soft p-3" role="alertdialog" aria-label={`Delete ${draft.name}?`}>
          <p className="text-xs text-ink">
            Delete {draft.name ? firstName(draft.name) : "this persona"} from the library? Past simulations keep their transcripts.
          </p>
          {error && <p className="mt-1 text-xs font-semibold text-error">{error}</p>}
          <div className="mt-2 flex gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting}
              className="min-h-8 flex-1 cursor-pointer rounded-full bg-error px-3 text-on-dark transition hover:opacity-90 disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => { setConfirming(false); setError(""); }}
              disabled={deleting}
              autoFocus
              className="min-h-8 flex-1 cursor-pointer rounded-full border border-hairline bg-surface-card px-3 text-ink transition hover:bg-ink/5"
            >
              Keep
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
