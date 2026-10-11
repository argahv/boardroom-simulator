import type {
  AgentStance,
  ConsensusCondition,
  CustomActionDef,
  EndCondition,
  EnvFlags,
  JudgeCondition,
  ScenarioType,
  SimulationConfig,
  SpeakerRules,
  Stakeholder,
  VoteCondition,
} from "@/lib/types";
import {
  STANCE_META,
  TRAITS,
  emptyPersona,
  fromAgentConfig,
  fromStakeholder,
  isStance,
  newSeatId,
  normalizePersonality,
  toAgentConfig,
  type PersonaDraft,
} from "@/lib/persona";

// ── Types ──────────────────────────────────────────────────────────────

export type Seat = {
  /** Stable React key; also what the judge and "That's me" point at, so swapping the person keeps them. */
  key: string;
  /** persona.id is always set: a library id, or a "seat-…" id until launch saves them. */
  persona: PersonaDraft;
  /** The library version when seated from the library, to tell an edit for this meeting from the saved profile. */
  saved?: PersonaDraft | null;
  /** Fields the AI inferred, shown as "AI guess" in the drawer. */
  guessed?: string[];
  /** Meetings this library person has been in. */
  simCount?: number;
};

export type Fact = { id: string; text: string; star: boolean };

export type EndPart = "vote" | "consensus" | "judge";
export type Ending = "timeout" | EndPart | "hybrid";
export type SpeakerChoice = SpeakerRules["mode"] | "auto";

export type Rules = {
  ending: Ending;
  /** Which endings race each other when ending is "hybrid". */
  parts: EndPart[];
  turns: number;
  /** Fraction of voters needed, 0-1. */
  threshold: number;
  judgeKey: string | null;
  criteria: string[];
  sensitivity: ConsensusCondition["sensitivity"];
  detection: ConsensusCondition["detection_mode"];
  voltage: number;
  scenario: ScenarioType;
  flags: EnvFlags;
  speaker: SpeakerChoice;
  temperature: "stable" | "volatile";
  actions: CustomActionDef[];
};

/** Config fields the Room has no control for, carried through so a loaded setup loses nothing. */
type Passthrough = {
  system_prompt_template: string;
  default_trust_deltas: Record<string, number>;
  default_leverage_deltas: Record<string, number>;
  auto_research?: boolean;
  inject_knowledge?: boolean;
  research_topics?: string[];
};

export type Room = {
  name: string;
  description: string;
  stakes: string;
  facts: Fact[];
  seats: Seat[];
  rules: Rules;
  meKey: string | null;
  extra: Passthrough;
};

// ── Vocabulary ─────────────────────────────────────────────────────────

export const DEFAULT_TURNS = 12;
export const TURN_CHOICES = [8, 12, 20, 30];
export const THRESHOLD_CHOICES = [0.5, 0.6, 0.67, 0.75, 1];

export const VOLTAGE_STOPS = [
  { value: 25, word: "Civil", hint: "Polite and cooperative" },
  { value: 55, word: "Tense", hint: "Guarded, pointed questions" },
  { value: 80, word: "Hostile", hint: "Heated and personal" },
] as const;

export function voltageWord(v: number): string {
  if (v < 40) return "Civil";
  if (v < 68) return "Tense";
  return "Hostile";
}

export const SCENARIOS: { value: ScenarioType; label: string; hint: string }[] = [
  { value: "debate", label: "Debate", hint: "An open argument about a decision" },
  { value: "investor", label: "Investor pitch", hint: "Raising money from skeptical backers" },
  { value: "partnership", label: "Partnership deal", hint: "Two sides negotiating terms" },
  { value: "legal", label: "Legal dispute", hint: "Liability, settlement, compliance" },
  { value: "crisis", label: "Crisis meeting", hint: "Something broke and people are scared" },
  { value: "podcast", label: "Interview", hint: "A host probing a guest" },
];

export const scenarioLabel = (s: ScenarioType) => SCENARIOS.find((x) => x.value === s)?.label ?? "Debate";

