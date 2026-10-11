"use client";

import { useEffect, useState } from "react";
import { deletePersonaDocument, listPersonaDocuments, queryPersonaKnowledge } from "@/lib/api";
import type { DocumentMeta, KnowledgeQueryResult } from "@/lib/types";
import { DropZone } from "../../_lib/DropZone";
import { MAX_DOCS, checkFiles, errorText, formatSize, uploadFiles } from "../../_lib/files";

const STATUS: Record<DocumentMeta["status"], { label: string; cls: string }> = {
  ready: { label: "Ready", cls: "bg-success-soft text-success" },
  pending: { label: "Reading", cls: "bg-warning-soft text-body-strong" },
  failed: { label: "No text found", cls: "bg-error-soft text-error" },
};

type Props = {
  personaId: string;
  who: string;
  onCountChange?: (n: number) => void;
};

export function Knowledge({ personaId, who, onCountChange }: Props) {
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ q: string; result: KnowledgeQueryResult } | null>(null);
  const [askError, setAskError] = useState("");

  useEffect(() => {
    let alive = true;
    listPersonaDocuments(personaId)
      .then((d) => { if (alive) setDocs(d); })
      .catch((err: unknown) => { if (alive) setLoadError(errorText(err, "Couldn't load documents.")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [personaId]);

  useEffect(() => {
    if (!loading) onCountChange?.(docs.length);
  }, [docs.length, loading, onCountChange]);

  const add = async (incoming: File[]) => {
    const { ok, problems: found } = checkFiles(incoming, MAX_DOCS - docs.length);
    setProblems(found);
    if (!ok.length) return;
    const results = await uploadFiles(personaId, ok, (i, f) =>
      setUploading(`Adding ${ok.length > 1 ? `${i + 1} of ${ok.length}: ` : ""}${f.name}`),
    );
    setUploading("");
    const failed = results.filter((r) => r.error).map((r) => `${r.file.name}: ${r.error}`);
    if (failed.length) setProblems((p) => [...p, ...failed]);
    try {
      setDocs(await listPersonaDocuments(personaId));
    } catch {
      // The upload worked; the list refreshes on the next visit.
    }
  };

  const remove = async (doc: DocumentMeta) => {
    setDeletingId(doc.id);
    try {
      await deletePersonaDocument(personaId, doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      setConfirmId(null);
    } catch (err) {
      setProblems([`${doc.filename}: ${errorText(err, "couldn't delete it")}`]);
    } finally {
      setDeletingId(null);
    }
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setAskError("");
    try {
      setAnswer({ q, result: await queryPersonaKnowledge(personaId, q) });
    } catch (err) {
      setAskError(errorText(err, "Couldn't search the documents. Try again."));
    } finally {
      setAsking(false);
    }
  };

  const ready = docs.some((d) => d.status === "ready");
  const full = docs.length >= MAX_DOCS;

  return (
    <section aria-labelledby="knowledge-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="knowledge-title" className="font-display text-2xl font-semibold tracking-display">What {who} knows</h2>
        {docs.length > 0 && <span className="shrink-0 font-mono text-[11px] text-muted">{docs.length} of {MAX_DOCS} documents</span>}
      </div>

      {ready && (
        <div className="mb-4">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1 text-sm">
              <input
                type="search"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void ask(); }}
                placeholder={`What does ${who} know about...?`}
                aria-label={`Ask what ${who} knows`}
                className="w-full rounded-full border border-hairline bg-surface-card px-4 py-2.5 text-ink outline-none transition placeholder:text-muted/70 focus:border-primary"
              />
            </div>
            <div className="text-sm font-semibold">
              <button
                type="button"
                onClick={() => void ask()}
                disabled={asking || !question.trim()}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-ink px-4 text-on-dark transition hover:bg-surface-dark disabled:opacity-50"
              >
                {asking ? "Looking..." : "Ask"}
              </button>
            </div>
          </div>
          {askError && <p role="alert" className="mt-2 text-xs text-error">{askError}</p>}
          {answer && (
            <div className="mt-3 space-y-2" aria-live="polite">
              {answer.result.results.length === 0 ? (
                <p className="text-sm text-muted">Nothing in {who}&apos;s documents about &ldquo;{answer.q}&rdquo;.</p>
              ) : (
                answer.result.results.map((chunk) => {
                  const file = chunk.metadata?.filename ?? chunk.metadata?.source;
                  return (
                    <blockquote key={chunk.chunk_id} className="rounded-xl border-l-2 border-accent-teal bg-surface-card px-3 py-2">
                      <p className="line-clamp-6 text-sm leading-relaxed text-body-strong">{chunk.text}</p>
                      <footer className="mt-1 flex gap-2 font-mono text-[10px] text-muted">
                        {typeof file === "string" && <span className="min-w-0 truncate">{file}</span>}
                        <span className="shrink-0">{Math.round(chunk.score * 100)}% match</span>
                      </footer>
                    </blockquote>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {loadError ? (
        <p role="alert" className="rounded-xl bg-error-soft px-3 py-2 text-sm text-error">{loadError}</p>
      ) : (
        <DropZone
          onFiles={(f) => void add(f)}
          disabled={!!uploading || full}
          className="rounded-2xl border border-dashed border-ink/20 bg-surface-card/50 p-3 transition"
          overClassName="border-primary bg-primary-soft"
        >
          {({ open, over }) => (
            <>
              {docs.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {docs.map((doc) => (
                    <li key={doc.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-surface-card px-3 py-2 text-sm">
                      <span aria-hidden className="material-symbols-outlined text-[16px] text-muted">description</span>
                      <span className="min-w-0 flex-1 truncate text-ink" title={doc.filename}>{doc.filename}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS[doc.status]?.cls ?? STATUS.pending.cls}`}>
                        {STATUS[doc.status]?.label ?? doc.status}
                      </span>
                      <span className="hidden font-mono text-[10px] text-muted sm:inline">{formatSize(doc.size_bytes)}</span>
                      {confirmId === doc.id ? (
                        <span className="flex items-center gap-1 text-xs font-semibold">
                          <span className="text-muted">Delete?</span>
                          <button
                            type="button"
                            onClick={() => void remove(doc)}
                            disabled={deletingId === doc.id}
                            className="min-h-8 cursor-pointer rounded-full bg-error px-3 text-on-dark disabled:opacity-60"
                          >
                            {deletingId === doc.id ? "..." : "Delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            autoFocus
                            className="min-h-8 cursor-pointer rounded-full px-2 text-muted hover:text-ink"
                          >
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmId(doc.id)}
                          aria-label={`Delete ${doc.filename}`}
                          title="Delete"
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-error-soft hover:text-error"
                        >
                          <span aria-hidden className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {loading ? (
                <p className="flex items-center gap-2 px-1 py-3 text-sm text-muted">
                  <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Loading documents...
                </p>
              ) : uploading ? (
                <p className="flex items-center gap-2 px-1 py-3 text-sm text-muted" aria-live="polite">
                  <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-primary" /> {uploading}...
                </p>
              ) : full ? (
                <p className="px-1 py-2 text-xs text-muted">That&apos;s the limit of {MAX_DOCS}. Delete one to add another.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2 text-sm text-muted">
                  <span aria-hidden className="material-symbols-outlined text-[20px]">{over ? "file_download" : "upload_file"}</span>
                  <span className="min-w-0 flex-1">
                    {over
                      ? "Drop to add"
                      : docs.length
                        ? `Drop more of what ${who} would have read`
                        : `Drop what ${who} would have read: memos, emails, a bio. ${who} will draw on it in meetings.`}
                  </span>
                  <span className="text-xs font-semibold">
                    <button
                      type="button"
                      onClick={open}
                      className="min-h-8 cursor-pointer rounded-full border border-hairline bg-surface-card px-3 text-ink transition hover:border-ink/30"
                    >
                      Choose files
                    </button>
                  </span>
                </div>
              )}
            </>
          )}
        </DropZone>
      )}
      {problems.length > 0 && (
        <ul role="alert" className="mt-2 space-y-0.5 text-xs text-error">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
    </section>
  );
}
