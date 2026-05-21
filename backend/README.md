# Boardroom Simulator Backend

FastAPI backend for the MVP boardroom partnership negotiation simulator. It runs an in-memory multi-agent simulation using OpenRouter, with deterministic mock output when no API key is configured.

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Add an OpenRouter key to `.env` for live LLM output. If `OPENROUTER_API_KEY` is empty, the backend automatically uses mock mode so the UI can demo without external credentials.

## Environment

```bash
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
OPENROUTER_HTTP_REFERRER=http://localhost:3000
OPENROUTER_APP_TITLE=Boardroom Simulator
MAX_TURNS=20
```

## Run

```bash
PYTHONPATH=. uvicorn app.main:app --reload --port 8000
```

Smoke check:

```bash
PYTHONPATH=. python -c "from app.main import app; print(app.title)"
```

## Endpoints

- `GET /health` checks service status and reports mock mode.
- `GET /library` returns the enterprise committee persona library and partnership scenario defaults.
- `GET /scenario/partnership` returns the default startup-enterprise partnership scenario.
- `POST /simulations` creates a simulation from a `SimulationCreate` payload.
- `GET /simulations/{id}` returns the in-memory simulation state.
- `POST /simulations/{id}/run` runs until `max_turns`, configured `MAX_TURNS`, or natural orchestrator closure.
- `POST /simulations/{id}/postmortem` generates a brief postmortem from the transcript.

State is stored in memory only and resets when the process restarts.
