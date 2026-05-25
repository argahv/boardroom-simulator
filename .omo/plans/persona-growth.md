# Persona Growth System

## TL;DR

> **Quick Summary**: Add knowledge accumulation, prep-time web research, and post-simulation personality evolution to boardroom personas. Personas accept documents as knowledge (Chroma RAG), research simulation subjects via Tavily, and evolve personality/stance based on outcomes — with user approval.
>
> **Deliverables**:
> - Stakeholder DB extended with v2 fields (backstory, stance, personality JSON, tools, hidden_agenda)
> - Persona CRUD API (v2) with document upload/management endpoints
> - Chroma vector DB integration for persona knowledge (OpenRouter embeddings)
> - Tavily web research pipeline (pre-simulation, user-triggered)
> - Evolution engine (outcome→personality shift mapping, manual approval flow)
> - Frontend persona editor with document upload UI
> - Frontend agent detail page: knowledge base, research history, evolution timeline
> - Cross-session memory persistence
>
> **Estimated Effort**: XL (5 phases, ~25 tasks)
> **Parallel Execution**: YES — 5 waves (max 6 concurrent)
> **Critical Path**: Phase 1 → Phase 2+3 (parallel) → Phase 4 → Phase 5 → Final Wave

---

## Context

### Original Request
User wants personas to "grow" over time: accept uploaded documents as knowledge, use them in simulations, research the internet to grow further, and evolve personality/stance based on outcomes.

### Interview Summary
**Decisions Made**:
- Knowledge store: Chroma (file-based, already in requirements.txt)
- Embeddings: OpenRouter text-embedding-3-small (configured but unused)
- Research: Tavily API, prep-time only (before simulation)
- Evolution: Outcome-based auto-shift, manual approval in frontend
- Persona DB: Extend existing stakeholders table with v2 fields
- Tests: Tests-after + agent-executed QA

**Research Findings**:
- Chroma in requirements.txt but zero vector code exists
- OpenRouter embedding model configured but never called
- Postgres docker-compose includes pgvector container (unused; we use Chroma instead)
- v2 StakeholderV2 model exists but has NO DB persistence — ephemeral per-simulation
- Existing doc upload attaches docs to simulations, not personas
- No external research capability (ToolProfile is decorative)
- Memory system is in-memory only during simulation runtime

### Metis Review
**Key Gaps Addressed**:
- Embedding provider: OpenRouter API (not local sentence-transformers)
- Chroma vs pgvector: Chroma (simpler, already a dep)
- Evolution trigger: Manual approval (not auto-apply)
- Persona v2 DB: Extend existing table (not new schema)
- Phased approach: 5 sequential phases recommended

---

## Work Objectives

### Core Objective
Enable boardroom personas to accumulate knowledge (via uploaded documents + web research) and evolve their personality/stance based on simulation outcomes — making them "grow" across sessions.

### Concrete Deliverables
- Migrated `stakeholders` DB table with v2 fields
- `persona_documents` DB table
- v2 persona CRUD API (POST/GET/PUT/DELETE with documents)
- Chroma-backed persona knowledge retrieval (embedding→storage→RAG)
- Tavily research pipeline (query→fetch→store→inject)
- Evolution engine (outcome analysis→delta computation→approval flow)
- Frontend persona editor with document upload + research trigger
- Frontend agent detail page with knowledge, research, evolution tabs
- Cross-session memory injection into agent system prompts

### Definition of Done
- [ ] Persona CRUD with doc upload works end-to-end (API tests + curl)
- [ ] Chroma retrieves relevant knowledge chunks for a persona
- [ ] Agent system prompt contains relevant persona knowledge during simulation
- [ ] Tavily research returns results stored as persona knowledge
- [ ] Post-simulation evolution computes personality deltas
- [ ] User can approve/reject evolution in frontend
- [ ] Persona's evolved state persists across sessions
- [ ] Agent detail page shows knowledge base, research history, evolution timeline

### Must Have
- Persona doc upload + knowledge retrieval via Chroma RAG
- Pre-simulation Tavily research for persona
- Post-simulation evolution with manual approval
- Cross-session persistence of all accumulated knowledge + evolved traits
- Frontend for persona creation with docs, evolution review, knowledge browsing

### Must NOT Have (Guardrails)
- Real-time research during simulation (research is prep-time only)
- Auto-apply evolution without user approval
- Document types beyond PDF/DOCX/TXT
- Chroma→pgvector migration path (future concern)
- Multi-tenant persona isolation
- Persona versioning history (snapshot on approval is sufficient)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (pytest, 33 test files)
- **Automated tests**: Tests-after (tests written after implementation, before verification wave)
- **Framework**: pytest (backend), Playwright (frontend QA)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Vector store**: Use Python REPL — Query Chroma, assert retrieval results
- **Frontend**: Use Playwright (playwright skill) — Navigate, fill forms, assert DOM, screenshot
- **DB queries**: Use Bash (python -c with direct DB calls) — Assert data persistence

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 6 tasks):
├── T1: DB migration — stakeholders v2 + persona_documents table
├── T2: Config — add TAVILY_API_KEY, Chroma settings, embedding model config
├── T3: Backend — v2 persona CRUD API (extend existing Stakeholder endpoints)
├── T4: Frontend — persona v2 creation/edit form component (backstory, stance, personality sliders, tools, hidden_agenda)
├── T5: Frontend — persona list page update (show v2 fields)
└── T6: Tests — DB migration + CRUD API tests

Wave 2 (Knowledge Pipeline — 5 tasks, depends on Wave 1):
├── T7: Embedding service — OpenRouter embedding calls via httpx (follows llm.py pattern)
├── T8: Chroma service — collection management, document insert, query for top-K chunks
├── T9: Backend — persona document upload + embed endpoint
├── T10: Frontend — document upload UI in persona editor (drag-drop, file list, status)
└── T11: Tests — embedding + Chroma + upload tests

Wave 3 (Research + RAG — 4 tasks, can run parallel to Wave 2):
├── T12: Tavily research service — query, fetch, store results as knowledge
├── T13: Pre-sim research trigger — hook into simulation creation flow
├── T14: RAG injection into agent system prompt — retrieve + inject relevant chunks
└── T15: Research history storage + frontend display

Wave 4 (Evolution Engine — 5 tasks, depends on Wave 1):
├── T16: Outcome→personality shift mapping (game-theoretic win/loss per stance)
├── T17: Evolution computation service (deliverable: proposed delta for approval)
├── T18: Evolution approval API (propose→approve/reject)
├── T19: Frontend evolution review UI (show deltas, approve/reject buttons)
└── T20: Tests — evolution mapping + API tests

Wave 5 (Agent Detail + Integration — 4 tasks, depends on all previous):
├── T21: Agent detail page — knowledge base section (docs, Chroma-retrieved preview)
├── T22: Agent detail page — research history section (past Tavily results)
├── T23: Agent detail page — evolution timeline (personality/stance changes over time)
└── T24: Cross-sim memory persistence + injection into agent prompts

