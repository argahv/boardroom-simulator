> ⚠️ **DEPRECATION NOTICE**: This document references v1 architecture (LangGraph StateGraph, Chroma memory). The current runtime is v2 Behavior Engine. See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for the current architecture.

# Boardroom Simulator — Roadmap

The roadmap is sequenced by evidence, not by feature ambition. Each phase has a success gate that must hold before the next phase begins. The dataset moat (Phase 6) runs in parallel from Phase 2 onward.

## Phase summary

| Phase | Window | Goal | Gate to next phase |
|---|---|---|---|
| 0. Manual validation | Week 1–2 | Prove the briefing format is useful when hand-orchestrated. | 5 of 6 hand-written briefings rated "would have changed how I ran the call" by the AE. |
| 1. MVP | Week 3–8 | Ship the form → simulation → briefing loop and run the A/B test. | Hit rate ≥ 60%, behavior change ≥ 40%, 30-day retention ≥ 50% across 8–10 users. |
| 2. Feedback loop | Month 2–3 | Close the loop between briefings and real call outcomes. | ≥ 70% of briefings have post-call feedback within 48 hours; hit rate tracked per persona archetype. |
| 3. Context depth | Month 3–5 | Reduce manual data entry; ground personas in real evidence. | Briefing quality (blind rater score) improves ≥ 20% with integrations on vs. off. |
| 4. Interactive rehearsal | Month 5–7 | Let users practice responding to predicted objections. | ≥ 30% of active users use rehearsal at least once per briefing; rehearsal users show higher win rate than non-rehearsal users in same cohort. |
| 5. Visual meeting room | Month 8+ | Give the briefing a visual interface for buyers who want it. | Visual mode chosen by ≥ 25% of users without lowering hit rate or retention. |
| 6. Dataset moat | Ongoing from Month 2 | Build a proprietary ground-truth dataset and use it to improve accuracy. | Continuous; measured by quarterly hit-rate improvement. |

---

## Phase 0 — Manual validation (Week 1–2)

**Goal.** Confirm that a pre-call briefing in the proposed format is useful before writing any product code.

**Features shipped.**
- A shared deal-intake Google Form
- A Notion or Google Docs template for the briefing
- A founder-led process: read the form, manually run 3–5 LLM prompts against the deal context (one per persona), synthesize by hand into a 2-page briefing, deliver via email
- A short follow-up call or form 48 hours after each user's real sales call

**Success gate.**
- 5 of 6 recipients say the briefing "would have changed how I ran the call" or "surfaced something I hadn't thought about"
- At least 3 recipients ask for another one unprompted

**Risks.**
- Briefing quality is too dependent on the founder's manual judgement; signal does not transfer to an automated version
- AEs say it is interesting but do not change behavior
- 2 weeks is not enough to land 6 real calls in the target ACV band

---

## Phase 1 — MVP (Week 3–8)

**Goal.** Replace the manual workflow with an automated multi-agent simulation and run the A/B test defined in `MVP.md`.

**Features shipped.**
- Web app with auth, deal intake, stakeholder builder
- LangGraph-based multi-agent simulation (3–6 agents, 4–8 turns)
- Briefing generator and PDF export
- Post-call feedback form
- Internal team dashboard to inspect every transcript and feedback response
- A/B harness that routes deals to either multi-agent or single-agent mode

**Success gate.** All three MVP metrics hold across the 8–10 user cohort:
- Simulation hit rate ≥ 60%
- Behavior change rate ≥ 40%
- 30-day retention ≥ 50%
- AND multi-agent outperforms single-agent by ≥ 10 points on hit rate

**Risks.**
- Personas feel generic; agents agree too easily and produce flat briefings
- Hit rate is high but driven by obvious objections — no incremental insight over a single-agent baseline
- Users fill the form sloppily, garbage in / garbage out
- Latency or cost per briefing makes pricing unviable

---

## Phase 2 — Feedback loop (Month 2–3)

**Goal.** Make post-call feedback a first-class part of the product so simulation accuracy can be measured continuously, not just during a test window.

**Features shipped.**
- Automated post-call reminders (email + Slack) at T+24h and T+48h
- Structured feedback form with objection-level tagging (each predicted objection can be marked hit / partial / miss)
- "Missed objection" capture: free-text field for objections the briefing did not predict
- Per-user dashboard showing personal hit rate, behavior change rate, and trend over time
- Per-persona dashboard (internal) showing which archetypes predict well and which do not
- "Trust score" surfaced to the user: confidence band on each predicted objection, calibrated from historical hit rates

**Success gate.**
- ≥ 70% of completed briefings receive post-call feedback within 48 hours
- Hit rate can be reported per persona archetype with statistical confidence (≥ 30 calls per archetype)
- Users self-report increased trust in the briefing over time (survey)

**Risks.**
- Feedback fatigue — users complete the form once, then stop
- Self-reported "did the briefing change my behavior" is unreliable; we need an external signal
- Hit rate plateaus and we cannot tell whether the cause is persona quality or input data quality

