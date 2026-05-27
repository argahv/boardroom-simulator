> ⚠️ **DEPRECATION NOTICE**: This document references v1 architecture (LangGraph StateGraph, Chroma memory). The current runtime is v2 Behavior Engine. See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for the current architecture.

# Boardroom Simulator — MVP

## 1. What the MVP is

Boardroom Simulator is a pre-call strategic briefing tool for enterprise sellers. An Account Executive enters the context of an upcoming deal — company, stakeholders, deal stage, known objections — and the system runs a multi-agent simulation in which each agent represents a member of the buyer's committee (CFO, legal, IT champion, skeptical executive). The output is a 2-page written briefing delivered before the call: likely objections, coalition dynamics between stakeholders, and recommended positioning moves. The MVP tests one premise: that a multi-agent simulation surfaces objections and dynamics the seller would not have anticipated alone.

## 2. Target user

Account Executives at Series B–D B2B SaaS companies selling $250K–$5M ACV deals into buying committees of four or more stakeholders. They run 3–8 high-stakes calls per quarter where a single missed objection costs the cycle. They are paid on closed revenue, have CRM discipline, and already use call-coaching tools (Gong, Chorus). They are not SDRs, not transactional sellers, and not enterprise sellers running 18-month deals where pre-call prep is already handled by a deal desk.

## 3. Core user flow

1. **Deal intake.** AE opens the web app, creates a new deal, and fills a structured form: company name and industry, deal size, stage in the cycle, named stakeholders with titles, known objections, the specific call coming up (discovery, technical deep-dive, procurement, executive readout), and the seller's intended outcome for that call.
2. **Stakeholder mapping.** For each named stakeholder, the AE selects a persona archetype (economic buyer, technical champion, security/legal gatekeeper, skeptical executive, end user) and adds free-text notes on what is known about them.
3. **Simulation run.** The backend instantiates one agent per stakeholder, each with a persona prompt, the deal context, and conflicting incentives. Agents exchange messages in a structured multi-turn debate about the seller's proposal. The conversation is not shown to the user.
4. **Briefing generation.** A summarizer agent reads the full transcript and produces a 2-page briefing: top 5 likely objections ranked by probability, coalition map (who aligns with whom and why), three recommended positioning moves, and one "watch for this" risk callout.
5. **Briefing delivery.** The briefing is rendered in-app and emailed as a PDF. The AE reads it before the call.
6. **Post-call feedback.** Within 48 hours after the call, the AE returns to the deal record and answers four questions: Which predicted objections actually came up? Were there objections we missed? Did the briefing change how you ran the call? What was the call outcome (advanced, stalled, lost)?

## 4. MVP feature set

- Authentication (email + password, single-tenant accounts)
- Deal intake form with structured fields and free-text notes
- Stakeholder builder (add up to 6 stakeholders per deal, assign persona archetype)
- Five predefined persona archetypes with editable system prompts (admin-only)
- Multi-agent simulation engine (LangGraph orchestrating 3–6 agents over 4–8 turns)
- Briefing generator (one summarizer pass over the transcript)
- Briefing renderer (web view + downloadable PDF)
- Post-call feedback form (4 questions, structured + free text)
- Internal dashboard for the team to read every briefing and every feedback response
- Manual prompt iteration loop (no automated learning yet)

## 5. What the MVP explicitly excludes

| Excluded | One-line reason |
|---|---|
| Visual meeting-room UI with avatars | Briefing-first delivery is the bet; visuals add cost without testing the core premise. |
| Real-time streaming agent conversation | Async output is faster to build and easier to evaluate against ground truth. |
| CRM integration (Salesforce, HubSpot) | Manual entry is acceptable for 8–10 design-partner users; integration is Phase 3. |
| LinkedIn / Gong context ingestion | Same as above — defer until the core simulation is proven useful. |
| Vector database / long-term memory graph | No persistent stakeholder memory needed before we have repeat usage data. |
| User-facing prompt editing | Persona quality is our responsibility during validation; exposing prompts invites variance we cannot debug. |
| Interactive rehearsal / chat-back mode | A different product motion; only worth building once the briefing has proven value. |
| Mobile app | Pre-call prep happens at a desk. |
| Multi-tenant org hierarchy, SSO, RBAC | Single-user accounts are sufficient for the 8–10 user validation cohort. |
| Fine-tuned models or custom inference stack | Frontier models with good prompts are the baseline; tuning comes after the dataset exists. |