Wave FINAL (Verification — 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality + tests review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1→T3→(T7→T8→T9→(T12→T13→T14))→T16→T17→T18→T21→T24→F1-F4
Parallel Speedup: ~60% faster than sequential (Waves 2 & 3 run in parallel)
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix
- **1-6**: - - 7-11, 12-15, 1
- **7-11**: 1-6 - 14, 15, 2
- **12-15**: 1-6 - 21, 22, 3
- **14**: 8, 13 - 16, 17, 3
- **16-20**: 1-6 - 21, 23, 4
- **21-24**: 7-20 - F1-F4, 5
- **F1-F4**: 1-24 - user okay, FINAL

## TODOs

- [ ] 1. **DB migration — stakeholders v2 + persona_documents table**

  **What to do**:
  - Extend existing `stakeholders` table: add `backstory TEXT`, `stance VARCHAR(20)`, `personality JSON`, `hidden_agenda TEXT`, `tools JSON` columns
  - Create `persona_documents` table: `id UUID PK`, `persona_id UUID FK→stakeholders.id`, `filename VARCHAR(255)`, `filepath TEXT`, `content_type VARCHAR(100)`, `size_bytes INTEGER`, `status VARCHAR(20)`, `extracted_text TEXT`, `embedding_id VARCHAR(255)`, `created_at TIMESTAMP`
  - Create `persona_evolution` table: `id UUID PK`, `persona_id UUID FK`, `simulation_id UUID`, `proposed_deltas JSON`, `approved BOOLEAN DEFAULT NULL`, `applied_at TIMESTAMP`, `created_at TIMESTAMP`
  - Write SQL migration script (compatible with both SQLite and Postgres backends)
  - Add `list_personas_v2()` and `get_persona_v2()` to DB backend interface
  - For SQLite: add vector extension handling (no-op stubs for now)

  **Must NOT do**:
  - Don't drop or modify existing v1 columns
  - Don't break existing v1 Stakeholder endpoints

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: none needed

  **Parallelization**:
  - **Wave**: 1 (with T2, T3, T4, T5, T6)
  - **Blocks**: T7, T8, T9, T10, T16, T17, T18
  - **Blocked By**: None (start immediately)

  **References**:
  - `backend/app/database/sqlite.py` — existing create_tables() and row mapping patterns
  - `backend/app/database/postgres.py` — existing persona/simulation_participants table patterns
  - `backend/app/database/base.py` — DatabaseBackend ABC methods
  - `backend/app/models.py:Stakeholder` (line 63) — existing v1 model to extend
  - `backend/app/models.py:StakeholderV2` (line 282) — v2 model fields to add to DB

  **Acceptance Criteria**:
  - [ ] New columns exist on stakeholders table (verified via `python -c` SQL query)
  - [ ] persona_documents table created with correct FK
  - [ ] persona_evolution table created
  - [ ] DB backend interface has `list_personas_v2()`, `get_persona_v2()`
  - [ ] Existing v1 stakeholder CRUD still works

  **QA Scenarios**:
  ```
  Scenario: DB migration applied correctly
    Tool: Bash (python -c with DB query)
    Preconditions: Backend .venv active
    Steps:
      1. Run migration script or import migration module
      2. Query PRAGMA table_info(stakeholders) to get column list
      3. Assert new columns exist
    Expected Result: Columns backstory, stance, personality, hidden_agenda, tools present
    Evidence: .omo/evidence/task-1-db-schema.txt

  Scenario: persona_documents table constraints
    Tool: Bash (python -c with DB query)
    Preconditions: Migration applied
    Steps:
      1. Query PRAGMA foreign_key_list(persona_documents)
      2. Assert FK references stakeholders.id
    Expected Result: FK constraint exists
    Evidence: .omo/evidence/task-1-db-fk.txt
  ```

  **Commit**: YES
  - Message: `feat(db): extend stakeholders table with v2 fields and add persona_documents/evolution tables`
  - Files: `backend/app/database/*`, `backend/app/models.py`

- [ ] 2. **Config + dependencies — TAVILY_API_KEY, Chroma, embedding settings**

  **What to do**:
  - Add `TAVILY_API_KEY` to `backend/app/config.py`
  - Add `TAVILY_API_KEY` to `.env.example`
  - Add `tavily-python` to `backend/requirements.txt`
  - Add `CHROMA_PERSIST_DIR` to config (default `./data/chroma`)
  - Add `EMBEDDING_MODEL` to config (default `openai/text-embedding-3-small`, reuse existing `OPENROUTER_EMBEDDING_MODEL`)
  - Wire Chroma persist directory into app startup (create dir if not exists)
  - Update `backend/requirements.txt` entries for `chromadb>=0.5.0` (verify it's present)

  **Must NOT do**:
  - Don't modify OpenRouter model config — reuse existing

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: none needed

  **Parallelization**:
  - **Wave**: 1 (with T1, T3, T4, T5, T6)
  - **Blocks**: T7, T8, T9, T12
  - **Blocked By**: None

  **References**:
  - `backend/app/config.py` (41 lines) — all env vars pattern
  - `.env.example` — env template
  - `backend/requirements.txt` — verify chromadb exists, add tavily
  - `backend/app/main.py:69-71` — UPLOAD_DIR creation on startup

  **Acceptance Criteria**:
  - [ ] TAVILY_API_KEY in config.py
  - [ ] tavily-python in requirements.txt
  - [ ] Chroma persist dir created on startup
  - [ ] Existing config keys unchanged

  **QA Scenarios**:
  ```
  Scenario: Config values load correctly
    Tool: Bash (python -c)
    Preconditions: .env has TAVILY_API_KEY set
    Steps:
      1. Run: python -c "from app.config import TAVILY_API_KEY, CHROMA_PERSIST_DIR; print(TAVILY_API_KEY[:4]); print(CHROMA_PERSIST_DIR)"
    Expected Result: First 4 chars of key printed, persist dir path printed
    Evidence: .omo/evidence/task-2-config.txt

  Scenario: Chroma persist dir created at startup
    Tool: Bash (ls)
    Preconditions: App lifeycle initialized
    Steps:
      1. Import app startup logic that creates CHROMA_PERSIST_DIR
      2. Assert path exists
    Expected Result: Directory exists
    Evidence: .omo/evidence/task-2-chroma-dir.txt
  ```

  **Commit**: YES (groups with T1)
  - Message: same as T1
  - Pre-commit: `pip install -r requirements.txt` (verify tavily installs)

- [ ] 3. **Backend — v2 persona CRUD API (extend existing endpoints)**

  **What to do**:
  - Extend `POST /stakeholders` to accept v2 fields: `backstory`, `stance`, `personality` (PersonalityProfile JSON), `hidden_agenda`, `tools`
  - Extend `PUT /stakeholders/{id}` with same v2 fields
  - Extend `GET /stakeholders` to return v2 fields
  - Extend `GET /stakeholders/{id}` or create `GET /personas/{id}` for detailed v2 view
  - Add `DELETE /personas/{id}/documents` for document removal
  - Update DB backend methods to read/write new v2 columns
  - Keep v1 backwards compatibility (old clients still work with just id/name/role/focus)

  **Must NOT do**:
  - Don't break existing v1 endpoints that other UI parts may use
  - Don't require v2 fields for creation (make optional with defaults)

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none needed

  **Parallelization**:
  - **Wave**: 1 (with T1, T2, T4, T5, T6)
  - **Blocks**: T7, T8, T9, T16, T17, T21, T22, T23
  - **Blocked By**: T1, T2 (needs DB schema + config)

  **References**:
  - `backend/app/main.py:225-259` — existing v1 stakeholder routes (follow exact pattern)
  - `backend/app/models.py:StakeholderV2` (line 282) — v2 model to use as request schema
  - `backend/app/models.py:PersonalityProfile` (line 217) — nested personality model
  - `backend/app/database/base.py:43-69` — existing stakeholder CRUD ABC methods
  - `backend/app/database/sqlite.py` — row mapping patterns for new columns
  - `backend/app/database/postgres.py` — personas table already has similar columns

  **Acceptance Criteria**:
  - [ ] `POST /stakeholders` with v2 fields → 201 + returns full v2 persona
  - [ ] `POST /stakeholders` without v2 fields → 201 (defaults applied)
  - [ ] `PUT /stakeholders/{id}` updates v2 fields → 200
  - [ ] `GET /stakeholders` returns v2 fields
  - [ ] Old v1-only POST (just id/name/role/focus) still works

  **QA Scenarios**:
  ```
  Scenario: Create persona with v2 fields
    Tool: Bash (curl)
    Preconditions: Backend running on :8000
    Steps:
      1. curl -X POST http://localhost:8000/stakeholders -H 'Content-Type: application/json' -d '{"id":"test-v2","name":"Test Legal","role":"Legal Counsel","backstory":"10 years corporate law","stance":"champion","personality":{"aggressiveness":30,"empathy":70,"stubbornness":60,"verbosity":40},"hidden_agenda":"favor acquirer","tools":["legal","financial"],"focus":"Risk mitigation","incentive_tuning":50}'
    Expected Result: Status 201, response JSON contains backstory="10 years corporate law", stance="champion", personality={...}
    Evidence: .omo/evidence/task-3-create-v2.txt

  Scenario: Create persona without v2 fields (backwards compat)
    Tool: Bash (curl)
    Preconditions: Backend running
    Steps:
      1. curl -X POST http://localhost:8000/stakeholders -H 'Content-Type: application/json' -d '{"id":"test-v1","name":"Old Style","role":"Old","focus":"test","incentive_tuning":50}'
    Expected Result: Status 201, new columns have default values
    Evidence: .omo/evidence/task-3-create-v1.txt
  ```

  **Commit**: YES (groups with T1, T2)
  - Message: same as T1

- [ ] 4. **Frontend — persona v2 creation/edit form component**

  **What to do**:
  - Create form component `PersonaEditorV2.tsx` with fields:
    - Name, Role, Focus (existing v1)
    - Backstory (textarea, long)
    - Stance (5 radio buttons: champion/detractor/neutral/moderator/wildcard)
    - Personality Profile (4 sliders: aggressiveness 0-100, empathy 0-100, stubbornness 0-100, verbosity 0-100, with labels)
    - Hidden Agenda (textarea with "optional" hint)
    - Tools (multi-select chips: legal, financial, technical, comms, none)
  - Wire form submission to updated `POST /stakeholders` API
  - Wire edit mode to `PUT /stakeholders/{id}`
  - Add validation: name required, stance defaults to neutral, personality defaults to 50s
  - Integrate `DocumentUpload` component (will be connected in Wave 2, but placeholder now)

  **Must NOT do**:
  - Don't remove existing v1-only creation flow (keep backwards compat)
  - Don't add document upload logic yet (T10 does that)

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: none needed (Tailwind + React)

  **Parallelization**:
  - **Wave**: 1 (with T1, T2, T3, T5, T6)
  - **Blocks**: T10, T19, T21, T22, T23
  - **Blocked By**: None (uses existing API patterns)

  **References**:
  - `frontend/app/personas/page.tsx` — existing persona list + edit modal (modal lines ~150-350)
  - `frontend/lib/api.ts` — existing CRUD API functions
  - `frontend/lib/types.ts` — Stakeholder, StakeholderV2 TS types
  - `frontend/components/Button.tsx` — existing UI component pattern
  - `frontend/app/simulate/new/page.tsx` — existing persona inline editing pattern (Step 2, ~line 75-400)
  - `frontend/components/DocumentUpload.tsx` — to be embedded later

  **Acceptance Criteria**:
  - [ ] Form renders all v2 fields: name, role, focus, backstory, stance, personality sliders, hidden_agenda, tools
  - [ ] Submission creates persona with all fields via API
  - [ ] Edit mode pre-fills existing values
  - [ ] Validation prevents empty name
  - [ ] Default values applied when fields omitted

  **QA Scenarios**:
  ```
  Scenario: Create persona with v2 fields via form
    Tool: Playwright
    Preconditions: Backend running, frontend on :3000
    Steps:
      1. Navigate to /personas
      2. Click "Create Persona"
      3. Fill: name="Test Counsel", role="Legal", backstory="10 years experience", stance="champion", personality sliders all to 60
      4. Fill: hidden_agenda="prefer acquisition", tools click "legal" and "financial"
      5. Click Submit
      6. Assert modal closes, new card appears with name "Test Counsel"
      7. Click "View profile →"
      8. Assert backstory text visible, stance badge shows "champion"
    Expected Result: Persona created and viewable with all v2 fields
    Evidence: .omo/evidence/task-4-create-form.png

  Scenario: Edit persona v2 fields
    Tool: Playwright
    Preconditions: Persona exists
    Steps:
      1. Navigate to /personas
      2. Click "Edit" on existing persona
      3. Change backstory, adjust stance to "detractor", move aggression slider to 80
      4. Submit
      5. Assert changes persist on reload
    Expected Result: Edited fields saved and displayed
    Evidence: .omo/evidence/task-4-edit-form.png
  ```

  **Commit**: YES (groups with T5)
  - Message: `feat(ui): persona v2 creation/edit form with all traits, stance, backstory`

- [ ] 5. **Frontend — persona list page update (show v2 fields)**

  **What to do**:
  - Update persona card to display: stance badge, backstory preview (truncated), personality bar mini-chart
  - Add archetype filter update to v2 categories (champion/detractor/neutral/moderator/wildcard)
  - Call updated `GET /stakeholders` that returns v2 fields
  - Show document count badge (0 initially, updates in Wave 2)
  - Show evolution state indicator (e.g., "Pending evolution" badge)

  **Must NOT do**:
  - Don't change card layout dramatically — add details, don't remove existing

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: none

  **Parallelization**:
  - **Wave**: 1 (with T1-4, T6)
  - **Blocks**: T10, T19, T21
  - **Blocked By**: T4 (form component pattern)

  **References**:
  - `frontend/app/personas/page.tsx` — entire file, current card layout (lines 24-130)
  - `frontend/app/personas/[slug]/page.tsx` — personality bars pattern (lines ~130-200)
  - `frontend/lib/types.ts` — update Stakeholder type with v2 fields

  **Acceptance Criteria**:
  - [ ] Each persona card shows stance badge
  - [ ] Cards show backstory preview (truncated to 2 lines)
  - [ ] Cards show compact personality bar visualization
  - [ ] No existing fields removed
  - [ ] Filter by stance works

  **QA Scenarios**:
  ```
  Scenario: V2 fields visible on persona cards
    Tool: Playwright
    Preconditions: At least one persona with v2 fields exists
    Steps:
      1. Navigate to /personas
      2. Assert each card shows: name, role, stance badge, backstory snippet
      3. Assert personality bars visible on hover or inline
    Expected Result: All v2 fields rendered on card
    Evidence: .omo/evidence/task-5-card-list.png

  Scenario: Stance filter works
    Tool: Playwright
    Preconditions: Personas with different stances exist
    Steps:
      1. Click filter button for "champion"
      2. Assert only champion-stance personas shown
    Expected Result: Filtering works correctly
    Evidence: .omo/evidence/task-5-filter.png
  ```

  **Commit**: YES (groups with T4)
  - Message: same as T4

- [ ] 6. **Tests — DB migration + CRUD API tests**

  **What to do**:
  - Write pytest tests for:
    - DB migration creates correct tables/columns (SQLite + Postgres if available)
    - v2 persona creation via API returns correct fields
    - v2 persona update preserves fields
    - Backwards compatibility: v1-only POST still works
    - persona_documents table FK constraints
  - Use FastAPI TestClient with in-memory SQLite
  - Follow existing test patterns in `backend/tests/`

  **Must NOT do**:
  - Don't test Chroma or evolution yet (Wave 2+ tasks)
  - Don't test frontend (Playwright QA covers that)

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none

  **Parallelization**:
  - **Wave**: 1 (with T1-5)
  - **Blocks**: None (tests are final verification for Wave 1)
  - **Blocked By**: T1, T3

  **References**:
  - `backend/tests/test_document_upload.py` — existing test patterns using TestClient
  - `backend/tests/test_archetypes.py` — simpler test example
  - `backend/conftest.py` or test fixtures — check for existing fixtures

  **Acceptance Criteria**:
  - [ ] All tests pass: `python -m pytest backend/tests/test_persona_v2.py -v`
  - [ ] Test coverage for: create v2, update v2, backwards compat, docs table schema

  **QA Scenarios**:
  ```
  Scenario: Run test suite
    Tool: Bash
    Preconditions: Backend .venv active
    Steps:
      1. PYTHONPATH=backend python -m pytest backend/tests/test_persona_v2.py -v
    Expected Result: All tests pass (≥ 8 tests)
    Evidence: .omo/evidence/task-6-test-results.txt
  ```

  **Commit**: YES (groups with T1)
  - Message: same as T1

---

## Wave 2 — Knowledge Pipeline

- [ ] 7. **Embedding service — OpenRouter embedding via httpx**

  **What to do**:
  - Create `backend/app/embeddings.py` — embedding service module
  - Implement `embed_text(text: str) -> list[float]` using OpenRouter API via httpx
  - Implement `embed_batch(texts: list[str]) -> list[list[float]]`
  - Use existing `OPENROUTER_API_KEY` + `OPENROUTER_EMBEDDING_MODEL` from config
  - Add retry logic (3 attempts, exponential backoff)
  - Add embedding dimension detection (1536 for text-embedding-3-small)
  - Mock mode: return zero-vector when no API key (follows llm.py mock pattern)
  - Add `embedding_dim` to config

  **Must NOT do**:
  - Don't import Chroma here — this is a pure embedding service
  - Don't use sentence-transformers (decision is OpenRouter embeddings)

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none

  **Parallelization**:
  - **Wave**: 2 (with T8, T9, T10, T11)
  - **Blocks**: T8
  - **Blocked By**: T1, T2

  **References**:
  - `backend/app/llm.py` — existing OpenRouter httpx pattern (auth headers, retries, timeout, mock)
  - `backend/app/config.py` — OPENROUTER_API_KEY, OPENROUTER_EMBEDDING_MODEL
  - `backend/app/models.py` — no new models needed

  **Acceptance Criteria**:
  - [ ] `embed_text("Hello world")` returns list of 1536 floats
  - [ ] `embed_batch(["a", "b"])` returns list of 2 embedding vectors
  - [ ] Mock mode returns zero-vector when no API key
  - [ ] Error handling: timeout → retry → mock fallback

  **QA Scenarios**:
  ```
  Scenario: Embed text successfully
    Tool: Bash (python -c)
    Preconditions: OPENROUTER_API_KEY set in .env
    Steps:
      1. Run: PYTHONPATH=backend python -c "from app.embeddings import embed_text; e = await embed_text('legal contract clause'); print(len(e), e[:3])"
    Expected Result: len(e) == 1536, prints first 3 floats
    Evidence: .omo/evidence/task-7-embed.txt

  Scenario: Mock mode fallback
    Tool: Bash (python -c)
    Preconditions: No API key
    Steps:
      1. Run with empty OPENROUTER_API_KEY
    Expected Result: Returns zero vector (all 0s)
    Evidence: .omo/evidence/task-7-mock.txt
  ```

  **Commit**: YES
  - Message: `feat(embeddings): OpenRouter embedding service with mock fallback`
  - Files: `backend/app/embeddings.py`

- [ ] 8. **Chroma service — collection management, document insert, query**

  **What to do**:
  - Create `backend/app/knowledge.py` — Chroma knowledge service
  - Initialize Chroma client with persist directory (from config)
  - Create `KnowledgeStore` class:
    - `add_document(persona_id, doc_id, text, metadata)` → chunk text → embed → store in Chroma
    - `query_knowledge(persona_id, query_text, top_k=3)` → embed query → Chroma similarity search → return chunks
    - `delete_document(persona_id, doc_id)` → remove from Chroma by metadata filter
    - `get_collection_stats(persona_id)` → return doc count, chunk count
  - Chunking strategy: split by paragraphs, max 512 tokens per chunk, overlap 64 tokens
  - Collection naming: `persona_{persona_id}` per-persona collection
  - Metadata per chunk: `{persona_id, doc_id, filename, chunk_index, source_type: "upload"|"research"}`
  - Error handling: Chroma unavailable → return empty results (graceful degradation)

  **Must NOT do**:
  - Don't use pgvector — Chroma is the decision
  - Don't load all docs into memory — stream chunks

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none

  **Parallelization**:
  - **Wave**: 2 (with T7, T9, T10, T11)
  - **Blocks**: T9, T14, T15, T17
  - **Blocked By**: T7 (embedding service)

  **References**:
  - `chromadb` docs if needed — official Python client
  - `backend/app/config.py` — CHROMA_PERSIST_DIR
  - `backend/app/embeddings.py` — embedding function to pass to Chroma
  - Chroma native supports OpenAI-compatible embedding functions — can wrap our embedding service

  **Acceptance Criteria**:
  - [ ] `add_document` creates collection + stores chunks with correct metadata
  - [ ] `query_knowledge` returns top-3 relevant chunks for a persona
  - [ ] Chunking produces correct overlap boundaries
  - [ ] No-op when Chroma unavailable (graceful degradation)
  - [ ] Chroma persistence works across app restarts

  **QA Scenarios**:
  ```
  Scenario: Add document and query knowledge
    Tool: Bash (python -c)
    Preconditions: Chroma persist dir exists
    Steps:
      1. Run: PYTHONPATH=backend python -c "from app.knowledge import KnowledgeStore; ks = KnowledgeStore(); ks.add_document('p1', 'd1', 'This is a legal contract about indemnification clauses and liability caps.', {'filename':'contract.txt'}); results = ks.query_knowledge('p1', 'indemnification liability', top_k=2); print(results)"
    Expected Result: 2 results returned, first contains "indemnification" or "liability"
    Evidence: .omo/evidence/task-8-query.txt

  Scenario: Graceful degradation when Chroma unavailable
    Tool: Bash (python -c)
    Preconditions: Chroma not accessible
    Steps:
      1. Run knowledge query with mocked unavailable Chroma
    Expected Result: Returns empty list, no crash
    Evidence: .omo/evidence/task-8-degradation.txt
  ```

  **Commit**: YES
  - Message: `feat(knowledge): Chroma-backed knowledge store with chunking and similarity search`
  - Files: `backend/app/knowledge.py`

- [ ] 9. **Backend — persona document upload + embed endpoint**

  **What to do**:
  - Create `POST /personas/{persona_id}/documents` endpoint:
    - Accept multipart file upload (reuse existing upload validation from simulation docs)
    - Validate file type (PDF/DOCX/TXT) and size (25MB max)
    - Save file to `{UPLOAD_DIR}/personas/{persona_id}/{doc_id}_{filename}`
    - Extract text (reuse `extract_text()` from upload module)
    - Insert into Chroma via KnowledgeStore
    - Store metadata in `persona_documents` DB table
    - Return document metadata
  - Create `GET /personas/{persona_id}/documents` — list all persona documents
  - Create `DELETE /personas/{persona_id}/documents/{doc_id}` — delete document + remove from Chroma
  - Create `POST /personas/{persona_id}/query-knowledge` — query persona's knowledge base
    - Accept `{"query": "text"}` → return top-3 chunks

  **Must NOT do**:
  - Don't reimplement upload validation — reuse upload/utils.py
  - Don't process during simulation — this is pre-simulation setup

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none

  **Parallelization**:
  - **Wave**: 2 (with T7, T8, T10, T11)
  - **Blocks**: T14, T15, T21
  - **Blocked By**: T8 (KnowledgeStore), T2 (config), T3 (persona CRUD)

  **References**:
  - `backend/app/main.py:446-590` — existing POST /simulations/with-documents (upload, extract, store pattern)
  - `backend/app/upload/extraction.py` — extract_text()
  - `backend/app/upload/utils.py` — validate_file_type(), validate_file_size()
  - `backend/app/knowledge.py` — KnowledgeStore (created in T8)
  - `backend/app/database/base.py:121-141` — existing document DB methods as pattern
  - `backend/app/config.py` — UPLOAD_DIR, ALLOWED_CONTENT_TYPES

  **Acceptance Criteria**:
  - [ ] Upload PDF → status 201, returns doc metadata, Chroma has chunks
  - [ ] Upload TXT → same as PDF
  - [ ] Upload invalid type → status 422
  - [ ] Upload exceeds size → status 413
  - [ ] GET documents → returns list of uploaded docs
  - [ ] DELETE document → removes from DB + Chroma
  - [ ] POST query-knowledge with query text → returns top-3 relevant chunks

  **QA Scenarios**:
  ```
  Scenario: Upload document and query knowledge
    Tool: Bash (curl)
    Preconditions: Persona exists, backend running
    Steps:
      1. Create a test text file: echo "This legal document covers indemnification clauses and liability caps in M&A transactions." > /tmp/test-legal.txt
      2. curl -X POST http://localhost:8000/personas/{persona_id}/documents -F "file=@/tmp/test-legal.txt"
      3. Assert status 201, response has id, filename, status="ready"
      4. curl -X POST http://localhost:8000/personas/{persona_id}/query-knowledge -H 'Content-Type: application/json' -d '{"query":"indemnification liability"}'
      5. Assert response has results array with at least 1 chunk
    Expected Result: Upload succeeds, query returns relevant chunk
    Evidence: .omo/evidence/task-9-upload-query.txt

  Scenario: Upload invalid file type rejected
    Tool: Bash (curl)
    Steps:
      1. curl -X POST http://localhost:8000/personas/{persona_id}/documents -F "file=@/tmp/image.png"
    Expected Result: Status 422
    Evidence: .omo/evidence/task-9-reject.txt
  ```

  **Commit**: YES
  - Message: `feat(api): persona document upload with Chroma embedding pipeline`
  - Files: `backend/app/main.py`, `backend/app/knowledge.py`

- [ ] 10. **Frontend — document upload UI in persona editor**

  **What to do**:
  - Integrate `DocumentUpload` component into the persona creation/edit form (from T4)
  - Show document list with: filename, size, status (pending/ready/failed), upload date
  - Add "Upload Document" button that opens file picker (PDF/DOCX/TXT, max 25MB)
  - Show document count badge on persona list card (integrated with T5)
  - Add "Delete Document" button per document with confirmation
  - Wire to `POST /personas/{id}/documents`, `GET /personas/{id}/documents`, `DELETE /personas/{id}/documents/{doc_id}`
  - Add loading state during upload
  - Add error toast on upload failure

  **Must NOT do**:
  - Don't implement Chroma query UI (that's T21 in agent detail page)
  - Don't change existing DocumentUpload component — wrap/extend it

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: none

  **Parallelization**:
  - **Wave**: 2 (with T7, T8, T9, T11)
  - **Blocks**: T21 (detail page knowledge section)
  - **Blocked By**: T4 (persona editor form), T9 (upload API)

  **References**:
  - `frontend/components/DocumentUpload.tsx` — existing drag-drop upload component
  - `frontend/lib/api.ts` — add `uploadPersonaDocument()`, `listPersonaDocuments()`, `deletePersonaDocument()`
  - `frontend/app/personas/page.tsx` — existing edit modal integration point
  - `frontend/app/simulate/new/page.tsx` — existing document upload flow in wizard (lines ~58-59, ~1000+)

  **Acceptance Criteria**:
  - [ ] Upload button visible in persona edit form
  - [ ] File picker restricts to PDF/DOCX/TXT
  - [ ] Uploaded file shows with filename + status indicator
  - [ ] Delete button removes document from list
  - [ ] Document count shown on persona list card
  - [ ] Error state shown on failed upload

  **QA Scenarios**:
  ```
  Scenario: Upload document from persona editor
    Tool: Playwright
    Preconditions: Persona exists, backend running
    Steps:
      1. Navigate to /personas
      2. Click "Edit" on a persona
      3. Upload a .txt file via the document upload section
      4. Assert file appears in document list with "ready" status
      5. Close modal
      6. Assert document count badge updated on card
    Expected Result: Document uploaded and visible
    Evidence: .omo/evidence/task-10-upload-ui.png

  Scenario: Delete document
    Tool: Playwright
    Preconditions: Persona has at least one document
    Steps:
      1. Open edit modal for persona with docs
      2. Click delete on a document
      3. Confirm deletion
      4. Assert document removed from list
    Expected Result: Document deleted
    Evidence: .omo/evidence/task-10-delete.png
  ```

  **Commit**: YES (groups with T5)
  - Message: `feat(ui): persona document upload management UI`

- [ ] 11. **Tests — embedding + Chroma + upload tests**

  **What to do**:
  - Write pytest tests for:
    - `embed_text()` returns correct dimension
    - `embed_batch()` handles multiple texts
    - Mock mode fallback when no API key
    - `KnowledgeStore.add_document()` correlation with `query_knowledge()`
    - `KnowledgeStore.delete_document()` removes chunks
    - Persona document upload API: success + validation rejects
    - QA knowledge API returns chunks
  - Use in-memory Chroma client for tests (ephemeral, no disk writes)
  - Follow `test_document_upload.py` patterns

  **Must NOT do**:
  - Don't test Tavily (Wave 3) or evolution (Wave 4)
  - Don't require API key for tests (mock mode)

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none

  **Parallelization**:
  - **Wave**: 2 (with T7-10)
  - **Blocks**: None (tests are final verification for Wave 2)
  - **Blocked By**: T7, T8, T9

  **Acceptance Criteria**:
  - [ ] All tests pass: `python -m pytest backend/tests/test_knowledge.py -v`

  **QA Scenarios**:
  ```
  Scenario: Run knowledge tests
    Tool: Bash
    Preconditions: Backend .venv active
    Steps:
      1. PYTHONPATH=backend python -m pytest backend/tests/test_knowledge.py -v
    Expected Result: All tests pass (≥ 8 tests)
    Evidence: .omo/evidence/task-11-test-results.txt
  ```

  **Commit**: YES (groups with T9)
  - Message: same as T9

---

## Wave 3 — Research + RAG

- [ ] 12. **Tavily research service**

  **What to do**:
  - Create `backend/app/research.py` — research service module
  - Implement `TavilyResearchService` class:
    - `research_topic(persona_id, topic, max_results=5)` → query Tavily → return structured results (title, url, content snippets)
    - `research_subject(persona_id, subject)` → extract keywords from subject name+description → research
    - Process each result: extract text, chunk, embed, store in Chroma via KnowledgeStore (with source_type="research")
  - Tavily query: use Tavily Python client `tavily.TavilyClient(api_key).search(query=..., search_depth="basic", max_results=5)`
  - Handle: missing API key (skip silently), timeout (10s → skip), rate limit (exponential backoff)
  - Store research metadata in memory (not in DB) — linked to persona

  **Must NOT do**:
  - Don't re-embed all documents — only new research results
  - Don't block persona creation on research

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none

  **Parallelization**:
  - **Wave**: 3 (with T13, T14, T15)
  - **Blocks**: T13, T15
  - **Blocked By**: T2 (Tavily config), T8 (KnowledgeStore for storage)

  **References**:
  - Tavily Python SDK docs — `tavily.TavilyClient`
  - `backend/app/knowledge.py` — KnowledgeStore to store results
  - `backend/app/config.py` — TAVILY_API_KEY
  - `backend/app/embeddings.py` — for embedding research results

  **Acceptance Criteria**:
  - [ ] `research_topic` returns list of results with title, url, content
  - [ ] Research results stored in Chroma with source_type="research"
  - [ ] Missing TAVILY_API_KEY → graceful skip (no crash, logs warning)
  - [ ] Tavily timeout → graceful skip

  **QA Scenarios**:
  ```
  Scenario: Research a topic
    Tool: Bash (python -c)
    Preconditions: TAVILY_API_KEY set
    Steps:
      1. Run: PYTHONPATH=backend python -c "from app.research import TavilyResearchService; rs = TavilyResearchService(); results = await rs.research_topic('test-persona', 'indemnification clause M&A', max_results=3); print(len(results), results[0]['title'] if results else 'empty')"
    Expected Result: At least 1 result with title
    Evidence: .omo/evidence/task-12-research.txt

  Scenario: No API key — graceful skip
    Tool: Bash
    Preconditions: TAVILY_API_KEY empty
    Steps:
      1. Run same command
    Expected Result: Empty list, warning logged, no crash
    Evidence: .omo/evidence/task-12-skip.txt
  ```

  **Commit**: YES
  - Message: `feat(research): Tavily web research service with knowledge store integration`
  - Files: `backend/app/research.py`

- [ ] 13. **Pre-simulation research trigger — hook into simulation creation**

  **What to do**:
  - Extend `POST /simulations` and `POST /simulations/with-documents` to trigger pre-sim research
  - After simulation config received, before streaming starts:
    - For each stakeholder with research enabled: call TavilyResearchService.research_subject()
    - Store research results as persona knowledge (Chroma, source_type="research")
    - Collect research summary text for system prompt injection
  - Add `research_topics` field to simulation config (optional override, defaults to subject name + description)
  - Add `auto_research` flag to SimulationV2Config (default true)
  - Ensure research doesn't block response — fire-and-forget with status tracking
  - Research status accessible via `GET /simulations/{id}` response

  **Must NOT do**:
  - Don't block streaming start on research completion
  - Don't research if TAⅤILY_API_KEY not set (silent skip)

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none

  **Parallelization**:
  - **Wave**: 3 (with T12, T14, T15)
  - **Blocks**: T14 (RAG injection relies on research results)
  - **Blocked By**: T12 (Tavily service), T3 (stakeholder CRUD)

  **References**:
  - `backend/app/main.py:421-443` — POST /simulations endpoint (research hook goes here)
  - `backend/app/main.py:446-590` — POST /simulations/with-documents (research hook goes here too)
  - `backend/app/models.py:SimulationV2Config` (line 294) — add auto_research flag
  - `backend/app/research.py` — TavilyResearchService (T12)

  **Acceptance Criteria**:
  - [ ] Simulation creation triggers research for each stakeholder
  - [ ] Research results stored in Chroma for each stakeholder
  - [ ] `auto_research=false` skips research
  - [ ] Missing TAⅤILY_API_KEY → simulation created normally (no error)
  - [ ] Research does not block streaming start

  **QA Scenarios**:
  ```
  Scenario: Simulation triggers pre-sim research
    Tool: Bash (curl + python)
    Preconditions: Persona exists, TAVILY_API_KEY set
    Steps:
      1. Create a simulation with persona that has auto_research=true
      2. Wait 2 seconds for research to complete
      3. Query persona knowledge via POST /personas/{persona_id}/query-knowledge with subject-related query
    Expected Result: Research results present in knowledge
    Evidence: .omo/evidence/task-13-research-trigger.txt
  ```

  **Commit**: YES
  - Message: `feat(sim): pre-simulation Tavily research trigger for stakeholders`
  - Files: `backend/app/main.py`, `backend/app/models.py`

- [ ] 14. **RAG injection into agent system prompt**

  **What to do**:
  - In `AgentRuntime._build_system_prompt()` (agent.py): add knowledge injection
  - Before each turn, query Chroma for top-3 relevant chunks for this agent
  - Append to system prompt as a "## Your Knowledge Base" section
  - Query text = recent conversation context (last 2 agent statements) + subject description
  - Cap knowledge text at 2000 tokens (truncate if exceeded)
  - Add research results as "## Recent Research" section (from pre-sim research)
  - Handle: empty knowledge → skip section, Chroma unavailable → skip gracefully
  - Add toggle: `inject_knowledge` flag per persona (default true)

  **Must NOT do**:
  - Don't inject all documents — only top-3 relevant chunks
  - Don't block turn generation on Chroma query (timeout: 2s)

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: none

  **Parallelization**:
  - **Wave**: 3 (with T12, T13, T15)
  - **Blocks**: T16, T17 (evolution uses knowledge context)
  - **Blocked By**: T8 (KnowledgeStore), T13 (research results)

  **References**:
  - `backend/app/runtime/agent.py:_build_system_prompt()` (lines 233-293) — injection point
  - `backend/app/runtime/agent.py:_build_turn_prompt()` (lines 295-364) — uses system prompt
  - `backend/app/knowledge.py` — KnowledgeStore.query_knowledge()
  - `backend/app/config.py` — token limit config
  - `backend/app/main.py:603-609` — existing doc context injection pattern (as model)

  **Acceptance Criteria**:
  - [ ] Agent system prompt contains "## Your Knowledge Base" section with relevant doc chunks
  - [ ] Knowledge chunks relevant to current conversation (verified via query)
  - [ ] Max 2000 tokens for knowledge section
  - [ ] No knowledge → section omitted (no empty section)
  - [ ] Chroma unavailable → graceful skip (no crash, logs warning)
  - [ ] toggled off via persona flag → no injection

  **QA Scenarios**:
  ```
  Scenario: Knowledge injected into system prompt
    Tool: Bash (python introspection)
    Preconditions: Persona has documents in Chroma, simulation running
    Steps:
      1. Start simulation with knowledge-enabled persona
      2. Intercept AgentRuntime._build_system_prompt() output (via mock or debug hook)
      3. Assert "## Your Knowledge Base" section present
      4. Assert content matches uploaded document text
    Expected Result: Knowledge section present with doc content
    Evidence: .omo/evidence/task-14-prompt-injection.txt

  Scenario: No knowledge → no section
    Tool: Bash
    Preconditions: Persona has zero documents, research off
    Steps:
      1. Start simulation
      2. Intercept _build_system_prompt() output
      3. Assert "## Your Knowledge Base" NOT present
    Expected Result: Section omitted
    Evidence: .omo/evidence/task-14-no-knowledge.txt
  ```

  **Commit**: YES
  - Message: `feat(rag): inject Chroma-retrieved knowledge chunks into agent system prompts`
  - Files: `backend/app/runtime/agent.py`

- [ ] 15. **Research history storage + frontend display**

  **What to do**:
  - Create API endpoint `GET /personas/{persona_id}/research-history` → return past research results with timestamps
  - Create API endpoint `POST /personas/{persona_id}/research` → manually trigger research for a persona
    - Accept `{"topic": "optional topic override"}` — defaults to persona's usual subjects
  - Store research history in `persona_research` table: `id UUID PK`, `persona_id UUID FK`, `query TEXT`, `results JSON`, `created_at TIMESTAMP`
  - Frontend: add "Research" tab or section in persona detail page
    - Show past research queries + dates
    - "Run Research" button that triggers POST /personas/{id}/research
    - Show research results as expandable cards (title, url snippet, content preview)
  - Wire results display to link with knowledge base (same Chroma source)

  **Must NOT do**:
  - Don't re-trigger research on page load (show cached results)
  - Don't run research for persona if TAVILY_API_KEY not set

  **Recommended Agent Profile**:
  - Category: `unspecified-high` (backend) + `visual-engineering` (frontend)

  **Parallelization**:
  - **Wave**: 3 (with T12, T13, T14)
  - **Blocks**: T22 (detail page research section)
  - **Blocked By**: T12 (Tavily service), T3 (persona CRUD), T8 (KnowledgeStore)

  **References**:
  - `backend/app/database/base.py` — add research_history ABC methods
  - `frontend/app/personas/[slug]/page.tsx` — agent detail page integration
  - `frontend/lib/api.ts` — add research API functions

  **Acceptance Criteria**:
  - [ ] GET /personas/{id}/research-history returns past research entries
  - [ ] POST /personas/{id}/research triggers new research
  - [ ] Research results appear in Chroma as persona knowledge
  - [ ] Frontend shows research history with expandable results
  - [ ] "Run Research" button works with loading state

  **QA Scenarios**:
  ```
  Scenario: Research history API
    Tool: Bash (curl)
    Preconditions: Persona exists
    Steps:
      1. curl -X POST http://localhost:8000/personas/{id}/research -H 'Content-Type: application/json' -d '{"topic":"indemnification in M&A"}'
      2. Assert status 200, response has research_id
      3. Wait 5 seconds
      4. curl http://localhost:8000/personas/{id}/research-history
      5. Assert response contains research entry with results
    Expected Result: Research triggered and history populated
    Evidence: .omo/evidence/task-15-research-history.txt

  Scenario: Frontend research button
    Tool: Playwright
    Preconditions: Persona exists
    Steps:
      1. Navigate to /personas/{slug}
      2. Click "Run Research" in research section
      3. Assert loading indicator
      4. Assert research results appear after completion
    Expected Result: Research runs from UI
    Evidence: .omo/evidence/task-15-research-ui.png
  ```

  **Commit**: YES
  - Message: `feat(research): research history API + frontend display and manual trigger`
  - Files: `backend/app/main.py`, `backend/app/database/*`, `frontend/app/personas/[slug]/page.tsx`, `frontend/lib/api.ts`

---

## Wave 4 — Evolution Engine

- [ ] 16. **Outcome→personality shift mapping logic**

  **What to do**:
  - Create `backend/app/evolution.py` — evolution engine module
  - Define outcome mapping rules:
    - Vote outcome: if persona's stance agents win vote (majority) → confidence+ → aggressiveness+5, empathy-3
    - Vote outcome: if persona's stance loses → stubbornness-5, empathy+5 (adaptation)
    - Consensus outcome: if agreement reached → empathy+3, aggressiveness-3
    - Deadlock/Timeout: if no resolution → stubbornness+5, aggressiveness+5, empathy-5
    - Walkaway: if persona walks away → aggressiveness+10, empathy+5
  - Implement `compute_evolution_deltas(persona_id, simulation_result) -> dict[str, int]`
    - Takes persona's stance, TerminationResult, social dynamics summary
    - Returns proposed delta for each personality trait: `{aggressiveness: +5, empathy: -3, stubbornness: 0, verbosity: 0}`
    - Also compute stance shift proposal (rare: only on extreme outcomes)
  - Bounds: ensure deltas don't push traits below 0 or above 100
  - No delta > ±10 per trait per simulation (stability)

  **Must NOT do**:
  - Don't apply evolution automatically (manual approval in T18)
  - Don't mutate persona record (evolution is computed, stored as proposal)

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: none

  **Parallelization**:
  - **Wave**: 4 (with T17, T18, T19, T20)
  - **Blocks**: T17, T18
  - **Blocked By**: T3 (persona CRUD for profile reading), T6 (DB for evolution table)

  **References**:
  - `backend/app/models.py:TerminationResult` (line 419) — outcome data
  - `backend/app/models.py:StakeholderV2.personality` (line 289) — current trait values
  - `backend/app/models.py:SocialDynamicsSummary` (line 391) — trust/tension/leverage arcs
  - `backend/app/database/base.py` — persona_evolution table pattern

  **Acceptance Criteria**:
  - [ ] `compute_evolution_deltas` returns valid delta dict for all outcome types
  - [ ] No delta exceeds ±10 per trait
  - [ ] Final values clamped to 0-100 range
  - [ ] Stance shift only proposed on extreme outcomes (≤10% of cases)

  **QA Scenarios**:
  ```
  Scenario: Vote win → aggression+5, empathy-3
    Tool: Bash (python -c)
    Preconditions: Backend .venv active
    Steps:
      1. Run: PYTHONPATH=backend python -c "from app.evolution import compute_evolution_deltas; deltas = compute_evolution_deltas('p1', {'outcome_type':'vote','stance':'champion','vote_result':'win','current_personality':{'aggressiveness':50,'empathy':50,'stubbornness':50,'verbosity':50}}); print(deltas)"
    Expected Result: {'aggressiveness': 55, 'empathy': 47, 'stubbornness': 50, 'verbosity': 50}
    Evidence: .omo/evidence/task-16-vote-win.txt

  Scenario: Deadlock → stubbornness+5
    Tool: Bash (python -c)
    Steps:
      1. Run with deadlock outcome
    Expected Result: stubbornness increased
    Evidence: .omo/evidence/task-16-deadlock.txt
  ```

  **Commit**: YES
  - Message: `feat(evolution): outcome→personality shift mapping with bounded deltas`
  - Files: `backend/app/evolution.py`

- [ ] 17. **Evolution computation service**

  **What to do**:
  - Extend `backend/app/evolution.py` with `EvolutionService` class:
    - `compute_and_store(persona_id, simulation_id, simulation_result)` → compute deltas → store as pending proposal in persona_evolution table
    - `get_pending_evolutions(persona_id)` → list unapproved evolution proposals
    - `get_evolution_history(persona_id)` → list approved evolutions with timestamps
  - Hook into simulation completion flow (SSE "done" event handler in main.py):
    - After stream ends, extract TerminationResult + SocialDynamicsSummary
    - For each stakeholder, call `compute_and_store()`
    - Store personality snapshot in evolution record (before and after)
  - Evolution proposals have: persona_id, simulation_id, deltas JSON, before_snapshot JSON, status (pending/approved/rejected), created_at

  **Must NOT do**:
  - Don't apply evolution (approval happens in T18)
  - Don't block SSE stream completion on evolution computation

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none

  **Parallelization**:
  - **Wave**: 4 (with T16, T18, T19, T20)
  - **Blocks**: T18, T19
  - **Blocked By**: T16 (mapping logic), T6 (DB migration), T14 (RAG injection for knowledge context)

  **References**:
  - `backend/app/main.py:632-645` — SSE stream completion handler (where evolution hook goes)
  - `backend/app/models.py:TerminationResult` (line 419) — outcome to pass
  - `backend/app/evolution.py` — compute_evolution_deltas (T16)
  - `backend/app/database/base.py` — persona_evolution table methods

  **Acceptance Criteria**:
  - [ ] Simulation completion triggers evolution computation
  - [ ] Pending evolution record stored in persona_evolution table
  - [ ] Getting pending evolutions returns unapproved proposals
  - [ ] No crash if evolution computation fails (graceful skip)

  **QA Scenarios**:
  ```
  Scenario: Evolution computed on sim completion
    Tool: Bash (curl + python)
    Preconditions: Simulation with stakeholders exists
    Steps:
      1. Run simulation to completion via POST /simulations/{id}/run
      2. Wait for "done" event
      3. Call GET /personas/{persona_id}/evolution/pending or check DB
    Expected Result: Pending evolution record exists with computed deltas
    Evidence: .omo/evidence/task-17-evolution-computed.txt
  ```

  **Commit**: YES (groups with T16)
  - Message: same as T16

- [ ] 18. **Evolution approval API**

  **What to do**:
  - Create API endpoints:
    - `GET /personas/{persona_id}/evolutions/pending` — list pending evolution proposals
    - `POST /evolutions/{evolution_id}/approve` — approve → apply deltas to persona record
    - `POST /evolutions/{evolution_id}/reject` — reject → mark as rejected (keep for history)
    - `GET /personas/{persona_id}/evolutions` — list all evolution history (approved + rejected)
  - On approve: read proposed deltas → apply to persona's personality in DB → mark evolution as approved → record timestamp
  - On reject: mark as rejected → no state change
  - Add frontend API functions to `frontend/lib/api.ts`

  **Must NOT do**:
  - Don't allow evolution to be applied twice
  - Don't mutate simulation snapshots (persona evolves but sim replays show original personality)

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none

  **Parallelization**:
  - **Wave**: 4 (with T16, T17, T19, T20)
  - **Blocks**: T19 (frontend review UI)
  - **Blocked By**: T17 (evolution computation), T3 (persona CRUD)

  **References**:
  - `backend/app/main.py` — existing CRUD endpoint patterns
  - `backend/app/database/base.py` — evolution table methods
  - `backend/app/models.py:StakeholderV2.personality` — fields to update

  **Acceptance Criteria**:
  - [ ] GET pending evolutions returns unapproved proposals
  - [ ] POST approve applies deltas to persona personality in DB
  - [ ] POST reject marks as rejected, no state change
  - [ ] Approved evolution can't be approved again
  - [ ] Evolution history returns all attempts

  **QA Scenarios**:
  ```
  Scenario: Approve evolution → personality changes
    Tool: Bash (curl)
    Preconditions: Pending evolution exists for persona
    Steps:
      1. GET current personality via GET /stakeholders/{id}
      2. POST /evolutions/{evol_id}/approve
      3. GET personality again via GET /stakeholders/{id}
      4. Assert personality values changed by expected delta
    Expected Result: Personality traits updated by delta amounts
    Evidence: .omo/evidence/task-18-approve.txt

  Scenario: Reject evolution → no change
    Tool: Bash (curl)
    Preconditions: Pending evolution exists
    Steps:
      1. Record current personality
      2. POST /evolutions/{evol_id}/reject
      3. GET personality
    Expected Result: Personality unchanged
    Evidence: .omo/evidence/task-18-reject.txt
  ```

  **Commit**: YES
  - Message: `feat(api): evolution approval/rejection API with personality mutation`
  - Files: `backend/app/main.py`, `backend/app/database/*`

- [ ] 19. **Frontend evolution review UI**

  **What to do**:
  - Create "Pending Evolutions" section in persona detail page (`/personas/[slug]`)
  - Show list of pending evolutions with:
    - Simulation name + date the evolution comes from
    - Proposed personality changes (before/after bars for each trait)
    - Stance change warning if applicable
    - "Approve" and "Reject" buttons
  - On approve: show success state, personality bars re-render with new values
  - On reject: show dismissed state, move to history
  - Evolution history section below: show all past evolutions with applied deltas
  - Add notification badge to persona list page when evolutions pending
  - Use color coding: green for positive changes, red for negative

  **Must NOT do**:
  - Don't auto-approve — user must click
  - Don't show evolution UI if no pending evolutions

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: none

  **Parallelization**:
  - **Wave**: 4 (with T16, T17, T18, T20)
  - **Blocks**: None
  - **Blocked By**: T18 (approval API), T5 (persona list page updates)

  **References**:
  - `frontend/app/personas/[slug]/page.tsx` — detail page integration point
  - `frontend/app/personas/page.tsx` — pending badge integration
  - `frontend/lib/api.ts` — evolution API functions

  **Acceptance Criteria**:
  - [ ] Pending evolution shows before/after comparison for each trait
  - [ ] Approve button applies changes and updates display
  - [ ] Reject button dismisses proposal
  - [ ] History section shows past evolutions
  - [ ] Pending badge appears on persona list card

  **QA Scenarios**:
  ```
  Scenario: Approve evolution from UI
    Tool: Playwright
    Preconditions: Personal has pending evolution
    Steps:
      1. Navigate to /personas/{slug}
      2. Assert "Pending Evolution" banner visible
      3. Assert before/after personality bar comparison
      4. Click "Approve"
      5. Assert personality bars update to after values
      6. Assert evolution moves to history section
    Expected Result: Evolution approved, UI reflects changes
    Evidence: .omo/evidence/task-19-approve-ui.png

  Scenario: Reject evolution from UI
    Tool: Playwright
    Preconditions: Pending evolution exists
    Steps:
      1. Click "Reject"
      2. Assert evolution dismissed from pending
      3. Assert personality bars unchanged
      4. Assert appears in history (rejected) tab
    Expected Result: Evolution rejected, no personality change
    Evidence: .omo/evidence/task-19-reject-ui.png
  ```

  **Commit**: YES
  - Message: `feat(ui): evolution review UI with before/after comparison and approve/reject`
  - Files: `frontend/app/personas/[slug]/page.tsx`, `frontend/app/personas/page.tsx`, `frontend/lib/api.ts`

- [ ] 20. **Tests — evolution mapping + API tests**

  **What to do**:
  - Write pytest tests for:
    - All outcome types produce correct deltas (vote_win, vote_loss, consensus, deadlock, walkaway)
    - Delta bounds enforcement (±10 max)
    - Trait clamping (0-100 range)
    - Evolution approve API mutates personality correctly
    - Evolution reject API does not mutate
    - Pending/rejected/approved status transitions
  - Use in-memory SQLite DB for tests
  - Use FastAPI TestClient for API tests
  - Follow existing test patterns

  **Must NOT do**:
  - Don't test frontend evolution UI (Playwright QA covers)
  - Don't require live simulation for mapping tests (unit-test the mapping function)

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: none

  **Parallelization**:
  - **Wave**: 4 (with T16-19)
  - **Blocks**: None
  - **Blocked By**: T16, T17, T18

  **Acceptance Criteria**:
  - [ ] All tests pass: `python -m pytest backend/tests/test_evolution.py -v`

  **QA Scenarios**:
  ```
  Scenario: Run evolution tests
    Tool: Bash
    Preconditions: Backend .venv active
    Steps:
      1. PYTHONPATH=backend python -m pytest backend/tests/test_evolution.py -v
    Expected Result: All tests pass (≥ 10 tests)
    Evidence: .omo/evidence/task-20-test-results.txt
  ```

  **Commit**: YES (groups with T18)
  - Message: same as T18

---

## Wave 5 — Agent Detail + Integration

- [ ] 21. **Agent detail page — knowledge base section**

  **What to do**:
  - Add "Knowledge Base" tab in agent detail page (`/personas/[slug]`)
  - Show all uploaded documents: filename, size, status, upload date, delete button
  - Show "Knowledge Search" input: type a query → call `POST /personas/{id}/query-knowledge` → display top-3 matching chunks with relevance scores
  - Show document count and total knowledge chunks count
  - Add document topics summary (auto-generated topics from extracted text keywords)
  - Add inline "Upload Document" button (reuse T10 component)

  **Must NOT do**:
  - Don't show raw Chroma metadata (show human-readable info)
  - Don't allow editing extracted text

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: none

  **Parallelization**:
  - **Wave**: 5 (with T22, T23, T24)
  - **Blocks**: F1-F4
  - **Blocked By**: T10 (doc upload UI), T9 (API endpoints)

  **References**:
  - `frontend/app/personas/[slug]/page.tsx` — existing detail page structure
  - `frontend/lib/api.ts` — knowledge API functions

  **Acceptance Criteria**:
  - [ ] Knowledge Base tab shows all persona documents
  - [ ] Search input queries knowledge and returns chunks
  - [ ] Document count displayed
  - [ ] Upload button works inline
  - [ ] Delete button works per document

  **QA Scenarios**:
  ```
  Scenario: View knowledge base and search
    Tool: Playwright
    Preconditions: Persona has uploaded documents
    Steps:
      1. Navigate to /personas/{slug}
      2. Click "Knowledge Base" tab
      3. Assert document list visible with filenames
      4. Type search query in Knowledge Search input
      5. Assert matching chunks displayed below
    Expected Result: Knowledge base visible and searchable
    Evidence: .omo/evidence/task-21-knowledge.png
  ```

  **Commit**: YES
  - Message: `feat(ui): agent detail knowledge base section with search and document management`
  - Files: `frontend/app/personas/[slug]/page.tsx`, `frontend/lib/api.ts`

- [ ] 22. **Agent detail page — research history section**

  **What to do**:
  - Add "Research" tab in agent detail page
  - Show research history: each entry shows query, date, result count
  - Expandable cards: click to show full results (title, URL, content snippet)
  - "Run Research" button with topic input field (placeholder defaults to persona role + focus)
  - Show research status indicator (running/completed/failed)
  - Link to knowledge base: show which research results became knowledge

  **Must NOT do**:
  - Don't auto-run research on page load
  - Don't run research if TAVILY_API_KEY not set (show disabled state)

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: none

  **Parallelization**:
  - **Wave**: 5 (with T21, T23, T24)
  - **Blocks**: F1-F4
  - **Blocked By**: T15 (research history API)

  **References**:
  - `frontend/app/personas/[slug]/page.tsx` — detail page tabs pattern
  - `frontend/lib/api.ts` — research API functions

  **Acceptance Criteria**:
  - [ ] Research tab shows past results with dates
  - [ ] Expandable cards show full result details
  - [ ] "Run Research" button triggers research with loading state
  - [ ] Disabled state when no TAVILY_API_KEY

  **QA Scenarios**:
  ```
  Scenario: Research tab with history
    Tool: Playwright
    Preconditions: Personal has past research
    Steps:
      1. Navigate to /personas/{slug}
      2. Click "Research" tab
      3. Assert research history visible with query and date
      4. Click expand on a research entry — assert results show
    Expected Result: Research history browsable
    Evidence: .omo/evidence/task-22-research-tab.png

  Scenario: Trigger new research from UI
    Tool: Playwright
    Preconditions: TAVILY_API_KEY set
    Steps:
      1. Click "Run Research"
      2. Enter topic "M&A best practices 2024"
      3. Click submit
      4. Assert loading indicator
      5. Assert new entry appears in history after completion
    Expected Result: New research triggered from UI
    Evidence: .omo/evidence/task-22-run-research.png
  ```

  **Commit**: YES
  - Message: `feat(ui): agent detail research history section with manual trigger`
  - Files: `frontend/app/personas/[slug]/page.tsx`, `frontend/lib/api.ts`

- [ ] 23. **Agent detail page — evolution timeline**

  **What to do**:
  - Add "Evolution" tab in agent detail page
  - Show evolution timeline: chronological list of all evolutions (approved/rejected/pending)
  - Each entry shows:
    - Simulation name and date
    - Before/after personality bar comparison (for approved evolutions)
    - Proposed deltas (for pending/rejected)
    - Stance change if applicable
    - Status badge (Approved/Rejected/Pending)
  - Personality trend chart: line chart showing each trait value over time (across evolutions)
  - Pending evolution takes priority at top with approve/reject buttons (reuse T19)

  **Must NOT do**:
  - Don't show evolution section if persona has zero evolutions (show "no evolutions yet" state)
  - Don't modify evolution from timeline (approve/reject only from pending section)

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: none

  **Parallelization**:
  - **Wave**: 5 (with T21, T22, T24)
  - **Blocks**: F1-F4
  - **Blocked By**: T19 (evolution review UI), T18 (evolution API)

  **References**:
  - `frontend/app/personas/[slug]/page.tsx` — detail page tabs
  - Recharts library for trend chart (already a dep)
  - `frontend/lib/api.ts` — evolution API functions

  **Acceptance Criteria**:
  - [ ] Evolution tab shows chronological timeline
  - [ ] Approved evolutions show before/after comparison
  - [ ] Personality trend chart renders with data
  - [ ] Pending evolution shows at top with approve/reject

  **QA Scenarios**:
  ```
  Scenario: Evolution timeline view
    Tool: Playwright
    Preconditions: Personal has evolution history
    Steps:
      1. Navigate to /personas/{slug}
      2. Click "Evolution" tab
      3. Assert timeline entries visible with personality bars
      4. Assert trend chart renders for each trait
    Expected Result: Evolution history visible and interactive
    Evidence: .omo/evidence/task-23-evolution-timeline.png
  ```

  **Commit**: YES
  - Message: `feat(ui): agent detail evolution timeline with trend chart`
  - Files: `frontend/app/personas/[slug]/page.tsx`, `frontend/lib/api.ts`

- [ ] 24. **Cross-session memory persistence + injection into agent prompts**

  **What to do**:
  - Create `backend/app/cross_session_memory.py` — cross-session memory service
  - On simulation completion: extract key outcomes, strategies, and lessons per persona
  - Store as structured memory entries: `{persona_id, simulation_id, subject, outcome, key_tactic, lesson_learned, trust_changes, alliance_changes}`
  - Store in Chroma as persona knowledge with source_type="cross_session"
  - In `AgentRuntime._build_system_prompt()`: inject cross-session memory as "## Past Experience" section
    - Query by persona_id, top-2 most relevant past experiences
    - Append context: "In a previous negotiation about {subject}, your {tactic} led to {outcome}."
  - Limit: max 500 tokens for cross-session memory in prompt
  - Cross-session memory decays: older memories have lower priority (capped at last 10 simulations)

  **Must NOT do**:
  - Don't inject all past experiences — only top-2 relevant
  - Don't include cross-session memory if persona has no history

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: none

  **Parallelization**:
  - **Wave**: 5 (with T21, T22, T23)
  - **Blocks**: F1-F4
  - **Blocked By**: T17 (evolution stores simulation results), T14 (prompt injection pattern)

  **References**:
  - `backend/app/runtime/agent.py:_build_system_prompt()` (line 233) — injection point
  - `backend/app/knowledge.py` — KnowledgeStore for storage
  - `backend/app/models.py:Postmortem` (line 432) — contains lessons_learned, social_dynamics
  - `backend/app/runtime/memory_system.py` — existing in-memory memory (reference for structure)

  **Acceptance Criteria**:
  - [ ] Cross-session memory stored in Chroma after simulation
  - [ ] Retrieved and injected into agent system prompt in subsequent simulations
  - [ ] Limited to top-2 memories, max 500 tokens
  - [ ] Oldest memories decay (not injected if more than 10 simulations ago)
  - [ ] No crash if no history (empty section)

  **QA Scenarios**:
  ```
  Scenario: Cross-session memory persists across simulations
    Tool: Bash (python + curl)
    Preconditions: Persona has completed 2+ simulations
    Steps:
      1. Run simulation 1 for persona → assert completion
      2. Run simulation 2 for persona → assert completion
      3. In simulation 2's agent system prompt (via debug hook), assert "## Past Experience" section
      4. Assert content references simulation 1's outcome
    Expected Result: Cross-session memory injected into later simulation
    Evidence: .omo/evidence/task-24-cross-session.txt
  ```

  **Commit**: YES
  - Message: `feat(cross-session): persistent cross-simulation memory with agent prompt injection`
  - Files: `backend/app/cross_session_memory.py`, `backend/app/runtime/agent.py`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality + Tests Review** — `unspecified-high`
  Run `PYTHONPATH=backend python -m pytest backend/tests/ -v`. Review all changed files for: type safety, error handling, excessive comments, over-abstraction. Specifically check: Chroma error handling (graceful degradation), Tavily API key guard, evolution bounds enforcement. Check no API keys in code.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ playwright skill on frontend tasks)
  Start from clean state. Execute EVERY QA scenario from EVERY task through the complete workflow:
  1. Create persona with v2 fields + upload documents
  2. Create simulation with that persona → verify knowledge injected into prompts
  3. Complete simulation → verify evolution computed
  4. Approve evolution → verify personality changes
  5. Run second simulation → verify cross-session memory injected
  6. View agent detail: knowledge base, research history, evolution timeline
  Save evidence to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Specifically check: no auto-apply evolution, no real-time research, no pgvector usage (using Chroma).
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1-3** (grouped): `feat(db+config+api): extend stakeholders with v2 fields, persona CRUD`
- **4-5** (grouped): `feat(ui): persona v2 creation/edit form and list updates`
- **6**: `feat(tests): DB migration + CRUD API tests`
- **7**: `feat(embeddings): OpenRouter embedding service`
- **8**: `feat(knowledge): Chroma-backed knowledge store`
- **9** (grouped with 11): `feat(api): persona document upload with Chroma pipeline`
- **10**: `feat(ui): persona document upload management UI`
- **12**: `feat(research): Tavily web research service`
- **13**: `feat(sim): pre-simulation Tavily research trigger`
- **14**: `feat(rag): Chroma knowledge injection into agent prompts`
- **15**: `feat(research+ui): research history API and frontend display`
- **16** (grouped with 17): `feat(evolution): outcome mapping and computation service`
- **18** (grouped with 20): `feat(api): evolution approval API`
- **19**: `feat(ui): evolution review and approval UI`
- **21**: `feat(ui): agent detail knowledge base section`
- **22**: `feat(ui): agent detail research history section`
- **23**: `feat(ui): agent detail evolution timeline`
- **24**: `feat(cross-session): persistent cross-sim memory and prompt injection`

