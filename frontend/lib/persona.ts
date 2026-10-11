import type {
  AgentArchetype,
  AgentConfig,
  AgentStance,
  DraftPersona,
  EvolutionProposal,
  PersonalityProfile,
  Stakeholder,
  StakeholderPatch,
} from "@/lib/types";

/** One person as the UI edits them: a library persona, a seat in the Room, or an AI draft. */
export type PersonaDraft = {
  id?: string;
  name: string;
  role: string;
  backstory: string;
  focus?: string;
  stance: AgentStance;
  archetype: AgentArchetype | null;
  personality: PersonalityProfile;
  hidden_agenda: string;
  // Carried through so a library persona's tools survive a round trip into a simulation.
  tools?: string[];
};

export type Trait = keyof PersonalityProfile;

// ── Stance ─────────────────────────────────────────────────────────────

/** Order the stance ring steps through on click. */
export const STANCE_CYCLE: AgentStance[] = ["champion", "detractor", "neutral", "moderator", "wildcard"];

export type StanceMeta = {
  label: string;
  /** Plain-words side, e.g. "For" / "Against". */
  short: string;
  description: string;
  /** CSS colour (a var()) for rings and dots; too light for small text on the bone card. */
  color: string;
  /** Noun used by behaviourLine when the person has no archetype. */
  noun: string;
};

export const STANCE_META: Record<AgentStance, StanceMeta> = {
  champion: { label: "Champion", short: "For", description: "Wants it to happen", color: "var(--color-primary)", noun: "advocate" },
  detractor: { label: "Detractor", short: "Against", description: "Wants to stop it", color: "var(--color-error)", noun: "skeptic" },
  neutral: { label: "Neutral", short: "Undecided", description: "Can be won over", color: "var(--color-muted)", noun: "observer" },
  moderator: { label: "Moderator", short: "Chair", description: "Runs the meeting, doesn't vote", color: "var(--color-accent-teal)", noun: "chair" },
  wildcard: { label: "Wildcard", short: "Wildcard", description: "Unpredictable, may switch sides", color: "var(--color-accent-amber)", noun: "wildcard" },
};

export function isStance(v: unknown): v is AgentStance {
  return typeof v === "string" && (STANCE_CYCLE as string[]).includes(v);
}

export function nextStance(s: AgentStance, step: 1 | -1 = 1): AgentStance {
  const i = STANCE_CYCLE.indexOf(s);
  const n = STANCE_CYCLE.length;
  return STANCE_CYCLE[(((i < 0 ? 0 : i) + step) % n + n) % n];
}

// ── Personality traits ─────────────────────────────────────────────────

export const TRAITS: Trait[] = ["aggressiveness", "empathy", "stubbornness", "verbosity"];

export const DEFAULT_PERSONALITY: PersonalityProfile = { aggressiveness: 50, empathy: 50, stubbornness: 50, verbosity: 50 };

type Four = [string, string, string, string];

export type TraitMeta = {
  label: string;
  /** Words from low to high; see TRAIT_LEVELS for the ranges. */
  words: Four;
  /** What someone at each level does in a meeting; used by behaviourLine. */
  habits: Four;
  color: string;
};

export const TRAIT_META: Record<Trait, TraitMeta> = {
  aggressiveness: {
    label: "Aggressiveness",
    words: ["Gentle", "Measured", "Assertive", "Combative"],
    habits: ["avoids a fight", "picks battles", "pushes hard", "goes on the attack"],
    color: "var(--color-chart-1)",
  },
  empathy: {
    label: "Empathy",
    words: ["Cold", "Reserved", "Warm", "Empathic"],
    habits: ["unmoved by feelings", "keeps it professional", "listens first", "reads the room"],
    color: "var(--color-chart-2)",
  },
  stubbornness: {
    label: "Stubbornness",
    words: ["Flexible", "Open", "Firm", "Immovable"],
    habits: ["gives ground easily", "open to a good argument", "holds ground", "rarely concedes"],
    color: "var(--color-chart-3)",
  },
  verbosity: {
    label: "Verbosity",
    words: ["Terse", "Concise", "Talkative", "Long-winded"],
    habits: ["says little", "keeps to the point", "talks it through", "talks at length"],
    color: "var(--color-chart-4)",
  },
};

