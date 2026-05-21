"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { createStakeholder, deleteStakeholder, fetchStakeholders, updateStakeholder } from "@/lib/api";
import type { Stakeholder } from "@/lib/types";

type ArchetypeFilter = "all" | "executive" | "technical" | "procurement" | "legal";

const ARCHETYPE_LABELS: Record<ArchetypeFilter, string> = {
  all: "All",
  executive: "Executive",
  technical: "Technical",
  procurement: "Procurement",
  legal: "Legal",
};

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Stakeholder[]>([]);
  const [filteredPersonas, setFilteredPersonas] = useState<Stakeholder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [archetypeFilter, setArchetypeFilter] = useState<ArchetypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Stakeholder | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    role: "",
    focus: "",
    tag: "",
    incentive_tuning: 50,
    hidden_agenda: "",
  });

  useEffect(() => {
    loadPersonas();
  }, []);

  useEffect(() => {
    filterPersonas();
  }, [personas, searchQuery, archetypeFilter]);

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

    setFilteredPersonas(filtered);
  };

  const openCreateModal = () => {
    setEditingPersona(null);
    setFormData({
      name: "",
      role: "",
      focus: "",
      tag: "",
      incentive_tuning: 50,
      hidden_agenda: "",
    });
    setShowModal(true);
  };

  const openEditModal = (persona: Stakeholder) => {
    setEditingPersona(persona);
    setFormData({
      name: persona.name,
      role: persona.role,
      focus: persona.focus,
      tag: persona.tag || "",
      incentive_tuning: persona.incentive_tuning,
      hidden_agenda: persona.hidden_agenda,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (editingPersona) {
        await updateStakeholder(editingPersona.id, {
          ...editingPersona,
          ...formData,
        });
      } else {
        await createStakeholder({
          ...formData,
          id: `persona-${Date.now()}`,
        });
      }
      setShowModal(false);
      loadPersonas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save persona");
    }
  };

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
      </div>

      {loading ? (
        <p className="text-center text-muted">Loading personas...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPersonas.map((persona) => (
            <div
              key={persona.id}
              className="group rounded-3xl border border-ink/10 bg-white/40 p-5 transition hover:border-primary/50 hover:shadow-lg"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-display text-2xl font-semibold">{persona.name}</h3>
                  <p className="mt-1 text-sm text-muted">{persona.role}</p>
                </div>
                {persona.tag && (
                  <span className="rounded-full bg-surface-card px-3 py-1 text-xs font-medium">
                    {persona.tag}
                  </span>
                )}
              </div>

              <p className="mb-4 text-sm text-muted italic">{persona.focus}</p>

              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(persona)}
                  className="flex-1 rounded-full bg-surface-card px-4 py-2 text-sm font-medium transition hover:bg-primary/10"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteConfirmId(persona.id)}
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
                      onClick={() => handleDelete(persona.id)}
                      className="flex-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-canvas"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="flex-1 rounded-full bg-surface-card px-3 py-1.5 text-xs font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <button
            onClick={openCreateModal}
            className="flex min-h-64 items-center justify-center rounded-3xl border-2 border-dashed border-ink/20 bg-white/20 transition hover:border-primary hover:bg-white/30"
          >
            <div className="text-center">
              <div className="text-4xl text-primary">+</div>
              <p className="mt-2 font-semibold">Create New Persona</p>
            </div>
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-canvas p-8 shadow-2xl">
            <h3 className="font-display text-3xl font-semibold">
              {editingPersona ? "Edit Persona" : "Create New Persona"}
            </h3>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-muted">Name</span>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 outline-none focus:border-primary"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-muted">Role</span>
                <input
                  type="text"
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 outline-none focus:border-primary"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-muted">Focus Area</span>
                <input
                  type="text"
                  required
                  value={formData.focus}
                  onChange={(e) => setFormData({ ...formData, focus: e.target.value })}
                  className="rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 outline-none focus:border-primary"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-muted">Tag (optional)</span>
                <input
                  type="text"
                  value={formData.tag}
                  onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
                  className="rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 outline-none focus:border-primary"
                  placeholder="e.g., EXEC-01"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-muted">
                  Incentive Tuning: {formData.incentive_tuning}
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.incentive_tuning}
                  onChange={(e) => setFormData({ ...formData, incentive_tuning: Number(e.target.value) })}
                  className="accent-primary"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-muted">Hidden Agenda (optional)</span>
                <textarea
                  value={formData.hidden_agenda}
                  onChange={(e) => setFormData({ ...formData, hidden_agenda: e.target.value })}
                  className="min-h-24 rounded-2xl border border-ink/10 bg-white/50 px-4 py-3 outline-none focus:border-primary"
                  placeholder="Secret motivations or constraints..."
                />
              </label>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-full bg-surface-card px-6 py-3 font-medium transition hover:bg-ink/10"
                >
                  Cancel
                </button>
                <Button type="submit" className="flex-1">
                  {editingPersona ? "Save Changes" : "Create Persona"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button
        onClick={openCreateModal}
        className="fixed bottom-8 right-8 flex h-14 items-center gap-2 rounded-full bg-primary px-6 shadow-2xl transition hover:bg-primary-active"
      >
        <span className="text-2xl text-canvas">+</span>
        <span className="font-semibold text-canvas">Create New Persona</span>
      </button>
    </AppShell>
  );
}
