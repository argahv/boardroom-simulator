"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExpandableText } from "@/components/ExpandableText";
import { fetchSimulation, type AgentDetailResponse, type SimulationOutcome } from "@/lib/api";
import { STANCE_META, TRAITS, TRAIT_META, ghostFromEvolutions, isStance } from "@/lib/persona";
import type { EvolutionProposal } from "@/lib/types";

type Turn = { content: string; action_type?: string; turn_index?: number };

type Meeting = {
  id: string;
  subject: string;
  status?: string;
  stance?: string;
  turns?: number;
  created?: string;
  evolution?: EvolutionProposal;
  lines: Turn[];
  thoughts: string[];
};

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

// Same mapping as backend evolution.outcome_words, for meetings that produced no evolution row.
function outcomeWords(o: SimulationOutcome | null | undefined, stance: string | undefined, personaId: string, names: Record<string, string>): string | null {
  if (!o) return null;
  const reason = o.reason ?? "";
  const kind = o.outcome_type ?? "";
  if (reason === "vote_majority" && (kind === "agreement" || kind === "rejected")) {
    const carried = kind === "agreement";
    if (stance === "champion") return carried ? "won the vote" : "lost the vote";
    if (stance === "detractor") return carried ? "lost the vote" : "won the vote";
    return carried ? "deal reached" : "voted down";
  }
  if (kind === "agreement" || kind === "judge_ruling" || reason === "consensus" || reason === "explicit_agreement") return "deal reached";
  if (kind === "walkaway" || reason === "walkaway" || reason === "deadlock_walkaway") {
    const party = o.walkaway_party;
    if (!party) return "impasse";
    if (party === personaId) return "walked out";
    return names[party] ? `${names[party]} walked out` : "someone walked out";
  }
  if (kind === "impasse") return "impasse";
  return "no decision";
}

function outcomeClass(words: string): string {
  if (/^won|deal reached/.test(words)) return "bg-success-soft text-success";
  if (/^lost|voted down/.test(words)) return "bg-error-soft text-error";
  return "bg-ink/5 text-body-strong";
}

const EVO_STATUS: Record<EvolutionProposal["status"], string> = {
  approved: "kept",
  rejected: "discarded",
  pending: "waiting for you",
};

const shortDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

function buildMeetings(detail: AgentDetailResponse | null, history: EvolutionProposal[]): Meeting[] {
  const evoBySim = new Map<string, EvolutionProposal>();
  // History is newest first; keep the newest per meeting.
  for (const e of history) if (e.simulation_id && !evoBySim.has(e.simulation_id)) evoBySim.set(e.simulation_id, e);

  const turnsBySubject = new Map<string, Turn[]>();
  for (const t of detail?.recent_turns ?? []) {
    const subject = str(t.subject_name) ?? "";
    const content = str(t.content);
    if (!content) continue;
    const list = turnsBySubject.get(subject) ?? [];
    list.push({ content, action_type: str(t.action_type), turn_index: num(t.turn_index) });
    turnsBySubject.set(subject, list);
  }
  const thoughtsBySim = new Map<string, string[]>();
  for (const s of detail?.strategies ?? []) thoughtsBySim.set(s.simulation_id, s.strategy_hints.map((h) => h.hint));

  // The agent view groups turns (and the reasoning behind strategies) by subject name, not by meeting,
  // so lines are only shown when that subject names a single meeting.
  const subjectCount = new Map<string, number>();
  for (const s of detail?.simulations ?? []) {
    const subject = str(s.subject_name) ?? "";
    subjectCount.set(subject, (subjectCount.get(subject) ?? 0) + 1);
  }

  const meetings: Meeting[] = [];
  const seen = new Set<string>();
  for (const s of detail?.simulations ?? []) {
    const id = str(s.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const subject = str(s.subject_name) ?? "";
    const unique = subjectCount.get(subject) === 1;
    meetings.push({
      id,
      subject: subject || "Untitled meeting",
      status: str(s.status),
      stance: str(s.stance),
      turns: num(s.turn_count),
      created: str(s.created_at),
      evolution: evoBySim.get(id),
      lines: unique ? (turnsBySubject.get(subject) ?? []).slice(0, 3) : [],
      thoughts: unique ? thoughtsBySim.get(id) ?? [] : [],
    });
  }
  // Evolutions outlive their meeting's participant rows; still show where a change came from.
  for (const [id, e] of evoBySim) {
    if (seen.has(id)) continue;
    meetings.push({ id, subject: e.simulation_subject || "A past meeting", created: e.created_at, evolution: e, lines: [], thoughts: [] });
  }
  return meetings.sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""));
}

type Props = {
  personaId: string;
  who: string;
  detail: AgentDetailResponse | null;
  history: EvolutionProposal[];
  loading: boolean;
  rehearseHref: string;
};

