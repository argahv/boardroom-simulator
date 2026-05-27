# Code Review Fixes — Boardroom Simulator

## TL;DR

> **Quick Summary**: Fix 24 bugs found in comprehensive code review and live API testing. Core simulation engine is broken (`memory_system` parameter mismatch). Templates API returns empty due to dual-schema desync. 13 unused component files, 6 orphaned API functions, multiple frontend→backend type mismatches.
>
> **Deliverables**:
> - Fix CRITICAL simulation-blocking bug (AgentRuntime missing param)
> - Fix template schema desync (seeds write to wrong table)
> - Fix wizard data corruption (backstory ↔ hidden_agenda)
> - Re-sync frontend types with backend Pydantic models
> - Remove dead code (unused components, orphaned API, dead v1 stream)
> - Add error boundary and missing loading states
> - Clean up dual-schema inconsistencies

**Estimated Effort**: Large (24+ bugs, 4 parallel waves)
**Parallel Execution**: YES — 4 waves
**Critical Path**: Task 1 → Task 4 → Task 7 → Task 14 → Task 18 → F1-F4

---

## Context

### Original Request
"Look into the codes. Tell me if all features are working and properly implemented. Do a code review, make sure all features and functionality are working and the flow is working. Test with real data."

### Interview Summary
**Key Findings from Live Testing**:
- 14 Postgres tables, 13 SQLite tables
- 23 stakeholders seeded correctly
- 0 templates returned — desync between `scenario_templates` (6 rows) and `templates` (0 rows) tables
- Simulation creation works but streaming fails: `AgentRuntime.__init__()` got unexpected keyword argument `memory_system`
- Postmortem generation works
- Analytics returns "Simulation not found" (route ordering issue)
- Persona CRUD works (create, read, update, delete)
- Document upload → Chroma → RAG query flow works

### Key Issues Discovered

**CRITICAL — Blocking:**
1. `simulation.py` passes `memory_system=memory_system` to `AgentRuntime.__init__()` but `agent.py:30-55` has no such parameter → simulation won't start
2. PostgresBackend.list_templates_v2() queries `templates` table (new schema, 0 rows) but `create_template()` writes to `scenario_templates` (old schema, 6 rows) → templates API returns empty
3. Wizard `addLibraryPersona()` copies `hidden_agenda` into `backstory` field → persona data corrupted on import
4. Frontend SSE parser reads `turn_index`/`speaker` but backend emits `_index`/`agent_name` → turns silently lost
5. Replay mode never fetches turn data → empty transcript
6. Evolution approval sets status but never applies personality deltas

**HIGH — Functionality Broken:**
7. 6 orphaned API functions with no backend routes
8. Frontend `Postmortem` type has 8 fields vs backend 19+
9. Frontend `SimulationV2Config` missing `auto_research`, `research_topics`, `inject_knowledge`
10. Analytics `total_turns` always 0 (`get_all_turns_count()` missing)
11. Export crashes for DB-only sims (memory dict required)
12. Agent detail crashes on SQLite (postgres-only import)
13. 13 unused component files
14. Human turn injection endpoint has no UI
15. v1 streamSimulation dead code (86 lines)

**MEDIUM — Quality:**
16. Wizard submit → War Room has no loading transition
17. Analytics page uses unloaded font `--font-newsreader`
18. Postmortem detail page renders only 40% of backend data
19. Frontend `ActionType` missing `vote` and `walkaway`
20. No app-level error boundary
21. `player_mode` hardcoded false
22. Frontend `V2Turn` type missing fallback fields for SSE
23. `ActionSpace.actions` expects objects, frontend sends strings — no API contract match
24. `_cfg_to_v2_config` is identity function (does nothing)

---

## Work Objectives

### Core Objective
Fix all critical and high-priority bugs found in code review, clean up dead code, sync frontend/backend types, and verify end-to-end simulation flow works.

### Concrete Deliverables
- Simulation engine starts and streams turns
- Templates API returns seeded data
- Wizard creates correct personas
- SSE events parsed correctly by frontend
- Replay mode shows transcripts
- Evolution approval applies personality changes
- All orphaned API functions removed
- Frontend types match backend schemas
- Analytics returns accurate data
- Export works for all simulations
- Agent detail works on both DB backends
- 13 unused component files removed
- Dead code (v1 stream, orphaned fns) cleaned up

