/* Postmortem analysis screen
   ============================================================================= */

function PostmortemScreen() {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "var(--spacing-xxl) var(--spacing-xl)" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginBottom: "var(--spacing-xl)" }}>
        <div>
          <Eyebrow style={{ marginBottom: 12 }}>Postmortem · {SCENARIO.title}</Eyebrow>
          <h2 style={{ marginBottom: 8 }}>What the room taught you.</h2>
          <p style={{ maxWidth: 640, color: "var(--muted)" }}>
            A read of the simulation against your wizard's predictions. Surprises first, then the strategy cards you should walk into Thursday with.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary">Export brief</Btn>
          <Btn variant="dark">Re-run simulation</Btn>
        </div>
      </div>

      {/* Confidence row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card padding="var(--spacing-xl)" dark>
          <div className="caption-uppercase" style={{ color: "var(--on-dark-soft)", marginBottom: 14 }}>Deal confidence</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 88, lineHeight: 1, letterSpacing: "-2.5px", color: "var(--on-dark)" }}>
              {POSTMORTEM.confidence}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Badge tone="coral">▲ {POSTMORTEM.confidenceDelta} pts vs. wizard</Badge>
              <span className="caption" style={{ color: "var(--on-dark-soft)" }}>Out of 100</span>
            </div>
          </div>
          <p style={{ color: "var(--on-dark)", fontSize: 15, lineHeight: 1.5 }}>
            The room repriced to $170M with clean preferred and Priya retains her seat. The path exists — it requires the cohort reframe and the Threadline beat landing in order.
          </p>
        </Card>
        <Card padding="var(--spacing-xl)">
          <div className="caption-uppercase" style={{ marginBottom: 10 }}>Consensus</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1, letterSpacing: "-1.5px", marginBottom: 8, color: "var(--ink)" }}>
            {POSTMORTEM.consensus}<span style={{ fontSize: 24, color: "var(--muted)" }}>/100</span>
          </div>
          <div className="body-sm" style={{ color: "var(--muted)" }}>
            Marin and Devon converged. Yuki still flagged.
          </div>
        </Card>
        <Card padding="var(--spacing-xl)">
          <div className="caption-uppercase" style={{ marginBottom: 10 }}>Unanticipated</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1, letterSpacing: "-1.5px", marginBottom: 8, color: "var(--ink)" }}>
            {POSTMORTEM.unanticipated}
          </div>
          <div className="body-sm" style={{ color: "var(--muted)" }}>
            Surfaced objections the wizard didn't model — see Surprises.
          </div>
        </Card>
      </div>

      {/* Surprises */}
      <Section title="Surprises" sub="What the wizard missed.">
        <Card padding="var(--spacing-xl)">
          <p className="body-md" style={{ color: "var(--body-strong)", fontSize: 17, lineHeight: 1.55, fontFamily: "var(--font-display)", letterSpacing: "-0.2px" }}>
            {POSTMORTEM.summary}
          </p>
        </Card>
      </Section>

      {/* Strategy cards */}
      <Section title="Strategy cards" sub="Counter-moves to walk in with.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {POSTMORTEM.strategy.map((s, i) => <StrategyCard key={i} s={s} idx={i+1}/>)}
        </div>
      </Section>

      {/* Stakeholder alignment */}
      <Section title="Alignment shifts" sub="How each chair moved during the meeting.">
        <Card padding="var(--spacing-xl)">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {POSTMORTEM.alignment.map((a) => {
              const s = getStakeholderById(a.id);
              return (
                <div key={a.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr 220px", gap: 16, alignItems: "center", borderTop: "1px solid var(--hairline-soft)", paddingTop: 16 }}>
                  <Avatar stakeholder={s} size={40}/>
                  <div>
                    <div className="title-sm">{s.name}</div>
                    <div className="caption" style={{ marginBottom: 6 }}>{s.role}</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--body-strong)", letterSpacing: "-0.2px", lineHeight: 1.4 }}>
                      "{a.quote}"
                    </div>
                  </div>
                  <AlignmentBar delta={a.delta}/>
                </div>
              );
            })}
          </div>
        </Card>
      </Section>

      {/* Objection topology */}
      <Section title="Objection topology" sub="Where the room's resistance branched.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {POSTMORTEM.topology.map((t, i) => <TopologyCard key={i} t={t}/>)}
        </div>
      </Section>

      {/* Graph analytics */}
      <Section title="Graph analytics" sub="Cross-simulation patterns from your knowledge graph.">
        <Card padding="var(--spacing-xl)" dark>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
            <GraphStat label="Hostile pairs" items={POSTMORTEM.graph.hostile.map(([a,b]) => `${getStakeholderById(a)?.name.split(" ")[0]} ⟷ ${getStakeholderById(b)?.name.split(" ")[0]}`)}/>
            <GraphStat label="Influence chains" items={POSTMORTEM.graph.influence}/>
            <GraphStat label="Coalitions" items={POSTMORTEM.graph.coalitions.map(c => `T${c.t} · ${c.pair.map(id => getStakeholderById(id)?.name.split(" ")[0]).join(" + ")} · ${c.reason}`)}/>
            <GraphStat label="Interrupts" items={POSTMORTEM.graph.interrupts}/>
          </div>
        </Card>
      </Section>

      <div style={{ marginTop: "var(--spacing-xxl)", padding: "var(--spacing-xl)", background: "var(--primary)", color: "var(--on-primary)", borderRadius: "var(--rounded-lg)", display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div className="caption-uppercase" style={{ color: "var(--on-primary)", opacity: 0.8, marginBottom: 6 }}>Next move</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, lineHeight: 1.2, letterSpacing: "-0.4px" }}>
            Re-run with the cohort reframe in the founder's opening, and brief Priya on Threadline timing.
          </div>
        </div>
        <Btn variant="dark" style={{ background: "var(--ink)", color: "var(--on-dark)" }}>Branch simulation →</Btn>
      </div>
    </div>
  );
}