/**
 * Level boundaries on the 0-100 scale. The default 50 lands on the second word
 * ("Measured", "Reserved", "Open", "Concise") so an untouched person reads as ordinary.
 */
export const TRAIT_LEVELS: { min: number; max: number; value: number }[] = [
  { min: 0, max: 34, value: 20 },
  { min: 35, max: 54, value: 50 },
  { min: 55, max: 74, value: 65 },
  { min: 75, max: 100, value: 85 },
];

export function clampTrait(v: unknown, fallback = 50): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  // The API validates traits as ints.
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function traitLevel(value: number): 0 | 1 | 2 | 3 {
  const v = clampTrait(value);
  if (v < 35) return 0;
  if (v < 55) return 1;
  if (v < 75) return 2;
  return 3;
}

export function traitWord(trait: Trait, value: number): string {
  return TRAIT_META[trait].words[traitLevel(value)];
}

export function traitHabit(trait: Trait, value: number): string {
  return TRAIT_META[trait].habits[traitLevel(value)];
}

/** Accepts the shapes the API has used over time: object, JSON string, or nothing. */
export function normalizePersonality(raw: unknown): PersonalityProfile {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { obj = null; }
  }
  const src = obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>) : {};
  return {
    aggressiveness: clampTrait(src.aggressiveness),
    empathy: clampTrait(src.empathy),
    stubbornness: clampTrait(src.stubbornness),
    verbosity: clampTrait(src.verbosity),
  };
}

// ── Archetypes ─────────────────────────────────────────────────────────

/** Calmest to most combative, the order the chips are shown in. */
export const ARCHETYPES: AgentArchetype[] = ["diplomat", "idealist", "pragmatist", "guardian", "opportunist", "agitator"];

export type ArchetypeMeta = {
  label: string;
  description: string;
  /** The archetype's personality_bias from backend/app/runtime/archetypes.py. */
  bias: Partial<PersonalityProfile>;
  /** Dials a chip sets: the neutral 50 shifted by the bias. */
  preset: PersonalityProfile;
};

// Keep in sync with ARCHETYPES in backend/app/runtime/archetypes.py.
const ARCHETYPE_SOURCE: Record<AgentArchetype, { description: string; bias: Partial<PersonalityProfile> }> = {
  opportunist: { description: "Seizes openings, pivots quickly", bias: { aggressiveness: 10, empathy: -10, stubbornness: -10 } },
  idealist: { description: "Driven by principles, uncompromising on core values", bias: { aggressiveness: -10, empathy: 20, stubbornness: 30 } },
  diplomat: { description: "Seeks consensus, builds coalitions", bias: { aggressiveness: -20, empathy: 30, stubbornness: -10 } },
  pragmatist: { description: "Practical, data-driven, adapts", bias: {} },
  agitator: { description: "Provocative, challenges authority", bias: { aggressiveness: 30, empathy: -20, stubbornness: 20 } },
  guardian: { description: "Protects the status quo, cautious", bias: { aggressiveness: 10, empathy: 10, stubbornness: 20 } },
};

function presetFor(bias: Partial<PersonalityProfile>): PersonalityProfile {
  const out = { ...DEFAULT_PERSONALITY };
  for (const t of TRAITS) out[t] = clampTrait(out[t] + (bias[t] ?? 0));
  return out;
}

export const ARCHETYPE_META: Record<AgentArchetype, ArchetypeMeta> = Object.fromEntries(
  ARCHETYPES.map((a) => {
    const src = ARCHETYPE_SOURCE[a];
    return [a, {
      label: a.charAt(0).toUpperCase() + a.slice(1),
      description: src.description,
      bias: src.bias,
      preset: presetFor(src.bias),
    }];
  }),
) as Record<AgentArchetype, ArchetypeMeta>;

