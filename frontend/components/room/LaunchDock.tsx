"use client";

import type { ReactNode } from "react";
import { Icon, Spinner } from "./ui";

export type LaunchDockProps = {
  /** Why Start can't run yet; null when it can. */
  blocker: string | null;
  summary: string;
  /** A suggestion that never blocks, e.g. "Nobody's against this". */
  nudge?: ReactNode;
  starting: boolean;
  startError: string;
  onStart: () => void;
  /** The refine bar only exists once there is a room to change. */
  refine?: {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    busy: boolean;
  };
  canUndo: boolean;
  onUndo: () => void;
};

/** Pinned to the bottom: change the room in words, undo, and start. */
export function LaunchDock({ blocker, summary, nudge, starting, startError, onStart, refine, canUndo, onUndo }: LaunchDockProps) {
  const disabled = !!blocker || starting;
  return (
    <div className="sticky bottom-0 z-40 -mx-4 mt-8 border-t border-hairline bg-canvas/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
        {refine && (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); if (refine.value.trim() && !refine.busy) refine.onSubmit(); }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-hairline bg-surface-card px-3.5 text-sm focus-within:border-primary">
              {refine.busy ? <Spinner className="text-primary" /> : <Icon name="edit_note" className="text-[20px] text-muted" />}
              <input
                value={refine.value}
                onChange={(e) => refine.onChange(e.target.value)}
                disabled={refine.busy}
                aria-label="Change anything in words"
                placeholder={refine.busy ? "Reworking the room…" : "Change anything: “make Bob angrier”, “add a lawyer”"}
                className="min-h-11 min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted/60"
              />
            </div>
            <span className="shrink-0 text-sm font-semibold">
              <button
                type="submit"
                disabled={!refine.value.trim() || refine.busy}
                aria-label="Apply change"
                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-hairline bg-surface-card text-ink transition hover:border-primary hover:text-primary"
              >
                <Icon name="arrow_upward" className="text-[20px]" />
              </button>
            </span>
          </form>
        )}

        <div className="flex min-w-0 items-center gap-2 sm:gap-3 lg:flex-none">
          {canUndo && (
            <span className="shrink-0 text-sm font-semibold">
              <button
                type="button"
                onClick={onUndo}
                title="Undo (Ctrl/⌘ + Z)"
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full px-3 text-muted transition hover:bg-ink/5 hover:text-ink"
              >
                <Icon name="undo" className="text-[18px]" /> Undo
              </button>
            </span>
          )}
          <div className="min-w-0 flex-1 text-right lg:max-w-xs" aria-live="polite">
            {startError ? (
              <p className="line-clamp-2 text-xs font-semibold text-error">{startError}</p>
            ) : blocker ? (
              <p className="text-xs font-semibold text-ink">{blocker}</p>
            ) : null}
            {nudge && <div className="text-xs text-body-strong">{nudge}</div>}
            {!startError && !blocker && !nudge && <p className="truncate text-xs text-muted">{summary}</p>}
          </div>
          <span className="shrink-0 text-sm font-semibold">
            <button
              type="button"
              onClick={onStart}
              disabled={disabled}
              aria-describedby={blocker ? "start-why" : undefined}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-primary px-5 text-white shadow-sm transition hover:bg-primary-active active:scale-[0.97]"
            >
              {starting ? <Spinner /> : <Icon name="play_arrow" className="text-[20px]" />}
              {starting ? "Starting…" : "Start meeting"}
              <span className="hidden font-mono text-[10px] font-normal opacity-75 xl:inline" aria-hidden>⌘↵</span>
            </button>
          </span>
          {blocker && <span id="start-why" className="sr-only">Can&apos;t start yet: {blocker}</span>}
        </div>
      </div>
    </div>
  );
}
