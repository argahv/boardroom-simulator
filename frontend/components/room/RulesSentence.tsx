"use client";

import { useId, useState, type ReactNode } from "react";
import {
  ENDING_WORDS,
  SCENARIOS,
  THRESHOLD_CHOICES,
  TURN_CHOICES,
  TWISTS,
  VOLTAGE_STOPS,
  endingParts,
  judgeSeat,
  scenarioLabel,
  voltageWord,
  type EndPart,
  type Ending,
  type Room,
  type Rules,
} from "./model";
import { Chip, Icon, LABEL } from "./ui";

type TokenId = "ending" | "turns" | "heat" | "kind";

export type RulesSentenceProps = {
  room: Room;
  onChange: (patch: Partial<Rules>) => void;
};

const pct = (f: number) => (f >= 1 ? "everyone" : `${Math.round(f * 100)}%`);

function endingPhrase(room: Room): string {
  const r = room.rules;
  const judge = judgeSeat(room)?.persona.name.split(" ")[0] || "the chair";
  const parts = endingParts(r);
  if (parts.length === 0) return "time runs out";
  if (parts.length === 1) {
    const p = parts[0];
    return p === "vote" ? `they vote (${pct(r.threshold)} to pass)` : p === "consensus" ? "they agree or stall" : `${judge} rules`;
  }
  // Racing endings read as one short list: "they vote (60%), settle or Marcus rules".
  const words = parts.map((p, i) =>
    p === "vote" ? `${i ? "" : "they "}vote (${pct(r.threshold)})` : p === "consensus" ? `${i ? "" : "they "}settle` : `${judge} rules`);
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

const ENDING_CHOICES: { value: Ending; label: string; hint: string }[] = [
  { value: "vote", label: "They vote", hint: "Everyone except the chair votes at the end" },
  { value: "consensus", label: "They agree or stall", hint: "Ends when the room settles or locks up" },
  { value: "judge", label: "Someone rules", hint: "One person decides who made the stronger case" },
  { value: "timeout", label: "Time runs out", hint: "No formal decision; see where it lands" },
  { value: "hybrid", label: "Whichever comes first", hint: "Combine a vote, agreement and a ruling" },
];

function Token({ text, label, open, controls, onToggle }: { text: string; label: string; open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${label}: ${text}. Change`}
      className={`cursor-pointer rounded-md px-1 underline decoration-dotted decoration-2 underline-offset-[5px] transition ${
        open ? "bg-ink text-on-dark decoration-transparent" : "text-ink decoration-primary/70 hover:bg-primary-soft"
      }`}
    >
      {/* Weight on a span: globals.css gives buttons `font: inherit`, which beats utilities on the button. */}
      <span className="font-semibold">{text}</span>
    </button>
  );
}

export function RulesSentence({ room, onChange }: RulesSentenceProps) {
  const ids = useId();
  const [open, setOpen] = useState<TokenId | null>(null);
  const r = room.rules;
  const parts = endingParts(r);
  const judge = judgeSeat(room);

  const tok = (id: TokenId) => ({
    open: open === id,
    controls: `${ids}-panel`,
    onToggle: () => setOpen((o) => (o === id ? null : id)),
  });

  const setEnding = (ending: Ending) => {
    const patch: Partial<Rules> = { ending };
    if (ending === "hybrid" && r.parts.length < 2) patch.parts = ["vote", "consensus"];
    // A bare judge or consensus usually needs more room than a quick vote.
    if ((ending === "judge" || ending === "consensus" || ending === "hybrid") && r.turns < 12) patch.turns = 20;
    onChange(patch);
  };

  const togglePart = (p: EndPart) => {
    const next = r.parts.includes(p) ? r.parts.filter((x) => x !== p) : [...r.parts, p];
    if (next.length) onChange({ parts: next });
  };

  let panel: ReactNode = null;
  if (open === "ending") {
    panel = (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5 text-sm font-semibold" role="radiogroup" aria-label="How it ends">
          {ENDING_CHOICES.map((c) => (
            <Chip key={c.value} active={r.ending === c.value} onClick={() => setEnding(c.value)} title={c.hint} role="radio" aria-checked={r.ending === c.value}>
              {c.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted">{ENDING_CHOICES.find((c) => c.value === r.ending)?.hint}.</p>
        {r.ending === "hybrid" && (
          <div>
            <p className={`${LABEL} mb-1.5`}>Race between</p>
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
              {(["vote", "consensus", "judge"] as EndPart[]).map((p) => (
                <Chip key={p} active={r.parts.includes(p)} onClick={() => togglePart(p)}>
                  <Icon name={r.parts.includes(p) ? "check" : "add"} className="text-[14px]" />
                  {ENDING_WORDS[p]}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {parts.includes("vote") && (
          <div>
            <p className={`${LABEL} mb-1.5`}>Needed to pass</p>
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
              {THRESHOLD_CHOICES.map((t) => (
                <Chip key={t} active={Math.abs(r.threshold - t) < 0.005} onClick={() => onChange({ threshold: t })}>
                  {t === 0.67 ? "Two thirds" : t >= 1 ? "Everyone" : `${Math.round(t * 100)}%`}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {parts.includes("judge") && (
          <div>
            <p className={`${LABEL} mb-1.5`}>Who rules</p>
            {room.seats.length === 0 ? (
              <p className="text-xs text-muted">Seat someone first.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                {room.seats.map((s) => (
                  <Chip key={s.key} active={judge?.key === s.key} onClick={() => onChange({ judgeKey: s.key })}>
                    {s.persona.name || "Unnamed"}
                  </Chip>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-muted">What they judge on is in Advanced.</p>
          </div>
        )}
      </div>
    );
  } else if (open === "turns") {
    panel = (
      <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
        {TURN_CHOICES.map((t) => (
          <Chip key={t} active={r.turns === t} onClick={() => onChange({ turns: t })}>{t} turns</Chip>
        ))}
        <label className="ml-1 inline-flex items-center gap-2 text-xs font-normal text-muted">
          or
          <input
            type="number"
            min={2}
            max={60}
            value={r.turns}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n)) onChange({ turns: Math.max(2, Math.min(60, n)) });
            }}
            aria-label="Exact number of turns"
            className="h-9 w-20 rounded-lg border border-hairline bg-surface-card px-2 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <p className="w-full pt-1 text-xs font-normal text-muted">One turn is one person speaking. 12 is about a 15-minute read.</p>
      </div>
    );
  } else if (open === "heat") {
    panel = (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5 text-sm font-semibold" role="radiogroup" aria-label="How heated">
          {VOLTAGE_STOPS.map((v) => (
            <Chip key={v.value} active={voltageWord(r.voltage) === v.word} onClick={() => onChange({ voltage: v.value })} title={v.hint} role="radio" aria-checked={voltageWord(r.voltage) === v.word}>
              {v.word}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted">
          {VOLTAGE_STOPS.find((v) => v.word === voltageWord(r.voltage))?.hint}. Exact heat ({r.voltage}) is in Advanced.
        </p>
      </div>
    );
  } else if (open === "kind") {
    panel = (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5 text-sm font-semibold" role="radiogroup" aria-label="What kind of meeting">
          {SCENARIOS.map((s) => (
            <Chip key={s.value} active={r.scenario === s.value} onClick={() => onChange({ scenario: s.value })} title={s.hint} role="radio" aria-checked={r.scenario === s.value}>
              {s.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted">{SCENARIOS.find((s) => s.value === r.scenario)?.hint}. It sets the starting mood of the room.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby={`${ids}-label`}>
      <h2 id={`${ids}-label`} className={`${LABEL} mb-2`}>How it runs</h2>
      <p className="text-lg leading-[2.1] text-body-strong sm:text-xl">
        Ends when <Token {...tok("ending")} label="How it ends" text={endingPhrase(room)} />
        {parts.length === 0 ? " at " : parts.length > 1 ? ", or after " : " or after "}
        <Token {...tok("turns")} label="Length" text={`${r.turns} turns`} />
        <span className="text-muted"> · </span>
        <Token {...tok("heat")} label="Mood" text={voltageWord(r.voltage)} />
        <span className="text-muted"> · </span>
        <Token {...tok("kind")} label="Kind of meeting" text={scenarioLabel(r.scenario)} />
      </p>
      <div id={`${ids}-panel`} role="region" aria-label="Change this rule">
        {panel && (
          <div className="mt-2 rounded-xl border border-hairline bg-surface-card p-3 sm:p-4">
            {panel}
            <div className="mt-3 text-right text-xs font-semibold">
              <button type="button" onClick={() => setOpen(null)} className="inline-flex min-h-8 cursor-pointer items-center rounded-full px-3 text-muted hover:bg-ink/5 hover:text-ink">
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className={`${LABEL} mb-2`}>Twists</p>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          {TWISTS.map((t) => {
            const on = r.flags[t.key];
            return (
              <Chip
                key={t.key}
                active={on}
                title={t.why}
                onClick={() => onChange({ flags: { ...r.flags, [t.key]: !on } })}
              >
                <Icon name={t.icon} className="text-[16px]" />
                {t.label}
              </Chip>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          {TWISTS.filter((t) => r.flags[t.key]).map((t) => t.why).join(" ") || "No twists: a straight meeting."}
        </p>
      </div>
    </section>
  );
}