export function isArchetype(v: unknown): v is AgentArchetype {
  return typeof v === "string" && (ARCHETYPES as string[]).includes(v);
}

export function toArchetype(v: unknown): AgentArchetype | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : v;
  return isArchetype(s) ? s : null;
}

/** The patch a temperament chip applies: the archetype plus the dials it implies. */
export function withArchetype(a: AgentArchetype | null): Pick<PersonaDraft, "archetype"> & Partial<Pick<PersonaDraft, "personality">> {
  return a ? { archetype: a, personality: { ...ARCHETYPE_META[a].preset } } : { archetype: null };
}

// ── Behaviour line ─────────────────────────────────────────────────────

// Ties go to the trait that says more about how a negotiation will go.
const HEADLINE_ORDER: Trait[] = ["aggressiveness", "stubbornness", "empathy", "verbosity"];
const HABIT_ORDER: Trait[] = ["stubbornness", "aggressiveness", "empathy", "verbosity"];

function byDistinctness(p: PersonalityProfile, order: Trait[]): Trait[] {
  return [...order].sort((a, b) => Math.abs(p[b] - 50) - Math.abs(p[a] - 50) || order.indexOf(a) - order.indexOf(b));
}

/**
 * One line that predicts how this person behaves, e.g. "Combative guardian · rarely concedes".
 * The headline is the word for their most extreme trait; the habit comes from the next one.
 */
export function behaviourLine(p: Pick<PersonaDraft, "personality" | "archetype" | "stance">): string {
  const personality = normalizePersonality(p.personality);
  const noun = p.archetype ? ARCHETYPE_META[p.archetype].label.toLowerCase() : STANCE_META[p.stance]?.noun ?? "person";
  const [headline] = byDistinctness(personality, HEADLINE_ORDER);
  const adjective = Math.abs(personality[headline] - 50) < 10 ? "Balanced" : traitWord(headline, personality[headline]);
  const rest = byDistinctness(personality, HABIT_ORDER).filter((t) => t !== headline);
  let habitTrait = rest[0];
  if (Math.abs(personality[habitTrait] - 50) < 10) habitTrait = headline === "stubbornness" ? "aggressiveness" : "stubbornness";
  return `${adjective} ${noun} · ${traitHabit(habitTrait, personality[habitTrait])}`;
}

export const initials = (name: string): string =>
  name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

// ── Conversions ────────────────────────────────────────────────────────

export function emptyPersona(overrides: Partial<PersonaDraft> = {}): PersonaDraft {
  return {
    name: "",
    role: "",
    backstory: "",
    focus: "",
    stance: "neutral",
    archetype: null,
    personality: { ...DEFAULT_PERSONALITY },
    hidden_agenda: "",
    ...overrides,
  };
}

/** Id for a seat that is not (yet) in the library. */
export function newSeatId(): string {
  const rand = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `seat-${rand}`;
}

function toolList(raw: unknown): string[] {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try { v = JSON.parse(raw); } catch { v = []; }
  }
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
}

export function fromStakeholder(s: Stakeholder): PersonaDraft {
  return {
    id: s.id,
    name: s.name ?? "",
    role: s.role ?? "",
    backstory: s.backstory || "",
    focus: s.focus ?? "",
    stance: isStance(s.stance) ? s.stance : "neutral",
    archetype: toArchetype(s.archetype),
    personality: normalizePersonality(s.personality),
    hidden_agenda: s.hidden_agenda ?? "",
    tools: toolList(s.tools),
  };
}

export function fromAgentConfig(a: AgentConfig): PersonaDraft {
  return {
    id: a.id,
    name: a.name ?? "",
    role: a.role ?? "",
    backstory: a.backstory ?? "",
    stance: isStance(a.stance) ? a.stance : "neutral",
    archetype: toArchetype(a.archetype),
    personality: normalizePersonality(a.personality),
    hidden_agenda: a.hidden_agenda ?? "",
    tools: toolList(a.tools),
  };
}

