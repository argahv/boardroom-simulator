# Boardroom Simulator

**Generated:** 2026-05-24
**Commit:** 8aa7a91 **Branch:** master

Multi-agent negotiation simulator — FastAPI+LangGraph backend, Next.js 16 frontend.
Models enterprise deal-room dynamics with AI stakeholders.

## STRUCTURE

```
./
├── backend/        # Python FastAPI + LangGraph (29 py)
├── frontend/       # Next.js 16 + React 19 (29 tsx, 6 ts)
├── docs/           # Architecture, roadmaps, BR screens
├── data/           # Simulation datasets
├── checkpoints/    # Runtime state persistence
└── ...             # Makefile, docker-compose, test harnesses
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| API server entry | `backend/app/main.py` |
| Simulation engine | `backend/app/runtime/` |
| Neo4j graph logic | `backend/app/graph/` |
| Frontend pages | `frontend/app/` |
| UI components | `frontend/components/` |
| Background workers | `backend/app/workers/` |
| Tests | `backend/tests/` |
| DB schema/seeds | `backend/app/database/`, `backend/seeds/` |

## CONVENTIONS

- No `.editorconfig`/`.prettierrc`/`biome.json` — formatting risk
- Frontend: strict TS (`allowJs: false`), `target: ES2017`, `moduleResolution: bundler`
- Frontend lint: `eslint .` extends `next/core-web-vitals` + `next/typescript`
- Backend: `PYTHONPATH`-based module resolution via venv
- Dev: `make dev` backgrounds 4 procs (uvicorn + npm + 2 workers)

## ANTI-PATTERNS

- `"NEVER generate artificial consensus"` in `engine_legacy.py`
- No CI/CD pipeline (no GitHub Actions, Dockerfile, or deploy manifests)
- `docker-compose.yml` covers Neo4j only — not a full app stack
- Makefile is dev supervisor, not deterministic build pipeline

## COMMANDS

```bash
make install      # Install backend + frontend deps
make backend      # FastAPI on :8000
make frontend     # Next.js on :3000
make workers      # RQ simulation + postmortem workers
make dev          # All of the above in parallel
```

## NOTES

- Python venv at `backend/.venv`; frontend at `frontend/`
- OpenRouter API key required (`OPENROUTER_API_KEY`)
- Redis required for RQ worker queue (not in docker-compose)
