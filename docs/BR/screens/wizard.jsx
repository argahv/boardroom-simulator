/* Simulation Wizard — 3-step setup flow
   ============================================================================= */

function WizardScreen({ onLaunch }) {
  const [step, setStep] = useState(1);
  const [context, setContext] = useState(SCENARIO.context);
  const [goal, setGoal] = useState(SCENARIO.goal);
  const [selected, setSelected] = useState(STAKEHOLDERS.map((s) => s.id));
  const [incentives, setIncentives] = useState(
    Object.fromEntries(STAKEHOLDERS.map((s) => [s.id, s.incentive]))
  );
  const [agendas, setAgendas] = useState(
    Object.fromEntries(STAKEHOLDERS.map((s) => [s.id, s.agenda]))
  );
  const [voltage, setVoltage] = useState(SCENARIO.voltage);
  const [temp, setTemp] = useState(SCENARIO.temperature);
  const [flags, setFlags] = useState(SCENARIO.flags);

  const ctxValid = context.trim().length >= 10;
  const selValid = selected.length >= 2 && selected.length <= 8;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "var(--spacing-xxl) var(--spacing-xl)" }}>
      <div style={{ marginBottom: "var(--spacing-xl)" }}>
        <Eyebrow style={{ marginBottom: 12 }}>New simulation</Eyebrow>
        <h2 style={{ marginBottom: 8 }}>Series B / Catalyst Capital.</h2>
        <p style={{ color: "var(--muted)", maxWidth: 640 }}>
          Three steps. The room you build here will run on its own — your job is to set the stakes, pick the people, and dial the temperature.
        </p>
      </div>

      <StepRail step={step} setStep={setStep} ctxValid={ctxValid} selValid={selValid}/>

      <div style={{ marginTop: "var(--spacing-xl)" }}>
        {step === 1 && <Step1 ctx={context} setCtx={setContext} goal={goal} setGoal={setGoal} valid={ctxValid}/>}
        {step === 2 && (
          <Step2
            selected={selected} setSelected={setSelected}
            incentives={incentives} setIncentives={setIncentives}
            agendas={agendas} setAgendas={setAgendas}
          />
        )}
        {step === 3 && (
          <Step3
            voltage={voltage} setVoltage={setVoltage}
            temp={temp} setTemp={setTemp}
            flags={flags} setFlags={setFlags}
          />
        )}
      </div>

      <div style={{ marginTop: "var(--spacing-xxl)", display: "flex", justifyContent: "space-between" }}>
        <Btn variant="secondary" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>← Back</Btn>
        {step < 3 ? (
          <Btn variant="primary" onClick={() => setStep(step + 1)} disabled={(step === 1 && !ctxValid) || (step === 2 && !selValid)}>Continue →</Btn>
        ) : (
          <Btn variant="primary" onClick={() => onLaunch && onLaunch()}>
            Launch simulation
          </Btn>
        )}
      </div>
    </div>
  );
}