function Section({ title, sub, children }) {
  return (
    <div style={{ marginTop: "var(--spacing-xxl)" }}>
      <div style={{ marginBottom: "var(--spacing-lg)", display: "flex", alignItems: "baseline", gap: 14 }}>
        <h3 style={{ fontSize: "var(--display-sm-size)", color: "var(--ink)" }}>{title}</h3>
        {sub && <span className="caption" style={{ color: "var(--muted)" }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function StrategyCard({ s, idx }) {
  const riskTone = { LOW: "agreeable", MEDIUM: "calibrating", HIGH: "skeptical" }[s.risk];
  const riskAccent = { LOW: "var(--success)", MEDIUM: "var(--warning)", HIGH: "var(--error)" }[s.risk];
  return (
    <Card padding="var(--spacing-xl)" style={{ position: "relative", borderLeft: `3px solid ${riskAccent}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div className="caption-uppercase" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <SpikeMark size={9} color="var(--primary)"/>
          Card {String(idx).padStart(2, "0")}
        </div>
        <Badge tone={riskTone}>{s.risk} RISK</Badge>
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.25, letterSpacing: "-0.3px", color: "var(--ink)", marginBottom: 12 }}>
        {s.objection}
      </div>
      <div className="caption-uppercase" style={{ marginBottom: 4 }}>Counter</div>
      <p className="body-sm" style={{ color: "var(--body-strong)", lineHeight: 1.55 }}>{s.counter}</p>
    </Card>
  );
}

function AlignmentBar({ delta }) {
  const positive = delta >= 0;
  const pct = Math.min(100, Math.abs(delta) * 2);
  return (
    <div>
      <div className="caption-uppercase" style={{ marginBottom: 6 }}>Delta · {delta > 0 ? "+" : ""}{delta}</div>
      <div style={{ position: "relative", height: 8, background: "var(--surface-soft)", borderRadius: "var(--rounded-pill)" }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--hairline)" }}/>
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          background: positive ? "var(--success)" : "var(--error)",
          borderRadius: "var(--rounded-pill)",
          left: positive ? "50%" : `calc(50% - ${pct/2}%)`,
          width: `${pct/2}%`,
        }}/>
      </div>
      <div className="caption" style={{ marginTop: 4, fontSize: 11 }}>{positive ? "moved with you" : "moved against you"}</div>
    </div>
  );
}

function TopologyCard({ t }) {
  return (
    <Card padding="20px">
      <div className="caption-uppercase" style={{ marginBottom: 8 }}>Root</div>
      <div className="title-md" style={{ marginBottom: 14, color: "var(--ink)" }}>{t.root}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {t.children.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <svg width="10" height="20" viewBox="0 0 10 20" style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="M2 0v8M2 8h6" stroke="var(--hairline)" strokeWidth="1.2" fill="none"/>
            </svg>
            <div style={{ flex: 1 }}>
              <div className="body-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>{c.node}</div>
              <div className="caption" style={{ marginTop: 2, color: "var(--primary)", fontWeight: 500 }}>→ {c.resolution}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function GraphStat({ label, items }) {
  return (
    <div>
      <div className="caption-uppercase" style={{ color: "var(--on-dark-soft)", marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((x, i) => (
          <div key={i} style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--on-dark)", lineHeight: 1.45 }}>
            <span style={{ color: "var(--on-dark-soft)", marginRight: 6 }}>·</span>{x}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { PostmortemScreen });
