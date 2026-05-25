"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { DocumentUpload } from "@/components/DocumentUpload";
import { createSimulationV2, createSimulationWithDocuments, fetchStakeholders } from "@/lib/api";
import type {
  SimulationV2Config,
  Subject,
  StakeholderV2,
  PersonalityProfile,
  ActionSpace,
  CustomActionDef,
  SpeakerRules,
  EndCondition,
  VoteCondition,
  ConsensusCondition,
  JudgeCondition,
  AgentStance,
  EnvFlags,
  Stakeholder,
} from "@/lib/types";

const EMPTY_PERSONALITY: PersonalityProfile = { aggressiveness: 50, empathy: 50, stubbornness: 50, verbosity: 50 };
const STANCES: AgentStance[] = ["champion", "detractor", "neutral", "moderator", "wildcard"];
const SPEAKER_MODES = ["moderator_led", "alternating", "freeform", "weighed_random"] as const;
const END_TYPES = ["timeout", "vote", "judge", "consensus", "hybrid"] as const;

const ENV_FLAGS: { key: keyof EnvFlags; label: string; icon: string; desc: string }[] = [
  { key: "hidden_motives", label: "Hidden Motives", icon: "visibility_off", desc: "Agents harbor undisclosed incentives that complicate resolution" },
  { key: "time_pressure", label: "Time Pressure", icon: "hourglass_empty", desc: "Negotiation intensity increases as turn limit approaches" },
  { key: "external_leaks", label: "External Leaks", icon: "leak_add", desc: "Sensitive information may spill between stakeholder groups" },
  { key: "deadlock_risk", label: "Deadlock Risk", icon: "dangerous", desc: "High tension increases probability of walk-away outcomes" },
];

const emptyEnvFlags: EnvFlags = { hidden_motives: true, time_pressure: false, external_leaks: false, deadlock_risk: false };

let nextPersonaId = 1;
const freshPersona = (): StakeholderV2 => ({
  id: `p${nextPersonaId++}`,
  name: "",
  role: "",
  backstory: "",
  stance: "neutral",
  personality: { ...EMPTY_PERSONALITY },
  hidden_agenda: "",
  tools: [],
});

const TOTAL_STEPS = 4;

