/* Stakeholder Library screen — persistent persona library
   ============================================================================= */

function LibraryScreen({ onUseInWizard }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("all");

  const all = STAKEHOLDERS;
  const filtered = all.filter((s) => {
    if (tag !== "all" && s.tag !== tag) return false;
    if (query && !(`${s.name} ${s.role} ${s.org} ${s.focus}`.toLowerCase().includes(query.toLowerCase()))) return false;
    return true;
  });

  const tags = ["all", "SKEPTICAL", "AGREEABLE", "CALIBRATING", "VISIONARY", "LOCKED"];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "var(--spacing-xxl) var(--spacing-xl)" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginBottom: "var(--spacing-xl)" }}>
        <div>
          <Eyebrow style={{ marginBottom: 12 }}>Stakeholder library</Eyebrow>
          <h2 style={{ marginBottom: 8 }}>Personas you've trained.</h2>
          <p style={{ maxWidth: 620, color: "var(--muted)" }}>
            Reusable agents you can drop into any simulation. Their tools, incentives and hidden agendas persist across runs — tuning here changes how they behave in every boardroom you build.
          </p>
        </div>
        <Btn variant="primary"><SpikeMark size={12} color="var(--on-primary)"/>New stakeholder</Btn>
      </div>

      {/* filter bar */}
      <div style={{
        display: "flex", gap: 12, alignItems: "center", marginBottom: "var(--spacing-lg)",
        padding: "12px 16px", background: "var(--surface-soft)", borderRadius: "var(--rounded-md)",
        border: "1px solid var(--hairline)",
      }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, role, focus..."
          style={{
            flex: 1, border: "none", background: "transparent", outline: "none",
            fontSize: "var(--body-md-size)", fontFamily: "var(--font-body)", color: "var(--ink)",
          }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(t)}
              style={{
                background: tag === t ? "var(--ink)" : "transparent",
                color: tag === t ? "var(--on-dark)" : "var(--muted)",
                border: "1px solid " + (tag === t ? "var(--ink)" : "var(--hairline)"),
                fontFamily: "var(--font-body)", fontWeight: 500, fontSize: 11,
                padding: "5px 11px", borderRadius: "var(--rounded-pill)",
                letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
              }}
            >{t}</button>
          ))}
        </div>
      </div>

      {/* grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
        {filtered.map((s) => <PersonaCard key={s.id} s={s} onUse={onUseInWizard} />)}
      </div>

      {/* footer note */}
      <div style={{ marginTop: "var(--spacing-xxl)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <SmallStat n="14" l="Personas in library" />
        <SmallStat n="9" l="Used this month" />
        <SmallStat n="3" l="Custom (yours)" />
      </div>
    </div>
  );
}

function PersonaCard({ s, onUse }) {
  return (
    <Card padding="20px" style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
        <Avatar stakeholder={s} size={48}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title-md" style={{ color: "var(--ink)" }}>{s.name}</div>
          <div className="caption" style={{ color: "var(--muted)" }}>{s.role} · {s.org}</div>
        </div>
        <Badge tone={tagTone(s.tag)}>{s.tag}</Badge>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <Badge tone="soft">{s.tools === "none" ? "no tools" : s.tools}</Badge>
        <Badge tone="soft">focus · {s.focus}</Badge>
      </div>
      <div>
        <div className="caption-uppercase" style={{ marginBottom: 4, fontSize: 9, opacity: 0.7 }}>Incentive · {s.incentive}</div>
        <Voltage value={s.incentive} />
      </div>
      <div style={{ marginTop: 12, borderTop: "1px solid var(--hairline-soft)", paddingTop: 12 }}>
        <div className="caption-uppercase" style={{ marginBottom: 4, fontSize: 9, opacity: 0.7 }}>Hidden agenda</div>
        <div className="body-sm" style={{ fontStyle: "italic", color: "var(--body-strong)" }}>
          "{s.agenda}"
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn variant="ghost" style={{ padding: "6px 12px", fontSize: 13 }}>Edit</Btn>
        <Btn variant="dark" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => onUse && onUse(s)}>Add to sim</Btn>
      </div>
    </Card>
  );
}

function SmallStat({ n, l }) {
  return (
    <div style={{ padding: 16, borderLeft: "1px solid var(--hairline)" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 40, lineHeight: 1, letterSpacing: "-1px", color: "var(--ink)" }}>{n}</div>
      <div className="caption" style={{ marginTop: 4 }}>{l}</div>
    </div>
  );
}

Object.assign(window, { LibraryScreen });