export const TWISTS: { key: keyof EnvFlags; label: string; icon: string; why: string }[] = [
  { key: "hidden_motives", label: "Someone's hiding something", icon: "visibility_off", why: "People quietly push their secret agendas." },
  { key: "time_pressure", label: "Clock is ticking", icon: "hourglass_top", why: "As turns run out, everyone pushes to close." },
  { key: "external_leaks", label: "Leaks happen", icon: "campaign", why: "News from outside lands in the middle of the meeting." },
  { key: "deadlock_risk", label: "Walk-outs possible", icon: "door_open", why: "When it stalls, someone may walk out." },
];

export const SPEAKER_CHOICES: { value: SpeakerChoice; label: string; hint: string }[] = [
  { value: "auto", label: "Let the room decide", hint: "The chair hands out the floor if there is one; otherwise whoever cares most speaks" },
  { value: "weighed_random", label: "Whoever cares most", hint: "People bid for the floor by how much is at stake for them" },
  { value: "freeform", label: "Most urgent first", hint: "Whoever has the most pressing point speaks next" },
  { value: "moderator_led", label: "The chair picks", hint: "The chair calls on people; needs someone chairing" },
  { value: "alternating", label: "Take turns", hint: "Everyone speaks in seating order" },
];

export const ENDING_WORDS: Record<EndPart, string> = {
  vote: "they vote",
  consensus: "they agree or stall",
  judge: "someone rules",
};

const SCENARIO_VALUES = SCENARIOS.map((s) => s.value);
const SPEAKER_MODES: SpeakerRules["mode"][] = ["moderator_led", "alternating", "freeform", "weighed_random"];

export const DEFAULT_FLAGS: EnvFlags = { hidden_motives: true, time_pressure: false, external_leaks: false, deadlock_risk: false };

// ── Construction ───────────────────────────────────────────────────────

export function defaultRules(): Rules {
  return {
    ending: "vote",
    parts: ["vote", "consensus"],
    turns: DEFAULT_TURNS,
    threshold: 0.6,
    judgeKey: null,
    criteria: [],
    sensitivity: "balanced",
    detection: "both",
    voltage: 55,
    scenario: "debate",
    flags: { ...DEFAULT_FLAGS },
    speaker: "auto",
    temperature: "volatile",
    actions: [],
  };
}

export function blankRoom(): Room {
  return {
    name: "",
    description: "",
    stakes: "",
    facts: [],
    seats: [],
    rules: defaultRules(),
    meKey: null,
    extra: { system_prompt_template: "", default_trust_deltas: {}, default_leverage_deltas: {} },
  };
}

export const factId = () => `f-${Math.random().toString(36).slice(2, 9)}`;

/** A seat for a library person; they keep their id so memory and evolution accrue to them. */
export function seatFromStakeholder(s: Stakeholder, stance?: AgentStance): Seat {
  const persona = fromStakeholder(s);
  return {
    key: persona.id || newSeatId(),
    persona: { ...persona, id: persona.id || newSeatId(), stance: stance ?? persona.stance },
    saved: persona,
    simCount: s.sim_count,
  };
}

export function seatFromDraft(p: PersonaDraft, guessed?: string[]): Seat {
  const id = p.id || newSeatId();
  return { key: id, persona: { ...p, id }, guessed };
}

// ── Facts ──────────────────────────────────────────────────────────────

const IMPORTANCE = /^\s*\[(HIGH|MEDIUM|LOW)\]\s*/i;
// "valuation: $75M" reads as a labelled figure; a sentence with a colon in it does not.
const LABELLED = /^([^:.!?]{1,40}):\s+(\S.*)$/;

export function factsFromSubject(attributes: Record<string, unknown> | undefined, evidence: unknown): Fact[] {
  const out: Fact[] = [];
  for (const [k, v] of Object.entries(attributes ?? {})) {
    if (v === null || v === undefined || typeof v === "object") continue;
    out.push({ id: factId(), text: `${k}: ${String(v)}`, star: false });
  }
  for (const e of Array.isArray(evidence) ? evidence : []) {
    if (typeof e !== "string" || !e.trim()) continue;
    const m = e.match(IMPORTANCE);
    out.push({ id: factId(), text: e.replace(IMPORTANCE, "").trim(), star: !!m && m[1].toUpperCase() === "HIGH" });
  }
  return out;
}