export function Meetings({ personaId, who, detail, history, loading, rehearseHref }: Props) {
  const meetings = useMemo(() => buildMeetings(detail, history), [detail, history]);
  const [outcomes, setOutcomes] = useState<Record<string, string | null>>({});

  // Meetings with an evolution already carry their outcome; look up the rest (a few, newest first).
  // A string key, so approving a change (new history array) doesn't refetch.
  const fetchKey = meetings
    .filter((m) => !m.evolution?.outcome && m.status === "complete")
    .slice(0, 8)
    .map((m) => `${m.id} ${m.stance ?? ""}`)
    .join("|");
  const requested = useRef(new Set<string>());
  useEffect(() => {
    if (!fetchKey) return;
    // No cancel flag: `requested` dedupes, and StrictMode's re-run must not drop the first results.
    for (const pair of fetchKey.split("|")) {
      const [id, stance] = pair.split(" ");
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      fetchSimulation(id)
        .then((sim) => {
          const names: Record<string, string> = {};
          for (const s of sim.config?.stakeholders ?? []) names[s.id] = s.name;
          const words = outcomeWords(sim.outcome, stance || undefined, personaId, names);
          setOutcomes((prev) => ({ ...prev, [id]: words }));
        })
        .catch(() => {
          // No outcome shown; the row still links to the meeting.
          requested.current.delete(id);
        });
    }
  }, [fetchKey, personaId]);

  return (
    <section aria-labelledby="meetings-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="meetings-title" className="font-display text-2xl font-semibold tracking-display">Meetings</h2>
        {meetings.length > 0 && <span className="shrink-0 font-mono text-[11px] text-muted">{meetings.length}</span>}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Loading meetings...
        </p>
      ) : meetings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline bg-surface-card/50 px-4 py-6 text-sm text-muted">
          {who} hasn&apos;t been in a meeting yet.{" "}
          <Link href={rehearseHref} className="font-semibold text-primary-active underline-offset-4 hover:underline">
            Put {who} in one
          </Link>
          {" "}to see how they actually play.
        </div>
      ) : (
        <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface-card">
          {meetings.map((m) => {
            const stance = isStance(m.stance) ? STANCE_META[m.stance] : null;
            const outcome = m.evolution?.outcome ?? outcomes[m.id] ?? (m.status === "running" ? "in progress" : null);
            const delta = m.evolution ? ghostFromEvolutions(m.evolution) : {};
            const shifts = TRAITS.filter((t) => (delta[t] ?? 0) !== 0);
            const more = m.lines.length > 0 || m.thoughts.length > 0;
            return (
              <li key={m.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/simulate/${encodeURIComponent(m.id)}`}
                    className="min-w-0 flex-1 basis-48 truncate font-semibold text-ink underline-offset-4 hover:underline"
                    title={m.subject}
                  >
                    {m.subject}
                  </Link>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{shortDate(m.created)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {stance && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-body-strong">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: stance.color }} />
                      {stance.label}
                    </span>
                  )}
                  {outcome && <span className={`rounded-full px-2 py-0.5 font-semibold ${outcomeClass(outcome)}`}>{outcome}</span>}
                  {m.turns !== undefined && m.turns > 0 && <span className="text-muted">{m.turns} turns</span>}
                  {shifts.length > 0 && m.evolution && (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <span className={`inline-flex flex-wrap gap-1 font-mono ${m.evolution.status === "rejected" ? "text-muted line-through" : "text-body-strong"}`}>
                        {shifts.map((t) => (
                          <span key={t}>{(delta[t] ?? 0) > 0 ? "+" : ""}{delta[t]} {TRAIT_META[t].label.toLowerCase()}</span>
                        ))}
                      </span>
                      <span className="text-muted">({EVO_STATUS[m.evolution.status] ?? m.evolution.status})</span>
                    </span>
                  )}
                  {m.status === "complete" && (
                    <Link
                      href={`/simulate/${encodeURIComponent(m.id)}/postmortem`}
                      className="ml-auto text-muted underline-offset-4 hover:text-ink hover:underline"
                    >
                      Postmortem
                    </Link>
                  )}
                </div>
                {more && (
                  <details className="group mt-2">
                    <summary className="cursor-pointer list-none text-xs font-semibold text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                      <span aria-hidden className="material-symbols-outlined mr-0.5 align-[-3px] text-[16px] transition-transform group-open:rotate-90">chevron_right</span>
                      What {who} said{m.thoughts.length > 0 ? " and thought" : ""}
                    </summary>
                    <div className="mt-2 space-y-2 border-l-2 border-hairline pl-3">
                      {m.lines.map((l, i) => (
                        <p key={i} className="text-sm leading-relaxed text-body-strong">
                          <ExpandableText text={`“${l.content}”`} limit={220} />
                        </p>
                      ))}
                      {m.thoughts.map((h, i) => (
                        <p key={`t${i}`} className="text-xs italic leading-relaxed text-muted">Thinking: {h}</p>
                      ))}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
