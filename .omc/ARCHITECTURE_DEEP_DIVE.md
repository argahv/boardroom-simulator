# Boardroom Simulator — Complete Architecture Deep Dive

**Generated:** 2026-05-24
**Source:** 3 parallel explore agents covering backend runtime (33 modules), frontend (40+ files), docs + tests (30+ files)

---

## Project Identity

Multi-agent negotiation simulator — FastAPI+LangGraph backend, Next.js 16 frontend. Models enterprise deal-room dynamics with AI stakeholders. Not a chatbot. An **event-driven cognitive society simulator**.

## Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI + Python 3.11+, Pydantic v2, asyncio |
| Frontend | Next.js 16 (--turbo), React 19, Tailwind CSS 4, TypeScript 6.0 |
| LLM | OpenRouter (any model, configurable), deterministic mock fallback |
| DB | SQLite (dev fallback) + PostgreSQL 16 (primary) + Neo4j 5 (optional graph analytics) |
| Vector | Chroma + text-embedding-3-small for semantic memory |
| Workers | RQ (Redis queue) for simulation + postmortem background processing |
| Viz | D3.js, react-force-graph-2d, Recharts, GSAP 3.15 |
| Infra | docker-compose for Neo4j+Redis+PostgreSQL only (no app services) |

---

## 6-Layer Architecture (Runtime)

| Layer | Name | Files | Responsibility |
|-------|------|-------|----------------|
| 6 | **Narrative** | `language_engine.py` | LLM dialogue generation, persuasion, framing |
| 5 | **Strategic** | `strategic_plan.py`, `goal_evolution.py`, `private_thought.py` | Multi-turn planning, subgoal decomposition, trigger-driven plans |
| 4 | **Cognitive** | `internal_state.py`, `bidding_v2.py` | 5 emotions + modulation rules, hybrid urgency, confidence/certainty |
| 3 | **Social Physics** | `social_physics.py`, `trust_evolution.py`, `leverage_tracker.py` | 6-dim state vectors, deterministic deltas, 8 threshold triggers, decay |
| 2 | **Relationship** | `relationship_graph.py`, `coalition_detection.py`, `whisper.py`, `hidden_info.py` | NxN directed matrix, 6-dim edges, coalition lifecycle |
| 1 | **Procedural** | `space.py`, `scheduler.py`, `interruptions.py`, `moderator.py`, `time_pressure.py` | Event-sourced message board, speaker selection, bidding, floor control |

**Core principle**: Language generation SEPARATED from behavioral state evolution. LLM only handles dialogue/reasoning; all social dynamics, emotions, relationships are deterministic math.

---

## Data Flow (Turn Cycle)

```
SCHEDULER publishes "bid round" event
  → ALL AGENTS compute urgency (hybrid: 60% deterministic + 40% LLM)
  → Highest urgency wins floor (PriorityQueue, min-heap of -urgency)
  → WINNER builds LLM prompt:
      system prompt: stance + personality + emotions + relationships
                     + social physics + plans + bias hints
      conversation: last 12 memory events
      instruction: JSON output {content, action_type, internal_reasoning}
  → LLM generates turn (temperature = voltage/100, capped 0.3-1.0)
  → Turn published to SharedSpace
  → BEHAVIOR ENGINE updates:
      social_physics.update(action, speaker, target, context)  ← deterministic deltas
      internal_state.apply_event(action)                       ← emotion deltas
      relationship_graph.apply_turn(turn)                      ← per-action deltas
      ALL decay toward baseline: emotions 3%/turn, physics 5%/turn, relationships 4%/turn
  → SCHEDULER runs all TerminationCheckers
  → SSE state_snapshot published to frontend
```

**Timing**: ~45s timeout per turn, ~20 max turns default, ~2s LLM strategy score timeout.

---

## Hybrid Urgency Formula

```
FINAL = DETERMINISTIC * 0.6 + LLM_STRATEGY_SCORE * 0.4

Deterministic:
  base = 50 + aggressiveness/2
       + (ally spoke last? -10)
       + (consecutive silence > 5? +20)
       + (tension > 0.7? +15)
       + (dominance > 0.7? +10)
       + emotional urgency_modifier (anger+15, fear+10, joy-10)

LLM strategy score: async call with 2s timeout, fallback=50
  Prompt: "how strategically important to speak NOW?"
```

