"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { actionLabel } from "@/components/ActionGlyph";

interface EventLogEntry {
  t: number;
  text: string;
  // An agent action type (statement, challenge, vote…), "human", a system subtype
  // (vote_called, roll_call, departure, external_event, time_pressure, goal_shift,
  // turn_timeout), "system" or "outcome".
  type: string;
  full?: string;
}

interface EventLogProps {
  events: EventLogEntry[];
}

type Category = "speech" | "clash" | "room" | "outcome";

type RowStyle = { tag: string; color: string; category: Category; strong?: boolean };

const CATEGORY_DOT: Record<Category, string> = {
  speech: "var(--color-on-dark-soft)",
  clash: "var(--color-primary)",
  room: "var(--color-accent-amber)",
  outcome: "var(--color-accent-teal)",
};

const CATEGORY_LABEL: Record<Category, string> = {
  speech: "said",
  clash: "clashes",
  room: "room",
  outcome: "outcome",
};

const STYLES: Record<string, RowStyle> = {
  statement: { tag: "", color: "text-on-dark", category: "speech" },
  question: { tag: "", color: "text-on-dark", category: "speech" },
  custom: { tag: "", color: "text-on-dark", category: "speech" },
  agent: { tag: "Said", color: "text-on-dark", category: "speech" },
  compromise: { tag: "", color: "text-accent-teal", category: "speech" },
  agreement: { tag: "", color: "text-accent-teal", category: "speech" },
  coalition_signal: { tag: "", color: "text-accent-teal", category: "speech" },
  challenge: { tag: "", color: "text-primary", category: "clash" },
  escalate: { tag: "", color: "text-primary", category: "clash" },
  interrupt: { tag: "", color: "text-primary", category: "clash" },
  walkaway: { tag: "Walkaway", color: "text-accent-amber", category: "clash", strong: true },
  vote: { tag: "Vote", color: "text-accent-blue", category: "speech" },
  human: { tag: "Human", color: "text-on-dark", category: "speech", strong: true },
  vote_called: { tag: "Vote called", color: "text-accent-amber", category: "room", strong: true },
  roll_call: { tag: "Roll call", color: "text-on-dark-soft", category: "room" },
  departure: { tag: "Walkout", color: "text-accent-amber", category: "room", strong: true },
  external_event: { tag: "⚡ Event", color: "text-accent-amber", category: "room", strong: true },
  time_pressure: { tag: "Clock", color: "text-primary", category: "room" },
  goal_shift: { tag: "Goal shift", color: "text-accent-blue", category: "room" },
  turn_timeout: { tag: "Timeout", color: "text-on-dark-soft", category: "room" },
  system: { tag: "Room", color: "text-on-dark-soft", category: "room" },
  outcome: { tag: "Outcome", color: "text-on-dark", category: "outcome", strong: true },
};

function styleFor(type: string): RowStyle {
  const s = STYLES[type] ?? { tag: "", color: "text-on-dark", category: "speech" as const };
  return s.tag ? s : { ...s, tag: actionLabel(type) };
}

export function EventLog({ events }: EventLogProps) {
  const cursorRef = useRef<HTMLSpanElement>(null);
  const eventContainerRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef<number | null>(null);

  // Scroll container to bottom on new events (scrollTop only, never scrollIntoView — which scrolls parent containers)
  useEffect(() => {
    if (eventContainerRef.current) {
      eventContainerRef.current.scrollTop = eventContainerRef.current.scrollHeight;
    }
  }, [events.length]);

  // Blinking cursor animation with GSAP
  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    gsap.to(cursor, {
      opacity: 0.2,
      duration: 0.6,
      repeat: -1,
      yoyo: true,
      ease: "steps(1)",
    });
    return () => { gsap.killTweensOf(cursor); };
  }, []);

  // Rows render visible; only rows appended since the last render slide in. A mount or a
  // bulk load (reload, replay, layout switch) shows everything at once.
  useEffect(() => {
    const prev = shownRef.current;
    shownRef.current = events.length;
    const container = eventContainerRef.current;
    if (prev === null || !container || events.length <= prev || events.length - prev > 3) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-anim='event']")).slice(prev);
    if (rows.length === 0) return;
    gsap.fromTo(
      rows,
      { x: -8, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.3, ease: "power2.out", stagger: 0.05, clearProps: "transform,opacity" },
    );
  }, [events.length]);

  const counts: Record<Category, number> = { speech: 0, clash: 0, room: 0, outcome: 0 };
  for (const e of events) counts[styleFor(e.type).category] += 1;

  return (
    <div className="rounded-xl bg-surface-dark px-[18px] py-4">
      <div className="mb-[10px] flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-on-dark-soft">
          Event stream
        </span>
        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 font-mono text-[10px] text-on-dark-soft">
          {(Object.keys(counts) as Category[])
            .filter((c) => counts[c] > 0)
            .map((c) => (
              <span key={c} className="inline-flex items-center gap-[5px]" title={`${counts[c]} ${CATEGORY_LABEL[c]}`}>
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: CATEGORY_DOT[c] }} />
                {counts[c]} {CATEGORY_LABEL[c]}
              </span>
            ))}
        </div>
      </div>
      <div ref={eventContainerRef} className="max-h-[200px] overflow-y-auto font-mono text-[12px] leading-[1.7] text-canvas">
        {events.map((e, i) => {
          const s = styleFor(e.type);
          return (
            <div key={i} data-anim="event" data-type={e.type} className="flex gap-[10px]">
              <span className="min-w-[28px] shrink-0 text-on-dark-soft">T{String(e.t).padStart(2, "0")}</span>
              <span
                className={`min-w-[84px] shrink-0 text-[10px] uppercase leading-[2] tracking-[0.08em] ${s.color} ${s.strong ? "font-bold" : ""}`}
              >
                {s.tag}
              </span>
              <span
                className={`min-w-0 ${s.category === "room" || s.category === "outcome" ? s.color : "text-on-dark"} ${s.strong ? "font-semibold" : ""}`}
                title={e.full ?? e.text}
              >
                {e.text}
              </span>
            </div>
          );
        })}
        {events.length === 0 && (
          <span className="text-on-dark-soft">Awaiting events…</span>
        )}
        <span className="inline-block text-primary" ref={cursorRef}>▌</span>
      </div>
    </div>
  );
}
