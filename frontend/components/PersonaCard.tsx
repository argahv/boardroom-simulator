"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { AgentArchetype, AgentStance, PersonalityProfile } from "@/lib/types";
import {
  ARCHETYPES,
  ARCHETYPE_META,
  STANCE_META,
  TRAITS,
  TRAIT_LEVELS,
  TRAIT_META,
  behaviourLine,
  clampTrait,
  initials,
  nextStance,
  traitLevel,
  traitWord,
  withArchetype,
  type PersonaDraft,
  type Trait,
} from "@/lib/persona";

const SECTION_LABEL = "font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted";

// globals.css gives controls `font: inherit` outside any layer, which beats font utilities on the
// control itself; so font size/weight go on a wrapper and the control inherits them.

// ── StanceRing ─────────────────────────────────────────────────────────

export type StanceRingProps = {
  stance: AgentStance;
  name: string;
  size?: number;
  /** When given, the ring is a button: click steps forward through STANCE_CYCLE, shift+click steps back. */
  onCycle?: (next: AgentStance) => void;
  className?: string;
};

/** Initials in a ring coloured by stance. */
export function StanceRing({ stance, name, size = 44, onCycle, className = "" }: StanceRingProps) {
  const meta = STANCE_META[stance] ?? STANCE_META.neutral;
  const ring = Math.max(2, Math.round(size / 16));
  const badge = Math.max(18, Math.round(size * 0.4));
  const face = (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-ink select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        border: `${ring}px solid ${meta.color}`,
        background: `color-mix(in srgb, ${meta.color} 14%, var(--color-surface-card))`,
      }}
    >
      {initials(name)}
      {onCycle && (
        <span
          className="material-symbols-outlined absolute -bottom-1 -right-1 flex items-center justify-center rounded-full border border-hairline bg-surface-card text-muted transition group-hover/ring:text-ink"
          style={{ width: badge, height: badge, fontSize: Math.round(badge * 0.72), lineHeight: 1 }}
        >
          sync
        </span>
      )}
    </span>
  );
  const who = name.trim() || "This person";
  if (!onCycle) {
    return (
      <span role="img" aria-label={`${who}, ${meta.label}`} className={`inline-flex ${className}`}>
        {face}
      </span>
    );
  }
  const next = STANCE_META[nextStance(stance)];
  return (
    <button
      type="button"
      onClick={(e) => onCycle(nextStance(stance, e.shiftKey ? -1 : 1))}
      aria-label={`${who} is ${meta.label}. Change to ${next.label}`}
      title={`${meta.label}: ${meta.description}. Click for ${next.label}.`}
      className={`group/ring relative inline-flex shrink-0 cursor-pointer rounded-full transition active:scale-95 ${className}`}
    >
      {face}
    </button>
  );
}

// ── TraitDial ──────────────────────────────────────────────────────────

export type TraitDialProps = {
  trait: Trait;
  value: number;
  /** Pending change (delta), drawn as a dashed ghost on the track. */
  ghost?: number;
  /** When given, each of the four word segments is a button that jumps to that level. */
  onChange?: (value: number) => void;
  /** Show the exact number next to the label. */
  showNumber?: boolean;
  className?: string;
};