export default function NewSimulationPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Step 1 — Subject
  const [subject, setSubject] = useState<Subject>({
    name: "", description: "", attributes: {}, evidence_items: [], stakes_description: "",
  });
  const [attrKey, setAttrKey] = useState("");
  const [attrVal, setAttrVal] = useState("");
  const [attrType, setAttrType] = useState<"string" | "number" | "boolean">("string");
  const [attrDuplicateWarn, setAttrDuplicateWarn] = useState("");
  const [evidenceInput, setEvidenceInput] = useState("");
  const [evidenceSource, setEvidenceSource] = useState("");
  const [evidenceImportance, setEvidenceImportance] = useState<"high" | "medium" | "low">("medium");

  // Step 2 — Personas
  const [personas, setPersonas] = useState<StakeholderV2[]>([freshPersona(), freshPersona()]);
  const [library, setLibrary] = useState<Stakeholder[]>([]);
  const [selectedLibraryIdx, setSelectedLibraryIdx] = useState<number | null>(null);

  // Step 3 — Rules, Tension, Actions
  const [speakerMode, setSpeakerMode] = useState<SpeakerRules["mode"]>("alternating");
  const [endConditionType, setEndConditionType] = useState<"timeout" | "vote" | "judge" | "consensus" | "hybrid">("timeout");
  const [maxTurns, setMaxTurns] = useState(10);
  const [thresholdPct, setThresholdPct] = useState(60);
  const [judgePersonaId, setJudgePersonaId] = useState("");
  const [judgeCriteria, setJudgeCriteria] = useState<string[]>(["Has a fair compromise been reached?"]);
  const [judgeCriteriaInput, setJudgeCriteriaInput] = useState("");
  const [consensusSensitivity, setConsensusSensitivity] = useState<"diplomatic" | "balanced" | "sensitive">("balanced");
  const [consensusDetectionMode, setConsensusDetectionMode] = useState<"both" | "agreement_only" | "deadlock_only">("both");
  const [hybridVote, setHybridVote] = useState(false);
  const [hybridConsensus, setHybridConsensus] = useState(true);
  const [hybridJudge, setHybridJudge] = useState(false);
  const [voltage, setVoltage] = useState(50);
  const [envFlags, setEnvFlags] = useState<EnvFlags>({ ...emptyEnvFlags });
  const [modelTemp, setModelTemp] = useState<"stable" | "volatile">("volatile");
  const [actions, setActions] = useState<CustomActionDef[]>([]);
  const [newAction, setNewAction] = useState<CustomActionDef>({ name: "", description: "", trust_delta: 0, leverage_delta: 0 });
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    fetchStakeholders()
      .then(setLibrary)
      .catch(() => {});
  }, []);

  const toggleEnvFlag = (key: keyof EnvFlags) => {
    setEnvFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addLibraryPersona = (st: Stakeholder) => {
    setPersonas((prev) => [...prev, {
      id: `p${nextPersonaId++}`,
      name: st.name,
      role: st.role,
      backstory: st.hidden_agenda || "",
      stance: "neutral",
      personality: { ...EMPTY_PERSONALITY },
      hidden_agenda: "",
      tools: [],
    }]);
  };

  const updatePersona = (id: string, patch: Partial<StakeholderV2>) => {
    setPersonas((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const updatePersonality = (id: string, trait: keyof PersonalityProfile, value: number) => {
    setPersonas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, personality: { ...p.personality, [trait]: value } } : p))
    );
  };

  const removePersona = (id: string) => {
    if (personas.length <= 2) return;
    setPersonas((prev) => prev.filter((p) => p.id !== id));
  };

  const buildEndCondition = (): EndCondition => {
    if (endConditionType === "timeout") return { type: "timeout", max_normal_turns: maxTurns };
    if (endConditionType === "vote") return { type: "vote", voters: personas.map((p) => p.id), threshold: thresholdPct, max_turns: maxTurns };
    if (endConditionType === "judge") return { type: "judge", judge_id: judgePersonaId || personas[0]?.id || "", criteria: judgeCriteria };
    if (endConditionType === "consensus") return { type: "consensus", sensitivity: consensusSensitivity, detection_mode: consensusDetectionMode, max_turns: maxTurns };
    // hybrid: enable selected sub-conditions
    const subs: (VoteCondition | ConsensusCondition | JudgeCondition)[] = [];
    if (hybridVote) subs.push({ type: "vote", voters: personas.map((p) => p.id), threshold: 0.5, max_turns: maxTurns });
    if (hybridConsensus) subs.push({ type: "consensus", sensitivity: "balanced", detection_mode: "both", max_turns: maxTurns });
    if (hybridJudge) subs.push({ type: "judge", judge_id: personas[0]?.id ?? "", criteria: [] });
    return { type: "hybrid", conditions: subs, max_turns: maxTurns };
  };

  const buildConfig = (): SimulationV2Config => ({
    subject,
    stakeholders: personas,
    action_space: { actions, default_trust_deltas: {}, default_leverage_deltas: {} },
    speaker_rules: { mode: speakerMode },
    end_condition: buildEndCondition(),
    system_prompt_template: "",
    voltage,
    player_mode: false,
    env_flags: envFlags,
    model_temperature: modelTemp,
  });

  const validateStep = (s: number): boolean => {
    setError("");
    if (s === 1 && !subject.name.trim()) { setError("Subject name is required"); return false; }
    if (s === 2) {
      const missing = personas.some((p) => !p.name.trim());
      if (missing) { setError("All personas need a name"); return false; }
      if (personas.length < 2) { setError("At least 2 personas required"); return false; }
    }
    return true;
  };

  const handleNext = () => { if (validateStep(step)) setStep((s) => Math.min(s + 1, TOTAL_STEPS)); };

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const config = buildConfig();
      let result: Awaited<ReturnType<typeof createSimulationV2>>;

      if (uploadFiles.length > 0) {
        setIsUploading(true);
        result = await createSimulationWithDocuments(config, uploadFiles);
        setIsUploading(false);
      } else {
        result = await createSimulationV2(config);
      }

      router.push(`/simulate/${result.simulation_id}`);
    } catch (err) {
      setIsUploading(false);
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Failed to create simulation");
    }
  };

  // ── Editorial helper: initial avatar ──
  const initial = (name: string) => name?.trim()?.charAt(0)?.toUpperCase() || "?";

  // ── Stance color map ──
  const stanceColor = (s: string) => {
    switch (s) {
      case "champion": return "bg-primary/20 text-primary border-primary/30";
      case "detractor": return "bg-red-500/10 text-red-600 border-red-500/20";
      case "neutral": return "bg-gray-500/10 text-gray-600 border-gray-500/20";
      case "moderator": return "bg-accent-teal/10 text-accent-teal border-accent-teal/20";
      case "wildcard": return "bg-accent-amber/10 text-accent-amber border-accent-amber/20";
      default: return "bg-muted/10 text-muted";
    }
  };

  return (
    <AppShell activeTab="War Room">
      <div className="max-w-5xl mx-auto px-8 py-10">

        {/* ── Decorative top stripe ── */}
        <div className="flex items-center gap-4 mb-2">
          <span className="w-1.5 h-8 bg-primary rounded-full" />
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">Boardroom · Dossier</p>
            <h1 className="font-display text-3xl font-semibold tracking-display text-ink">Simulation Briefing</h1>
          </div>
        </div>

        {/* ── Ornamental divider ── */}
        <div className="flex items-center gap-3 mb-7 mt-1">
          <div className="h-px flex-1 bg-gradient-to-r from-primary/40 via-hairline to-transparent" />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-muted/60">{TOTAL_STEPS}-part dossier</span>
          <div className="h-px flex-1 bg-gradient-to-l from-primary/40 via-hairline to-transparent" />
        </div>

        {/* ── Dossier Step Tabs ── */}
        <div className="flex gap-1.5 mb-8">
          {[
            { n: 1, label: "Case File", sub: "Subject & Context" },
            { n: 2, label: "Intel", sub: "Persona Profiles" },
            { n: 3, label: "Directives", sub: "Rules & Tension" },
            { n: 4, label: "Briefing", sub: "Review & Launch" },
          ].map((tab) => (
            <button
              key={tab.n}
              onClick={() => { if (validateStep(tab.n - 1) || tab.n <= step) setStep(tab.n); }}
              className={`group relative flex-1 flex flex-col items-start px-5 py-3.5 rounded-xl border transition-all duration-300 ${
                step === tab.n
                  ? "bg-surface-card border-primary/40 shadow-sm"
                  : step > tab.n
                  ? "bg-surface-card/60 border-hairline opacity-60"
                  : "bg-transparent border-transparent opacity-40 hover:opacity-70"
              }`}
            >
              <span className={`font-mono text-[9px] font-bold uppercase tracking-[0.15em] mb-0.5 transition-colors ${
                step === tab.n ? "text-primary" : "text-muted"
              }`}>
                0{tab.n}
                {step > tab.n && <span className="ml-1 text-primary">✓</span>}
              </span>
              <span className={`text-sm font-semibold leading-tight transition-colors ${
                step === tab.n ? "text-ink" : "text-muted"
              }`}>
                {tab.label}
              </span>
              <span className="text-[10px] text-muted/70 font-normal leading-tight">{tab.sub}</span>
              {step === tab.n && (
                <span className="absolute -bottom-px left-4 right-4 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-primary/10 border border-primary/20 px-5 py-3.5">
            <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
            <p className="text-sm text-primary-active">{error}</p>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
           STEP 1: CASE FILE — Subject & Context
           ════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <section>
            {/* Dossier cover header */}
            <div className="relative mb-8 pb-6 border-b border-hairline">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">01 · Dossier Cover</span>
              <h2 className="font-display text-3xl font-semibold tracking-display text-ink mt-1">Case File</h2>
              <p className="text-sm text-muted mt-1 max-w-xl leading-relaxed">
                Define the subject, stakes, and supporting evidence for this simulation.
              </p>
              {/* Decorative corner accent */}
              <div className="absolute right-0 top-0 w-12 h-12 border-r-2 border-t-2 border-primary/20 rounded-tr-xl" />
            </div>

            {/* Two-column layout: main fields left, attributes/evidence right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* ── Left column: subject metadata ── */}
              <div className="lg:col-span-7 space-y-5">
                {/* Subject name — dossier title input */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                    <span className="w-2 h-2 rounded-full bg-primary/60" />
                    Subject designation
                  </label>
                  <input value={subject.name} onChange={(e) => setSubject((s) => ({ ...s, name: e.target.value }))}
                    className="w-full rounded-xl border border-hairline bg-surface-card/60 px-5 py-4 font-display text-xl font-semibold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-muted/40"
                    placeholder="e.g. Will Balen, Climate Policy, Merger Decision" />
                </div>

                {/* Description — dossier summary */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                    <span className="w-2 h-2 rounded-full bg-primary/60" />
                    Case summary
                  </label>
                  <textarea value={subject.description} onChange={(e) => setSubject((s) => ({ ...s, description: e.target.value }))}
                    className="w-full min-h-28 rounded-xl border border-hairline bg-surface-card/60 px-5 py-3.5 text-sm leading-relaxed outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-muted/40"
                    placeholder="What is the central question this debate will explore?" />
                </div>

                {/* Stakes — high-impact field */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                    <span className="w-2 h-2 rounded-full bg-accent-amber/80" />
                    What&apos;s at stake
                  </label>
                  <div className="relative">
                    <textarea value={subject.stakes_description} onChange={(e) => setSubject((s) => ({ ...s, stakes_description: e.target.value }))}
                      className="w-full min-h-20 rounded-xl border border-accent-amber/30 bg-accent-amber/[0.04] px-5 py-3.5 text-sm leading-relaxed outline-none transition focus:border-accent-amber focus:ring-2 focus:ring-accent-amber/10 placeholder:text-muted/40"
                      placeholder="What are the consequences of the outcome?" />
                    <span className="absolute top-2 right-3 font-mono text-[8px] uppercase tracking-wider text-accent-amber/50 font-bold">High Priority</span>
                  </div>
                </div>
              </div>

              {/* ── Right column: attributes + evidence ── */}
              <div className="lg:col-span-5 space-y-6">
                {/* Attributes — dossier tag clippings */}
                <div className="rounded-xl bg-surface-card/70 border border-hairline p-5">
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                      Attributes
                      {Object.keys(subject.attributes).length > 0 && (
                        <span className="ml-2 text-[9px] font-normal text-muted/60">({Object.keys(subject.attributes).length})</span>
                      )}
                    </label>
                  </div>

                  {/* Duplicate warning */}
                  {attrDuplicateWarn && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-accent-amber/10 border border-accent-amber/20 px-3 py-2 text-xs text-accent-amber">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-amber shrink-0" />
                      {attrDuplicateWarn}
                    </div>
                  )}

                  {/* Add attribute row */}
                  <div className="flex gap-1.5 mb-3">
                    <input value={attrKey} onChange={(e) => { setAttrKey(e.target.value); setAttrDuplicateWarn(""); }}
                      className="flex-1 min-w-0 rounded-lg border border-hairline bg-canvas/50 px-3 py-2 text-xs outline-none focus:border-primary" placeholder="Key" />
                    <select value={attrType} onChange={(e) => setAttrType(e.target.value as "string" | "number" | "boolean")}
                      className="rounded-lg border border-hairline bg-canvas/50 px-2 py-2 text-[10px] outline-none focus:border-primary text-muted">
                      <option value="string">str</option>
                      <option value="number">num</option>
                      <option value="boolean">bool</option>
                    </select>
                    {attrType === "boolean" ? (
                      <div className="flex items-center gap-1.5 rounded-lg border border-hairline bg-canvas/50 px-2.5 py-2">
                        <span className="text-[9px] text-muted">F</span>
                        <button role="switch" aria-checked={attrVal === "true"}
                          onClick={() => setAttrVal(attrVal === "true" ? "false" : "true")}
                          className={`relative w-8 h-4 rounded-full transition-colors ${attrVal === "true" ? "bg-primary" : "bg-ink/20"}`}>
                          <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${attrVal === "true" ? "translate-x-4" : ""}`} />
                        </button>
                        <span className="text-[9px] text-muted">T</span>
                      </div>
                    ) : (
                      <input value={attrVal} onChange={(e) => setAttrVal(e.target.value)}
                        type={attrType === "number" ? "number" : "text"}
                        className="w-16 rounded-lg border border-hairline bg-canvas/50 px-2 py-2 text-xs outline-none focus:border-primary"
                        placeholder={attrType === "number" ? "0" : "Val"} />
                    )}
                    <Button variant="ghost" onClick={() => {
                      if (!attrKey || (!attrVal && attrType !== "boolean")) return;
                      if (attrKey in subject.attributes) setAttrDuplicateWarn(`"${attrKey}" already exists. Adding will overwrite it.`);
                      const typedVal: string | number | boolean = attrType === "number"
                        ? (attrVal === "" ? 0 : Number(attrVal))
                        : attrType === "boolean" ? attrVal === "true" : attrVal;
                      if (attrType === "boolean" && !attrVal) {
                        setAttrVal("true"); setSubject((s) => ({ ...s, attributes: { ...s.attributes, [attrKey]: true } }));
                      } else {
                        setSubject((s) => ({ ...s, attributes: { ...s.attributes, [attrKey]: typedVal } }));
                      }
                      setAttrKey(""); if (attrType !== "boolean") setAttrVal(""); setAttrType("string");
                    }}>+</Button>
                  </div>

                  {/* Attribute tags */}
                  {Object.entries(subject.attributes).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(subject.attributes).map(([k, v]) => {
                        const vtype = typeof v === "number" ? "num" : typeof v === "boolean" ? "bool" : "str";
                        return (
                          <div key={k} className="group flex items-center gap-1.5 rounded-lg bg-canvas/70 border border-hairline px-2.5 py-1.5 text-xs hover:border-primary/40 transition">
                            <span className="font-semibold text-ink text-[11px]">{k}</span>
                            <span className={`text-[8px] uppercase font-mono font-bold px-1 py-0.5 rounded ${
                              vtype === "num" ? "bg-accent-teal/10 text-accent-teal" :
                              vtype === "bool" ? "bg-purple-500/10 text-purple-600" :
                              "bg-muted/10 text-muted"
                            }`}>{vtype}</span>
                            <span className="text-muted/70 max-w-[60px] truncate text-[11px]">{String(v)}</span>
                            <button onClick={() => { const { [k]: _, ...rest } = subject.attributes; setSubject((s) => ({ ...s, attributes: rest })); }}
                              className="text-muted/40 hover:text-error opacity-0 group-hover:opacity-100 transition text-[10px] ml-0.5">✕</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Evidence — dossier clippings */}
                <div className="rounded-xl bg-surface-card/70 border border-hairline p-5">
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                      Evidence Clippings
                      {subject.evidence_items.length > 0 && (
                        <span className="ml-2 text-[9px] font-normal text-muted/60">({subject.evidence_items.length})</span>
                      )}
                    </label>
                  </div>

                  {/* Add evidence */}
                  <div className="space-y-1.5 mb-3">
                    <input value={evidenceInput} onChange={(e) => setEvidenceInput(e.target.value)}
                      className="w-full rounded-lg border border-hairline bg-canvas/50 px-3 py-2 text-xs outline-none focus:border-primary" placeholder="Evidence text..." />
                    <div className="flex gap-1.5">
                      <input value={evidenceSource} onChange={(e) => setEvidenceSource(e.target.value)}
                        className="flex-1 rounded-lg border border-hairline bg-canvas/50 px-2.5 py-1.5 text-[10px] outline-none focus:border-primary" placeholder="Source (opt)" />
                      <div className="flex rounded-lg border border-hairline overflow-hidden">
                        {(["high", "medium", "low"] as const).map((imp) => (
                          <button key={imp} onClick={() => setEvidenceImportance(imp)}
                            className={`px-2 py-1 text-[9px] uppercase font-bold tracking-wider transition ${
                              evidenceImportance === imp
                                ? imp === "high" ? "bg-primary text-on-dark"
                                  : imp === "medium" ? "bg-accent-amber text-on-dark" : "bg-muted text-on-dark"
                                : "bg-canvas/50 text-muted hover:text-ink"
                            }`}>{imp[0]}</button>
                        ))}
                      </div>
                      <Button variant="ghost" onClick={() => {
                        if (!evidenceInput.trim()) return;
                        const formatted = `[${evidenceImportance.toUpperCase()}] ${evidenceInput.trim()}${evidenceSource.trim() ? ` | source: ${evidenceSource.trim()}` : ""}`;
                        setSubject((s) => ({ ...s, evidence_items: [...s.evidence_items, formatted] }));
                        setEvidenceInput(""); setEvidenceSource(""); setEvidenceImportance("medium");
                      }}>+</Button>
                    </div>
                  </div>

                  {/* Evidence list */}
                  {subject.evidence_items.length > 0 && (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {subject.evidence_items.map((item, i) => {
                        const impMatch = item.match(/^\[(HIGH|MEDIUM|LOW)\]/);
                        const imp = impMatch ? impMatch[1].toLowerCase() as "high" | "medium" | "low" : null;
                        const srcMatch = item.match(/\| source: (.+)$/);
                        const src = srcMatch ? srcMatch[1] : null;
                        const cleanText = item.replace(/^\[(HIGH|MEDIUM|LOW)\]\s*/, "").replace(/\s*\|\s*source:\s*.+$/, "");
                        const impBorder = imp === "high" ? "border-l-primary" : imp === "low" ? "border-l-muted/30" : "border-l-accent-amber";
                        const dotColor = imp === "high" ? "bg-primary" : imp === "low" ? "bg-muted/40" : "bg-accent-amber";
                        return (
                          <div key={i} className={`group flex items-start gap-2.5 border-l-2 ${impBorder} bg-canvas/40 pl-3 pr-2 py-2.5 rounded-r-lg transition hover:bg-canvas/70`}>
                            <span className={`mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full ${dotColor}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-ink leading-relaxed">{cleanText}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {imp && (
                                  <span className={`text-[8px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                                    imp === "high" ? "bg-primary/10 text-primary" :
                                    imp === "low" ? "bg-muted/10 text-muted" : "bg-accent-amber/10 text-accent-amber"
                                  }`}>{imp}</span>
                                )}
                                {src && <span className="text-[9px] text-muted/60">📎 {src}</span>}
                              </div>
                            </div>
                            <button onClick={() => setSubject((s) => ({ ...s, evidence_items: s.evidence_items.filter((_, j) => j !== i) }))}
                              className="text-muted/30 hover:text-error opacity-0 group-hover:opacity-100 transition text-xs shrink-0">✕</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Reference Documents */}
                <div className="rounded-xl bg-surface-card/70 border border-hairline p-5">
                  <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted mb-3">
                    Reference Files
                  </label>
                  <p className="text-[11px] text-muted/70 mb-3 leading-relaxed">Upload source documents to brief AI stakeholders.</p>
                  <DocumentUpload files={uploadFiles} onFilesChange={setUploadFiles} />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════════════════════
           STEP 2: INTEL PROFILES — Persona Selection
           ════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <section>
            <div className="relative mb-8 pb-6 border-b border-hairline">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">02 · Intel Profiles</span>
              <h2 className="font-display text-3xl font-semibold tracking-display text-ink mt-1">Personnel Dossier</h2>
              <p className="text-sm text-muted mt-1 max-w-xl leading-relaxed">
                Select and configure the participants. Each persona brings a unique voice, agenda, and disposition.
              </p>
              <div className="absolute right-0 top-0 w-12 h-12 border-r-2 border-t-2 border-accent-amber/20 rounded-tr-xl" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* ── Library Archive ── */}
              <div className="lg:col-span-4">
                <div className="rounded-xl bg-surface-card/70 border border-hairline p-5 h-full">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] text-primary font-bold">A</span>
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">Persona Archive</h3>
                  </div>
                  <p className="text-[11px] text-muted/70 mb-4 leading-relaxed">Choose voices from your established persona library.</p>
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {library.map((st, i) => (
                      <div key={st.id}
                        onClick={() => { setSelectedLibraryIdx(i); addLibraryPersona(st); }}
                        className="group flex items-center justify-between p-3 rounded-xl bg-canvas/60 border border-hairline hover:border-primary/40 hover:bg-surface-card cursor-pointer transition-all">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink truncate">{st.name}</p>
                          <p className="text-[10px] text-muted/70 truncate">{st.role} · {st.tag}</p>
                        </div>
                        <div className="w-7 h-7 rounded-full border border-hairline flex items-center justify-center text-primary/60 group-hover:bg-primary group-hover:text-on-dark group-hover:border-primary transition-all shrink-0 ml-2">
                          <span className="text-sm leading-none">+</span>
                        </div>
                      </div>
                    ))}
                    {library.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-xs text-muted/50 italic">Archive empty</p>
                        <p className="text-[10px] text-muted/40 mt-1">Build profiles from scratch below</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Roundtable Cards ── */}
              <div className="lg:col-span-8 space-y-4 max-h-[560px] overflow-y-auto pr-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base leading-none">✦</span>
                  <h3 className="font-display text-xl font-semibold tracking-display text-ink">The Roundtable</h3>
                  <span className="font-mono text-[10px] text-muted/60 ml-auto">{personas.length} participant{personas.length !== 1 ? "s" : ""}</span>
                </div>

                {personas.map((p) => (
                  <div key={p.id} className="rounded-xl bg-surface-card/80 border border-hairline p-5 space-y-4 transition hover:border-primary/30 hover:shadow-sm">
                    {/* Header — avatar + name/role + remove */}
                    <div className="flex items-start gap-4">
                      {/* Avatar circle */}
                      <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-display text-lg font-bold border-2 ${
                        p.stance === "champion" ? "bg-primary/15 border-primary/40 text-primary" :
                        p.stance === "detractor" ? "bg-red-500/10 border-red-500/30 text-red-600" :
                        p.stance === "wildcard" ? "bg-accent-amber/10 border-accent-amber/30 text-accent-amber" :
                        p.stance === "moderator" ? "bg-accent-teal/10 border-accent-teal/30 text-accent-teal" :
                        "bg-muted/10 border-muted/20 text-muted"
                      }`}>
                        {initial(p.name)}
                      </div>
                      {/* Name + Role */}
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <input value={p.name} onChange={(e) => updatePersona(p.id, { name: e.target.value })}
                          className="rounded-lg border border-hairline bg-canvas/50 px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
                          placeholder="Name" />
                        <input value={p.role} onChange={(e) => updatePersona(p.id, { role: e.target.value })}
                          className="rounded-lg border border-hairline bg-canvas/50 px-3 py-2 text-sm outline-none focus:border-primary"
                          placeholder="Role" />
                      </div>
                      <button onClick={() => removePersona(p.id)} disabled={personas.length <= 2}
                        className="text-[10px] text-muted/40 hover:text-error transition shrink-0 disabled:opacity-20 font-mono uppercase tracking-wider">
                        Remove
                      </button>
                    </div>

                    {/* Stance pills */}
                    <div className="flex gap-1.5 flex-wrap">
                      {STANCES.map((stance) => (
                        <button key={stance} onClick={() => updatePersona(p.id, { stance })}
                          className={`rounded-full px-3 py-1 text-[10px] capitalize transition font-bold tracking-wider ${
                            p.stance === stance ? "bg-primary text-on-dark shadow-sm" : "bg-canvas/50 text-muted hover:text-ink border border-hairline"
                          }`}>{stance}</button>
                      ))}
                    </div>

                    {/* Backstory + hidden agenda + personality */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <textarea value={p.backstory} onChange={(e) => updatePersona(p.id, { backstory: e.target.value })}
                          className="w-full min-h-16 rounded-lg border border-hairline bg-canvas/50 p-3 text-xs leading-relaxed outline-none focus:border-primary"
                          placeholder="Backstory — who are they?" />
                        <div className="relative">
                          <textarea value={p.hidden_agenda} onChange={(e) => updatePersona(p.id, { hidden_agenda: e.target.value })}
                            className="w-full min-h-10 rounded-lg border border-accent-amber/20 bg-accent-amber/[0.04] p-2.5 text-[11px] outline-none focus:border-accent-amber"
                            placeholder="Hidden agenda (classified)" />
                          <span className="absolute top-1 right-2 font-mono text-[7px] uppercase tracking-widest text-accent-amber/50 font-bold">classified</span>
                        </div>
                      </div>
                      {/* Personality sliders */}
                      <div className="space-y-2.5 bg-canvas/40 rounded-lg border border-hairline p-3">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted block mb-1">Disposition</span>
                        {(["aggressiveness", "empathy", "stubbornness", "verbosity"] as const).map((trait) => (
                          <label key={trait} className="flex items-center gap-2 text-[11px] text-muted">
                            <span className="w-20 truncate font-medium">{trait.slice(0, 4)}</span>
                            <input type="range" min="0" max="100" value={p.personality[trait]}
                              onChange={(e) => updatePersonality(p.id, trait, Number(e.target.value))}
                              className="flex-1 accent-primary h-0.5" />
                            <span className="w-5 text-right font-mono text-[9px] text-ink">{p.personality[trait]}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add persona button */}
                <button onClick={() => setPersonas((prev) => [...prev, freshPersona()])}
                  className="w-full py-3.5 rounded-xl border-2 border-dashed border-hairline text-xs text-muted/60 hover:border-primary/40 hover:text-primary transition font-semibold tracking-wider uppercase">
                  + Add Participant
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════════════════════
           STEP 3: COMMAND DIRECTIVES — Rules & Tension
           ════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <section>
            <div className="relative mb-8 pb-6 border-b border-hairline">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">03 · Command Directives</span>
              <h2 className="font-display text-3xl font-semibold tracking-display text-ink mt-1">Protocols & Environment</h2>
              <p className="text-sm text-muted mt-1 max-w-xl leading-relaxed">
                Set the rules of engagement, tension parameters, and operational flags.
              </p>
              <div className="absolute right-0 top-0 w-12 h-12 border-r-2 border-t-2 border-primary/20 rounded-tr-xl" />
            </div>

            <div className="max-w-4xl space-y-8">
              {/* ── Protocol: Speaker Rules ── */}
              <div className="rounded-xl border border-hairline bg-surface-card/60 p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-primary font-mono text-xs font-bold">A</span>
                  </div>
                  <div>
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">Protocol Alpha</h3>
                    <p className="font-display text-xl font-semibold tracking-display text-ink mt-0.5">Speaker Rules</p>
                    <p className="text-sm text-muted/70 mt-0.5">How the debate flow is governed</p>
                  </div>
                </div>
                <div className="flex gap-1.5 rounded-xl bg-canvas/60 p-1 border border-hairline">
                  {SPEAKER_MODES.map((mode) => (
                    <button key={mode} onClick={() => setSpeakerMode(mode)}
                      className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold capitalize transition ${
                        speakerMode === mode ? "bg-surface-dark text-canvas shadow-sm" : "text-muted hover:text-ink"
                      }`}>{mode.replace("_", " ")}</button>
                  ))}
                </div>
              </div>

              {/* ── Protocol: End Condition ── */}
              <div className="rounded-xl border border-hairline bg-surface-card/60 p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-8 h-8 rounded-full bg-accent-amber/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-accent-amber font-mono text-xs font-bold">B</span>
                  </div>
                  <div>
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">Protocol Beta</h3>
                    <p className="font-display text-xl font-semibold tracking-display text-ink mt-0.5">End Condition</p>
                    <p className="text-sm text-muted/70 mt-0.5">When and how the simulation concludes</p>
                  </div>
                </div>
                <div className="flex gap-1.5 rounded-xl bg-canvas/60 p-1 border border-hairline mb-4">
                  {END_TYPES.map((type) => (
                    <button key={type} onClick={() => setEndConditionType(type)}
                      className={`flex-1 rounded-lg px-2.5 py-2 text-[10px] font-semibold capitalize transition ${
                        endConditionType === type ? "bg-surface-dark text-canvas shadow-sm" : "text-muted hover:text-ink"
                      }`}>{type}</button>
                  ))}
                </div>

                {/* ── End condition sub-configs ── */}
                {endConditionType === "timeout" && (
                  <div className="rounded-xl bg-canvas/40 border border-hairline p-5 space-y-3">
                    <p className="text-xs text-muted/70">Simulation ends after a fixed number of turns. Simple and predictable.</p>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-muted font-medium">Max turns</span>
                        <span className="font-mono text-sm font-bold text-ink">{maxTurns}</span>
                      </div>
                      <input type="range" min="2" max="50" value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} className="w-full accent-primary h-1" />
                    </div>
                  </div>
                )}

                {endConditionType === "vote" && (
                  <div className="rounded-xl bg-canvas/40 border border-hairline p-5 space-y-4">
                    <p className="text-xs text-muted/70">Agents express vote positions. When threshold is met, simulation ends with consensus.</p>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-muted font-medium">Threshold</span>
                        <span className="font-mono text-sm font-bold text-ink">{thresholdPct}%</span>
                      </div>
                      <input type="range" min="30" max="100" value={thresholdPct} onChange={(e) => setThresholdPct(Number(e.target.value))} className="w-full accent-primary h-1" />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-muted font-medium">Max turns (hard cap)</span>
                        <span className="font-mono text-sm font-bold text-ink">{maxTurns}</span>
                      </div>
                      <input type="range" min="3" max="50" value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} className="w-full accent-primary h-1" />
                    </div>
                    <p className="text-[10px] text-muted/50 italic">Agents use the &quot;vote&quot; action type. System tallies automatically.</p>
                  </div>
                )}

                {endConditionType === "judge" && (
                  <div className="rounded-xl bg-canvas/40 border border-hairline p-5 space-y-4">
                    <p className="text-xs text-muted/70">An LLM judge evaluates the debate periodically and declares when a conclusion is reached.</p>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Judge persona</label>
                      <select value={judgePersonaId} onChange={(e) => setJudgePersonaId(e.target.value)}
                        className="w-full rounded-lg border border-hairline bg-canvas/60 px-3 py-2.5 text-xs outline-none focus:border-primary">
                        <option value="">Auto-select first persona</option>
                        {personas.filter(p => p.name).map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.stance})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-muted font-medium">Evaluate every</span>
                        <span className="font-mono text-sm font-bold text-ink">{maxTurns} turns (max)</span>
                      </div>
                      <input type="range" min="3" max="50" value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} className="w-full accent-primary h-1" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Evaluation criteria</label>
                      {judgeCriteria.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-canvas/60">
                          <span className="text-xs flex-1">{c}</span>
                          <button onClick={() => setJudgeCriteria((prev) => prev.filter((_, j) => j !== i))} className="text-[10px] text-primary-active/60 hover:text-primary">×</button>
                        </div>
                      ))}
                      <div className="flex gap-1.5">
                        <input value={judgeCriteriaInput} onChange={(e) => setJudgeCriteriaInput(e.target.value)}
                          className="flex-1 rounded-lg border border-hairline bg-canvas/60 px-3 py-2 text-xs outline-none focus:border-primary" placeholder="Add criterion..." />
                        <button onClick={() => { if (judgeCriteriaInput.trim()) { setJudgeCriteria((prev) => [...prev, judgeCriteriaInput.trim()]); setJudgeCriteriaInput(""); } }}
                          className="rounded-lg bg-ink text-on-dark px-3 py-2 text-xs font-semibold">Add</button>
                      </div>
                    </div>
                  </div>
                )}

                {endConditionType === "consensus" && (
                  <div className="rounded-xl bg-canvas/40 border border-hairline p-5 space-y-4">
                    <p className="text-xs text-muted/70">Monitors trust and tension dynamics. Detects genuine agreement or deadlock.</p>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-2">Sensitivity</label>
                      <div className="flex gap-1.5">
                        {(["diplomatic", "balanced", "sensitive"] as const).map((s) => (
                          <button key={s} onClick={() => setConsensusSensitivity(s)}
                            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${
                              consensusSensitivity === s ? "bg-surface-dark text-canvas shadow-sm" : "bg-canvas/60 text-muted border border-hairline"
                            }`}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-2">Detection mode</label>
                      <div className="flex gap-1.5">
                        {(["both", "agreement_only", "deadlock_only"] as const).map((m) => (
                          <button key={m} onClick={() => setConsensusDetectionMode(m)}
                            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${
                              consensusDetectionMode === m ? "bg-surface-dark text-canvas shadow-sm" : "bg-canvas/60 text-muted border border-hairline"
                            }`}>{m.replace("_", " ")}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-muted font-medium">Max turns (safety valve)</span>
                        <span className="font-mono text-sm font-bold text-ink">{maxTurns}</span>
                      </div>
                      <input type="range" min="5" max="50" value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} className="w-full accent-primary h-1" />
                    </div>
                  </div>
                )}

                {endConditionType === "hybrid" && (
                  <div className="rounded-xl bg-canvas/40 border border-hairline p-5 space-y-4">
                    <p className="text-xs text-muted/70">Enable multiple conditions. First to trigger wins.</p>
                    {([
                      { key: hybridVote as boolean, set: setHybridVote, label: "Vote", desc: "Tally votes with 60% threshold" },
                      { key: hybridConsensus as boolean, set: setHybridConsensus, label: "Consensus", desc: "Social physics detection (balanced)" },
                      { key: hybridJudge as boolean, set: setHybridJudge, label: "Judge", desc: "LLM judge evaluation" },
                    ] as const).map((opt) => (
                      <label key={opt.label} className="flex items-start gap-3 p-3 rounded-xl border border-hairline bg-canvas/40 cursor-pointer hover:border-primary/40 transition">
                        <input type="checkbox" checked={opt.key} onChange={() => (opt.set as (v: boolean) => void)(!opt.key)}
                          className="rounded border-hairline text-primary focus:ring-primary h-4 w-4 mt-0.5" />
                        <div>
                          <span className="text-sm font-semibold text-ink">{opt.label}</span>
                          <p className="text-xs text-muted/70">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-muted font-medium">Max turns (safety valve)</span>
                        <span className="font-mono text-sm font-bold text-ink">{maxTurns}</span>
                      </div>
                      <input type="range" min="5" max="50" value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} className="w-full accent-primary h-1" />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Tension Gauge ── */}
              <div className="rounded-xl border border-hairline bg-surface-card/60 p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-primary font-mono text-xs font-bold">⚡</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">Environment</h3>
                    <p className="font-display text-xl font-semibold tracking-display text-ink mt-0.5">Tension & Voltage</p>
                    <p className="text-sm text-muted/70 mt-0.5">Simulation pressure and environmental variables</p>
                  </div>
                </div>

                {/* Voltage gauge */}
                <div className="rounded-xl bg-canvas/40 border border-hairline p-5 mb-4">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-ink">Voltage</span>
                      <span className="font-display text-2xl font-bold tracking-display text-ink">{voltage}%</span>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                      voltage < 30 ? "bg-accent-teal/10 text-accent-teal" :
                      voltage > 70 ? "bg-primary/10 text-primary" :
                      "bg-accent-amber/10 text-accent-amber"
                    }`}>
                      {voltage < 30 ? "Diplomatic" : voltage > 70 ? "Hostile" : "Balanced"}
                    </span>
                  </div>
                  {/* Visual pressure meter */}
                  <div className="relative h-2 rounded-full bg-ink/5 overflow-hidden mb-2">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${voltage}%`,
                        background: voltage < 30
                          ? "linear-gradient(90deg, var(--color-accent-teal), var(--color-secondary))"
                          : voltage > 70
                          ? "linear-gradient(90deg, var(--color-accent-amber), var(--color-primary))"
                          : "linear-gradient(90deg, var(--color-accent-teal), var(--color-accent-amber))"
                      }} />
                  </div>
                  <input type="range" min="0" max="100" value={voltage} onChange={(e) => setVoltage(Number(e.target.value))}
                    className="w-full accent-primary h-1" />
                </div>

                {/* Env flags — intel advisories */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                  {ENV_FLAGS.map((flag) => (
                    <label key={flag.key}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                        envFlags[flag.key] ? "border-primary bg-primary/5" : "border-hairline bg-canvas/50 hover:border-primary/40"
                      }`}>
                      <input type="checkbox" checked={envFlags[flag.key]} onChange={() => toggleEnvFlag(flag.key)}
                        className="rounded border-hairline text-primary focus:ring-primary h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <span className="flex items-center gap-2 text-xs font-semibold text-ink">{flag.label}</span>
                        <p className="text-[10px] text-muted/70 mt-0.5 leading-relaxed">{flag.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Model Temperature — stamps */}
                <div>
                  <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted mb-3">Model Temperature</h3>
                  <div className="flex gap-2 rounded-xl bg-canvas/60 p-1 border border-hairline max-w-sm">
                    {(["stable", "volatile"] as const).map((t) => (
                      <button key={t} onClick={() => setModelTemp(t)}
                        className={`flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider transition ${
                          modelTemp === t
                            ? "bg-surface-dark text-canvas shadow-sm"
                            : "text-muted hover:text-ink"
                        }`}>
                        {t}
                        <span className="block text-[9px] font-normal tracking-normal opacity-70 mt-0.5">
                          {t === "stable" ? "Predictable outputs" : "High variance"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Custom Actions ── */}
              <div className="rounded-xl border border-hairline bg-surface-card/60 p-6">
                <button onClick={() => setShowActions(!showActions)}
                  className="flex items-center gap-3 text-sm font-semibold text-muted hover:text-ink transition w-full text-left">
                  <span className={`material-symbols-outlined text-lg transition ${showActions ? "rotate-90" : ""}`}>chevron_right</span>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em]">Custom Actions</span>
                  {actions.length > 0 && (
                    <span className="ml-auto font-mono text-[10px] text-primary bg-primary/5 px-2 py-0.5 rounded-full">{actions.length}</span>
                  )}
                </button>
                {showActions && (
                  <div className="mt-4 space-y-3">
                    {actions.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl bg-canvas/50 border border-hairline p-3">
                        <span className="font-semibold text-sm text-ink min-w-[100px]">{a.name}</span>
                        <span className="text-xs text-muted/70 flex-1">{a.description}</span>
                        <span className="text-[10px] text-muted font-mono">T{a.trust_delta} L{a.leverage_delta}</span>
                        <button onClick={() => setActions((prev) => prev.filter((_, j) => j !== i))} className="text-[10px] text-primary-active/60 hover:text-primary">×</button>
                      </div>
                    ))}
                    <div className="rounded-xl border border-hairline bg-canvas/40 p-4 space-y-3">
                      <div className="flex gap-2">
                        <input value={newAction.name} onChange={(e) => setNewAction((a) => ({ ...a, name: e.target.value }))}
                          className="flex-1 rounded-lg border border-hairline bg-canvas/60 px-3 py-2 text-xs outline-none focus:border-primary" placeholder="Action name" />
                        <input value={newAction.description} onChange={(e) => setNewAction((a) => ({ ...a, description: e.target.value }))}
                          className="flex-1 rounded-lg border border-hairline bg-canvas/60 px-3 py-2 text-xs outline-none focus:border-primary" placeholder="Description" />
                      </div>
                      <div className="flex gap-4 items-center text-xs">
                        <label className="text-muted flex items-center gap-1">Trust ±
                          <input type="number" value={newAction.trust_delta} onChange={(e) => setNewAction((a) => ({ ...a, trust_delta: Number(e.target.value) }))}
                            className="ml-1 w-14 rounded-lg border border-hairline bg-canvas/60 px-2 py-1.5 text-center outline-none text-ink font-mono" />
                        </label>
                        <label className="text-muted flex items-center gap-1">Leverage ±
                          <input type="number" value={newAction.leverage_delta} onChange={(e) => setNewAction((a) => ({ ...a, leverage_delta: Number(e.target.value) }))}
                            className="ml-1 w-14 rounded-lg border border-hairline bg-canvas/60 px-2 py-1.5 text-center outline-none text-ink font-mono" />
                        </label>
                        <Button variant="ghost" onClick={() => {
                          if (newAction.name.trim()) { setActions((prev) => [...prev, { ...newAction }]); setNewAction({ name: "", description: "", trust_delta: 0, leverage_delta: 0 }); }
                        }}>Add</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════════════════════
           STEP 4: FINAL BRIEFING — Review & Launch
           ════════════════════════════════════════════════════════ */}
        {step === 4 && (
          <section>
            <div className="relative mb-8 pb-6 border-b border-hairline">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">04 · Final Briefing</span>
              <h2 className="font-display text-3xl font-semibold tracking-display text-ink mt-1">Dossier Summary</h2>
              <p className="text-sm text-muted mt-1 max-w-xl leading-relaxed">
                Review the complete case file before sealing and dispatching.
              </p>
              <div className="absolute right-0 top-0 w-12 h-12 border-r-2 border-t-2 border-primary/20 rounded-tr-xl" />
            </div>

            <div className="max-w-3xl space-y-6">
              {/* ── Seal / dossier cover ── */}
              <div className="relative rounded-xl bg-surface-card/80 border border-hairline p-7 overflow-hidden">
                {/* Decorative seal */}
                <div className="absolute -top-4 -right-4 w-20 h-20 border-2 border-primary/15 rounded-full flex items-center justify-center opacity-60">
                  <div className="w-14 h-14 border-2 border-primary/20 rounded-full flex items-center justify-center">
                    <span className="font-display text-sm text-primary/40 font-bold">✦</span>
                  </div>
                </div>
                <div className="flex items-start gap-4 mb-1">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary font-display text-lg font-bold">S</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted/60">Sealed Document · Case File</p>
                    <p className="font-display text-3xl font-bold tracking-display text-ink mt-1">{subject.name || "Untitled Brief"}</p>
                    {subject.description && (
                      <p className="text-sm text-muted/80 mt-2 max-w-lg leading-relaxed">{subject.description}</p>
                    )}
                    {subject.stakes_description && (
                      <p className="text-sm text-muted/60 italic mt-1.5 border-l-2 border-accent-amber/40 pl-3">{subject.stakes_description}</p>
                    )}
                  </div>
                </div>
                {/* Attributes + evidence summary */}
                <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-hairline">
                  {Object.keys(subject.attributes).length > 0 && (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-muted/60 bg-canvas/60 px-2.5 py-1 rounded-lg">
                      {Object.keys(subject.attributes).length} attribute{Object.keys(subject.attributes).length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {subject.evidence_items.length > 0 && (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-muted/60 bg-canvas/60 px-2.5 py-1 rounded-lg">
                      {subject.evidence_items.length} clipping{subject.evidence_items.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {uploadFiles.length > 0 && (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-muted/60 bg-canvas/60 px-2.5 py-1 rounded-lg">
                      {uploadFiles.length} reference file{uploadFiles.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Roll Call: Participants ── */}
              <div className="rounded-xl bg-surface-card/80 border border-hairline p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-primary/60" />
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">Roll Call · {personas.length} participant{personas.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="space-y-2">
                  {personas.map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-canvas/50 border border-hairline/60">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[9px] text-muted/40 w-4">{(idx + 1).toString().padStart(2, "0")}</span>
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center font-display text-xs font-bold border-2 ${
                          p.stance === "champion" ? "bg-primary/15 border-primary/40 text-primary" :
                          p.stance === "detractor" ? "bg-red-500/10 border-red-500/30 text-red-600" :
                          p.stance === "wildcard" ? "bg-accent-amber/10 border-accent-amber/30 text-accent-amber" :
                          p.stance === "moderator" ? "bg-accent-teal/10 border-accent-teal/30 text-accent-teal" :
                          "bg-muted/10 border-muted/20 text-muted"
                        }`}>{initial(p.name)}</span>
                        <div>
                          <span className="text-sm font-semibold text-ink">{p.name || "?"}</span>
                          {p.role && <span className="text-[10px] text-muted/70 ml-2">{p.role}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.stance && (
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${stanceColor(p.stance)}`}>
                            {p.stance}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Rules Digest ── */}
              <div className="rounded-xl bg-surface-card/80 border border-hairline p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-accent-amber/60" />
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">Orders of Engagement</p>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted/60">Speaker Protocol</span>
                  <span className="text-sm font-semibold text-ink capitalize">{speakerMode.replace("_", " ")}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted/60">End Condition</span>
                  <span className="text-sm font-semibold text-ink">
                    {endConditionType === "timeout" && `Timeout (${maxTurns} turns)`}
                    {endConditionType === "vote" && `Vote (${thresholdPct}% threshold, max ${maxTurns} turns)`}
                    {endConditionType === "judge" && `Judge (${judgeCriteria.length} criteria, max ${maxTurns} turns)`}
                    {endConditionType === "consensus" && `Consensus (${consensusSensitivity}, max ${maxTurns} turns)`}
                    {endConditionType === "hybrid" && `Hybrid (${[hybridVote && "Vote", hybridConsensus && "Consensus", hybridJudge && "Judge"].filter(Boolean).join("+")}, max ${maxTurns} turns)`}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted/60">Tension Voltage</span>
                  <span className="text-sm font-semibold text-ink">{voltage}%</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted/60">Model Temp</span>
                  <span className="text-sm font-semibold text-ink capitalize">{modelTemp}</span>
                </div>
                {actions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-hairline">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted/60 mb-2">Custom Directives</p>
                    <div className="flex flex-wrap gap-1.5">
                      {actions.map((a) => (
                        <span key={a.name} className="text-[10px] bg-canvas/60 border border-hairline px-2 py-1 rounded-lg text-muted">{a.name}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════════════════════
           FOOTER NAV — Editorial page-turn posture
           ════════════════════════════════════════════════════════ */}
        <div className="mt-10 pt-6 border-t border-hairline flex items-center justify-between">
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}
            className="group flex items-center gap-2 text-sm text-muted/60 hover:text-ink transition disabled:opacity-20 font-medium">
            <span className="material-symbols-outlined text-lg transition-transform group-hover:-translate-x-0.5">arrow_back</span>
            <span className="font-mono text-[10px] uppercase tracking-wider">Previous</span>
          </button>

          <div className="flex items-center gap-3">
            {step < TOTAL_STEPS ? (
              <button onClick={handleNext}
                className="group flex items-center gap-3 rounded-xl bg-ink text-on-dark px-6 py-3 text-xs font-bold uppercase tracking-wider hover:bg-surface-dark-elevated transition shadow-sm">
                <span>Continue Briefing</span>
                <span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-0.5">arrow_forward</span>
              </button>
            ) : (
              <button onClick={finish} disabled={submitting}
                className="group flex items-center gap-3 rounded-xl bg-primary text-on-dark px-7 py-3.5 text-xs font-bold uppercase tracking-wider hover:bg-primary-active transition shadow-sm disabled:opacity-50">
                {submitting ? (
                  isUploading ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Uploading</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Sealing</span>
                    </span>
                  )
                ) : (
                  <>
                    <span>Seal &amp; Dispatch</span>
                    <span className="text-base leading-none opacity-70">✦</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </AppShell>
  );
}

