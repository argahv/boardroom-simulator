"use client";

import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Avatar, initialsFromName } from "@/components/Avatar";
import { ActionGlyph, actionLabel } from "@/components/ActionGlyph";

gsap.registerPlugin(useGSAP);

export type Turn = {
  // Row position in the transcript.
  turn_index: number;
  // The room's turn clock (0-based, matches state snapshots); system rows inherit the last agent turn's.
  turn_number: number;
  speaker: string;
  content: string;
  kind: "agent" | "system";
  speaker_role?: string;
  stance?: string;
  reasoning?: string;
  action_type?: string;
  agent_id?: string;
  directed_at?: string | null;
  directed_at_name?: string | null;
  vote?: string | null;
  is_human?: boolean;
  subtype?: string;
  target_agent?: string;
  _index?: number;
  agent_name?: string;
  agent_role?: string;
  internal_reasoning?: string;
};

const STANCE_TEXT: Record<string, string> = {
  champion: "text-primary",
  detractor: "text-error",
};

const VOTE_CHIP: Record<string, string> = {
  yes: "bg-secondary/15 text-secondary",
  no: "bg-error-soft text-error",
  abstain: "bg-ink/10 text-muted",
};

type SystemStyle = { icon: string; row: string; text: string; iconClass: string };

const SYSTEM_STYLES: Record<string, SystemStyle> = {
  vote_called: {
    icon: "gavel",
    row: "my-1 rounded-lg border border-ink/15 bg-surface-card px-2",
    text: "font-semibold text-ink",
    iconClass: "text-ink",
  },
  roll_call: { icon: "how_to_vote", row: "", text: "text-muted", iconClass: "text-muted" },
  departure: {
    icon: "logout",
    row: "my-1 rounded-lg border-l-2 border-accent-amber bg-accent-amber/10 px-2",
    text: "font-semibold text-warning",
    iconClass: "text-accent-amber",
  },
  external_event: {
    icon: "⚡",
    row: "my-1 rounded-lg border border-accent-amber/50 bg-accent-amber/15 px-2",
    text: "font-semibold text-ink",
    iconClass: "text-warning",
  },
  time_pressure: { icon: "hourglass_bottom", row: "", text: "font-medium text-primary", iconClass: "text-primary" },
  goal_shift: { icon: "alt_route", row: "", text: "italic text-muted", iconClass: "text-accent-blue" },
  turn_timeout: { icon: "timer_off", row: "", text: "italic text-muted", iconClass: "text-muted" },
};

const GENERIC_SYSTEM: SystemStyle = { icon: "⚙", row: "opacity-65", text: "italic text-muted", iconClass: "text-muted" };

function SystemRow({ t }: { t: Turn }) {
  const style = (t.subtype && SYSTEM_STYLES[t.subtype]) || GENERIC_SYSTEM;
  // Material Symbols names are words; anything else is a literal glyph.
  const isSymbol = /^[a-z_]+$/.test(style.icon);
  const content = t.subtype === "external_event" ? t.content.replace(/^⚡\s*/, "") : t.content;
  return (
    <div className={`flex items-start gap-3 py-[6px] ${style.row}`} data-subtype={t.subtype ?? "system"}>
      <div className={`flex w-8 shrink-0 items-center justify-center pt-[1px] ${style.iconClass}`}>
        {isSymbol ? (
          <span className="material-symbols-outlined text-[16px]" aria-hidden>{style.icon}</span>
        ) : (
          <span className="text-[14px]" aria-hidden>{style.icon}</span>
        )}
      </div>
      <p className={`min-w-0 flex-1 text-[12px] leading-[1.5] ${style.text}`}>{content}</p>
    </div>
  );
}

interface TranscriptStreamProps {
  turns: Turn[];
  playing: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function TranscriptStream({ turns, playing, scrollRef }: TranscriptStreamProps) {
  const latestRef = useRef<HTMLDivElement>(null);
  const latestBadgeRef = useRef<HTMLSpanElement>(null);
  const agentTurns = turns.filter((t) => t.kind === "agent").length;

  // Animate new turn slide-in + stance badge pulse
  useGSAP(() => {
    if (turns.length === 0) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      if (latestRef.current) {
        gsap.from(latestRef.current, {
          y: 20,
          opacity: 0,
          duration: 0.35,
          ease: "power2.out",
          clearProps: "transform",
        });
      }
      if (latestBadgeRef.current) {
        gsap.fromTo(
          latestBadgeRef.current,
          { opacity: 0.4, scale: 0.9 },
          { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" }
        );
      }
    });
    return () => mm.revert();
  }, { dependencies: [turns.length], revertOnUpdate: true });

