# graph/ — Neo4j Integration

Graph database layer for relationship mining across negotiation sessions.

## FILES

| File | Lines | Role |
|------|-------|------|
| `driver.py` | — | Neo4j driver singleton (bolt://localhost:7687) |
| `schema.py` | — | Graph schema `init_schema()` — creates constraints |
| `queries.py` | 249 | Cypher queries for sessions, stakeholders, clusters |
| `writer.py` | 257 | Writes simulation state/turns to graph |

## DEPENDENCIES

Neo4j 5 container via docker-compose. Falls back gracefully if absent.

## PATTERNS

- Lazy driver init via `get_driver()` / `close_driver()` app lifespan
- `init_schema()` on startup creates uniqueness constraints
- `writer.py` batch-writes turns as relationships between stakeholder nodes
- `queries.py` exposes: `get_session_graph()`, `get_stakeholder_clusters()`, `get_influence_paths()`

## CAVEATS

- Not required for basic simulation — entire layer skippable
- Schema init is idempotent (CREATE CONSTRAINT IF NOT EXISTS)
- No migration system — schema changes need manual Cypher
