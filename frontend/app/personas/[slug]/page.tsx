"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PersonaCard } from "@/components/PersonaCard";
import {
  approveEvolution,
  deleteStakeholder,
  fetchAgentDetail,
  fetchEvolutionHistory,
  fetchPendingEvolutions,
  getStakeholder,
  patchStakeholder,
  rejectEvolution,
  type AgentDetailResponse,
} from "@/lib/api";
import { fromStakeholder, ghostFromEvolutions, normalizePersonality, toStakeholderPatch, type PersonaDraft } from "@/lib/persona";
import type { EvolutionProposal, Stakeholder, StakeholderPatch } from "@/lib/types";
import { errorText, firstName } from "../_lib/files";
import { Knowledge } from "./_parts/Knowledge";
import { Meetings } from "./_parts/Meetings";
import { Memory } from "./_parts/Memory";
import { PendingChanges } from "./_parts/PendingChanges";
import { Research } from "./_parts/Research";

type PageProps = { params: Promise<{ slug: string }> };

export default function PersonaPage({ params }: PageProps) {
  const { slug } = use(params);
  // Keyed so moving between personas starts from fresh state instead of showing the last one.
  return <PersonaDetail key={slug} slug={slug} />;
}

// ── Autosave ───────────────────────────────────────────────────────────

type SaveStatus = "idle" | "waiting" | "saving" | "saved" | "error";

const SAVE_DELAY_MS = 700;

function mergePatch(a: StakeholderPatch, b: StakeholderPatch): StakeholderPatch {
  const out = { ...a, ...b };
  if (a.personality || b.personality) out.personality = { ...a.personality, ...b.personality };
  return out;
}

/** Debounced PATCH of whatever changed; one request at a time, failed fields kept for retry. */
function useAutosave(id: string | null, onSaved: (s: Stakeholder) => void) {
  const queued = useRef<StakeholderPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const onSavedRef = useRef(onSaved);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  /** Sends what's queued now. Resolves false if it couldn't be saved. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (inFlight.current) await inFlight.current;
    const patch = queued.current;
    if (!id || Object.keys(patch).length === 0) return true;
    queued.current = {};
    setStatus("saving");
    let ok = true;
    const run = patchStakeholder(id, patch).then(
      (saved) => {
        onSavedRef.current(saved);
        setError("");
        setStatus(Object.keys(queued.current).length ? "waiting" : "saved");
      },
      (err: unknown) => {
        ok = false;
        // Keep the failed fields, under anything typed since, so the next save carries both.
        queued.current = mergePatch(patch, queued.current);
        setError(errorText(err, "the server didn't answer"));
        setStatus("error");
      },
    );
    inFlight.current = run;
    await run;
    inFlight.current = null;
    return ok;
  }, [id]);

  const queue = useCallback(
    (patch: StakeholderPatch) => {
      if (!Object.keys(patch).length) return;
      queued.current = mergePatch(queued.current, patch);
      setStatus((s) => (s === "error" ? s : "waiting"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  /** Drops queued edits, e.g. when the persona is being deleted. */
  const discard = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queued.current = {};
  }, []);

  // Client-side navigation away sends the last edits instead of losing them.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => void flushRef.current(), []);

  // Closing the tab can't wait for a request, so ask first.
  const unsaved = status === "waiting" || status === "saving" || status === "error";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  return { status, error, queue, flush, discard };
}

