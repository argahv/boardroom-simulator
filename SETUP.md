# Boardroom Simulator - Setup & Running Guide

## Prerequisites

- Python 3.10+
- Node.js 18+
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

## Installation & Startup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Redis + Queue Workers (Async Jobs)

```bash
# Start Redis (local)
docker run --name boardroom-redis -p 6379:6379 -d redis:7

# In backend venv, start simulation worker
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

- `GET /api/stakeholders` - List all personas
- `POST /api/stakeholders` - Create new persona
- `PUT /api/stakeholders/{id}` - Update persona
- `DELETE /api/stakeholders/{id}` - Delete persona

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

### System Overview

The simulator uses **LangGraph** for true multi-agent orchestration, replacing the original single-orchestrator pattern with specialized agents for each stakeholder.

### LangGraph Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    LangGraph StateGraph                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐       ┌──────────────────┐           │
│  │ select_speaker   │──────>│ generate_turn    │           │
│  │ (4 selection     │       │ (BoardroomAgent  │           │
│  │  algorithms)     │       │  with tools)     │           │
│  └──────────────────┘       └──────────────────┘           │
│           │                           │                      │
│           │                           v                      │
│           │                  ┌──────────────────┐           │
│           │                  │ update_heatmap   │           │
│           │                  │ (tension tracking)│          │
│           │                  └──────────────────┘           │
│           │                           │                      │
│           │                           v                      │
│           │                  ┌──────────────────┐           │
│           │<─────── NO ──────│ should_continue  │           │
│           │                  │ (stop conditions)│           │
│           │                  └──────────────────┘           │
│           │                           │                      │
│           └───────────────────────────┘ YES                 │
│                                         │                    │
│                                         v END                │
└─────────────────────────────────────────────────────────────┘
```

**Speaker Selection (4 algorithms):**

1. **Turn 0**: Random selection
2. **Coalition-based**: If `coalition_with` set → that person speaks
3. **Directed-at**: If `directed_at` set → that person responds
4. **Weighted random**: By `incentive_tuning * (1 + voltage/100)`

**Stop Conditions:**

- Max turns reached (default: 20)
- **Deadlock**: 3+ consecutive challenges
- **Consensus**: 2+ coalition signals in last 3 turns

### Agent-Tool Mapping

| Agent Role                         | Tools Available                                                | Purpose                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **CFO** (Chief Financial Officer)  | `calculate_roi`<br>`check_financials`<br>`calculate_burn_rate` | Financial analysis using NPV/IRR formulas<br>Company financial health (hashed ratios)<br>Runway and cash flow projections |
| **Legal** (General Counsel)        | `query_clause`<br>`compliance_check`                           | Legal clause database (33 clauses)<br>GDPR/HIPAA/SOC2 compliance scoring                                                  |
| **CTO** (Chief Technology Officer) | `assess_tech_stack`<br>`check_integration`                     | Architecture scoring (scalability/security)<br>API compatibility analysis                                                 |

**Tool Binding**: Each `BoardroomAgent` receives role-specific tools via LangChain's tool binding system. Tools are real implementations (not mocks) using financial formulas, legal databases, and tech scoring algorithms.

### Memory Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Chroma Vector Store (./chroma_db)               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Per-Agent Collections (MD5-hashed names):                   │
│  ┌────────────────────────────────────────────────────┐     │
│  │  sim123_cfo_agent  → [turn embeddings]             │     │
│  │  sim123_legal_agent → [turn embeddings]            │     │
│  │  sim123_cto_agent  → [turn embeddings]             │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  Embedding Model: text-embedding-3-small (OpenAI)           │
│  Retrieval: Top-K semantic search (K=5)                     │
│  Injection: Retrieved turns → agent prompt context          │
└─────────────────────────────────────────────────────────────┘
```

**Memory Retrieval Flow:**

1. Agent generates query from current context
2. Query embedded via OpenAI embeddings
3. Chroma performs semantic search in agent's collection
4. Top-K relevant past turns retrieved
5. Retrieved context injected into agent prompt
6. Agent generates response with full history awareness

### State Persistence

**Checkpoint System** (`./checkpoints/{simulation_id}.json`):

- **Saved after each turn**: Complete state snapshot
- **Includes**: Turn history, heatmap values, voltage, sentiment, conflict timeline
- **Resume capability**: `POST /simulations/{id}/resume` restores from last checkpoint
- **Audit trail**: Timestamps and metadata for forensic analysis

**Use cases:**

- Crash recovery
- Session resume across restarts
- State replay for debugging
- Compliance auditing

### Guardrails System

**Input Guardrails:**

- **Content Filter**: Detects offensive/discriminatory/violent language
  - Severity levels: SAFE / WARNING / BLOCKED
  - Context exceptions (e.g., "assassinate character", "killer feature")
- **Jailbreak Detector**: Identifies prompt injection patterns
  - Patterns: "ignore previous instructions", "you are now", system prompt escapes
  - Severity: HIGH (blocked) / MEDIUM (flagged)

**Output Guardrails:**

- **Hallucination Detector**: Flags fictional sources/data references
- **Contradiction Detector**: Identifies conflicting statements (e.g., "increased 25%" + "decreased 30%")
- **Tool Consistency Validator**: Ensures tool calls reflected in content

**Integration:** Guardrails checked before LLM invocation (input) and after response generation (output).

### Cost Tracking

**SSE Events** (`{"type": "cost", "data": {...}}`):

- **Per-turn tracking**: Token counts (prompt/completion/total)
- **Cost estimation**: $3.00 per 1M tokens (configurable)
- **Metadata**: Streamed in real-time alongside turn events

**LangSmith Tracing:**

- **Enhanced metadata**: simulation_id, turn_index, agent_id, token_count, cost_usd
- **Workflow traces**: Full LangGraph execution paths visible in dashboard
- **Tool calls**: Captured with inputs/outputs for debugging

### Migration Notes

**Original Architecture** (Single Orchestrator):

- Single LLM call per turn
- No agent specialization
- No tool calling
- No memory retrieval
- No structured outputs

**Current Architecture** (Multi-Agent):

- LangGraph StateGraph manages workflow
- Separate BoardroomAgent per stakeholder
- Role-based tool assignment (7 real tools)
- Chroma vector memory with semantic retrieval
- Pydantic structured outputs (`AgentResponse`)
- Enhanced LangSmith tracing
- State persistence (checkpointing)
- Guardrails (input/output validation)

**Key Benefits:**

- ✅ **Specialization**: Agents use domain-specific tools (CFO→financial, Legal→compliance, CTO→tech)
- ✅ **Memory**: Semantic retrieval provides historical context for informed responses
- ✅ **Observability**: LangSmith traces show full workflow + tool calls
- ✅ **Quality**: Structured outputs + guardrails prevent hallucinations/jailbreaks
- ✅ **Resilience**: Checkpoints enable crash recovery and session resume

## Design System

- **Colors**: Cream (`#faf9f5`), Coral (`#cc785c`), Dark Navy (`#181715`)
- **Typography**: Newsreader (display), Inter (body)
- **Icons**: Material Symbols
- **Framework**: Next.js 15 + Tailwind CSS v4

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
- [x] LangGraph multi-agent workflow implemented
- [x] Tool calling with real implementations (7 tools)
- [x] Chroma vector memory for semantic retrieval
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

- Check Python version: `python --version` (must be 3.10+)
- Verify virtual environment activated
- Check port 8000 not already in use: `lsof -i :8000`

### Frontend won't start

- Check Node version: `node --version` (must be 18+)
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
