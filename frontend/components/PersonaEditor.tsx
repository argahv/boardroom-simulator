"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/Button";
import type { AgentStance, PersonalityProfile, AgentConfig, DocumentMeta } from "@/lib/types";
import { uploadPersonaDocument, listPersonaDocuments, deletePersonaDocument } from "@/lib/api";

const STANCES: AgentStance[] = ["champion", "detractor", "neutral", "moderator", "wildcard"];
const TOOL_OPTIONS = ["legal", "financial", "technical", "comms", "none"] as const;
const TRAITS: (keyof PersonalityProfile)[] = [
  "aggressiveness",
  "empathy",
  "stubbornness",
  "verbosity",
];

const TRAIT_LABELS: Record<keyof PersonalityProfile, string> = {
  aggressiveness: "Aggressiveness",
  empathy: "Empathy",
  stubbornness: "Stubbornness",
  verbosity: "Verbosity",
};

const TRAIT_COLORS: Record<string, string> = {
  aggressiveness: "#ed6f5c",  /* chart-1 coral */
  empathy: "#3d9e8c",        /* chart-2 teal */
  stubbornness: "#c9952e",   /* chart-3 amber */
  verbosity: "#4f8bc9",      /* chart-4 blue */
};

const DEFAULT_PERSONALITY: PersonalityProfile = {
  aggressiveness: 50,
  empathy: 50,
  stubbornness: 50,
  verbosity: 50,
};

export type PersonaEditorSubmitData = AgentConfig & {
  focus?: string;
  tag?: string;
};

type PersonaEditorProps = {
  onSubmit: (data: PersonaEditorSubmitData) => void;
  initialData?: (AgentConfig & { focus?: string; tag?: string }) | null;
  onCancel: () => void;
};

const STEPS = ["Identity", "Personality", "Tools & Agenda", "Review"] as const;

