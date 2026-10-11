"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { parseFactLines, type Fact } from "./model";
import { Icon, LABEL } from "./ui";

export type FactsEditorProps = {
  facts: Fact[];
  onChange: (facts: Fact[]) => void;
};

/** One fact per line; a star marks what matters most. Pasting several lines adds them all. */
export function FactsEditor({ facts, onChange }: FactsEditorProps) {
  const [draft, setDraft] = useState("");
  const addRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLInputElement>());

  const commitDraft = () => {
    const added = parseFactLines(draft);
    if (added.length) onChange([...facts, ...added]);
    setDraft("");
  };

  const pasteMany = (e: ClipboardEvent<HTMLInputElement>, at: number | null) => {
    const text = e.clipboardData.getData("text");
    if (!/\r?\n/.test(text.trim())) return;
    e.preventDefault();
    const added = parseFactLines(text);
    if (at === null) onChange([...facts, ...added]);
    else onChange([...facts.slice(0, at + 1), ...added, ...facts.slice(at + 1)]);
  };

  const onRowKey = (e: KeyboardEvent<HTMLInputElement>, f: Fact, i: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRef.current?.focus();
    } else if (e.key === "Backspace" && !f.text) {
      e.preventDefault();
      onChange(facts.filter((x) => x.id !== f.id));
      const prev = facts[i - 1];
      if (prev) rowRefs.current.get(prev.id)?.focus();
      else addRef.current?.focus();
    }
  };

  const set = (id: string, patch: Partial<Fact>) => onChange(facts.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <section aria-labelledby="facts-label">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="facts-label" className={LABEL}>Facts on the table</h2>
        <p className="text-[11px] text-muted">Everyone in the room knows these. One per line; paste a list to add several. Star what matters most.</p>
      </div>
      <ul className="divide-y divide-hairline rounded-xl border border-hairline bg-surface-card text-sm">
        {facts.map((f, i) => (
          <li key={f.id} className="group flex items-center gap-1 pl-1 pr-1">
            <button
              type="button"
              onClick={() => set(f.id, { star: !f.star })}
              aria-pressed={f.star}
              aria-label={f.star ? "Important. Unstar" : "Mark as important"}
              title={f.star ? "Important" : "Mark as important"}
              className={`inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition hover:bg-ink/5 ${f.star ? "text-warning" : "text-muted/50 hover:text-ink"}`}
            >
              <Icon name="star" filled={f.star} className="text-[18px]" />
            </button>
            <input
              ref={(el) => { if (el) rowRefs.current.set(f.id, el); else rowRefs.current.delete(f.id); }}
              value={f.text}
              onChange={(e) => set(f.id, { text: e.target.value })}
              onKeyDown={(e) => onRowKey(e, f, i)}
              onPaste={(e) => pasteMany(e, i)}
              aria-label={`Fact ${i + 1}`}
              // Inline weight: globals.css gives inputs `font: inherit`, which beats a utility class.
              style={f.star ? { fontWeight: 600 } : undefined}
              className={`min-w-0 flex-1 bg-transparent py-2 outline-none ${f.star ? "text-ink" : "text-body-strong"}`}
            />
            <button
              type="button"
              onClick={() => onChange(facts.filter((x) => x.id !== f.id))}
              aria-label={`Remove fact ${i + 1}`}
              className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-ink/5 hover:text-ink [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          </li>
        ))}
        <li className="flex items-center gap-1 pl-1 pr-2">
          <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-muted/50">
            <Icon name="add" className="text-[18px]" />
          </span>
          <input
            ref={addRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitDraft(); } }}
            onBlur={commitDraft}
            onPaste={(e) => pasteMany(e, null)}
            aria-label="Add a fact"
            placeholder={facts.length ? "Add another" : "e.g. Valuation: $75M"}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-body-strong outline-none placeholder:text-muted/60"
          />
          {draft.trim() && (
            <span className="shrink-0 font-mono text-[10px] text-muted" aria-hidden>Enter</span>
          )}
        </li>
      </ul>
    </section>
  );
}
