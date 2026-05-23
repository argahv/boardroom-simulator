"use client";

import { useEffect, useRef } from "react";

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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
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
      <div className="max-h-[200px] overflow-y-auto font-mono text-[12px] leading-[1.7] text-canvas">
        {events.map((e, i) => (
          <div key={i} className="flex gap-[10px]">
            <span className="min-w-[28px] text-on-dark-soft">T{String(e.t).padStart(2, "0")}</span>
            <span className={TYPE_COLORS[e.type] ?? "text-on-dark-soft"}>{e.text}</span>
          </div>
        ))}
        {events.length === 0 && (
          <span className="text-on-dark-soft">Awaiting events…</span>
        )}
        <div ref={endRef}>
          <span className="animate-pulse text-primary" style={{ animation: "pulse 1s steps(2) infinite" }}>▌</span>
        </div>
      </div>
    </div>
  );
}
