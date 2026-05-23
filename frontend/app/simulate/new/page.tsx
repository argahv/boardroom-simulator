"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { createSimulationV2, fetchStakeholders } from "@/lib/api";
import type {
  SimulationV2Config,
  Subject,
  StakeholderV2,
  PersonalityProfile,
  ActionSpace,
  CustomActionDef,
  SpeakerRules,
  EndCondition,
  AgentStance,
  EnvFlags,
  Stakeholder,
} from "@/lib/types";

const EMPTY_PERSONALITY: PersonalityProfile = { aggressiveness: 50, empathy: 50, stubbornness: 50, verbosity: 50 };
const STANCES: AgentStance[] = ["champion", "detractor", "neutral", "moderator", "wildcard"];
const SPEAKER_MODES = ["moderator_led", "alternating", "freeform", "weighed_random"] as const;
const END_TYPES = ["timeout", "vote", "judge"] as const;

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

  // Step 1 — Subject
  const [subject, setSubject] = useState<Subject>({
    name: "", description: "", attributes: {}, evidence_items: [], stakes_description: "",
  });
  const [attrKey, setAttrKey] = useState("");
  const [attrVal, setAttrVal] = useState("");
  const [evidenceInput, setEvidenceInput] = useState("");

  // Step 2 — Personas
  const [personas, setPersonas] = useState<StakeholderV2[]>([freshPersona(), freshPersona()]);
  const [library, setLibrary] = useState<Stakeholder[]>([]);
  const [selectedLibraryIdx, setSelectedLibraryIdx] = useState<number | null>(null);

  // Step 3 — Rules, Tension, Actions
  const [speakerMode, setSpeakerMode] = useState<SpeakerRules["mode"]>("alternating");
  const [endConditionType, setEndConditionType] = useState<"timeout" | "vote" | "judge">("timeout");
  const [maxTurns, setMaxTurns] = useState(10);
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
    if (endConditionType === "vote") return { type: "vote", voters: personas.map((p) => p.id), threshold: 0.5, max_turns: maxTurns };
    return { type: "judge", judge_id: personas[0]?.id ?? "", criteria: [] };
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
      const result = await createSimulationV2(buildConfig());
      router.push(`/simulate/${result.simulation_id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create simulation");
      setSubmitting(false);
    }
  };

  return (
    <AppShell activeTab="War Room">
      <div className="max-w-5xl mx-auto px-8 py-8">
        
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Simulation Setup</p>
            <h2 className="mt-2 font-display text-4xl font-semibold tracking-display">Configure debate</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted font-medium">Step {step} of {TOTAL_STEPS}</span>
            <div className="flex gap-1.5">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <span key={i} className={`h-2 rounded-full transition-all duration-500 ${i + 1 <= step ? "w-8 bg-primary" : "w-2 bg-ink/10"}`} />
              ))}
            </div>
          </div>
        </div>

        {error && <div className="mb-6 rounded-xl bg-primary/10 border border-primary/20 p-4 text-sm text-primary-active">{error}</div>}

        {/* ── STEP 1: Subject & Context ── */}
        {step === 1 && (
          <section className="max-w-2xl space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-ink">Subject name</label>
              <input value={subject.name} onChange={(e) => setSubject((s) => ({ ...s, name: e.target.value }))}
                className="w-full rounded-xl border border-hairline bg-surface-card/50 px-5 py-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
                placeholder="e.g. Will Balen, Climate Policy, Merger Decision" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-ink">Description</label>
              <textarea value={subject.description} onChange={(e) => setSubject((s) => ({ ...s, description: e.target.value }))}
                className="w-full min-h-28 rounded-xl border border-hairline bg-surface-card/50 px-5 py-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
                placeholder="What is this debate about?" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-ink">Stakes</label>
              <textarea value={subject.stakes_description} onChange={(e) => setSubject((s) => ({ ...s, stakes_description: e.target.value }))}
                className="w-full min-h-20 rounded-xl border border-hairline bg-surface-card/50 px-5 py-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
                placeholder="What's at stake?" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-ink">Attributes</label>
              <div className="flex gap-2">
                <input value={attrKey} onChange={(e) => setAttrKey(e.target.value)}
                  className="flex-1 rounded-xl border border-hairline bg-surface-card/50 px-4 py-2.5 text-sm outline-none focus:border-primary" placeholder="Key" />
                <input value={attrVal} onChange={(e) => setAttrVal(e.target.value)}
                  className="flex-1 rounded-xl border border-hairline bg-surface-card/50 px-4 py-2.5 text-sm outline-none focus:border-primary" placeholder="Value" />
                <Button variant="ghost" onClick={() => {
                  if (attrKey && attrVal) {
                    setSubject((s) => ({ ...s, attributes: { ...s.attributes, [attrKey]: isNaN(Number(attrVal)) ? attrVal : Number(attrVal) } }));
                    setAttrKey(""); setAttrVal("");
                  }
                }}>Add</Button>
              </div>
              {Object.entries(subject.attributes).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {Object.entries(subject.attributes).map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-full bg-surface-card px-3 py-1 text-xs">
                      {k}: {v}
                      <button onClick={() => { const { [k]: _, ...rest } = subject.attributes; setSubject((s) => ({ ...s, attributes: rest })); }} className="text-muted hover:text-error ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-ink">Evidence items</label>
              <div className="flex gap-2">
                <input value={evidenceInput} onChange={(e) => setEvidenceInput(e.target.value)}
                  className="flex-1 rounded-xl border border-hairline bg-surface-card/50 px-4 py-2.5 text-sm outline-none focus:border-primary" placeholder="Add evidence..." />
                <Button variant="ghost" onClick={() => {
                  if (evidenceInput.trim()) { setSubject((s) => ({ ...s, evidence_items: [...s.evidence_items, evidenceInput.trim()] })); setEvidenceInput(""); }
                }}>Add</Button>
              </div>
              {subject.evidence_items.length > 0 && (
                <ul className="space-y-1 mt-2">
                  {subject.evidence_items.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-xl bg-surface-card px-4 py-2 text-sm">
                      <span className="text-muted">•</span> {item}
                      <button onClick={() => setSubject((s) => ({ ...s, evidence_items: s.evidence_items.filter((_, j) => j !== i) }))} className="ml-auto text-muted hover:text-error">×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* ── STEP 2: Persona Selection ── */}
        {step === 2 && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[400px]">
            
            <div className="lg:col-span-5 border border-hairline rounded-xl bg-surface-card/30 p-5">
              <h3 className="font-display text-2xl font-semibold mb-1">Library</h3>
              <p className="text-xs text-muted mb-4">Choose voices from your persona library</p>
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {library.map((st, i) => (
                  <div key={st.id} className="flex items-center justify-between p-3 rounded-xl bg-canvas/80 border border-hairline hover:border-primary/40 transition cursor-pointer"
                    onClick={() => { setSelectedLibraryIdx(i); addLibraryPersona(st); }}>
                    <div>
                      <p className="text-sm font-semibold">{st.name}</p>
                      <p className="text-xs text-muted">{st.role} · {st.tag}</p>
                    </div>
                    <button className="w-8 h-8 rounded-full border border-hairline flex items-center justify-center text-primary hover:bg-primary hover:text-on-dark transition">
                      <span className="material-symbols-outlined text-lg">add</span>
                    </button>
                  </div>
                ))}
                {library.length === 0 && <p className="text-sm text-muted italic py-8 text-center">No personas in library. Build from scratch below.</p>}
              </div>
            </div>

            
            <div className="lg:col-span-7 space-y-4 max-h-[520px] overflow-y-auto">
              <h3 className="font-display text-2xl font-semibold">The Roundtable</h3>
              <p className="text-xs text-muted -mt-3">Define disposition and agendas for each participant</p>

              {personas.map((p) => (
                <div key={p.id} className="rounded-xl bg-surface-card border border-hairline p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input value={p.name} onChange={(e) => updatePersona(p.id, { name: e.target.value })}
                        className="rounded-xl border border-hairline bg-canvas/60 px-4 py-2.5 text-sm font-semibold outline-none focus:border-primary" placeholder="Name" />
                      <input value={p.role} onChange={(e) => updatePersona(p.id, { role: e.target.value })}
                        className="rounded-xl border border-hairline bg-canvas/60 px-4 py-2.5 text-sm outline-none focus:border-primary" placeholder="Role" />
                    </div>
                    <button onClick={() => removePersona(p.id)} disabled={personas.length <= 2}
                      className="text-xs text-muted hover:text-error transition shrink-0 disabled:opacity-30">Remove</button>
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    {STANCES.map((stance) => (
                      <button key={stance} onClick={() => updatePersona(p.id, { stance })}
                        className={`rounded-full px-3 py-1 text-xs capitalize transition font-medium ${
                          p.stance === stance ? "bg-primary text-on-dark" : "bg-canvas/60 text-muted hover:text-ink border border-hairline"
                        }`}>{stance}</button>
                    ))}
                  </div>

                  <textarea value={p.backstory} onChange={(e) => updatePersona(p.id, { backstory: e.target.value })}
                    className="w-full min-h-16 rounded-xl border border-hairline bg-canvas/60 p-3 text-sm outline-none focus:border-primary" placeholder="Backstory..." />

                  <div className="grid grid-cols-2 gap-3">
                    <textarea value={p.hidden_agenda} onChange={(e) => updatePersona(p.id, { hidden_agenda: e.target.value })}
                      className="w-full min-h-12 rounded-xl border border-hairline bg-canvas/60 p-2.5 text-sm outline-none focus:border-primary" placeholder="Hidden agenda (optional)" />
                    <div className="space-y-1">
                      {(["aggressiveness", "empathy"] as const).map((trait) => (
                        <label key={trait} className="flex items-center gap-2 text-xs text-muted">
                          <span className="w-24">{trait.slice(0, 4)}</span>
                          <input type="range" min="0" max="100" value={p.personality[trait]}
                            onChange={(e) => updatePersonality(p.id, trait, Number(e.target.value))}
                            className="flex-1 accent-primary h-1" />
                          <span className="w-6 text-right font-mono text-[10px]">{p.personality[trait]}</span>
                        </label>
                      ))}
                      {(["stubbornness", "verbosity"] as const).map((trait) => (
                        <label key={trait} className="flex items-center gap-2 text-xs text-muted">
                          <span className="w-24">{trait.slice(0, 4)}</span>
                          <input type="range" min="0" max="100" value={p.personality[trait]}
                            onChange={(e) => updatePersonality(p.id, trait, Number(e.target.value))}
                            className="flex-1 accent-primary h-1" />
                          <span className="w-6 text-right font-mono text-[10px]">{p.personality[trait]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={() => setPersonas((prev) => [...prev, freshPersona()])}
                className="w-full py-3 rounded-xl border-2 border-dashed border-hairline text-sm text-muted hover:border-primary hover:text-primary transition">
                + Add persona
              </button>
            </div>
          </section>
        )}

        {/* ── STEP 3: Rules & Tension ── */}
        {step === 3 && (
          <section className="max-w-3xl space-y-8">
            
            <div>
              <h3 className="font-display text-2xl font-semibold mb-1">Speaker Rules</h3>
              <p className="text-xs text-muted mb-4">How the debate flow is controlled</p>
              <div className="flex gap-2 rounded-xl bg-surface-card/50 p-1 border border-hairline">
                {SPEAKER_MODES.map((mode) => (
                  <button key={mode} onClick={() => setSpeakerMode(mode)}
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium capitalize transition ${
                      speakerMode === mode ? "bg-surface-dark text-canvas shadow-sm" : "text-muted hover:text-ink"
                    }`}>{mode.replace("_", " ")}</button>
                ))}
              </div>
            </div>

            
            <div>
              <h3 className="font-display text-2xl font-semibold mb-1">End Condition</h3>
              <p className="text-xs text-muted mb-4">When the simulation stops</p>
              <div className="flex gap-2 rounded-xl bg-surface-card/50 p-1 border border-hairline mb-4">
                {END_TYPES.map((type) => (
                  <button key={type} onClick={() => setEndConditionType(type)}
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium capitalize transition ${
                      endConditionType === type ? "bg-surface-dark text-canvas shadow-sm" : "text-muted hover:text-ink"
                    }`}>{type}</button>
                ))}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Max turns</span>
                  <span className="font-mono text-sm">{maxTurns}</span>
                </div>
                <input type="range" min="2" max="30" value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} className="w-full accent-primary" />
              </div>
            </div>

            
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary text-lg">electric_bolt</span>
                <h3 className="font-display text-2xl font-semibold">Tension</h3>
              </div>
              <p className="text-xs text-muted mb-4">Simulation voltage and environmental variables</p>
              <div className="rounded-xl bg-surface-card border border-hairline p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-ink">Voltage: {voltage}%</span>
                  <span className="text-xs text-muted">{voltage < 30 ? "Diplomatic" : voltage > 70 ? "Hostile" : "Balanced"}</span>
                </div>
                <input type="range" min="0" max="100" value={voltage} onChange={(e) => setVoltage(Number(e.target.value))} className="w-full accent-primary" />
              </div>
            </div>

            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ENV_FLAGS.map((flag) => (
                <label key={flag.key}
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition ${
                    envFlags[flag.key] ? "border-primary bg-primary/5" : "border-hairline bg-surface-card/50 hover:border-primary/40"
                  }`}>
                  <div className="flex items-center h-5">
                    <input type="checkbox" checked={envFlags[flag.key]} onChange={() => toggleEnvFlag(flag.key)}
                      className="rounded border-hairline text-primary focus:ring-primary h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-ink">{flag.label}</span>
                    <p className="text-xs text-muted mt-0.5">{flag.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-lg">thermostat</span>
                <h3 className="font-display text-2xl font-semibold">Model Temperature</h3>
              </div>
              <div className="flex gap-2 rounded-xl bg-surface-card/50 p-1 border border-hairline max-w-md">
                {(["stable", "volatile"] as const).map((t) => (
                  <button key={t} onClick={() => setModelTemp(t)}
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium capitalize transition ${
                      modelTemp === t ? "bg-surface-dark text-canvas shadow-sm" : "text-muted hover:text-ink"
                    }`}>
                    {t}
                    <span className="block text-[10px] font-normal opacity-70">{t === "stable" ? "Predictable" : "High variance"}</span>
                  </button>
                ))}
              </div>
            </div>

            
            <div>
              <button onClick={() => setShowActions(!showActions)}
                className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink transition">
                <span className={`material-symbols-outlined text-lg transition ${showActions ? "rotate-90" : ""}`}>chevron_right</span>
                Custom Actions ({actions.length})
              </button>
              {showActions && (
                <div className="mt-3 space-y-3">
                  {actions.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl bg-surface-card p-3">
                      <span className="font-semibold text-sm">{a.name}</span>
                      <span className="text-xs text-muted flex-1">{a.description}</span>
                      <span className="text-xs text-muted font-mono">T{a.trust_delta} L{a.leverage_delta}</span>
                      <button onClick={() => setActions((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-primary-active">×</button>
                    </div>
                  ))}
                  <div className="rounded-xl border border-hairline bg-surface-card/40 p-4 space-y-3">
                    <div className="flex gap-2">
                      <input value={newAction.name} onChange={(e) => setNewAction((a) => ({ ...a, name: e.target.value }))}
                        className="flex-1 rounded-xl border border-hairline bg-canvas/60 px-4 py-2 text-sm outline-none focus:border-primary" placeholder="Action name" />
                      <input value={newAction.description} onChange={(e) => setNewAction((a) => ({ ...a, description: e.target.value }))}
                        className="flex-1 rounded-xl border border-hairline bg-canvas/60 px-4 py-2 text-sm outline-none focus:border-primary" placeholder="Description" />
                    </div>
                    <div className="flex gap-4 items-center text-sm">
                      <label className="text-muted">Trust ±
                        <input type="number" value={newAction.trust_delta} onChange={(e) => setNewAction((a) => ({ ...a, trust_delta: Number(e.target.value) }))}
                          className="ml-1 w-16 rounded-xl border border-hairline bg-canvas/60 px-3 py-1.5 text-center outline-none" />
                      </label>
                      <label className="text-muted">Leverage ±
                        <input type="number" value={newAction.leverage_delta} onChange={(e) => setNewAction((a) => ({ ...a, leverage_delta: Number(e.target.value) }))}
                          className="ml-1 w-16 rounded-xl border border-hairline bg-canvas/60 px-3 py-1.5 text-center outline-none" />
                      </label>
                      <Button variant="ghost" onClick={() => {
                        if (newAction.name.trim()) { setActions((prev) => [...prev, { ...newAction }]); setNewAction({ name: "", description: "", trust_delta: 0, leverage_delta: 0 }); }
                      }}>Add</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── STEP 4: Review & Launch ── */}
        {step === 4 && (
          <section className="max-w-2xl space-y-6">
            <div>
              <h3 className="font-display text-3xl font-semibold">Review</h3>
              <p className="text-sm text-muted mt-1">Verify everything before launching</p>
            </div>

            <div className="rounded-xl bg-surface-card border border-hairline p-5 space-y-1">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Subject</p>
              <p className="font-display text-2xl font-semibold">{subject.name}</p>
              {subject.description && <p className="text-sm text-muted">{subject.description}</p>}
              {subject.stakes_description && <p className="text-sm text-muted italic">{subject.stakes_description}</p>}
            </div>

            <div className="rounded-xl bg-surface-card border border-hairline p-5">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Participants ({personas.length})</p>
              <div className="space-y-2">
                {personas.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5">
                    <span className="font-medium text-sm">{p.name || "?"}</span>
                    <div className="flex items-center gap-2">
                      {p.role && <span className="text-xs text-muted">{p.role}</span>}
                      <span className="rounded-full bg-canvas/80 px-3 py-0.5 text-xs capitalize border border-hairline">{p.stance}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-surface-card border border-hairline p-5 space-y-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Rules</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted">Speaker</span><span className="font-medium capitalize">{speakerMode.replace("_", " ")}</span>
                <span className="text-muted">End</span><span className="font-medium capitalize">{endConditionType} ({maxTurns} turns)</span>
                <span className="text-muted">Voltage</span><span className="font-medium">{voltage}%</span>
                <span className="text-muted">Model</span><span className="font-medium capitalize">{modelTemp}</span>
              </div>
              {actions.length > 0 && (
                <p className="text-sm text-muted mt-2">Custom actions: <span className="font-medium text-ink">{actions.map((a) => a.name).join(", ")}</span></p>
              )}
            </div>
          </section>
        )}

        
        <div className="mt-8 flex items-center justify-between">
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}
            className="flex items-center gap-1 text-sm text-muted hover:text-ink transition disabled:opacity-30">
            <span className="material-symbols-outlined text-lg">arrow_back</span> Back
          </button>
          <div className="flex items-center gap-3">
            {step < TOTAL_STEPS ? (
              <Button onClick={handleNext}>Continue</Button>
            ) : (
              <Button onClick={finish} disabled={submitting}>
                {submitting ? (
                  <span className="flex items-center gap-2"><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</span>
                ) : "Launch debate"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
