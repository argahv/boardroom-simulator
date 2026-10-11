"use client";

import { useId, useState, type ReactNode } from "react";
import type { CustomActionDef } from "@/lib/types";
import { SPEAKER_CHOICES, defaultCriterion, endingParts, inferSpeaker, voltageWord, type Room, type Rules } from "./model";
import { Chip, Icon } from "./ui";

export type AdvancedPanelProps = {
  room: Room;
  onRules: (patch: Partial<Rules>) => void;
  onExtra: (patch: Partial<Room["extra"]>) => void;
  saveNew: boolean;
  onSaveNew: (v: boolean) => void;
};

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-hairline py-4 first:border-t-0 first:pt-0 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-body-strong">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]" />
      {label}
    </label>
  );
}

const EMPTY_ACTION: CustomActionDef = { name: "", description: "", trust_delta: 0, leverage_delta: 0 };

/** Everything a power user could set before, in plain words, out of the way. */
export function AdvancedPanel({ room, onRules, onExtra, saveNew, onSaveNew }: AdvancedPanelProps) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<CustomActionDef>(EMPTY_ACTION);
  const r = room.rules;
  const parts = endingParts(r);
  const hasChair = room.seats.some((s) => s.persona.stance === "moderator");
  const speakerHint = SPEAKER_CHOICES.find((c) => c.value === r.speaker)?.hint;

  const addAction = () => {
    const name = action.name.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name || r.actions.some((a) => a.name === name)) return;
    onRules({ actions: [...r.actions, { ...action, name }] });
    setAction(EMPTY_ACTION);
  };

  return (
    <section className="rounded-2xl border border-hairline bg-surface-card/60">
      <div className="text-sm font-semibold">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`${ids}-body`}
          className="flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-2xl px-4 text-left text-muted transition hover:text-ink"
        >
          <Icon name="chevron_right" className={`text-[18px] transition-transform ${open ? "rotate-90" : ""}`} />
          Advanced
          <span className="ml-auto truncate text-xs font-normal">Speaking order, exact heat, predictability, custom moves</span>
        </button>
      </div>
      {open && (
        <div id={`${ids}-body`} className="px-4 pb-4">
          <Row label="Who speaks next" hint={speakerHint}>
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
              {SPEAKER_CHOICES.map((c) => (
                <Chip key={c.value} active={r.speaker === c.value} onClick={() => onRules({ speaker: c.value })} title={c.hint}>
                  {c.label}
                </Chip>
              ))}
            </div>
            {r.speaker === "auto" && (
              <p className="mt-2 text-xs text-muted">
                Right now: {inferSpeaker(room.seats) === "moderator_led" ? "the chair picks" : "whoever cares most"}.
              </p>
            )}
            {r.speaker === "moderator_led" && !hasChair && (
              <p className="mt-2 text-xs text-error">Nobody is chairing, so the room will decide. Seat a chair (click a ring until it says Moderator).</p>
            )}
          </Row>

          <Row label="Exact heat" hint="Civil is below 40, Hostile is 68 and up.">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={r.voltage}
                onChange={(e) => onRules({ voltage: Number(e.target.value) })}
                aria-label="Heat"
                aria-valuetext={`${r.voltage}, ${voltageWord(r.voltage)}`}
                className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--color-primary)]"
              />
              <span className="w-24 shrink-0 text-right font-mono text-xs text-ink">{r.voltage} · {voltageWord(r.voltage)}</span>
            </div>
          </Row>

          <Row label="How predictable" hint="Surprising lets people go off-script more often.">
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
              <Chip active={r.temperature === "stable"} onClick={() => onRules({ temperature: "stable" })}>Predictable</Chip>
              <Chip active={r.temperature === "volatile"} onClick={() => onRules({ temperature: "volatile" })}>Surprising</Chip>
            </div>
          </Row>

          {parts.includes("judge") && (
            <Row label="What the ruling is on" hint="One question per line. The ruling checks these every few turns.">
              <div className="text-sm">
                <textarea
                  value={r.criteria.join("\n")}
                  onChange={(e) => onRules({ criteria: e.target.value.split("\n") })}
                  rows={2}
                  placeholder={defaultCriterion(room.name)}
                  aria-label="What the ruling is on"
                  className="block w-full resize-y rounded-lg border border-hairline bg-surface-card px-3 py-2 text-ink outline-none [field-sizing:content] placeholder:text-muted/60 focus:border-primary"
                />
              </div>
            </Row>
          )}

          {parts.includes("consensus") && (
            <Row label="When it counts as settled">
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                <Chip active={r.sensitivity === "diplomatic"} onClick={() => onRules({ sensitivity: "diplomatic" })}>Slow to call it</Chip>
                <Chip active={r.sensitivity === "balanced"} onClick={() => onRules({ sensitivity: "balanced" })}>Balanced</Chip>
                <Chip active={r.sensitivity === "sensitive"} onClick={() => onRules({ sensitivity: "sensitive" })}>Quick to call it</Chip>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                <Chip active={r.detection === "both"} onClick={() => onRules({ detection: "both" })}>Agreement or deadlock</Chip>
                <Chip active={r.detection === "agreement_only"} onClick={() => onRules({ detection: "agreement_only" })}>Only agreement</Chip>
                <Chip active={r.detection === "deadlock_only"} onClick={() => onRules({ detection: "deadlock_only" })}>Only deadlock</Chip>
              </div>
            </Row>
          )}

          <Row label="Custom moves" hint="Extra things people can do, e.g. “call for an audit”. Trust and leverage say how much the move shifts the room (-100 to 100).">
            {r.actions.length > 0 && (
              <ul className="mb-3 space-y-1.5 text-sm">
                {r.actions.map((a) => (
                  <li key={a.name} className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-card px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-ink">{a.name.replace(/_/g, " ")}</span>
                      {a.description && <span className="text-muted"> · {a.description}</span>}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">trust {a.trust_delta > 0 ? "+" : ""}{a.trust_delta} · leverage {a.leverage_delta > 0 ? "+" : ""}{a.leverage_delta}</span>
                    <button
                      type="button"
                      onClick={() => onRules({ actions: r.actions.filter((x) => x.name !== a.name) })}
                      aria-label={`Remove ${a.name}`}
                      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
                    >
                      <Icon name="close" className="text-[16px]" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2 text-sm sm:grid-cols-[1fr_1.4fr]">
              <input
                value={action.name}
                onChange={(e) => setAction({ ...action, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAction(); } }}
                placeholder="Move, e.g. call for an audit"
                aria-label="Move name"
                className="h-10 min-w-0 rounded-lg border border-hairline bg-surface-card px-3 text-ink outline-none placeholder:text-muted/60 focus:border-primary"
              />
              <input
                value={action.description}
                onChange={(e) => setAction({ ...action, description: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAction(); } }}
                placeholder="What it means (optional)"
                aria-label="Move description"
                className="h-10 min-w-0 rounded-lg border border-hairline bg-surface-card px-3 text-ink outline-none placeholder:text-muted/60 focus:border-primary"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
              <label className="inline-flex items-center gap-1.5">
                Trust
                <input
                  type="number"
                  min={-100}
                  max={100}
                  value={action.trust_delta}
                  onChange={(e) => setAction({ ...action, trust_delta: Math.max(-100, Math.min(100, Math.round(Number(e.target.value) || 0))) })}
                  className="h-9 w-20 rounded-lg border border-hairline bg-surface-card px-2 text-sm text-ink outline-none focus:border-primary"
                />
              </label>
              <label className="inline-flex items-center gap-1.5">
                Leverage
                <input
                  type="number"
                  min={-100}
                  max={100}
                  value={action.leverage_delta}
                  onChange={(e) => setAction({ ...action, leverage_delta: Math.max(-100, Math.min(100, Math.round(Number(e.target.value) || 0))) })}
                  className="h-9 w-20 rounded-lg border border-hairline bg-surface-card px-2 text-sm text-ink outline-none focus:border-primary"
                />
              </label>
              <span className="text-sm font-semibold">
                <button
                  type="button"
                  onClick={addAction}
                  disabled={!action.name.trim()}
                  className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full border border-hairline bg-surface-card px-3 text-ink transition hover:border-primary"
                >
                  <Icon name="add" className="text-[16px]" /> Add move
                </button>
              </span>
            </div>
          </Row>

          <Row label="Knowledge">
            <div className="flex flex-col gap-2">
              <Toggle
                checked={room.extra.inject_knowledge ?? true}
                onChange={(v) => onExtra({ inject_knowledge: v })}
                label="People can draw on their own documents"
              />
              <Toggle
                checked={room.extra.auto_research ?? true}
                onChange={(v) => onExtra({ auto_research: v })}
                label="Look the topic up on the web first (when research is set up)"
              />
            </div>
          </Row>

          <Row label="Your people" hint="New seats become personas you can reuse; their memory and growth carry over.">
            <Toggle checked={saveNew} onChange={onSaveNew} label="Save new people to my library when the meeting starts" />
          </Row>
        </div>
      )}
    </section>
  );
}
