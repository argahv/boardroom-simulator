# Boardroom Simulator — Architecture + Observability Overhaul

## TL;DR

> **Quick Summary**: Three interconnected upgrades to the simulation engine: (1) developer-facing observability so emergent complexity is debuggable, (2) causal emotional chain so emotions actually shape behavior, (3) strategic horizon so agents plan multiple turns ahead. Persist per-turn state snapshots, enable replay, add state diffing, expose goals/strategies, plus make emotions causally influence actions and give agents multi-turn planning.

> **Deliverables**:
> - `v2_state_snapshots` DB table + migration
> - Snapshot persistence in simulation write path
> - `GET /simulations/{id}/replay` API endpoint
> - Structured JSON logging across runtime modules
> - Frontend replay mode (renders persisted snapshots through existing components)
> - State diff panel (per-agent aggregate changes per turn)
> - Goal/strategy visibility in agent detail page
> - Full simulation JSON export endpoint
> - Snapshot schema audit document
> - Emotional modulation model (emotions → behavior probabilities)
> - Hybrid urgency bidding (deterministic + LLM strategy score)
> - Multi-turn planning system (plans, subgoals, plan execution)

> **Estimated Effort**: Large (14–20 days, 2 devs parallel)
> **Parallel Execution**: YES — 6 waves
> **Critical Path**: Observability (W1-W3) → Emotional/Strategic (W4-W5) → Integration (W6)

---

## Context

### Original Request
User identified that the simulation engine, with its 30 runtime files across 5 conceptual layers (social physics, cognition, relationships, strategy, narrative), is approaching "emergent complexity explosion." Once pairwise relationships, emotions, goals, coalitions, and hidden info interact simultaneously, debugging becomes impossible without dedicated observability tooling. The current system has rich live visualizations via SSE but loses all state history when simulations complete.

### Interview Summary
**Key Decisions**:
- Primary consumer: **Developer debugging** — data density over polish
- Replay fidelity: **Snapshot + full recompute** — persist raw snapshots AND turn data for dual-path verification
- Snapshot retention: **Keep N most recent per simulation** — bounded, configurable
- Effort scope: **"Full architecture overhaul"** — observability + causal emotional chain + hybrid urgency + strategic horizon
- All features now in scope: causal emotional chain, hybrid urgency bidding, multi-turn planning
- Emotional modulation: emotions become causally linked to action probabilities and bidding
- Hybrid bidding: merge deterministic urgency formula with LLM-inferred strategic importance
- Strategic horizon: agents maintain multi-turn plans with subgoals and plan state machines
- Observability extended to cover all new state dimensions

**Research Findings**:
- Current `get_public_state()` returns: turn_count, relationship_matrix (NxN trust/fear/admiration/rivalry/alliance/dependency), social_physics (per-agent 6-dimension state), agent_states (per-agent emotion/confidence/certainty/focus/goal_priority)
- Missing from public state: GoalEvolution state, PrivateThought/StrategicThought, WhisperChannel messages, HiddenInfo, CoalitionDetector coalitions
- Frontend already has components consuming state_snapshot events via `useSimulationState` hook — these can render from persisted data
- PerformanceTracker exists but only tracks total tokens and turn times — no per-LLM-call latency

---

## Work Objectives

### Core Objective
Build three interconnected upgrades: (1) developer-facing observability so emergent complexity is debuggable, (2) causal emotional chain so emotions shape behavior, (3) strategic horizon so agents plan multiple turns ahead.

### Concrete Deliverables
1. Snapshot schema audit document (what's captured, what's missing)
2. `v2_state_snapshots` database table + SQLite migration
3. Structured logging across runtime (JSON-format context)
4. Frontend data layer refactored for dual-mode (live SSE + REST replay)
5. Snapshot persistence in simulation write path (background, non-blocking)
6. `GET /simulations/{id}/replay` API endpoint returning ordered snapshots
7. Replay mode in frontend (loads snapshots, renders all existing state components)
8. State diff panel (per-agent aggregate changes, color-coded)
9. Goal/strategy visibility in agent detail page
10. `GET /simulations/{id}/export` full state JSON download
11. Emotional modulation model — emotion thresholds drive behavior probabilities
12. Emotional influence in AgentRuntime — emotions affect bidding and action selection
13. Hybrid urgency — LLM-inferred strategic importance merged with deterministic formula
14. Multi-turn planning data structures — Plan, Subgoal, PlanState
15. Plan execution in AgentRuntime — perceive → plan → act → evaluate
16. Strategic state wiring into observability snapshots

### Definition of Done
- [ ] Open a completed simulation → see full state visualizations (not just text transcript)
- [ ] Step through turns of a completed sim → see trust, leverage, emotion, relationships evolve
- [ ] See "what changed this turn" highlighted for each agent
- [ ] Open agent detail → see goals, strategies, private thoughts per simulation
- [ ] Export any simulation as full JSON
- [ ] Logs include structured JSON context for querying
- [ ] High anger → agent visibly interrupts more often (observable in debug panel)
- [ ] High fear → agent avoids challenges, seeks safety in numbers
- [ ] Urgency scores include LLM-inferred "how important is this moment" component
- [ ] Agent can form and execute a 3-turn plan ("weaken CFO credibility → isolate legal → push vote")
- [ ] Plans visible in agent state during replay

### Must Have
- Persisted state snapshots survive server restart
- Replay uses persisted data, not SSE re-streaming
- Existing live war room visualizations remain unchanged
- Snapshot writes do not block turn generation (background)
- All new components respect `prefers-reduced-motion`
- Emotional influences must be deterministic and testable — no randomness in modulation
- Hybrid urgency must degrade gracefully if LLM call fails (fall back to deterministic-only)
- Strategic plans must be serializable in snapshot state
- Emotions must affect behavior WITHOUT requiring new LLM calls — all modulation is deterministic math

### Must NOT Have (Guardrails)
- No symbolic causal tracing engine — deferred (use replay + diff instead)
- No side-by-side simulation comparison — deferred
- No floating live debugger — deferred
- No changes to existing turn event schema
- No breaking changes to frontend rendering API
- No breaking existing tests — all existing pytest tests must pass unchanged
- Emotional modulation must NOT require new LLM calls — deterministic math only
- Strategic planning must NOT delay turn generation — plans are pre-computed, not real-time LLM chains

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (pytest in `backend/tests/`)
- **Automated tests**: Tests-after (new observability code gets tests after impl)
- **Framework**: pytest + httpx (async test client for FastAPI)

### QA Policy
Every task MUST include agent-executed QA scenarios.

- **API endpoints**: Bash (curl) — send requests, assert status + JSON response shape
- **Frontend UI**: Playwright (playwright skill) — navigate simulation page, verify components render
- **DB queries**: Bash (sqlite3) — verify rows inserted correctly
- **Logging**: Bash (grep/find) — verify structured logs emitted

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — prerequisites, all parallel):
├── Task 1: Snapshot schema audit [explore/research]
├── Task 2: DB migration — v2_state_snapshots table [quick]
├── Task 3: Structured logging audit + retrofit [unspecified-high]
├── Task 4: Frontend data layer refactor for dual-mode [visual-engineering]

Wave 2 (Core — depends on Wave 1):
├── Task 5: Snapshot persistence in write path [unspecified-high]
├── Task 6: Replay API endpoint [quick]
├── Task 7: Frontend replay mode [visual-engineering]

Wave 3 (Deep debugging tools — depends on Wave 2):
├── Task 8: State diff panel [visual-engineering]
├── Task 9: Goal/strategy visibility in agent detail [unspecified-high]
├── Task 10: Simulation JSON export [quick]

Wave 4 (Causal Emotional Chain + Hybrid Urgency — parallel after Wave 2):
├── Task 11: Emotional modulation model — emotion thresholds → behavior probs [deep]
├── Task 12: Emotional influence in AgentRuntime — bid + action selection [unspecified-high]
├── Task 13: Hybrid urgency — LLM strategy score integration [unspecified-high]

Wave 5 (Strategic Horizon — depends on Wave 4):
├── Task 14: Multi-turn planning data structures [deep]
├── Task 15: Plan execution in AgentRuntime [deep]

Wave 6 (Integration — depends on Waves 3, 5):
├── Task 16: Wire emotional + strategic state into snapshots + frontend [unspecified-high]

