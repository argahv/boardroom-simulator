"use client";

import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Avatar, initialsFromName } from "@/components/Avatar";

gsap.registerPlugin(useGSAP);

export type V2Turn = {
  turn_index: number;
  speaker: string;
  speaker_role?: string;
  content: string;
  stance?: string;
  reasoning?: string;
  action_type?: string;
};

interface TranscriptStreamProps {
  turns: V2Turn[];
  playing: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function TranscriptStream({ turns, playing, scrollRef }: TranscriptStreamProps) {
  const latestRef = useRef<HTMLDivElement>(null);
  const latestBadgeRef = useRef<HTMLSpanElement>(null);

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
          { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }
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
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Transcript</span>
        <span className="text-[11px] text-muted">{turns.length} turns</span>
      </div>
      <div ref={scrollRef} className="max-h-[440px] flex-1 overflow-y-auto px-5 py-3">
        {turns.length === 0 && (
          <p className="pt-[60px] text-center text-[13px] italic text-muted">
            Connecting to simulation…
          </p>
        )}
        {turns.map((t, i) => {
          const isSystem = t.speaker === "⚙ System";
          const isCurrent = i === turns.length - 1;
          const initials = initialsFromName(t.speaker);

          if (isSystem) {
            return (
              <div key={i} className="flex gap-3 py-[6px] opacity-65">
                <div className="flex w-8 shrink-0 items-center justify-center text-[14px]">⚙</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] italic leading-[1.5] text-muted">{t.content}</p>
                </div>
              </div>
            );
          }

          return (
            <div
              key={i}
              ref={isCurrent ? latestRef : null}
              className={`flex gap-3 border-b py-[10px] ${isCurrent ? "opacity-100" : "opacity-82"} ${
                i < turns.length - 1 ? "border-hairline" : "border-transparent"
              }`}
            >
              <Avatar
                initials={initials}
                size={32}
                speaking={isCurrent && playing}
                accent={
                  t.stance === "champion" ? "coral" : t.stance === "detractor" ? "ink" : "muted"
                }
              />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold">{t.speaker}</span>
                  {t.stance && (
                    <span
                      ref={isCurrent ? latestBadgeRef : null}
                      className={`text-[11px] uppercase tracking-[0.08em] ${
                        t.stance === "champion" ? "text-primary" : "text-error"
                      }`}
                    >
                      {t.stance}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-muted">
                    T{String(t.turn_index).padStart(2, "0")}
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
