# Prisma Database Migration Plan

## TL;DR
> **Quick Summary**: Completely migrate the Boardroom Simulator backend persistence layer from raw `asyncpg`/`sqlite3` SQL strings to a type-safe **Prisma Client Python** implementation, standardizing on PostgreSQL as the single provider.
> 
> **Deliverables**: 
> - Introspected and refined `schema.prisma` mapping all 17 tables (with Postgres extensions enabled for pgvector/JSONB).
> - New `prisma_db.py` backend class implementing `DatabaseBackend` protocol natively via Prisma.
> - Deprecation of `sqlite.py` and `postgres.py`.
> - Integration in `main.py` for client connect/disconnect logic.
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Prisma Setup -> Prisma Schema Refinement -> `prisma_db` core methods -> Endpoint verification

---

## Context

### Original Request
Migrate the backend completely to `prisma-client-py`, converting all database functions to Prisma calls. SQLite should be dropped in favor of Postgres.

### Interview Summary
**Key Discussions**:
- Single vs Multi Provider: Prisma strictly enforces a single database provider (`postgresql`) at build time to enable provider-specific fields like `JSONB` and vectors. Dynamic runtime switching is not possible.
- Seeded Data: The current Postgres database has been cleanly seeded and linked.

**Research Findings**:
- Prisma Introspection (`prisma db pull`) provides the safest starting ground to map existing relationships without manually rewriting 17 tables.
- `pgvector` requires the Postgres `vector` extension in the Prisma schema configuration (`previewFeatures = ["postgresqlExtensions"]`).

### Metis Review
**Identified Gaps**:
- Need to ensure `prisma generate` step is hooked into application startup or explicit execution documentation.
- The `DatabaseBackend` abstract class might need signature tweaks if Prisma handles things differently, though returning dicts/Pydantic models preserves the API boundary.

---

## Work Objectives

### Core Objective
Replace raw SQL string persistence with Prisma Client Python type-safe queries while strictly preserving identical JSON structures across all API boundaries.

### Concrete Deliverables
- `backend/schema.prisma`
- `backend/app/database/prisma_db.py`
- Deprecated `sqlite.py` / `postgres.py` files removed

### Definition of Done
- [ ] Backend runs exclusively using the generated Prisma Client.
- [ ] API endpoints operate perfectly without requiring any frontend code changes.

### Must Have
- Prisma `provider = "postgresql"` enforcing Postgres exclusivity.
- Proper mapping of `JSONB` fields (Prisma `Json` type).
- Explicit `Agent-Executed QA Scenarios` validating `/stakeholders` and `/templates` data shape matches exactly before and after migration.

### Must NOT Have (Guardrails)
- Do NOT rewrite or modify frontend files. API boundaries must remain identical.
- Do NOT delete the local Dockerized Postgres database (this is the single source of truth during introspection).

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: Pytest configured in backend.
- **Automated tests**: Tests-after
- **Framework**: pytest
- **QA Policy**: Agent-executed `curl` requests verify API payloads for stakeholders and templates against the legacy system response before deploying Prisma changes to ensure zero regression.

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Start Immediately - Setup & Schema):
├── Task 1: Initialize Prisma, introspect existing Postgres database, and configure extensions [deep]
├── Task 2: Refine schema.prisma names and map JSONB/pgvector types [deep]

Wave 2 (After Wave 1 - Prisma Client Implementation):
├── Task 3: Implement Core Stakeholder & Template Repositories in `prisma_db.py` [deep]
├── Task 4: Implement Simulation Execution Repositories (participants, turns, etc.) [deep]
├── Task 5: Implement Evolution & Research Document Repositories [unspecified-high]

