"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PersonaEditorV2, type PersonaEditorSubmitData } from "@/components/PersonaEditorV2";
import { createStakeholder } from "@/lib/api";
import type { Stakeholder } from "@/lib/types";

export default function NewPersonaPage() {
  const router = useRouter();
  const [error, setError] = useState("");

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
        incentive_tuning: 50,
      };
      await createStakeholder(payload);
      router.push("/personas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create persona");
    }
  };

  return (
    <AppShell activeTab="Personas">
      <div className="px-8 py-8">
        {error && (
          <div className="mb-6 rounded-2xl bg-primary/10 p-4 text-sm text-primary-active">{error}</div>
        )}
        <PersonaEditorV2
          initialData={null}
          onSubmit={handleSubmit}
          onCancel={() => router.push("/personas")}
        />
      </div>
    </AppShell>
  );
}
