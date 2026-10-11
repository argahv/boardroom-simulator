"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, LABEL, Spinner } from "@/components/room/ui";
import { createSimulation, fetchSimulation } from "@/lib/api";
import { availableTwists, buildTwist, editHref, runHref, type TwistId, type TwistOption } from "@/lib/twists";
import type { SimulationConfig } from "@/lib/types";

export type TwistMenuProps = {
  simulationId: string;
  /** The run's setup; when left out (list cards) it is loaded on mount. */
  config?: SimulationConfig | null;
  /** The seat the user spoke as; the new run opens on it when that person is still at the table. */
  seat?: string | null;
  /** "chips": a compact row under a verdict. "list": one row per twist with what it changes, for a dialog. */
  variant?: "chips" | "list";
  /** Shown above the chips; the list variant leaves the heading to its container. */
  heading?: string;
  className?: string;
};

type Busy = { id: TwistId; step: "drafting" | "starting" | "opening" } | null;

/** Turns a FastAPI error body into one readable line. */
function readable(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  try {
    const detail = (JSON.parse(raw) as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return "The server didn't accept this setup.";
  } catch {
    // Not JSON: a plain message.
  }
  return raw.trim().slice(0, 160) || "Something went wrong.";
}

const BUSY_WORDS: Record<NonNullable<Busy>["step"], string> = {
  drafting: "Finding a skeptic…",
  starting: "Starting…",
  opening: "Opening…",
};

/** "Try again with…": one click builds a new run from this one plus a twist and opens it. */
export function TwistMenu({ simulationId, config, seat, variant = "chips", heading = "Try again with…", className = "" }: TwistMenuProps) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<SimulationConfig | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");

  const setup = config ?? loaded;

  useEffect(() => {
    if (config) return;
    let alive = true;
    fetchSimulation(simulationId)
      .then((sim) => {
        if (!alive) return;
        if (sim.config) setLoaded(sim.config);
        else setLoadError("This run has no saved setup.");
      })
      .catch((err: unknown) => { if (alive) setLoadError(readable(err)); });
    return () => { alive = false; };
  }, [config, simulationId, attempt]);

  const options = useMemo(() => (setup ? availableTwists(setup) : []), [setup]);

  const choose = async (t: TwistOption) => {
    if (!setup || busy) return;
    setError("");
    if (t.id === "edit") {
      setBusy({ id: t.id, step: "opening" });
      router.push(editHref(simulationId));
      return;
    }
    setBusy({ id: t.id, step: t.id === "skeptic" ? "drafting" : "starting" });
    try {
      const next = await buildTwist(t.id, setup);
      setBusy({ id: t.id, step: "starting" });
      const res = await createSimulation(next);
      // Stays busy until the new page replaces this one.
      router.push(runHref(res.simulation_id, next, seat));
    } catch (err) {
      setError(`Couldn't start the new run: ${readable(err)}`);
      setBusy(null);
    }
  };

  if (!setup) {
    return (
      <div className={`text-sm ${className}`} aria-live="polite">
        {loadError ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-error">
            <span>Couldn&apos;t load this setup: {loadError}</span>
            <button
              type="button"
              onClick={() => { setLoadError(""); setAttempt((n) => n + 1); }}
              className="cursor-pointer font-semibold text-ink underline underline-offset-4"
            >
              Try again
            </button>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-muted"><Spinner /> Loading this setup…</p>
        )}
      </div>
    );
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-xs font-semibold text-error">{error}</p>
  );

  if (variant === "list") {
    return (
      <div className={className}>
        <ul className="-mx-1 space-y-0.5">
          {options.map((t) => {
            const mine = busy?.id === t.id;
            return (
              <li key={t.id} className={t.id === "edit" ? "mt-1 border-t border-hairline pt-1" : undefined}>
                <button
                  type="button"
                  onClick={() => choose(t)}
                  disabled={!!busy}
                  aria-busy={mine || undefined}
                  className={`flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-ink/5 disabled:cursor-default ${
                    busy && !mine ? "opacity-50" : ""
                  }`}
                >
                  <span className="mt-0.5 text-muted">
                    {mine ? <Spinner className="h-[18px] w-[18px]" /> : <Icon name={t.icon} className="text-[18px]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{mine ? BUSY_WORDS[busy.step] : t.label}</span>
                    <span className="block text-xs leading-snug text-muted">{t.effect}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {errorLine}
      </div>
    );
  }

  return (
    <div className={className}>
      {heading && <p className={`${LABEL} mb-2`}>{heading}</p>}
      <ul className="flex flex-wrap gap-2 text-sm font-semibold" aria-label={heading || "Try again with"}>
        {options.map((t) => {
          const mine = busy?.id === t.id;
          const edit = t.id === "edit";
          return (
            <li key={t.id} className="min-w-0">
              <button
                type="button"
                onClick={() => choose(t)}
                disabled={!!busy}
                title={t.effect}
                aria-busy={mine || undefined}
                className={`inline-flex min-h-9 max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 transition active:scale-[0.97] disabled:cursor-default ${
                  edit
                    ? "border-transparent text-muted underline-offset-4 hover:text-ink hover:underline"
                    : "border-hairline bg-surface-card text-ink hover:border-ink/30"
                } ${busy && !mine ? "opacity-50" : ""}`}
              >
                {mine ? <Spinner className="h-3.5 w-3.5" /> : <Icon name={t.icon} className="text-[16px] text-muted" />}
                <span className="truncate">{mine ? BUSY_WORDS[busy.step] : t.label}</span>
                <span className="sr-only">: {t.effect}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {errorLine}
    </div>
  );
}
