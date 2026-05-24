"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

interface EventLogEntry {
  t: number;
  text: string;
  type: string;
}

interface EventLogProps {
  events: EventLogEntry[];
}

const TYPE_COLORS: Record<string, string> = {
  agent: "text-canvas/85",
  tool: "text-accent-teal",
  alert: "text-primary",
};

export function EventLog({ events }: EventLogProps) {
  const cursorRef = useRef<HTMLSpanElement>(null);
  const eventContainerRef = useRef<HTMLDivElement>(null);

  // Scroll container to bottom on new events (scrollTop only, never scrollIntoView — which scrolls parent containers)
  useEffect(() => {
    if (eventContainerRef.current) {
      eventContainerRef.current.scrollTop = eventContainerRef.current.scrollHeight;
    }
  }, [events.length]);

  // Blinking cursor animation with GSAP
  useEffect(() => {
    if (!cursorRef.current) return;
    gsap.to(cursorRef.current, {
      opacity: 0.2,
      duration: 0.6,
      repeat: -1,
      yoyo: true,
      ease: "steps(1)",
    });
    return () => { gsap.killTweensOf(cursorRef.current); };
  }, []);

  // New event slide-in animation
  useEffect(() => {
    if (events.length === 0) return;
    const container = eventContainerRef.current;
    if (!container) return;
    const newEvents = container.querySelectorAll("[data-anim='event']");
    if (newEvents.length > 0) {
      const lastEvent = newEvents[newEvents.length - 1] as HTMLElement;
      gsap.fromTo(
        lastEvent,
        { x: -8, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.3, ease: "power2.out", clearProps: "x" },
      );
    }
  }, [events.length]);

  return (
    <div className="rounded-xl bg-surface-dark px-[18px] py-4">
      <div className="mb-[10px] flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-on-dark-soft">
          Event stream
        </span>
        <div className="flex gap-[6px]">
          {["#a09d96", "#a09d96", "#cc785c"].map((c, i) => (
            <div key={i} className="h-[7px] w-[7px] rounded-full" style={{ background: c }} />
          ))}
        </div>
      </div>
      <div ref={eventContainerRef} className="max-h-[200px] overflow-y-auto font-mono text-[12px] leading-[1.7] text-canvas">
        {events.map((e, i) => (
          <div
            key={i}
            data-anim="event"
            className="flex gap-[10px]"
            style={{ opacity: 0 }}
          >
            <span className="min-w-[28px] text-on-dark-soft">T{String(e.t).padStart(2, "0")}</span>
            <span className={TYPE_COLORS[e.type] ?? "text-on-dark-soft"}>{e.text}</span>
          </div>
        ))}
        {events.length === 0 && (
          <span className="text-on-dark-soft">Awaiting events…</span>
        )}
        <span className="inline-block text-primary" ref={cursorRef}>▌</span>
      </div>
    </div>
  );
}
