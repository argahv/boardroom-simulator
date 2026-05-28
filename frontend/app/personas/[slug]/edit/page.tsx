"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PersonaEditor, type PersonaEditorSubmitData } from "@/components/PersonaEditor";
import { fetchStakeholders, updateStakeholder } from "@/lib/api";
import type { Stakeholder } from "@/lib/types";

type PageProps = { params: Promise<{ slug: string }> };

export default function EditPersonaPage({ params }: PageProps) {
  const { slug } = use(params);
  const router = useRouter();
  const [persona, setPersona] = useState<Stakeholder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchStakeholders()
      .then((all) => {
        const found = all.find((p: Stakeholder) => p.id === slug);
        if (alive) {
          if (found) setPersona(found);
          else setError("Persona not found");
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (alive) {
          setError(e instanceof Error ? e.message : "Failed to load persona");
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, [slug]);

  const handleSubmit = async (data: PersonaEditorSubmitData) => {
    setError("");
    try {
      const payload: Stakeholder = {
        id: data.id,
        name: data.name,
        role: data.role,
        focus: data.focus ?? "",
        backstory: data.backstory,
        stance: data.stance,
        personality: data.personality,
        hidden_agenda: data.hidden_agenda,
        tools: data.tools,
        tag: data.tag ?? null,
        incentive_tuning: persona?.incentive_tuning ?? 50,
      };
      await updateStakeholder(slug, payload);
      router.push("/personas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update persona");
    }
  };

  return (
    <AppShell activeTab="Personas">
      <div className="px-8 py-8">
        <Link href="/personas" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink transition mb-6">
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back to Personas
        </Link>

        {error && (
          <div className="mb-6 rounded-2xl bg-primary/10 p-4 text-sm text-primary-active">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center gap-3 text-muted text-sm">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Loading persona...
          </div>
        ) : persona ? (
          <PersonaEditor
            initialData={{
              id: persona.id,
              name: persona.name,
              role: persona.role,
              focus: persona.focus,
              backstory: persona.backstory ?? "",
              stance: persona.stance ?? "neutral",
              personality: persona.personality ?? { aggressiveness: 50, empathy: 50, stubbornness: 50, verbosity: 50 },
              hidden_agenda: persona.hidden_agenda ?? "",
              tools: persona.tools ?? [],
              tag: persona.tag ?? undefined,
            }}
            onSubmit={handleSubmit}
            onCancel={() => router.push("/personas")}
          />
        ) : (
          <p className="text-sm text-muted">Persona not found.</p>
        )}
      </div>
    </AppShell>
  );
}
