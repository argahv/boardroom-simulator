# Boardroom Simulator - Setup & Running Guide

## Prerequisites

- Python 3.11+
- Node.js 20+
- npm or yarn

## Environment Configuration

### Backend (.env)

Create `backend/.env` with:

```env
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=
```

### Frontend (.env.local)

Create `frontend/.env.local` with:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

## Quick Start

```bash
make dev
```

This starts all 4 processes (backend + frontend + 2 workers). See individual sections below for manual setup.

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Docker Services

Start all infrastructure (Redis, Postgres, Neo4j) with one command:

```bash
docker compose up -d
```

This starts:
- **Postgres** (pgvector/pgvector:0.8.0-pg16) — primary data store on port 5432
- **Redis** (redis:7-alpine) — RQ worker queue on port 6379
- **Neo4j** (neo4j:5) — optional graph analytics on ports 7474/7687

### Background Workers

```bash
# In backend .venv, start simulation worker
python -m app.workers.simulation_worker

# In another terminal, start postmortem worker
python -m app.workers.postmortem_worker
```

Environment variables:

```env
REDIS_URL=redis://localhost:6379/0
RQ_QUEUE_SIMULATION=simulation
RQ_QUEUE_POSTMORTEM=postmortem
RQ_JOB_TIMEOUT_SECONDS=300
DATABASE_URL=postgresql+asyncpg://boardroom:boardroom@localhost:5432/boardroom
```

Backend will be available at: http://127.0.0.1:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at: http://localhost:3000

## Verification

Run the automated test script:

```bash
chmod +x test-application.sh
./test-application.sh
```

This verifies:

- ✓ Backend health endpoint responds
- ✓ Frontend accessible
- ✓ Stakeholder CRUD operations work
- ✓ Simulation creation succeeds
- ✓ Environment variables configured

## Features Overview

### 1. Persona Library (`/personas`)

- Search personas by name, role, or focus area
- Filter by archetype (All/Executive/Technical/Procurement/Legal)
- Create new personas with incentive tuning and hidden agendas
- Edit existing personas
- Delete personas with confirmation

### 2. War Room (`/simulate/[id]`)

- Real-time SSE streaming of simulation turns
- Dark gradient background with terminal-style event log
- Grayscale→color hover effects on stakeholder avatars
- Bar chart sentiment visualization
- Pulse animations on active speaker
- Conflict timeline with event markers

### 3. New Simulation Wizard (`/simulate/new`)

- 3-step creation flow:
  1. Background context & primary goal
  2. Stakeholder selection from library
  3. Simulation parameters (voltage, temperature, environment flags)

### 4. Postmortem (`/simulate/[id]/postmortem`)

- Confidence scoring & trends
- Unanticipated objections analysis
- Consensus rating
- Objection topology visualization

## API Endpoints

### Stakeholders

- `GET /stakeholders` - List all personas
- `POST /stakeholders` - Create new persona
- `PUT /stakeholders/{id}` - Update persona
- `DELETE /stakeholders/{id}` - Delete persona

### Simulations

- `GET /simulations` - List all simulations
- `POST /simulations` - Create simulation
- `GET /simulations/{id}` - Get simulation details
- `GET /simulations/{id}/checkpoint` - Get checkpoint metadata
- `POST /simulations/{id}/resume` - Resume from checkpoint
- `POST /simulations/{id}/run` - Execute simulation
- `GET /simulations/{id}/stream` - SSE stream (real-time)
- `GET /simulations/{id}/postmortem` - Generate analysis

### Library

- `GET /library` - Get default persona library

## Multi-Agent Architecture

This project uses a v2 Behavior Engine runtime with async AgentRuntime event loop. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture description.

## Design System

- **Colors**: Cream (`#faf9f5`), Coral (`#cc785c`), Dark Navy (`#181715`)
- **Typography**: Newsreader (display), Inter (body)
- **Icons**: Material Symbols
- **Framework**: Next.js 16 + Tailwind CSS v4

## Production Readiness Checklist

- [x] Backend CRUD endpoints functional
- [x] Frontend API integration complete
- [x] Default personas initialize on startup
- [x] SSE streaming works correctly
- [x] War room visual polish matches mockups
- [x] Persona library fully operational
- [x] OpenRouter API key verified (200 OK)
- [x] LangSmith tracing configured
- [x] Test script validates all endpoints
- [x] v2 Behavior Engine runtime implemented
- [x] Persona knowledge base via Chroma RAG
- [x] Semantic memory for cross-session retrieval
- [x] Structured outputs via Pydantic models
- [x] State persistence (checkpoint system)
- [x] Guardrails (content filter, jailbreak detection, output validation)
- [x] Cost tracking in SSE events
- [x] Enhanced LangSmith metadata (simulation_id, turn_index, agent_id, tokens, cost)

## Known Limitations

- In-memory storage for simulation state (checkpoints persist to disk)
- Mock postmortem generation (not full AI analysis yet)
- No authentication/authorization layer
- OpenRouter API credits required for full end-to-end testing

## Next Steps for Production

1. Add persistent database (PostgreSQL recommended) for simulation metadata
2. Implement full AI-powered postmortem analysis (currently mocked)
3. Add user authentication/authorization layer
4. Deploy backend with proper CORS configuration
5. Configure proper environment variables for production (secrets management)
6. Add rate limiting on API endpoints
7. Implement proper error logging/monitoring (Sentry, DataDog)
8. Add frontend cost display dashboard (per-simulation aggregation)
9. Implement guardrails UI (flag inappropriate content, jailbreak attempts)
10. Add admin panel for checkpoint management (list, restore, delete)

## Troubleshooting

### Backend won't start

- Check Python version: `python --version` (must be 3.11+)
- Verify virtual environment activated
- Check port 8000 not already in use: `lsof -i :8000`

### Frontend won't start

- Check Node version: `node --version` (must be 20+)
- Delete `node_modules` and `.next`, reinstall: `rm -rf node_modules .next && npm install`
- Verify port 3000 available: `lsof -i :3000`

### SSE streaming fails

- Check browser console for connection errors
- Verify backend running and accessible
- Test SSE endpoint directly: `curl http://127.0.0.1:8000/simulations/{id}/stream`

### API calls return 404

- Verify backend running on port 8000
- Check `NEXT_PUBLIC_API_URL` in frontend `.env.local`
- Inspect network tab for actual request URLs

## Support

For issues or questions, check:

- Backend logs in terminal running uvicorn
- Frontend logs in browser developer console
- Test script output: `./test-application.sh`
