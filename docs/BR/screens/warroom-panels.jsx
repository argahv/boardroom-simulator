/* War Room analytics panels — used by all three War Room layouts.
   ============================================================================= */

function getStakeholderById(id) {
  return STAKEHOLDERS.find((s) => s.id === id);
}

/* ---------- Incentive Heatmap ---------- */
function IncentiveHeatmap({ turn }) {
  // values evolve slightly with turn — gives the impression of liveness
  const bars = INCENTIVE_BARS.map((b, i) => ({
    ...b,
    value: Math.min(96, Math.max(20, b.value + Math.sin((turn + i) * 0.6) * 6)),
  }));
  return (
    <div>
      <PanelHeader title="Incentive heatmap" sub="Where the room is pulling"/>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {bars.map((b) => (
          <div key={b.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span className="body-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>{b.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)" }}>{Math.round(b.value)}%</span>
            </div>
            <Voltage value={b.value} />
            <div className="caption" style={{ marginTop: 4, fontSize: 12 }}>{b.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Sentiment Graph (bar chart) ---------- */
function SentimentGraph({ turn }) {
  const data = SENTIMENT_BY_TURN.slice(0, turn + 1);
  const max = 1;
  return (
    <div>
      <PanelHeader title="Sentiment by turn" sub="Aggressive ↔ aligned" />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90, padding: "8px 0", borderBottom: "1px solid var(--hairline)", borderTop: "1px solid var(--hairline)" }}>
        {SENTIMENT_BY_TURN.map((e, i) => {
          const filled = i <= turn;
          const h = (Math.abs(e.tone) / max) * 38;
          const pos = e.tone >= 0;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", position: "relative" }} title={`Turn ${i}`}>
              <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                {pos && <div style={{ width: "100%", height: h, background: filled ? "var(--success)" : "var(--hairline)", borderRadius: "2px 2px 0 0" }}/>}
              </div>
              <div style={{ width: "100%", height: 1, background: "var(--hairline-soft)" }}/>
              <div style={{ flex: 1, display: "flex", alignItems: "flex-start", width: "100%" }}>
                {!pos && <div style={{ width: "100%", height: h, background: filled ? "var(--error)" : "var(--hairline)", borderRadius: "0 0 2px 2px" }}/>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="caption" style={{ marginTop: 6, display: "flex", justifyContent: "space-between" }}>
        <span>T0</span>
        <span style={{ color: "var(--muted-soft)" }}>{data.filter(x=>x.tone<-0.3).length} aggressive turns</span>
        <span>T{SENTIMENT_BY_TURN.length-1}</span>
      </div>
    </div>
  );
}

/* ---------- Coalition Tracker ---------- */
function CoalitionTracker({ turn }) {
  const active = [];
  TRANSCRIPT.slice(0, turn + 1).forEach((e) => {
    if (e.coalition && e.coalition.length > 1) active.push({ pair: e.coalition, t: e.t, issue: e.reason });
  });
  return (
    <div>
      <PanelHeader title="Coalitions" sub={`${active.length} formed`}/>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {active.length === 0 && <div className="caption" style={{ fontStyle: "italic" }}>None yet — room is still individual.</div>}
        {active.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--canvas)", borderRadius: "var(--rounded-md)", border: "1px solid var(--hairline)" }}>
            <div style={{ display: "flex" }}>
              {c.pair.map((id, idx) => {
                const s = getStakeholderById(id);
                if (!s) return null;
                return <div key={id} style={{ marginLeft: idx === 0 ? 0 : -10 }}><Avatar stakeholder={s} size={28}/></div>;
              })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="body-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>
                {c.pair.map((id) => getStakeholderById(id)?.name.split(" ")[0]).join(" + ")}
              </div>
              <div className="caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.issue}</div>
            </div>
            <div className="caption-uppercase" style={{ fontSize: 9 }}>T{c.t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Leverage Shifts ---------- */
function LeverageShifts({ turn }) {
  const events = LEVERAGE_EVENTS.filter((e) => e.t <= turn);
  return (
    <div>
      <PanelHeader title="Leverage shifts" sub="Power transfers"/>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {events.length === 0 && <div className="caption" style={{ fontStyle: "italic" }}>Balanced — no shifts yet.</div>}
        {events.map((e, i) => {
          const from = e.from === "founder" ? { name: "Founder", initials: "F", accent: "var(--muted)" } : getStakeholderById(e.from);
          const to   = getStakeholderById(e.to);
          return (
            <div key={i} style={{ padding: 10, background: "var(--canvas)", borderRadius: "var(--rounded-md)", border: "1px solid var(--hairline)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Avatar stakeholder={from} size={24}/>
                <svg width="18" height="10" viewBox="0 0 18 10" fill="none"><path d="M1 5h16M13 1l4 4-4 4" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round"/></svg>
                <Avatar stakeholder={to} size={24}/>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--primary)", marginLeft: "auto" }}>+{e.delta}</span>
              </div>
              <div className="caption" style={{ fontSize: 12 }}>{e.reason}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Leaderboard ---------- */
function Leaderboard({ turn }) {
  const board = [...LEADERBOARD].sort((a, b) => b.score - a.score);
  return (
    <div>
      <PanelHeader title="Who's winning" sub="Live score by stakeholder"/>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {board.map((row, i) => {
          const s = getStakeholderById(row.id);
          return (
            <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: i === 0 ? "var(--ink)" : "var(--canvas)", color: i === 0 ? "var(--on-dark)" : "var(--ink)", borderRadius: "var(--rounded-md)", border: "1px solid " + (i === 0 ? "var(--ink)" : "var(--hairline)") }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, width: 24, color: i === 0 ? "var(--on-dark)" : "var(--muted)" }}>#{i+1}</div>
              <Avatar stakeholder={s} size={28}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="body-sm" style={{ fontWeight: 500, color: i === 0 ? "var(--on-dark)" : "var(--ink)" }}>{s.name.split(" ")[0]}</div>
                <div className="caption" style={{ color: i === 0 ? "var(--on-dark-soft)" : "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.reason}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{row.score}</div>
                <div className="caption" style={{ color: row.delta > 0 ? (i === 0 ? "#a3d3ae" : "var(--success)") : "var(--error)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  {row.delta > 0 ? "▲" : "▼"} {Math.abs(row.delta)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Event Log (terminal-style, dark) ---------- */
function EventLog({ turn }) {
  const visible = EVENT_LOG.filter((e) => e.t <= turn);
  const endRef = useRef(null);
  useEffect(() => {
    if (endRef.current) endRef.current.parentElement.scrollTop = endRef.current.parentElement.scrollHeight;
  }, [turn]);
  const color = (type) => ({
    sim: "var(--on-dark-soft)",
    agent: "var(--on-dark)",
    tool: "var(--accent-teal)",
    alert: "var(--primary)",
    graph: "var(--accent-amber)",
  })[type] || "var(--on-dark)";
  return (
    <div style={{ background: "var(--surface-dark)", borderRadius: "var(--rounded-lg)", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="caption-uppercase" style={{ color: "var(--on-dark-soft)" }}>Event stream</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["#a09d96", "#a09d96", "#cc785c"].map((c, i) => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: c }}/>)}
        </div>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7, color: "var(--on-dark)", maxHeight: 200, overflow: "auto" }}>
        {visible.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "var(--on-dark-soft)" }}>T{String(e.t).padStart(2, "0")}</span>
            <span style={{ color: color(e.type), minWidth: 50 }}>[{e.type}]</span>
            <span>{e.text}</span>
          </div>
        ))}
        <div ref={endRef}>
          <span style={{ color: "var(--on-dark-soft)" }}>T{String(turn).padStart(2, "0")}</span>
          <span style={{ color: "var(--primary)", marginLeft: 10, animation: "blink 1s steps(2) infinite" }}>▌</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Panel header ---------- */
function PanelHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <div className="title-sm" style={{ color: "var(--ink)" }}>{title}</div>
      {sub && <div className="caption" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

Object.assign(window, {
  IncentiveHeatmap, SentimentGraph, CoalitionTracker, LeverageShifts,
  Leaderboard, EventLog, PanelHeader, getStakeholderById,
});
