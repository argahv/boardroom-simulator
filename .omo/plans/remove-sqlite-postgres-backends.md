# Remove SQLite & Direct Postgres Backends — Prisma-Only DB Layer

## TL;DR

> **Objective**: Delete `SQLiteBackend` (sqlite.py) and `PostgresBackend` (postgres.py), making `PrismaBackend` the sole database backend. Strip 45 defensive `hasattr(db, ...)` guards, adapt 7 test files, update config/docs.
>
> **Deliverables**:
> - 2 files deleted, 0 new files
> - 7 files modified (__init__.py, main.py, scheduler.py, .env.example, SETUP.md, UI_UX_IMPROVEMENTS.md)
> - 7 test files adapted to PG via docker-compose
> - 1 conftest.py created for shared PG fixture
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Wave 1 (conftest + tests) → Wave 2 (file deletion + simplify) → Wave 3 (hasattr removal) → Wave FINAL

---

## Context

### Original Request
"plan to remove the complete codes for direct postgres and sqlite in the backend, if they are implemented, they should be coming from prisma"

### Interview Summary
**Key Discussions**:
- 3 DB backends exist: SQLiteBackend (804 lines, raw sqlite3), PostgresBackend (1392 lines, asyncpg), PrismaBackend (1477 lines, prisma-client-py)
- Both sqlite/postgres backends log deprecation warnings — deployment already uses Prisma (Dockerfile sets `DATABASE_TYPE=prisma`)
- docker-compose.yml has PG service (`pgvector/pgvector:0.8.0-pg16`) at :5432
- 45 `hasattr(db, ...)` guards across codebase — all eliminable with single Prisma backend
- 7 test files use SQLite (6 set `DATABASE_TYPE=sqlite`, 1 imports SQLiteBackend directly)
- Test strategy: `docker compose up postgres -d` + session-scoped PG fixture in conftest.py