function StepRail({ step, setStep, ctxValid, selValid }) {
  const steps = [
    { n: 1, label: "Context", sub: "The deal" },
    { n: 2, label: "Stakeholders", sub: "The room" },
    { n: 3, label: "Environment", sub: "The temperature" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      {steps.map((s) => {
        const isActive = step === s.n;
        const isDone = step > s.n;
        const isReachable = s.n === 1 || (s.n === 2 && ctxValid) || (s.n === 3 && ctxValid && selValid);
        return (
          <button
            key={s.n}
            onClick={() => isReachable && setStep(s.n)}
            disabled={!isReachable}
            style={{
              background: isActive ? "var(--ink)" : "var(--surface-card)",
              color: isActive ? "var(--on-dark)" : (isDone ? "var(--ink)" : "var(--body)"),
              border: "none", textAlign: "left",
              padding: "14px 18px", borderRadius: "var(--rounded-md)",
              cursor: isReachable ? "pointer" : "not-allowed",
              opacity: isReachable ? 1 : 0.5,
              display: "flex", gap: 14, alignItems: "center",
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: "var(--rounded-pill)",
              background: isActive ? "var(--primary)" : (isDone ? "var(--success)" : "var(--canvas)"),
              color: (isActive || isDone) ? "var(--on-primary)" : "var(--muted)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-display)", fontSize: 16,
            }}>{isDone ? "✓" : s.n}</div>
            <div>
              <div className="title-sm" style={{ color: "inherit" }}>{s.label}</div>
              <div className="caption" style={{ color: isActive ? "var(--on-dark-soft)" : "var(--muted)" }}>{s.sub}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Step1({ ctx, setCtx, goal, setGoal, valid }) {
  return (
    <Card padding="var(--spacing-xl)">
      <h3 style={{ marginBottom: 6, fontSize: "var(--display-sm-size)" }}>What's the deal?</h3>
      <p className="body-sm" style={{ color: "var(--muted)", marginBottom: 24 }}>
        Describe the situation as if briefing a senior colleague. The more specific you are, the sharper the agents.
      </p>
      <div style={{ display: "grid", gap: 20 }}>
        <Field
          label="Background"
          value={ctx}
          onChange={setCtx}
          multiline rows={5}
          placeholder="The deal, the room, the pressure points..."
          hint={`${ctx.length} characters · 10 minimum`}
          error={!valid && ctx.length > 0 ? "Need at least 10 characters." : null}
        />
        <Field
          label="Primary goal"
          value={goal}
          onChange={setGoal}
          multiline rows={2}
          placeholder="The outcome you'd consider a win."
        />
      </div>
    </Card>
  );
}

function Step2({ selected, setSelected, incentives, setIncentives, agendas, setAgendas }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16, alignItems: "flex-start" }}>
      <Card padding="20px">
        <div className="caption-uppercase" style={{ marginBottom: 12 }}>Library · pick 2–8</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {STAKEHOLDERS.map((s) => {
            const on = selected.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => setSelected(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: 10, borderRadius: "var(--rounded-md)",
                  background: on ? "var(--canvas)" : "transparent",
                  border: "1px solid " + (on ? "var(--ink)" : "var(--hairline)"),
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <Avatar stakeholder={s} size={36}/>
                <div style={{ flex: 1 }}>
                  <div className="title-sm">{s.name}</div>
                  <div className="caption">{s.role}</div>
                </div>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: on ? "var(--ink)" : "transparent", border: "1px solid " + (on ? "var(--ink)" : "var(--hairline)"), display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-dark)", fontSize: 12 }}>{on ? "✓" : ""}</div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card padding="var(--spacing-xl)">
        <div className="caption-uppercase" style={{ marginBottom: 16 }}>Tune the room · {selected.length} selected</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {STAKEHOLDERS.filter((s) => selected.includes(s.id)).map((s) => (
            <div key={s.id} style={{ borderTop: "1px solid var(--hairline-soft)", paddingTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Avatar stakeholder={s} size={32}/>
                <div style={{ flex: 1 }}>
                  <div className="title-sm">{s.name}</div>
                  <div className="caption">{s.role} · {s.org}</div>
                </div>
                <Badge tone={tagTone(s.tag)}>{s.tag}</Badge>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                <LabeledSlider
                  label="Incentive intensity"
                  value={incentives[s.id]}
                  onChange={(v) => setIncentives({ ...incentives, [s.id]: v })}
                />
                <div>
                  <div className="caption-uppercase" style={{ marginBottom: 6 }}>Hidden agenda</div>
                  <textarea
                    value={agendas[s.id]}
                    onChange={(e) => setAgendas({ ...agendas, [s.id]: e.target.value })}
                    rows={2}
                    style={{
                      width: "100%", padding: 10, borderRadius: "var(--rounded-sm)",
                      border: "1px solid var(--hairline)", background: "var(--canvas)",
                      fontFamily: "var(--font-body)", fontSize: 13, color: "var(--ink)",
                      resize: "vertical", outline: "none",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Step3({ voltage, setVoltage, temp, setTemp, flags, setFlags }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "flex-start" }}>
      <Card padding="var(--spacing-xl)">
        <div className="caption-uppercase" style={{ marginBottom: 16 }}>Environment</div>
        <div style={{ display: "grid", gap: 24 }}>
          <div>
            <LabeledSlider
              label="Voltage"
              value={voltage}
              onChange={setVoltage}
              hint={
                voltage < 30 ? "Cordial — agents will look for alignment first." :
                voltage < 65 ? "Tense — agents will press disagreements." :
                "Combative — interrupts and walk-aways become likely."
              }
            />
          </div>
          <div>
            <div className="caption-uppercase" style={{ marginBottom: 8 }}>Model temperature</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["Stable", "Volatile"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTemp(t)}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    borderRadius: "var(--rounded-md)",
                    background: temp === t ? "var(--ink)" : "var(--canvas)",
                    color: temp === t ? "var(--on-dark)" : "var(--ink)",
                    border: "1px solid " + (temp === t ? "var(--ink)" : "var(--hairline)"),
                    fontFamily: "var(--font-body)", fontWeight: 500,
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 15 }}>{t}</div>
                  <div className="caption" style={{ color: temp === t ? "var(--on-dark-soft)" : "var(--muted)", marginTop: 2 }}>
                    {t === "Stable" ? "Predictable, fewer surprises." : "Hot takes, unscripted moves."}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card padding="var(--spacing-xl)">
        <div className="caption-uppercase" style={{ marginBottom: 8 }}>Flags</div>
        <p className="body-sm" style={{ color: "var(--muted)", marginBottom: 8 }}>
          Switch on the dynamics you want the room to model.
        </p>
        <ToggleRow
          label="Hidden motives"
          sub="Agents may act on undisclosed incentives — surfaces in postmortem."
          value={flags.hidden}
          onChange={(v) => setFlags({ ...flags, hidden: v })}
        />
        <ToggleRow
          label="Time pressure"
          sub="Voltage rises as turns elapse — interrupts become more likely."
          value={flags.time}
          onChange={(v) => setFlags({ ...flags, time: v })}
        />
        <ToggleRow
          label="External leaks"
          sub="Information from outside the room enters mid-sim."
          value={flags.leaks}
          onChange={(v) => setFlags({ ...flags, leaks: v })}
        />
        <ToggleRow
          label="Deadlock risk"
          sub="Agents may walk away. Use sparingly."
          value={flags.deadlock}
          onChange={(v) => setFlags({ ...flags, deadlock: v })}
        />
      </Card>
    </div>
  );
}

Object.assign(window, { WizardScreen });