/**
 * Starred facts become "[HIGH] …" evidence (the format agents already read as important);
 * other "label: value" lines become attributes ("Key facts" in the prompt); the rest is evidence.
 */
export function subjectFromFacts(facts: Fact[]): { attributes: Record<string, string | number>; evidence_items: string[] } {
  const attributes: Record<string, string | number> = {};
  const starred: string[] = [];
  const plain: string[] = [];
  for (const f of facts) {
    const text = f.text.trim();
    if (!text) continue;
    if (f.star) { starred.push(`[HIGH] ${text}`); continue; }
    const m = text.match(LABELLED);
    if (m && m[1].trim().split(/\s+/).length <= 5 && !(m[1].trim() in attributes)) {
      const raw = m[2].trim();
      attributes[m[1].trim()] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
    } else {
      plain.push(text);
    }
  }
  return { attributes, evidence_items: [...starred, ...plain] };
}

/** Split pasted text into facts: one per line, leading bullets dropped, "*" or "★" marks it important. */
export function parseFactLines(text: string): Fact[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const star = /^(\*|★)\s*/.test(line);
      const clean = line.replace(/^(\*|★)\s*/, "").replace(/^([-•·–]|\d+[.)])\s+/, "").trim();
      return { id: factId(), text: clean, star };
    })
    .filter((f) => f.text);
}

// ── Loading a config ───────────────────────────────────────────────────

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : {});
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const turnsOf = (v: unknown, d: number) => Math.max(2, Math.min(60, Math.round(num(v, d))));
const fraction = (v: unknown) => {
  const n = num(v, 0.6);
  const f = n > 1 ? n / 100 : n;
  return f > 0 && f <= 1 ? Math.round(f * 100) / 100 : 0.6;
};

export function inferSpeaker(seats: Seat[]): SpeakerRules["mode"] {
  return seats.some((s) => s.persona.stance === "moderator") ? "moderator_led" : "weighed_random";
}

