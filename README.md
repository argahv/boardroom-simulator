# Boardroom Simulator

Multi-agent negotiation simulator — **FastAPI + LangGraph** backend and **Next.js 16** frontend. Models enterprise deal-room dynamics: agents with conflicting incentives debate term sheets, form coalitions, escalate, and compromise. Default scenario is a startup vs. enterprise partnership negotiation.

## Architecture

**v2 Multi-Agent Architecture** — replaces the original single-orchestrator with a **LangGraph StateGraph** workflow:

```
select_speaker → generate_turn (role-tooled agent) → update_heatmap → should_continue → END
```

- **Specialized agents** per stakeholder (CFO, Legal, CTO) with domain-specific tool bindings
- **Speaker selection**: 4 algorithms — random, coalition-based, directed-at, weighted-random by incentive × voltage
- **Memory**: Chroma vector store with per-agent semantic retrieval (OpenAI `text-embedding-3-small`)
- **Structured outputs**: Pydantic models for every turn, heatmap, conflict timeline
- **Guardrails**: Input content filter + jailbreak detector, output hallucination/contradiction validators
- **Scoring**: Confidence trends, consensus rating, objection topology analysis
- **State persistence**: Checkpoint system (disk-serialized after each turn, resume-capable)
- **Cost tracking**: Per-turn token counts + cost estimation streamed via SSE
- **Optional graph analytics**: Neo4j 5 (docker-compose) for relationship mining

## Prerequisites

- Python 3.11+
- Node.js 20+
- OpenRouter API key (`OPENROUTER_API_KEY`)

## Quick start

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

API docs at `http://127.0.0.1:8000/docs` · App at `http://localhost:3000`

## Docs

| Doc | What's inside |
|---|---|
| [`SETUP.md`](SETUP.md) | Full setup guide including Redis/RQ workers, env vars, architecture deep-dive, migration notes |
| [`docs/MVP.md`](docs/MVP.md) | MVP scope, target user, success metrics |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phased roadmap with success gates |
| [`docs/tech-stack.md`](docs/tech-stack.md) | Technology decisions and rationale |
| [`.sisyphus/plans/agentic-architecture.md`](.sisyphus/plans/agentic-architecture.md) | v2 architecture design |
| [`.sisyphus/plans/implementation-plan.md`](.sisyphus/plans/implementation-plan.md) | Implementation plan |

## Frontend

- **War Room** (`/simulate/[id]`) — real-time SSE streaming with 3 layout modes:
  - **Roster** — avatar grid with speech bubbles, heatmap, conflict timeline
  - **Graph** — force-directed stakeholder graph with coalition edges
  - **Table** — chronological event log
- **Wizard** (`/simulate/new`) — 3-step simulation creation (background → stakeholders → env flags)
- **Persona Library** (`/personas`) — CRUD for stakeholders with archetype filter, search, incentive tuning, hidden agendas
- **Postmortem** — confidence scoring, objection topology, consensus rating

### Components

`Avatar` · `ActionGlyph` · `ControlBar` · `SimBadge` · `Voltage` · `TurnDisplay` · `AppShell`

## Backend

### Agent tool bindings

| Agent | Tools | Purpose |
|---|---|---|
| **CFO** | `calculate_roi` · `check_financials` · `calculate_burn_rate` | NPV/IRR, financial health ratios, runway projections |
| **Legal** | `query_clause` · `compliance_check` | 33-clause DB, GDPR/HIPAA/SOC2 scoring |
| **CTO** | `assess_tech_stack` · `check_integration` | Architecture scoring, API compatibility |

### Key endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/v2/simulations` | Create simulation |
| GET | `/v2/simulations/{id}` | Get config + turns |
| POST | `/v2/simulations/{id}/run` | Execute (LangGraph workflow) |
| GET | `/v2/simulations/{id}/stream` | SSE stream |
| POST | `/v2/simulations/{id}/turns` | Inject human turn |
| GET | `/v2/simulations/{id}/postmortem` | Generate analysis |
| GET | `/api/stakeholders` | List personas |
| POST | `/api/stakeholders` | Create persona |
| GET | `/library` | Default persona library |
| GET | `/scenario/partnership` | Canned scenario for QA |

### Optional services

```bash
# Neo4j (graph analytics)
docker compose up -d neo4j     # http://localhost:7474

# Redis + RQ workers (async job queue)
docker run --name boardroom-redis -p 6379:6379 -d redis:7
python -m app.workers.simulation_worker
python -m app.workers.postmortem_worker
```

## Verification

```bash
./test-application.sh
```

Tests: backend health, frontend reachable, stakeholder CRUD, simulation creation, env config.

---

*See [`SETUP.md`](SETUP.md) for detailed installation, environment variables, production checklist, and troubleshooting.*