---

## Success Criteria

### Verification Commands
```bash
# Backend tests
PYTHONPATH=backend python -m pytest backend/tests/test_persona_v2.py -v
PYTHONPATH=backend python -m pytest backend/tests/test_knowledge.py -v
PYTHONPATH=backend python -m pytest backend/tests/test_evolution.py -v
PYTHONPATH=backend python -m pytest backend/tests/ -v

# Frontend type check
cd frontend && npx tsc --noEmit
```

### Final Checklist
- [ ] Persona created with v2 fields (backstory, stance, personality, tools, hidden_agenda)
- [ ] Document uploaded → text extracted → Chroma embedded → RAG retrieves relevant chunks
- [ ] Pre-simulation Tavily research stores results as persona knowledge
- [ ] Agent system prompt contains knowledge + research + cross-session memory during simulation
- [ ] Simulation completion triggers evolution computation
- [ ] Pending evolution visible in frontend with before/after comparison
- [ ] Approve evolution → personality/stance persisted changes
- [ ] Reject evolution → no change, recorded as rejected
- [ ] Cross-session memory persists to next simulation
- [ ] Agent detail page shows: knowledge base, research history, evolution timeline
- [ ] All tests pass
- [ ] No auto-apply evolution (all require user approval)
- [ ] No real-time research during simulation
- [ ] No pgvector usage
- [ ] Chroma unavailability handled gracefully (no simulation crashes)
