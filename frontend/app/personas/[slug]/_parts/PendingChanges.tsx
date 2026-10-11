"use client";

import Link from "next/link";
import { TRAITS, TRAIT_META, applyGhost, ghostFromEvolutions, traitWord } from "@/lib/persona";
import type { EvolutionProposal, PersonalityProfile } from "@/lib/types";

type Props = {
  pending: EvolutionProposal[];
  personality: PersonalityProfile;
  who: string;
  /** The evolution being kept/discarded, or "all". */
  busy: string | null;
  error: string;
  onKeep: (evo: EvolutionProposal) => void;
  onDiscard: (evo: EvolutionProposal) => void;
  onKeepAll: () => void;
  className?: string;
};

/** Plain-words fallback for rows stored before the backend wrote a reason. */
function sentenceFor(evo: EvolutionProposal): string {
  if (evo.reason) return evo.reason;
  const subject = evo.simulation_subject ? `'${evo.simulation_subject}'` : "a meeting";
  return `After ${subject}${evo.outcome ? ` (${evo.outcome})` : ""}`;
}

export function PendingChanges({ pending, personality, who, busy, error, onKeep, onDiscard, onKeepAll, className = "" }: Props) {
  const several = pending.length > 1;
  return (
    <section
      aria-labelledby="pending-title"
      className={`rounded-2xl border border-accent-amber/60 bg-accent-amber/[0.08] p-4 sm:p-5 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-accent-amber" />
        <h2 id="pending-title" className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-body-strong">
          {several ? `${pending.length} changes need your call` : "A change needs your call"}
        </h2>
        {several && (
          <span className="ml-auto text-xs font-semibold">
            <button
              type="button"
              onClick={onKeepAll}
              disabled={!!busy}
              className="inline-flex min-h-8 cursor-pointer items-center rounded-full border border-ink/20 bg-surface-card px-3 text-ink transition hover:border-ink/40 disabled:opacity-60"
            >
              {busy === "all" ? "Keeping..." : "Keep all"}
            </button>
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted">
        Keep a change to make it part of how {who} plays from now on. Dashed marks on the dials show it.
      </p>

      <ul className="mt-3 space-y-2">
        {pending.map((evo) => {
          const delta = ghostFromEvolutions(evo);
          const after = applyGhost(personality, delta);
          const shifts = TRAITS.filter((t) => (delta[t] ?? 0) !== 0);
          const working = busy === evo.id || busy === "all";
          return (
            <li key={evo.id} className="rounded-xl border border-hairline bg-surface-card p-3">
              <p className="text-sm leading-snug text-ink">{sentenceFor(evo)}</p>
              {shifts.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="What changes">
                  {shifts.map((t) => {
                    const from = traitWord(t, personality[t]);
                    const to = traitWord(t, after[t]);
                    return (
                      <li
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-body-strong"
                        style={{ borderColor: TRAIT_META[t].color }}
                      >
                        <span className="font-semibold">{TRAIT_META[t].label}</span>
                        <span className="font-mono">{(delta[t] ?? 0) > 0 ? "+" : ""}{delta[t]}</span>
                        {from !== to && <span className="text-muted">{from} → {to}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => onKeep(evo)}
                  disabled={!!busy}
                  className="inline-flex min-h-8 cursor-pointer items-center rounded-full bg-ink px-4 text-on-dark transition hover:bg-surface-dark disabled:opacity-60"
                >
                  {working && busy !== "all" ? "Working..." : "Keep"}
                </button>
                <button
                  type="button"
                  onClick={() => onDiscard(evo)}
                  disabled={!!busy}
                  className="inline-flex min-h-8 cursor-pointer items-center rounded-full border border-hairline px-4 text-ink transition hover:bg-ink/5 disabled:opacity-60"
                >
                  Discard
                </button>
                {evo.simulation_id && (
                  <Link
                    href={`/simulate/${encodeURIComponent(evo.simulation_id)}`}
                    className="ml-auto inline-flex min-h-8 items-center rounded-full px-2 text-muted underline-offset-4 hover:text-ink hover:underline"
                  >
                    See the meeting
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-error">{error}</p>}
    </section>
  );
}
