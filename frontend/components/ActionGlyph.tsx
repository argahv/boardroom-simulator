"use client";

export type ActionType =
  | "statement"
  | "question"
  | "challenge"
  | "compromise"
  | "coalition_signal"
  | "interrupt"
  | "escalate";

const ACTION_LABELS: Record<string, string> = {
  statement:       "Statement",
  question:        "Question",
  challenge:       "Challenge",
  compromise:      "Compromise",
  coalition_signal:"Coalition",
  interrupt:       "Interrupt",
  escalate:        "Escalate",
};

interface ActionGlyphProps {
  type: ActionType | string;
  size?: number;
}

export function ActionGlyph({ type, size = 12 }: ActionGlyphProps) {
  const s = "currentColor";
  const sw = 1.5;
  const v = `0 0 16 16`;

  switch (type) {
    case "statement":
      return (
        <svg width={size} height={size} viewBox={v} fill="none" aria-hidden>
          <path d="M2 4h12M2 8h10M2 12h7" stroke={s} strokeWidth={sw} strokeLinecap="round"/>
        </svg>
      );
    case "question":
      return (
        <svg width={size} height={size} viewBox={v} fill="none" aria-hidden>
          <path d="M6 6a2 2 0 1 1 2 2v1M8 12v.5" stroke={s} strokeWidth={sw} strokeLinecap="round"/>
        </svg>
      );
    case "challenge":
      return (
        <svg width={size} height={size} viewBox={v} fill="none" aria-hidden>
          <path d="M3 13L13 3M5 3h8v8" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case "compromise":
      return (
        <svg width={size} height={size} viewBox={v} fill="none" aria-hidden>
          <path d="M3 8h10M9 4l4 4-4 4" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case "coalition_signal":
      return (
        <svg width={size} height={size} viewBox={v} fill="none" aria-hidden>
          <circle cx="5" cy="8" r="2.5" stroke={s} strokeWidth={sw}/>
          <circle cx="11" cy="8" r="2.5" stroke={s} strokeWidth={sw}/>
        </svg>
      );
    case "interrupt":
      return (
        <svg width={size} height={size} viewBox={v} fill="none" aria-hidden>
          <path d="M8 2v8M8 13v.5" stroke={s} strokeWidth={sw} strokeLinecap="round"/>
        </svg>
      );
    case "escalate":
      return (
        <svg width={size} height={size} viewBox={v} fill="none" aria-hidden>
          <path d="M2 13l4-6 3 3 5-7M9 3h4v4" stroke={s} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox={v} fill="none" aria-hidden>
          <circle cx="8" cy="8" r="2" fill={s}/>
        </svg>
      );
  }
}

export function actionLabel(type: string): string {
  return ACTION_LABELS[type] ?? type.replace("_", " ");
}