---

## Behavioral Modulation (Emotion → Bias)

| Emotion | Threshold | interrupt | challenge | compromise | coalition | statement | question | escalate | urgency |
|---------|-----------|-----------|-----------|------------|-----------|-----------|----------|----------|---------|
| anger | ≥0.7 | **+0.40** | +0.25 | **-0.30** | | | | | **+15** |
| fear | ≥0.6 | | -0.20 | | +0.20 | | | -0.15 | +10 |
| joy | ≥0.7 | | | +0.20 | | +0.10 | | | **-10** |
| shame | ≥0.6 | -0.20 | | | | -0.15 | | | |
| surprise | ≥0.7 | +0.15 | | | | | +0.20 | | |

**Emotion baselines**: anger=0.2, fear=0.2, joy=0.5, shame=0.2, surprise=0.2. Decay 3%/turn.

---

## Social Physics — 6 Dimensions

**Ranges**: 0.0–1.0 (momentum: -1.0–1.0)
**Baselines**: trust=0.5, leverage=0.5, tension=0.3, dominance=0.3, credibility=0.5, momentum=0.0
**Decay**: 5%/turn toward baseline

### Per-Action Deltas

| action_type | trust | leverage | tension | dominance | credibility | momentum |
|-------------|-------|----------|---------|-----------|-------------|----------|
| statement | +0.02 | 0 | -0.01 | 0 | +0.02 | +0.02 |
| question | +0.03 | +0.01 | -0.02 | 0 | +0.01 | +0.01 |
| challenge | -0.08 | -0.02 | +0.12 | +0.05 | -0.03 | -0.02 |
| compromise | +0.10 | +0.05 | -0.15 | -0.05 | +0.05 | +0.05 |
| coalition_signal | +0.06 | +0.03 | -0.05 | -0.02 | +0.03 | +0.03 |
| interrupt | -0.05 | -0.01 | +0.15 | +0.08 | -0.05 | -0.03 |
| escalate | -0.15 | -0.05 | +0.20 | +0.10 | -0.10 | -0.05 |

### Relationship Graph — Per-Action Deltas

| action_type | trust edge | fear edge | rivalry edge | alliance |
|-------------|------------|-----------|--------------|----------|
| coalition | +0.08 | | | True |
| challenge | -0.08 | | +0.10 | |
| interrupt | -0.05 | +0.05 | +0.08 | |
| compromise | +0.12 | | -0.05 | True |
| escalate | -0.12 | +0.10 | +0.12 | |
| statement | +0.02 | | | |
| question | +0.03 | -0.02 | | |

### 8 Threshold Triggers

| Condition | Trigger | → Auto-Created Plan |
|-----------|---------|---------------------|
| tension > 0.8 | `escalation_risk` | "deescalate" (priority 4.0) |
| trust < 0.2 | `trust_collapse` | "rebuild_trust" (priority 5.0) |
| dominance > 0.8 | `domination_threat` | "assert_autonomy" (priority 3.5) |
| momentum > 0.7 | `gaining_traction` | — |
| momentum < -0.5 | `losing_ground` | — |
| credibility < 0.2 | `credibility_crisis` | "defend_position" (priority 4.5) |
| leverage > 0.85 | `leverage_advantage` | — |
| leverage < 0.15 | `leverage_collapse` | "regain_leverage" (priority 4.0) |

---

## Frontend Architecture

### Routes
- `/` — Landing with Quick Play
- `/simulate` — Simulation library list
- `/simulate/new` — 4-step wizard (subject → personas → rules → launch)
- `/simulate/[id]` — **War Room** (SSE live stream + replay mode)
- `/simulate/[id]/postmortem` — Full postmortem analysis
- `/personas` — Persona library CRUD
- `/personas/[slug]` — Agent detail (personality, emotions, memories, goals)
- `/analytics` — Cross-simulation recharts (BarChart, PieChart)
- `/library` — Template browser (Series B, Merger, Partnership, GTM Pivot, Pricing)
- `/frameworks` — Scenario frameworks (same as library)

