/* War Room shell — sim state, control bar, layout switcher
   ============================================================================= */

function WarRoomScreen({ layout, setLayout, tweaks }) {
  const [turn, setTurn] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speedMul, setSpeedMul] = useState(1); // 0.5, 1, 2

  const baseInterval = 3800;
  const interval = baseInterval / speedMul;

  useEffect(() => {
    if (!playing) return;
    if (turn >= TRANSCRIPT.length - 1) return;
    const id = setTimeout(() => setTurn((t) => Math.min(TRANSCRIPT.length - 1, t + 1)), interval);
    return () => clearTimeout(id);
  }, [turn, playing, interval]);

  const current = TRANSCRIPT[turn];
  const recent = TRANSCRIPT.slice(Math.max(0, turn - 2), turn + 1);
  const done = turn >= TRANSCRIPT.length - 1;

  const reset = () => { setTurn(0); setPlaying(true); };
  const step = (delta) => { setTurn((t) => Math.max(0, Math.min(TRANSCRIPT.length - 1, t + delta))); };

  return (
    <div style={{ background: "var(--canvas)" }}>
      <ControlBar
        turn={turn}
        total={TRANSCRIPT.length}
        playing={playing}
        setPlaying={setPlaying}
        speedMul={speedMul}
        setSpeedMul={setSpeedMul}
        reset={reset}
        step={step}
        layout={layout}
        setLayout={setLayout}
        done={done}
        tweaks={tweaks}
      />

      {layout === "roster" && <RosterLayout turn={turn} current={current} recent={recent} playing={playing}/>}
      {layout === "table"  && <TableLayout  turn={turn} current={current} recent={recent} playing={playing}/>}
      {layout === "graph"  && <GraphLayout  turn={turn} current={current} recent={recent} playing={playing}/>}
    </div>
  );
}

function ControlBar({ turn, total, playing, setPlaying, speedMul, setSpeedMul, reset, step, layout, setLayout, done, tweaks }) {
  return (
    <div style={{
      borderBottom: "1px solid var(--hairline)",
      background: "var(--canvas)",
      padding: "14px 20px",
      display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
    }}>
      {/* LEFT — status + voltage only (title lives in screen header) */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: playing && !done ? "var(--primary)" : "var(--muted-soft)", animation: playing && !done ? "blink 1.6s ease-in-out infinite" : "none" }}/>
          <span className="caption-uppercase" style={{ color: playing && !done ? "var(--primary)" : "var(--muted)" }}>
            {done ? "Concluded" : playing ? "Live" : "Paused"}
          </span>
        </div>
        <div style={{ width: 1, height: 22, background: "var(--hairline)" }}/>
        <div className="caption" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>Series B · $30M / $180M post</span>
          <span style={{ margin: "0 6px" }}>·</span>
          voltage {tweaks?.voltage ?? SCENARIO.voltage}
        </div>
      </div>

      {/* CENTER — playback (grows to fill) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", border: "1px solid var(--hairline)", borderRadius: "var(--rounded-pill)", background: "var(--surface-soft)", margin: "0 auto" }}>
        <PlaybackBtn onClick={reset} title="Restart">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 8a4 4 0 1 0 1.2-2.85M4 3v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </PlaybackBtn>
        <PlaybackBtn onClick={() => step(-1)} title="Previous turn">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4M3 2v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </PlaybackBtn>
        <button
          onClick={() => setPlaying(!playing)}
          style={{
            width: 38, height: 32, borderRadius: "var(--rounded-pill)",
            background: "var(--ink)", color: "var(--on-dark)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {playing ? (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="3" y="2" width="2" height="8" fill="currentColor"/><rect x="7" y="2" width="2" height="8" fill="currentColor"/></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 2v8l7-4z" fill="currentColor"/></svg>
          )}
        </button>
        <PlaybackBtn onClick={() => step(1)} title="Next turn">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4M9 2v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </PlaybackBtn>
        <div style={{ width: 1, height: 16, background: "var(--hairline)", margin: "0 4px" }}/>
        <div style={{ display: "flex", gap: 2 }}>
          {[0.5, 1, 2].map((s) => (
            <button
              key={s}
              onClick={() => setSpeedMul(s)}
              style={{
                background: speedMul === s ? "var(--ink)" : "transparent",
                color: speedMul === s ? "var(--on-dark)" : "var(--muted)",
                border: "none", cursor: "pointer",
                fontFamily: "var(--font-mono)", fontSize: 11,
                padding: "5px 9px", borderRadius: "var(--rounded-pill)",
              }}
            >{s}×</button>
          ))}
        </div>
        <div style={{ width: 1, height: 16, background: "var(--hairline)", margin: "0 4px" }}/>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", padding: "0 8px" }}>
          T{String(turn).padStart(2,"0")} / T{String(total-1).padStart(2,"0")}
        </span>
      </div>

      {/* RIGHT — layout switcher */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <span className="caption-uppercase" style={{ alignSelf: "center", marginRight: 4 }}>Layout</span>
        {[
          { id: "roster", label: "Roster", glyph: <RosterGlyph/> },
          { id: "table",  label: "Table",  glyph: <TableGlyph/> },
          { id: "graph",  label: "Graph",  glyph: <GraphGlyph/> },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => setLayout(opt.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: "var(--rounded-md)",
              background: layout === opt.id ? "var(--ink)" : "transparent",
              color: layout === opt.id ? "var(--on-dark)" : "var(--ink)",
              border: "1px solid " + (layout === opt.id ? "var(--ink)" : "var(--hairline)"),
              fontFamily: "var(--font-body)", fontWeight: 500, fontSize: 13,
              cursor: "pointer",
            }}
            title={`Layout: ${opt.label}`}
          >
            {opt.glyph}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlaybackBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30, height: 30, borderRadius: "var(--rounded-pill)",
        background: "transparent", color: "var(--ink)",
        border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >{children}</button>
  );
}

function RosterGlyph() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2" width="3.5" height="10" rx="0.7" stroke="currentColor" strokeWidth="1.2"/><rect x="6" y="2" width="6.5" height="10" rx="0.7" stroke="currentColor" strokeWidth="1.2"/></svg>;
}
function TableGlyph() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><ellipse cx="7" cy="7" rx="5.5" ry="3.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="7" cy="3" r="0.9" fill="currentColor"/><circle cx="7" cy="11" r="0.9" fill="currentColor"/><circle cx="2" cy="7" r="0.9" fill="currentColor"/><circle cx="12" cy="7" r="0.9" fill="currentColor"/></svg>;
}
function GraphGlyph() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="11" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="7" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.2"/><line x1="4" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="1.2"/><line x1="4" y1="4" x2="6.5" y2="10" stroke="currentColor" strokeWidth="1.2"/><line x1="10" y1="5" x2="7.5" y2="10" stroke="currentColor" strokeWidth="1.2"/></svg>;
}

Object.assign(window, { WarRoomScreen });