/** One trait as a word ("Combative") over a four-level track. */
export function TraitDial({ trait, value, ghost = 0, onChange, showNumber = false, className = "" }: TraitDialProps) {
  const meta = TRAIT_META[trait];
  const v = clampTrait(value);
  const word = traitWord(trait, v);
  const after = clampTrait(v + ghost);
  const hasGhost = ghost !== 0 && after !== v;
  const afterWord = traitWord(trait, after);
  const level = traitLevel(v);

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={SECTION_LABEL}>{meta.label}</span>
        {hasGhost ? (
          <span className="font-mono text-[10px] font-bold text-ink" title="Pending change">
            {after > v ? "+" : ""}{after - v}
            {afterWord !== word && <span className="font-normal text-muted"> → {afterWord}</span>}
          </span>
        ) : showNumber ? (
          <span className="font-mono text-[10px] text-muted">{v}</span>
        ) : null}
      </div>
      <div className="mt-0.5 flex items-center gap-3">
        <span className="w-[6.75rem] shrink-0 truncate font-display text-lg leading-tight text-ink">{word}</span>
        <div className="relative flex h-6 min-w-0 flex-1 items-center gap-0.5" role={onChange ? "group" : undefined} aria-label={onChange ? meta.label : undefined}>
          {TRAIT_LEVELS.map((lvl, i) => {
            const span = lvl.max - lvl.min + 1;
            const fill = Math.max(0, Math.min(1, (v - lvl.min) / (lvl.max - lvl.min)));
            const bar = (
              <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300" style={{ width: `${fill * 100}%`, background: meta.color }} />
              </span>
            );
            const style = { flexGrow: span, flexBasis: 0 };
            if (!onChange) return <span key={i} className="flex h-full items-center" style={style}>{bar}</span>;
            const w = meta.words[i];
            return (
              <button
                key={i}
                type="button"
                onClick={() => onChange(lvl.value)}
                aria-label={`${meta.label}: ${w}`}
                aria-pressed={level === i}
                title={w}
                className="flex h-full cursor-pointer items-center rounded-sm hover:[&>span]:bg-ink/20"
                style={style}
              >
                {bar}
              </button>
            );
          })}
          {hasGhost && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-3 -translate-y-1/2 rounded-full border border-dashed"
              style={{
                left: `${Math.min(v, after)}%`,
                width: `${Math.max(1.5, Math.abs(after - v))}%`,
                borderColor: meta.color,
                background: `color-mix(in srgb, ${meta.color} 22%, transparent)`,
              }}
            />
          )}
        </div>
      </div>
      {hasGhost && (
        <span className="sr-only">
          Pending change: {meta.label} {v} to {after}{afterWord !== word ? `, ${word} to ${afterWord}` : ""}.
        </span>
      )}
    </div>
  );
}

// ── ArchetypeChips ─────────────────────────────────────────────────────

export type ArchetypeChipsProps = {
  value: AgentArchetype | null;
  /** Called with the chip's archetype, or null when the active chip is clicked again. */
  onSelect: (archetype: AgentArchetype | null) => void;
  className?: string;
};

