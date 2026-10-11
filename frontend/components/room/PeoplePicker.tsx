"use client";

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { StanceRing } from "@/components/PersonaCard";
import { draftPersona } from "@/lib/api";
import { behaviourLine, emptyPersona, fromDraft, fromStakeholder } from "@/lib/persona";
import type { AgentStance, Stakeholder } from "@/lib/types";
import { looksLikeDescription, parseNameRole, seatFromDraft, seatFromStakeholder, suggestStance, type Seat } from "./model";
import { Icon, Spinner } from "./ui";

type Option =
  | { kind: "library"; person: Stakeholder }
  | { kind: "quick"; name: string; role: string }
  | { kind: "describe" };

export type PeoplePickerProps = {
  /** Library people not already at the table. */
  library: Stakeholder[];
  /** Who is seated, to choose a new person's starting side. */
  seats: Seat[];
  onPick: (seat: Seat, note?: string) => void;
  /** Force the side (a swap keeps the seat's side); otherwise library people keep theirs and new ones fill the gap. */
  stance?: AgentStance;
  autoFocus?: boolean;
  placeholder?: string;
  onCancel?: () => void;
};

/**
 * One field for the three ways to fill a chair: pick from the library, type "Name, role",
 * or describe someone and let the AI draft them.
 */
export function PeoplePicker({ library, seats, onPick, stance, autoFocus, placeholder, onCancel }: PeoplePickerProps) {
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const options = useMemo<Option[]>(() => {
    const text = q.trim();
    const needle = text.toLowerCase();
    const matches = library
      .filter((s) => !needle || `${s.name} ${s.role}`.toLowerCase().includes(needle))
      .slice(0, text ? 4 : 5)
      .map((person): Option => ({ kind: "library", person }));
    if (!text) return matches;
    const quick = parseNameRole(text);
    const quickOpt: Option[] = quick ? [{ kind: "quick", ...quick }] : [];
    const describe: Option[] = text.length >= 3 ? [{ kind: "describe" }] : [];
    return looksLikeDescription(text) ? [...describe, ...matches, ...quickOpt] : [...matches, ...quickOpt, ...describe];
  }, [library, q]);

  const showList = open && !busy && options.length > 0;
  const current = Math.min(active, Math.max(0, options.length - 1));

  const reset = () => { setQ(""); setActive(0); };

  const choose = async (opt: Option | undefined) => {
    if (!opt) return;
    const text = q.trim();
    if (opt.kind === "library") {
      onPick(seatFromStakeholder(opt.person, stance));
      reset();
      return;
    }
    if (opt.kind === "quick") {
      onPick(seatFromDraft(emptyPersona({ name: opt.name, role: opt.role, stance: stance ?? suggestStance(seats) })));
      reset();
      return;
    }
    setBusy(true);
    try {
      const res = await draftPersona(text);
      const p = fromDraft(res.persona);
      onPick(seatFromDraft({ ...p, stance: stance ?? p.stance }, res.guessed));
      reset();
    } catch {
      // The drafting service is unreachable: seat them as written rather than lose what was typed.
      const quick = parseNameRole(text);
      onPick(
        seatFromDraft(emptyPersona({
          name: quick?.name ?? "New person",
          role: quick?.role ?? "",
          backstory: quick ? "" : text,
          stance: stance ?? suggestStance(seats),
        }), quick ? undefined : ["name"]),
        "Couldn't reach the drafting service, so they're seated as written. Open the seat to fill in the rest.",
      );
      reset();
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const listId = `${ids}-list`;
  const optionId = (i: number) => `${ids}-opt-${i}`;

  return (
    <div
      ref={boxRef}
      className="relative min-w-0"
      onBlur={(e) => { if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <div className="text-sm">
        <div className={`flex items-center gap-2 rounded-xl border bg-surface-card px-3 transition ${busy ? "border-primary/40" : "border-hairline focus-within:border-primary"}`}>
          {busy ? <Spinner className="text-primary" /> : <Icon name="person_search" className="text-[18px] text-muted" />}
          <input
            ref={inputRef}
            value={q}
            disabled={busy}
            onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, options.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                if (q.trim() || showList) void choose(options[current]);
              } else if (e.key === "Escape") {
                if (q) reset(); else { setOpen(false); onCancel?.(); }
              }
            }}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList ? optionId(current) : undefined}
            aria-label="Seat someone: search your people, type a name and role, or describe them"
            placeholder={busy ? "Drafting someone from your description…" : placeholder ?? "Search, or type “Dana Okafor, CFO”"}
            className="min-h-11 min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted/60"
          />
        </div>
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Ways to fill this chair"
          className="mt-1.5 overflow-hidden rounded-xl border border-hairline bg-surface-card-elevated text-sm shadow-sm"
        >
          {options.map((opt, i) => {
            const isActive = i === current;
            const base = `flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-2 ${isActive ? "bg-primary-soft" : "hover:bg-ink/[0.04]"}`;
            const common = {
              id: optionId(i),
              role: "option" as const,
              "aria-selected": isActive,
              // mousedown, so the input doesn't blur and close the list first.
              onMouseDown: (e: MouseEvent) => e.preventDefault(),
              onMouseEnter: () => setActive(i),
              onClick: () => void choose(opt),
              className: base,
            };
            if (opt.kind === "library") {
              const p = fromStakeholder(opt.person);
              return (
                <li key={`lib-${opt.person.id}`} {...common}>
                  <StanceRing stance={p.stance} name={p.name} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">
                      {p.name}
                      {p.role && <span className="font-normal text-muted"> · {p.role}</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">{behaviourLine(p)}</span>
                  </span>
                  <span className="hidden shrink-0 text-[10px] text-muted sm:inline">Your people</span>
                </li>
              );
            }
            if (opt.kind === "quick") {
              return (
                <li key="quick" {...common}>
                  <Icon name="person_add" className="w-7 text-center text-[18px] text-muted" />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    Seat <span className="font-semibold">{opt.name}</span>
                    {opt.role ? <span className="text-muted"> as {opt.role}</span> : <span className="text-muted"> (add a role later)</span>}
                  </span>
                </li>
              );
            }
            return (
              <li key="describe" {...common}>
                <Icon name="auto_awesome" className="w-7 text-center text-[18px] text-primary" />
                <span className="min-w-0 flex-1 text-ink">
                  <span className="font-semibold">Draft someone</span>
                  <span className="text-muted"> from “{q.trim().length > 48 ? `${q.trim().slice(0, 48)}…` : q.trim()}”</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
