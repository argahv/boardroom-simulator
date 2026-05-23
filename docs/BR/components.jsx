/* Shared components — Boardroom Simulator
   Cards, badges, buttons, voltage meters, avatars.
   ============================================================================= */

const { useState, useEffect, useRef, useMemo } = React;

/* ---------- Spike mark (Anthropic glyph) ---------- */
function SpikeMark({ size = 14, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g stroke={color} strokeWidth="1.6" strokeLinecap="round">
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
      </g>
    </svg>
  );
}

/* ---------- Badge ---------- */
function Badge({ children, tone = "neutral", style = {} }) {
  const tones = {
    neutral:    { bg: "var(--surface-cream-strong)", fg: "var(--ink)" },
    skeptical:  { bg: "#f1dcd4",                     fg: "#7a3422" },
    agreeable:  { bg: "#dceee5",                     fg: "#1f5e44" },
    calibrating:{ bg: "#f4e6cc",                     fg: "#7a5818" },
    locked:     { bg: "var(--ink)",                  fg: "var(--on-dark)" },
    visionary:  { bg: "#e2ddf0",                     fg: "#4a3d7a" },
    coral:      { bg: "var(--primary)",              fg: "var(--on-primary)" },
    dark:       { bg: "var(--surface-dark)",         fg: "var(--on-dark)" },
    soft:       { bg: "var(--surface-soft)",         fg: "var(--muted)" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      className="caption-uppercase"
      style={{
        background: t.bg,
        color: t.fg,
        padding: "3px 8px",
        borderRadius: "var(--rounded-pill)",
        fontSize: 10,
        letterSpacing: 1.2,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function tagTone(tag) {
  return {
    SKEPTICAL: "skeptical",
    AGREEABLE: "agreeable",
    CALIBRATING: "calibrating",
    LOCKED: "locked",
    VISIONARY: "visionary",
    NEUTRAL: "neutral",
  }[tag] || "neutral";
}

/* ---------- Avatar ---------- */
function Avatar({ stakeholder: s, size = 44, active = false, speaking = false }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "var(--rounded-pill)",
        background: s.accent,
        color: s.accent === "var(--accent-amber)" || s.accent === "var(--success)" ? "var(--ink)" : "var(--on-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontSize: size * 0.42,
        letterSpacing: "-0.5px",
        position: "relative",
        flexShrink: 0,
        boxShadow: speaking ? "0 0 0 3px var(--canvas), 0 0 0 5px var(--primary)" : (active ? "0 0 0 2px var(--canvas), 0 0 0 3px var(--hairline)" : "none"),
        transition: "box-shadow 200ms ease",
      }}
    >
      {s.initials}
    </div>
  );
}

/* ---------- Button ---------- */
function Btn({ children, variant = "secondary", onClick, disabled, style = {}, type = "button", title }) {
  const base = {
    fontFamily: "var(--font-body)",
    fontSize: "var(--button-size)",
    fontWeight: 500,
    padding: "10px 18px",
    borderRadius: "var(--rounded-md)",
    border: "1px solid transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "background 120ms ease, color 120ms ease",
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };
  const variants = {
    primary: { background: "var(--primary)", color: "var(--on-primary)" },
    secondary: { background: "transparent", color: "var(--ink)", border: "1px solid var(--hairline)" },
    ghost: { background: "transparent", color: "var(--ink)" },
    dark: { background: "var(--ink)", color: "var(--on-dark)" },
    danger: { background: "transparent", color: "var(--error)", border: "1px solid var(--hairline)" },
  };
  const [hover, setHover] = useState(false);
  const v = variants[variant];
  let bg = v.background;
  if (hover && !disabled) {
    if (variant === "primary") bg = "var(--primary-active)";
    else if (variant === "secondary") bg = "var(--surface-card)";
    else if (variant === "ghost") bg = "var(--surface-card)";
    else if (variant === "dark") bg = "#000";
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...v, background: bg, ...style }}
      title={title}
    >
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
function Card({ children, dark = false, padding = "var(--spacing-xl)", style = {} }) {
  return (
    <div
      style={{
        background: dark ? "var(--surface-dark)" : "var(--surface-card)",
        color: dark ? "var(--on-dark)" : "var(--body)",
        borderRadius: "var(--rounded-lg)",
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------- Section eyebrow ---------- */
function Eyebrow({ children, style = {} }) {
  return (
    <div className="caption-uppercase" style={{ display: "flex", alignItems: "center", gap: 6, ...style }}>
      <SpikeMark size={10} color="var(--primary)" />
      {children}
    </div>
  );
}

/* ---------- Voltage meter / slider ---------- */
function Voltage({ value, max = 100, height = 6, color = "var(--primary)", bg = "var(--surface-cream-strong)" }) {
  return (
    <div style={{ background: bg, height, borderRadius: "var(--rounded-pill)", overflow: "hidden" }}>
      <div
        style={{
          width: `${(value / max) * 100}%`,
          height: "100%",
          background: color,
          borderRadius: "var(--rounded-pill)",
          transition: "width 600ms cubic-bezier(.4,0,.2,1)",
        }}
      />
    </div>
  );
}

/* ---------- Slider with label ---------- */
function LabeledSlider({ label, value, onChange, min = 0, max = 100, step = 1, hint }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span className="title-sm">{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink)" }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--primary)" }}
      />
      {hint && <div className="caption" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

/* ---------- Toggle row ---------- */
function ToggleRow({ label, sub, value, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", padding: "10px 0" }}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 4, accentColor: "var(--primary)" }}
      />
      <div style={{ flex: 1 }}>
        <div className="title-sm">{label}</div>
        {sub && <div className="caption" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
    </label>
  );
}

/* ---------- Text input ---------- */
function Field({ label, value, onChange, placeholder, multiline = false, rows = 4, hint, error }) {
  const common = {
    width: "100%",
    fontFamily: "var(--font-body)",
    fontSize: "var(--body-md-size)",
    color: "var(--ink)",
    background: "var(--canvas)",
    border: `1px solid ${error ? "var(--error)" : "var(--hairline)"}`,
    borderRadius: "var(--rounded-md)",
    padding: "12px 14px",
    outline: "none",
    resize: "vertical",
    lineHeight: 1.55,
  };
  return (
    <label style={{ display: "block" }}>
      <div className="caption-uppercase" style={{ marginBottom: 8 }}>{label}</div>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={common} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={common} />
      )}
      {hint && !error && <div className="caption" style={{ marginTop: 6 }}>{hint}</div>}
      {error && <div className="caption" style={{ marginTop: 6, color: "var(--error)" }}>{error}</div>}
    </label>
  );
}

/* ---------- Action icon (line-art) ---------- */
function ActionGlyph({ type, size = 12 }) {
  const stroke = "currentColor";
  const sw = 1.5;
  switch (type) {
    case "statement":
      return <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h10M2 12h7" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/></svg>;
    case "question":
      return <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M6 6a2 2 0 1 1 2 2v1M8 12v.5" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/></svg>;
    case "challenge":
      return <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M3 13L13 3M5 3h8v8" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case "compromise":
      return <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case "coalition_signal":
      return <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="5" cy="8" r="2.5" stroke={stroke} strokeWidth={sw}/><circle cx="11" cy="8" r="2.5" stroke={stroke} strokeWidth={sw}/></svg>;
    case "interrupt":
      return <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M8 2v8M8 13v.5" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/></svg>;
    case "escalate":
      return <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M2 13l4-6 3 3 5-7M9 3h4v4" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></svg>;
    default:
      return <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" fill={stroke}/></svg>;
  }
}

function actionLabel(t) {
  return ({
    statement: "Statement",
    question: "Question",
    challenge: "Challenge",
    compromise: "Compromise",
    coalition_signal: "Coalition",
    interrupt: "Interrupt",
    escalate: "Escalate",
  })[t] || t;
}

/* ---------- Section divider ---------- */
function HR() {
  return <div style={{ height: 1, background: "var(--hairline)", margin: "var(--spacing-lg) 0" }} />;
}

/* expose */
Object.assign(window, {
  SpikeMark, Badge, tagTone, Avatar, Btn, Card, Eyebrow,
  Voltage, LabeledSlider, ToggleRow, Field, ActionGlyph, actionLabel, HR,
});
