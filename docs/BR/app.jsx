/* Main app shell — top nav, screen routing
   ============================================================================= */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "voltage": 62,
  "speed": "Normal",
  "showEventLog": true,
  "showLeaderboard": true,
  "compactMode": false
}/*EDITMODE-END*/;

function App() {
  const [route, setRoute] = useState("warroom"); // library | wizard | warroom | postmortem
  const [layout, setLayout] = useState("roster"); // roster | table | graph
  const { values: tweaks, setTweak } = useTweaks(TWEAK_DEFAULTS);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopNav route={route} setRoute={setRoute}/>

      <main style={{ flex: 1 }} data-screen-label={routeLabel(route)}>
        {route === "library" && <LibraryScreen onUseInWizard={() => setRoute("wizard")}/>}
        {route === "wizard"  && <WizardScreen onLaunch={() => setRoute("warroom")}/>}
        {route === "warroom" && <WarRoomScreen layout={layout} setLayout={setLayout} tweaks={tweaks}/>}
        {route === "postmortem" && <PostmortemScreen/>}
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Simulation">
          <TweakSlider label="Voltage" min={0} max={100} value={tweaks.voltage} onChange={(v) => setTweak("voltage", v)}/>
          <TweakRadio label="Speed" value={tweaks.speed} options={["Slow", "Normal", "Fast"]} onChange={(v) => setTweak("speed", v)}/>
        </TweakSection>
        <TweakSection label="War Room layout">
          <TweakRadio
            label="View"
            value={layout === "roster" ? "Roster" : layout === "table" ? "Table" : "Graph"}
            options={["Roster", "Table", "Graph"]}
            onChange={(v) => setLayout(v.toLowerCase())}
          />
        </TweakSection>
        <TweakSection label="Panels">
          <TweakToggle label="Event log" value={tweaks.showEventLog} onChange={(v) => setTweak("showEventLog", v)}/>
          <TweakToggle label="Leaderboard" value={tweaks.showLeaderboard} onChange={(v) => setTweak("showLeaderboard", v)}/>
          <TweakToggle label="Compact mode" value={tweaks.compactMode} onChange={(v) => setTweak("compactMode", v)}/>
        </TweakSection>
        <TweakSection label="Jump to">
          <TweakButton label="Stakeholder library" onClick={() => setRoute("library")}/>
          <TweakButton label="New simulation" onClick={() => setRoute("wizard")}/>
          <TweakButton label="War room" onClick={() => setRoute("warroom")}/>
          <TweakButton label="Postmortem" onClick={() => setRoute("postmortem")}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

function routeLabel(r) {
  return {
    library: "01 Stakeholder Library",
    wizard: "02 Simulation Wizard",
    warroom: "03 War Room",
    postmortem: "04 Postmortem",
  }[r];
}

function TopNav({ route, setRoute }) {
  const tabs = [
    { id: "library", label: "Library" },
    { id: "wizard", label: "New simulation" },
    { id: "warroom", label: "War room" },
    { id: "postmortem", label: "Postmortem" },
  ];
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "var(--canvas)", borderBottom: "1px solid var(--hairline)",
      padding: "14px 20px",
      display: "flex", alignItems: "center", gap: 32,
    }}>
      <button onClick={() => setRoute("warroom")} style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "transparent", border: "none", cursor: "pointer",
        padding: 0, whiteSpace: "nowrap",
      }}>
        <SpikeMark size={20} color="var(--primary)"/>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: "-0.6px", color: "var(--ink)" }}>
          Boardroom
        </span>
      </button>

      <nav style={{ marginLeft: 32, display: "flex", gap: 4 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setRoute(t.id)}
            className="nav-link"
            style={{
              background: route === t.id ? "var(--surface-card)" : "transparent",
              color: route === t.id ? "var(--ink)" : "var(--muted)",
              border: "none",
              padding: "8px 14px",
              borderRadius: "var(--rounded-md)",
              cursor: "pointer",
              fontWeight: route === t.id ? 500 : 500,
            }}
          >{t.label}</button>
        ))}
      </nav>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, paddingLeft: 16, borderLeft: "1px solid var(--hairline)" }}>
        <div className="caption" style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>{SCENARIO.company}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <Badge tone="soft">DRAFT</Badge>
        </div>
        <div style={{ width: 1, height: 22, background: "var(--hairline)" }}/>
        <div style={{ width: 32, height: 32, borderRadius: "var(--rounded-pill)", background: "var(--ink)", color: "var(--on-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 14 }}>EH</div>
        <div style={{ whiteSpace: "nowrap" }}>
          <div className="caption" style={{ color: "var(--ink)", fontWeight: 500, lineHeight: 1.2 }}>Elena Hart</div>
          <div className="caption" style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.2 }}>CEO · Hearthline</div>
        </div>
      </div>
    </header>
  );
}

/* ---------- Mount ---------- */
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
