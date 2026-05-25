/* War Room layouts — Roster / Table / Graph
   The three "directions" the user wanted.
   ============================================================================= */

/* ============================================================================
   LAYOUT 1: ROSTER — conventional dashboard
   Left rail of cards, center transcript, right analytics rail.
   ============================================================================ */

function RosterLayout({ turn, current, recent, playing, sim }) {
  const speakerId = current?.by;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 340px", gap: 16, padding: 16, minHeight: "calc(100vh - 220px)" }}>
      {/* LEFT — stakeholder rail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="caption-uppercase" style={{ marginBottom: 4 }}>The room</div>
        {STAKEHOLDERS.map((s) => {
          const speaking = s.id === speakerId;
          const lastTurn = [...TRANSCRIPT.slice(0, turn+1)].reverse().find((t) => t.by === s.id);
          return (
            <div
              key={s.id}
              style={{
                padding: 14,
                background: speaking ? "var(--ink)" : "var(--surface-card)",
                color: speaking ? "var(--on-dark)" : "var(--ink)",
                borderRadius: "var(--rounded-lg)",
                transition: "background 240ms ease",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <Avatar stakeholder={s} size={36} speaking={speaking}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title-sm" style={{ color: "inherit", fontSize: 14 }}>{s.name}</div>
                  <div className="caption" style={{ color: speaking ? "var(--on-dark-soft)" : "var(--muted)", fontSize: 11 }}>{s.role}</div>
                </div>
                <Badge tone={speaking ? "coral" : tagTone(s.tag)} style={{ fontSize: 9 }}>{speaking ? "SPEAKING" : s.tag}</Badge>
              </div>
              {lastTurn && (
                <div className="caption" style={{ color: speaking ? "var(--on-dark-soft)" : "var(--muted)", fontSize: 12, fontStyle: "italic", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  "{lastTurn.text}"
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CENTER — transcript */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ConflictTimeline turn={turn}/>
        <TranscriptStream turn={turn} current={current} playing={playing}/>
        <EventLog turn={turn}/>
      </div>

      {/* RIGHT — analytics */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card padding="18px"><IncentiveHeatmap turn={turn}/></Card>
        <Card padding="18px"><SentimentGraph turn={turn}/></Card>
        <Card padding="18px"><LeverageShifts turn={turn}/></Card>
        <Card padding="18px"><CoalitionTracker turn={turn}/></Card>
      </div>
    </div>
  );
}

/* ============================================================================
   LAYOUT 2: TABLE — boardroom metaphor
   Agents seated around an oval table; active speaker scales/glows; the
   statement appears in the center of the table as if spoken into the room.
   ============================================================================ */

function TableLayout({ turn, current, recent, playing }) {
  const speakerId = current?.by;

  // Position agents around an ellipse
  const positions = useMemo(() => {
    const cx = 50, cy = 50;
    const rx = 38, ry = 30;
    const n = STAKEHOLDERS.length;
    return STAKEHOLDERS.map((s, i) => {
      // start from top, distribute clockwise; offset so nobody is dead-center top
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + Math.PI / n;
      return {
        id: s.id,
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry,
      };
    });
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, padding: 16, minHeight: "calc(100vh - 220px)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* The table */}
        <Card padding="0" style={{ background: "var(--surface-dark)", color: "var(--on-dark)", aspectRatio: "16/10", position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", inset: 24,
            background: "radial-gradient(ellipse at center, #2a2725 0%, #1f1c19 70%, #181715 100%)",
            borderRadius: "50%",
            border: "1px solid #2e2b27",
          }}/>
          {/* faint table grain */}
          <svg style={{ position: "absolute", inset: 24, width: "calc(100% - 48px)", height: "calc(100% - 48px)" }} viewBox="0 0 100 100" preserveAspectRatio="none">
            <ellipse cx="50" cy="50" rx="48" ry="48" fill="none" stroke="#28251f" strokeWidth="0.2" strokeDasharray="0.3 0.6"/>
            <ellipse cx="50" cy="50" rx="36" ry="36" fill="none" stroke="#28251f" strokeWidth="0.15"/>
          </svg>

          {/* central statement */}
          <div style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            width: "44%", textAlign: "center",
          }}>
            {current ? (
              <div>
                <div className="caption-uppercase" style={{ color: "var(--on-dark-soft)", marginBottom: 8 }}>
                  T{String(turn).padStart(2,"0")} · {actionLabel(current.action)}
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.25, color: "var(--on-dark)", letterSpacing: "-0.4px" }}>
                  "{current.text}"
                </div>
                <div className="caption" style={{ marginTop: 14, color: "var(--on-dark-soft)" }}>
                  — {getStakeholderById(current.by)?.name}
                </div>
              </div>
            ) : (
              <div className="caption-uppercase" style={{ color: "var(--on-dark-soft)" }}>Awaiting first turn</div>
            )}
          </div>

          {/* seats */}
          {positions.map((p) => {
            const s = getStakeholderById(p.id);
            const speaking = s.id === speakerId;
            return (
              <div
                key={s.id}
                style={{
                  position: "absolute",
                  left: `${p.x}%`, top: `${p.y}%`,
                  transform: `translate(-50%, -50%) scale(${speaking ? 1.12 : 1})`,
                  transition: "transform 300ms cubic-bezier(.4,0,.2,1)",
                  textAlign: "center",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Avatar stakeholder={s} size={speaking ? 60 : 52} speaking={speaking}/>
                </div>
                <div style={{ marginTop: 6, fontFamily: "var(--font-body)", fontWeight: 500, fontSize: 13, color: speaking ? "var(--on-dark)" : "var(--on-dark-soft)" }}>
                  {s.name.split(" ")[0]}
                </div>
                <div className="caption" style={{ color: "var(--on-dark-soft)", fontSize: 10 }}>{s.role.split(" ")[0]}</div>
              </div>
            );
          })}

          {/* coalition arcs */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} viewBox="0 0 100 100" preserveAspectRatio="none">
            {TRANSCRIPT.slice(0, turn+1).filter((e) => e.coalition && e.coalition.length === 2).map((e, i) => {
              const a = positions.find((p) => p.id === e.coalition[0]);
              const b = positions.find((p) => p.id === e.coalition[1]);
              if (!a || !b) return null;
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--primary)" strokeWidth="0.3" strokeDasharray="0.6 0.4" opacity="0.7"/>;
            })}
          </svg>
        </Card>

        <ConflictTimeline turn={turn} dark/>
        <EventLog turn={turn}/>
      </div>

      {/* RIGHT analytics rail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card padding="18px"><Leaderboard turn={turn}/></Card>
        <Card padding="18px"><IncentiveHeatmap turn={turn}/></Card>
        <Card padding="18px"><LeverageShifts turn={turn}/></Card>
      </div>
    </div>
  );
}

/* ============================================================================
   LAYOUT 3: GRAPH — conversation as a graph
   Agents are nodes; turns produce edges; coalitions thicken connections.
   ============================================================================ */

function GraphLayout({ turn, current, recent, playing }) {
  const speakerId = current?.by;

  // fixed graph positions, slightly clustered
  const positions = {
    marin: { x: 30, y: 28 },
    devon: { x: 70, y: 30 },
    yuki:  { x: 80, y: 65 },
    aaron: { x: 50, y: 78 },
    priya: { x: 18, y: 65 },
  };

  // count edges between each pair: any time A speaks after B (or directly references)
  const edges = useMemo(() => {
    const m = {};
    const visible = TRANSCRIPT.slice(0, turn + 1);
    for (let i = 1; i < visible.length; i++) {
      const a = visible[i-1].by;
      const b = visible[i].by;
      if (a === b) continue;
      const key = [a, b].sort().join("-");
      m[key] = (m[key] || 0) + 1;
    }
    return m;
  }, [turn]);

  // coalition pairs (thicker, coral)
  const coalitions = TRANSCRIPT.slice(0, turn + 1)
    .filter((e) => e.coalition && e.coalition.length === 2)
    .map((e) => e.coalition.sort().join("-"));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, padding: 16, minHeight: "calc(100vh - 220px)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Card padding="0" style={{ background: "var(--surface-card)", aspectRatio: "16/10", position: "relative", overflow: "hidden" }}>
          {/* faint grid */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="dotgrid" width="4" height="4" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="0.18" fill="var(--muted-soft)" opacity="0.4"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#dotgrid)"/>

            {/* edges */}
            {Object.entries(edges).map(([key, count]) => {
              const [a, b] = key.split("-");
              const pa = positions[a], pb = positions[b];
              if (!pa || !pb) return null;
              const isCoalition = coalitions.includes(key);
              return (
                <line
                  key={key}
                  x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                  stroke={isCoalition ? "var(--primary)" : "var(--ink)"}
                  strokeWidth={isCoalition ? 0.5 : Math.min(0.15 + count * 0.08, 0.45)}
                  opacity={isCoalition ? 0.85 : 0.32}
                  strokeDasharray={isCoalition ? "0" : "0"}
                />
              );
            })}

            {/* speaker pulse — emanating ring */}
            {speakerId && (
              <g>
                <circle
                  cx={positions[speakerId]?.x}
                  cy={positions[speakerId]?.y}
                  r="3"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="0.3"
                  opacity="0.6"
                  style={{ animation: "graphPulse 1.6s ease-out infinite" }}
                />
              </g>
            )}
          </svg>

          {/* nodes */}
          {STAKEHOLDERS.map((s) => {
            const p = positions[s.id];
            const speaking = s.id === speakerId;
            return (
              <div
                key={s.id}
                style={{
                  position: "absolute",
                  left: `${p.x}%`, top: `${p.y}%`,
                  transform: `translate(-50%, -50%) scale(${speaking ? 1.15 : 1})`,
                  transition: "transform 300ms",
                  textAlign: "center",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Avatar stakeholder={s} size={speaking ? 56 : 48} speaking={speaking}/>
                </div>
                <div style={{
                  marginTop: 6,
                  background: "var(--canvas)",
                  border: "1px solid var(--hairline)",
                  padding: "3px 8px",
                  borderRadius: "var(--rounded-pill)",
                  fontFamily: "var(--font-body)", fontWeight: 500, fontSize: 12,
                  color: "var(--ink)",
                  whiteSpace: "nowrap",
                  display: "inline-block",
                }}>
                  {s.name.split(" ")[0]} · <span style={{ color: "var(--muted)" }}>{s.role.split(" ")[0]}</span>
                </div>
              </div>
            );
          })}

          {/* legend */}
          <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", gap: 16, padding: "8px 14px", background: "var(--canvas)", borderRadius: "var(--rounded-pill)", border: "1px solid var(--hairline)" }}>
            <LegendItem color="var(--ink)" label="exchange"/>
            <LegendItem color="var(--primary)" label="coalition"/>
            <LegendItem dot color="var(--primary)" label="speaking now"/>
          </div>

          {/* statement bubble — anchored near the speaker */}
          {current && speakerId && (
            <StatementBubble pos={positions[speakerId]} current={current}/>
          )}
        </Card>

        <ConflictTimeline turn={turn}/>
        <EventLog turn={turn}/>
      </div>

      {/* RIGHT */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card padding="20px" style={{ background: "var(--ink)", color: "var(--on-dark)" }}>
          {current ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <Avatar stakeholder={getStakeholderById(current.by)} size={42}/>
                <div style={{ flex: 1 }}>
                  <div className="title-sm" style={{ color: "var(--on-dark)" }}>{getStakeholderById(current.by).name}</div>
                  <div className="caption" style={{ color: "var(--on-dark-soft)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <ActionGlyph type={current.action}/> {actionLabel(current.action)}
                    </span>
                    <span style={{ margin: "0 6px" }}>·</span>
                    T{String(turn).padStart(2,"0")}
                  </div>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, lineHeight: 1.3, color: "var(--on-dark)", marginBottom: 12 }}>
                "{current.text}"
              </div>
              <div style={{ paddingTop: 12, borderTop: "1px solid #2e2b27" }}>
                <div className="caption-uppercase" style={{ color: "var(--on-dark-soft)", marginBottom: 4 }}>Why this turn</div>
                <div className="body-sm" style={{ color: "var(--on-dark)", lineHeight: 1.5 }}>{current.reason}</div>
              </div>
            </div>
          ) : (
            <div className="caption-uppercase" style={{ color: "var(--on-dark-soft)" }}>Awaiting first turn</div>
          )}
        </Card>
        <Card padding="18px"><Leaderboard turn={turn}/></Card>
        <Card padding="18px"><CoalitionTracker turn={turn}/></Card>
      </div>
    </div>
  );
}

function StatementBubble({ pos, current }) {
  // anchor to the right of the speaker, or left if speaker is on right side
  const right = pos.x < 50;
  return (
    <div style={{
      position: "absolute",
      left: right ? `calc(${pos.x}% + 50px)` : "auto",
      right: !right ? `calc(${100 - pos.x}% + 50px)` : "auto",
      top: `${pos.y}%`,
      transform: "translateY(-50%)",
      maxWidth: 260,
      background: "var(--canvas)",
      border: "1px solid var(--hairline)",
      borderRadius: "var(--rounded-lg)",
      padding: "12px 14px",
      boxShadow: "0 4px 12px rgba(20,20,19,0.06)",
      pointerEvents: "none",
    }}>
      <div className="caption-uppercase" style={{ marginBottom: 4, fontSize: 9 }}>
        <ActionGlyph type={current.action}/> {actionLabel(current.action)}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 15, lineHeight: 1.35, color: "var(--ink)", letterSpacing: "-0.2px" }}>
        "{current.text.length > 120 ? current.text.slice(0, 120) + "…" : current.text}"
      </div>
    </div>
  );
}

function LegendItem({ color, label, dot }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {dot ? (
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }}/>
      ) : (
        <div style={{ width: 18, height: 2, background: color }}/>
      )}
      <span className="caption" style={{ fontSize: 11 }}>{label}</span>
    </div>
  );
}