### Definition of Done
- [ ] `curl -sN /simulations/{id}/stream` produces turns with 2+ agents debating
- [ ] `curl -s /templates` returns 6 templates
- [ ] Wizard creates simulation with correct backstory
- [ ] Replay mode shows turn transcript
- [ ] `POST /evolutions/{id}/approve` actually changes personality
- [ ] `tsc --noEmit` passes on frontend
- [ ] `bun test` passes on frontend
- [ ] `PYTHONPATH=. python -m pytest backend/tests/` passes

### Must Have
- Simulation engine runs end-to-end (critical blocker)
- Templates API works
- Frontend types match backend
- All dead code removed
- Error boundary catches runtime errors

### Must NOT Have (Guardrails)
- Do NOT rewrite the entire runtime engine — just fix the param mismatch
- Do NOT consolidate DB schemas (would require migration) — just fix the read/write mismatch
- Do NOT add new features — only fix existing broken ones
- Do NOT touch the behavior engine (social physics/internal state/relationship graph) — it's working

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (pytest + bun test)
- **Automated tests**: Tests-after
- **Framework**: pytest (backend) / bun test (frontend)
- **Agent-Executed QA**: ALWAYS — curl for API, Playwright for UI

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (CRITICAL blockers — must fix first):
├── Task 1: Fix AgentRuntime memory_system param [quick]
├── Task 2: Fix template schema desync [quick]
├── Task 3: Fix wizard backstory corruption [quick]
├── Task 4: Fix SSE field name parsing [quick]
├── Task 5: Fix replay mode transcript loading [quick]
└── Task 6: Fix evolution approval apply deltas [quick]

Wave 2 (HIGH priority — functionality gaps):
├── Task 7: Remove 6 orphaned API functions [quick]
├── Task 8: Sync frontend Postmortem type with backend [quick]
├── Task 9: Add missing SimulationV2Config fields [quick]
├── Task 10: Add get_all_turns_count() to DB backends [quick]
├── Task 11: Fix export for DB-only simulations [quick]
├── Task 12: Fix SQLite agent detail crash [quick]
├── Task 13: Remove 13 unused component files [quick]
├── Task 14: Remove dead v1 streamSimulation function [quick]
└── Task 15: Add human turn UI to War Room [unspecified-high]

Wave 3 (MEDIUM — quality):
├── Task 16: Add loading state to wizard submit [quick]
├── Task 17: Fix analytics font reference [quick]
├── Task 18: Bump Postmortem detail to show full data [quick]
├── Task 19: Sync ActionType with backend [quick]
├── Task 20: Add app-level error boundary [quick]
├── Task 21: Add player_mode UI toggle [quick]
├── Task 22: Fix V2Turn type with fallback fields [quick]
└── Task 23: Remove dead _cfg_to_v2_config function [quick]

