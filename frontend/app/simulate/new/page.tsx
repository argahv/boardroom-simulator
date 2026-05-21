"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { createSimulation, fetchLibrary } from "@/lib/api";
import type { EnvFlags, ModelTemperature, Stakeholder } from "@/lib/types";

const emptyEnvFlags: EnvFlags = {
  hidden_motives: true,
  time_pressure: false,
  external_leaks: false,
  deadlock_risk: false
};

const envFlagDescriptions: Record<keyof EnvFlags, string> = {
  hidden_motives: "Agents harbor undisclosed incentives that complicate resolution",
  time_pressure: "Negotiation intensity increases as turn limit approaches",
  external_leaks: "Sensitive information may spill between stakeholder groups",
  deadlock_risk: "High tension increases probability of walk-away outcomes"
};

export default function NewSimulationPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [background, setBackground] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [library, setLibrary] = useState<Stakeholder[]>([]);
  const [selected, setSelected] = useState<Stakeholder[]>([]);
  const [voltage, setVoltage] = useState(50);
  const [envFlags, setEnvFlags] = useState<EnvFlags>(emptyEnvFlags);
  const [modelTemperature, setModelTemperature] = useState<ModelTemperature>("stable");
  const [error, setError] = useState("");
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;

    fetchLibrary()
      .then((data) => {
        if (!alive) {
          return;
        }
        setLibrary(data);
        setSelected(data.slice(0, 3));
      })
      .catch((caught: unknown) => {
        if (caught instanceof Error) {
          setError(caught.message);
        } else {
          setError("Unable to load stakeholder library.");
        }
      })
      .finally(() => {
        if (alive) {
          setLoadingLibrary(false);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  const selectedIds = useMemo(() => new Set(selected.map((stakeholder) => stakeholder.id)), [selected]);

  const toggleStakeholder = (stakeholder: Stakeholder) => {
    setSelected((current) => {
      if (current.some((item) => item.id === stakeholder.id)) {
        return current.filter((item) => item.id !== stakeholder.id);
      }

      return [...current, stakeholder];
    });
  };

  const updateStakeholder = (id: string, patch: Partial<Stakeholder>) => {
    setSelected((current) =>
      current.map((stakeholder) =>
        stakeholder.id === id ? { ...stakeholder, ...patch } : stakeholder
      )
    );
  };

  const validateStep = (stepNum: number): boolean => {
    const errors: Record<string, string> = {};

    if (stepNum === 1) {
      if (!background.trim()) errors.background = "Context background is required";
      if (!primaryGoal.trim()) errors.primaryGoal = "Primary goal is required";
      if (background.trim().length < 10) errors.background = "Background must be at least 10 characters";
      if (primaryGoal.trim().length < 10) errors.primaryGoal = "Goal must be at least 10 characters";
    }

    if (stepNum === 2) {
      if (selected.length < 2) errors.stakeholders = "Select at least 2 stakeholders";
      if (selected.length > 8) errors.stakeholders = "Maximum 8 stakeholders allowed";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((current) => current + 1);
    }
  };

  const finish = async () => {
    if (!validateStep(3)) {
      setError("Please review the errors above");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const simulation = await createSimulation({
        background,
        primary_goal: primaryGoal,
        stakeholders: selected,
        voltage,
        env_flags: envFlags,
        model_temperature: modelTemperature
      });
      router.push(`/simulate/${simulation.simulation_id}`);
    } catch (caught) {
      if (caught instanceof Error) {
        setError(caught.message);
      } else {
        setError("Unable to create simulation. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">New Simulation</p>
          <h2 className="mt-3 font-display text-5xl font-semibold tracking-display">Configure the room</h2>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((item) => (
            <span
              key={item}
              className={`h-2.5 w-12 rounded-full ${item <= step ? "bg-primary" : "bg-ink/10"}`}
            />
          ))}
        </div>
      </div>

      {error ? <div className="mb-5 rounded-2xl bg-primary/10 p-4 text-sm text-primary-active">{error}</div> : null}

      {step === 1 ? (
        <section className="grid gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-muted">Context background</span>
            <textarea
              value={background}
              onChange={(event) => {
                setBackground(event.target.value);
                setValidationErrors((prev) => ({ ...prev, background: "" }));
              }}
              className={`min-h-44 rounded-3xl border bg-white/50 p-5 outline-none focus:border-primary transition ${
                validationErrors.background ? "border-error" : "border-ink/10 focus:border-primary"
              }`}
              placeholder="Describe the deal, pressure, stakeholder politics, and open questions."
            />
            {validationErrors.background && (
              <span className="text-sm text-error">{validationErrors.background}</span>
            )}
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-muted">Primary goal</span>
            <input
              value={primaryGoal}
              onChange={(event) => {
                setPrimaryGoal(event.target.value);
                setValidationErrors((prev) => ({ ...prev, primaryGoal: "" }));
              }}
              className={`rounded-full border bg-white/50 px-5 py-4 outline-none transition ${
                validationErrors.primaryGoal ? "border-error" : "border-ink/10 focus:border-primary"
              }`}
              placeholder="e.g. Secure a term sheet without unlimited exclusivity."
            />
            {validationErrors.primaryGoal && (
              <span className="text-sm text-error">{validationErrors.primaryGoal}</span>
            )}
          </label>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div>
            <h3 className="font-display text-3xl font-semibold">Stakeholder library</h3>
            <div className="mt-4 grid gap-3">
              {loadingLibrary ? <p className="text-muted">Loading stakeholders...</p> : null}
              {library.map((stakeholder) => (
                <button
                  key={stakeholder.id}
                  onClick={() => {
                    toggleStakeholder(stakeholder);
                    setValidationErrors((prev) => ({ ...prev, stakeholders: "" }));
                  }}
                  className={`rounded-3xl border p-4 text-left transition ${
                    selectedIds.has(stakeholder.id)
                      ? "border-primary bg-primary/10"
                      : "border-ink/10 bg-white/40 hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{stakeholder.name}</p>
                      <p className="text-sm text-muted">{stakeholder.role}</p>
                    </div>
                    <span className="rounded-full bg-surface-card px-3 py-1 text-xs">{stakeholder.tag}</span>
                  </div>
                  <p className="mt-3 text-sm text-muted">{stakeholder.focus}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-display text-3xl font-semibold">Selected tuning</h3>
            {validationErrors.stakeholders && (
              <div className="mt-3 rounded-2xl bg-error/10 p-3 text-sm text-error">{validationErrors.stakeholders}</div>
            )}
            <div className="mt-4 space-y-4">
              {selected.map((stakeholder) => (
                <div key={stakeholder.id} className="rounded-3xl bg-surface-card p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{stakeholder.name}</p>
                    <button className="text-sm text-primary-active" onClick={() => toggleStakeholder(stakeholder)}>
                      Remove
                    </button>
                  </div>
                  <label className="mt-4 block text-sm text-muted">
                    Incentive {stakeholder.incentive_tuning}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={stakeholder.incentive_tuning}
                      onChange={(event) =>
                        updateStakeholder(stakeholder.id, {
                          incentive_tuning: Number(event.target.value)
                        })
                      }
                      className="mt-2 w-full accent-primary"
                    />
                  </label>
                  <textarea
                    value={stakeholder.hidden_agenda}
                    onChange={(event) =>
                      updateStakeholder(stakeholder.id, { hidden_agenda: event.target.value })
                    }
                    className="mt-3 min-h-24 w-full rounded-2xl border border-ink/10 bg-white/45 p-3 text-sm outline-none focus:border-primary"
                    placeholder="e.g., Planning for private equity exit..."
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl bg-surface-card p-6">
            <h3 className="font-display text-3xl font-semibold">Adjust Tension</h3>
            <label className="mt-6 block text-sm text-muted">
              Voltage {voltage}
              <input
                type="range"
                min="0"
                max="100"
                value={voltage}
                onChange={(event) => setVoltage(Number(event.target.value))}
                className="mt-3 w-full accent-primary"
              />
            </label>
            <div className="mt-6 flex gap-2 rounded-full bg-white/50 p-1">
              {(["stable", "volatile"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setModelTemperature(mode)}
                  className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold capitalize ${
                    modelTemperature === mode ? "bg-surface-dark text-canvas" : "text-muted"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            {Object.entries(envFlags).map(([key, value]) => (
              <label key={key} className="flex flex-col gap-2 rounded-3xl bg-white/45 p-5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold capitalize">{key.replaceAll("_", " ")}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(event) =>
                      setEnvFlags((current) => ({
                        ...current,
                        [key]: event.target.checked
                      }))
                    }
                    className="h-5 w-5 accent-primary"
                  />
                </div>
                <p className="text-sm text-muted">{envFlagDescriptions[key as keyof EnvFlags]}</p>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-8 flex justify-between">
        <Button variant="ghost" disabled={step === 1} onClick={() => setStep((current) => current - 1)}>
          Back
        </Button>
        {step < 3 ? (
          <Button onClick={handleNext}>
            Continue
          </Button>
        ) : (
          <Button onClick={finish} disabled={submitting || selected.length < 2}>
            {submitting ? "Creating..." : "Finish & enter war room"}
          </Button>
        )}
      </div>
    </AppShell>
  );
}
