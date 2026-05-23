"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Avatar, initialsFromName } from "@/components/Avatar";

export type V2Turn = {
  turn_index: number;
  speaker: string;
  speaker_role?: string;
  content: string;
  stance?: string;
  reasoning?: string;
};

interface TranscriptStreamProps {
  turns: V2Turn[];
  playing: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function TranscriptStream({ turns, playing, scrollRef }: TranscriptStreamProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [turns.length]);

  return (
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
                  <details className="mt-[6px]">
                    <summary className="cursor-pointer text-[11px] text-muted">Reasoning</summary>
                    <p className="mt-1 text-[12px] italic leading-relaxed text-muted">
                      {t.reasoning}
                    </p>
                  </details>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
