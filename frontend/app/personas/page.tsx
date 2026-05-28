"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { AppShell } from "@/components/AppShell";
import { deleteStakeholder, fetchStakeholders } from "@/lib/api";
import type { AgentStance, Stakeholder } from "@/lib/types";

gsap.registerPlugin(useGSAP);

type ArchetypeFilter = "all" | "executive" | "technical" | "procurement" | "legal";

const ARCHETYPE_LABELS: Record<ArchetypeFilter, string> = {
  all: "All",
  executive: "Executive",
  technical: "Technical",
  procurement: "Procurement",
  legal: "Legal",
};

type StanceFilter = "all" | AgentStance;

const STANCE_LABELS: Record<StanceFilter, string> = {
  all: "All",
  champion: "Champion",
  detractor: "Detractor",
  neutral: "Neutral",
  moderator: "Moderator",
  wildcard: "Wildcard",
};

const STANCE_COLORS: Record<string, string> = {
  champion: "bg-green-100 text-green-800",
  detractor: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-700",
  moderator: "bg-blue-100 text-blue-800",
  wildcard: "bg-purple-100 text-purple-800",
};

const PERSONALITY_BAR_COLORS: Record<string, string> = {
  aggressiveness: "#f87171",
  empathy: "#34d399",
  stubbornness: "#fb923c",
  verbosity: "#60a5fa",
};