### Component Hierarchy (25+ components)
- `AppShell` — sidebar + top nav + main area
- `ControlBar` — play/pause/step/restart, speed toggle, layout switcher
- **3 Layout Views**:
  - `RosterLayout` — 3-col grid: stakeholders | transcript+timeline | analytics
  - `TableLayout` — circular seating + speech bubble + typewriter
  - `GraphLayout` — react-force-graph-2d Canvas (conversation flow / trust modes)
- **Panels**: TranscriptStream, NarrativeTimeline, SentimentGraph, EmotionalInfluencePanel, StateDiffPanel, StrategicPlanPanel, CognitiveStatePanel, TrustLeveragePanel, CoalitionTracker, LeverageShifts, Leaderboard, IncentiveHeatmap, EventLog

### Data Flow: SSE → State → Components
```
streamSimulationV2(id, onEvent, onError, onDone)
  → evt.type === "turn"          → setTurns()         → TranscriptStream
  → evt.type === "state_snapshot" → setStateSnapshots() → useSimulationState:
      useMemo produces: trustHistory[], sentimentHistory[], leverageHistory[],
      trustMatrix, leaderboard, coalitions, socialPhysics, agentStates, agentPlans
  → evt.type === "done"          → setOutcome({reason, outcome_type, ...})
```

**Replay mode**: Fetches all snapshots from `/simulations/{id}/replay`, turnIndex slices to playhead. 3800ms interval per turn (0.5x/1x/2x speed).

### Key Decisions
- No global state library (raw useState + useMemo + prop drilling — intentional)
- SSE over WebSocket (fetch + ReadableStream + TextDecoder)
- Dual-mode hook (live/replay) powers all panels identically
- sessionStorage persistence (500ms debounce)
- GSAP in 22/25 components, respects prefers-reduced-motion
- No end-to-end type sharing with backend (manual TypeScript sync)

---

## Backend Runtime — Module Map

| File | Lines | Role |
|------|-------|------|
| `main.py` | 924 | FastAPI app, SSE streaming, seed loader, all routes |
| `models.py` | 520 | Pydantic v2 schemas (v1+v2+graph analytics) |
| `config.py` | 32 | Env-based config (OpenRouter, Redis, RQ, budget) |
| `llm.py` | 163 | OpenRouter client with LangSmith tracing, token tracking |
| `budget.py` | 60 | Per-simulation token budget guard |
| `runtime/simulation.py` | 67 | Wiring: space+agents+scheduler launch |
| `runtime/agent.py` | 441 | Async agent loop (observe→think→decide→act) |
| `runtime/scheduler.py` | ~210 | Speaker selection, end conditions |
| `runtime/space.py` | ~100 | Event-sourced shared state, bidding |
| `runtime/behavior_engine.py` | 122 | Orchestrator: process_turn pipeline |
| `runtime/social_physics.py` | 139 | 6-dim deterministic state machine |
| `runtime/internal_state.py` | ~180 | 5 emotions, confidence, certainty, modulation |
| `runtime/relationship_graph.py` | ~310 | NxN directed adjacency matrix |
| `runtime/language_engine.py` | 137 | LLM prompt builder (thin wrapper) |
| `runtime/strategic_plan.py` | ~300 | Multi-turn plan lifecycle |
| `runtime/goal_evolution.py` | ~200 | Goal triggers, decay, priority |
| `runtime/private_thought.py` | ~150 | Hidden motives, strategy hints |
| `runtime/memory_system.py` | ~200 | Episodic+semantic memory |
| `runtime/coalition_detection.py` | ~150 | Coalition lifecycle |
| `runtime/postmortem_generator.py` | 558 | Grounded postmortem (TopicTracker, etc.) |
| `runtime/archetypes.py` | 87 | 6 agent archetypes (opportunist, idealist, diplomat, pragmatist, agitator, guardian) |
| `database/postgres.py` | 955 | Full PG backend (v1+v2 schema) |
| `database/sqlite.py` | 469 | SQLite backend (v1+v2) |
| `graph/writer.py` | 257 | Fire-and-forget Cypher writes |
| `graph/queries.py` | 249 | Read-only graph analytics for postmortems |

