// "Try again with…": each twist turns a finished run's SimulationConfig into the config for a new run.
// Everything except draftSkeptic/buildTwist is pure (no I/O, no randomness), so it can be unit-tested
// against the backend's SimulationConfig model directly.

import { voltageWord } from "@/components/room/model";
import { draftPersona } from "@/lib/api";
import { ARCHETYPE_META, isStance, normalizePersonality, toArchetype } from "@/lib/persona";
import type {
  AgentConfig,
  AgentStance,
  DraftPersonaResponse,
  EndCondition,
  SimulationConfig,
  VoteCondition,
} from "@/lib/types";

export type TwistId = "same" | "hotter" | "skeptic" | "deadline" | "secrets" | "vote" | "flip" | "edit";
/** Twists that start a new run straight away; "edit" opens the Room instead. */
export type RunTwistId = Exclude<TwistId, "edit">;

export type TwistMeta = { id: TwistId; label: string; icon: string };

export const TWISTS: TwistMeta[] = [
  { id: "same", label: "Same setup", icon: "replay" },
  { id: "hotter", label: "A hotter room", icon: "local_fire_department" },
  { id: "skeptic", label: "Add a skeptic", icon: "person_add" },
  { id: "deadline", label: "They're on a deadline", icon: "hourglass_top" },
  { id: "secrets", label: "Secret agendas on", icon: "visibility_off" },
  { id: "vote", label: "Settle it by vote", icon: "how_to_vote" },
  { id: "flip", label: "Flip the sides", icon: "swap_horiz" },
  { id: "edit", label: "Edit before running", icon: "edit" },
];

export const HEAT_STEP = 25;
export const VOTE_THRESHOLD = 0.6;

// Mirrors the detractor roles and stance stubs in backend/app/drafts.py, so a skeptic invented
// here reads like one the server would invent.
const SKEPTIC_ROLE: Record<string, string> = {
  investor: "Skeptical Angel Investor",
  crisis: "General Counsel",
  legal: "Opposing Counsel",
  partnership: "Procurement Director",
  podcast: "Contrarian Guest",
  debate: "CFO",
};

const STANCE_AGENDA: Record<AgentStance, string> = {
  champion: "Has promised this win upward and can't come back empty-handed.",
  detractor: "Protecting their own budget and influence; a yes here weakens them.",
  neutral: "Wants to end up on the winning side without owning the risk.",
  moderator: "Needs a clean outcome that won't come back to bite them.",
  wildcard: "Quietly pursuing a side deal that depends on how this goes.",
};

// ── Small helpers ──────────────────────────────────────────────────────

/** A deep copy; configs are plain JSON, and a twist must never mutate the run it came from. */
export function cloneConfig(config: SimulationConfig): SimulationConfig {
  return JSON.parse(JSON.stringify(config)) as SimulationConfig;
}

/** How many turns the run gets, the way backend/app/runtime/context.py max_turns_for reads it. */
export function turnBudget(end: EndCondition | undefined): number {
  switch (end?.type) {
    case "timeout": return end.max_normal_turns;
    case "vote":
    case "consensus":
    case "hybrid": return end.max_turns;
    case "judge": return 30;
    default: return 20;
  }
}

/** Moderators run the vote rather than cast one; with nobody else, everyone votes. */
export function votersFor(stakeholders: AgentConfig[]): string[] {
  const principals = stakeholders.filter((s) => s.stance !== "moderator").map((s) => s.id);
  return principals.length ? principals : stakeholders.map((s) => s.id);
}