/** A /drafts/persona result as an editable card (no id: it is not saved yet). */
export function fromDraft(d: DraftPersona): PersonaDraft {
  return {
    name: d.name ?? "",
    role: d.role ?? "",
    backstory: d.backstory ?? "",
    focus: d.focus ?? "",
    stance: isStance(d.stance) ? d.stance : "neutral",
    archetype: toArchetype(d.archetype),
    personality: normalizePersonality(d.personality),
    hidden_agenda: d.hidden_agenda ?? "",
  };
}

/** A seat for SimulationConfig.stakeholders. Library personas keep their id so memory and evolution accrue to them. */
export function toAgentConfig(p: PersonaDraft): AgentConfig {
  return {
    id: p.id || newSeatId(),
    name: p.name.trim(),
    role: p.role.trim(),
    backstory: p.backstory || p.focus || "",
    stance: p.stance,
    personality: normalizePersonality(p.personality),
    hidden_agenda: p.hidden_agenda,
    tools: p.tools ?? [],
    archetype: p.archetype,
  };
}

/** Body for POST /stakeholders (the server assigns the id). */
export function toStakeholder(p: PersonaDraft): Stakeholder {
  return {
    id: p.id ?? "",
    name: p.name.trim(),
    role: p.role.trim(),
    focus: p.focus ?? "",
    incentive_tuning: 50,
    hidden_agenda: p.hidden_agenda,
    backstory: p.backstory,
    stance: p.stance,
    archetype: p.archetype,
    personality: normalizePersonality(p.personality),
    tools: p.tools ?? [],
  };
}

/** Body for PATCH /stakeholders/{id} from a PersonaCard onChange patch (autosave). */
export function toStakeholderPatch(patch: Partial<PersonaDraft>): StakeholderPatch {
  const out: StakeholderPatch = {};
  if (patch.name !== undefined && patch.name.trim()) out.name = patch.name.trim();
  if (patch.role !== undefined) out.role = patch.role;
  if (patch.focus !== undefined) out.focus = patch.focus;
  if (patch.backstory !== undefined) out.backstory = patch.backstory;
  if (patch.stance !== undefined) out.stance = patch.stance;
  if (patch.archetype !== undefined) out.archetype = patch.archetype;
  if (patch.hidden_agenda !== undefined) out.hidden_agenda = patch.hidden_agenda;
  if (patch.personality !== undefined) out.personality = normalizePersonality(patch.personality);
  return out;
}

// ── Evolution ghosts ───────────────────────────────────────────────────

/** Trait deltas from one or more evolution proposals, summed; for PersonaCard's `ghost`. Non-trait keys (stance) are ignored. */
export function ghostFromEvolutions(
  evolutions: Pick<EvolutionProposal, "proposed_deltas"> | Pick<EvolutionProposal, "proposed_deltas">[],
): Partial<PersonalityProfile> {
  const list = Array.isArray(evolutions) ? evolutions : [evolutions];
  const out: Partial<PersonalityProfile> = {};
  for (const e of list) {
    let deltas: unknown = e.proposed_deltas;
    if (typeof deltas === "string") {
      try { deltas = JSON.parse(deltas); } catch { deltas = null; }
    }
    if (!deltas || typeof deltas !== "object") continue;
    for (const t of TRAITS) {
      const d = (deltas as Record<string, unknown>)[t];
      if (typeof d === "number" && Number.isFinite(d) && d !== 0) out[t] = (out[t] ?? 0) + Math.round(d);
    }
  }
  return out;
}

/** Personality after applying ghost deltas, clamped like the backend's approve. */
export function applyGhost(p: PersonalityProfile, ghost: Partial<PersonalityProfile> = {}): PersonalityProfile {
  const out = { ...p };
  for (const t of TRAITS) out[t] = clampTrait(p[t] + (ghost[t] ?? 0));
  return out;
}