/** Any SimulationConfig-ish object (a template, an earlier run, a draft) as an editable Room. */
export function roomFromConfig(raw: unknown): Room {
  const cfg = obj(raw);
  const subject = obj(cfg.subject);
  const room = blankRoom();
  room.name = str(subject.name);
  room.description = str(subject.description);
  room.stakes = str(subject.stakes_description);
  room.facts = factsFromSubject(obj(subject.attributes), subject.evidence_items);

  const taken = new Set<string>();
  room.seats = (Array.isArray(cfg.stakeholders) ? cfg.stakeholders : []).flatMap((s): Seat[] => {
    const a = obj(s);
    if (!str(a.name).trim()) return [];
    const persona = fromAgentConfig({
      id: str(a.id),
      name: str(a.name),
      role: str(a.role),
      backstory: str(a.backstory),
      stance: isStance(a.stance) ? a.stance : "neutral",
      personality: normalizePersonality(a.personality),
      hidden_agenda: str(a.hidden_agenda),
      tools: Array.isArray(a.tools) ? (a.tools as unknown[]).filter((t): t is string => typeof t === "string") : [],
      archetype: (a.archetype as PersonaDraft["archetype"]) ?? null,
    });
    let id = persona.id || newSeatId();
    if (taken.has(id)) id = newSeatId();
    taken.add(id);
    return [{ key: id, persona: { ...persona, id } }];
  });

  const r = room.rules;
  const keyOf = (id: unknown) => room.seats.find((s) => s.persona.id === id)?.key ?? null;
  const readJudge = (j: Loose) => {
    r.judgeKey = keyOf(j.judge_id);
    r.criteria = Array.isArray(j.criteria) ? (j.criteria as unknown[]).filter((c): c is string => typeof c === "string" && !!c.trim()) : [];
  };
  const readConsensus = (c: Loose) => {
    const s = c.sensitivity;
    const d = c.detection_mode;
    if (s === "diplomatic" || s === "balanced" || s === "sensitive") r.sensitivity = s;
    if (d === "both" || d === "agreement_only" || d === "deadlock_only") r.detection = d;
  };
  const ec = obj(cfg.end_condition);
  switch (ec.type) {
    case "timeout":
      r.ending = "timeout";
      r.turns = turnsOf(ec.max_normal_turns, 20);
      break;
    case "vote":
      r.ending = "vote";
      r.threshold = fraction(ec.threshold);
      r.turns = turnsOf(ec.max_turns, 10);
      break;
    case "judge":
      r.ending = "judge";
      r.turns = 30; // the runtime gives a bare judge 30 turns
      readJudge(ec);
      break;
    case "consensus":
      r.ending = "consensus";
      r.turns = turnsOf(ec.max_turns, 30);
      readConsensus(ec);
      break;
    case "hybrid": {
      r.turns = turnsOf(ec.max_turns, 30);
      const parts: EndPart[] = [];
      for (const sub of Array.isArray(ec.conditions) ? ec.conditions : []) {
        const c = obj(sub);
        if (c.type === "vote") { r.threshold = fraction(c.threshold); parts.push("vote"); }
        if (c.type === "consensus") { readConsensus(c); parts.push("consensus"); }
        if (c.type === "judge") { readJudge(c); parts.push("judge"); }
      }
      const unique = [...new Set(parts)];
      if (unique.length === 0) r.ending = "timeout";
      else if (unique.length === 1) r.ending = unique[0];
      else { r.ending = "hybrid"; r.parts = unique; }
      break;
    }
    default:
      break;
  }

  r.voltage = Math.max(0, Math.min(100, Math.round(num(cfg.voltage, 55))));
  r.scenario = SCENARIO_VALUES.includes(cfg.scenario_type as ScenarioType) ? (cfg.scenario_type as ScenarioType) : "debate";
  const flags = obj(cfg.env_flags);
  r.flags = {
    hidden_motives: typeof flags.hidden_motives === "boolean" ? flags.hidden_motives : DEFAULT_FLAGS.hidden_motives,
    time_pressure: flags.time_pressure === true,
    external_leaks: flags.external_leaks === true,
    deadlock_risk: flags.deadlock_risk === true,
  };
  const mode = obj(cfg.speaker_rules).mode as SpeakerRules["mode"];
  r.speaker = SPEAKER_MODES.includes(mode) && mode !== inferSpeaker(room.seats) ? mode : "auto";
  r.temperature = cfg.model_temperature === "stable" ? "stable" : "volatile";
  const space = obj(cfg.action_space);
  r.actions = (Array.isArray(space.actions) ? space.actions : []).flatMap((a): CustomActionDef[] => {
    const x = obj(a);
    return str(x.name).trim()
      ? [{ name: str(x.name), description: str(x.description), trust_delta: num(x.trust_delta, 0), leverage_delta: num(x.leverage_delta, 0) }]
      : [];
  });

  const numbers = (v: unknown) => Object.fromEntries(Object.entries(obj(v)).filter(([, n]) => typeof n === "number")) as Record<string, number>;
  room.extra = {
    system_prompt_template: str(cfg.system_prompt_template),
    default_trust_deltas: numbers(space.default_trust_deltas),
    default_leverage_deltas: numbers(space.default_leverage_deltas),
    ...(typeof cfg.auto_research === "boolean" ? { auto_research: cfg.auto_research } : {}),
    ...(typeof cfg.inject_knowledge === "boolean" ? { inject_knowledge: cfg.inject_knowledge } : {}),
    ...(Array.isArray(cfg.research_topics)
      ? { research_topics: (cfg.research_topics as unknown[]).filter((t): t is string => typeof t === "string") }
      : {}),
  };
  return room;
}

/**
 * A new room (draft, refine) keeps what the old one knew about the same people:
 * React keys, library snapshots, AI-guess marks, and who "That's me" is.
 */
export function carryOver(prev: Room, next: Room): Room {
  const byId = new Map(prev.seats.map((s) => [s.persona.id, s]));
  const keyMap = new Map<string, string>();
  const seats = next.seats.map((s) => {
    const old = s.persona.id ? byId.get(s.persona.id) : undefined;
    if (!old) return s;
    keyMap.set(s.key, old.key);
    return { ...s, key: old.key, saved: old.saved, guessed: s.guessed ?? old.guessed, simCount: old.simCount };
  });
  const remap = (k: string | null) => (k ? keyMap.get(k) ?? k : k);
  const meKey = prev.meKey && seats.some((s) => s.key === prev.meKey) ? prev.meKey : null;
  return { ...next, seats, meKey, rules: { ...next.rules, judgeKey: remap(next.rules.judgeKey) } };
}

