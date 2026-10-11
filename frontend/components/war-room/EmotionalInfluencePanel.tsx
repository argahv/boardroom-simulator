"use client";

interface EmotionalInfluencePanelProps {
  modulation?: {
    interrupt_bias: number;
    challenge_bias: number;
    compromise_bias: number;
    coalition_bias: number;
    escalate_bias: number;
    statement_bias: number;
    question_bias: number;
    urgency_modifier: number;
  };
  /** The agent's current emotions; used to show which emotions are producing each bias. */
  emotions?: Record<string, number>;
  agentName?: string;
}

const BIAS_LABELS: Record<string, string> = {
  interrupt_bias: "Interrupt",
  challenge_bias: "Challenge",
  compromise_bias: "Compromise",
  coalition_bias: "Seek Alliance",
  escalate_bias: "Escalate",
  statement_bias: "Statement",
  question_bias: "Question",
};

// Mirrors EMOTION_MODULATION_RULES in backend/app/runtime/internal_state.py:
// [emotion, threshold, target, delta], applied when emotion >= threshold.
const MODULATION_RULES: [string, number, string, number][] = [
  ["anger", 0.7, "interrupt_bias", 0.4],
  ["anger", 0.7, "compromise_bias", -0.3],
  ["anger", 0.7, "challenge_bias", 0.25],
  ["anger", 0.7, "urgency_modifier", 15],
  ["fear", 0.6, "challenge_bias", -0.2],
  ["fear", 0.6, "coalition_bias", 0.2],
  ["fear", 0.6, "escalate_bias", -0.15],
  ["fear", 0.6, "urgency_modifier", 10],
  ["joy", 0.7, "compromise_bias", 0.2],
  ["joy", 0.7, "statement_bias", 0.1],
  ["joy", 0.7, "urgency_modifier", -10],
  ["shame", 0.6, "interrupt_bias", -0.2],
  ["shame", 0.6, "statement_bias", -0.15],
  ["shame", 0.6, "urgency_modifier", -15],
  ["surprise", 0.7, "question_bias", 0.2],
  ["surprise", 0.7, "interrupt_bias", 0.15],
];

function activeSources(emotions: Record<string, number> | undefined, target: string) {
  if (!emotions) return [];
  return MODULATION_RULES.filter(
    ([emotion, threshold, t]) => t === target && (emotions[emotion] ?? 0) >= threshold
  ).map(([emotion, threshold, , delta]) => ({
    emotion,
    level: Math.round((emotions[emotion] ?? 0) * 100),
    threshold: Math.round(threshold * 100),
    delta,
  }));
}

const signed = (v: number, digits = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}`;

function SourceChips({ sources, digits }: { sources: ReturnType<typeof activeSources>; digits?: number }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <span
          key={s.emotion}
          className="rounded bg-ink/5 px-1 py-[1px] text-[9px] text-muted"
          title={`${s.emotion} is ${s.level}%, at or above the ${s.threshold}% threshold`}
        >
          {s.emotion} {s.level}%: {signed(s.delta, digits)}
        </span>
      ))}
    </div>
  );
}

export function EmotionalInfluencePanel({ modulation, emotions, agentName }: EmotionalInfluencePanelProps) {
  if (!modulation) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
        <span className="text-[13px] font-semibold text-ink">Emotional Influence</span>
        <div className="mt-2 flex h-[60px] items-center justify-center">
          <span className="text-[12px] italic text-muted">No data yet</span>
        </div>
      </div>
    );
  }

  const biases = Object.entries(BIAS_LABELS)
    .filter(([key]) => key in modulation)
    .map(([key, label]) => ({
      key,
      label,
      value: (modulation as Record<string, number>)[key] ?? 0,
    }))
    .filter(b => Math.abs(b.value) > 0.01);
  const urgency = typeof modulation.urgency_modifier === "number" ? modulation.urgency_modifier : 0;

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Emotional Influence</span>
        <span className="text-[11px] text-muted">{agentName ?? ""}</span>
      </div>
      <div className="flex flex-col gap-[10px]">
        {biases.length === 0 && urgency === 0 && (
          <span className="text-[12px] italic text-muted">Neutral — no emotion past its threshold</span>
        )}
        {biases.map((b) => {
          const isPositive = b.value >= 0;
          const pct = Math.min(Math.abs(b.value), 1) * 100;
          return (
            <div key={b.key}>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-ink">{b.label}</span>
                <span className={`font-mono text-[10px] ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {signed(b.value)}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-ink/10">
                {isPositive ? (
                  <div className="h-full rounded-full bg-green-500/50" style={{ width: `${pct}%` }} />
                ) : (
                  <div className="h-full rounded-full bg-red-500/50" style={{ marginLeft: `${100 - pct}%`, width: `${pct}%` }} />
                )}
              </div>
              <SourceChips sources={activeSources(emotions, b.key)} />
            </div>
          );
        })}
        {urgency !== 0 && (
          <div>
            <div className="flex justify-between text-[11px]">
              <span className="text-ink">Floor-bid urgency</span>
              <span className={`font-mono text-[10px] ${urgency > 0 ? "text-primary" : "text-muted"}`}>
                {urgency > 0 ? "+" : ""}{Math.round(urgency)} pts
              </span>
            </div>
            <div className="text-[10px] text-muted">Added to this agent&apos;s bid to speak next</div>
            <SourceChips sources={activeSources(emotions, "urgency_modifier")} digits={0} />
          </div>
        )}
      </div>
    </div>
  );
}
