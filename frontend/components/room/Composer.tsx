"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { StanceRing } from "@/components/PersonaCard";
import type { Seat } from "./model";
import { FILE_ACCEPT, addFiles } from "./files";
import { Icon, Spinner, formatBytes } from "./ui";

const EXAMPLES = [
  "Tomorrow I pitch our Series B at $75M. The angel hates dilution and the CFO wants profitability first.",
  "Renewal call with our biggest customer. Procurement wants 20% off; their CTO loves the product.",
  "Board meeting on whether to recall the X200 after three overheating reports.",
  "Our partner wants exclusivity in Europe. Legal is nervous, sales is thrilled.",
];

export type ComposerProps = {
  value: string;
  onChange: (text: string) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onBuild: () => void;
  /** Staged copy while the room is being drafted; null when idle. */
  busy: string | null;
  /** Library people already coming (from ?with=), shown as chips. */
  seated: Seat[];
  onUnseat: (key: string) => void;
  autoFocus?: boolean;
};

export function Composer({ value, onChange, files, onFilesChange, onBuild, busy, seated, onUnseat, autoFocus }: ComposerProps) {
  const ids = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [example, setExample] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [fileProblem, setFileProblem] = useState("");

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // The placeholder rotates through examples so an empty box still teaches what to type.
  useEffect(() => {
    if (value) return;
    const t = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 6000);
    return () => clearInterval(t);
  }, [value]);

  const take = (incoming: FileList | File[]) => {
    const { files: next, problem } = addFiles(files, incoming);
    onFilesChange(next);
    setFileProblem(problem);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) take(e.dataTransfer.files);
  };

  const canBuild = !busy && (value.trim().length > 0 || files.length > 0);
  const withNames = seated.map((s) => s.persona.name.split(" ")[0]).filter(Boolean);

  return (
    <section
      aria-labelledby={`${ids}-label`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={onDrop}
      className={`relative rounded-2xl border bg-surface-card p-4 shadow-sm transition sm:p-5 ${dragOver ? "border-primary ring-2 ring-primary/20" : "border-hairline"}`}
    >
      <label id={`${ids}-label`} htmlFor={`${ids}-brief`} className="block font-display text-2xl font-semibold tracking-display text-ink sm:text-3xl">
        {withNames.length ? `What's the meeting with ${withNames.join(" and ")}?` : "What's the meeting?"}
      </label>
      <p className="mt-1 text-sm text-muted">
        A sentence or two is enough. Who&apos;s there, what you want, what worries you. Or drop a deck.
      </p>

      <div className="mt-3 text-base leading-relaxed">
        <textarea
          ref={inputRef}
          id={`${ids}-brief`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (canBuild) onBuild();
            }
          }}
          rows={3}
          disabled={!!busy}
          placeholder={EXAMPLES[example]}
          className="block min-h-24 w-full resize-y rounded-xl border border-hairline bg-canvas/50 px-4 py-3 text-ink outline-none [field-sizing:content] placeholder:text-muted/60 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-70"
        />
      </div>

      {(seated.length > 0 || files.length > 0) && (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Already in the room">
          {seated.map((s) => (
            <li key={s.key} className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-hairline bg-canvas/60 py-1 pl-1 pr-1.5">
              <StanceRing stance={s.persona.stance} name={s.persona.name} size={22} />
              <span className="truncate text-ink">{s.persona.name}</span>
              <button
                type="button"
                onClick={() => onUnseat(s.key)}
                aria-label={`Don't bring ${s.persona.name}`}
                className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            </li>
          ))}
          {files.map((f) => (
            <li key={`${f.name}-${f.size}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-hairline bg-canvas/60 py-1 pl-2.5 pr-1.5">
              <Icon name="description" className="text-[16px] text-muted" />
              <span className="truncate text-ink">{f.name}</span>
              <span className="shrink-0 font-normal text-muted">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => onFilesChange(files.filter((x) => x !== f))}
                aria-label={`Remove ${f.name}`}
                className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {fileProblem && <p className="mt-2 text-xs text-error" role="status">{fileProblem}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={FILE_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => { if (e.target.files) take(e.target.files); e.target.value = ""; }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!!busy}
            className="-ml-2 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-muted transition hover:bg-ink/5 hover:text-ink"
          >
            <Icon name="attach_file" className="text-[18px]" />
            Attach a deck or notes
          </button>
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span className="hidden font-mono text-[11px] font-normal text-muted sm:inline" aria-hidden>Ctrl/⌘ + Enter</span>
          <button
            type="button"
            onClick={onBuild}
            disabled={!canBuild}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-primary px-5 text-white transition hover:bg-primary-active active:scale-[0.97]"
          >
            {busy ? <Spinner /> : <Icon name="auto_awesome" className="text-[18px]" />}
            {busy ? "Building…" : "Build the room"}
          </button>
        </div>
      </div>
      {busy && (
        <p className="mt-3 text-sm text-muted" role="status" aria-live="polite">{busy}</p>
      )}

      {dragOver && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-surface-card/85 text-sm font-semibold text-ink">
          <Icon name="upload_file" className="mr-2 text-[20px] text-primary" /> Drop to attach. We&apos;ll read it to build the room.
        </div>
      )}
    </section>
  );
}