Wave 3 (After Wave 2 - Wiring & Deletion):
├── Task 6: Wire `main.py` to use `PrismaBackend` & Deprecate legacy files [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit
├── Task F2: Code quality review
├── Task F3: Real manual QA
└── Task F4: Scope fidelity check

Critical Path: Task 1 -> Task 2 -> Task 3 -> Task 6 -> F1-F4 -> user okay

---

## TODOs

- [x] 1. Prisma Scaffolding and DB Introspection

  **What to do**:
  - Install `prisma` globally in the virtual environment.
  - Run `prisma init` to generate a base `schema.prisma`.
  - Ensure `.env` is correctly pointing to the local Postgres database (`DATABASE_URL=postgresql://boardroom:boardroom@localhost:5432/boardroom`).
  - Run `prisma db pull` to introspect the 17 tables from Postgres.
  - Run `prisma generate` to build the Python client typings.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Initializing an ORM across 17 tables from a live DB requires execution precision and validation of the introspected schema output.
  - **Skills**: [`omc-setup`]
    - `omc-setup`: Ensures any python deps/environments are cleanly managed.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1
  - **Blocks**: [Task 2]
  - **Blocked By**: None

  **References**:
  - `backend/.env` - Extract credentials for `DATABASE_URL` mapping.

  **Acceptance Criteria**:
  - [ ] `backend/schema.prisma` file is created.
  - [ ] `schema.prisma` contains all 17 mapped tables from introspection.

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Validate Prisma Introspection
    Tool: interactive_bash
    Preconditions: Postgres is running on 5432
    Steps:
      1. Run `cd backend && cat schema.prisma | grep "model "`
    Expected Result: Returns ~17 model definitions reflecting the DB tables.
    Failure Indicators: "command not found" or missing tables.
    Evidence: .omo/evidence/task-1-schema-introspected.txt
  ```

  **Commit**: YES (Group 1)
  - Message: `build(backend): Setup Prisma Client Python and introspect db`

- [x] 2. Schema Refinement (JSONB & Vector Extensions)

  **What to do**:
  - Open `schema.prisma` and ensure `provider = "postgresql"`.
  - Add `previewFeatures = ["postgresqlExtensions"]` to the `generator` block.
  - Add `extensions = [vector]` to the `datasource` block (Prisma requirement for pgvector).
  - Verify that `config`, `personality`, and other JSON fields are typed as `Json` natively.
  - Run `prisma generate` again to apply schema refinements to the client.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires detailed string manipulation in the schema file to meet Prisma's specific extension syntax.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1
  - **Blocks**: [Task 3, 4, 5]
  - **Blocked By**: [Task 1]

  **References**:
  - `backend/schema.prisma`

  **Acceptance Criteria**:
  - [ ] `schema.prisma` includes postgresqlExtensions.
  - [ ] `prisma generate` passes without syntax errors.

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Validate Schema Compilation
    Tool: interactive_bash
    Preconditions: None
    Steps:
      1. Run `cd backend && prisma validate`
    Expected Result: Output indicates the schema is valid.
    Failure Indicators: Syntax validation errors.
    Evidence: .omo/evidence/task-2-schema-valid.txt
  ```

  **Commit**: YES (Group 1)
  - Message: `chore(prisma): refine schema for jsonb and pgvector extensions`

- [ ] 3. Implement Core Stakeholder & Template Repositories in `prisma_db.py`

  **What to do**:
  - Create `backend/app/database/prisma_db.py`.
  - Subclass `DatabaseBackend` and implement its abstract methods.
  - Implement: `create_stakeholder()`, `get_stakeholder()`, `update_stakeholder()`, `list_stakeholders()`, `delete_stakeholder()`.
  - Implement: `create_template()`, `get_template()`, `list_templates()`, `template_exists()`.
  - Map Pydantic models (like `Stakeholder` and `ScenarioTemplate`) to/from the Prisma models and JSON fields.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Implements the core persistence logic that routes most API payloads. Requires absolute precision.
  - **Skills**: [`software-architecture`]
    - `software-architecture`: Guide correct implementation of Repository pattern.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: [Task 6]
  - **Blocked By**: [Task 2]

  **References**:
  - `backend/app/database/postgres.py` - Reference legacy code signatures and implementation.
  - `backend/app/database/base.py` - Abstract base class constraint boundaries.

  **Acceptance Criteria**:
  - [ ] `backend/app/database/prisma_db.py` is created.
  - [ ] Compiles successfully with no syntax errors.

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Validate Prisma DB Core compilation
    Tool: interactive_bash
    Preconditions: None
    Steps:
      1. Run `python -m py_compile backend/app/database/prisma_db.py`
    Expected Result: Compiles successfully (exit 0).
    Failure Indicators: Syntax or import errors.
    Evidence: .omo/evidence/task-3-compiled.txt
  ```

  **Commit**: YES (Group 2)
  - Message: `refactor(db): implement core stakeholder and template repo in prisma_db`

- [ ] 4. Implement Simulation Execution Repositories

  **What to do**:
  - In `prisma_db.py`, implement simulation tracking methods.
  - Implement: `create_v2_simulation()`, `get_v2_simulation()`, `update_v2_simulation_status()`, `insert_v2_turn()`, `get_v2_turns()`.
  - Implement: `create_state_snapshot()`, `delete_old_state_snapshots()`.
  - Ensure correct JSON deserialization of configs and states.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Involves critical transaction states for LangGraph simulations.
  - **Skills**: [`software-architecture`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: [Task 6]
  - **Blocked By**: [Task 2]

  **References**:
  - `backend/app/database/postgres.py` L775+

  **Acceptance Criteria**:
  - [ ] Simulation repository methods implemented in `prisma_db.py`.

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Validate Simulation methods compilation
    Tool: interactive_bash
    Preconditions: None
    Steps:
      1. Run `python -c "import backend.app.database.prisma_db"`
    Expected Result: Imports without error (exit 0).
    Failure Indicators: Import errors.
    Evidence: .omo/evidence/task-4-imported.txt
  ```

  **Commit**: YES (Group 2)
  - Message: `refactor(db): implement simulation execution repos in prisma_db`

- [ ] 5. Implement Evolution & Research Document Repositories

  **What to do**:
  - Implement remaining secondary methods in `prisma_db.py`.
  - Implement: `create_persona_document()`, `list_persona_documents()`, `delete_persona_document()`.
  - Implement: `create_persona_evolution()`, `get_pending_evolutions()`, `get_evolution_history()`, `approve_evolution()`, `reject_evolution()`.
  - Implement: `create_persona_research()`, `get_persona_research()`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Implements less critical growth/documents features, but required to maintain full interface parity.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: [Task 6]
  - **Blocked By**: [Task 2]

  **References**:
  - `backend/app/database/postgres.py` L1143+

  **Acceptance Criteria**:
  - [ ] Evolution and document repositories completed in `prisma_db.py`.

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify complete interface implementation
    Tool: interactive_bash
    Preconditions: None
    Steps:
      1. Run `python -c "from backend.app.database.prisma_db import PrismaBackend; b = PrismaBackend()"`
    Expected Result: Instantiates without abstract method errors.
    Failure Indicators: TypeError due to unimplemented abstract methods.
    Evidence: .omo/evidence/task-5-instantiated.txt
  ```

  **Commit**: YES (Group 2)
  - Message: `refactor(db): complete evolution, research, and doc repos in prisma_db`

- [ ] 6. Wire `main.py` to use `PrismaBackend` & Deprecate legacy files

  **What to do**:
  - In `backend/app/database/__init__.py`, update `get_database()` to instantiate and return `PrismaBackend`.
  - Wire Prisma connection lifecycle (`connect()` and `disconnect()`) to the startup and shutdown events in `main.py`.
  - Delete `sqlite.py` and `postgres.py`.
  - Verify that the API starts successfully.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small file changes connecting the pieces together.
  - **Skills**: [`omc-setup`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: [F1]
  - **Blocked By**: [Task 3, 4, 5]

  **References**:
  - `backend/app/main.py` (L169-L187)
  - `backend/app/database/__init__.py`

  **Acceptance Criteria**:
  - [ ] `PrismaBackend` is the default returned implementation.
  - [ ] `sqlite.py` and `postgres.py` no longer exist.
  - [ ] Server boots without issue.

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Validate end-to-end API response
    Tool: Bash (curl)
    Preconditions: Backend is running on port 8000
    Steps:
      1. Run `curl -s http://localhost:8000/stakeholders | jq length`
    Expected Result: Returns the length of the stakeholders array (e.g. 44).
    Failure Indicators: 500 error or empty list.
    Evidence: .omo/evidence/task-6-api-works.txt
  ```

  **Commit**: YES (Group 3)
  - Message: `refactor(db): wire FastAPI router to Prisma and drop legacy drivers`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify all MUST HAVEs are implemented. Ensure no frontend files were touched. Verify PostgreSQL is the single defined provider in schema.prisma.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Review the `prisma_db.py` implementation to ensure no raw SQL queries exist where Prisma ORM methods should be used. Ensure connections are properly awaited and closed.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Run the server and perform `curl` on `/stakeholders` and `/templates`. Ensure the application bootstraps and logs show Prisma client instantiation. Verify simulation startup does not crash.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify nothing beyond the backend persistence layer was changed. Flag any unrequested feature additions or frontend component modifications.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `build(backend): Setup Prisma Client Python and schema.prisma`
- **2**: `refactor(db): Implement PrismaBackend core repositories`
- **3**: `refactor(db): Wire FastAPI router to Prisma and drop legacy drivers`

---

## Success Criteria

### Verification Commands
```bash
cd backend && prisma generate
cd backend && curl -s http://localhost:8000/stakeholders
cd backend && python -m pytest tests/
```

### Final Checklist
- [ ] Prisma introspected the existing db perfectly
- [ ] Raw SQL queries have been eradicated
- [ ] API responses are functionally identical to pre-migration outputs