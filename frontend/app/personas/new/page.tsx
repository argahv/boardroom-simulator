"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PersonaCard } from "@/components/PersonaCard";
import { createStakeholder, draftPersona } from "@/lib/api";
import { emptyPersona, fromDraft, toStakeholder, type PersonaDraft } from "@/lib/persona";
import type { Stakeholder } from "@/lib/types";
import { DropZone } from "../_lib/DropZone";
import { MAX_DOCS, checkFiles, errorText, firstName, formatSize, uploadFiles } from "../_lib/files";

type View = "compose" | "review" | "saved";
type Busy = null | "drafting" | "saving";
type Then = "open" | "rehearse";

const EXAMPLES = [
  "Skeptical CFO, burned by a vendor that blew its budget",
  "Union rep who will protect jobs at any cost",
  "Activist investor quietly pushing for a sale",
];

// Words that start a description rather than a name ("Lawyer, risk-averse ...").
const NOT_A_NAME = new Set([
  "skeptical", "sceptical", "angry", "cautious", "risk-averse", "aggressive", "friendly", "hostile", "senior", "junior",
  "lawyer", "founder", "investor", "engineer", "director", "manager", "chair", "chairman", "chairwoman", "partner",
  "banker", "regulator", "analyst", "consultant", "customer", "buyer", "seller", "union", "activist", "head", "the",
  "a", "an", "our", "my", "their", "someone",
]);
const NAME_WORD = /^(?:[A-ZÀ-ɏ][\p{L}'’.-]*|de|del|da|di|van|von|der|den|la|le|bin|al|du|dos|ter)$/u;

/** "Dana Okafor, CFO" / "Dana Okafor - CFO" / "Dana Okafor (CFO)" -> saved as-is without the AI. */
function quickNameRole(text: string): { name: string; role: string } | null {
  const t = text.trim();
  if (!t || t.includes("\n") || t.length > 90) return null;
  const m = t.match(/^(.+?)\s*(?:,|\s[-–—]\s|\()\s*(.+?)\)?\.?$/);
  if (!m) return null;
  const name = m[1].trim();
  const role = m[2].trim();
  const words = name.split(/\s+/);
  if (words.length > 4 || !words.every((w) => NAME_WORD.test(w))) return null;
  if (words.some((w) => NOT_A_NAME.has(w.toLowerCase()))) return null;
  // An all-caps word is a title ("CFO, Acme"), not a name.
  if (words.some((w) => w.length > 1 && /[A-Z]/.test(w) && w === w.toUpperCase())) return null;
  if (!role || role.split(/\s+/).length > 8) return null;
  return { name, role };
}

export default function NewPersonaPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [view, setView] = useState<View>("compose");
  const [busy, setBusy] = useState<Busy>(null);
  const [draft, setDraft] = useState<PersonaDraft>(() => emptyPersona());
  const [guessed, setGuessed] = useState<string[]>([]);
  const [source, setSource] = useState<"llm" | "fallback" | "manual">("manual");
  const [files, setFiles] = useState<File[]>([]);
  const [fileProblems, setFileProblems] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [cardError, setCardError] = useState("");
  const [progress, setProgress] = useState("");
  // Set once the persona exists, so a failed upload can never lead to a second copy of her.
  const [saved, setSaved] = useState<{ persona: Stakeholder; then: Then; failed: { file: File; error?: string }[] } | null>(null);

  const quick = quickNameRole(text);

  useEffect(() => {
    if (view === "compose") inputRef.current?.focus();
  }, [view]);

  const addFiles = async (incoming: File[]) => {
    const { ok, problems } = checkFiles(incoming, MAX_DOCS - files.length);
    setFileProblems(problems);
    if (!ok.length) return;
    setFiles((prev) => [...prev, ...ok]);
    // A dropped text bio with nothing typed yet is the description to draft from.
    const txt = ok.find((f) => f.name.toLowerCase().endsWith(".txt"));
    if (txt && !text.trim() && view === "compose") {
      try {
        setText((await txt.text()).trim().slice(0, 6000));
      } catch {
        // Unreadable: it still goes to the knowledge base.
      }
    }
  };

  const destination = (id: string, then: Then) =>
    then === "rehearse" ? `/simulate/new?with=${encodeURIComponent(id)}` : `/personas/${encodeURIComponent(id)}`;

  const uploadAndGo = async (persona: Stakeholder, toUpload: File[], then: Then) => {
    const results = await uploadFiles(persona.id, toUpload, (i, f) =>
      setProgress(`Adding ${toUpload.length > 1 ? `${i + 1} of ${toUpload.length}: ` : ""}${f.name}`),
    );
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      setSaved({ persona, then, failed });
      setView("saved");
      setBusy(null);
      return;
    }
    router.push(destination(persona.id, then));
  };

  const save = async (p: PersonaDraft, then: Then) => {
    if (busy) return;
    if (!p.name.trim()) {
      setCardError("Needs a name");
      return;
    }
    setCardError("");
    setError("");
    setBusy("saving");
    setProgress(`Saving ${p.name.trim()}`);
    let persona: Stakeholder;
    try {
      persona = await createStakeholder(toStakeholder(p));
    } catch (err) {
      setError(errorText(err, "Couldn't save. Try again."));
      setBusy(null);
      return;
    }
    // Busy stays on through navigation so nothing can be clicked twice.
    if (files.length) await uploadAndGo(persona, files, then);
    else router.push(destination(persona.id, then));
  };

  const runDraft = async (input: string) => {
    const t = input.trim();
    if (!t || busy) return;
    setError("");
    setBusy("drafting");
    try {
      const res = await draftPersona(t);
      setDraft(fromDraft(res.persona));
      setGuessed(res.guessed ?? []);
      setSource(res.source);
      setCardError("");
      setView("review");
    } catch (err) {
      setError(errorText(err, "Couldn't draft from that."));
    } finally {
      setBusy(null);
    }
  };

  const submit = () => {
    if (busy || !text.trim()) return;
    if (quick) void save(emptyPersona({ name: quick.name, role: quick.role }), "open");
    else void runDraft(text);
  };

  const fillYourself = () => {
    const t = text.trim();
    // Whatever was typed lands somewhere sensible: "Name, Role" splits, a few words are a name, more is backstory.
    const short = !t.includes("\n") && t.length <= 40 && t.split(/\s+/).length <= 4;
    setDraft(
      quick
        ? emptyPersona({ name: quick.name, role: quick.role })
        : short
          ? emptyPersona({ name: t })
          : emptyPersona({ backstory: t }),
    );
    setGuessed([]);
    setSource("manual");
    setError("");
    setCardError("");
    setView("review");
  };

  const startOver = () => {
    setView("compose");
    setGuessed([]);
    setCardError("");
    setError("");
  };

  const who = firstName(view === "review" ? draft.name : quick?.name ?? "");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-8 sm:py-10">
        <Link href="/personas" className="mb-6 inline-flex items-center gap-1 text-xs text-muted transition hover:text-ink">
          <span aria-hidden className="material-symbols-outlined text-[14px]">arrow_back</span>
          Personas
        </Link>

        {view === "saved" && saved ? (
          <>
            <SavedWithProblems
              saved={saved}
              busy={busy === "saving"}
              onRetry={async () => {
                setBusy("saving");
                await uploadAndGo(saved.persona, saved.failed.map((f) => f.file), saved.then);
              }}
              onContinue={() => router.push(destination(saved.persona.id, saved.then))}
            />
            <StatusLine busy={busy} progress={progress} error="" />
          </>
        ) : view === "review" ? (
          <section aria-label="Check and save">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">New persona</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-display sm:text-4xl">
              {source === "manual" ? "Fill in the card" : "Check the draft"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {source === "llm" && "Drafted from your text. Anything marked AI guess was inferred, not read. Click any field to change it."}
              {source === "fallback" && "The AI isn't available right now, so this was filled from keywords in your text. Check the fields marked AI guess."}
              {source === "manual" && "Only the name is required. Pick a temperament to set how they act."}
            </p>

            <div className="mt-5">
              <PersonaCard
                value={draft}
                onChange={(patch) => {
                  setDraft((d) => ({ ...d, ...patch }));
                  if (patch.name?.trim()) setCardError("");
                }}
                guessed={guessed}
                autoFocusName={!draft.name.trim()}
                error={cardError}
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => void save(draft, "open")}
                      disabled={!!busy}
                      className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-5 text-on-dark transition hover:bg-primary-active disabled:opacity-60"
                    >
                      {busy === "saving" ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void save(draft, "rehearse")}
                      disabled={!!busy}
                      className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-hairline px-4 text-ink transition hover:bg-ink/5 disabled:opacity-60"
                    >
                      Save &amp; rehearse
                    </button>
                    <button
                      type="button"
                      onClick={startOver}
                      disabled={!!busy}
                      className="ml-auto inline-flex min-h-10 cursor-pointer items-center rounded-full px-3 text-muted transition hover:text-ink disabled:opacity-60"
                    >
                      Start over
                    </button>
                  </>
                }
              />
            </div>

            <DropZone
              onFiles={(f) => void addFiles(f)}
              disabled={!!busy}
              className="mt-3 rounded-xl border border-dashed border-transparent transition"
              overClassName="border-primary bg-primary-soft"
            >
              {({ open }) => (
                <>
                  <FilesLine files={files} onRemove={(f) => setFiles((prev) => prev.filter((x) => x !== f))} who={who} />
                  <div className="px-1 py-1 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={open}
                      disabled={!!busy}
                      className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full px-2 text-muted transition hover:bg-ink/5 hover:text-ink disabled:opacity-60"
                    >
                      <span aria-hidden className="material-symbols-outlined text-[16px]">attach_file</span>
                      {files.length ? "Add another file" : `Add a file to ${who === "them" ? "their" : `${who}'s`} knowledge base`}
                    </button>
                  </div>
                </>
              )}
            </DropZone>
            <FileProblems problems={fileProblems} />
            <StatusLine busy={busy} progress={progress} error={error} />
          </section>
        ) : (
          <section aria-label="New persona">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">New persona</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-display sm:text-4xl">
              <label htmlFor="who">Who is this?</label>
            </h1>

            <DropZone
              onFiles={(f) => void addFiles(f)}
              disabled={!!busy}
              className="relative mt-5 rounded-2xl border border-hairline bg-surface-card transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25"
              overClassName="border-primary bg-primary-soft"
            >
              {({ open, over }) => (
                <>
                  {/* The box shows focus (ring), so the textarea opts out of the global focus outline. */}
                  <div className="text-lg leading-snug">
                    <textarea
                      id="who"
                      ref={inputRef}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          submit();
                        }
                      }}
                      disabled={!!busy}
                      rows={2}
                      placeholder="Dana Okafor, CFO. Or paste a bio, a LinkedIn About or a CV."
                      aria-describedby="who-hint"
                      className="block max-h-[50vh] min-h-24 w-full resize-none rounded-t-2xl bg-transparent px-4 pt-4 pb-2 text-ink outline-none! [field-sizing:content] placeholder:text-muted/60 disabled:opacity-60 sm:px-5"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 px-3 pb-3 sm:px-4">
                    <div className="text-xs font-semibold">
                      <button
                        type="button"
                        onClick={open}
                        disabled={!!busy}
                        title="PDF, Word or text. Goes into their knowledge base."
                        className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full px-2.5 text-muted transition hover:bg-ink/5 hover:text-ink disabled:opacity-60"
                      >
                        <span aria-hidden className="material-symbols-outlined text-[18px]">attach_file</span>
                        Add a file
                      </button>
                    </div>
                    <div className="ml-auto flex items-center gap-2 text-sm font-semibold">
                      {quick && (
                        <button
                          type="button"
                          onClick={() => void runDraft(text)}
                          disabled={!!busy}
                          className="inline-flex min-h-10 cursor-pointer items-center rounded-full px-3 text-muted transition hover:bg-ink/5 hover:text-ink disabled:opacity-60"
                        >
                          Draft full card
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={submit}
                        disabled={!!busy || !text.trim()}
                        className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-5 text-on-dark transition hover:bg-primary-active disabled:opacity-50"
                      >
                        {busy === "drafting" ? (
                          <>
                            <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-on-dark" />
                            Drafting
                          </>
                        ) : busy === "saving" ? (
                          "Saving..."
                        ) : quick ? (
                          "Save"
                        ) : (
                          <>
                            <span aria-hidden className="material-symbols-outlined text-[18px]">auto_awesome</span>
                            Draft
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  {over && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-surface-card/90 text-sm font-semibold text-ink">
                      Drop to add to their knowledge base
                    </div>
                  )}
                </>
              )}
            </DropZone>

            <p id="who-hint" className="mt-2 min-h-5 px-1 text-xs text-muted" aria-live="polite">
              {busy === "drafting"
                ? "Reading your text and filling in the card. This takes a few seconds."
                : quick
                  ? <>Enter saves <span className="font-semibold text-ink">{quick.name}</span> ({quick.role}) and opens the page.</>
                  : text.trim()
                    ? "Enter drafts the whole card from this. You check it, then save."
                    : "A name and role saves right away. A description, bio or CV drafts the whole card."}
            </p>

            <FilesLine files={files} onRemove={(f) => setFiles((prev) => prev.filter((x) => x !== f))} who={who} />
            <FileProblems problems={fileProblems} />
            <StatusLine busy={busy} progress={progress} error={error} />

            {!text.trim() && !busy && (
              <div className="mt-8">
                <p className="mb-2 px-1 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted">Or try</p>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => {
                        setText(ex);
                        void runDraft(ex);
                      }}
                      className="min-h-9 cursor-pointer rounded-full border border-hairline bg-surface-card/60 px-3 py-1.5 text-left text-muted transition hover:border-ink/30 hover:text-ink"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 px-1 text-xs">
              <button
                type="button"
                onClick={fillYourself}
                disabled={!!busy}
                className="cursor-pointer text-muted underline decoration-hairline underline-offset-4 transition hover:text-ink disabled:opacity-60"
              >
                Fill in the card yourself
              </button>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function FilesLine({ files, onRemove, who }: { files: File[]; onRemove: (f: File) => void; who: string }) {
  if (!files.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-hairline bg-surface-card/60 px-3 py-2 first:mt-0">
      <p className="text-xs text-muted">
        {files.length === 1 ? "This file goes" : `These ${files.length} files go`} into {who === "them" ? "their" : `${who}'s`} knowledge base when you save.
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {files.map((f) => (
          <li key={`${f.name}-${f.size}-${f.lastModified}`} className="flex min-w-0 max-w-full items-center gap-1 rounded-full border border-hairline bg-canvas/60 py-0.5 pl-2.5 pr-1 text-xs">
            <span aria-hidden className="material-symbols-outlined text-[14px] text-muted">description</span>
            <span className="min-w-0 truncate text-ink">{f.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted">{formatSize(f.size)}</span>
            <button
              type="button"
              onClick={() => onRemove(f)}
              aria-label={`Remove ${f.name}`}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-ink/5 hover:text-ink"
            >
              <span aria-hidden className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FileProblems({ problems }: { problems: string[] }) {
  if (!problems.length) return null;
  return (
    <ul role="alert" className="mt-2 space-y-0.5 px-1 text-xs text-error">
      {problems.map((p) => <li key={p}>{p}</li>)}
    </ul>
  );
}

function StatusLine({ busy, progress, error }: { busy: Busy; progress: string; error: string }) {
  if (error) {
    return (
      <p role="alert" className="mt-3 rounded-xl bg-error-soft px-3 py-2 text-sm text-error">
        {error}
      </p>
    );
  }
  if (busy !== "saving") return null;
  return (
    <p className="mt-3 flex items-center gap-2 px-1 text-sm text-muted" aria-live="polite">
      <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      {progress}...
    </p>
  );
}

function SavedWithProblems({
  saved,
  busy,
  onRetry,
  onContinue,
}: {
  saved: { persona: Stakeholder; failed: { file: File; error?: string }[] };
  busy: boolean;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const who = firstName(saved.persona.name);
  return (
    <section role="alert" className="rounded-2xl border border-hairline bg-surface-card p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span aria-hidden className="material-symbols-outlined text-[18px] text-success">check_circle</span>
        {saved.persona.name} is saved.
      </p>
      <p className="mt-2 text-sm text-muted">
        {saved.failed.length === 1 ? "One file" : `${saved.failed.length} files`} didn&apos;t make it into {who}&apos;s knowledge base:
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {saved.failed.map((f) => (
          <li key={f.file.name} className="text-error">
            <span className="font-semibold">{f.file.name}</span>: {f.error}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-hairline px-4 text-ink transition hover:bg-ink/5 disabled:opacity-60"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={busy}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-full bg-primary px-5 text-on-dark transition hover:bg-primary-active disabled:opacity-60"
        >
          Continue without {saved.failed.length === 1 ? "it" : "them"}
        </button>
      </div>
    </section>
  );
}