/* ============================================================================
   Shared: conflict timeline + transcript stream
   ============================================================================ */

function ConflictTimeline({ turn, dark = false }) {
  const total = TRANSCRIPT.length;
  return (
    <div style={{ padding: "14px 18px", background: dark ? "var(--surface-dark)" : "var(--surface-card)", borderRadius: "var(--rounded-lg)", color: dark ? "var(--on-dark)" : "var(--ink)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div className="caption-uppercase" style={{ color: dark ? "var(--on-dark-soft)" : "var(--muted)" }}>
          Conflict timeline · turn {turn + 1} / {total}
        </div>
        <div className="caption" style={{ color: dark ? "var(--on-dark-soft)" : "var(--muted)", fontSize: 11 }}>
          {TRANSCRIPT.slice(0, turn + 1).filter((e) => e.action === "challenge" || e.action === "interrupt").length} clashes
        </div>
      </div>
      <div style={{ position: "relative", height: 12, background: dark ? "#262320" : "var(--surface-soft)", borderRadius: "var(--rounded-pill)" }}>
        <div style={{ position: "absolute", inset: 0, width: `${((turn + 1) / total) * 100}%`, background: dark ? "var(--primary)" : "var(--ink)", borderRadius: "var(--rounded-pill)", transition: "width 600ms" }}/>
        {TRANSCRIPT.map((e, i) => {
          if (e.action !== "challenge" && e.action !== "interrupt") return null;
          const left = (i / (total - 1)) * 100;
          const passed = i <= turn;
          return (
            <div
              key={i}
              title={`T${e.t}: ${actionLabel(e.action)}`}
              style={{
                position: "absolute",
                left: `${left}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 10, height: 10, borderRadius: "50%",
                background: passed ? "var(--primary)" : (dark ? "#3a3631" : "var(--hairline)"),
                border: "2px solid " + (dark ? "var(--surface-dark)" : "var(--surface-card)"),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function TranscriptStream({ turn, current, playing }) {
  const visible = TRANSCRIPT.slice(0, turn + 1);
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turn]);
  return (
    <Card padding="0" style={{ background: "var(--canvas)", border: "1px solid var(--hairline)", flex: 1, display: "flex", flexDirection: "column", minHeight: 360 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--hairline-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="caption-uppercase">Transcript</div>
        <div className="caption" style={{ fontSize: 11 }}>{visible.length} turns</div>
      </div>
      <div ref={scrollRef} style={{ padding: "12px 20px", flex: 1, overflow: "auto", maxHeight: 440 }}>
        {visible.map((e, i) => {
          const s = getStakeholderById(e.by);
          const isCurrent = i === turn;
          return (
            <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < visible.length - 1 ? "1px solid var(--hairline-soft)" : "none", opacity: isCurrent ? 1 : 0.82 }}>
              <Avatar stakeholder={s} size={32} speaking={isCurrent && playing}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className="title-sm" style={{ fontSize: 14 }}>{s.name}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted)", fontSize: 11 }}>
                    <ActionGlyph type={e.action}/>{actionLabel(e.action)}
                  </span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-soft)" }}>T{String(e.t).padStart(2,"0")}</span>
                </div>
                <div className="body-md" style={{ color: "var(--body-strong)", lineHeight: 1.5, fontSize: 15 }}>
                  {e.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

Object.assign(window, { RosterLayout, TableLayout, GraphLayout, ConflictTimeline, TranscriptStream });
