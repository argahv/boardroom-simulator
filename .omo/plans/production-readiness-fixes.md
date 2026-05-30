# Production Readiness Fixes

## Synthesis of Findings

### Database Layer — ✅ GREEN (Verified by Oracle)
- 15 unified models, proper FKs, cascade rules
- 44/46 tests passing, JSON roundtrip verified
- All UUID/DataError paths handled
- Legacy backends preserved for rollback

### Backend API — 🟡 YELLOW (7 Critical Issues)
1. `_v2_simulations` dict has no locking — race conditions
2. SSE double-execution on same sim
3. In-memory state not evicted
4. ~15 `except Exception: pass` patterns
5. No SSE reconnection
6. `_save_turn` silently drops data
7. `create_engine()` outside try block

### Deployment Infra — 🔴 RED (12 Gaps)
1. No Dockerfile for backend
2. No Dockerfile for frontend
3. Compose covers infra only, not the app
4. CI exists but no CD pipeline
5. No k8s manifests
6. No reverse proxy/TLS config
7. No secrets management
8. No supervisor for workers
9. No migration framework
10. No production Next.js build config
11. No logging aggregation
12. Has committed .env with real keys

### Frontend — 🟡 YELLOW (7 Gaps)
1. Single ErrorBoundary at root level (any crash kills entire app)
2. 4 pages silently swallow errors via `.catch(()=>{})`
3. No `error.tsx`, `loading.tsx`, `not-found.tsx`
4. Persona page missing empty state
5. No React Query/SWR (raw fetch, no caching/retry)
6. No end-to-end type sharing with backend
7. Layout components duplicated across directories

### Security — 🟡 YELLOW (3 Gaps)
1. No authentication on any endpoint
2. No request body size limits (OOM risk)
3. Committed .env with real API keys

## Execution Plan: Waves

### Wave 1 — Security & Auth (4 tasks, sequential)
- Task 1: Add API key middleware
- Task 2: Make CORS configurable via env var
- Task 3: Add request body size limits
- Task 4: Gitignore/.env cleanup

### Wave 2 — Docker & Build (4 tasks, parallel)
- Task 5: Create backend Dockerfile
- Task 6: Create frontend Dockerfile  
- Task 7: Update docker-compose with app services
- Task 8: Add production next.config

### Wave 3 — Error Handling (3 tasks, parallel)
- Task 9: Fix silent error swallows in frontend
- Task 10: Add error.tsx + loading.tsx + not-found.tsx
- Task 11: Fix backend bare `except: pass` patterns

### Wave 4 — Hardening (3 tasks, sequential)
- Task 12: Add locking to _v2_simulations
- Task 13: Add SSE guard against double-execution
- Task 14: Add process supervisor for workers