function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error: string; onRetry: () => void }) {
  if (status === "error") {
    return (
      <span role="alert" className="flex min-w-0 items-center gap-1.5 text-xs text-error">
        <span aria-hidden className="material-symbols-outlined text-[16px]">error</span>
        <span className="min-w-0 truncate" title={error}>Not saved: {error}</span>
        <span className="font-semibold">
          <button type="button" onClick={onRetry} className="min-h-8 shrink-0 cursor-pointer underline underline-offset-4">
            Retry
          </button>
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted" aria-live="polite">
      {status === "saved" && <span aria-hidden className="material-symbols-outlined text-[16px] text-success">check</span>}
      {status === "waiting" || status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Changes save as you go"}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

type Load = { state: "loading" } | { state: "ready" } | { state: "missing" } | { state: "error"; error: string };

function PersonaDetail({ slug }: { slug: string }) {
  const router = useRouter();
  const [persona, setPersona] = useState<Stakeholder | null>(null);
  const [draft, setDraft] = useState<PersonaDraft | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [reload, setReload] = useState(0);

  const [detail, setDetail] = useState<AgentDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [pending, setPending] = useState<EvolutionProposal[]>([]);
  const [history, setHistory] = useState<EvolutionProposal[]>([]);
  const [evoBusy, setEvoBusy] = useState<string | null>(null);
  const [evoError, setEvoError] = useState("");
  const [docCount, setDocCount] = useState<number | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const id = persona?.id ?? null;
  const save = useAutosave(id, setPersona);

  useEffect(() => {
    let alive = true;
    getStakeholder(slug)
      .then((s) => {
        if (!alive) return;
        setPersona(s);
        setDraft(fromStakeholder(s));
        setLoad({ state: "ready" });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const msg = errorText(err, "Couldn't load this persona.");
        setLoad(/not found/i.test(msg) ? { state: "missing" } : { state: "error", error: msg });
      });
    return () => { alive = false; };
  }, [slug, reload]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    // Meetings, memory and lines come from the agent view; a persona with no runs may 404 there.
    fetchAgentDetail(id)
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => { if (alive) setDetail(null); })
      .finally(() => { if (alive) setDetailLoading(false); });
    Promise.all([
      fetchPendingEvolutions(id).catch(() => [] as EvolutionProposal[]),
      fetchEvolutionHistory(id).catch(() => [] as EvolutionProposal[]),
    ]).then(([p, h]) => {
      if (!alive) return;
      setPending(p);
      setHistory(h);
    });
    return () => { alive = false; };
  }, [id]);

  const onCountChange = useCallback((n: number) => setDocCount(n), []);

  if (load.state !== "ready" || !persona || !draft || !id) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
          <div className="mb-5"><BackLink /></div>
          {load.state === "loading" ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]" aria-busy="true" aria-label="Loading persona">
              <div className="h-[28rem] animate-pulse rounded-2xl border border-hairline bg-surface-card" />
              <div className="space-y-4">
                <div className="h-8 w-48 animate-pulse rounded bg-ink/8" />
                <div className="h-28 animate-pulse rounded-2xl bg-ink/5" />
              </div>
            </div>
          ) : load.state === "missing" ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-surface-card/50 px-6 py-12 text-center">
              <p className="font-display text-2xl font-semibold">This persona isn&apos;t in the library</p>
              <p className="mt-2 text-sm text-muted">It may have been deleted.</p>
              <div className="mt-5 text-sm font-semibold">
                <Link href="/personas" className="inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-on-dark hover:bg-primary-active">
                  Back to the library
                </Link>
              </div>
            </div>
          ) : (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-error-soft px-4 py-3 text-sm text-error">
              <span className="min-w-0 flex-1">{load.state === "error" ? load.error : "Couldn't load this persona."}</span>
              <span className="text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setLoad({ state: "loading" });
                    setReload((n) => n + 1);
                  }}
                  className="min-h-8 cursor-pointer rounded-full border border-error/40 px-3 transition hover:bg-error/10"
                >
                  Try again
                </button>
              </span>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  const who = firstName(draft.name || persona.name);
  const rehearseHref = `/simulate/new?with=${encodeURIComponent(id)}`;
  const ghost = pending.length ? ghostFromEvolutions(pending) : undefined;

  const edit = (patch: Partial<PersonaDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    save.queue(toStakeholderPatch(patch));
  };

  // Approval adds deltas to the saved dials, so unsaved dial edits go first, then the card takes the result.
  const settleEvolutions = async (ids: string[], action: "keep" | "discard") => {
    setEvoBusy(ids.length > 1 ? "all" : ids[0]);
    setEvoError("");
    try {
      if (action === "keep" && !(await save.flush())) {
        setEvoError("Your last edits haven't saved yet. Retry saving, then keep the change.");
        return;
      }
      for (const evoId of ids) {
        if (action === "keep") await approveEvolution(evoId);
        else await rejectEvolution(evoId);
        setPending((p) => p.filter((e) => e.id !== evoId));
        setHistory((h) => h.map((e) => (e.id === evoId ? { ...e, status: action === "keep" ? "approved" : "rejected" } : e)));
      }
      if (action === "keep") {
        const fresh = await getStakeholder(id);
        setPersona(fresh);
        setDraft((d) => (d ? { ...d, personality: normalizePersonality(fresh.personality) } : d));
      }
    } catch {
      setEvoError(action === "keep" ? "Couldn't keep that change. Try again." : "Couldn't discard that change. Try again.");
      // Another tab may have settled it; show what's actually still pending.
      fetchPendingEvolutions(id).then(setPending).catch(() => {});
    } finally {
      setEvoBusy(null);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setDeleteError("");
    save.discard();
    try {
      await deleteStakeholder(id);
      router.push("/personas");
    } catch (err) {
      setDeleteError(errorText(err, "Couldn't delete. Try again."));
      setDeleting(false);
    }
  };

  const meetings = persona.sim_count ?? 0;
  const turns = persona.total_turns ?? 0;
  const docs = docCount ?? persona.document_count ?? 0;
  const memories = detail?.stats.total_memories ?? 0;
  const stats = [
    meetings ? `${meetings} meeting${meetings === 1 ? "" : "s"}` : "No meetings yet",
    turns ? `${turns} turns` : "",
    memories ? `${memories} memories` : "",
    docs ? `${docs} document${docs === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");

  const hasPending = pending.length > 0;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <BackLink />
          <div className="ml-auto flex min-w-0 items-center">
            <SaveIndicator status={save.status} error={save.error} onRetry={() => void save.flush()} />
          </div>
          <div className="text-sm font-semibold">
            <Link
              href={rehearseHref}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-on-dark transition hover:bg-primary-active"
            >
              <span aria-hidden className="material-symbols-outlined text-[18px]">play_arrow</span>
              Rehearse with {who}
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-8">
          {hasPending && (
            <PendingChanges
              className="lg:col-start-2 lg:row-start-1"
              pending={pending}
              personality={draft.personality}
              who={who}
              busy={evoBusy}
              error={evoError}
              onKeep={(e) => void settleEvolutions([e.id], "keep")}
              onDiscard={(e) => void settleEvolutions([e.id], "discard")}
              onKeepAll={() => void settleEvolutions([...pending].reverse().map((e) => e.id), "keep")}
            />
          )}

          <aside
            aria-label={`${draft.name || "Persona"} card`}
            className={`min-w-0 lg:sticky lg:top-20 lg:col-start-1 lg:row-start-1 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-2 ${hasPending ? "lg:row-span-2" : ""}`}
          >
            <PersonaCard
              value={draft}
              onChange={edit}
              ghost={ghost}
              error={draft.name.trim() ? undefined : "Needs a name before the name can be saved"}
              actions={
                confirmDelete ? (
                  <div className="flex w-full flex-wrap items-center gap-2" role="alertdialog" aria-label={`Delete ${draft.name}?`}>
                    <span className="min-w-0 flex-1 text-xs font-normal text-ink">
                      Delete {who} from the library? Past simulations keep their transcripts.
                    </span>
                    <span className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => void remove()}
                        disabled={deleting}
                        className="min-h-8 cursor-pointer rounded-full bg-error px-4 text-on-dark disabled:opacity-60"
                      >
                        {deleting ? "Deleting..." : "Delete"}
                      </button>
                      <button
                        type="button"
                        autoFocus
                        onClick={() => { setConfirmDelete(false); setDeleteError(""); }}
                        disabled={deleting}
                        className="min-h-8 cursor-pointer rounded-full border border-hairline px-4 text-ink hover:bg-ink/5"
                      >
                        Keep
                      </button>
                    </span>
                    {deleteError && <span role="alert" className="w-full text-xs text-error">{deleteError}</span>}
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 text-xs font-normal text-muted">{stats}</span>
                    <span className="text-xs">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full px-2.5 text-muted transition hover:bg-error-soft hover:text-error"
                      >
                        <span aria-hidden className="material-symbols-outlined text-[16px]">delete</span>
                        Delete
                      </button>
                    </span>
                  </>
                )
              }
            />
          </aside>

          <div className={`min-w-0 space-y-10 lg:col-start-2 ${hasPending ? "lg:row-start-2" : "lg:row-start-1"}`}>
            <Knowledge personaId={id} who={who} onCountChange={onCountChange} />
            <Meetings personaId={id} who={who} detail={detail} history={history} loading={detailLoading} rehearseHref={rehearseHref} />
            <Memory detail={detail} who={who} />
            <Research personaId={id} who={who} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function BackLink() {
  return (
    <Link href="/personas" className="inline-flex min-h-8 items-center gap-1 text-xs text-muted transition hover:text-ink">
      <span aria-hidden className="material-symbols-outlined text-[14px]">arrow_back</span>
      Personas
    </Link>
  );
}
