# app/ — Core Application

FastAPI application server and simulation orchestration.

## WHERE TO LOOK

| Module | Role |
|--------|------|
| `main.py` | FastAPI app, routes, SSE streaming, CORS |
| `models.py` | Pydantic v2 schemas for all API contracts |
| `config.py` | `Settings` pydantic-settings class |
| `llm.py` | OpenRouter client, token tracking |
| `engine_legacy.py` | Deprecated v1 orchestrator |
| `database/` | SQLite repo layer |
| `graph/` | Neo4j graph queries |
| `runtime/` | LangGraph StateGraph simulation |
| `workers/` | RQ background job handlers |

## DEPENDENCIES

```
main.py → models.py, config.py, runtime/, graph/, database/, workers/
runtime/ → models.py, llm.py, config.py
graph/ → queries.py, schema.py, writer.py, driver.py
```

## NOTES

- 6,100 lines total across app (largest: `engine_legacy.py` 563, `main.py` 513)
- SSE endpoint streams simulation events as `text/event-stream`
- All routes defined in `main.py` — no router separation yet
