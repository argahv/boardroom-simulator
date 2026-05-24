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

const EMOTION_SOURCES: Record<string, [string, number][]> = {
  interrupt_bias: [["anger >=0.7", +0.4], ["shame >=0.6", -0.2], ["surprise >=0.7", +0.15]],
  challenge_bias: [["anger >=0.7", +0.25], ["fear >=0.6", -0.2]],
  compromise_bias: [["anger >=0.7", -0.3], ["joy >=0.7", +0.2]],
  coalition_bias: [["fear >=0.6", +0.2]],
  escalate_bias: [["fear >=0.6", -0.15]],
  statement_bias: [["joy >=0.7", +0.1], ["shame >=0.6", -0.15]],
  question_bias: [["surprise >=0.7", +0.2]],
};

export function EmotionalInfluencePanel({ modulation, agentName }: EmotionalInfluencePanelProps) {
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

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-[18px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">Emotional Influence</span>
        <span className="text-[11px] text-muted">{agentName ?? ""}</span>
      </div>
      <div className="flex flex-col gap-[10px]">
        {biases.length === 0 && (
          <span className="text-[12px] italic text-muted">Neutral — no active biases</span>
        )}
        {biases.map((b) => {
          const isPositive = b.value >= 0;
          const pct = Math.min(Math.abs(b.value), 1) * 100;
          return (
            <div key={b.key}>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-ink">{b.label}</span>
                <span className={`font-mono text-[10px] ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{b.value.toFixed(2)}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-ink/10">
                {isPositive ? (
                  <div className="h-full rounded-full bg-green-500/50" style={{ width: `${pct}%` }} />
                ) : (
                  <div className="h-full rounded-full bg-red-500/50" style={{ marginLeft: `${100 - pct}%`, width: `${pct}%` }} />
                )}
              </div>
              <div className="mt-0.5 flex gap-1.5">
                {(EMOTION_SOURCES[b.key] ?? []).map(([src, delta]) => (
                  <span key={src} className="rounded bg-ink/5 px-1 py-[1px] text-[9px] text-muted">
                    {src}: {delta >= 0 ? "+" : ""}{delta.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