  return (
    <>
      <style>{`
        .reasoning-content {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease, opacity 0.2s ease;
          opacity: 0;
        }
        .reasoning-details[open] .reasoning-content {
          max-height: 400px;
          opacity: 1;
        }
      `}</style>
    <div className="flex min-h-[360px] flex-col rounded-xl border border-hairline bg-canvas">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-[14px]">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Transcript</span>
        <span className="font-mono text-[11px] text-muted">{agentTurns} {agentTurns === 1 ? "turn" : "turns"}</span>
      </div>
      <div ref={scrollRef} className="max-h-[440px] flex-1 overflow-y-auto px-5 py-3">
        {turns.length === 0 && (
          <p className="pt-[60px] text-center text-[13px] italic text-muted">
            Connecting to simulation…
          </p>
        )}
        {turns.map((t, i) => {
          const isCurrent = i === turns.length - 1;

          if (t.kind === "system") return <SystemRow key={i} t={t} />;

          const vote = t.action_type === "vote" && t.vote ? t.vote.toLowerCase() : null;
          const target = t.directed_at_name ?? t.directed_at ?? null;

          return (
            <div
              key={i}
              ref={isCurrent ? latestRef : null}
              className={`flex gap-3 border-b py-[10px] ${isCurrent ? "opacity-100" : "opacity-82"} ${
                i < turns.length - 1 ? "border-hairline" : "border-transparent"
              }`}
            >
              <Avatar
                initials={initialsFromName(t.speaker)}
                size={32}
                speaking={isCurrent && playing}
                accent={
                  t.stance === "champion" ? "coral" : t.stance === "detractor" ? "ink" : "muted"
                }
              />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[14px] font-semibold">{t.speaker}</span>
                  {t.is_human && (
                    <span
                      className="rounded-full bg-ink px-[7px] py-[1px] font-mono text-[9px] font-bold tracking-[0.12em] text-canvas"
                      title="Typed by a person in the room, not generated"
                    >
                      HUMAN
                    </span>
                  )}
                  {t.stance && (
                    <span
                      ref={isCurrent ? latestBadgeRef : null}
                      className={`font-mono text-[11px] uppercase tracking-[0.08em] ${STANCE_TEXT[t.stance] ?? "text-muted"}`}
                    >
                      {t.stance}
                    </span>
                  )}
                  {t.action_type && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                      <ActionGlyph type={t.action_type} size={11} />
                      {actionLabel(t.action_type)}
                    </span>
                  )}
                  {vote && (
                    <span
                      className={`rounded-full px-2 py-[1px] font-mono text-[10px] font-bold tracking-[0.1em] ${VOTE_CHIP[vote] ?? VOTE_CHIP.abstain}`}
                    >
                      {vote.toUpperCase()}
                    </span>
                  )}
                  {target && (
                    <span className="text-[12px] text-muted">→ {target}</span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                    Turn {t.turn_number + 1}
                  </span>
                </div>
                <div className="text-[15px] leading-relaxed text-ink">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                      ul: ({ children }) => (
                        <ul className="my-1 list-inside list-disc space-y-0.5">{children}</ul>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-ink">{children}</strong>
                      ),
                      em: ({ children }) => <em className="italic text-ink/70">{children}</em>,
                      code: ({ children }) => (
                        <code className="rounded bg-ink/20 px-1 py-0.5 font-mono text-xs">
                          {children}
                        </code>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="my-1 border-l-2 border-primary/40 pl-2 italic text-ink/70">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {t.content}
                  </ReactMarkdown>
                </div>
                {t.reasoning && (
                  <details className="reasoning-details mt-[6px]">
                    <summary className="cursor-pointer text-[11px] text-muted">Reasoning</summary>
                    <p className="mt-1 text-[12px] italic leading-relaxed text-muted reasoning-content">
                      {t.reasoning}
                    </p>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}