function PersonaCard({
  persona,
  slug,
  deleteConfirmId,
  onDelete,
  onSetDeleteConfirmId,
}: {
  persona: Stakeholder;
  slug: string;
  deleteConfirmId: string | null;
  onDelete: (id: string) => void;
  onSetDeleteConfirmId: (id: string | null) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={cardRef} data-anim="card">
      <div className="group rounded-3xl border border-ink/10 bg-white/40 p-5 transition hover:border-primary/50 hover:shadow-lg block">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-2xl font-semibold truncate">{persona.name}</h3>
            <p className="mt-0.5 text-sm text-muted truncate">{persona.role}</p>
            {persona.stance && (
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium mt-1 capitalize ${
                STANCE_COLORS[persona.stance] ?? "bg-gray-100 text-gray-700"
              }`}>
                {persona.stance}
              </span>
            )}
          </div>
          {persona.tag && (
            <span className="shrink-0 rounded-full bg-surface-card border border-hairline px-2.5 py-0.5 text-[10px] font-medium ml-2">
              {persona.tag}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mb-3 text-xs">
          <span className="flex items-center gap-1 text-muted">
            <span className="material-symbols-outlined text-[14px]">play_circle</span>
            {persona.sim_count ?? 0} sims
          </span>
          <span className="flex items-center gap-1 text-muted">
            <span className="material-symbols-outlined text-[14px]">forum</span>
            {persona.total_turns ?? 0} turns
          </span>
          <span className="flex items-center gap-1 text-muted">
            <span className="material-symbols-outlined text-[14px]">description</span>
            {persona.tools?.length ?? 0} docs
          </span>
        </div>

        {persona.focus && (
          <p className="text-xs text-muted leading-relaxed line-clamp-2 mb-4 italic">{persona.focus}</p>
        )}
        {persona.backstory && (
          <p className="text-xs text-muted italic line-clamp-2 mb-4">{persona.backstory}</p>
        )}

        {persona.templates && persona.templates.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            <span className="text-[10px] text-muted/60 mr-0.5">in:</span>
            {persona.templates.slice(0, 3).map((t: string) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/20">
                {t.replace(/-/g, ' ')}
              </span>
            ))}
            {persona.templates.length > 3 && (
              <span className="text-[10px] text-muted">+{persona.templates.length - 3}</span>
            )}
          </div>
        )}

        {persona.personality && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-4">
            {Object.entries(persona.personality).map(([trait, val]) => (
              <div key={trait} className="flex items-center gap-2">
                <span className="text-[10px] text-muted/70 capitalize w-16 shrink-0">{trait}</span>
                <div className="flex-1 h-1 rounded-full bg-gray-200">
                  <div className="h-full rounded-full" style={{
                    width: `${val}%`,
                    backgroundColor: PERSONALITY_BAR_COLORS[trait] ?? "#888",
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pending evolution badge */}
        {persona.evolution_pending && (
          <div className="mb-3">
            <span className="inline-block rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-[10px] font-medium">
              Pending evolution
            </span>
          </div>
        )}

        <Link
          href={`/personas/${slug}`}
          className="mb-3 block text-right text-xs font-medium text-primary hover:underline"
        >
          View profile →
        </Link>

        <div className="flex gap-2">
          <Link
            href={`/personas/${persona.id}/edit`}
            className="flex-1 rounded-full bg-surface-card px-4 py-2 text-sm font-medium text-center transition hover:bg-primary/10"
          >
            Edit
          </Link>
          <button
            onClick={() => onSetDeleteConfirmId(persona.id)}
            className="rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary-active transition hover:bg-primary/20"
          >
            Delete
          </button>
        </div>

        {deleteConfirmId === persona.id && (
          <div className="mt-3 rounded-2xl bg-primary/5 p-3">
            <p className="mb-2 text-xs text-muted">Delete this persona?</p>
            <div className="flex gap-2">
              <button
                onClick={() => onDelete(persona.id)}
                className="flex-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-canvas"
              >
                Confirm
              </button>
              <button
                onClick={() => onSetDeleteConfirmId(null)}
                className="flex-1 rounded-full bg-surface-card px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PersonasPage() {
  const router = useRouter();
  const [personas, setPersonas] = useState<Stakeholder[]>([]);
  const [filteredPersonas, setFilteredPersonas] = useState<Stakeholder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [archetypeFilter, setArchetypeFilter] = useState<ArchetypeFilter>("all");
  const [stanceFilter, setStanceFilter] = useState<StanceFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from("[data-anim='card']", {
        y: 24,
        opacity: 0,
        rotate: -1,
        duration: 0.45,
        ease: "back.out(1.7)",
        stagger: { amount: 0.35, from: "start" },
        clearProps: "transform",
      });
    });
    return () => mm.revert();
  }, { scope: gridRef, dependencies: [filteredPersonas] });

  const loadPersonas = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStakeholders();
      setPersonas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load personas");
    } finally {
      setLoading(false);
    }
  };

  const filterPersonas = () => {
    let filtered = personas;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.role.toLowerCase().includes(query) ||
          p.focus.toLowerCase().includes(query)
      );
    }

    if (archetypeFilter !== "all") {
      filtered = filtered.filter((p) => p.role.toLowerCase().includes(archetypeFilter));
    }

    if (stanceFilter !== "all") {
      filtered = filtered.filter((p) => p.stance === stanceFilter);
    }

    setFilteredPersonas(filtered);
  };

  useEffect(() => {
    loadPersonas();
  }, []);

  useEffect(() => {
    filterPersonas();
  }, [personas, searchQuery, archetypeFilter, stanceFilter]);

  const handleDelete = async (id: string) => {
    setError("");
    try {
      await deleteStakeholder(id);
      setDeleteConfirmId(null);
      loadPersonas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete persona");
    }
  };

  return (
    <AppShell activeTab="Personas">
      <div className="px-8 py-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">Strategic Archetypes</p>
        <h2 className="mt-3 font-display text-5xl font-semibold tracking-display">Persona Library</h2>
        <p className="mt-4 text-muted">
          Reusable stakeholder personas with behavioral patterns, incentives, and negotiation styles.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl bg-primary/10 p-4 text-sm text-primary-active">{error}</div>
      )}

      <div className="mb-6 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search personas..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-64 rounded-full border border-ink/10 bg-white/50 px-5 py-3 outline-none focus:border-primary"
        />
        <div className="flex gap-2">
          {(Object.keys(ARCHETYPE_LABELS) as ArchetypeFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setArchetypeFilter(filter)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                archetypeFilter === filter
                  ? "bg-primary text-canvas"
                  : "bg-surface-card text-muted hover:bg-primary/10"
              }`}
            >
              {ARCHETYPE_LABELS[filter]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(Object.keys(STANCE_LABELS) as StanceFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setStanceFilter(filter)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                stanceFilter === filter
                  ? "bg-primary text-canvas"
                  : "bg-surface-card text-muted hover:bg-primary/10"
              }`}
            >
              {STANCE_LABELS[filter]}
            </button>
          ))}
        </div>
      </div>

      {personas.length === 0 && !loading && (
        <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl">
          <p className="text-lg text-gray-500">No personas yet</p>
          <Link href="/personas/new" className="mt-4 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Create your first persona
          </Link>
        </div>
      )}

      {loading ? (
        <p className="text-center text-muted">Loading personas...</p>
      ) : (
        <div ref={gridRef} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPersonas.map((persona) => {
            return (
              <PersonaCard
                key={persona.id}
                persona={persona}
                slug={persona.id}
                deleteConfirmId={deleteConfirmId}
                onDelete={handleDelete}
                onSetDeleteConfirmId={setDeleteConfirmId}
              />
            );
          })}

          <Link
            href="/personas/new"
            className="flex min-h-64 items-center justify-center rounded-3xl border-2 border-dashed border-ink/20 bg-white/20 transition hover:border-primary hover:bg-white/30"
          >
            <div className="text-center">
              <div className="text-4xl text-primary">+</div>
              <p className="mt-2 font-semibold">Create New Persona</p>
            </div>
          </Link>
        </div>
      )}

      </div>

      <Link
        href="/personas/new"
        className="fixed bottom-8 right-8 flex h-14 items-center gap-2 rounded-full bg-primary px-6 shadow-2xl transition hover:bg-primary-active"
      >
        <span className="text-2xl text-canvas">+</span>
        <span className="font-semibold text-canvas">Create New Persona</span>
      </Link>
    </AppShell>
  );
}