// ── Building the config ────────────────────────────────────────────────

export const defaultCriterion = (name: string) =>
  `Has a clear decision on ${name.trim() || "the proposal"} been reached, and which side made the stronger case?`;

/** Who rules: the chosen seat, else whoever chairs, else the first seat. */
export function judgeSeat(room: Room): Seat | undefined {
  return room.seats.find((s) => s.key === room.rules.judgeKey)
    ?? room.seats.find((s) => s.persona.stance === "moderator")
    ?? room.seats[0];
}

export function endingParts(r: Rules): EndPart[] {
  if (r.ending === "timeout") return [];
  if (r.ending === "hybrid") {
    const order: EndPart[] = ["vote", "consensus", "judge"];
    const parts = order.filter((p) => r.parts.includes(p));
    return parts.length ? parts : ["vote"];
  }
  return [r.ending];
}

export function configFromRoom(room: Room): SimulationConfig {
  const r = room.rules;
  const stakeholders = room.seats.map((s) => toAgentConfig({ ...s.persona, id: s.persona.id || s.key }));
  // Moderators run the vote rather than cast one; the backend wants the threshold as a fraction.
  const principals = stakeholders.filter((a) => a.stance !== "moderator").map((a) => a.id);
  const voters = principals.length ? principals : stakeholders.map((a) => a.id);
  const judge = judgeSeat(room);
  const judgeId = judge ? stakeholders[room.seats.indexOf(judge)]?.id ?? "" : "";

  const vote = (): VoteCondition => ({ type: "vote", voters, threshold: r.threshold, max_turns: r.turns });
  const consensus = (): ConsensusCondition => ({ type: "consensus", sensitivity: r.sensitivity, detection_mode: r.detection, max_turns: r.turns });
  const ruling = (): JudgeCondition => ({
    type: "judge",
    judge_id: judgeId,
    criteria: r.criteria.map((c) => c.trim()).filter(Boolean).length ? r.criteria.map((c) => c.trim()).filter(Boolean) : [defaultCriterion(room.name)],
  });
  const make = { vote, consensus, judge: ruling };

  let end_condition: EndCondition;
  const parts = endingParts(r);
  if (parts.length === 0) end_condition = { type: "timeout", max_normal_turns: r.turns };
  else if (parts.length === 1 && parts[0] !== "judge") end_condition = make[parts[0]]();
  // A bare judge always gets 30 turns at runtime; inside a hybrid it gets the chosen limit.
  else end_condition = { type: "hybrid", conditions: parts.map((p) => make[p]()), max_turns: r.turns };

  const hasChair = room.seats.some((s) => s.persona.stance === "moderator");
  const mode = r.speaker === "auto" || (r.speaker === "moderator_led" && !hasChair) ? inferSpeaker(room.seats) : r.speaker;

  return {
    subject: {
      name: room.name.trim(),
      description: room.description.trim(),
      stakes_description: room.stakes.trim(),
      ...subjectFromFacts(room.facts),
    },
    stakeholders,
    action_space: {
      actions: r.actions.filter((a) => a.name.trim()),
      default_trust_deltas: room.extra.default_trust_deltas,
      default_leverage_deltas: room.extra.default_leverage_deltas,
    },
    speaker_rules: { mode },
    scenario_type: r.scenario,
    end_condition,
    system_prompt_template: room.extra.system_prompt_template,
    voltage: Math.max(0, Math.min(100, Math.round(r.voltage))),
    // Nothing in the runtime reads this yet; it records that the user meant to play a seat.
    player_mode: !!room.meKey && room.seats.some((s) => s.key === room.meKey),
    env_flags: { ...r.flags },
    model_temperature: r.temperature,
    ...(room.extra.auto_research !== undefined ? { auto_research: room.extra.auto_research } : {}),
    ...(room.extra.inject_knowledge !== undefined ? { inject_knowledge: room.extra.inject_knowledge } : {}),
    ...(room.extra.research_topics !== undefined ? { research_topics: room.extra.research_topics } : {}),
  };
}

