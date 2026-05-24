"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

export type AgentEmotions = {
  anger: number;
  fear: number;
  joy: number;
  shame: number;
  surprise: number;
};

export type AgentCardData = {
  id: string;
  name: string;
  role: string;
  stance: string;
  confidence: number;
  certainty: number;
  emotions: AgentEmotions;
};

interface AgentCardProps {
  agent: AgentCardData;
}

const STANCE_COLORS: Record<string, string> = {
  champion:  "var(--color-primary)",
  detractor: "var(--color-error)",
  neutral:   "var(--color-muted)",
  moderator: "var(--color-accent-teal)",
  wildcard:  "var(--color-accent-amber)",
};

const EMOTION_META: Record<string, { label: string; color: string }> = {
  anger:    { label: "Anger",    color: "var(--color-error)" },
  fear:     { label: "Fear",     color: "var(--color-accent-amber)" },
  joy:      { label: "Joy",      color: "var(--color-accent-teal)" },
  shame:    { label: "Shame",    color: "#8b6f9e" },
  surprise: { label: "Surprise", color: "#d49b5a" },
};

function PctBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex-1 h-[5px] rounded-full" style={{ background: "var(--color-hairline)" }}>
      <div
        data-anim="bar"
        className="h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color,
          transition: "width 400ms",
        }}
      />
    </div>
  );
}

export function AgentCard({ agent }: AgentCardProps) {
  const sc = STANCE_COLORS[agent.stance] ?? "var(--color-muted)";
  const cardRef = useRef<HTMLDivElement>(null);
  const stanceRef = useRef<HTMLSpanElement>(null);
  const barsContainerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(cardRef.current, {
        scale: 0.9,
        opacity: 0,
        duration: 0.3,
        ease: "back.out(1.7)",
        clearProps: "transform",
      });
      const bars = barsContainerRef.current?.querySelectorAll("[data-anim='bar']");
      if (bars?.length) {
        gsap.fromTo(
          bars,
          { scaleX: 0, transformOrigin: "left center" },
          { scaleX: 1, duration: 0.4, stagger: 0.04, ease: "power2.out" }
        );
      }
    });
    return () => mm.revert();
  }, { scope: cardRef });

  useGSAP(() => {
    if (!stanceRef.current) return;
    gsap.to(stanceRef.current, {
      background: `${sc}18`,
      color: sc,
      borderColor: `${sc}30`,
      duration: 0.3,
      ease: "power2.out",
    });
  }, { dependencies: [agent.stance], revertOnUpdate: true });

  return (
    <div
      ref={cardRef}
      style={{
        width: 280,
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        borderRadius: 12,
        padding: 16,
        boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p
            className="font-semibold truncate"
            style={{ fontSize: 15, color: "var(--color-ink)" }}
          >
            {agent.name}
          </p>
          <p
            className="truncate mt-[2px]"
            style={{ fontSize: 11, color: "var(--color-muted)" }}
          >
            {agent.role}
          </p>
        </div>
        <span
          ref={stanceRef}
          className="rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.08em] whitespace-nowrap shrink-0"
          style={{
            background: `${sc}18`,
            color: sc,
            border: `1px solid ${sc}30`,
          }}
        >
          {agent.stance}
        </span>
      </div>

      {/* Confidence & Certainty */}
      <div ref={barsContainerRef} className="flex flex-col gap-2 mb-3">
        {(["confidence", "certainty"] as const).map((key) => {
          const val = agent[key];
          const barColor =
            val > 70
              ? "var(--color-accent-teal)"
              : val > 40
                ? "var(--color-accent-amber)"
                : "var(--color-primary)";
          return (
            <div key={key} className="flex items-center gap-2" style={{ fontSize: 11 }}>
              <span style={{ width: 68, color: "var(--color-muted)", textTransform: "capitalize" }}>
                {key}
              </span>
              <PctBar value={val} color={barColor} />
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: 11, color: "var(--color-ink)", minWidth: 32, textAlign: "right" }}
              >
                {Math.round(val)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Emotions */}
      <div className="flex flex-col gap-1.5">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ color: "var(--color-muted)" }}
        >
          Emotions
        </p>
        {Object.entries(EMOTION_META).map(([key, { label, color }]) => {
          const val = (agent.emotions as Record<string, number>)[key] ?? 0;
          return (
            <div key={key} className="flex items-center gap-2" style={{ fontSize: 10 }}>
              <span style={{ width: 52, color: "var(--color-muted)" }}>{label}</span>
              <PctBar value={val * 100} color={color} />
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: 10, color: "var(--color-ink)", minWidth: 24, textAlign: "right" }}
              >
                {(val * 100).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