## 6. Success metrics

The MVP is validated if, across the 8–10 user cohort over 4 weeks of usage, all three of the following hold:

| Metric | Target | How it is measured |
|---|---|---|
| Simulation hit rate | ≥ 60% | Of objections raised on the real call, the share that appeared in the briefing. Computed from the post-call feedback form. |
| Behavior change rate | ≥ 40% | Share of calls where the AE reports the briefing changed how they ran the call (specific question on the feedback form). |
| 30-day retention | ≥ 50% | Share of users who run a second briefing within 30 days of their first. |

If hit rate is below 60%, the simulation is not seeing what the seller cannot. If behavior change is below 40%, the briefing is interesting but not useful. If retention is below 50%, the product is a one-time novelty.

## 7. Technical stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | Fast iteration, good defaults, server actions remove a layer of plumbing. |
| Backend | Python 3.11 + FastAPI | Co-located with the agent runtime; clean async support. |
| Agent orchestration | LangGraph | Explicit state machine for multi-agent turns; easier to debug than implicit chains. |
| Model provider | Anthropic Claude (Sonnet for agents, Opus for the summarizer) | Strong instruction-following and long-context reasoning. |
| Database | PostgreSQL (managed, e.g. Neon or Supabase) | Stores deals, stakeholders, transcripts, briefings, feedback. JSONB for transcripts. |
| Job queue | Postgres-backed queue (e.g. `pg-boss` or Celery + Redis if scaled) | Simulation runs take 30–90 seconds; not request-time work. |
| PDF rendering | Server-side HTML-to-PDF (Playwright or WeasyPrint) | Trivial to template from the same component used in-app. |
| Auth | Clerk or Auth.js | Skip building it. |
| Hosting | Vercel (frontend) + Fly.io or Render (backend + workers) | Cheap, fast to deploy, no infra investment. |
| Observability | LangSmith or Langfuse + standard app logs | Every transcript must be inspectable by the team during validation. |

Explicitly not in the MVP stack: vector DB, embedding pipeline, fine-tuning infrastructure, dedicated analytics warehouse.

## 8. MVP validation test

A 2–4 week structured A/B test against 8–10 design-partner Account Executives.

**Recruiting.** Recruit 8–10 AEs from Series B–D B2B SaaS companies in the target ACV band. Each AE commits to running the tool on at least 3 upcoming deals and completing the post-call feedback form within 48 hours.

**Treatment design.** For each AE, alternate two briefing modes across their deals:
- **Multi-agent briefing**: the full simulation as described above.
- **Single-agent briefing**: one LLM call that receives the same deal context and produces a "what objections should I expect" briefing, with no multi-agent debate.

Both briefings are formatted identically. The AE does not know which mode produced any given briefing.

**Data collected per deal.** Deal context (inputs), full transcript (multi-agent only), generated briefing, post-call feedback form, call outcome.

**Decision criteria after 4 weeks.**

| Outcome | Decision |
|---|---|
| Multi-agent hit rate ≥ 60% AND ≥ 10 percentage points above single-agent | Proceed to Phase 2 (feedback loop). |
| Multi-agent and single-agent within 5 points of each other | The multi-agent premise is not paying off. Investigate persona quality or kill the multi-agent approach. |
| Both modes below 50% hit rate | The data input is insufficient. Move CRM/Gong integration earlier in the roadmap. |
| Behavior change rate below 40% in both modes | The briefing format is wrong, not the simulation. Redesign the output. |

The test ends with a written readout: hit rates per mode, qualitative quotes from each AE, list of objections we systematically missed, and a go/no-go on Phase 2.