---

## Phase 3 — Context depth (Month 3–5)

**Goal.** Replace manual stakeholder entry with real signal from the systems the AE already uses, so personas are grounded in evidence instead of free-text notes.

**Features shipped.**

| Integration | What it provides |
|---|---|
| Salesforce | Deal stage, amount, contact roles, activity history, notes |
| HubSpot | Same as above, alternate CRM |
| LinkedIn (via Sales Navigator or compliant scrape partner) | Stakeholder tenure, prior companies, signals about seniority and decision authority |
| Gong / Chorus call transcripts | Verbatim quotes from prior calls grounding each persona's voice |
| Email thread import (Gmail / Outlook) | Tone, response latency, who is cc'd |

- A persona-grounding pipeline that turns these inputs into per-stakeholder context blocks fed to each agent
- A "show your sources" panel in the briefing: every predicted objection cites the evidence behind it

**Success gate.**
- Blind raters (internal) score briefings produced with integrations ≥ 20% higher than briefings produced from manual entry on the same deals
- ≥ 60% of active users connect at least one integration within 2 weeks of it being offered
- Hit rate improves by ≥ 5 percentage points after integrations roll out

**Risks.**
- Salesforce / HubSpot integration is engineering-heavy and slows other work
- LinkedIn data acquisition is legally and contractually fragile
- Gong transcripts contain noise (small talk, irrelevant deals); persona grounding degrades instead of improving
- Privacy and security review at customer companies blocks adoption

---

## Phase 4 — Interactive rehearsal (Month 5–7)

**Goal.** Let the user practice the call by responding live to the predicted objections, with agents pushing back in character.

**Features shipped.**
- Rehearsal mode: from any briefing, click an objection to open a chat with the agent that raised it
- The agent stays in character (CFO, legal, etc.) and pushes back on the user's response
- Session summary: a short critique of how the user handled each rehearsal
- Optional voice mode (speech-to-text + text-to-speech) for verbal practice

**Success gate.**
- ≥ 30% of active users enter rehearsal mode at least once per briefing
- In a within-user comparison, calls preceded by rehearsal show a measurably higher rate of "advanced" outcomes than calls without rehearsal
- Average rehearsal session length ≥ 5 minutes (indicates genuine engagement, not curiosity)

**Risks.**
- Rehearsal becomes a toy — fun once, never used again
- Agents are too easy to "win" against; users lose trust in the simulation
- Voice mode is technically possible but UX-poor; adds cost without value
- Rehearsal cannibalizes briefing usage instead of complementing it

---

## Phase 5 — Visual meeting room (Month 8+)

**Goal.** Offer a visual representation of the simulation for users who want it, without abandoning the briefing as the primary output.

**Features shipped.**
- A meeting-room view showing each agent as a tile with name, role, and current state
- Transcript of the multi-agent debate, replayable turn by turn
- Highlight reel: the 3–5 most important exchanges, surfaced automatically
- Option to "join" the room and inject a message that the agents must respond to

**Success gate.**
- ≥ 25% of users choose visual mode at least once per month
- Visual mode does not lower hit rate or retention vs. briefing-only mode
- Sales calls and customer interviews indicate the visual is a paid-tier differentiator, not just a demo asset

**Risks.**
- Visual mode dilutes the product story ("is this a briefing tool or a roleplay tool?")
- Engineering cost is high; opportunity cost vs. continuing to deepen Phase 3 integrations
- The visual is impressive in demos but unused in practice

---

## Phase 6 — Dataset moat (ongoing from Month 2)

**Goal.** Turn every briefing and every post-call feedback response into a proprietary dataset that improves the product over time and is difficult for competitors to replicate.

**Features shipped (incrementally).**
- Structured storage of every (deal context, transcript, briefing, real-call outcome) tuple
- Per-persona accuracy scoring, tracked over time
- Automated objection taxonomy: cluster predicted and reported objections into a stable schema so accuracy is measurable across deals
- Calibration model that adjusts confidence bands on predicted objections from historical data
- Eval harness: regression tests that re-run historical deals against new prompt or model versions and report hit-rate delta
- Eventually (when volume justifies it): fine-tuned persona models distilled from frontier-model traces plus our ground-truth labels

**Success gate (continuous, not one-time).**
- Hit rate improves measurably each quarter
- Eval harness blocks shipping any prompt or model change that lowers hit rate by more than 2 points
- A documented data advantage exists: the size and labeled quality of our (briefing, outcome) corpus exceeds anything reproducible from public data

**Risks.**
- Data accumulates but quality is low; feedback is sparse or biased
- Objection taxonomy is unstable across industries, preventing cross-deal learning
- Customers raise concerns about deal data being used for training; we must offer per-customer opt-out and a clean separation between aggregate learning and customer-specific data
- Frontier models improve faster than our fine-tuned ones, eroding the value of the dataset asset