/** The vote the run ends on, plain or inside a hybrid. */
export function voteOf(end: EndCondition | undefined): VoteCondition | null {
  if (end?.type === "vote") return end;
  if (end?.type === "hybrid") return end.conditions.find((c): c is VoteCondition => c.type === "vote") ?? null;
  return null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** A "seat-…" id (the Room's prefix for people not in the library) that no one in the room has. */
export function uniqueSeatId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = `seat-${slug(name) || "guest"}`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

/** The name if no one in the room shares it (or its first name); otherwise null. */
function freeName(name: string, people: AgentConfig[]): string | null {
  const n = name.trim();
  if (!n) return null;
  const clash = people.some((p) => p.name.trim().toLowerCase() === n.toLowerCase() || firstName(p.name) === firstName(n));
  return clash ? null : n;
}

function plainSkepticName(people: AgentConfig[]): string {
  const base = "The Skeptic";
  if (freeName(base, people)) return base;
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`;
    if (!people.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) return name;
  }
}

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.length} people`;
}

// ── The twists (pure) ──────────────────────────────────────────────────

export const sameSetup = (config: SimulationConfig): SimulationConfig => cloneConfig(config);

export function hotterRoom(config: SimulationConfig, step = HEAT_STEP): SimulationConfig {
  const c = cloneConfig(config);
  c.voltage = Math.min(100, Math.max(0, Math.round((c.voltage ?? 50) + step)));
  return c;
}

/** The plain skeptic used when no AI draft is available. */
export function plainSkeptic(config: SimulationConfig): AgentConfig {
  const people = config.stakeholders ?? [];
  const name = plainSkepticName(people);
  return {
    id: uniqueSeatId(name, people.map((p) => p.id)),
    name,
    role: SKEPTIC_ROLE[config.scenario_type ?? "debate"] ?? SKEPTIC_ROLE.debate,
    backstory: "Has seen moves like this go wrong and wants hard evidence before saying yes.",
    stance: "detractor",
    personality: { ...ARCHETYPE_META.guardian.preset },
    hidden_agenda: STANCE_AGENDA.detractor,
    tools: [],
    archetype: "guardian",
  };
}

/** A new voter goes on an explicit voter list; an empty list already means every non-moderator. */
function withVoter(end: EndCondition, id: string): EndCondition {
  const add = (v: VoteCondition): VoteCondition => (v.voters.length && !v.voters.includes(id) ? { ...v, voters: [...v.voters, id] } : v);
  if (end.type === "vote") return add(end);
  if (end.type === "hybrid") return { ...end, conditions: end.conditions.map((c) => (c.type === "vote" ? add(c) : c)) };
  return end;
}

/**
 * Seats one more detractor. `person` is an optional draft (e.g. from /drafts/persona); whatever it
 * leaves out comes from the plain skeptic, and a name already at the table falls back to "The Skeptic".
 */
export function addSkeptic(config: SimulationConfig, person: Partial<AgentConfig> = {}): SimulationConfig {
  const c = cloneConfig(config);
  const people = c.stakeholders ?? [];
  const plain = plainSkeptic(c);
  const name = freeName(person.name ?? "", people) ?? plain.name;
  const skeptic: AgentConfig = {
    ...plain,
    role: person.role?.trim() || plain.role,
    backstory: person.backstory?.trim() || plain.backstory,
    hidden_agenda: person.hidden_agenda?.trim() || plain.hidden_agenda,
    archetype: toArchetype(person.archetype) ?? plain.archetype,
    personality: person.personality ? normalizePersonality(person.personality) : plain.personality,
    name,
    id: uniqueSeatId(name, people.map((p) => p.id)),
    stance: "detractor",
  };
  c.stakeholders = [...people, skeptic];
  if (c.end_condition) c.end_condition = withVoter(c.end_condition, skeptic.id);
  return c;
}

export function onDeadline(config: SimulationConfig): SimulationConfig {
  const c = cloneConfig(config);
  c.env_flags = { ...c.env_flags, time_pressure: true };
  return c;
}

/** Who would get a private motive: everyone seated without one. */
const withoutAgenda = (config: SimulationConfig) => (config.stakeholders ?? []).filter((s) => !s.hidden_agenda?.trim());

/** Turns hidden motives on and gives everyone without a secret a stance-typed one, so the flag has something to act on. */
export function secretAgendas(config: SimulationConfig): SimulationConfig {
  const c = cloneConfig(config);
  c.env_flags = { ...c.env_flags, hidden_motives: true };
  c.stakeholders = c.stakeholders.map((s) =>
    s.hidden_agenda?.trim() ? s : { ...s, hidden_agenda: STANCE_AGENDA[isStance(s.stance) ? s.stance : "neutral"] },
  );
  return c;
}

/** Ends on a vote of everyone but the chair, 60% to pass, within the same number of turns as before. */
export function settleByVote(config: SimulationConfig, threshold = VOTE_THRESHOLD): SimulationConfig {
  const c = cloneConfig(config);
  c.end_condition = { type: "vote", voters: votersFor(c.stakeholders ?? []), threshold, max_turns: turnBudget(c.end_condition) };
  return c;
}

const FLIPPED: Partial<Record<AgentStance, AgentStance>> = { champion: "detractor", detractor: "champion" };

export function flipSides(config: SimulationConfig): SimulationConfig {
  const c = cloneConfig(config);
  c.stakeholders = c.stakeholders.map((s) => (FLIPPED[s.stance] ? { ...s, stance: FLIPPED[s.stance] as AgentStance } : s));
  return c;
}

/** Applies a twist. "skeptic" takes the drafted person, if any; without one it seats the plain skeptic. */
export function applyTwist(id: RunTwistId, config: SimulationConfig, skeptic?: Partial<AgentConfig>): SimulationConfig {
  switch (id) {
    case "same": return sameSetup(config);
    case "hotter": return hotterRoom(config);
    case "skeptic": return addSkeptic(config, skeptic);
    case "deadline": return onDeadline(config);
    case "secrets": return secretAgendas(config);
    case "vote": return settleByVote(config);
    case "flip": return flipSides(config);
  }
}

// ── What a twist would do to this run ─────────────────────────────────

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * What the twist changes for this config, in plain words, or null when it would change nothing
 * (the menu leaves those out so every choice gives a different run).
 */
export function twistEffect(id: TwistId, config: SimulationConfig): string | null {
  const people = config.stakeholders ?? [];
  switch (id) {
    case "same":
      return `The same ${people.length} people and rules`;
    case "hotter": {
      const from = config.voltage ?? 50;
      const to = hotterRoom(config).voltage;
      if (to === from) return null;
      const [a, b] = [voltageWord(from), voltageWord(to)];
      return a === b ? `Heat ${from} → ${to}` : `${a} → ${b} (${from} → ${to})`;
    }
    case "skeptic":
      return "One more person pushing back";
    case "deadline":
      return config.env_flags?.time_pressure ? null : "They push to close as turns run out";
    case "secrets": {
      const missing = withoutAgenda(config).length;
      if (config.env_flags?.hidden_motives !== false && missing === 0) return null;
      if (missing === 0) return "Everyone acts on their private motive";
      if (missing === people.length) return "Everyone gets a private motive";
      return `${missing} more ${missing === 1 ? "person gets" : "people get"} a private motive`;
    }
    case "vote": {
      const vote = voteOf(config.end_condition);
      const voters = votersFor(people);
      const listed = vote?.voters.length ? vote.voters : voters;
      if (config.end_condition?.type === "vote" && vote && vote.threshold === VOTE_THRESHOLD && sameSet(listed, voters)) return null;
      return `${voters.length} ${voters.length === 1 ? "person votes" : "people vote"}, ${Math.round(VOTE_THRESHOLD * 100)}% to pass`;
    }
    case "flip": {
      const flipping = people.filter((s) => FLIPPED[s.stance]);
      if (!flipping.length) return null;
      return `${listNames(flipping.map((s) => s.name))} switch sides`;
    }
    case "edit":
      return "Change anything in the Room first";
  }
}

export type TwistOption = TwistMeta & { effect: string };

/** The twists worth offering for this run, in menu order, each with what it would change. */
export function availableTwists(config: SimulationConfig): TwistOption[] {
  return TWISTS.flatMap((t) => {
    const effect = twistEffect(t.id, config);
    return effect === null ? [] : [{ ...t, effect }];
  });
}

export const editHref = (simulationId: string) => `/simulate/new?from=${encodeURIComponent(simulationId)}`;

/** Where the new run opens; a seat the user was speaking as carries over when it is still at the table. */
export function runHref(simulationId: string, config: SimulationConfig, seat?: string | null): string {
  const keep = seat && (config.stakeholders ?? []).some((s) => s.id === seat);
  return `/simulate/${encodeURIComponent(simulationId)}${keep ? `?seat=${encodeURIComponent(seat)}` : ""}`;
}

// ── Drafting the skeptic (I/O) ─────────────────────────────────────────

/** What we ask /drafts/persona for; the subject gives the AI something specific to object to. */
export function skepticBrief(config: SimulationConfig): string {
  const role = SKEPTIC_ROLE[config.scenario_type ?? "debate"] ?? SKEPTIC_ROLE.debate;
  // "Skeptical Angel Investor" -> "skeptical angel investor"; acronyms like CFO stay as they are.
  const who = role.split(" ").map((w) => (w === w.toUpperCase() ? w : w.toLowerCase())).join(" ");
  const subject = config.subject?.name?.trim();
  const stakes = config.subject?.stakes_description?.trim();
  return [
    `A ${who} who opposes ${subject ? `"${subject}"` : "the proposal"} and pushes back hard on cost and risk.`,
    stakes ? `What's at stake: ${stakes}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * The parts of a persona draft a skeptic seat uses. The keyword fallback only echoes our own brief
 * back (as backstory, role and stock dials), so from it we take just the name.
 */
export function skepticFromDraft(res: DraftPersonaResponse): Partial<AgentConfig> {
  const p = res.persona;
  if (res.source !== "llm") return { name: p.name };
  return {
    name: p.name,
    role: p.role,
    backstory: p.backstory,
    hidden_agenda: p.hidden_agenda,
    archetype: p.archetype,
    personality: p.personality,
  };
}

export type TwistDeps = {
  draft?: (text: string) => Promise<DraftPersonaResponse>;
  /** Give up on the AI after this long and seat the plain skeptic. */
  timeoutMs?: number;
};

/** A drafted skeptic, or {} (the plain skeptic) when drafting fails or is slow. Never rejects. */
export async function draftSkeptic(config: SimulationConfig, { draft = draftPersona, timeoutMs = 15000 }: TwistDeps = {}): Promise<Partial<AgentConfig>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); });
    return skepticFromDraft(await Promise.race([draft(skepticBrief(config)), timeout]));
  } catch {
    return {};
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The config for the new run. Only "skeptic" does I/O, and it falls back rather than failing. */
export async function buildTwist(id: RunTwistId, config: SimulationConfig, deps: TwistDeps = {}): Promise<SimulationConfig> {
  return id === "skeptic" ? addSkeptic(config, await draftSkeptic(config, deps)) : applyTwist(id, config);
}
