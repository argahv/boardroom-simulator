"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { InsightPerson } from "@/lib/api";
import { Chip } from "@/components/room/ui";
import { Card, Empty, LABEL, moveName, pct } from "./ui";

const SORTS = {
  meetings: { label: "Most meetings", by: (p: InsightPerson) => p.meetings * 1000 + p.turns },
  airtime: { label: "Holds the floor", by: (p: InsightPerson) => p.airtime ?? 0 },
  fire: { label: "Draws fire", by: (p: InsightPerson) => (p.hostility_received ?? 0) * p.targeted_per_meeting },
  hostile: { label: "Most combative", by: (p: InsightPerson) => p.hostility_given ?? 0 },
  winner: { label: "On the winning side", by: (p: InsightPerson) => p.sided_with_result ?? -1 },
} as const;
type SortKey = keyof typeof SORTS;
const TOP = 12;

/** Airtime against a fair share (1×); the tick marks the fair share. */
function Airtime({ x }: { x: number | null }) {
  if (x == null) return <span className="text-muted">—</span>;
  const w = Math.min(100, (x / 2.5) * 100);
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-2 w-20 overflow-hidden rounded-full bg-ink/5">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, background: x >= 1.5 ? "var(--color-primary)" : x <= 0.6 ? "var(--color-accent-blue)" : "var(--color-ink)" }} />
        <span className="absolute inset-y-0 w-px bg-canvas" style={{ left: `${100 / 2.5}%` }} />
      </span>
      <span className="tabular-nums">{x.toFixed(1)}×</span>
    </span>
  );
}

export function People({ data }: { data: InsightPerson[] }) {
  const [sort, setSort] = useState<SortKey>("meetings");
  const [all, setAll] = useState(false);
  const rows = useMemo(() => [...data].sort((a, b) => SORTS[sort].by(b) - SORTS[sort].by(a)), [data, sort]);
  if (!data.length) return <Empty>No one has spoken in a meeting in this period.</Empty>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`${LABEL} mr-1`}>Sort</span>
        {(Object.keys(SORTS) as SortKey[]).map((k) => (
          <Chip key={k} active={sort === k} onClick={() => setSort(k)}>{SORTS[k].label}</Chip>
        ))}
      </div>

      <Card>
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className={`${LABEL} border-b border-hairline`}>
                <th className="px-5 pb-3 font-bold sm:px-6">Person</th>
                <th className="pb-3 font-bold" title="Meetings attended">Meet.</th>
                <th className="pb-3 font-bold" title="Turns taken against a fair share (1×)">Airtime</th>
                <th className="pb-3 font-bold" title="Times others addressed them, per meeting">Addressed</th>
                <th className="pb-3 font-bold" title="Share of what was aimed at them that was a challenge, escalation or interruption">Heat taken</th>
                <th className="pb-3 font-bold" title="Share of their own turns that were hostile">Heat given</th>
                <th className="pb-3 font-bold" title="The move they make far more than others">Signature</th>
                <th className="px-5 pb-3 font-bold sm:px-6" title="How often their vote matched the result">Voted with result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(all ? rows : rows.slice(0, TOP)).map((p) => (
                <tr key={p.key} className="align-middle">
                  <td className="px-5 py-3 sm:px-6">
                    {p.persona_id ? (
                      <Link href={`/personas/${p.persona_id}`} className="font-semibold text-ink hover:text-primary">{p.name}</Link>
                    ) : (
                      <span className="font-semibold text-ink">{p.name}</span>
                    )}
                    <span className="block truncate text-xs text-muted">{[p.role, p.usual_stance].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="tabular-nums">{p.meetings}</td>
                  <td><Airtime x={p.airtime} /></td>
                  <td className="tabular-nums">{p.targeted_per_meeting.toFixed(1)}</td>
                  <td className={`tabular-nums ${(p.hostility_received ?? 0) >= 0.6 ? "font-semibold text-error" : ""}`}>{pct(p.hostility_received)}</td>
                  <td className="tabular-nums">{pct(p.hostility_given)}</td>
                  <td>
                    {p.signature ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft/60 px-2 py-0.5 text-xs font-semibold text-primary">
                        {moveName(p.signature.action)} <span className="font-normal opacity-80">{p.signature.times_typical}×</span>
                      </span>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-5 tabular-nums sm:px-6">
                    {p.sided_with_result == null ? <span className="text-muted">no votes</span> : pct(p.sided_with_result)}
                    {p.walkouts > 0 && <span className="ml-2 text-xs font-semibold text-error">walked out {p.walkouts}×</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > TOP && (
          <div className="mt-3 border-t border-hairline pt-3 text-center text-sm font-semibold">
            <button type="button" onClick={() => setAll((v) => !v)} className="cursor-pointer text-primary hover:underline">
              {all ? "Show top 12" : `Show all ${rows.length} people`}
            </button>
          </div>
        )}
      </Card>
      <p className="text-xs text-muted">
        Airtime 1× is a fair share of the room&apos;s turns. A signature move is one they make at least 1.3× as often as everyone else.
      </p>
    </div>
  );
}
