import ReactMarkdown from "react-markdown";
import type { Turn } from "@/lib/types";

const ACTION_COLORS: Record<string, string> = {
  statement: "bg-canvas/10 text-canvas/70",
  question: "bg-accent-teal/20 text-accent-teal",
  challenge: "bg-primary/25 text-primary",
  compromise: "bg-green-500/20 text-green-300",
  coalition_signal: "bg-accent-amber/20 text-accent-amber",
  interrupt: "bg-red-500/25 text-red-300",
  escalate: "bg-red-700/30 text-red-200",
};

const TONE_INDICATOR: Record<string, string> = {
  neutral: "🟡",
  tense: "🟠",
  heated: "🔴",
  conciliatory: "🟢",
};

interface TurnDisplayProps {
  turn: Turn;
  isActive: boolean;
}

export function TurnDisplay({ turn, isActive }: TurnDisplayProps) {
  return (
    <article
      className={`rounded-xl border p-4 transition-all ${
        isActive ? "border-primary bg-canvas/8" : "border-canvas/8 bg-canvas/4"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {turn.emotional_tone && (
          <span title={turn.emotional_tone}>
            {TONE_INDICATOR[turn.emotional_tone] ?? "⚪"}
          </span>
        )}
        <p className="font-semibold text-sm">{turn.stakeholder_name}</p>
        <span className="text-xs text-canvas/45">{turn.role}</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider min-h-touch inline-flex items-center ${
            ACTION_COLORS[turn.action_type] ?? "bg-canvas/10 text-canvas/70"
          }`}
          aria-label={`Action type: ${turn.action_type}`}
        >
          {turn.action_type.replace("_", " ")}
        </span>
        {turn.directed_at && (
          <span className="text-xs text-canvas/75 px-2 py-1">
            → {turn.directed_at}
          </span>
        )}
        {turn.coalition_with && (
          <span className="text-xs text-accent-amber px-2 py-1">
            ⚡ w/{turn.coalition_with}
          </span>
        )}
        {turn.leverage_gained && (
          <span className="text-xs text-green-400 px-2 py-1">↑ leverage</span>
        )}
      </div>

      {/* Markdown-rendered content */}
      <div className="text-sm leading-relaxed text-canvas/80">
        <ReactMarkdown
          components={{
            h1: ({ node, ...props }) => (
              <h1 className="text-lg font-bold mt-2 mb-1" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2 className="text-base font-bold mt-2 mb-1" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-sm font-semibold mt-1.5 mb-0.5" {...props} />
            ),
            ul: ({ node, ...props }) => (
              <ul className="list-disc list-inside my-1 space-y-0.5" {...props} />
            ),
            ol: ({ node, ...props }) => (
              <ol className="list-decimal list-inside my-1 space-y-0.5" {...props} />
            ),
            li: ({ node, ...props }) => <li className="text-sm" {...props} />,
            code: ({ node, ...props }) => (
              <code
                className="bg-canvas/20 px-1 py-0.5 rounded text-xs font-mono"
                {...props}
              />
            ),
            pre: ({ node, ...props }) => (
              <pre className="bg-canvas/10 p-2 rounded my-1 overflow-x-auto text-xs" {...props} />
            ),
            strong: ({ node, ...props }) => (
              <strong className="font-semibold text-canvas" {...props} />
            ),
            em: ({ node, ...props }) => (
              <em className="italic text-canvas/70" {...props} />
            ),
            blockquote: ({ node, ...props }) => (
              <blockquote
                className="border-l-2 border-primary/40 pl-2 italic text-canvas/70 my-1"
                {...props}
              />
            ),
            a: ({ node, ...props }) => (
              <a
                className="text-accent-teal underline hover:text-accent-teal/70"
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              />
            ),
            hr: ({ node, ...props }) => (
              <hr className="border-canvas/20 my-2" {...props} />
            ),
            p: ({ node, ...props }) => <p className="mb-1" {...props} />,
          }}
        >
          {turn.content}
        </ReactMarkdown>
      </div>

      {turn.internal_reasoning && (
        <details className="mt-2">
          <summary className="text-[11px] text-canvas/70 cursor-pointer hover:text-canvas/50">
            Internal reasoning
          </summary>
          <p className="mt-1 text-[11px] text-canvas/75 italic leading-relaxed">
            {turn.internal_reasoning}
          </p>
        </details>
      )}
    </article>
  );
}
