"use client";

import { useState } from "react";
import { ExpandableText } from "@/components/ExpandableText";
import type { AgentDetailResponse } from "@/lib/api";

const GROUPS = [
  { type: "red_line", title: "Red lines", hint: "won't cross", color: "var(--color-error)" },
  { type: "concession", title: "Concessions", hint: "has given ground on", color: "var(--color-accent-amber)" },
  { type: "position", title: "Positions", hint: "has argued for", color: "var(--color-accent-teal)" },
] as const;

const TOP = 3;

type Item = { content: string; subject?: string };

export function Memory({ detail, who }: { detail: AgentDetailResponse | null; who: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const subjects = new Map<string, string>();
  for (const s of detail?.simulations ?? []) {
    if (typeof s.id === "string" && typeof s.subject_name === "string") subjects.set(s.id, s.subject_name);
  }
  const groups = GROUPS.map((g) => {
    const seen = new Set<string>();
    const items: Item[] = [];
    for (const m of detail?.memories ?? []) {
      if (m.memory_type !== g.type || typeof m.content !== "string") continue;
      const content = m.content.trim();
      // The same line gets extracted again in later meetings; show it once.
      const key = content.toLowerCase();
      if (!content || seen.has(key)) continue;
      seen.add(key);
      items.push({ content, subject: typeof m.simulation_id === "string" ? subjects.get(m.simulation_id) : undefined });
    }
    return { ...g, items };
  }).filter((g) => g.items.length > 0);

  if (!groups.length) return null;

  return (
    <section aria-labelledby="memory-title">
      <h2 id="memory-title" className="mb-1 font-display text-2xl font-semibold tracking-display">What {who} remembers</h2>
      <p className="mb-3 text-sm text-muted">Taken from past meetings. {who} brings these into the next one.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {groups.map((g) => {
          const all = open[g.type];
          const shown = all ? g.items : g.items.slice(0, TOP);
          return (
            <div key={g.type} className="min-w-0 rounded-2xl border border-hairline bg-surface-card p-3">
              <h3 className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />
                {g.title}
                <span className="font-normal normal-case tracking-normal text-muted/80">· {g.hint}</span>
              </h3>
              <ul className="mt-2 space-y-2">
                {shown.map((item, i) => (
                  <li key={i} className="text-sm leading-snug text-body-strong">
                    <ExpandableText text={item.content} limit={160} />
                    {item.subject && <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">{item.subject}</span>}
                  </li>
                ))}
              </ul>
              {g.items.length > TOP && (
                <div className="mt-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [g.type]: !all }))}
                    aria-expanded={!!all}
                    className="min-h-8 cursor-pointer text-muted underline-offset-4 hover:text-ink hover:underline"
                  >
                    {all ? "Show fewer" : `Show all ${g.items.length}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