export function ArchetypeChips({ value, onSelect, className = "" }: ArchetypeChipsProps) {
  return (
    <div className={`flex flex-wrap gap-1.5 text-xs font-semibold ${className}`}>
      {ARCHETYPES.map((a) => {
        const active = value === a;
        const meta = ARCHETYPE_META[a];
        return (
          <button
            key={a}
            type="button"
            aria-pressed={active}
            title={meta.description}
            onClick={() => onSelect(active ? null : a)}
            className={`min-h-8 cursor-pointer rounded-full border px-3 py-1 transition active:scale-[0.97] ${
              active
                ? "border-ink bg-ink text-on-dark"
                : "border-hairline bg-canvas/60 text-muted hover:border-ink/30 hover:text-ink"
            }`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// ── PersonaCard ────────────────────────────────────────────────────────

export type PersonaCardMode = "edit" | "view" | "seat";

export type PersonaCardProps = {
  value: PersonaDraft;
  onChange?: (patch: Partial<PersonaDraft>) => void;
  /** Defaults to "edit" when onChange is given, else "view". */
  mode?: PersonaCardMode;
  /** Fields the AI inferred (e.g. "hidden_agenda", "personality", "role"); marked "AI guess" until edited. */
  guessed?: string[];
  /** Pending evolution deltas, drawn as ghost marks on the dials. */
  ghost?: Partial<PersonalityProfile>;
  /** Edit/view: a footer row. Seat: top-right, revealed on hover/focus (always shown on touch screens). */
  actions?: ReactNode;
  autoFocusName?: boolean;
  /** Seat mode: clicking the card body (not the ring or actions) calls this, e.g. to open the drawer. */
  onOpen?: () => void;
  /** Seat mode: a small line under the role, e.g. "From your library" or "You". */
  badge?: ReactNode;
  /** Seat mode: emphasised border, e.g. the seat open in the drawer or "That's me". */
  highlight?: boolean;
  /** A problem to show on the card, e.g. "Needs a name". */
  error?: string;
  className?: string;
};

function GuessMark({ label = "AI guess" }: { label?: string }) {
  return (
    <span
      title="Inferred by AI, not read from what you gave. Check it."
      className="inline-flex items-center rounded-full border border-dashed border-warning/70 px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-wider text-body-strong"
    >
      {label}
    </span>
  );
}

export function PersonaCard(props: PersonaCardProps) {
  const mode: PersonaCardMode = props.mode ?? (props.onChange ? "edit" : "view");
  if (mode === "seat") return <SeatCard {...props} />;
  return <FullCard {...props} editable={mode === "edit" && !!props.onChange} />;
}

function SeatCard({ value, onChange, actions, onOpen, badge, highlight, error, className = "" }: PersonaCardProps) {
  const meta = STANCE_META[value.stance] ?? STANCE_META.neutral;
  const name = value.name.trim();
  const hasSecret = value.hidden_agenda.trim().length > 0;
  return (
    <div
      className={`group relative min-w-0 rounded-xl border bg-surface-card p-3 transition ${
        error ? "border-error" : highlight ? "border-primary shadow-sm" : "border-hairline hover:border-primary/40"
      } ${className}`}
    >
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${name || "this seat"}`}
          className="absolute inset-0 cursor-pointer rounded-xl"
        />
      )}
      <div className="flex items-start gap-3">
        <StanceRing
          stance={value.stance}
          name={value.name}
          size={40}
          onCycle={onChange ? (stance) => onChange({ stance }) : undefined}
          className="relative z-10"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.color }} />
            {meta.label}
          </p>
          <p className="flex min-w-0 items-center gap-1 text-sm font-semibold leading-snug text-ink">
            <span className={`truncate ${name ? "" : "pr-0.5 font-normal italic text-muted"}`}>{name || "Unnamed"}</span>
            {hasSecret && (
              <>
                <span aria-hidden className="material-symbols-outlined shrink-0 text-[14px] text-warning" title="Has a secret agenda">lock</span>
                <span className="sr-only">Has a secret agenda</span>
              </>
            )}
          </p>
          <p className="truncate text-xs text-muted">{value.role.trim() || "No role yet"}</p>
        </div>
        {actions && (
          <div className="relative z-10 flex shrink-0 items-center gap-0.5 text-xs font-semibold opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
            {actions}
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-snug text-body-strong">{behaviourLine(value)}</p>
      {badge && <div className="mt-1.5 text-[11px] text-muted">{badge}</div>}
      {error && <p className="mt-1.5 text-[11px] font-semibold text-error">{error}</p>}
    </div>
  );
}

function FullCard({
  value,
  onChange,
  editable,
  guessed,
  ghost,
  actions,
  autoFocusName,
  error,
  className = "",
}: PersonaCardProps & { editable: boolean }) {
  const ids = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [fineTune, setFineTune] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);

  // An edited field stops being an "AI guess"; a new guessed list (a new draft) starts over.
  const guessKey = (guessed ?? []).join("|");
  const [confirmed, setConfirmed] = useState<{ key: string; fields: string[] }>({ key: "", fields: [] });
  const confirmedFields = confirmed.key === guessKey ? confirmed.fields : [];
  const isGuess = (field: string) => !!guessed?.includes(field) && !confirmedFields.includes(field);

  useEffect(() => {
    if (autoFocusName && editable) nameRef.current?.focus();
  }, [autoFocusName, editable]);

  const set = (patch: Partial<PersonaDraft>) => {
    if (!onChange) return;
    onChange(patch);
    const touched = Object.keys(patch);
    if (patch.personality) touched.push(...TRAITS);
    setConfirmed((c) => ({ key: guessKey, fields: [...(c.key === guessKey ? c.fields : []), ...touched] }));
  };
  const setTrait = (t: Trait, v: number) => set({ personality: { ...value.personality, [t]: clampTrait(v) } });

  const stanceMeta = STANCE_META[value.stance] ?? STANCE_META.neutral;
  const archetypeMeta = value.archetype ? ARCHETYPE_META[value.archetype] : null;
  const hasSecret = value.hidden_agenda.trim().length > 0;
  const hasGhost = !!ghost && TRAITS.some((t) => (ghost[t] ?? 0) !== 0);
  const dialsGuessed = isGuess("personality") || TRAITS.some((t) => isGuess(t));
  const guessUnderline = "border-dashed border-warning/70";

  return (
    // w-full: inline-size containment would otherwise collapse the card inside a flex row.
    <div className={`@container w-full min-w-0 rounded-2xl border bg-surface-card p-4 sm:p-5 ${error ? "border-error" : "border-hairline"} ${className}`}>
      {/* Who */}
      <div className="flex items-start gap-3 sm:gap-4">
        <StanceRing
          stance={value.stance}
          name={value.name}
          size={56}
          onCycle={editable ? (stance) => set({ stance }) : undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: stanceMeta.color }} />
            <span>{stanceMeta.label}</span>
            <span className="font-normal normal-case tracking-normal text-muted/80">· {stanceMeta.description.toLowerCase()}</span>
            {isGuess("stance") && <GuessMark />}
          </p>
          {editable ? (
            <>
              <div className="mt-0.5 font-display text-2xl font-semibold leading-tight">
                <input
                  ref={nameRef}
                  value={value.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Name"
                  aria-label="Name"
                  maxLength={80}
                  title={isGuess("name") ? "AI guess: check it" : undefined}
                  className={`w-full min-w-0 border-b bg-transparent tracking-display text-ink outline-none placeholder:text-muted/50 focus:border-primary ${isGuess("name") ? guessUnderline : "border-transparent"}`}
                />
              </div>
              <div className="mt-0.5 text-sm">
                <input
                  value={value.role}
                  onChange={(e) => set({ role: e.target.value })}
                  placeholder="Role, e.g. CFO"
                  aria-label="Role"
                  maxLength={120}
                  title={isGuess("role") ? "AI guess: check it" : undefined}
                  className={`w-full min-w-0 border-b bg-transparent text-muted outline-none placeholder:text-muted/50 focus:border-primary focus:text-ink ${isGuess("role") ? guessUnderline : "border-transparent"}`}
                />
              </div>
            </>
          ) : (
            <>
              <h3 className="mt-0.5 truncate font-display text-2xl font-semibold leading-tight tracking-display text-ink">
                {value.name.trim() || "Unnamed"}
              </h3>
              <p className="truncate text-sm text-muted">{value.role.trim() || "No role yet"}</p>
            </>
          )}
          <p className="mt-1.5 text-[13px] leading-snug text-body-strong">{behaviourLine(value)}</p>
          {editable && (isGuess("name") || isGuess("role")) && (
            <p className="mt-1"><GuessMark label={`AI guess: ${[isGuess("name") && "name", isGuess("role") && "role"].filter(Boolean).join(", ")}`} /></p>
          )}
        </div>
      </div>

      {/* Temperament */}
      <section className="mt-5" aria-labelledby={`${ids}-temperament`}>
        <div className="mb-2 flex items-center gap-2">
          <h4 id={`${ids}-temperament`} className={SECTION_LABEL}>Temperament</h4>
          {isGuess("archetype") && <GuessMark />}
        </div>
        {editable ? (
          <ArchetypeChips value={value.archetype} onSelect={(a) => set(withArchetype(a))} />
        ) : null}
        <p className={`text-xs text-muted ${editable ? "mt-2" : ""}`}>
          {archetypeMeta ? (
            <><span className="font-semibold text-ink">{archetypeMeta.label}</span>: {archetypeMeta.description.toLowerCase()}.</>
          ) : editable ? (
            "Pick one to set the dials below."
          ) : (
            "No temperament set."
          )}
        </p>
      </section>

      {/* Dials */}
      <section className="mt-5" aria-labelledby={`${ids}-dials`}>
        <div className="mb-2 flex items-center gap-2">
          <h4 id={`${ids}-dials`} className={SECTION_LABEL}>How they act</h4>
          {dialsGuessed && <GuessMark />}
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 @xl:grid-cols-2">
          {TRAITS.map((t) => (
            <TraitDial
              key={t}
              trait={t}
              value={value.personality[t]}
              ghost={ghost?.[t] ?? 0}
              onChange={editable ? (v) => setTrait(t, v) : undefined}
              showNumber={!editable}
            />
          ))}
        </div>
        {hasGhost && (
          <p className="mt-2 text-[11px] text-muted">Dashed marks show a pending change.</p>
        )}
        {editable && (
          <>
            <div className="mt-3 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFineTune((o) => !o)}
                aria-expanded={fineTune}
                aria-controls={`${ids}-finetune`}
                className="-ml-2 inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full px-2 text-muted transition hover:text-ink"
              >
                <span aria-hidden className={`material-symbols-outlined text-[16px] transition-transform ${fineTune ? "rotate-90" : ""}`}>chevron_right</span>
                Fine-tune
              </button>
            </div>
            {fineTune && (
              <div id={`${ids}-finetune`} className="mt-1 grid gap-2 rounded-xl border border-hairline bg-canvas/40 p-3">
                {TRAITS.map((t) => {
                  const v = value.personality[t];
                  const d = ghost?.[t] ?? 0;
                  return (
                    <div key={t} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-xs text-muted">
                      <label htmlFor={`${ids}-ft-${t}`} className="truncate">{TRAIT_META[t].label}</label>
                      <input
                        id={`${ids}-ft-${t}`}
                        type="range"
                        min={0}
                        max={100}
                        value={v}
                        onChange={(e) => setTrait(t, Number(e.target.value))}
                        aria-valuetext={`${v}, ${traitWord(t, v)}`}
                        className="h-1 w-full min-w-0 cursor-pointer"
                        style={{ accentColor: TRAIT_META[t].color }}
                      />
                      <span aria-hidden className="w-14 text-right font-mono text-[11px] text-ink">
                        {v}
                        {d !== 0 && <span className="text-muted"> {d > 0 ? "+" : ""}{d}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* Backstory */}
      <section className="mt-5" aria-labelledby={`${ids}-story`}>
        <div className="mb-1.5 flex items-center gap-2">
          <h4 id={`${ids}-story`} className={SECTION_LABEL}>Backstory</h4>
          {isGuess("backstory") && <GuessMark />}
        </div>
        {editable ? (
          <div className="text-sm leading-relaxed">
            <textarea
              value={value.backstory}
              onChange={(e) => set({ backstory: e.target.value })}
              aria-labelledby={`${ids}-story`}
              rows={3}
              placeholder="Who they are, what they want, what burned them before."
              className="block min-h-20 w-full resize-y rounded-xl border border-hairline bg-canvas/50 px-3 py-2 text-ink outline-none [field-sizing:content] placeholder:text-muted/50 focus:border-primary"
            />
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-body-strong whitespace-pre-line">
            {value.backstory.trim() || <span className="italic text-muted">No backstory yet.</span>}
          </p>
        )}
      </section>

      {/* Secret */}
      {(editable || hasSecret) && (
        <section className="mt-5 rounded-xl border border-dashed border-warning/40 bg-accent-amber/[0.06] p-3" aria-labelledby={`${ids}-secret`}>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span aria-hidden className="material-symbols-outlined text-[16px] text-warning">{secretOpen ? "lock_open" : "lock"}</span>
            <h4 id={`${ids}-secret`} className={SECTION_LABEL}>Secret</h4>
            {isGuess("hidden_agenda") && <GuessMark />}
            <button
              type="button"
              onClick={() => setSecretOpen((o) => !o)}
              aria-expanded={secretOpen}
              aria-controls={`${ids}-secret-body`}
              className="ml-auto inline-flex min-h-8 cursor-pointer items-center rounded-full px-2.5 text-muted transition hover:bg-ink/5 hover:text-ink"
            >
              {secretOpen ? "Hide" : hasSecret ? "Reveal" : "Add one"}
            </button>
          </div>
          <div id={`${ids}-secret-body`} className="mt-1.5 text-sm leading-relaxed">
            {secretOpen ? (
              editable ? (
                <textarea
                  value={value.hidden_agenda}
                  onChange={(e) => set({ hidden_agenda: e.target.value })}
                  aria-labelledby={`${ids}-secret`}
                  rows={2}
                  // Opening an empty secret means the user wants to type one.
                  autoFocus={!hasSecret}
                  placeholder="What they want but won't say in the room."
                  className="block min-h-14 w-full resize-y rounded-lg border border-warning/30 bg-surface-card px-3 py-2 text-ink outline-none [field-sizing:content] placeholder:text-muted/50 focus:border-warning"
                />
              ) : (
                <p className="text-sm leading-relaxed text-body-strong">{value.hidden_agenda}</p>
              )
            ) : hasSecret ? (
              <>
                <p aria-hidden className="line-clamp-2 select-none text-sm leading-relaxed text-body-strong blur-[4px]">
                  {value.hidden_agenda}
                </p>
                <span className="sr-only">Hidden. Use Reveal to read it.</span>
              </>
            ) : (
              <p className="text-xs text-muted">What they want but won&apos;t say. Optional.</p>
            )}
          </div>
        </section>
      )}

      {error && <p className="mt-4 text-xs font-semibold text-error">{error}</p>}
      {actions && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-hairline pt-4 text-sm font-semibold">{actions}</div>}
    </div>
  );
}
