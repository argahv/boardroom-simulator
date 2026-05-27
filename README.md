<div align="center">

# Boardroom Simulator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)]()
[![Node](https://img.shields.io/badge/node-20+-green.svg)]()
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)]()

</div>

A **synthetic social operating system** — multi-agent negotiation simulator where AI stakeholders with conflicting incentives debate, form coalitions, escalate, compromise, feel emotions, and execute multi-turn strategies.

Not a chatbot. An **event-driven cognitive society simulator**.

## Architecture

### Core Design Principle

**Language Generation** is separated from **Behavioral State Evolution**.

The LLM generates dialogue, tactical reasoning, and persuasive language.
Deterministic systems maintain coherence, social continuity, emotional state, and strategic evolution.

### 6-Layer Architecture

```
Layer 6: Narrative Layer (LLM)
Layer 5: Strategic Layer (planning, subgoals)
Layer 4: Cognitive Layer (emotions, modulation, urgency)
Layer 3: Social Physics Layer (trust, leverage, tension, etc.)
Layer 2: Relationship Layer (NxN pairwise matrix)
Layer 1: Procedural Layer (events, scheduling, bidding)
```

### What Makes This Different

| Aspect | Typical Agent System | This System |
|--------|---------------------|-------------|
| **State** | LLM context window | Deterministic state machines + event sourcing |
| **Autonomy** | Sequential turns | Async, reactive, event-driven (`wait_for_change()`) |
| **Relationships** | Implicit in prompts | Explicit NxN matrix (trust, fear, admiration, rivalry, alliance, dependency) |
| **Emotions** | Described in text | Numeric state with **causal behavioral effects** |
| **Strategy** | None (reactive) | Multi-turn plans with subgoal decomposition |
| **Urgency** | Round-robin or random | **Hybrid** — deterministic formula + LLM-inferred strategic importance |
| **Debugging** | Print statements | Replay, state diff, 6+ visualization panels |

## Behavioral Dynamics

### Emotional Causality

Emotions **causally shape behavior** — not just dialogue tone:

| Emotion | Behavioral Effect |
|---------|------------------|
| **anger** ≥ 0.7 | interrupt_bias +0.4, compromise_bias -0.3, urgency +15 |
| **fear** ≥ 0.6 | challenge_bias -0.2, coalition_bias +0.2 |
| **joy** ≥ 0.7 | compromise_bias +0.2, urgency -10 |
| **shame** ≥ 0.6 | withdraws (speaks less, interrupts less) |

*See [`docs/behavioral-dynamics.md`](docs/behavioral-dynamics.md) for full rule table and scenarios.*

### Hybrid Urgency

Bidding is **60% deterministic formula** (personality + state + emotions) **+ 40% LLM strategy score** (inferred strategic importance from recent context). 2-second timeout with graceful fallback.

### Strategic Horizon

Agents maintain **multi-turn plans** with subgoals. Triggers (e.g., `trust_collapse`, `credibility_crisis`) auto-create plans ("rebuild trust", "defend position"). Plans are injected into the LLM's system prompt each turn.

## Prerequisites

- Python 3.11+
- Node.js 20+
- OpenRouter API key (`OPENROUTER_API_KEY`)

## Quick Start

```bash
make install
make dev
```

Open `http://localhost:3000` in your browser. API docs at `http://127.0.0.1:8000/docs`.

### Manual Setup

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add OPENROUTER_API_KEY
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install
echo 'NEXT_PUBLIC_API_URL=http://127.0.0.1:8000' >> .env.local
npm run dev
```

See [SETUP.md](SETUP.md) for the full setup guide, configuration options, and troubleshooting.



## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/simulations` | Create simulation |
| GET | `/simulations/{id}/stream` | SSE stream (live) |
| GET | `/simulations/{id}/replay` | Ordered state snapshots |
| POST | `/simulations/{id}/inject` | Human turn injection |
| GET | `/agents/{name}/detail` | Agent profile + goals + strategy |

Full API reference at `http://127.0.0.1:8000/docs`.

## Docs

| Doc | What's Inside |
|-----|---------------|
| [`docs/architecture-deep-dive.md`](docs/architecture-deep-dive.md) | Full component map, data flows, emergent properties, Layer 1-6 breakdown |
| [`docs/behavioral-dynamics.md`](docs/behavioral-dynamics.md) | Emotional modulation rules, hybrid urgency mechanics, strategic planning scenarios, scenario traces |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Behavior Engine architecture (v2 runtime) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phased roadmap with success gates |
| [`docs/tech-stack.md`](docs/tech-stack.md) | Technology decisions and rationale |
| [`docs/snapshot-schema.md`](docs/snapshot-schema.md) | State snapshot field reference |

## Verification

```bash
# Using Make (recommended)
make test

# Or manually
cd backend && python -m pytest tests/
cd frontend && npx tsc --noEmit
```