Wave FINAL (verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Build + lint + test suite
├── Task F3: Real end-to-end QA (create, stream, postmortem, export)
└── Task F4: Scope fidelity check
```

---

## TODOs

- [x] 1. Fix AgentRuntime — Add `memory_system` parameter to `AgentRuntime.__init__()`

  **What to do**:
  - Add `memory_system: Any = None` parameter to `AgentRuntime.__init__()` in `runtime/agent.py` line 30
  - Store as `self.memory_system = memory_system` (even if unused currently — prevents crash)
  - This fixes the `unexpected keyword argument 'memory_system'` error when simulation starts

  **Must NOT do**:
  - Do NOT implement memory_system integration — just accept and store the param

  **References**:
  - `backend/app/runtime/simulation.py:20,33` — passes `memory_system=memory_system` to AgentRuntime
  - `backend/app/runtime/agent.py:30-55` — AgentRuntime.__init__() missing the param

  **QA Scenarios**:
  ```
  Scenario: Simulation starts successfully
    Tool: Bash (curl)
    Steps:
      1. POST /simulations with 2 stakeholders, max_turns=3
      2. GET /simulations/{id}/stream (timeout 60s)
      3. Check output for "type":"turn" events
    Expected: At least 2 turns from different agents
    Evidence: .sisyphus/evidence/task-1-sim-stream.txt

  Scenario: No "unexpected keyword argument" error
    Tool: Bash (curl)
    Steps:
      1. Same as above
      2. Check stream for absence of "type":"error" events
    Expected: 0 error events in stream
    Evidence: .sisyphus/evidence/task-1-no-error.txt
  ```

  **Commit**: YES
  - Message: `fix: add memory_system param to AgentRuntime to prevent simulation crash`
  - Files: `backend/app/runtime/agent.py`

- [x] 2. Fix Template Schema Desync — Route reads from correct table

  **What to do**:
  - Fix `_load_seeds()` in `main.py` to write to BOTH `scenario_templates` AND `templates` tables
  - OR: Fix `list_templates_api()` to fall back to `list_templates()` when `list_templates_v2()` returns empty
  - OR: Fix PostgresBackend `create_template()` to write to `templates` table instead of `scenario_templates`
  - Best approach: Route should prefer `list_templates_v2()` but fall back to `list_templates()` if empty
  - In `postgres.py`: update `create_template()` to insert into `templates` table (with proper schema mapping)

  **References**:
  - `backend/app/database/postgres.py:50` — creates `scenario_templates` table
  - `backend/app/database/postgres.py:426-428` — `create_template()` inserts into `scenario_templates`
  - `backend/app/database/postgres.py:584-599` — `list_templates_v2()` reads from `templates`
  - `backend/app/main.py:529-537` — `list_templates_api()` route
  - `backend/app/main.py:142-162` — `_load_seeds()` seed loading

  **QA Scenarios**:
  ```
  Scenario: Templates API returns 6 templates
    Tool: Bash (curl)
    Steps:
      1. curl -s http://localhost:8000/templates
      2. Parse JSON, count results
    Expected: 6 templates returned
    Evidence: .sisyphus/evidence/task-2-templates.txt
  ```

  **Commit**: YES
  - Message: `fix: align template seed writes with list_templates_v2 read table`
  - Files: `backend/app/database/postgres.py`


- [x] 3. Fix Wizard Backstory Corruption

  **What to do**:
  - In `frontend/app/simulate/new/page.tsx`, find `addLibraryPersona()` function around line 114
  - Change `backstory: st.hidden_agenda || ""` to use proper mapping
  - The v1 `Stakeholder` type doesn't have `backstory` — use `st.focus` or empty string as backstory
  - The `hidden_agenda` should map to `hidden_agenda` on the v2 persona, NOT backstory
  - Need to check if frontend Stakeholder type has a field that maps to backstory

  **References**:
  - `frontend/app/simulate/new/page.tsx:114` — `backstory: st.hidden_agenda || ""`
  - `frontend/lib/types.ts` — `Stakeholder` v1 type vs `StakeholderV2`
  - Backend `Stakeholder` model — has `focus`, `incentive_tuning`, `tag` but no `backstory`

  **QA Scenarios**:
  ```
  Scenario: Wizard persona has correct backstory
    Tool: Playwright
    Steps:
      1. Navigate to /simulate/new
      2. Click "Import from Library"
      3. Select a persona with focus text
      4. Check the backstory field in the wizard
    Expected: Backstory should NOT contain hidden_agenda text
    Evidence: .sisyphus/evidence/task-3-backstory.txt
  ```

  **Commit**: YES (with task 4)
  - Message: `fix: wizard backstory not overwritten by hidden_agenda`
  - Files: `frontend/app/simulate/new/page.tsx`


- [x] 4. Fix SSE Field Name Parsing

  **What to do**:
  - In `frontend/app/simulate/[id]/page.tsx`, update the SSE event parser in `startStream()`
  - Add fallback: `turn_index: Number(evt.turn_index ?? evt._index ?? 0)`
  - Add fallback: `speaker: String(evt.speaker ?? evt.agent_name ?? "")`
  - Add fallback: `speaker_role: String(evt.speaker_role ?? evt.role ?? evt.agent_role ?? "")`
  - Add fallback: `reasoning: String(evt.reasoning ?? evt.internal_reasoning ?? "")`
  - This matches the backend's actual emission patterns:
    - `agent.py` emits `agent_id`, `agent_name`, `role`
    - `_extract_turn_index()` uses `_index` fallback
    - `_save_turn()` checks `speaker` then `agent_name`

  **References**:
  - `frontend/app/simulate/[id]/page.tsx:128-170` — SSE handling
  - `backend/app/runtime/agent.py:449-461` — turn event format
  - `backend/app/main.py:619-627` — `_extract_turn_index()` with `_index` fallback
  - `backend/app/main.py:631` — `_save_turn()` with `agent_name` fallback

  **QA Scenarios**:
  ```
  Scenario: SSE events parsed with correct speaker names
    Tool: Playwright
    Steps:
      1. Start simulation
      2. Check transcript shows speaker names
    Expected: Speaker names are visible and correct
    Evidence: .sisyphus/evidence/task-4-sse.txt
  ```

  **Commit**: YES (with task 3)
  - Message: `fix: handle SSE field name variations (turn_index/_index, speaker/agent_name)`


- [x] 5. Fix Replay Mode Transcript Loading

  **What to do**:
  - In `frontend/app/simulate/[id]/page.tsx`, when `isReplay` is true, fetch turn data
  - Add `fetchSimulationTurns(id)` to `api.ts` that calls `GET /simulations/{id}/turns`
  - OR: use existing `GET /simulations/{id}/export` and extract turns
  - OR: look for an endpoint that returns turns — check if `get_turns_by_simulation` is accessible

  Actually, the simplest fix: When in replay mode, use the exported simulation data. Add a new API function that fetches turns from the replay endpoint, or create a new endpoint.

  Best approach: Add `GET /simulations/{simulation_id}/turns` endpoint to backend that returns stored turns, and fetch it from frontend during replay.

  **References**:
  - `frontend/app/simulate/[id]/page.tsx:95-107` — replay mode detection
  - `backend/app/main.py:1117-1150` — replay endpoint (returns snapshots only)
  - `backend/app/database/postgres.py:546` — `get_turns_by_simulation()` exists

  **QA Scenarios**:
  ```
  Scenario: Replay mode shows turn transcript
    Tool: Playwright
    Steps:
      1. Complete a simulation
      2. Navigate to /simulate/{id} — should be in replay mode
      3. Check transcript panel shows all turns
    Expected: Turns are displayed in transcript
    Evidence: .sisyphus/evidence/task-5-replay.txt
  ```

  **Commit**: YES (with task 6)
  - Message: `fix: load turns for replay mode`


- [x] 6. Fix Evolution Approval — Apply Personality Deltas

  **What to do**:
  - In `backend/app/main.py` route `POST /evolutions/{evolution_id}/approve` (line 499-506)
  - After setting status to "approved", read the `proposed_deltas` from the evolution record
  - Fetch the current stakeholder record
  - Apply deltas to personality fields (aggressiveness, empathy, stubbornness, verbosity)
  - Apply stance change if `proposed_stance` is set
  - Save updated stakeholder

  **References**:
  - `backend/app/main.py:499-506` — approve route (currently only changes status)
  - `backend/app/database/postgres.py` — `approve_evolution()`, `get_pending_evolutions()`
  - `backend/app/models.py` — `PersonaEvolution` model with `proposed_deltas` field
  - Backend `evolution.py` — `compute_and_store()` that creates the deltas

  **QA Scenarios**:
  ```
  Scenario: Evolution approval changes personality
    Tool: Bash (curl)
    Steps:
      1. Run simulation that triggers evolution
      2. GET /personas/{id}/evolutions/pending
      3. POST /evolutions/{id}/approve
      4. GET /personas/{id} and check personality values changed
    Expected: Personality values reflect proposed deltas
    Evidence: .sisyphus/evidence/task-6-evolution.txt
  ```

  **Commit**: YES (with task 5)
  - Message: `fix: apply personality deltas on evolution approval`


- [ ] 7. Remove 6 Orphaned API Functions

  **What to do**:
  - In `frontend/lib/api.ts`, remove these exported functions:
    - `fetchLibrary()` — `GET /library` (no backend route)
    - `fetchJob(jobId)` — `GET /jobs/{jobId}` (no backend route)
    - `fetchSimulationJobs(simId)` — `GET /simulations/{id}/jobs` (no backend route)
    - `retryJob(jobId)` — `POST /jobs/{id}/retry` (no backend route)
    - `runSimulation(id)` — `POST /simulations/{id}/run` (v1, no route)
    - `runSimulationAsync(id)` — `POST /simulations/{id}/run-async` (no route)
    - `createPostmortemAsync(id)` — `POST /simulations/{id}/postmortem-async` (no route)
  - These are NOT called from any page (confirmed in frontend audit)
  - Remove their type definitions if not used elsewhere

  **References**:
  - `frontend/lib/api.ts` — search for each function name
  - Frontend audit confirmed none are called from pages

  **QA Scenarios**:
  ```
  Scenario: No broken imports after removal
    Tool: Bash
    Steps:
      1. cd frontend && npx tsc --noEmit
    Expected: 0 errors
    Evidence: .sisyphus/evidence/task-7-clean-tsc.txt
  ```

  **Commit**: YES (groups with 13, 14)
  - Message: `chore: remove orphaned API functions with no backend routes`


- [ ] 8. Sync Frontend Postmortem Type with Backend

  **What to do**:
  - Update `frontend/lib/types.ts` `Postmortem` interface to match backend's `Postmortem` model
  - Add all missing fields: `summary`, `verdict`, `end_reason`, `termination_details`, `topics`, `stakeholder_reports`, `key_moments`, `social_dynamics`, `lessons_learned`
  - Add nested interfaces for `TerminationResult`, `TopicSummary`, `StakeholderReport`, `KeyMoment`, `SocialDynamicsSummary`, `StrategyCard`

  **References**:
  - `backend/app/models.py` — search for `class Postmortem`
  - `frontend/lib/types.ts` — current `Postmortem` type (line ~143)
  - `backend/app/runtime/postmortem_generator.py` — all fields generated

  **QA Scenarios**:
  ```
  Scenario: Postmortem renders all fields
    Tool: Bash (curl)
    Steps:
      1. POST /simulations/{id}/postmortem
      2. Check response has summary, verdict, end_reason fields
    Expected: All 19+ fields present in response
    Evidence: .sisyphus/evidence/task-8-postmortem.txt
  ```

  **Commit**: YES (with task 9)
  - Message: `fix: sync frontend Postmortem type with backend model`


- [ ] 9. Add Missing SimulationV2Config Fields to Frontend

  **What to do**:
  - Add `auto_research: boolean` (default true)
  - Add `research_topics: string[]`
  - Add `inject_knowledge: boolean` (default true)
  - Update `buildConfig()` in wizard if needed

  **References**:
  - `backend/app/models.py` — `SimulationV2Config` class
  - `frontend/lib/types.ts` — current `SimulationV2Config` type

  **QA Scenarios**:
  ```
  Scenario: SimulationV2Config type matches backend
    Tool: npx tsc --noEmit
    Steps:
      1. Create SimulationV2Config with new fields
      2. Build check
    Expected: 0 type errors
    Evidence: .sisyphus/evidence/task-9-config.txt
  ```

  **Commit**: YES (with task 8)


- [ ] 10. Add get_all_turns_count to DatabaseBackend

  **What to do**:
  - Add `get_all_turns_count()` as abstract method to `base.py`
  - Implement in `sqlite.py`: `SELECT COUNT(*) FROM v2_turns`
  - Implement in `postgres.py`: `SELECT COUNT(*) FROM turns` (or v2_turns)
  - Fix the analytics route at `main.py:1057` to use the new method

  **References**:
  - `backend/app/database/base.py` — abstract methods
  - `backend/app/database/sqlite.py` — SQLite implementations
  - `backend/app/database/postgres.py` — Postgres implementations
  - `backend/app/main.py:1057` — `get_all_turns_count()` call

  **QA Scenarios**:
  ```
  Scenario: Analytics returns total_turns > 0
    Tool: Bash (curl)
    Steps:
      1. Create and complete a simulation with a few turns
      2. GET /simulations/analytics
    Expected: total_turns > 0
    Evidence: .sisyphus/evidence/task-10-analytics.txt
  ```

  **Commit**: YES
  - Message: `fix: add get_all_turns_count to all DB backends for analytics`


- [ ] 11. Fix Export for DB-Only Simulations

  **What to do**:
  - In `backend/app/main.py` `export_simulation_v2()` (line 1153-1202)
  - Add fallback: if `_v2_simulations.get(simulation_id)` returns None, try DB lookup
  - Use `get_simulation_config()` to load config from DB
  - Use existing turn/snapshot loading (already queries DB)

  **References**:
  - `backend/app/main.py:1153-1202` — export endpoint
  - `backend/app/main.py:1071-1114` — `get_simulation_v2()` already has this fallback pattern

  **QA Scenarios**:
  ```
  Scenario: Export works after server restart
    Tool: Bash (curl)
    Steps:
      1. Create and complete a simulation
      2. Restart server (sim evicted from memory)
      3. GET /simulations/{id}/export
    Expected: 200 with full simulation JSON
    Evidence: .sisyphus/evidence/task-11-export.txt
  ```

  **Commit**: YES
  - Message: `fix: export for DB-only simulations (add DB fallback)`


- [ ] 12. Fix SQLite Agent Detail Crash

  **What to do**:
  - In `backend/app/main.py` agents detail route (line ~1350-1433)
  - The `get_agent_memories_by_id` is imported only from `postgres.py` (line 1369-1370)
  - Add try/except around the import or make it a conditional import
  - Better fix: add `get_agent_memories_by_id` to the base class and both backends
  - On SQLite, the function should query `semantic_memories` table or return empty list if table doesn't exist

  **References**:
  - `backend/app/main.py:1365-1375` — imports and calls `get_agent_memories_by_id`
  - `backend/app/database/postgres.py` — search for `get_agent_memories_by_id`

  **QA Scenarios**:
  ```
  Scenario: Agent detail works on SQLite
    Tool: Bash
    Steps:
      1. Configure DATABASE_TYPE=sqlite
      2. GET /agents/{name}/detail for an existing agent
    Expected: 200 with agent data (memories may be empty)
    Evidence: .sisyphus/evidence/task-12-sqlite-agent.txt
  ```

  **Commit**: YES
  - Message: `fix: add SQLite fallback for get_agent_memories_by_id`


- [ ] 13. Remove 13 Unused Component Files

  **What to do**:
  - Delete these files from `frontend/components/` (confirmed unused in audit):
    - `relationship-graph.tsx`
    - `trust-meter.tsx`
    - `agent-card.tsx`
    - `coalition-visualization.tsx`
    - `goal-tracker.tsx`
    - `action-glyph.tsx`
    - `TurnDisplay.tsx`
    - `Voltage.tsx`
    - `SimBadge.tsx`
  - `sound.ts`
  - Any other component not imported by any page
  - **EXCLUDED (are imported):** `ActionGlyph.tsx`, `Voltage.tsx`, `SimBadge.tsx` — confirmed imported by layout files
  - **Check for imports** referencing each file before deleting (grep for `from.*components/`) — do NOT delete any file that has active imports

  **References**:
  - `frontend/components/` — directory listing
  - `grep -r "from.*components/relationship-graph" frontend/` — confirm no imports

  **QA Scenarios**:
  ```
  Scenario: tsc passes after removal
    Tool: Bash
    Steps:
      1. cd frontend && npx tsc --noEmit
    Expected: 0 errors
    Evidence: .sisyphus/evidence/task-13-clean.txt
  ```

  **Commit**: YES (groups with 7, 14)
  - Message: `chore: remove 13 unused component files`


- [ ] 14. Remove Dead v1 streamSimulation Function

  **What to do**:
  - In `frontend/lib/api.ts`, remove `streamSimulation()` function (lines ~471-557)
  - It's replaced by `streamSimulationV2()` (used by War Room)
  - Remove any associated types if not used elsewhere

  **References**:
  - `frontend/lib/api.ts` — search for `streamSimulation`

  **QA Scenarios**:
  ```
  Scenario: tsc passes after removal
    Tool: Bash
    Steps:
      1. cd frontend && npx tsc --noEmit
    Expected: 0 errors
    Evidence: .sisyphus/evidence/task-14-clean.txt
  ```

  **Commit**: YES (groups with 7, 13)


- [ ] 15. Add Human Turn Input to War Room

  **What to do**:
  - Add an input field in the War Room (`frontend/app/simulate/[id]/page.tsx`)
  - Show when `config.player_mode` is true (or always show)
  - Input: text area + stakeholder selector + "Send" button
  - Calls `POST /simulations/{id}/inject` with `HumanTurnRequest`
  - Add the human turn to local state immediately (optimistic update)

  **References**:
  - `backend/app/main.py:1436-1458` — `POST /simulations/{id}/inject` endpoint
  - `frontend/app/simulate/[id]/page.tsx` — War Room component
  - `frontend/lib/api.ts` — `injectV2Turn()` function exists

  **QA Scenarios**:
  ```
  Scenario: Human turn appears in transcript
    Tool: Playwright
    Steps:
      1. Navigate to War Room during a simulation
      2. Type text in human input field
      3. Click Send
    Expected: Human turn appears in transcript
    Evidence: .sisyphus/evidence/task-15-human-turn.png
  ```

  **Commit**: YES
  - Message: `feat: add human turn input UI to War Room`


- [ ] 16. Add Loading State to Wizard Submit

  **What to do**:
  - In `frontend/app/simulate/new/page.tsx`, add loading/spinner state
  - Set `submitting: true` on submit
  - Disable submit button and show spinner during API call
  - Handle errors gracefully (show error message, re-enable button)

  **References**:
  - `frontend/app/simulate/new/page.tsx` — wizard submit handler

  **QA Scenarios**:
  ```
  Scenario: Wizard shows loading state on submit
    Tool: Playwright
    Steps:
      1. Fill wizard form
      2. Click "Launch Simulation"
      3. Observe button state
    Expected: Button shows spinner, is disabled during submission
    Evidence: .sisyphus/evidence/task-16-loading.png
  ```

  **Commit**: YES (groups with 17, 20)
  - Message: `fix: add loading state to wizard submit`


- [ ] 17. Fix Analytics Font Reference

  **What to do**:
  - In `frontend/app/analytics/page.tsx`, replace `var(--font-newsreader)` with a font that's actually loaded
  - Check `frontend/app/layout.tsx` for loaded Google Fonts
  - Use `Inter`, `Inter_Tight`, `Playfair_Display`, or `JetBrains_Mono` instead
  - Or add `Newsreader` font import to layout

  **References**:
  - `frontend/app/analytics/page.tsx` — `--font-newsreader` reference
  - `frontend/app/layout.tsx` — font imports and variable definitions

  **QA Scenarios**:
  ```
  Scenario: Analytics page renders without missing font
    Tool: Playwright
    Steps:
      1. Navigate to /analytics
      2. Check browser console for font loading errors
    Expected: No font-related errors in console
    Evidence: .sisyphus/evidence/task-17-font.png
  ```

  **Commit**: YES (groups with 16, 20)


- [ ] 18. Bump Postmortem Detail Page to Show Full Data

  **What to do**:
  - Update `frontend/app/simulate/[id]/postmortem/page.tsx` to render ALL backend fields
  - Add sections for: executive summary, verdict, end_reason, termination details
  - Add topic summary with positions
  - Add stakeholder reports with position shifts
  - Add key moments timeline
  - Add social dynamics (trust/tension arcs)
  - Add lessons learned section

  **References**:
  - `backend/app/models.py` — `Postmortem` full model
  - `frontend/app/simulate/[id]/postmortem/page.tsx` — current partial render
  - `frontend/lib/types.ts` — update `Postmortem` type first

  **QA Scenarios**:
  ```
  Scenario: Postmortem page shows all sections
    Tool: Playwright
    Steps:
      1. Complete a simulation
      2. Navigate to /simulate/{id}/postmortem
    Expected: All sections rendered (summary, verdict, topics, reports, moments, dynamics)
    Evidence: .sisyphus/evidence/task-18-postmortem-full.png
  ```

  **Commit**: YES
  - Message: `feat: expand postmortem detail page to show full data`


- [ ] 19. Sync ActionType with Backend

  **What to do**:
  - Update `frontend/lib/types.ts` `ActionType` to include `vote` and `walkaway`
  - Current: `"statement" | "question" | "challenge" | "compromise" | "coalition_signal" | "interrupt" | "escalate"`
  - Should add: `"vote" | "walkaway"`

  **References**:
  - `backend/app/models.py` — search for `ActionType` literal
  - `frontend/lib/types.ts:38-45` — current `ActionType`

  **QA Scenarios**:
  ```
  Scenario: ActionType includes all backend values
    Tool: npx tsc --noEmit
    Steps:
      1. Create variable with type ActionType = "vote"
    Expected: No type error
    Evidence: .sisyphus/evidence/task-19-actiontype.txt
  ```

  **Commit**: YES (groups with 8, 9, 22)
  - Message: `fix: sync ActionType with backend (add vote, walkaway)`


- [ ] 20. Add App-Level Error Boundary

  **What to do**:
  - Create `frontend/components/ErrorBoundary.tsx` (class component with `componentDidCatch`)
  - Wrap `AppShell` children with ErrorBoundary in layout
  - Show fallback UI with error message and "Try Again" button

  **References**:
  - `frontend/app/layout.tsx` — layout with AppShell
  - `frontend/components/AppShell.tsx`

  **QA Scenarios**:
  ```
  Scenario: Error boundary catches render errors
    Tool: Playwright
    Steps:
      1. Trigger a render error (e.g., navigate to broken page)
    Expected: Error boundary shows fallback UI, not white screen
    Evidence: .sisyphus/evidence/task-20-error-boundary.png
  ```

  **Commit**: YES (groups with 16, 17)
  - Message: `fix: add app-level error boundary`


- [ ] 21. Add player_mode UI Toggle

  **What to do**:
  - In wizard Step 3 or 4, add toggle for player mode
  - When enabled: `config.player_mode = true`
  - Show in review step
  - Currently hardcoded to `false` in `buildConfig()`

  **References**:
  - `frontend/app/simulate/new/page.tsx` — `buildConfig()` function
  - Backend `models.py` — `SimulationV2Config.player_mode` field

  **QA Scenarios**:
  ```
  Scenario: player_mode toggle appears in wizard
    Tool: Playwright
    Steps:
      1. Navigate to /simulate/new
      2. Go to review step
    Expected: player_mode toggle visible
    Evidence: .sisyphus/evidence/task-21-player-mode.png
  ```

  **Commit**: YES
  - Message: `feat: add player_mode toggle to simulation wizard`


- [ ] 22. Fix V2Turn Type with Fallback Fields

  **What to do**:
  - Update `frontend/lib/types.ts` `V2Turn` interface
  - Add optional fallback fields: `_index?`, `agent_name?`, `agent_role?`, `internal_reasoning?`
  - Update the War Room SSE parser to use these fallbacks (already covered in task 4)
  - This ensures type system matches actual backend behavior

  **References**:
  - `frontend/lib/types.ts` — `V2Turn` interface
  - `backend/app/runtime/agent.py:449-461` — actual emission format

  **QA Scenarios**:
  ```
  Scenario: V2Turn type safe with all backend fields
    Tool: npx tsc --noEmit
    Steps:
      1. Type check
    Expected: 0 errors
    Evidence: .sisyphus/evidence/task-22-v2turn.txt
  ```

  **Commit**: YES (groups with 8, 9, 19)


- [ ] 23. Remove Dead _cfg_to_v2_config Function

  **What to do**:
  - In `backend/app/main.py`, around line 1325-1352
  - Remove `_ensure_v2_config()` and `_cfg_to_v2_config()` functions
  - Update the postmortem route to not call these identity functions
  - **RE-EVALUATION**: `_ensure_v2_config()` does real work (maps raw dict to proper config) — do NOT remove this function
  - Only remove `_cfg_to_v2_config()` which IS an identity function (line ~1349: `return cfg`)

  **References**:
  - `backend/app/main.py` — search for `_cfg_to_v2_config` (identity, safe to remove) and `_ensure_v2_config` (keep)

  **QA Scenarios**:
  ```
  Scenario: Postmortem still works after removal
    Tool: Bash (curl)
    Steps:
      1. Create and complete simulation
      2. POST /simulations/{id}/postmortem
    Expected: 200 with postmortem data
    Evidence: .sisyphus/evidence/task-23-clean.txt
  ```

  **Commit**: YES
  - Message: `chore: remove dead _cfg_to_v2_config identity function`


---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
- [ ] F2. **Build + Lint + Test Suite** — `unspecified-high`
- [ ] F3. **Real E2E QA** — `unspecified-high` (+ `playwright` if UI)
- [ ] F4. **Scope Fidelity Check** — `deep`

---

## Commit Strategy

- **1**: `fix: add memory_system param to AgentRuntime to prevent simulation crash` - agent.py
- **2**: `fix: align template seed writes with list_templates_v2 read table` - postgres.py
- **3**: `fix: wizard backstory not be overwritten by hidden_agenda` - simulate/new/page.tsx
- **4**: `fix: handle SSE field name variations (turn_index/_index, speaker/agent_name)` - simulate/[id]/page.tsx
- **5**: `fix: load turns for replay mode` - simulate/[id]/page.tsx + api.ts
- **6**: `fix: apply personality deltas on evolution approval` - main.py + postgres.py
- **7**: `chore: remove 6 orphaned API functions` - api.ts
- **8+9**: `fix: sync frontend types with backend models` - types.ts
- **10**: `fix: add get_all_turns_count to DB backends` - base.py + sqlite.py + postgres.py
- **11**: `fix: export for DB-only simulations` - main.py
- **12**: `fix: add SQLite fallback for agent memories` - main.py
- **13**: `chore: remove 13 unused component files`
- **14**: `chore: remove dead v1 streamSimulation function` - api.ts
- **15**: `feat: add human turn input to War Room` - simulate/[id]/page.tsx
- **16-23**: Various fix/chore commits

---

## Success Criteria

### Verification Commands
```bash
# Backend
PYTHONPATH=backend python -m pytest backend/tests/ -x -q

# Frontend
cd frontend && npx tsc --noEmit && npm test

# Simulation E2E (manual verification)
curl -s http://localhost:8000/templates | python3 -c "import sys,json; assert len(json.load(sys.stdin)) == 6"
```
