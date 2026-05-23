# Backend — Boardroom Simulator

Python FastAPI + LangGraph backend for multi-agent negotiation simulation.

## STRUCTURE

```
backend/
├── app/               # Core application
│   ├── main.py        # FastAPI entry + SSE streaming
│   ├── models.py      # Pydantic schemas (385 lines)
│   ├── config.py      # Env-based config loader
│   ├── llm.py         # LLM client (OpenRouter)
│   ├── engine_legacy.py  # v1 orchestrator (deprecated)
│   ├── evals_reliability.py  # Evaluation harness
│   ├── database/      # SQLite persistence
│   ├── graph/         # Neo4j graph queries
│   ├── runtime/       # Simulation engine
│   └── workers/       # RQ background workers
├── tests/             # Pytest suite (5 files)
├── seeds/             # Persona + template JSON
├── scripts/           # Seed scripts
├── requirements.txt   # Python deps
└── .env               # Local env vars
```

## CONVENTIONS

- `PYTHONPATH` set to `backend/` for module resolution
- Pydantic v2 models for all schemas
- LangGraph StateGraph for simulation workflow
- Dependency injection: `get_database()`, `get_driver()` via FastAPI lifespan
- Logging: `logging.getLogger("boardroom.*")` — set `BACKEND_LOG_LEVEL`

## KEY PATTERNS

| Pattern | Approach |
|---------|----------|
| API | FastAPI with SSE streaming for simulation events |
| State | Disk-serialized checkpoints (resume-capable) |
| Workers | RQ via `simulation_worker.py` / `postmortem_worker.py` |
| Vector memory | Chroma + OpenAI `text-embedding-3-small` |
| Cost tracking | Per-turn token counts + cost via SSE |

## CAVEATS

- `engine_legacy.py` is v1 code — do not extend; use `runtime/` for new work
- Redis required for RQ workers (not in docker-compose)
- Neo4j optional — simulation falls back to in-memory if absent