// ── Reading the room ───────────────────────────────────────────────────

export function stanceCounts(seats: Seat[]): Record<AgentStance, number> {
  const out: Record<AgentStance, number> = { champion: 0, detractor: 0, neutral: 0, moderator: 0, wildcard: 0 };
  for (const s of seats) out[s.persona.stance] = (out[s.persona.stance] ?? 0) + 1;
  return out;
}

export function roomSummary(room: Room): string {
  const n = room.seats.length;
  if (!n) return "Nobody seated yet";
  const c = stanceCounts(room.seats);
  const bits = [`${n} at the table`];
  if (c.champion) bits.push(`${c.champion} for`);
  if (c.detractor) bits.push(`${c.detractor} against`);
  if (c.neutral) bits.push(`${c.neutral} undecided`);
  if (c.wildcard) bits.push(`${c.wildcard} wildcard`);
  if (c.moderator) bits.push(c.moderator === 1 ? "a chair" : `${c.moderator} chairs`);
  return bits.join(" · ");
}

/** Why Start can't run yet, in words that say what to do; null when it can. */
export function startBlocker(room: Room): string | null {
  if (!room.name.trim()) return "Say what the meeting is about";
  const unnamed = room.seats.filter((s) => !s.persona.name.trim()).length;
  const principals = room.seats.filter((s) => s.persona.name.trim() && s.persona.stance !== "moderator").length;
  if (principals < 2) {
    if (room.seats.length === 0) return "Seat two people";
    const need = 2 - principals;
    const chairs = room.seats.some((s) => s.persona.stance === "moderator");
    return need === 1
      ? chairs ? "Add one more person who isn't chairing" : "Add one more person"
      : chairs ? "Add two people who aren't chairing" : "Add two more people";
  }
  if (unnamed) return unnamed === 1 ? "One person needs a name" : `${unnamed} people need a name`;
  return null;
}

/** Stance a newly seated person starts with: whichever side the room is missing. */
export function suggestStance(seats: Seat[]): AgentStance {
  const c = stanceCounts(seats);
  if (!c.champion) return "champion";
  if (!c.detractor) return "detractor";
  return "neutral";
}

/** "Dana Okafor, CFO" / "Dana Okafor - CFO" / "Dana Okafor (CFO)"; null when it reads like a description instead. */
export function parseNameRole(text: string): { name: string; role: string } | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || t.length > 90) return null;
  const m = t.match(/^(.+?)\s*(?:,|\s[-–—]\s|\()\s*(.*?)\)?$/);
  const name = (m ? m[1] : t).trim();
  const role = (m ? m[2] : "").trim();
  // A name is a few words; "skeptical CFO who hates dilution" is a description.
  if (!name || name.split(" ").length > 4 || /\b(who|that|with|and|wants|hates|loves|is|was|from)\b/i.test(name)) return null;
  // Without a separator, only a capitalised phrase reads as a name ("Dana Okafor", not "skeptical cfo").
  if (!m && name[0] !== name[0].toUpperCase()) return null;
  return { name, role };
}

/** Does this look like a description to draft from, rather than "Name, role"? */
export const looksLikeDescription = (text: string) => !parseNameRole(text) && text.trim().split(/\s+/).length >= 3;

export function seatEdited(seat: Seat): boolean {
  if (!seat.saved) return false;
  const a = seat.persona;
  const b = seat.saved;
  return a.name !== b.name || a.role !== b.role || a.backstory !== b.backstory || a.hidden_agenda !== b.hidden_agenda
    || a.archetype !== b.archetype || TRAITS.some((t) => a.personality[t] !== b.personality[t]);
}

export function emptySeatPersona(seats: Seat[], overrides: Partial<PersonaDraft> = {}): PersonaDraft {
  return emptyPersona({ id: newSeatId(), stance: suggestStance(seats), ...overrides });
}

export const stanceLabel = (s: AgentStance) => STANCE_META[s]?.short ?? s;