export function PersonaEditor({
  onSubmit,
  initialData,
  onCancel,
}: PersonaEditorProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialData?.name ?? "");
  const [role, setRole] = useState(initialData?.role ?? "");
  const [focus, setFocus] = useState(initialData?.focus ?? "");
  const [backstory, setBackstory] = useState(initialData?.backstory ?? "");
  const [stance, setStance] = useState<AgentStance>(
    initialData?.stance ?? "neutral"
  );
  const _initialPersonality: PersonalityProfile = (() => {
    const raw = initialData?.personality;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as PersonalityProfile;
    if (typeof raw === "string") try { return JSON.parse(raw); } catch { return { ...DEFAULT_PERSONALITY }; }
    return { ...DEFAULT_PERSONALITY };
  })();
  const [personality, setPersonality] = useState<PersonalityProfile>(_initialPersonality);
  const [hiddenAgenda, setHiddenAgenda] = useState(initialData?.hidden_agenda ?? "");
  const _initialTools: string[] = (() => {
    const raw = initialData?.tools;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") try { return JSON.parse(raw); } catch { return []; }
    return [];
  })();
  const [tools, setTools] = useState<string[]>(_initialTools);
  const [tag, setTag] = useState(initialData?.tag ?? "");

  const isEdit = !!initialData?.id;
  const personaId = initialData?.id;

  // Documents (edit mode only)
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (personaId) {
      listPersonaDocuments(personaId).then(setDocuments).catch(() => {});
    }
  }, [personaId]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !personaId) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadPersonaDocument(personaId, file);
      const docs = await listPersonaDocuments(personaId);
      setDocuments(docs);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!personaId) return;
    try {
      await deletePersonaDocument(personaId, docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setConfirmDelete(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const toggleTool = (tool: string) => {
    if (tool === "none") {
      setTools(["none"]);
      return;
    }
    setTools((prev) => {
      const withoutNone = prev.filter((t) => t !== "none");
      if (withoutNone.includes(tool)) return withoutNone.filter((t) => t !== tool);
      return [...withoutNone, tool];
    });
  };

  const handleSubmit = () => {
    onSubmit({
      id: initialData?.id ?? `persona-${Date.now()}`,
      name, role, focus, backstory, stance, personality,
      hidden_agenda: hiddenAgenda, tools, tag: tag || undefined,
    });
  };

  const canNext = (): boolean => {
    if (step === 0) return name.trim().length > 0;
    return true;
  };

  const renderStepIndicator = () => (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => i < step ? setStep(i) : null}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              i === step
                ? "bg-primary text-on-dark"
                : i < step
                  ? "bg-primary/10 text-primary cursor-pointer"
                  : "bg-ink/5 text-muted cursor-default"
            }`}
          >
            <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
              i === step ? "bg-on-dark/20" : i < step ? "bg-primary" : "bg-ink/10"
            }`}>
              {i < step ? "✓" : i + 1}
            </span>
            {label}
          </button>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-6 ${i < step ? "bg-primary" : "bg-ink/10"}`} />
          )}
        </div>
      ))}
    </div>
  );

  const renderIdentity = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-muted">Name <span className="text-error">*</span></span>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-ink/10 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-primary"
            placeholder="Full name or title" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-muted">Tag</span>
          <input type="text" value={tag} onChange={(e) => setTag(e.target.value)}
            className="rounded-xl border border-ink/10 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-primary w-32"
            placeholder="EXEC-01" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-muted">Role</span>
          <input type="text" value={role} onChange={(e) => setRole(e.target.value)}
            className="rounded-xl border border-ink/10 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-primary"
            placeholder="e.g., VP of Engineering" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-muted">Focus</span>
          <input type="text" value={focus} onChange={(e) => setFocus(e.target.value)}
            className="rounded-xl border border-ink/10 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-primary"
            placeholder="e.g., Cost reduction" />
        </label>
      </div>
      <p className="text-xs text-muted/60">The name is the only required field. Everything else can be set later.</p>
    </div>
  );

  const renderPersonality = () => (
    <div className="space-y-5">
      {/* Backstory */}
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-muted">Backstory</span>
        <textarea value={backstory} onChange={(e) => setBackstory(e.target.value)}
          rows={3}
          className="min-h-20 rounded-xl border border-ink/10 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-primary resize-none"
          placeholder="e.g., 10 years in corporate law, known for aggressive negotiation tactics..." />
      </label>

      {/* Stance */}
      <div className="grid gap-1.5">
        <span className="text-sm font-semibold text-muted">Stance</span>
        <div className="flex gap-1.5 flex-wrap">
          {STANCES.map((s) => (
            <button key={s} type="button" onClick={() => setStance(s)}
              className={`rounded-full px-3 py-1 text-xs capitalize transition font-medium ${
                stance === s
                  ? "bg-primary text-on-dark"
                  : "bg-white/50 text-muted hover:text-ink border border-ink/10"
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Personality Sliders */}
      <div className="grid gap-1.5">
        <span className="text-sm font-semibold text-muted">Personality Profile</span>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {TRAITS.map((trait) => (
            <label key={trait} className="grid gap-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted">{TRAIT_LABELS[trait]}</span>
                <span className="font-mono" style={{ color: TRAIT_COLORS[trait] }}>{personality[trait]}</span>
              </div>
              <input type="range" min="0" max="100" value={personality[trait]}
                onChange={(e) => setPersonality({ ...personality, [trait]: Number(e.target.value) })}
                className="accent-primary h-1 w-full" />
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderToolsAgenda = () => (
    <div className="space-y-5">
      {/* Tools */}
      <div className="grid gap-1.5">
        <span className="text-sm font-semibold text-muted">Tools</span>
        <div className="flex gap-1.5 flex-wrap">
          {TOOL_OPTIONS.map((tool) => (
            <button key={tool} type="button" onClick={() => toggleTool(tool)}
              className={`rounded-full px-3 py-1 text-xs capitalize transition font-medium ${
                tools.includes(tool)
                  ? "bg-primary text-on-dark"
                  : "bg-white/50 text-muted hover:text-ink border border-ink/10"
              }`}>
              {tool}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted/60">
          {tools.includes("none")
            ? "Select a tool above to enable it."
            : tools.length > 0
              ? `Selected: ${tools.join(", ")}`
              : "Select one or more tools this persona wields"}
        </p>
      </div>

      {/* Hidden Agenda */}
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-muted">Hidden Agenda <span className="font-normal text-muted/60">(optional)</span></span>
        <textarea value={hiddenAgenda} onChange={(e) => setHiddenAgenda(e.target.value)}
          rows={3}
          className="min-h-20 rounded-xl border border-ink/10 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-primary resize-none"
          placeholder="Optional — undisclosed motivations that influence decisions..." />
      </label>

      {/* Documents (edit mode only) */}
      {isEdit && (
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted">Documents</span>
            <label className="cursor-pointer">
              <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleUpload} disabled={uploading} />
              <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium transition ${
                uploading
                  ? "bg-ink/10 text-muted/60 cursor-not-allowed"
                  : "bg-primary text-on-dark hover:opacity-90 cursor-pointer"
              }`}>
                {uploading ? "Uploading..." : "+ Upload"}
              </span>
            </label>
          </div>
          {uploadError && <p className="text-xs text-error">{uploadError}</p>}
          {documents.length > 0 ? (
            <div className="space-y-1">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white/50 px-3 py-2">
                  <svg className="h-4 w-4 shrink-0 text-muted" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M4 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H9.414l-1.707-1.707A1 1 0 0 0 7.086 2H4z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink truncate">{doc.filename}</p>
                    <p className="text-xs text-muted">{formatSize(doc.size_bytes)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    doc.status === "ready"
                      ? "bg-success/10 text-success"
                      : doc.status === "failed"
                        ? "bg-error/10 text-error"
                        : "bg-warning/10 text-warning"
                  }`}>
                    {doc.status === "ready" ? "Ready" : doc.status === "failed" ? "Failed" : "Pending"}
                  </span>
                  {confirmDelete === doc.id ? (
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => handleDelete(doc.id)}
                        className="text-[10px] font-semibold text-error hover:underline">X</button>
                      <button type="button" onClick={() => setConfirmDelete(null)}
                        className="text-[10px] text-muted hover:underline">No</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(doc.id)}
                      className="shrink-0 text-muted hover:text-error transition">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted/60">No documents yet. Upload PDF, DOCX, or TXT files.</p>
          )}
        </div>
      )}
    </div>
  );

  const renderReview = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-ink/10 bg-white/50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Identity</p>
          <p className="text-sm font-medium">{name || "—"}</p>
          <p className="text-xs text-muted">{role}{role && focus ? " · " : ""}{focus}</p>
          {tag && <span className="inline-block mt-1 rounded-full bg-surface-card border border-hairline px-2 py-0.5 text-[10px]">{tag}</span>}
        </div>
        <div className="rounded-xl border border-ink/10 bg-white/50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Stance</p>
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
            stance === "champion" ? "bg-green-100 text-green-800"
            : stance === "detractor" ? "bg-red-100 text-red-800"
            : stance === "neutral" ? "bg-gray-100 text-gray-700"
            : stance === "moderator" ? "bg-blue-100 text-blue-800"
            : "bg-purple-100 text-purple-800"
          }`}>{stance}</span>
        </div>
      </div>

      {backstory && (
        <div className="rounded-xl border border-ink/10 bg-white/50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Backstory</p>
          <p className="text-sm text-ink">{backstory}</p>
        </div>
      )}

      <div className="rounded-xl border border-ink/10 bg-white/50 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-3">Personality</p>
        <div className="grid grid-cols-2 gap-3">
          {TRAITS.map((trait) => (
            <div key={trait}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-muted">{TRAIT_LABELS[trait]}</span>
                <span className="font-mono" style={{ color: TRAIT_COLORS[trait] }}>{personality[trait]}</span>
              </div>
              <div className="h-1.5 rounded-full bg-ink/10">
                <div className="h-full rounded-full" style={{ width: `${personality[trait]}%`, backgroundColor: TRAIT_COLORS[trait] }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {(hiddenAgenda || tools.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {hiddenAgenda && (
            <div className="rounded-xl border border-ink/10 bg-white/50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Hidden Agenda</p>
              <p className="text-sm text-ink">{hiddenAgenda}</p>
            </div>
          )}
          {tools.length > 0 && !tools.includes("none") && (
            <div className="rounded-xl border border-ink/10 bg-white/50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Tools</p>
              <div className="flex flex-wrap gap-1">
                {tools.map((t) => (
                  <span key={t} className="rounded-full bg-primary/5 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-medium capitalize">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isEdit && documents.length > 0 && (
        <div className="rounded-xl border border-ink/10 bg-white/50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Documents</p>
          <p className="text-xs text-muted">{documents.length} document{documents.length > 1 ? "s" : ""} attached</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-2">
        <h2 className="font-display text-3xl font-semibold">
          {isEdit ? "Edit Persona" : "Create Persona"}
        </h2>
        <p className="text-sm text-muted mt-1">
          {step === 0 ? "Start with the basics — name and role."
          : step === 1 ? "Define their personality and background."
          : step === 2 ? "Configure tools, secrets, and documents."
          : "Review everything before saving."}
        </p>
      </div>

      {renderStepIndicator()}

      {/* Step Content */}
      <div className="min-h-[280px]">
        {step === 0 && renderIdentity()}
        {step === 1 && renderPersonality()}
        {step === 2 && renderToolsAgenda()}
        {step === 3 && renderReview()}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-ink/5">
        <button type="button" onClick={onCancel}
          className="rounded-full px-5 py-2.5 text-sm font-medium text-muted hover:text-ink transition">
          Cancel
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)}
              className="rounded-full px-5 py-2.5 text-sm font-medium bg-surface-card hover:bg-ink/5 transition">
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => canNext() && setStep(step + 1)}
              className={`rounded-full px-6 py-2.5 text-sm font-medium transition ${
                canNext()
                  ? "bg-primary text-on-dark hover:opacity-90"
                  : "bg-primary/30 text-on-dark/60 cursor-not-allowed"
              }`}>
              Continue
            </button>
          ) : (
            <button type="button" onClick={handleSubmit}
              className="rounded-full px-6 py-2.5 text-sm font-medium bg-primary text-on-dark hover:opacity-90 transition">
              {isEdit ? "Save Changes" : "Create Persona"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