**Metis Review** (key findings):
- All 28 unique method names checked by hasattr confirmed present on PrismaBackend ✅
- PrismaBackend implements all 43 ABC methods ✅
- `test_persona_v2.py` has SQLite-specific `PRAGMA table_info` tests — must rewrite
- `SETUP.md` DATABASE_URL has wrong format (`+asyncpg` — Prisma doesn't use it)
- `test_document_upload.py` doesn't set DATABASE_TYPE, relies on default — must fix
- Existing prisma migration at `prisma/migrations/20260528110906_` must stay compatible
- No CI/CD exists — pre-existing gap, not a blocker

---

## Work Objectives

### Core Objective
Remove SQLiteBackend and PostgresBackend implementations. All DB operations go exclusively through Prisma ORM.

### Concrete Deliverables
- `backend/app/database/sqlite.py` — DELETED
- `backend/app/database/postgres.py` — DELETED
- `backend/app/database/__init__.py` — simplified (no branching, Prisma only)
- `backend/app/main.py` — 35 hasattr guards removed, calls unconditional
- `backend/app/runtime/scheduler.py` — 2 hasattr guards removed
- `backend/tests/conftest.py` — CREATED (session-scoped PG fixture)
- `backend/tests/test_persona_v2.py` — rewritten (no SQLite PRAGMA, uses PG)
- `backend/tests/test_{evolution,knowledge,simulation_knowledge_injection,research_integration,conclusion_e2e,document_upload}.py` — adapted to PG
- `backend/.env.example` — DATABASE_TYPE default → prisma
- `backend/../SETUP.md` — DATABASE_URL format fix
- `backend/../docs/UI_UX_IMPROVEMENTS.md` — sqlite/postgres references removed

### Definition of Done
- [ ] `grep -r "SQLiteBackend\|PostgresBackend\|from.*\.sqlite\|from.*\.postgres" backend/` → zero matches
- [ ] `grep -r "hasattr.*db\b" backend/app/` → zero matches (only conftest.py may remain)
- [ ] `pytest backend/tests/ -x --timeout=120` → ALL pass
- [ ] `curl localhost:8000/health` → `{"status": "ok", "unified": true}`
- [ ] `curl localhost:8000/stakeholders` → 200 with array
- [ ] `python -c "from app.database import get_database; await get_database().initialize(); print('OK')"` → OK

### Must Have
- PrismaBackend is the ONLY backend importable from `app.database`
- All `hasattr(db, ...)` guards removed — calls unconditional
- All tests pass against PG (via docker-compose)
- `.env.example` defaults to `DATABASE_TYPE=prisma`
- `get_agent_memories_by_id` moved into PrismaBackend class as method
- `__init__.py` no longer exports `get_agent_memories_by_id` standalone

### Must NOT Have (Guardrails)
- NO PrismaBackend method signature changes
- NO schema.prisma changes
- NO prisma-client-py version upgrade
- NO API response shape changes
- NO new test cases beyond adapting existing ones
- NO changes to `engine_legacy.py`
- NO removal of `DatabaseBackend` ABC

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (pytest)
- **Automated tests**: YES (tests-after — adapt existing, don't invent new)
- **Framework**: pytest with PG via docker-compose

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Python**: Bash (curl, pytest, python REPL)
- **DB connectivity**: Bash (pg_isready, prisma db push)
- **Schema verification**: Bash (grep, prisma validate)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Test infra — must complete first):
├── Task 1: Create conftest.py with session-scoped PG fixture
├── Task 2: Adapt test_persona_v2.py (remove PRAGMA tests, use PG)
├── Task 3: Adapt 6 other test files (DATABASE_TYPE=prisma)
├── Task 4: Fix test_document_upload.py (add explicit DATABASE_TYPE)
└── Task 5: Restructure make test target (docker compose up postgres)

Wave 2 (Core removal — delete files, simplify __init__):
├── Task 6: Delete sqlite.py and postgres.py
├── Task 7: Simplify __init__.py (Prisma-only routing)
├── Task 8: Move get_agent_memories_by_id into PrismaBackend class
└── Task 9: Remove hasattr guards in scheduler.py

Wave 3 (main.py hasattr cleanup — large, same concern):
├── Task 10: Remove all hasattr(db) guards in main.py (35 sites)
├── Task 11: Remove hasattr guards in test_conclusion_e2e.py (8 sites)
└── Task 12: Update all test imports + db access patterns

Wave 4 (Config + docs — fully parallel):
├── Task 13: Update .env.example (default to prisma, clean PG section)
├── Task 14: Fix SETUP.md DATABASE_URL (remove +asyncpg)
├── Task 15: Update docs/UI_UX_IMPROVEMENTS.md sqlite/postgres refs
└── Task 16: Verify prisma generate + patch_prisma_client succeeds

Wave FINAL (4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — full pytest run + API smoke test (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix
- **1**: None — start immediately. **2-5**: Task 1 (conftest.py must exist first)
- **6**: None (file deletion)
- **7**: None (__init__.py)
- **8**: 6, 7 (needs files removed + init simplified)
- **9-10**: 7 (needs Prisma-only routing confirmed)
- **11**: 7 (same)
- **12**: 2-4, 10-11 (test adapt + hasattr removal)
- **13-16**: None — fully parallel with all above
- **F1-F4**: ALL above

### Agent Dispatch Summary
- **Wave 1**: Tasks 1-5 → `quick` (test adapt)
- **Wave 2**: Tasks 6-9 → `quick` (delete + simplify)
- **Wave 3**: Tasks 10-12 → `unspecified-high` (hasattr removal high volume)
- **Wave 4**: Tasks 13-16 → `quick` (docs)
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. **Create `conftest.py` with session-scoped PG fixture**

  **What to do**:
  - Create `backend/tests/conftest.py` with `@pytest.fixture(scope="session")` for postgres
  - Fixture: check `docker compose -f ../../docker-compose.yml ps postgres` is healthy; if not, skip with clear error message "Run `docker compose up postgres -d` from project root"
  - Set `os.environ["DATABASE_URL"] = "postgresql://boardroom:boardroom@localhost:5432/boardroom"` in fixture
  - Set `os.environ["DATABASE_TYPE"] = "prisma"` globally for test session
  - Add `pytest_sessionstart` hook to run `prisma db push --skip-generate` to ensure schema exists
  - Add `pytest_sessionfinish` hook for cleanup
  - Mark all test functions that need DB with `@pytest.mark.usefixtures("db_setup")`
  - Include `pytest.mark.timeout(60)` for testcontainers-latency resilience

  **Must NOT do**:
  - Do NOT import SQLiteBackend or PostgresBackend
  - Do NOT use testcontainers (user chose docker-compose exec)

  **Recommended Agent Profile**:
  - **Category**: `quick` — straightforward fixture creation
  - **Skills**: [] — no special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (infrastructure)
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None

  **References**:
  - `backend/tests/` — existing test patterns (no conftest.py exists yet, first one)
  - `backend/prisma/schema.prisma` — datasource definition
  - `backend/docker-compose.yml` — postgres service definition

  **Acceptance Criteria**:
  - [ ] `conftest.py` exists at `backend/tests/conftest.py`
  - [ ] No imports of SQLiteBackend or PostgresBackend
  - [ ] Contains `pytest_sessionstart` that runs `prisma db push`
  - [ ] Contains clear error msg if postgres not running

  **QA Scenarios**:
  ```
  Scenario: conftest fixture works with running PG
    Tool: Bash
    Preconditions: `docker compose up postgres -d` is running
    Steps:
      1. Run `cd backend && python -m pytest tests/conftest.py -x --collect-only`
      2. Assert exit code 0, no import errors
    Expected Result: Fixture collects cleanly
    Evidence: .omo/evidence/task-1-fixture-collect.txt

  Scenario: conftest fixture errors when PG is down
    Tool: Bash
    Preconditions: `docker compose stop postgres`
    Steps:
      1. Run `cd backend && python -m pytest tests/test_evolution.py -x 2>&1 | head -20`
      2. Assert output contains "docker compose up postgres" or equivalent error
      3. `docker compose start postgres` to restore
    Expected Result: Clear error message, not a cryptic connection refused
    Evidence: .omo/evidence/task-1-fixture-error.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-fixture-collect.txt
  - [ ] task-1-fixture-error.txt

  **Commit**: NO (groups with Task 3)

---

- [x] 2. **Rewrite `test_persona_v2.py` — remove SQLite-specific tests**

  **What to do**:
  - Remove `from app.database.sqlite import SQLiteBackend` import
  - Remove `os.environ["DATABASE_TYPE"] = "sqlite"` and `os.environ["SQLITE_PATH"] = ":memory:"`
  - Remove `_make_db()` helper that creates `SQLiteBackend(":memory:")`
  - Replace schema validation tests (lines 47-115, `PRAGMA table_info`) with equivalent Prisma introspection: use `prisma db execute --stdin` or check model exists via Prisma client API
  - Key schema to verify: `stakeholders` has columns (backstory, stance, personality, tools), `persona_documents`, `persona_evolution`, `persona_research` tables exist
  - API-level tests (POST/GET personas, documents, evolutions) should stay — they already test against the actual DB
  - Use `initialize_database()` + `close_database()` from `app.database` (already imported)
  - Add `@pytest.mark.usefixtures("db_setup")` to all test functions

  **Must NOT do**:
  - Do NOT use `sqlite3` module, `PRAGMA`, or any SQLite-specific syntax
  - Do NOT change test assertions — API behavior must be identical
  - Do NOT delete valid API-level tests (only the schema introspection ones)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — careful test rewrite, must preserve correctness
  - **Skills**: [] — standard python testing

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 fixture)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:
  - `backend/tests/test_persona_v2.py` — full file, current SQLite-specific patterns
  - `backend/app/database/prisma.py` — PrismaBackend class (replacement for SQLiteBackend)
  - `backend/prisma/schema.prisma` — authoritative schema definition
  - `backend/app/main.py` — API endpoint patterns that tests exercise

  **Acceptance Criteria**:
  - [ ] No imports of `SQLiteBackend` or `sqlite3` in test file
  - [ ] `pytest backend/tests/test_persona_v2.py -x` passes
  - [ ] All original API-level tests still pass with identical assertions
  - [ ] Schema presence verified via Prisma API, not raw SQL PRAGMA

  **QA Scenarios**:
  ```
  Scenario: test_persona_v2 runs against PG
    Tool: Bash
    Preconditions: `docker compose up postgres -d`, conftest.py in place
    Steps:
      1. `cd backend && python -m pytest tests/test_persona_v2.py -x -v 2>&1`
      2. Check output — all tests PASS, no skipped, no errors
      3. Count >= original test count (pre-rewrite)
    Expected Result: All tests pass
    Evidence: .omo/evidence/task-2-persona-v2-pass.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-persona-v2-pass.txt

  **Commit**: NO (groups with Task 3)

---

- [x] 3. **Adapt 6 test files — switch from SQLite to PG**

  **What to do**:
  For each file, make these changes (identical pattern):
  1. Remove/change `os.environ["DATABASE_TYPE"] = "sqlite"` → `os.environ["DATABASE_TYPE"] = "prisma"`
  2. Remove `os.environ["SQLITE_PATH"] = ":memory:"` or tempfile-based path
  3. Add `import pytest` if not present
  4. Add `@pytest.mark.usefixtures("db_setup")` to all test functions (or `autouse=True`)
  5. Verify `from app.database import initialize_database, close_database` works correctly
  6. Verify no SQLite-specific patterns remain (no `sqlite3.Row`, no `PRAGMA`, no `.conn.`)

  Files to adapt:
  - `tests/test_evolution.py`
  - `tests/test_knowledge.py`
  - `tests/test_simulation_knowledge_injection.py`
  - `tests/test_research_integration.py`
  - `tests/test_conclusion_e2e.py`
  - `tests/test_document_upload.py` (this one doesn't set DATABASE_TYPE at all — must add it)

  **Must NOT do**:
  - Do NOT change test logic or assertions — only DB plumbing
  - Do NOT remove test functions — every test must survive migration

  **Recommended Agent Profile**:
  - **Category**: `quick` — mechanical find-replace pattern
  - **Skills**: [] — standard python

  **Parallelization**:
  - **Can Run In Parallel**: YES (each file independent)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:
  - Each test file in `backend/tests/` — current patterns
  - `backend/tests/conftest.py` — shared fixture

  **Acceptance Criteria**:
  - [ ] `grep -r "DATABASE_TYPE.*sqlite" backend/tests/` → zero matches
  - [ ] `grep -r "SQLITE_PATH" backend/tests/` → zero matches
  - [ ] `grep -r "\.conn\." backend/tests/` → zero matches
  - [ ] `pytest backend/tests/test_{evolution,knowledge,simulation_knowledge_injection,research_integration,conclusion_e2e,document_upload}.py -x` → ALL pass

  **QA Scenarios**:
  ```
  Scenario: All 6 test files pass against PG
    Tool: Bash
    Preconditions: PG running, conftest.py in place
    Steps:
      1. `cd backend && python -m pytest tests/test_evolution.py tests/test_knowledge.py tests/test_simulation_knowledge_injection.py tests/test_research_integration.py tests/test_conclusion_e2e.py tests/test_document_upload.py -x -v 2>&1`
      2. Check each file reports PASS
    Expected Result: All tests pass
    Evidence: .omo/evidence/task-3-six-tests-pass.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-six-tests-pass.txt

  **Commit**: YES
  - Message: `test: migrate 7 test files from SQLite to PG via docker-compose`
  - Files: `backend/tests/*.py` (all 7 + conftest.py)
  - Pre-commit: `pytest backend/tests/ -x --timeout=120`

- [x] 4. **Fix `test_document_upload.py` — add explicit DATABASE_TYPE**

  **What to do**:
  - Currently does NOT set `DATABASE_TYPE` — relies on default `sqlite` (which will become `prisma`)
  - Add `os.environ["DATABASE_TYPE"] = "prisma"` at the top (before any app imports)
  - Remove `os.environ["SQLITE_PATH"] = ":memory:"` line
  - Add `@pytest.mark.usefixtures("db_setup")` to test functions
  - Verify no SQLite-specific patterns

  **Must NOT do**:
  - Do NOT change test assertions

  **Recommended Agent Profile**:
  - **Category**: `quick` — trivial fix
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 3)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:
  - `backend/tests/test_document_upload.py` — current file

  **Acceptance Criteria**:
  - [ ] `grep "DATABASE_TYPE.*sqlite" backend/tests/test_document_upload.py` → zero
  - [ ] `pytest backend/tests/test_document_upload.py -x` → passes

  **QA Scenarios**:
  ```
  Scenario: document_upload test passes
    Tool: Bash
    Preconditions: PG running
    Steps:
      1. `cd backend && python -m pytest tests/test_document_upload.py -x -v 2>&1`
    Expected Result: ALL PASS
    Evidence: .omo/evidence/task-4-doc-upload-pass.txt
  ```

  **Evidence to Capture**:
  - [ ] task-4-doc-upload-pass.txt

  **Commit**: Groups with Task 3

---

- [x] 5. **Update `make test` target — add PG dependency**

  **What to do**:
  - Read `backend/Makefile` or root `Makefile` — find `test` target
  - Add `docker compose up postgres -d` before pytest command
  - Add `@echo "Waiting for PostgreSQL..." && sleep 3` or `pg_isready` wait loop
  - Ensure `DATABASE_URL` env is exported for Prisma
  - Ensure `prisma db push` runs before tests (or make it part of test setup)

  **Must NOT do**:
  - Do NOT start Neo4j or Redis for tests (they have their own services)
  - Do NOT change other make targets

  **Recommended Agent Profile**:
  - **Category**: `quick` — update makefile
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (infrastructure)
  - **Blocks**: Nothing (dev-facing change)
  - **Blocked By**: Task 1 (pattern reference)

  **References**:
  - `Makefile` — root makefile
  - `docker-compose.yml` — postgres service

  **Acceptance Criteria**:
  - [ ] `make test` starts PG if not running, runs tests, outputs pass/fail

  **QA Scenarios**:
  ```
  Scenario: make test works end-to-end
    Tool: Bash
    Preconditions: No PG running (docker compose stop postgres)
    Steps:
      1. `cd /project/root && make test 2>&1`
      2. Check output — PG started, tests ran
      3. `docker compose ps postgres` shows running
    Expected Result: Tests pass
    Evidence: .omo/evidence/task-5-make-test.txt
  ```

  **Evidence to Capture**:
  - [ ] task-5-make-test.txt

  **Commit**: Groups with Task 15/16 (Commit 6)
  - Message: `chore: update make test to auto-start PG via docker compose`
  - Files: `Makefile`

---

- [x] 6. **Delete `sqlite.py` and `postgres.py` from `app/database/`**

  **What to do**:
  - `rm backend/app/database/sqlite.py`
  - `rm backend/app/database/postgres.py`
  - Verify no other file imports them (grep for `from.*database.*sqlite\|from.*database.*postgres`)
  - Clean up `__pycache__/` if present

  **Must NOT do**:
  - Do NOT delete `prisma.py`, `base.py`, or `__init__.py`
  - Do NOT delete `prisma/schema.prisma`

  **Recommended Agent Profile**:
  - **Category**: `quick` — file deletion
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 1-5
  - **Blocks**: Task 7, 8
  - **Blocked By**: None

  **References**:
  - `backend/app/database/sqlite.py` — 804 lines to delete
  - `backend/app/database/postgres.py` — 1392 lines to delete

  **Acceptance Criteria**:
  - [ ] `ls backend/app/database/sqlite.py` → "No such file or directory"
  - [ ] `ls backend/app/database/postgres.py` → "No such file or directory"
  - [ ] `grep -r "from.*\.sqlite\|from.*\.postgres" backend/app/` → zero matches

  **QA Scenarios**:
  ```
  Scenario: deleted files confirmed gone
    Tool: Bash
    Steps:
      1. `ls backend/app/database/sqlite.py backend/app/database/postgres.py 2>&1`
    Expected Result: Both files don't exist
    Evidence: .omo/evidence/task-6-deleted-confirmed.txt

  Scenario: app still imports correctly
    Tool: Bash
    Preconditions: venv active
    Steps:
      1. `cd backend && python -c "from app.database import get_database; print('OK')" 2>&1`
    Expected Result: 'OK' printed, no ImportError
    Evidence: .omo/evidence/task-6-import-ok.txt
  ```

  **Evidence to Capture**:
  - [ ] task-6-deleted-confirmed.txt
  - [ ] task-6-import-ok.txt

  **Commit**: Groups with Task 7

- [x] 7. **Simplify `database/__init__.py` — Prisma-only routing**

  **What to do**:
  - Remove imports: `from .sqlite import SQLiteBackend`, `from .postgres import PostgresBackend`
  - Keep: `from .prisma import PrismaBackend` (remove `get_agent_memories_by_id` from this import — it's moving into the class)
  - Remove `db_type = os.getenv("DATABASE_TYPE", "sqlite").lower()` and all branching logic
  - `get_database()` always does: `_db_instance = PrismaBackend(); return _db_instance`
  - Remove `__all__` export of `get_agent_memories_by_id` (will be called as method)
  - Remove deprecation warning logs
  - Keep `initialize_database()` and `close_database()` (same interface)

  **Must NOT do**:
  - Do NOT change `get_database()`, `initialize_database()`, or `close_database()` signatures
  - Do NOT rename PrismaBackend class
  - Do NOT remove `_db_instance` singleton pattern

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6)
  - **Blocks**: Task 8, 9, 10, 11
  - **Blocked By**: Task 6

  **References**:
  - `backend/app/database/__init__.py` — current file (54 lines)

  **Acceptance Criteria**:
  - [ ] New file has no `sqlite`, `postgres`, or `db_type` references
  - [ ] `get_database()` returns PrismaBackend without branching
  - [ ] `python -c "from app.database import get_database, initialize_database, close_database; print('OK')"` → OK

  **QA Scenarios**:
  ```
  Scenario: init imports work
    Tool: Bash
    Steps:
      1. `cd backend && python -c "from app.database import get_database, initialize_database, close_database; print('OK')" 2>&1`
    Expected Result: 'OK'
    Evidence: .omo/evidence/task-7-init-import.txt

  Scenario: no SQLite/postgres references remain
    Tool: Bash
    Steps:
      1. `grep -n "sqlite\|postgres" backend/app/database/__init__.py`
    Expected Result: zero matches
    Evidence: .omo/evidence/task-7-no-refs.txt
  ```

  **Evidence to Capture**:
  - [ ] task-7-init-import.txt
  - [ ] task-7-no-refs.txt

  **Commit**: YES (groups with 6)
  - Message: `refactor: remove SQLiteBackend and PostgresBackend, Prisma-only DB layer`
  - Files: `backend/app/database/__init__.py`, `backend/app/database/sqlite.py`, `backend/app/database/postgres.py`

---

- [x] 8. **Move `get_agent_memories_by_id` into PrismaBackend**

  **What to do**:
  - Cut the standalone `get_agent_memories_by_id(db, persona_id)` function from bottom of `prisma.py` (lines 1451-1477)
  - Add it as a method on `PrismaBackend`: `async def get_agent_memories_by_id(self, persona_id: str) -> list[dict]:`
  - Change `db._client_or_raise()` → `self._client_or_raise()` (no parameter needed)
  - Update caller in `main.py` line 1477: change from `from .database import get_agent_memories_by_id as _get_memories` to calling `db.get_agent_memories_by_id(persona_id)` directly
  - Remove `get_agent_memories_by_id` from `__init__.py` imports

  **Must NOT do**:
  - Do NOT change the function's return type or behavior
  - Do NOT rename the method (it's referenced by name in main.py)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — involves updating import chain across 3 files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 6, 7)
  - **Blocks**: Task 10 (main.py hasattr cleanup)
  - **Blocked By**: Task 7

  **References**:
  - `backend/app/database/prisma.py:1451-1477` — standalone fn
  - `backend/app/main.py:1477` — caller
  - `backend/app/database/__init__.py` — exports

  **Acceptance Criteria**:
  - [ ] `grep "def get_agent_memories_by_id" backend/app/database/prisma.py` shows method inside PrismaBackend class (indented)
  - [ ] `python -c "from app.database.prisma import PrismaBackend; assert hasattr(PrismaBackend, 'get_agent_memories_by_id')"` → no error
  - [ ] main.py no longer imports `get_agent_memories_by_id` from `.database`

  **QA Scenarios**:
  ```
  Scenario: method lives on PrismaBackend
    Tool: Bash
    Steps:
      1. `cd backend && python -c "from app.database import get_database; db = get_database(); print(hasattr(db, 'get_agent_memories_by_id'))" 2>&1`
    Expected Result: True
    Evidence: .omo/evidence/task-8-method-exists.txt
  ```

  **Evidence to Capture**:
  - [ ] task-8-method-exists.txt

  **Commit**: Groups with Task 10

---

- [x] 9. **Remove `hasattr` guards in `scheduler.py`**

  **What to do**:
  - Edit `backend/app/runtime/scheduler.py`
  - Line 375: Remove `if hasattr(db, 'create_state_snapshot'):` — call `await db.create_state_snapshot(...)` unconditionally
  - Line 407: Remove `if hasattr(db, 'save_postmortem'):` — call `await db.save_postmortem(...)` unconditionally
  - Keep the outer `try/except Exception: pass` as defensive coding (DB could be down)

  **Must NOT do**:
  - Do NOT remove the `try/except` blocks — runtime DB failures should still be caught
  - Do NOT change any other logic

  **Recommended Agent Profile**:
  - **Category**: `quick` — 2 line changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 10, 11)
  - **Blocks**: Task F1-F4
  - **Blocked By**: Task 7

  **References**:
  - `backend/app/runtime/scheduler.py:370-410` — surrounding context

  **Acceptance Criteria**:
  - [ ] `grep "hasattr.*db" backend/app/runtime/scheduler.py` → zero matches

  **QA Scenarios**:
  ```
  Scenario: scheduler no longer has hasattr guards
    Tool: Bash
    Steps:
      1. `grep -n "hasattr.*db" backend/app/runtime/scheduler.py`
    Expected Result: No matches
    Evidence: .omo/evidence/task-9-scheduler-clean.txt
  ```

  **Evidence to Capture**:
  - [ ] task-9-scheduler-clean.txt

  **Commit**: Groups with Task 10

---

- [x] 10. **Remove all `hasattr(db, ...)` guards in `main.py`**

  **What to do**:
  This is the largest task — 35 sites in main.py. Each follows the pattern:
  ```python
  if hasattr(db, 'some_method'):
      result = await db.some_method(...)
  ```
  → becomes:
  ```python
  result = await db.some_method(...)
  ```

  Full list of methods to make unconditional:
  - `migrate_legacy_templates` (L179)
  - `list_personas_v2` (L253) — keep `list_personas` fallback removed
  - `list_personas` (L257) — removed (keep only list_personas_v2)
  - `get_persona_detail` (L302) → `if not hasattr(db, 'get_persona_detail')` guard removed (always has it)
  - `get_evolution`, `update_persona` (L523)
  - `list_templates_catalog` (L580)
  - `get_template_catalog` (L589)
  - `get_participant_id`, `insert_new_turn` (L680)
  - `insert_semantic_memory` (L689)
  - `create_state_snapshot` (L700)
  - `delete_old_state_snapshots` (L702)
  - `list_simulations_v2` (L722)
  - `create_new_simulation` (L774)
  - `create_new_simulation` (L829)
  - `create_document` (L891)
  - `update_document_status` (L908, L918)
  - `get_turns_by_simulation` (L970)
  - `list_simulations_v2` (L1101)
  - `get_all_turns_count` (L1114)
  - `get_simulation_config` (L1137)
  - `get_documents_by_simulation` (L1153)
  - `get_state_snapshots_by_simulation` (L1179)
  - `get_simulation_config` (L1218, L1243)
  - `get_turns_by_simulation` (L1227, L1261)
  - `get_state_snapshots_by_simulation` (L1268)
  - `get_simulation_config` (L1318)
  - `get_postmortem` (L1334)
  - `get_turns_by_simulation` (L1347)
  - `save_postmortem` (L1388)
  - `get_agent_by_id` (L1453)
  - `get_agent_by_name` (L1455)
  - `get_persona_detail` (L1457)

  For `list_personas` (L257) and `list_personas_v2` (L253): remove the fallback. Always call `list_personas_v2` since PrismaBackend has it.
  For `get_agent_by_id`/`get_agent_by_name`/`get_persona_detail` cascading fallback (L1453-1457): simplify to single call to `get_agent_by_id` since PrismaBackend handles all lookup strategies internally.

  Keep `try/except Exception: pass` wrapping for DB-related calls (defensive).

  **Must NOT do**:
  - Do NOT change `try/except` blocks — runtime resilience stays
  - Do NOT refactor method names or signatures
  - Do NOT change API response shapes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — large volume (35+ sites), meticulous editing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 7, 8

  **References**:
  - `backend/app/main.py` — full file, current hasattr guard locations
  - Metis review confirmed all 28 unique methods exist on PrismaBackend

  **Acceptance Criteria**:
  - [ ] `grep "hasattr.*db" backend/app/main.py` → zero matches
  - [ ] `python -c "from app.main import app; print(app.title)"` → "Boardroom Simulator API" (app still loads)

  **QA Scenarios**:
  ```
  Scenario: no hasattr guards remain
    Tool: Bash
    Steps:
      1. `grep -c "hasattr.*db" backend/app/main.py`
    Expected Result: 0 matches
    Evidence: .omo/evidence/task-10-hasattr-zero.txt

  Scenario: app loads without error
    Tool: Bash
    Steps:
      1. `cd backend && python -c "from app.main import app; print(app.title)" 2>&1`
    Expected Result: "Boardroom Simulator API"
    Evidence: .omo/evidence/task-10-app-loads.txt
  ```

  **Evidence to Capture**:
  - [ ] task-10-hasattr-zero.txt
  - [ ] task-10-app-loads.txt

  **Commit**: YES (groups with 8, 9)
  - Message: `refactor: remove all hasattr(db) guards — Prisma is the only backend`
  - Files: `backend/app/main.py`, `backend/app/runtime/scheduler.py`, `backend/app/database/prisma.py`, `backend/app/database/__init__.py`

- [x] 11. **Remove `hasattr` guards in `test_conclusion_e2e.py`**

  **What to do**:
  - 8 hasattr guards in this file (lines 664, 671, 681, 686, 694, 719, 724)
  - Each follows same pattern as main.py — remove `if hasattr(db, ...)` make unconditional
  - Methods to unguard: `create_new_simulation`, `get_simulation_config`, `create_state_snapshot`, `get_state_snapshots_by_simulation`, `save_postmortem`/`get_postmortem`, `update_simulation_status_v2`, `list_simulations_v2`

  **Must NOT do**:
  - Do NOT remove `try/except` wrapping
  - Do NOT change test logic

  **Recommended Agent Profile**:
  - **Category**: `quick` — 8 mechanical changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 9, 10)
  - **Blocks**: Task 12
  - **Blocked By**: Task 7

  **References**:
  - `backend/tests/test_conclusion_e2e.py:653-730`

  **Acceptance Criteria**:
  - [ ] `grep "hasattr.*db" backend/tests/test_conclusion_e2e.py` → zero matches

  **QA Scenarios**:
  ```
  Scenario: no hasattr guards remain in conclusion test
    Tool: Bash
    Steps:
      1. `grep -c "hasattr.*db" backend/tests/test_conclusion_e2e.py`
    Expected Result: 0
    Evidence: .omo/evidence/task-11-conclusion-clean.txt
  ```

  **Evidence to Capture**:
  - [ ] task-11-conclusion-clean.txt

  **Commit**: Groups with Task 10

---

- [x] 12. **Update all test imports + db access patterns**

  **What to do**:
  - Scan ALL test files in `backend/tests/` for:
    - Any remaining direct Prisma imports (e.g., `from app.database.prisma import PrismaBackend`)
    - Any `_db_instance` manipulation
    - Any `SQLiteBackend` or `PostgresBackend` references
  - Fix any issues found
  - Ensure all tests use `get_database()` singleton and `conftest.py` fixture

  **Must NOT do**:
  - Do NOT change test logic or assertions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — careful audit of all test files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all previous tasks)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 2, 3, 4, 10, 11

  **References**:
  - All files in `backend/tests/`

  **Acceptance Criteria**:
  - [ ] `grep -r "SQLiteBackend\|PostgresBackend\|from.*\.sqlite\|from.*\.postgres" backend/tests/` → zero matches
  - [ ] `pytest backend/tests/ -x --timeout=120` → ALL pass

  **QA Scenarios**:
  ```
  Scenario: full test suite passes
    Tool: Bash
    Preconditions: PG running, all previous changes applied
    Steps:
      1. `cd backend && python -m pytest tests/ -x --timeout=120 2>&1`
    Expected Result: ALL tests pass, exit code 0
    Evidence: .omo/evidence/task-12-full-suite-pass.txt
  ```

  **Evidence to Capture**:
  - [ ] task-12-full-suite-pass.txt

  **Commit**: YES
  - Message: `test: finalize test migration — remove all SQLite/PG backend test references`
  - Files: `backend/tests/*.py`
  - Pre-commit: `pytest backend/tests/ -x --timeout=120`

---

- [x] 13. **Update `.env.example` — Prisma-only defaults**

  **What to do**:
  - Change `DATABASE_TYPE=sqlite` → `DATABASE_TYPE=prisma`
  - Remove `SQLITE_PATH=./data/boardroom.db`
  - Update comment: "Set DATABASE_TYPE=prisma and ensure DATABASE_URL is set" (remove postgres option)
  - Remove or comment out the "Postgres (only when DATABASE_TYPE=postgres)" section (no longer needed — Prisma uses DATABASE_URL)
  - Keep DATABASE_URL commented as documentation: `# DATABASE_URL=postgresql://boardroom:boardroom@localhost:5432/boardroom`
  - Ensure `DATABASE_URL` is documented as Prisma's connection string (no `+asyncpg` suffix)

  **Must NOT do**:
  - Do NOT remove other env vars (Redis, Tavily, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14, 15, 16)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:
  - `backend/.env.example` — current file

  **Acceptance Criteria**:
  - [ ] `grep "DATABASE_TYPE=sqlite\|SQLITE_PATH\|DATABASE_TYPE=postgres" backend/.env.example` → zero matches
  - [ ] `grep "DATABASE_TYPE=prisma" backend/.env.example` → match found

  **QA Scenarios**:
  ```
  Scenario: .env.example has Prisma defaults
    Tool: Bash
    Steps:
      1. `grep "DATABASE_TYPE" backend/.env.example`
    Expected Result: Shows DATABASE_TYPE=prisma
    Evidence: .omo/evidence/task-13-env-clean.txt
  ```

  **Evidence to Capture**:
  - [ ] task-13-env-clean.txt

  **Commit**: Groups with Task 14

---

- [x] 14. **Fix `SETUP.md` — correct DATABASE_URL format**

  **What to do**:
  - Find `SETUP.md` in repo root
  - Find line with `DATABASE_URL=postgresql+asyncpg://...` — remove `+asyncpg` suffix
  - Prisma expects `postgresql://boardroom:boardroom@localhost:5432/boardroom` (not asyncpg-specific)
  - Update any instructions that reference sqlite or dual-backend setup

  **Must NOT do**:
  - Do NOT rewrite unrelated sections of SETUP.md

  **Recommended Agent Profile**:
  - **Category**: `quick` — doc fix
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 15, 16)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:
  - `SETUP.md` — setup documentation
  - Prisma schema `backend/prisma/schema.prisma` — DATABASE_URL format

  **Acceptance Criteria**:
  - [ ] `grep "asyncpg" SETUP.md` → zero matches

  **QA Scenarios**:
  ```
  Scenario: SETUP.md has correct DATABASE_URL
    Tool: Bash
    Steps:
      1. `grep "DATABASE_URL" SETUP.md`
    Expected Result: No +asyncpg suffix
    Evidence: .omo/evidence/task-14-setup-url.txt
  ```

  **Evidence to Capture**:
  - [ ] task-14-setup-url.txt

  **Commit**: YES (groups with 13)
  - Message: `docs: update .env.example and SETUP.md — Prisma-only DB config`
  - Files: `backend/.env.example`, `SETUP.md`

---

- [x] 15. **Update `docs/UI_UX_IMPROVEMENTS.md` — remove sqlite/postgres refs**

  **What to do**:
  - Find references to `DATABASE_TYPE=sqlite`, `DATABASE_TYPE=postgres`, SQLiteBackend, PostgresBackend
  - Replace with Prisma-only references
  - If the doc mentions switching between backends, update to state Prisma is the only option

  **Must NOT do**:
  - Do NOT rewrite unrelated UI/UX documentation

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 16)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:
  - `docs/UI_UX_IMPROVEMENTS.md`

  **Acceptance Criteria**:
  - [ ] `grep -i "sqlite\|postgres.*backend\|DATABASE_TYPE.*sqlite\|DATABASE_TYPE.*postgres" docs/UI_UX_IMPROVEMENTS.md` → zero matches

  **QA Scenarios**:
  ```
  Scenario: no old backend refs in docs
    Tool: Bash
    Steps:
      1. `grep -c "sqlite\|postgres.*backend" docs/UI_UX_IMPROVEMENTS.md || echo 0`
    Expected Result: 0
    Evidence: .omo/evidence/task-15-docs-clean.txt
  ```

  **Evidence to Capture**:
  - [ ] task-15-docs-clean.txt

  **Commit**: Groups with Task 16

---

- [x] 16. **Verify `prisma generate` + `patch_prisma_client.py` succeeds**

  **What to do**:
  - Run `cd backend && npx prisma generate` (or `npm run generate`)
  - Run `python scripts/patch_prisma_client.py`
  - Both should succeed without errors
  - Fix any issues (e.g., if `patch_prisma_client.py` paths are wrong for local Python version)
  - Add to `make install` or `make backend` if missing

  **Must NOT do**:
  - Do NOT upgrade prisma-client-py version
  - Do NOT modify prisma schema

  **Recommended Agent Profile**:
  - **Category**: `quick` — verify existing toolchain
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 15)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:
  - `backend/scripts/patch_prisma_client.py`
  - `backend/Dockerfile` — currently runs `npm run generate`

  **Acceptance Criteria**:
  - [ ] `npx prisma generate` exits 0
  - [ ] `python scripts/patch_prisma_client.py` exits 0

  **QA Scenarios**:
  ```
  Scenario: prisma generate + patch succeed
    Tool: Bash
    Steps:
      1. `cd backend && npx prisma generate 2>&1 && echo "GENERATE_OK"`
      2. `python scripts/patch_prisma_client.py 2>&1 && echo "PATCH_OK"`
    Expected Result: Both output OK
    Evidence: .omo/evidence/task-16-prisma-gen.txt
  ```

  **Evidence to Capture**:
  - [ ] task-16-prisma-gen.txt

  **Commit**: YES (groups with 15)
  - Message: `docs: update UI_UX docs, verify prisma toolchain`
  - Files: `docs/UI_UX_IMPROVEMENTS.md`, `backend/scripts/patch_prisma_client.py` (if fixed)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify:
  - All "Must Have" items are implemented and verifiable
  - All "Must NOT Have" items are absent (search for forbidden patterns)
  - Evidence files exist in `.omo/evidence/`
  - 2 DB backend files actually deleted
  - All 45 hasattr guards removed
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  - `python -c "from app.main import app; print(app.title)"` succeeds
  - `python -c "from app.database import get_database; print(get_database())"` returns PrismaBackend instance (no errors)
  - `cd backend && python -m pytest tests/ -x --timeout=120` ALL pass
  - Check no `hasattr(db, ...)` guards remain
  - Check no SQLiteBackend/PostgresBackend imports remain
  Output: `Import [PASS/FAIL] | Tests [N pass/N fail] | Cleanup [PASS/FAIL] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` if frontend)
  Start from clean state (fresh checkout). Execute:
  - `docker compose up postgres -d` → PG starts
  - `cd backend && npx prisma generate && python scripts/patch_prisma_client.py` → toolchain OK
  - `pytest backend/tests/ -x --timeout=120` → ALL pass
  - `curl localhost:8000/health` → `{"status": "ok", "unified": true}`
  - `curl localhost:8000/stakeholders` → 200 with array
  Save to `.omo/evidence/final-qa/`
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify:
  - No files deleted beyond sqlite.py, postgres.py
  - No PrismaBackend internals refactored
  - No API response shape changes
  - No new test cases added (only adapted)
  - DATABASE_TYPE env var references cleaned up
  Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Commit | Files | Message |
|--------|-------|---------|
| 1 | `backend/tests/conftest.py`, `backend/tests/test_*.py` (7 files) | `test: migrate 7 test files from SQLite to PG via docker-compose` |
| 2 | `backend/app/database/__init__.py`, +delete sqlite.py + postgres.py | `refactor: remove SQLiteBackend and PostgresBackend, Prisma-only DB layer` |
| 3 | `backend/app/main.py`, `backend/app/runtime/scheduler.py`, `backend/app/database/prisma.py` | `refactor: remove all hasattr(db) guards — Prisma is the only backend` |
| 4 | `backend/tests/*.py` (final cleanup) | `test: finalize test migration — remove all SQLite/PG backend test references` |
| 5 | `backend/.env.example`, `SETUP.md` | `docs: update .env.example and SETUP.md — Prisma-only DB config` |
| 6 | `docs/UI_UX_IMPROVEMENTS.md`, `Makefile` | `docs: update UI_UX docs, verify prisma toolchain` |

---

## Success Criteria

### Verification Commands
```bash
# 1. Toolchain works
cd backend && npx prisma generate && python scripts/patch_prisma_client.py
# Expected: both exit 0

# 2. App loads
python -c "from app.main import app; print(app.title)"
# Expected: "Boardroom Simulator API"

# 3. DB singleton returns PrismaBackend
python -c "from app.database import get_database; db = get_database(); print(type(db).__name__)"
# Expected: "PrismaBackend"

# 4. Tests pass
pytest backend/tests/ -x --timeout=120
# Expected: ALL pass, exit 0

# 5. API smoke test
curl http://localhost:8000/health
# Expected: {"status": "ok", "unified": true}
```

### Final Checklist
- [ ] All "Must Have" items verified
- [ ] All "Must NOT Have" items absent (grep confirmed)
- [ ] All tests pass
- [ ] `grep -r "SQLiteBackend\|PostgresBackend\|from.*\.sqlite\|from.*\.postgres" backend/` → zero
- [ ] `grep -r "hasattr.*db\b" backend/app/` → zero
- [ ] `grep "DATABASE_TYPE=sqlite\|SQLITE_PATH" backend/` → zero (except .env.example comments)
- [ ] All commits pushed, plan complete

