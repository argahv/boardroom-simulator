# Boardroom Simulator

Multi-agent negotiation prototype: **FastAPI + OpenRouter** backend and **Next.js** frontend (war room + wizard). Default scenario is a startup versus enterprise partnership term sheet.

## Prerequisites

- Python 3.11+
- Node.js 20+ (recommended)
- OpenRouter API key (`OPENROUTER_API_KEY`). Without it, the backend serves deterministic **mock** turns.

## Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill OPENROUTER_API_KEY
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` for the interactive API.

## Frontend

```bash
cd frontend
npm install
echo 'NEXT_PUBLIC_API_URL=http://127.0.0.1:8000' >> .env.local
npm run dev
```

Visit `http://localhost:3000`.

## Typical flow

1. **Wizard** (`/simulate/new`) — background, stakeholder library (partnership + default personas), tension / env flags.
2. **War room** (`/simulate/[id]`) — **Launch Simulation** (`POST /simulations/{id}/run`), optional **Generate Postmortem** (`POST /simulations/{id}/postmortem`).
3. `GET /scenario/partnership` returns a canned `SimulationCreate` for tooling or QA.

See [docs/MVP.md](docs/MVP.md), [docs/ROADMAP.md](docs/ROADMAP.md), and [docs/tech-stack.md](docs/tech-stack.md) for product and stack notes.