Final Verification Wave:
├── F1: Plan compliance audit
├── F2: Code quality + tests
├── F3: Real manual QA (all scenarios)
├── F4: Scope fidelity check
```

### Dependency Matrix
- **1–4**: — → 5–16, F1–F4
- **5**: 1, 2 → 6, 7
- **6**: 5 → 7, 10
- **7**: 4, 5, 6 → 8, 9, 11, 12
- **8–10**: 7 → F1–F4
- **11–13**: 7 → 14, 15
- **14, 15**: 11, 13 → 16
- **16**: 8, 10, 14 — → F1–F4

### Agent Dispatch Summary
- **Wave 1**: 4 agents parallel
- **Wave 2**: 3 agents parallel
- **Wave 3**: 3 agents parallel
- **Wave 4**: 3 agents parallel
- **Wave 5**: 2 agents sequential (T14 → T15)
- **Wave 6**: 1 agent
- **FINAL**: 4 review agents parallel

---

## TODOs

- [ ] 1. Snapshot Schema Audit

  **What to do**:
  - Trace `behavior_engine.get_public_state()` → `social_physics.snapshot()`, `relationship_graph.to_matrix()`, `internal_state.snapshot()` for each agent
  - Document every field returned, its type, range, and source module
  - Compare against what the system actually tracks (GoalEvolution, PrivateThought, WhisperChannel, HiddenInfo, CoalitionDetector)
  - Produce a schema reference doc: what's in public state, what's missing, what should be added
  - Specifically check if `get_state_for_llm()` has data not in `get_public_state()` (allies, rivals, trust_scores)

  **Must NOT do**:
  - Do NOT modify any source files — this is pure documentation
  - Do NOT make assumptions — verify by reading the actual `.snapshot()` / `.to_matrix()` methods

  **Recommended Agent Profile**:
  - **Category**: `explore` / research — tracing data flow across 6+ modules
  - **Skills**: none needed — pure code reading and documentation

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 3, 4)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 5 (snapshot persistence needs to know what to persist)
  - **Blocked By**: None

  **References**:
  - `backend/app/runtime/behavior_engine.py:90-93` — `get_public_state()` — this is the source
  - `backend/app/runtime/social_physics.py:109-118` — `snapshot()` — returns 6 fields + triggers
  - `backend/app/runtime/relationship_graph.py:104-117` — `to_matrix()` — NxN trust/fear/admiration/rivalry/alliance/dependency
  - `backend/app/runtime/internal_state.py:90-99` — `snapshot()` — emotion, confidence, certainty, focus, goal_priority
  - `backend/app/runtime/behavior_engine.py:80-88` — `get_state_for_llm()` — has allies, rivals, trust_scores not in public state
  - `backend/app/runtime/goal_evolution.py:88-91` — `get_active_goals()` — NOT exposed in any snapshot
  - `backend/app/runtime/private_thought.py:33-40` — `snapshot()` — NOT exposed in any snapshot
  - `backend/app/runtime/whisper.py` — `WhisperChannel` — NOT exposed
  - `backend/app/runtime/hidden_info.py` — `HiddenInformation` — NOT exposed
  - `backend/app/runtime/coalition_detection.py:51-53` — `get_active()` — NOT exposed

  **Acceptance Criteria**:
  - [ ] Document produced listing ALL fields in `get_public_state()` with types and sources
  - [ ] Document produced listing ALL fields tracked but NOT in public state with gap severity (high/medium/low)
  - [ ] Document saved to `docs/snapshot-schema.md`

  **QA Scenarios**:
  ```
  Scenario: Verify schema accuracy against actual code
    Tool: Bash (grep + read)
    Preconditions: Runtime files exist
    Steps:
      1. Read `behavior_engine.py:90-93` — verify `get_public_state()` signature
      2. Read `social_physics.py:109-118` — verify 6 fields match doc
      3. Read `relationship_graph.py:104-117` — verify NxN fields match doc
      4. Read `internal_state.py:90-99` — verify cognitive fields match doc
      5. Read `goal_evolution.py:88-91` — confirm it's NOT in public state
    Expected Result: Doc matches code exactly across all 5 modules
    Failure Indicators: Doc claims a field not in code, or misses a field that is in code
    Evidence: `.sisyphus/evidence/task-1-schema-verified.txt`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-1-schema-verified.txt`

  **Commit**: YES (with T2–T4)
  - Message: `feat(observability): add snapshot schema doc + db migration + structured logging + frontend dual-mode`
  - Files: `docs/snapshot-schema.md`

---

- [ ] 2. DB Migration — `v2_state_snapshots` Table

  **What to do**:
  - Create a new table `v2_state_snapshots` in the SQLite (and optionally Postgres) DB layer:
    ```sql
    CREATE TABLE IF NOT EXISTS v2_state_snapshots (
      id TEXT PRIMARY KEY,
      simulation_id TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (simulation_id) REFERENCES v2_simulations(id)
    );
    CREATE INDEX idx_snapshots_sim_turn ON v2_state_snapshots(simulation_id, turn_index);
    ```
  - Add `create_state_snapshot`, `get_state_snapshots_by_simulation`, `get_latest_state_snapshot`, `delete_old_snapshots` (for retention) methods to:
    - `backend/app/database/base.py` (abstract interface)
    - `backend/app/database/sqlite.py` (SQLite implementation)
    - `backend/app/database/postgres.py` (Postgres implementation, if it exists)
  - Retention: keep only the N most recent snapshots per simulation (N configurable, default 50)
  - Add a `max_snapshots_per_sim` parameter (default 50) to the config

  **Must NOT do**:
  - Do NOT alter existing `v2_turns` or `v2_simulations` tables
  - Do NOT add snapshot column — keep it as a separate table for schema evolution cleanliness

  **Recommended Agent Profile**:
  - **Category**: `quick` — focused DB schema task
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 3, 4)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 5 (needs table to write into)
  - **Blocked By**: None

  **References**:
  - `backend/app/database/base.py` — abstract interface to extend with new methods
  - `backend/app/database/sqlite.py` — SQLite implementation to follow (check existing patterns)
  - `backend/app/database/postgres.py` — Postgres implementation if it exists
  - `backend/app/models.py:168-198` — `SimulationState` model for reference on what's persisted
  - `backend/app/main.py:492-509` — `_save_turn()` pattern — follow same fire-and-forget pattern

  **Acceptance Criteria**:
  - [ ] `v2_state_snapshots` table created in SQLite
  - [ ] `create_state_snapshot()` writes a row with simulation_id, turn_index, snapshot_json, version
  - [ ] `get_state_snapshots_by_simulation()` returns ordered snapshots for a sim
  - [ ] `delete_old_snapshots()` removes snapshots beyond the N most recent
  - [ ] Retained snapshot count respects `max_snapshots_per_sim` config

  **QA Scenarios**:
  ```
  Scenario: Write and read snapshot round-trip
    Tool: Bash (sqlite3)
    Preconditions: SQLite database initialized
    Steps:
      1. sqlite3 backend/data/boardroom.db ".schema v2_state_snapshots" — verify table exists
      2. Call `create_state_snapshot('test-sim', 0, '{"test": true}', 1)` via python -c
      3. sqlite3 backend/data/boardroom.db "SELECT COUNT(*) FROM v2_state_snapshots WHERE simulation_id='test-sim'" — expect 1
    Expected Result: Row written and readable
    Failure Indicators: Table not found, write fails, read returns 0
    Evidence: `.sisyphus/evidence/task-2-db-roundtrip.txt`

  Scenario: Retention enforcement
    Tool: Bash (sqlite3 + python)
    Preconditions: DB has table, max_snapshots_per_sim=2
    Steps:
      1. Write 3 snapshots for same sim (turns 0, 1, 2)
      2. Call `delete_old_snapshots('test-sim', max_keep=2)`
      3. sqlite3 ... "SELECT COUNT(*) FROM v2_state_snapshots WHERE simulation_id='test-sim'" — expect 2
      4. sqlite3 ... "SELECT turn_index FROM v2_state_snapshots WHERE simulation_id='test-sim' ORDER BY turn_index" — expect [1, 2]
    Expected Result: Only 2 most recent retained, old ones removed
    Evidence: `.sisyphus/evidence/task-2-db-retention.txt`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-2-db-roundtrip.txt`
  - [ ] `.sisyphus/evidence/task-2-db-retention.txt`

  **Commit**: YES (with T1, T3, T4)
  - Message: `feat(observability): add snapshot schema doc + db migration + structured logging + frontend dual-mode`
  - Files: `backend/app/database/base.py`, `backend/app/database/sqlite.py`, `backend/app/database/postgres.py`

---

- [ ] 3. Structured Logging Audit + Retrofit

  **What to do**:
  - Audit all `logging.getLogger` calls in `backend/app/runtime/` (30 files) — list every log point
  - Classify each as: debug, info, warning, error — evaluate correctness
  - Add structured JSON context to key log points:
    - Turn processing: `{ "turn": N, "speaker": "X", "action_type": "Y", "simulation_id": "Z" }`
    - Agent cycle: `{ "agent": "X", "state_version": N, "bid_urgency": N }`
    - Scheduler loop: `{ "turn": N, "speaker_mode": "X", "end_condition": "Y" }`
    - LLM calls: `{ "agent": "X", "turn": N, "model": "Y", "temperature": Z, "token_count": N }`
    - Error paths: `{ "error_type": "X", "module": "Y", "simulation_id": "Z" }`
  - Use Python's `extra` parameter: `logger.info("msg", extra={"structured": data})`
  - Ensure `logging.basicConfig` or a custom formatter preserves structured data (key-value pairs at end of log line)
  - Do NOT change log levels or add noise — only add structured context to existing messages

  **Must NOT do**:
  - Do NOT add a JSON logging library — use stdlib `logging`
  - Do NOT increase log verbosity — only enrich existing messages
  - Do NOT touch frontend logging

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — requires systematic audit across 31 files
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 2, 4)
  - **Parallel Group**: Wave 1
  - **Blocks**: Nothing directly (but enables faster debugging)
  - **Blocked By**: None

  **References**:
  - `backend/app/runtime/agent.py:4-10` — existing logger setup pattern
  - `backend/app/runtime/scheduler.py:4-12` — scheduler logging pattern
  - `backend/app/runtime/simulation.py:10-12` — simulation logger
  - `backend/app/main.py:43-47` — root logging config
  - All 30 files in `backend/app/runtime/` — audit target

  **Acceptance Criteria**:
  - [ ] All 30 runtime files audited for log points
  - [ ] Audit log produced as `docs/logging-audit.md`
  - [ ] Key log points enriched with structured JSON context via `extra` parameter
  - [ ] Custom formatter preserves key=value pairs at end of each log line

  **QA Scenarios**:
  ```
  Scenario: Structured context appears in logs
    Tool: Bash (grep + python)
    Preconditions: Run a mock simulation (1 turn minimum)
    Steps:
      1. Run: `python -c "import logging; logging.basicConfig(format='%(message)s %(structured)s')"`
      2. Trigger a simulation event that produces a log
      3. grep log output for "simulation_id" or "turn"
    Expected Result: Log lines contain key=value structured context
    Failure Indicators: Logs are plain text only, no structured fields
    Evidence: `.sisyphus/evidence/task-3-structured-logs.txt`

  Scenario: No new log points added (only enriched)
    Tool: Bash (grep + diff)
    Preconditions: Before/after log point list
    Steps:
      1. Extract all `logging.getLogger` lines before: `grep -r "logging.getLogger" backend/app/runtime/ | sort > /tmp/logs-before.txt`
      2. After changes: same command → `/tmp/logs-after.txt`
      3. diff /tmp/logs-before.txt /tmp/logs-after.txt
    Expected Result: Same logger count, only file changes are `logging.info(... extra=...)` additions
    Evidence: `.sisyphus/evidence/task-3-log-count.txt`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-3-structured-logs.txt`
  - [ ] `.sisyphus/evidence/task-3-log-count.txt`

  **Commit**: YES (with T1, T2, T4)
  - Message: `feat(observability): add snapshot schema doc + db migration + structured logging + frontend dual-mode`
  - Files: `backend/app/runtime/*.py`

---

- [ ] 4. Frontend Data Layer Refactor for Dual-Mode

  **What to do**:
  - Refactor `frontend/lib/use-simulation-state.ts` to support two modes:
    - **Live mode**: consumes state_snapshot events from SSE stream (existing behavior)
    - **Replay mode**: fetches state snapshots from `GET /simulations/{id}/replay` (new)
  - The hook signature changes to:
    ```typescript
    type UseSimulationStateOptions = {
      mode: "live" | "replay";
      simulationId?: string;
      turnIndex?: number; // only in replay mode
    };
    ```
  - In replay mode, the hook should:
    - Fetch all snapshots for the simulation on mount
    - Accept a `turnIndex` parameter to select which snapshot to render
    - Return the same `SimulationStateData` shape so existing components work unchanged
  - Add `loading` and `error` states for replay data fetching
  - Export a helper `useReplayNavigation(turns: number)` hook for play/pause/step controls
  - Ensure TypeScript strictness — no `as any` casts

  **Must NOT do**:
  - Do NOT change existing component interfaces — `RosterLayout`, `TableLayout`, `GraphLayout` must work without changes
  - Do NOT break live simulation streaming

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — frontend data layer + hook architecture
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 2, 3)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7 (replay mode depends on this refactor)
  - **Blocked By**: None

  **References**:
  - `frontend/lib/use-simulation-state.ts` — the entire file, the target for refactoring
  - `frontend/components/war-room/RosterLayout.tsx` — consumer of SimulationStateData — must verify interfaces unchanged
  - `frontend/components/war-room/TableLayout.tsx` — same consumer, verify interface
  - `frontend/components/war-room/GraphLayout.tsx` — same consumer, verify interface
  - `frontend/app/simulate/[id]/page.tsx` — how the hook is currently called (lines 195, 108-158)
  - `frontend/lib/types.ts` — type definitions (check SimulationStateData export)

  **Acceptance Criteria**:
  - [ ] `useSimulationState` accepts `{ mode, simulationId, turnIndex }` options
  - [ ] In replay mode, fetches and caches all snapshots on mount
  - [ ] Returns EXACT same `SimulationStateData` shape — zero consumer changes needed
  - [ ] `useReplayNavigation` returns: `{ play, pause, stepForward, stepBack, goToTurn, isPlaying, currentTurn, totalTurns }`
  - [ ] No `as any` casts in modified code
  - [ ] TypeScript compiles: `cd frontend && npx tsc --noEmit`

  **QA Scenarios**:
  ```
  Scenario: Hook returns same shape in both modes
    Tool: Bash (npx tsc)
    Preconditions: Code compiled, no existing errors
    Steps:
      1. cd frontend && npx tsc --noEmit — baseline, expect 0 errors
      2. After refactor: same command
    Expected Result: 0 TypeScript errors — all consumers satisfied
    Failure Indicators: Type errors in consumer files (RosterLayout, etc.)
    Evidence: `.sisyphus/evidence/task-4-tsc-pass.txt`

  Scenario: Replay mode fetches snapshots
    Tool: Playwright
    Preconditions: Frontend dev server running
    Steps:
      1. Import useSimulationState with mode="replay", simulationId="test-sim"
      2. Verify `loading` is true initially, then false after data loaded
      3. Verify `snapshots` array is non-empty
    Expected Result: Hook loads data, components render from replay data
    Evidence: `.sisyphus/evidence/task-4-replay-mode.txt`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-4-tsc-pass.txt`
  - [ ] `.sisyphus/evidence/task-4-replay-mode.txt`

  **Commit**: YES (with T1, T2, T3)
  - Message: `feat(observability): add snapshot schema doc + db migration + structured logging + frontend dual-mode`
  - Files: `frontend/lib/use-simulation-state.ts`, `frontend/lib/types.ts`

---

- [ ] 5. Snapshot Persistence in Write Path

  **What to do**:
  - In `backend/app/runtime/simulation.py` (or `backend/app/main.py` where `_save_turn` lives):
    - After each turn is published AND after `behavior_engine.process_turn()` + `behavior_engine.tick()` are called
    - Call `get_public_state()` from the behavior engine
    - Save the result to `v2_state_snapshots` via DB method `create_state_snapshot()`
    - Run retention cleanup: `delete_old_snapshots()` after each write
  - The snapshot must be saved **after** the turn's state updates but **before** the next turn starts
  - Use the same fire-and-forget async pattern as `_save_turn()` in `main.py` — do NOT block the simulation loop
  - Add a `_save_state_snapshot()` helper following the same try/except/warning pattern
  - Include `snapshot_version: int = 1` in the persisted data for future schema migration

  **Must NOT do**:
  - Do NOT slow down the simulation loop — writes must be async/non-blocking
  - Do NOT include event stream events in the snapshot — only BehaviorEngine state
  - Do NOT write snapshots for system events or "done" events — only actual turns

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — requires understanding of simulation loop timing
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 1, 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6, Task 7 (replay needs persisted data)
  - **Blocked By**: Task 1 (schema audit — know what to persist), Task 2 (DB table)

  **References**:
  - `backend/app/main.py:492-509` — `_save_turn()` — follow this exact fire-and-forget pattern
  - `backend/app/runtime/simulation.py:40-63` — simulation loop — where to hook in
  - `backend/app/runtime/scheduler.py:77-83` — where `get_public_state()` is already called for SSE
  - `backend/app/runtime/behavior_engine.py:90-93` — `get_public_state()` — the data source
  - `backend/app/database/base.py` — `create_state_snapshot()` method (added in Task 2)
  - `docs/snapshot-schema.md` — from Task 1, the schema reference

  **Acceptance Criteria**:
  - [ ] State snapshot persisted for every turn (not system events)
  - [ ] Snapshot written after `process_turn()` + `tick()` — reflects the state AS OF that turn
  - [ ] Writes are async — simulation loop not blocked
  - [ ] Retention enforced after each write (N most recent kept)
  - [ ] Error in snapshot write does not crash simulation (try/except/warning)
  - [ ] Snapshot includes `snapshot_version: 1`

  **QA Scenarios**:
  ```
  Scenario: Snapshot persisted per turn
    Tool: Bash (python + sqlite3 + curl)
    Preconditions: Server running, simulation config ready
    Steps:
      1. POST /simulations with config → get simulation_id
      2. GET /simulations/{id}/stream — let simulation run 3 turns
      3. sqlite3 backend/data/boardroom.db "SELECT COUNT(DISTINCT turn_index) FROM v2_state_snapshots WHERE simulation_id='{id}'"
    Expected Result: COUNT >= 3 (one snapshot per turn)
    Failure Indicators: 0 snapshots, or snapshot count < turn count
    Evidence: `.sisyphus/evidence/task-5-snapshots-persisted.txt`

  Scenario: Failure doesn't crash sim
    Tool: Bash (python)
    Preconditions: DB in a state where write will fail (e.g. read-only mode)
    Steps:
      1. Set DB to read-only: `chmod 444 backend/data/boardroom.db`
      2. Run simulation — it should complete without crashing
      3. Check logs for warning (not error level)
    Expected Result: Simulation completes, warning logged, no crash
    Evidence: `.sisyphus/evidence/task-5-graceful-failure.txt`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-5-snapshots-persisted.txt`
  - [ ] `.sisyphus/evidence/task-5-graceful-failure.txt`

  **Commit**: YES
  - Message: `feat(observability): persist state snapshots per turn`
  - Files: `backend/app/main.py`, `backend/app/runtime/simulation.py`

---

- [ ] 6. Replay API Endpoint

  **What to do**:
  - Add FastAPI endpoint `GET /simulations/{simulation_id}/replay`
  - Returns a JSON array of all persisted state snapshots for the simulation, ordered by `turn_index`
  - Response shape:
    ```json
    {
      "simulation_id": "...",
      "total_snapshots": 42,
      "snapshots": [
        {
          "turn_index": 0,
          "snapshot_version": 1,
          "data": { ... }  // the public_state blob
        }
      ]
    }
    ```
  - Must return 404 if simulation doesn't exist
  - Must return empty array (not error) if no snapshots exist yet (simulation still running)
  - Add caching headers: `Cache-Control: public, max-age=3600` for completed simulations
  - Add `total_turns` and `last_snapshot_turn` metadata fields for frontend to plan replay

  **Must NOT do**:
  - Do NOT re-run the simulation — only read persisted data
  - Do NOT include turn content or events — only state snapshots
  - Do NOT modify existing endpoints

  **Recommended Agent Profile**:
  - **Category**: `quick` — focused API endpoint task
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5 — parallel after Wave 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7 (frontend replay needs the endpoint)
  - **Blocked By**: Task 5 (needs persisted data to serve)

  **References**:
  - `backend/app/main.py:559-622` — existing SSE stream endpoint — pattern to follow for route
  - `backend/app/main.py:625-638` — existing `GET /simulations/{id}` — pattern for error handling
  - `backend/app/database/base.py` — `get_state_snapshots_by_simulation()` method (added in Task 2)
  - `backend/app/models.py` — for response model definition (add ReplayResponse or reuse)

  **Acceptance Criteria**:
  - [ ] `GET /simulations/{id}/replay` returns 200 with array of snapshots
  - [ ] Snapshots ordered by turn_index ascending
  - [ ] 404 for non-existent simulation
  - [ ] Returns `{ "snapshots": [] }` (200, not 404) for simulation with no snapshots yet
  - [ ] Caching headers present for completed sims
  - [ ] Response includes `total_snapshots`, `total_turns`, `last_snapshot_turn` metadata

  **QA Scenarios**:
  ```
  Scenario: Replay endpoint returns persisted snapshots
    Tool: Bash (curl)
    Preconditions: Server running, a completed simulation with snapshots in DB
    Steps:
      1. curl -s http://localhost:8000/simulations/{id}/replay | python -c "import json,sys; d=json.load(sys.stdin); print(len(d['snapshots']))"
      2. Check total_snapshots matches DB count
      3. Verify first snapshot has turn_index=0 or turn_index matches earliest turn
    Expected Result: Non-empty array, ordered by turn_index
    Failure Indicators: 404, empty array for known sim, unordered results
    Evidence: `.sisyphus/evidence/task-6-replay-endpoint.txt`

  Scenario: 404 for nonexistent sim
    Tool: Bash (curl)
    Preconditions: Server running
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/simulations/nonexistent/replay
    Expected Result: 404
    Evidence: `.sisyphus/evidence/task-6-replay-404.txt`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-6-replay-endpoint.txt`
  - [ ] `.sisyphus/evidence/task-6-replay-404.txt`

  **Commit**: YES (with Task 7)
  - Message: `feat(observability): replay API and frontend replay mode`
  - Files: `backend/app/main.py`

---

- [ ] 7. Frontend Replay Mode

  **What to do**:
  - On the simulation page (`frontend/app/simulate/[id]/page.tsx`), add a **replay mode** that activates when:
    - The simulation status is `"complete"` AND
    - The SSE stream has ended (or the user navigates to a completed sim's URL)
  - In replay mode:
    - Fetch snapshots from `GET /simulations/{id}/replay`
    - Use the refactored `useSimulationState` (from Task 4) with `mode: "replay"`
    - Render the same `RosterLayout` / `TableLayout` / `GraphLayout` components — they already consume `SimulationStateData`
    - Add replay navigation controls: play, pause, step forward/back, turn slider
    - The same `ControlBar` component should work — it already has play/pause/step/speed controls
  - When replay transitions between turns:
    - Pass the correct `turn_index` to `useSimulationState`
    - All state panels (SentimentGraph, LeverageShifts, CoalitionTracker, etc.) should update to reflect that turn's snapshot
  - Add a visual indicator showing "REPLAY" vs "LIVE" mode
  - Preserve sessionStorage persistence for replay state (which turn user is on)

  **Must NOT do**:
  - Do NOT re-run the simulation engine — only serve persisted snapshots
  - Do NOT break live streaming mode — both modes must coexist
  - Do NOT change existing component implementations — only their usage

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — frontend feature work
  - **Skills**: none needed (Playwright for QA)

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6 — parallel in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8, Task 9, Task 10 (all deep debugging tools need replay working first)
  - **Blocked By**: Task 4 (refactored hook), Task 6 (API endpoint)

  **References**:
  - `frontend/app/simulate/[id]/page.tsx` — the main simulation page, where replay mode lives
  - `frontend/lib/use-simulation-state.ts` — refactored in Task 4
  - `frontend/components/ControlBar.tsx` — already has play/pause/step/speed — verify compatibility
  - `frontend/components/war-room/RosterLayout.tsx` — renders simState — verify it works with replay data
  - `frontend/components/war-room/TableLayout.tsx` — same
  - `frontend/components/war-room/GraphLayout.tsx` — same
  - `frontend/lib/api.ts` — add `fetchSimulationReplay(id)` function

  **Acceptance Criteria**:
  - [ ] Completed simulation page shows replay mode (not "start stream")
  - [ ] Replay fetches snapshots from `/replay` API
  - [ ] All state components render from replay snapshots
  - [ ] Play/pause/step/seek controls work
  - [ ] Visual indicator shows "REPLAY" vs "LIVE"
  - [ ] Switching turns updates all state panels simultaneously
  - [ ] Live streaming mode remains unchanged

  **QA Scenarios**:
  ```
  Scenario: Replay renders state visualizations
    Tool: Playwright
    Preconditions: Frontend dev server running, completed simulation exists
    Steps:
      1. Navigate to /simulate/{completed-id}
      2. Verify REPLAY indicator is visible
      3. Click "Play" — verify timeline advances
      4. Verify SentimentGraph, LeverageShifts, CoalitionTracker panels render data (not "Awaiting data")
      5. Click a specific agent — verify CognitiveStatePanel and TrustLeveragePanel show data
    Expected Result: All state panels render from replay data
    Failure Indicators: Panels show "Awaiting data", or no REPLAY indicator, or play button does nothing
    Evidence: `.sisyphus/evidence/task-7-replay-ui.png`

  Scenario: Live mode unchanged
    Tool: Playwright
    Preconditions: Frontend dev server running, create new simulation
    Steps:
      1. Navigate to /simulate/new — start a new simulation
      2. Verify live mode shows "STREAMING" or equivalent (not REPLAY)
      3. Verify turns appear in real-time as before
    Expected Result: Live mode works exactly as before the refactor
    Evidence: `.sisyphus/evidence/task-7-live-mode.png`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-7-replay-ui.png`
  - [ ] `.sisyphus/evidence/task-7-live-mode.png`

  **Commit**: YES (with Task 6)
  - Message: `feat(observability): replay API and frontend replay mode`
  - Files: `frontend/app/simulate/[id]/page.tsx`, `frontend/lib/api.ts`

---

- [ ] 8. State Diff Panel

  **What to do**:
  - Build a new component `frontend/components/war-room/StateDiffPanel.tsx`
  - It consumes `SimulationStateData` and shows per-agent aggregate changes between the current and previous turn
  - For each agent, show which of their social physics fields changed AND the delta:
    - Trust: 0.52 → 0.48 (-0.04) [red]
    - Tension: 0.3 → 0.55 (+0.25) [red]
    - Credibility: 0.5 → 0.52 (+0.02) [green]
    - Momentum: 0.0 → 0.15 (+0.15) [green]
  - Color coding: green = positive direction (trust up, tension down), red = negative direction
  - Only show changes > 0.02 threshold — filter out noise from decay
  - Include relationship changes: new alliances formed, rivalry spiked, trust shifts between specific pairs
  - Include trigger activations: "⚡ escalation_risk triggered (tension > 0.8)"
  - Collapsible per-agent sections — don't overwhelm with all 6 agents expanded
  - Place in the right sidebar of RosterLayout and TableLayout, below the existing panels
  - Must handle edge case: no previous snapshot (first turn: show all initial values)

  **Must NOT do**:
  - Do NOT show ALL 60+ dimensions per turn — only meaningful changes
  - Do NOT compute causal analysis — purely "what changed, not why"
  - Do NOT modify existing components — only add new one and wire it in

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — new frontend component
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10 — parallel in Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: Nothing
  - **Blocked By**: Task 7 (needs replay mode working to test with real data)

  **References**:
  - `frontend/lib/use-simulation-state.ts` — `SimulationStateData` shape with `snapshots` array
  - `frontend/components/war-room/SentimentGraph.tsx` — pattern to follow for data-consumption component
  - `frontend/components/war-room/CoalitionTracker.tsx` — pattern for sidebar panel
  - `frontend/components/war-room/RosterLayout.tsx:210-231` — where sidebar panels are placed
  - `frontend/lib/types.ts` — `StateSnapshotData`, `SocialPhysicsSnapshot` types

  **Acceptance Criteria**:
  - [ ] Panel shows per-agent aggregate changes between consecutive turns
  - [ ] Changes > 0.02 threshold displayed, smaller changes filtered
  - [ ] Color coding: desirable changes (trust↑, tension↓) in green, undesirable in red
  - [ ] Relationship changes shown (alliance formed, rivalry spike)
  - [ ] Trigger activations shown with ⚡ indicator
  - [ ] First turn: shows initial values as "starting state" (no diff)
  - [ ] Collapsible per-agent sections

  **QA Scenarios**:
  ```
  Scenario: Diff panel shows changes between turns
    Tool: Playwright
    Preconditions: Frontend in replay mode, at least 2 turns of snapshots loaded
    Steps:
      1. Navigate to a simulation replay at turn 0
      2. Step forward to turn 1
      3. Verify StateDiffPanel shows at least one agent with changes
      4. Verify changes are color-coded (green/red)
      5. Verify change values are labeled (e.g. "trust: +0.02")
    Expected Result: Panel shows meaningful diffs per agent
    Failure Indicators: Panel is empty, shows no changes when data exists, shows all 60 dimensions
    Evidence: `.sisyphus/evidence/task-8-diff-panel.png`

  Scenario: First turn shows initial state
    Tool: Playwright
    Preconditions: Replay mode, at turn 0 (no previous turn)
    Steps:
      1. Verify panel shows "Initial state" or equivalent for each agent
      2. Verify all 6 social physics fields displayed with starting values
    Expected Result: First turn shows baseline, not "no diff"
    Evidence: `.sisyphus/evidence/task-8-diff-initial.png`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-8-diff-panel.png`
  - [ ] `.sisyphus/evidence/task-8-diff-initial.png`

  **Commit**: YES
  - Message: `feat(observability): state diff panel per turn`
  - Files: `frontend/components/war-room/StateDiffPanel.tsx`, `frontend/components/war-room/RosterLayout.tsx`, `frontend/components/war-room/TableLayout.tsx`

---

- [ ] 9. Goal/Strategy Visibility in Agent Detail

  **What to do**:
  - Expose `GoalEvolution` and `PrivateThought` data in the agent detail page at `/personas/[slug]`
  - Backend changes:
    - In the `GET /agents/{name}/detail` endpoint (or a new endpoint), include:
      - Active goals for each simulation the agent participated in (from GoalEvolution)
      - Strategy hints per simulation (from PrivateThoughtSystem)
      - Public vs private position alignment score (from PrivateThoughtSystem's `detect_hidden_motive`)
    - Add these fields to the agent detail response
  - If GoalEvolution data isn't persisted in DB, add a `v2_agent_goals` table:
    ```sql
    CREATE TABLE IF NOT EXISTS v2_agent_goals (
      id TEXT PRIMARY KEY,
      simulation_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      goal_text TEXT NOT NULL,
      priority REAL NOT NULL,
      source TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    ```
  - Frontend changes:
    - Add a "Goals & Strategy" section to the agent detail page
    - Show active goals as a priority-sorted list with progress bars
    - Show strategy hints (truncated) per simulation
    - Show hidden motive detection score (consistency between public and private positions)
    - Add timeline view: which goals were active at which turns

  **Must NOT do**:
  - Do NOT expose private concerns or strategies publicly in the simulation UI — only in the developer detail view
  - Do NOT modify the agent runtime — only add persistence + display
  - Do NOT change the main simulation simulation page

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — backend data plumbing + frontend display
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 10 — parallel in Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: Nothing
  - **Blocked By**: Task 7 (replay mode — for testing with completed sims)

  **References**:
  - `backend/app/runtime/goal_evolution.py` — GoalEvolution class with get_active_goals()
  - `backend/app/runtime/private_thought.py` — PrivateThoughtSystem with detect_hidden_motive()
  - `backend/app/main.py:801-842` — existing agent detail endpoint — extend this
  - `frontend/app/personas/[slug]/page.tsx` — existing agent detail page — add new section
  - `frontend/app/simulate/[id]/page.tsx:183-190` — how agent state is passed to detail view
  - `frontend/lib/api.ts` — `fetchAgentDetail` function

  **Acceptance Criteria**:
  - [ ] Agent detail page shows "Goals & Strategy" section for agents with goal data
  - [ ] Goals displayed with priority score and source (initial, pressure, etc.)
  - [ ] Strategy hints shown per simulation
  - [ ] Hidden motive detection score shown (consistency metric)
  - [ ] Empty state handled gracefully when no goal data exists
  - [ ] No private concerns leaked to non-developer views

  **QA Scenarios**:
  ```
  Scenario: Agent goals visible in detail page
    Tool: Playwright
    Preconditions: Agent has participated in a simulation, goals were tracked
    Steps:
      1. Navigate to /personas/{agent-slug}
      2. Scroll to "Goals & Strategy" section
      3. Verify at least one goal is displayed with priority bar
      4. Verify source tag is shown (e.g. "initial", "pressure")
      5. Verify strategy hint is shown (truncated)
    Expected Result: Goals and strategy visible per simulation
    Failure Indicators: Section missing, empty, or goals don't match simulation data
    Evidence: `.sisyphus/evidence/task-9-goals-page.png`

  Scenario: Empty state for agent with no simulations
    Tool: Playwright
    Preconditions: New agent with no simulation history
    Steps:
      1. Navigate to /personas/{new-agent-slug}
      2. Verify "Goals & Strategy" section shows "No goal data yet" or equivalent
    Expected Result: Graceful empty state, not an error
    Evidence: `.sisyphus/evidence/task-9-goals-empty.png`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-9-goals-page.png`
  - [ ] `.sisyphus/evidence/task-9-goals-empty.png`

  **Commit**: YES
  - Message: `feat(observability): expose goals and strategy in agent detail`
  - Files: `backend/app/main.py`, `backend/app/database/base.py`, `backend/app/database/sqlite.py`, `frontend/app/personas/[slug]/page.tsx`, `frontend/lib/api.ts`

---

- [ ] 10. Simulation JSON Export

  **What to do**:
  - Add FastAPI endpoint `GET /simulations/{simulation_id}/export`
  - Returns a complete JSON dump of the simulation including:
    - `config`: the full SimulationV2Config
    - `turns`: all turn events (from DB or in-memory)
    - `state_snapshots`: all persisted state snapshots
    - `summary`: total_turns, stakeholder_count, voltage, status, duration
    - `relationships`: final relationship matrix
    - `goals`: per-agent goals from GoalEvolution (if persisted)
    - `metadata`: simulation_id, created_at, model_used, total_tokens (from PerformanceTracker)
  - Response is a single JSON file download with `Content-Disposition: attachment`
  - Add an "Export" button to the simulation page (in the control bar area):
    - Visible only when simulation is complete
    - Triggers download of the JSON file
  - Handle large simulations: if snapshots exceed 50MB (configurable), exclude snapshot data and include a warning in the response

  **Must NOT do**:
  - Do NOT include API keys, passwords, or sensitive system config
  - Do NOT block the event loop for large exports — use streaming response
  - Do NOT modify existing simulation data — read-only

  **Recommended Agent Profile**:
  - **Category**: `quick` — straightforward endpoint + download button
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9 — parallel in Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: Nothing
  - **Blocked By**: Task 7 (needs replay/snapshot infrastructure to have data to export)

  **References**:
  - `backend/app/main.py:559-622` — SSE stream — pattern for StreamingResponse
  - `backend/app/runtime/performance.py` — PerformanceTracker for total_tokens
  - `backend/app/runtime/scheduler.py:251-291` — `_make_v2_sim_state()` — state assembly pattern
  - `frontend/app/simulate/[id]/page.tsx:225-240` — ControlBar area — add Export button near here
  - `frontend/lib/api.ts` — add `exportSimulation(id)` function
  - `backend/app/models.py:278-293` — SimulationV2Config model

  **Acceptance Criteria**:
  - [ ] `GET /simulations/{id}/export` returns 200 with complete JSON
  - [ ] Response includes: config, turns, state_snapshots, summary, relationships, metadata
  - [ ] Content-Disposition header set to `attachment; filename="simulation-{id}.json"`
  - [ ] Export button visible on completed simulation page
  - [ ] Export button triggers download
  - [ ] Large simulations (>50MB snapshots) exclude snapshot body with warning

  **QA Scenarios**:
  ```
  Scenario: Export returns complete simulation data
    Tool: Bash (curl)
    Preconditions: Completed simulation exists in DB
    Steps:
      1. curl -s http://localhost:8000/simulations/{id}/export > /tmp/export.json
      2. python -c "import json; d=json.load(open('/tmp/export.json')); print(list(d.keys()))"
      3. Verify keys include: config, turns, state_snapshots, summary, relationships
      4. Verify turns array matches DB turn count
      5. Verify state_snapshots array matches DB snapshot count
    Expected Result: Complete JSON with all sections
    Failure Indicators: Missing sections, empty arrays for known data, 500 error
    Evidence: `.sisyphus/evidence/task-10-export.txt`

  Scenario: Export button in frontend
    Tool: Playwright
    Preconditions: Frontend, completed simulation
    Steps:
      1. Navigate to /simulate/{completed-id}
      2. Verify "Export" button exists (in control bar or post-sim area)
      3. Click "Export" — verify file download starts
    Expected Result: Download of simulation-{id}.json
    Failure Indicators: No button, button click errors, downloads empty file
    Evidence: `.sisyphus/evidence/task-10-export-button.png`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-10-export.txt`
  - [ ] `.sisyphus/evidence/task-10-export-button.png`

  **Commit**: YES
  - Message: `feat(observability): simulation JSON export`
  - Files: `backend/app/main.py`, `frontend/app/simulate/[id]/page.tsx`, `frontend/lib/api.ts`

---

- [ ] 11. Emotional Modulation Model

  **What to do**:
  - In `backend/app/runtime/internal_state.py`, add an `EmotionalModulation` data class that maps emotion levels to behavior probability weights:
    ```python
    @dataclass
    class EmotionalModulation:
        interrupt_bias: float = 0.0       # -1.0 to 1.0
        challenge_bias: float = 0.0
        compromise_bias: float = 0.0
        coalition_bias: float = 0.0
        escalate_bias: float = 0.0
        statement_bias: float = 0.0
        question_bias: float = 0.0
        urgency_modifier: float = 0.0     # bidding adjustment
    ```
  - Implement the emotion→modulation mapping as a pure function (no LLM, no randomness):
    ```
    if anger > 0.7:
        interrupt_bias += 0.4
        compromise_bias -= 0.3
        challenge_bias += 0.25
        urgency_modifier += 15
    if fear > 0.6:
        challenge_bias -= 0.2
        coalition_bias += 0.2
        escalate_bias -= 0.15
    if joy > 0.7:
        compromise_bias += 0.2
        statement_bias += 0.1
        urgency_modifier -= 10
    if shame > 0.6:
        interrupt_bias -= 0.2
        statement_bias -= 0.15
    ```
  - Add a `compute_modulation(emotions: dict) -> EmotionalModulation` static method
  - All thresholds and deltas must be constants (not magic numbers) at the top of the file
  - Add `modulation` field to `CognitiveState` so it's tracked in snapshots
  - Add unit tests for each emotion→behavior mapping at boundary conditions (emotion=0.69 vs 0.71)

  **Must NOT do**:
  - Do NOT use LLM for modulation — deterministic math only
  - Do NOT add randomness — same input must always produce same output
  - Do NOT modify existing InternalState API — extend only
  - Do NOT break existing emotion decay — modulation is additive on top

  **Recommended Agent Profile**:
  - **Category**: `deep` — requires understanding of InternalState + how it feeds into AgentRuntime
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 13 — Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 14 (strategic planning needs stable emotional model)
  - **Blocked By**: Task 7 (replay mode — for testing observable effects)

  **References**:
  - `backend/app/runtime/internal_state.py:28-34` — `CognitiveState` model — add modulation field here
  - `backend/app/runtime/internal_state.py:49-78` — `apply_event()` — emotion effects
  - `backend/app/runtime/internal_state.py:84-88` — `emotional_decay()` — existing decay pattern
  - `backend/app/runtime/agent.py:88-103` — `_compute_urgency()` — where modulation will be applied
  - `backend/app/runtime/agent.py:77-86` — `_should_bid()` — bidding decision point
  - `backend/app/runtime/behavior_engine.py:95-102` — `_suggest_action()` — existing threshold-based action suggestion (pattern to follow)
  - `backend/app/runtime/archetypes.py:20-63` — archetype emotion biases — modulation should interact with these
  - `backend/tests/` — add unit tests

  **Acceptance Criteria**:
  - [ ] `EmotionalModulation` dataclass with all 8 fields defined
  - [ ] `compute_modulation()` maps 5 emotions to modulation fields via deterministic thresholds
  - [ ] anger > 0.7 → interrupt_bias +0.4, compromise_bias -0.3
  - [ ] fear > 0.6 → challenge_bias -0.2, coalition_bias +0.2
  - [ ] joy > 0.7 → compromise_bias +0.2, urgency_modifier -10
  - [ ] All thresholds are named constants at module top
  - [ ] Modulation field added to `CognitiveState` model
  - [ ] Unit tests for boundary conditions (0.69 vs 0.71) pass
  - [ ] `cd backend && python -m pytest tests/ -x` — all existing tests pass

  **QA Scenarios**:
  ```
  Scenario: Anger triggers interrupt bias
    Tool: Bash (python)
    Preconditions: InternalState module importable
    Steps:
      1. python -c "from app.runtime.internal_state import EmotionalModulation, compute_modulation; m = compute_modulation({'anger': 0.8, 'fear': 0.2, 'joy': 0.3, 'shame': 0.1, 'surprise': 0.2}); print(m.interrupt_bias, m.compromise_bias, m.urgency_modifier)"
      2. Verify interrupt_bias=0.4, compromise_bias=-0.3, urgency_modifier=15
    Expected Result: Correct modulation values for high anger
    Failure Indicators: Wrong bias values, urgency_modifier not applied
    Evidence: `.sisyphus/evidence/task-11-anger-modulation.txt`

  Scenario: Boundary condition at threshold
    Tool: Bash (python)
    Preconditions: InternalState module importable
    Steps:
      1. python -c "from app.runtime.internal_state import compute_modulation; m1 = compute_modulation({'anger': 0.69, 'fear': 0.2, 'joy': 0.3, 'shame': 0.1, 'surprise': 0.2}); m2 = compute_modulation({'anger': 0.71, 'fear': 0.2, 'joy': 0.3, 'shame': 0.1, 'surprise': 0.2}); print(m1.interrupt_bias, m2.interrupt_bias)"
      2. Verify m1.interrupt_bias=0, m2.interrupt_bias=0.4
    Expected Result: Clear threshold boundary at 0.7
    Failure Indicators: No difference, or modulation applied at 0.69
    Evidence: `.sisyphus/evidence/task-11-boundary.txt`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-11-anger-modulation.txt`
  - [ ] `.sisyphus/evidence/task-11-boundary.txt`

  **Commit**: YES (with T12)
  - Message: `feat(emotion): add emotional modulation model + integrate into agent loop`
  - Files: `backend/app/runtime/internal_state.py`, `backend/app/runtime/agent.py`, `backend/tests/`

---

- [ ] 12. Emotional Influence in AgentRuntime

  **What to do**:
  - In `backend/app/runtime/agent.py`, integrate the `EmotionalModulation` into the agent's decision loop:
    - In `_compute_urgency()`: add `urgency_modifier` from modulation to the base urgency
    - In `_should_bid()`: if `interrupt_bias > 0.3`, return True more eagerly (reduce `_consecutive_events_since_bid` threshold)
    - In `_build_turn_prompt()`: append emotional state + modulation to the system prompt so the LLM can see its own emotional biases
    - Add a new method `_select_action_type(modulation: EmotionalModulation) -> str` that biases action type selection:
      - Add bias values to the allowed actions list in the LLM prompt as weighting hints
      - E.g. `"Given your emotional state, you feel more inclined to: challenge (+0.25), interrupt (+0.4)"`
  - In the scheduler (`backend/app/runtime/scheduler.py`): after processing a turn, update the modulation for the next round
  - Ensure modulation is recalculated every time emotions change (after `process_turn` → after `apply_event`)
  - Add a `modulation` field to the agent state in `get_public_state()` (via InternalState snapshot)

  **Must NOT do**:
  - Do NOT make the LLM directly compute modulation — it's deterministic
  - Do NOT hardcode emotion→action mappings in the LLM prompt — use the bias strings as hints only
  - Do NOT bypass the bidding system — modulation modifies urgency, doesn't replace it

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — agent loop integration
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 13 — Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 14 (strategic planning needs emotional context)
  - **Blocked By**: Task 7 (replay mode for debugging), Task 11 (modulation model)

  **References**:
  - `backend/app/runtime/agent.py:88-103` — `_compute_urgency()` — add urgency_modifier
  - `backend/app/runtime/agent.py:77-86` — `_should_bid()` — use interrupt_bias
  - `backend/app/runtime/agent.py:147-202` — `_build_turn_prompt()` — append emotional bias hints
  - `backend/app/runtime/agent.py:110-145` — `_build_system_prompt()` — current state injection
  - `backend/app/runtime/behavior_engine.py:90-93` — `get_public_state()` — add modulation to agent_states
  - `backend/app/runtime/behavior_engine.py:95-102` — `_suggest_action()` — pattern for threshold-based action selection

  **Acceptance Criteria**:
  - [ ] `_compute_urgency()` includes `urgency_modifier` from emotional modulation
  - [ ] `_should_bid()` has lower threshold when `interrupt_bias > 0.3`
  - [ ] `_build_turn_prompt()` includes emotional bias hints (e.g. "You feel inclined to challenge")
  - [ ] Modulation field appears in `get_public_state()` under each agent's state
  - [ ] Modulation recalculated every turn (not stale)
  - [ ] All existing tests pass

  **QA Scenarios**:
  ```
  Scenario: Urgency modified by anger
    Tool: Bash (python)
    Preconditions: AgentRuntime with behavior_engine, agent in high-anger state
    Steps:
      1. python -c "from app.runtime.agent import AgentRuntime; ... simulate high-anger event"
      2. Check urgency value before and after emotional modulation applied
    Expected Result: urgency > base when anger > 0.7 (increased by ~15)
    Failure Indicators: Urgency unchanged, or modulation not applied
    Evidence: `.sisyphus/evidence/task-12-urgency-anger.txt`

  Scenario: Action prompt includes bias hints
    Tool: Bash (python)
    Preconditions: AgentRuntime with behavior_engine
    Steps:
      1. python -c "from app.runtime.agent import AgentRuntime; ... build prompt"
      2. grep the resulting prompt for "interrupt", "challenge", "compromise" bias hints
    Expected Result: Prompt contains emotional bias language
    Failure Indicators: No bias hints in prompt
    Evidence: `.sisyphus/evidence/task-12-prompt-bias.txt`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-12-urgency-anger.txt`
  - [ ] `.sisyphus/evidence/task-12-prompt-bias.txt`

  **Commit**: YES (with T11)
  - Message: `feat(emotion): add emotional modulation model + integrate into agent loop`
  - Files: `backend/app/runtime/agent.py`, `backend/app/runtime/scheduler.py`

---

- [ ] 13. Hybrid Urgency — LLM Strategy Score

  **What to do**:
  - Add a lightweight LLM call in the agent's bidding loop to infer **strategic importance** of the current moment:
    - After `_should_bid()` returns True but before submitting the bid
    - Call the LLM with a concise prompt: "On a scale of 0-100, how strategically important is it for {agent_name} to speak RIGHT NOW? Consider: your goals, your emotional state, the current speaker, and the topic. Return only a number."
    - This must be a FAST call — use lowest possible temperature (0.1), minimal context (last 4 events only), and a timeout of 2 seconds
  - Merge deterministic urgency with LLM strategy score:
    ```python
    hybrid_urgency = int(
        deterministic_urgency * 0.6 +
        llm_strategy_score * 0.4
    )
    ```
  - Add graceful fallback: if LLM call fails or times out, use deterministic urgency only (log warning)
  - Add a `strategy_score` field to bid events so it's visible in debug panels
  - Add metrics: track how often LLM overrides deterministic urgency (score differs by >20 points)

  **Must NOT do**:
  - Do NOT let the LLM decide the final bid — it's only a weighted component (max 40%)
  - Do NOT use full agent context — only last 4 events + current state summary
  - Do NOT block the bidding loop — use `asyncio.wait_for()` with 2-second timeout
  - Do NOT call LLM for every event — only when `_should_bid()` returns True

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — LLM integration in bidding loop
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 12 — Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 14 (strategic planning builds on hybrid urgency)
  - **Blocked By**: Task 7 (replay mode for debugging)

  **References**:
  - `backend/app/runtime/agent.py:67-75` — `run()` main loop — where bidding happens
  - `backend/app/runtime/agent.py:88-103` — `_compute_urgency()` — modify this for hybrid
  - `backend/app/llm.py` — existing OpenRouter client — use with fast config
  - `backend/app/runtime/bidding_v2.py:14-30` — `BidCalculator.calculate()` — existing deterministic algorithm
  - `backend/app/runtime/agent.py:147-202` — `_build_turn_prompt()` — pattern for LLM prompt building
  - `backend/app/runtime/space.py:78-79` — `submit_bid()` — carries urgency int

  **Acceptance Criteria**:
  - [ ] LLM strategy inference prompt built and called when `_should_bid()` returns True
  - [ ] Prompt uses only last 4 events + brief state summary (not full context)
  - [ ] LLM call has 2-second timeout
  - [ ] Hybrid urgency = deterministic * 0.6 + strategy * 0.4
  - [ ] Graceful fallback: if LLM fails, use deterministic-only (warning logged)
  - [ ] `strategy_score` field in bid events
  - [ ] Metrics tracked: override rate when scores differ by >20
  - [ ] All existing tests pass

  **QA Scenarios**:
  ```
  Scenario: Hybrid urgency uses both components
    Tool: Bash (python + mock LLM)
    Preconditions: AgentRuntime with mock LLM returning strategy_score=80
    Steps:
      1. Set up agent with deterministic_urgency=50
      2. Mock LLM to return "80"
      3. Call _compute_urgency() with hybrid enabled
      4. Verify result ~= 50*0.6 + 80*0.4 = 62
    Expected Result: urgency is 62 (rounded)
    Failure Indicators: Urgency is 50 (deterministic only) or 80 (LLM only)
    Evidence: `.sisyphus/evidence/task-13-hybrid-urgency.txt`

  Scenario: Graceful fallback on LLM timeout
    Tool: Bash (python + mock LLM that hangs)
    Preconditions: AgentRuntime with mock LLM that sleeps 3s
    Steps:
      1. Set mock LLM delay to 3s (exceeds 2s timeout)
      2. Call _compute_urgency()
      3. Verify urgency equals deterministic_urgency (fallback)
      4. Check warning log for "strategy_score timeout"
    Expected Result: Fallback to deterministic, warning logged
    Failure Indicators: Simulation error, or urgency is 0
    Evidence: `.sisyphus/evidence/task-13-fallback.txt`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-13-hybrid-urgency.txt`
  - [ ] `.sisyphus/evidence/task-13-fallback.txt`

  **Commit**: YES
  - Message: `feat(urgency): add hybrid bidding with LLM strategy score`
  - Files: `backend/app/runtime/agent.py`, `backend/app/runtime/bidding_v2.py`

---

- [ ] 14. Multi-Turn Planning Data Structures

  **What to do**:
  - Create a new file `backend/app/runtime/strategic_plan.py` with the following data structures:
    ```python
    @dataclass
    class SubGoal:
        id: str
        description: str           # "weaken CFO credibility"
        strategy_hint: str         # "question their financial projections publicly"
        turn_target: int           # expected turn to complete by
        priority: float            # 0-1
        dependencies: list[str]    # subgoal IDs that must complete first
        status: str                # "pending" | "in_progress" | "completed" | "failed"
        progress: float            # 0-1

    @dataclass
    class Plan:
        id: str
        agent_id: str
        goal_text: str             # "push the vote in my favor"
        created_turn: int
        subgoals: list[SubGoal]
        status: str                # "active" | "completed" | "abandoned"
        confidence: float          # 0-1
    ```
  - Build `PlanManager` class with:
    - `create_plan(agent_id, goal_text, subgoals) -> Plan`
    - `advance_subgoal(plan_id, subgoal_id) -> None` — mark subgoal complete, advance progress
    - `get_active_plans(agent_id) -> list[Plan]`
    - `abandon_plan(plan_id) -> None` — for when circumstances change
    - `evaluate_plan_progress(plan_id, turn_index) -> float` — how well is the plan progressing?
    - `serialize() -> dict` and `deserialize(data) -> PlanManager` — for snapshot persistence
  - Integrate with the existing `GoalEvolution` system:
    - When GoalEvolution adds a new goal (e.g., "rebuild_trust" from trigger), PlanManager can auto-create a plan for it
    - When a plan completes, reinforce the associated goal in GoalEvolution

  **Must NOT do**:
  - Do NOT add LLM calls in PlanManager — plan creation is data-driven (goals + triggers)
  - Do NOT make plans aware of other agents' plans — no mind-reading (yet)
  - Do NOT store plans in the event stream — they're agent-internal state

  **Recommended Agent Profile**:
  - **Category**: `deep` — new module, architecture-sensitive
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential with T15)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 15 (plan execution), Task 16 (integration)
  - **Blocked By**: Task 11 (emotional model feeds into plan priorities), Task 13 (hybrid urgency feeds into plan confidence)

  **References**:
  - `backend/app/runtime/goal_evolution.py:8-19` — `GoalState` model — pattern for Plan/SubGoal
  - `backend/app/runtime/goal_evolution.py:22-28` — `TRIGGER_GOAL_MAP` — triggers that create plans
  - `backend/app/runtime/private_thought.py:7-15` — `StrategicThought` — complementary to plans
  - `backend/app/runtime/behavior_engine.py:95-102` — `_suggest_action()` — where plans could influence
  - `backend/app/runtime/agent.py:57-75` — `run()` main loop — where plan execution hooks in

  **Acceptance Criteria**:
  - [ ] `strategic_plan.py` created with `SubGoal`, `Plan`, `PlanManager` classes
  - [ ] `create_plan()` creates a plan with subgoals from a goal text
  - [ ] `advance_subgoal()` marks subgoal complete, calculates progress
  - [ ] `get_active_plans()` returns only active (not completed/abandoned) plans
  - [ ] `serialize()/deserialize()` round-trips correctly
  - [ ] PlanManager integrates with GoalEvolution: trigger-based goal → auto-plan creation
  - [ ] Unit tests for plan lifecycle (create → advance → complete)
  - [ ] All existing tests pass

  **QA Scenarios**:
  ```
  Scenario: Plan lifecycle (create → advance → complete)
    Tool: Bash (python)
    Preconditions: PlanManager importable
    Steps:
      1. python -c "
    from app.runtime.strategic_plan import PlanManager, SubGoal
    pm = PlanManager()
    plan = pm.create_plan('agent-1', 'win the vote', [
        SubGoal(id='sg1', description='weaken CFO', strategy_hint='question projections', turn_target=3, priority=0.8, dependencies=[], status='pending', progress=0.0),
        SubGoal(id='sg2', description='isolate legal', strategy_hint='ally with CEO', turn_target=5, priority=0.6, dependencies=['sg1'], status='pending', progress=0.0),
    ])
    pm.advance_subgoal(plan.id, 'sg1')
    active = pm.get_active_plans('agent-1')
    print(len(active), active[0].progress)
    "
      2. Verify 1 active plan, progress > 0 and < 1 (partially complete)
    Expected Result: Plan lifecycle works — subgoal advancement updates progress
    Failure Indicators: Plan not created, subgoal not advanced, progress wrong
    Evidence: `.sisyphus/evidence/task-14-plan-lifecycle.txt`

  Scenario: Serialization round-trip
    Tool: Bash (python)
    Preconditions: PlanManager with active plans
    Steps:
      1. python -c "
    from app.runtime.strategic_plan import PlanManager, SubGoal
    pm1 = PlanManager()
    pm1.create_plan('agent-1', 'test', [SubGoal(id='sg1', description='test', strategy_hint='', turn_target=1, priority=0.5, dependencies=[], status='pending', progress=0.0)])
    data = pm1.serialize()
    pm2 = PlanManager.deserialize(data)
    print(len(pm2.get_active_plans('agent-1')))
    "
      2. Verify serialized then deserialized produces same plan count
    Expected Result: 1 active plan after round-trip
    Failure Indicators: 0 plans after deserialize, or error
    Evidence: `.sisyphus/evidence/task-14-serialize.txt`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-14-plan-lifecycle.txt`
  - [ ] `.sisyphus/evidence/task-14-serialize.txt`

  **Commit**: YES (with T15)
  - Message: `feat(strategy): add multi-turn planning system with subgoal execution`
  - Files: `backend/app/runtime/strategic_plan.py`, `backend/app/runtime/goal_evolution.py`

---

- [ ] 15. Plan Execution in AgentRuntime

  **What to do**:
  - In `backend/app/runtime/agent.py`, integrate `PlanManager` into the agent's main loop:
    - After `_generate_turn()`: evaluate current plan progress
    - Before `_build_turn_prompt()`: inject current plan context into the LLM's system prompt
      - "Your current plan: win the vote (confidence 0.8). Active subgoal: weaken CFO credibility (question their financial projections publicly). Progress: 1/3 subgoals complete."
    - After each turn: call `advance_subgoal()` or `abandon_plan()` based on how the turn went
    - When a trigger fires (from behavior_engine): if it maps to a known goal, create a plan automatically via PlanManager
  - Add a simple plan evaluation heuristic:
    - If `turn.action_type == "challenge"` and target is the current subgoal's target → subgoal making progress
    - If `turn.action_type == "compromise"` on a key position → subgoal might be failing
    - If `social_physics.dominance > 0.7` for the agent → they're gaining ground, advance plan
    - If `social_physics.credibility < 0.2` for the agent → they're losing, may need to abandon plan
  - Add `get_plan_summary(agent_id) -> str` that produces a concise text for LLM injection
  - Ensure plans persist in behavior_engine's public state (serialized) for observability

  **Must NOT do**:
  - Do NOT let plans dictate exact actions — they only provide context and hints
  - Do NOT create plans that reference other agents' private state
  - Do NOT let plan execution slow down turn generation — plan evaluation is O(1) per turn
  - Do NOT persist plans across simulations — they reset with each simulation

  **Recommended Agent Profile**:
  - **Category**: `deep` — agent loop integration, requires careful design
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential, depends on T14)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 16 (integration with observability)
  - **Blocked By**: Task 14 (plan data structures)

  **References**:
  - `backend/app/runtime/agent.py:57-75` — `run()` main loop — hook plan evaluation here
  - `backend/app/runtime/agent.py:110-145` — `_build_system_prompt()` — inject plan summary here
  - `backend/app/runtime/agent.py:147-202` — `_build_turn_prompt()` — add plan context to user message
  - `backend/app/runtime/agent.py:206-257` — `_generate_turn()` — evaluate plan after turn
  - `backend/app/runtime/behavior_engine.py:95-102` — `_suggest_action()` — use plan context here
  - `backend/app/runtime/behavior_engine.py:80-88` — `get_state_for_llm()` — add plans to state
  - `backend/app/runtime/behavior_engine.py:90-93` — `get_public_state()` — add plans to public state

  **Acceptance Criteria**:
  - [ ] Plan summary injected into LLM system prompt before each turn
  - [ ] Turn outcome evaluated against active subgoals
  - [ ] Trigger-based plans auto-created (e.g., trust_collapse → "rebuild_trust" plan)
  - [ ] Plan progress updated after each turn
  - [ ] Plans appear in `get_public_state()` (serialized)
  - [ ] Plans appear in `get_state_for_llm()` for the agent's own use
  - [ ] `get_plan_summary()` produces concise text (under 200 chars)
  - [ ] All existing tests pass

  **QA Scenarios**:
  ```
  Scenario: Plan context in LLM prompt
    Tool: Bash (python)
    Preconditions: AgentRuntime with active plans
    Steps:
      1. Create plan for agent: goal="win vote", subgoal="weaken CFO"
      2. Call _build_system_prompt()
      3. grep output for "plan", "win vote", "weaken CFO"
    Expected Result: Prompt contains "Current plan: win vote", "Active subgoal: weaken CFO"
    Failure Indicators: No plan context in prompt
    Evidence: `.sisyphus/evidence/task-15-plan-prompt.txt`

  Scenario: Trigger creates plan automatically
    Tool: Bash (python)
    Preconditions: BehaviorEngine with GoalEvolution + PlanManager
    Steps:
      1. Simulate trust_collapse trigger for agent
      2. Check PlanManager.get_active_plans(agent_id)
      3. Verify a plan with goal_text="rebuild_trust" exists
    Expected Result: Plan auto-created from trigger-goal mapping
    Failure Indicators: No plan created, or plan has wrong goal
    Evidence: `.sisyphus/evidence/task-15-trigger-plan.txt`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-15-plan-prompt.txt`
  - [ ] `.sisyphus/evidence/task-15-trigger-plan.txt`

  **Commit**: YES (with T14)
  - Message: `feat(strategy): add multi-turn planning system with subgoal execution`
  - Files: `backend/app/runtime/agent.py`, `backend/app/runtime/behavior_engine.py`

---

- [ ] 16. Wire Emotional + Strategic State into Snapshots + Frontend

  **What to do**:
  - In `backend/app/runtime/behavior_engine.py`:
    - Add emotional modulation data to `get_public_state()` (under each agent's `agent_states`)
    - Add active plans data (serialized) to `get_public_state()`
    - Add hybrid urgency's strategy_score to per-agent state
  - In `frontend/components/war-room/`:
    - Add a new panel `EmotionalInfluencePanel.tsx` that shows current modulation biases for the speaking agent:
      - interrupt_bias, challenge_bias, compromise_bias, coalition_bias, escalate_bias
      - Visual: horizontal bars for each bias (positive=right/green, negative=left/red)
      - Show which emotions are driving the biases (anger→+interrupt, fear→-challenge)
    - Add a new panel `StrategicPlanPanel.tsx` that shows the current agent's active plans:
      - Plan goal text + confidence
      - Subgoal list with status indicators (pending/in_progress/completed)
      - Progress bar
    - Add hybrid urgency breakdown to the existing `CognitiveStatePanel` or `TrustLeveragePanel`:
      - Show deterministic base, strategy_score, and blended urgency
  - Wire both new panels into `RosterLayout.tsx` sidebar (below existing panels)
  - Wire `StrategicPlanPanel` into agent detail page (`/personas/[slug]`)
  - Update `use-simulation-state.ts` to surface modulation and plan data from snapshots

  **Must NOT do**:
  - Do NOT add new API endpoints — surface via existing snapshot/proxy data
  - Do NOT modify existing panels — only add new ones
  - Do NOT show raw internal state to non-developer views — keep in war room debug panels

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — backend snapshot wiring + frontend display
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Waves 3 and 5 complete)
  - **Parallel Group**: Wave 6
  - **Blocks**: Nothing (final integration)
  - **Blocked By**: Tasks 8, 10 (observability panels), Task 14 (plans data)

  **References**:
  - `backend/app/runtime/behavior_engine.py:90-93` — `get_public_state()` — extend with modulation + plans
  - `backend/app/runtime/internal_state.py` — modulation field added in T11
  - `backend/app/runtime/strategic_plan.py` — PlanManager.serialize() for plans
  - `frontend/lib/use-simulation-state.ts` — surface new fields in SimulationStateData
  - `frontend/components/war-room/RosterLayout.tsx:210-231` — sidebar panel placement
  - `frontend/components/war-room/SentimentGraph.tsx` — pattern for data panel
  - `frontend/app/personas/[slug]/page.tsx` — agent detail page
  - `frontend/lib/types.ts` — add types for modulation + plan data

  **Acceptance Criteria**:
  - [ ] `get_public_state()` includes `agent_states[agent].modulation` with all 8 bias fields
  - [ ] `get_public_state()` includes `agent_states[agent].active_plans` with serialized plans
  - [ ] `EmotionalInfluencePanel` shows bias bars for current speaker
  - [ ] `EmotionalInfluencePanel` shows emotion→bias source mapping
  - [ ] `StrategicPlanPanel` shows plan goal, subgoals, progress
  - [ ] Hybrid urgency breakdown visible in existing panels
  - [ ] Both new panels render in RosterLayout and TableLayout sidebars
  - [ ] All existing tests pass

  **QA Scenarios**:
  ```
  Scenario: EmotionalInfluencePanel renders bias bars
    Tool: Playwright
    Preconditions: Frontend dev server, simulation with modulation data
    Steps:
      1. Navigate to running simulation
      2. Look for "Emotional Influence" panel in sidebar
      3. Verify interrupt_bias, challenge_bias, etc. shown as horizontal bars
      4. Verify emotion sources listed (e.g., "anger → +0.4 interrupt")
    Expected Result: Panel shows modulation biases with source emotions
    Failure Indicators: Panel missing, empty, shows no data
    Evidence: `.sisyphus/evidence/task-16-influence-panel.png`

  Scenario: StrategicPlanPanel shows active plans
    Tool: Playwright
    Preconditions: Frontend dev server, agent with active plans
    Steps:
      1. Navigate to simulation where agent has plans
      2. Look for "Strategic Plan" panel in sidebar
      3. Verify plan goal text displayed
      4. Verify subgoal list with status indicators
      5. Verify progress bar
    Expected Result: Panel shows plan with subgoals and progress
    Failure Indicators: Panel missing, shows "No active plans" when plans exist
    Evidence: `.sisyphus/evidence/task-16-plan-panel.png`
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-16-influence-panel.png`
  - [ ] `.sisyphus/evidence/task-16-plan-panel.png`

  **Commit**: YES
  - Message: `feat(observability): wire emotional and strategic state into snapshots and frontend`
  - Files: `backend/app/runtime/behavior_engine.py`, `frontend/lib/use-simulation-state.ts`, `frontend/components/war-room/EmotionalInfluencePanel.tsx`, `frontend/components/war-room/StrategicPlanPanel.tsx`, `frontend/components/war-room/RosterLayout.tsx`, `frontend/app/personas/[slug]/page.tsx`, `frontend/lib/types.ts`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE.
> Wait for user's explicit approval before marking work complete.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `pytest`, check for `as any`/`@ts-ignore`, empty catches, `console.log` in prod, AI slop.
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Execute EVERY QA scenario from EVERY task. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy
- T1–T4: `feat(observability): add snapshot schema + logging + db migration + frontend dual-mode`
- T5: `feat(observability): persist state snapshots per turn`
- T6–T7: `feat(observability): replay API and frontend replay mode`
- T8: `feat(observability): state diff panel per turn`
- T9: `feat(observability): expose goals and strategy in agent detail`
- T10: `feat(observability): simulation JSON export`
- T11–T12: `feat(emotion): add emotional modulation model + integrate into agent loop`
- T13: `feat(urgency): add hybrid bidding with LLM strategy score`
- T14–T15: `feat(strategy): add multi-turn planning system with subgoal execution`
- T16: `feat(observability): wire emotional and strategic state into snapshots and frontend`

---

## Success Criteria

### Verification Commands
```bash
# Observability
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/simulations/{id}/replay | grep -q 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/simulations/{id}/export | grep -q 200
sqlite3 backend/data/boardroom.db "SELECT COUNT(*) FROM v2_state_snapshots" # > 0

# Emotional Chain
python -c "from app.runtime.internal_state import compute_modulation; m = compute_modulation({'anger':0.8,'fear':0.2,'joy':0.3,'shame':0.1,'surprise':0.2}); assert m.interrupt_bias == 0.4; print('OK')"

# Hybrid Urgency
python -c "from app.runtime.bidding_v2 import BidCalculator; bc = BidCalculator(); assert bc.hybrid_urgency(50, 80) == 62; print('OK')"

# Strategic Planning
python -c "from app.runtime.strategic_plan import PlanManager, SubGoal; pm = PlanManager(); pm.create_plan('a1', 'test', [SubGoal('sg1','t','',1,0.5,[],'pending',0.0)]); assert len(pm.get_active_plans('a1')) == 1; print('OK')"
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All evidence files in `.sisyphus/evidence/`
- [ ] User gave explicit approval after F1-F4