---

## Test Coverage (31 files, ~283 tests, ~4593 lines, 1.26:1 test:code ratio)

### Strong Coverage (deterministic pure functions)
| Module | Tests |
|--------|-------|
| goal_evolution | ~42 |
| relationship_graph | ~35 |
| memory_system | ~33 |
| social_physics | 30 |
| internal_state | ~27 |
| behavior_engine | 25 |
| coalition_detection | 22 |
| postmortem (conclusion e2e) | ~20 |

### Weak Coverage
| Module | Tests | Risk |
|--------|-------|------|
| agent.py | 2 (via runtime tests) | 441-line async loop untested |
| bidding_v2 | 3 | Core bidding logic minimally tested |
| whisper/hidden_info/crisis/time_pressure/interruptions | 1-4 each | Integration stubs |
| moderator | 2 | Speaker selection |
| budget.py | 0 | Cost tracking, 60 lines |

### Missing Coverage
- End-to-end simulation with real LLM calls
- Hybrid urgency LLM strategy score path
- Budget guard validation
- Agent async loop (_should_bid, _compute_urgency, _generate_turn)

### Test Pattern
All tests use `importlib` direct loading to bypass broken `__init__.py` chain:
```python
_module_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "{module}.py"
_spec = importlib.util.spec_from_file_location("{module}", _module_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
```

---

## Emerging Properties

| Property | Mechanism |
|----------|-----------|
| **Power Law of Speaking** | High tension → urgency+15, anger → interrupt_bias+0.4 → speak more → dominance increases → cycle |
| **Trust Collapse Cascade** | Challenge → -trust → trust<0.2 → "trust_collapse" trigger → "rebuild_trust" plan → but challenge still action → -trust again |
| **Coalition Feedback** | Compromise → +0.12 trust, alliance=True → future compromise more likely on alliance edges → coalition strengthens |
| **Emotional Contagion** | Agent A challenges Agent B → Agent B anger+0.15 → interrupt_bias+0.4 → Agent B interrupts → more challenges |
| **Strategic Horizon** | Trigger→Plan→Subgoals→LLM injection→action selection→subgoal completion. Multi-turn strategy without explicit planning LLM |
| **Deadlock Spiral** | Challenge→tension+0.12, trust-0.08→anger+0.15→interrupt_bias+0.4→more interruptions→tension+0.15→cycle→"escalation_risk"→plan "deescalate" BUT bias says interrupt |

---

## Personas (22 total, 5 tags)

| Tag | Role |
|-----|------|
| VISIONARY | startup_ceo |
| CALIBRATING | corp_dev_vp |
| SKEPTICAL | telecom_cfo |
| LOCKED | telecom_counsel |
| AGREEABLE | internal_champion |

**Tool profiles**: financial, legal, technical, comms, none

**6 templates**: partnership_negotiation, investor_meeting, internal_strategy, crisis_simulation, legal_contract, podcast

---

## Known Infrastructure Issues

1. **Broken `runtime/__init__.py` chain** — `app/__init__.py` is empty, missing `app.budget` import. All tests workaround with `importlib` direct loading.
2. **Dual DB schema** — SQLite v1 + Postgres v1+v2 with different table layouts. No canonical path.
3. **No CI/CD pipeline** — no GitHub Actions, Dockerfile, or deploy manifests.
4. **Redis not in docker-compose** — required for RQ workers but missing.
5. **No end-to-end type sharing** — backend Pydantic → frontend TypeScript is manual sync.
6. **No Prettier/EditorConfig** — formatting risk across both projects.

---

## Roadmap Position

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| 0. Manual validation | ✅ Done | Briefing format validated |
| 1. MVP foundations | 🟡 Built | Simulation engine, postmortem, personas, templates, API |
| 1. MVP missing | ❌ Not built | Auth, deal intake UI, PDF briefings, A/B harness, user-facing product loop |
| 2-6 | ❌ Future | Feedback loop, context depth, interactive rehearsal, visual room, dataset moat |
