# Analytics Overhaul — Full Dashboard Build

## TL;DR

> **Objective**: Transform minimal analytics page into a comprehensive analytics dashboard with 8 data-rich sections, force-directed relationship graph, and authoritative visual design.
>
> **Deliverables**:
> - `GET /analytics/dashboard` backend endpoint with full aggregation
> - `backend/app/analytics/aggregator.py` — standalone aggregation module
> - 8 analytics UI components under `frontend/components/analytics/`
> - Rewritten `frontend/app/analytics/page.tsx`
> - Updated types + API client
>
> **Estimated Effort**: Large (16 tasks + 4 verification)
> **Parallel Execution**: YES — 4 waves, 8 simultaneous build tasks in Wave 2
> **Critical Path**: Backend endpoint → Types → Section components → Page orchestration → Polish

---

## Context

### Original Request
"Make analytics page a full blown analysis, look into DB, full charts full reports very impressive analytics. For UI use /impeccable."

### Interview Summary
**User confirmed**:
- **Scope**: ALL 8 sections (full sweep — no phasing)
- **Backend**: Single comprehensive `GET /analytics/dashboard` endpoint
- **DB**: Data exists in PostgreSQL (simulations with state_snapshots, turns, postmortems)
- **Guardrails**: No real-time/polling, no export/download, no filtering bar (MVP)
- **Backward compat**: Existing `GET /simulations/analytics` endpoint unchanged

**Design register**: Product (dashboard — serves the task)
**Palette**: Warm parchment + coral (existing CSS vars), no new tokens
**Typography**: Inter for UI (one family), Playfair Display for page title only (per product register)
**Strategy**: Restrained color — coral for data emphasis, chart colors from existing --chart-* vars

### Metis Review
**Gaps addressed**:
- Data volume: Backend aggregates at server side. Postmortem social_dynamics arcs used instead of raw state_snapshots for line charts. Only latest snapshot loaded per sim for relationship matrix.
- Scope creep: Guardrails explicitly exclude filtering bar, real-time, export. Backward compat enforced.
- Performance: Max 6 DB queries per load. Turns aggregated in Python (no content/reasoning fields shipped). Snapshot sampling where needed.

---

## Work Objectives

### Core Objective
Transform the analytics page into a comprehensive, data-rich dashboard that visualizes all simulation dimensions — social dynamics, agent behavior, emotions, outcomes, relationships, and temporal patterns — using the existing warm-parchment design system.

### Concrete Deliverables
- `backend/app/analytics/aggregator.py` — aggregation module
- `GET /analytics/dashboard` route in main.py
- `frontend/lib/types.ts` — `DashboardAnalytics` type + 8 sub-types
- `frontend/lib/api.ts` — `fetchAnalyticsDashboard()` client fn
- 8 components under `frontend/components/analytics/`
- Rewritten `frontend/app/analytics/page.tsx`

### Must Have
- All 8 sections render real data from DB (not mock/placeholder)
- Backend aggregates server-side — no raw snapshot JSON shipped to client
- Existing `GET /simulations/analytics` endpoint NOT modified
- Empty states per section when data is absent (not page-level)
- Loading skeleton per section
- Error state with retry per section
- Responsive: 320px, 768px, 1440px

### Must NOT Have
- No real-time/polling/SSE for analytics
- No export/download (CSV/PDF)
- No filtering bar (date range, status, voltage — future)
- No GSAP or scroll-triggered animations (recharts built-in anim is sufficient)
- No new color tokens — use existing CSS `--chart-*` vars
- No dark mode (not in scope)
- No modifying existing analytics endpoint contract

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification agent-executed via curl + Playwright.

### Test Decision
- **Infrastructure exists**: YES (jest for backend, manual for frontend)
- **Automated tests**: None (backend tested via curl, frontend via Playwright browser)
- **Agent QA**: curl endpoint + Playwright browser screenshots

### QA Policy
- **Backend**: curl to `GET /analytics/dashboard` → assert 200 + response shape
- **Frontend**: Playwright navigates to `/analytics` → screenshots each section at 1440px and 768px
- **Evidence**: `.omo/evidence/task-N-*.{png,json}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 4 parallel):
├── Task 1: Backend aggregator module + endpoint [deep]
├── Task 2: Frontend types + API client [quick]
├── Task 3: Analytics component scaffold + CSS [quick]
└── Task 4: Page skeleton with loading/error/empty states [quick]

Wave 2 (8 parallel frontend sections — all depend on Wave 1):
├── Task 5: KPI Hero section [quick]
├── Task 6: Social Dynamics section (trust/tension/leverage arcs) [unspecified-high]
├── Task 7: Agent Intelligence section [unspecified-high]
├── Task 8: Action Distribution section (stacked bars + heatmap) [unspecified-high]
├── Task 9: Relationship Network section (force graph) [visual-engineering]
├── Task 10: Emotional Analytics section [unspecified-high]
├── Task 11: Simulation Outcomes section [unspecified-high]
└── Task 12: Temporal Timeline section [unspecified-high]

Wave 3 (Integration — 2 parallel):
├── Task 13: Page orchestration + data wiring [deep]
└── Task 14: Impeccable design polish pass [visual-engineering]

Wave FINAL (4 parallel reviews):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real manual QA [unspecified-high + playwright]
└── Task F4: Scope fidelity check [deep]
```

### Dependency Matrix
- **1-4**: - - 5-12 (Wave 1 → all Wave 2)
- **5-12**: 1, 2, 3 - 13, 14 (types + endpoint + scaffold → sections)
- **13, 14**: 5-12 - F1-F4 (all sections → integration + polish)
- **F1-F4**: 13, 14 - user okay (reviews → user sign-off)

### Agent Dispatch Summary
- Wave 1: 1 deep + 3 quick agents (linear: backend first, then types, then scaffold, then skeleton)
- Wave 2: 8 agents parallel (1 quick + 6 unspecified-high + 1 visual-engineering)
- Wave 3: 2 agents parallel (1 deep + 1 visual-engineering)
- Wave FINAL: 4 parallel (1 oracle + 1 unspecified-high + 1 unspecified-high+playwright + 1 deep)

---

## TODOs

- [x] 1. **Backend: aggregation module + dashboard endpoint**

  **What to do**:
  - Create `backend/app/analytics/aggregator.py` with a `DashboardAggregator` class that:
    - Loads all simulations (basic fields: id, subject_name, status, voltage, total_turns, total_participants, created_at, model_temperature)
    - Loads all simulation_participants (name, role, stance, turn_count, persona_id, simulation_id)
    - Loads all postmortems (simulation_id, postmortem_json → extract social_dynamics arcs, stakeholder_reports, key_moments, topics, termination)
    - Loads all turns (action_type, stance, emotional_state, participant_id, simulation_id — NOT content/reasoning for perf)
    - Loads latest state_snapshot per simulation (for relationship_matrix)
    - Loads all agent_goals
  - Aggregate into structured dicts for all 8 sections:
    - **kpi**: total_simulations, total_turns, avg_voltage, avg_participants, completion_rate, total_postmortems, sims_per_month trend
    - **social_dynamics**: trust_arcs (per-sim arrays of {turn, value}), tension_arcs, leverage_arcs, peak_tension_summary, dominant_agent_frequency
    - **agent_intelligence**: per-agent cross-sim aggregation (total_sims, total_turns, avg_turn_count, stance_distribution, stances array)
    - **action_distribution**: total counts by action_type, per-simulation breakdown, action_type_by_stance
    - **relationship_network**: nodes (unique agent names), edges (avg trust/fear/rivalry between pairs from latest snapshots)
    - **emotional_analytics**: avg emotion score per emotion type across all turns, per-simulation emotion trajectory
    - **simulation_outcomes**: status breakdown, voltage distribution, avg_turns_per_status, model_temp vs outcomes
    - **temporal_timeline**: key moments aggregated from postmortems sorted by turn, topic mentions from postmortem topics
  - Add `GET /analytics/dashboard` route to `backend/app/main.py` that calls aggregator
  - Create `backend/app/analytics/__init__.py` with barrel import

  **Must NOT do**:
  - Do NOT modify existing `GET /simulations/analytics` endpoint
  - Do NOT ship raw content/reasoning fields from turns table
  - Do NOT load ALL state_snapshots — only latest per sim
  - Do NOT block >500ms with 100 sims in DB

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex multi-table aggregation with performance considerations
  - **Skills**: none required (pure Python/Prisma/FastAPI)
  - **Skills Evaluated but Omitted**:
    - `python`: Task IS pure Python — no domain-specific skill needed beyond general capability

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential with other Wave 2 tasks via dependency)
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5-12 (all frontend sections need backend to test)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `backend/app/main.py:1041-1091` — Existing analytics endpoint pattern (GET route, db calls, dict return)
  - `backend/app/database/prisma.py:507-527` — `list_simulations_v2()` method pattern
  - `backend/app/database/prisma.py:470-505` — `get_turns_by_simulation()` pattern
  - `backend/app/database/base.py:106-119` — State snapshot DB methods signature
  - `backend/prisma/schema.prisma` — Complete schema for all tables
  - `backend/app/models.py:444-455` — `SocialDynamicsSummary` model with trust_arc/tension_arc/leverage_arc
  - `backend/app/models.py:485-528` — `Postmortem` model with all nested fields
  - `frontend/lib/types.ts:494-500` — Current `SimulationAnalytics` type (backward compat reference)

  **Acceptance Criteria**:
  - [ ] `curl http://localhost:8000/analytics/dashboard` returns 200
  - [ ] Response contains all 8 top-level keys: kpi, social_dynamics, agent_intelligence, action_distribution, relationship_network, emotional_analytics, simulation_outcomes, temporal_timeline
  - [ ] Response time < 500ms with 100 simulations in DB
  - [ ] Existing `GET /simulations/analytics` still returns 200 with same shape
  - [ ] Empty DB returns all sections with empty arrays/zero values (no crashes)

  **QA Scenarios**:
  ```
  Scenario: Dashboard endpoint returns full payload
    Tool: Bash (curl)
    Preconditions: Backend running on :8000
    Steps:
      1. curl -s http://localhost:8000/analytics/dashboard
      2. pipe through python3 -m json.tool to validate JSON
      3. assert that keys match expected 8-section shape
    Expected Result: 200 with json object containing all 8 analytics sections
    Evidence: .omo/evidence/task-1-dashboard-response.json

  Scenario: Empty DB gracefully handled
    Tool: Bash (curl)
    Preconditions: DB has no simulation data
    Steps:
      1. curl -s http://localhost:8000/analytics/dashboard
      2. assert kpi.total_simulations is 0
      3. assert social_dynamics.trust_arcs is empty array
    Expected Result: Valid JSON with zeros/empty arrays, no 500 error
    Evidence: .omo/evidence/task-1-empty-db.json
  ```

  **Evidence to Capture**:
  - [ ] task-1-dashboard-response.json
  - [ ] task-1-empty-db.json (if DB empty, otherwise skip)

  **Commit**: YES (groups with none — standalone)
  - Message: `feat(analytics): add GET /analytics/dashboard endpoint with full aggregation`
  - Files: `backend/app/analytics/__init__.py`, `backend/app/analytics/aggregator.py`, `backend/app/main.py`
  - Pre-commit: `PYTHONPATH=backend python -c "from app.analytics.aggregator import DashboardAggregator; print('import ok')"`

---

- [x] 2. **Frontend: types + API client additions**

  **What to do**:
  - Add `DashboardAnalytics` type to `frontend/lib/types.ts` with sub-types:
    - `KpiOverview` — total_simulations, total_turns, avg_voltage, avg_participants, completion_rate, total_postmortems, sims_per_month[]
    - `SocialDynamicsData` — trust_arcs[], tension_arcs[], leverage_arcs[], peak_tension_summary, dominant_agent_frequency
    - `AgentIntelligenceData` — agents[] (each with name, total_sims, total_turns, avg_turn_count, stances[])
    - `ActionDistributionData` — total_by_type Record<string,number>, per_simulation[], by_stance
    - `RelationshipNetworkData` — nodes[] ({id, name, sim_count}), edges[] ({source, target, trust, fear, rivalry})
    - `EmotionalAnalyticsData` — emotion_distribution Record<string,number>, trajectory[]
    - `SimulationOutcomesData` — status_breakdown{}, voltage_distribution[], avg_turns_per_status{}
    - `TemporalTimelineData` — moments[] ({turn, kind, description, actors, simulation_id, subject_name})
  - Add `fetchAnalyticsDashboard()` to `frontend/lib/api.ts` that calls `GET /analytics/dashboard`
  - Ensure backward compat: existing types unchanged

  **Must NOT do**:
  - Do NOT remove or modify existing types used by other pages
  - Do NOT add type fields that don't match the backend response shape

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions + one API function. No UI logic.
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5-12 (all section components depend on types)
  - **Blocked By**: None (types are front-of-frontend concern)

  **References**:
  - `frontend/lib/types.ts:494-500` — Current SimulationAnalytics type (format reference)
  - `frontend/lib/types.ts:195-206` — SocialDynamicsSummary type (data model to mirror)
  - `frontend/lib/types.ts:433-481` — RelationshipEntry, SocialPhysicsSnapshot, AgentStateSnapshot, StateSnapshotData (snapshot field reference)
  - `frontend/lib/api.ts:364-365` — Existing fetchSimulationAnalytics pattern

  **Acceptance Criteria**:
  - [ ] Types file compiles: `cd frontend && npx tsc --noEmit` passes
  - [ ] API client function exists and returns typed DashboardAnalytics
  - [ ] No type errors in any file importing from types.ts

  **QA Scenarios**:
  ```
  Scenario: Types compile cleanly
    Tool: Bash
    Preconditions: Frontend deps installed
    Steps:
      1. cd frontend && npx tsc --noEmit
    Expected Result: Exit code 0, no type errors
    Evidence: .omo/evidence/task-2-tsc-pass.txt

  Scenario: API client works end-to-end
    Tool: Bash (curl)
    Preconditions: Backend has analytics endpoint
    Steps:
      1. Verify fetchAnalyticsDashboard is exported from api.ts
    Expected Result: Import path is correct, no unresolved references
    Evidence: .omo/evidence/task-2-api-client.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-tsc-pass.txt
  - [ ] task-2-api-client.txt

  **Commit**: YES (groups with none — standalone)
  - Message: `feat(analytics): add DashboardAnalytics types and API client`
  - Files: `frontend/lib/types.ts`, `frontend/lib/api.ts`
  - Pre-commit: `cd frontend && npx tsc --noEmit`

---

- [x] 3. **Frontend: analytics component scaffold + CSS**

  **What to do**:
  - Create `frontend/components/analytics/` directory
  - Create barrel export `frontend/components/analytics/index.ts`
  - Create empty component files for all 8 sections (tasks 5-12 will fill):
    - `KpiHero.tsx`
    - `SocialDynamics.tsx`
    - `AgentIntelligence.tsx`
    - `ActionDistribution.tsx`
    - `RelationshipNetwork.tsx`
    - `EmotionalAnalytics.tsx`
    - `SimulationOutcomes.tsx`
    - `TemporalTimeline.tsx`
  - Each component gets a minimal shell: `export function XxxSection({ data }: { data: XxxData }) { return <section>...</section> }`
  - Add analytics-specific CSS to `frontend/app/globals.css` (in Tailwind v4 theme) or a analytics.css:
    - Section card styles
    - Chart container responsive rules
    - Empty state styling

  **Must NOT do**:
  - No implementation logic in any component — just import/exports
  - No chart imports

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File scaffolding + CSS only. No logic, no charts.
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5-12 (section impl needs scaffold files to exist)
  - **Blocked By**: None (pure file creation)

  **References**:
  - `frontend/components/AppShell.tsx` — Component patterns used in project
  - `frontend/app/globals.css` — Existing CSS var system to extend
  - `frontend/app/analytics/page.tsx:112-115` — Current page structure pattern

  **Acceptance Criteria**:
  - [ ] All 8 component files exist in `frontend/components/analytics/`
  - [ ] Barrel export allows `import { KpiHeroSection, SocialDynamicsSection, ... } from "@/components/analytics"`
  - [ ] `cd frontend && npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Component scaffold compiles
    Tool: Bash
    Preconditions: Frontend deps installed
    Steps:
      1. cd frontend && npx tsc --noEmit
    Expected Result: Exit 0, no errors from new components
    Evidence: .omo/evidence/task-3-scaffold-compile.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-scaffold-compile.txt

  **Commit**: YES (groups with none — standalone)
  - Message: `feat(analytics): scaffold component directory + CSS`
  - Files: `frontend/components/analytics/*`, `frontend/app/globals.css`
  - Pre-commit: `cd frontend && npx tsc --noEmit`

---

- [x] 4. **Frontend: analytics page skeleton with states**

  **What to do**:
  - Rewrite `frontend/app/analytics/page.tsx` with:
    - Fetch `fetchAnalyticsDashboard()` on mount via useEffect
    - Loading state: skeleton placeholder per section (shimmer cards)
    - Error state: error banner with retry button
    - Empty state: "No simulations yet" with CTA link to `/simulate/new`
    - Data state: render all 8 sections (import from scaffold, pass data props)
    - Section grid layout: responsive 1-col/2-col using CSS grid
    - Page heading with title + subtitle + last-refreshed timestamp
  - Wire up section components with their specific data slices

  **Must NOT do**:
  - No section-specific implementation (tasks 5-12 handle that)
  - Just the orchestration, loading/error/empty states, and layout

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard React pattern — fetch, states, layout wiring
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (but benefits from types in Task 2)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 13 (final orchestration will complete this)
  - **Blocked By**: Task 2 (needs DashboardAnalytics type) and Task 3 (needs component scaffold)

  **References**:
  - `frontend/app/analytics/page.tsx` — Current version (full rewrite)
  - `frontend/app/page.tsx` — Existing page patterns
  - `frontend/app/simulate/page.tsx` — Another list page for state pattern reference

  **Acceptance Criteria**:
  - [ ] Page renders loading skeletons immediately
  - [ ] On data load: all 8 sections visible in responsive grid
  - [ ] On error: error banner with "Retry" button
  - [ ] On empty: "No simulations yet" with CTA
  - [ ] `cd frontend && npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Loading state renders skeleton shimmer
    Tool: Playwright
    Preconditions: Frontend on :3000, slow network
    Steps:
      1. Navigate to /analytics
      2. Assert skeleton shimmer elements visible (use .anim-shimmer class)
    Expected Result: Page shows loading placeholders before data renders
    Evidence: .omo/evidence/task-4-loading-state.png

  Scenario: Empty state shows CTA
    Tool: Playwright
    Preconditions: Backend returns empty analytics (no sims)
    Steps:
      1. Navigate to /analytics
      2. Assert "No simulations yet" text visible
      3. Assert "Start a Simulation" link exists with href="/simulate/new"
    Expected Result: Empty state with helpful CTA
    Evidence: .omo/evidence/task-4-empty-state.png
  ```

  **Evidence to Capture**:
  - [ ] task-4-loading-state.png
  - [ ] task-4-empty-state.png

  **Commit**: YES (groups with none — standalone)
  - Message: `feat(analytics): rewrite page skeleton with loading/error/empty states`
  - Files: `frontend/app/analytics/page.tsx`
  - Pre-commit: `cd frontend && npx tsc --noEmit`

---

- [x] 5. **KPI Hero section component**

  **What to do**:
  - Implement `KpiHero.tsx` with 6 stat cards in a responsive 3x2 / 2x3 / 6x1 grid:
    - Total Simulations (with trend arrow vs previous period)
    - Total Turns (formatted with K/M suffix)
    - Avg Voltage (with color-coded badge: <40 cool, 40-60 neutral, >60 hot)
    - Avg Participants per simulation
    - Completion Rate (% complete/total, with progress bar)
    - Postmortems generated (count + percentage of completed)
  - Each card: big number, label, optional small trend indicator
  - Import from `@/components/analytics`
  - Use existing `--color-chart-*` vars for accents

  **Must NOT do**:
  - No hero-metric-template pattern (big number + small label + gradient — banned by impeccable)
  - No gradient text

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure stat cards — no charts, no complex logic
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6-12)
  - **Blocks**: Task 13 (page orchestration)
  - **Blocked By**: Tasks 2, 3 (types + scaffold)

  **References**:
  - `frontend/app/analytics/page.tsx:121-146` — Current card pattern (reference for style, redesign for quality)
  - Product register reference: Restrained color, system fonts, predictable grids

  **Acceptance Criteria**:
  - [ ] 6 stat cards render in responsive grid
  - [ ] All values formatted correctly (commas, K/M, %)
  - [ ] Voltage badge color-coded
  - [ ] `cd frontend && npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: KPI cards render with real data
    Tool: Playwright
    Preconditions: Backend has simulation data, frontend at /analytics
    Steps:
      1. Navigate to /analytics
      2. Assert 6 stat cards visible in grid
      3. Assert all numbers are numeric (not NaN or empty)
      4. Screenshot the KPI hero section
    Expected Result: 6 cards with formatted values, responsive grid
    Evidence: .omo/evidence/task-5-kpi-hero.png
  ```

  **Evidence to Capture**:
  - [ ] task-5-kpi-hero.png

  **Commit**: YES
  - Message: `feat(analytics): add KPI Hero section`
  - Files: `frontend/components/analytics/KpiHero.tsx`

---

- [x] 6. **Social Dynamics section component**

  **What to do**:
  - Implement `SocialDynamics.tsx` with:
    - Trust arc: Recharts `AreaChart` with gradient fill across all sims (multi-line, one color per sim or aggregate avg)
    - Tension arc: Line chart with red/orange gradient — highlight peak tension point
    - Leverage arc: Area chart showing leverage distribution across turn index
    - Summary stat bar: avg_trust, avg_tension, peak_tension, dominant_agent
    - Toggle to show individual sim lines vs aggregate average
  - Data from `social_dynamics.trust_arcs / tension_arcs / leverage_arcs`
  - Recharts `ResponsiveContainer` for all charts
  - Custom tooltip showing sim name + turn + value

  **Must NOT do**:
  - No react-force-graph here (that's Task 9)
  - No raw state_snapshot processing — use postmortem arc data

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-chart section with data transformation and toggle logic
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7-12)
  - **Blocks**: Task 13 (page orchestration)
  - **Blocked By**: Tasks 2, 3 (types + scaffold)

  **References**:
  - `frontend/app/analytics/page.tsx:149-208` — Existing recharts usage pattern (BarChart, PieChart)
  - Recharts docs: AreaChart, LineChart, ResponsiveContainer, Tooltip, Legend
  - `backend/app/models.py:444-455` — SocialDynamicsSummary model (data shape)

  **Acceptance Criteria**:
  - [ ] Trust, tension, leverage arcs render as Recharts charts
  - [ ] Toggle between aggregate and per-sim view works
  - [ ] Peak tension point highlighted
  - [ ] Summary stats bar renders below charts
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Social dynamics charts render with data
    Tool: Playwright
    Preconditions: Backend returns social_dynamics data
    Steps:
      1. Navigate to /analytics
      2. Assert trust arc chart is visible (svg element with .recharts-area)
      3. Assert tension arc chart is visible
      4. Assert leverage arc chart is visible
      5. Assert summary stats are numeric
      6. Screenshot the section
    Expected Result: 3 line/area charts with data, stat bar below
    Evidence: .omo/evidence/task-6-social-dynamics.png

  Scenario: Empty arcs show flat line with annotation
    Tool: Playwright
    Preconditions: Postmortems exist but have empty arc arrays
    Steps:
      1. Navigate to /analytics
      2. Assert "No social dynamics data" message for empty arcs
    Expected Result: Graceful empty state per chart
    Evidence: .omo/evidence/task-6-empty-arcs.png
  ```

  **Evidence to Capture**:
  - [ ] task-6-social-dynamics.png
  - [ ] task-6-empty-arcs.png

  **Commit**: YES
  - Message: `feat(analytics): add Social Dynamics section`
  - Files: `frontend/components/analytics/SocialDynamics.tsx`

---

- [x] 7. **Agent Intelligence section component**

  **What to do**:
  - Implement `AgentIntelligence.tsx` with:
    - Top agents table: name, role, total_sims, total_turns, avg_turn_count, stances (as badges)
    - Row-level horizontal bar chart showing stance distribution per agent
    - Search/filter input for agent name
    - Sortable columns (click header to sort)
  - Data from `agent_intelligence.agents[]`
  - Recharts `BarChart` horizontal per-agent stance breakdown
  - Stance badges colored: champion=teal, detractor=coral, neutral=muted, moderators=blue, wildcard=amber

  **Must NOT do**:
  - No drill-down to agent detail page (explicit scope exclusion)
  - No infinite scroll (paginate at 20 rows)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Data table with sort + search + embedded bar charts
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8-12)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 2, 3

  **References**:
  - `frontend/app/analytics/page.tsx:216-241` — Current list item pattern
  - Existing component patterns in `frontend/components/`

  **Acceptance Criteria**:
  - [ ] Agent table renders with all columns
  - [ ] Search filters agents by name
  - [ ] Column sorting works (at least by total_sims, total_turns)
  - [ ] Stance badges use correct colors
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Agent intelligence table renders
    Tool: Playwright
    Preconditions: Backend returns agent_intelligence data
    Steps:
      1. Navigate to /analytics
      2. Assert agent table visible with at least 1 row
      3. Assert each row shows name, role, sim count, stance badges
      4. Screenshot the section
    Expected Result: Sortable table with agent performance data
    Evidence: .omo/evidence/task-7-agent-intel.png
  ```

  **Evidence to Capture**:
  - [ ] task-7-agent-intel.png

  **Commit**: YES
  - Message: `feat(analytics): add Agent Intelligence section`
  - Files: `frontend/components/analytics/AgentIntelligence.tsx`

---

- [x] 8. **Action Distribution section component**

  **What to do**:
  - Implement `ActionDistribution.tsx` with:
    - Total action type breakdown: Recharts `PieChart` with all 9 action types as segments
    - Per-simulation stacked bar chart: `BarChart` with X=sim name, Y=count, stacked by action type
    - Action type vs stance heatmap: matrix of action_type × stance with count
  - Data from `action_distribution.total_by_type`, `.per_simulation[]`, `.by_stance`
  - Existing stance colors for charts
  - Legend for action types

  **Must NOT do**:
  - No re-exporting from existing stance distribution section (page will have one overall stance chart)
  - No interactive filtering

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-chart composite with heatmap matrix
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-7, 9-12)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 2, 3

  **References**:
  - `frontend/app/analytics/page.tsx:175-208` — Existing PieChart usage pattern
  - Recharts docs: Stacked BarChart, PieChart with multiple segments

  **Acceptance Criteria**:
  - [ ] Action type pie chart renders with all 9 segments
  - [ ] Per-sim stacked bar chart renders
  - [ ] Action-stance heatmap renders as matrix
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Action distribution charts render
    Tool: Playwright
    Preconditions: Backend returns action_distribution data
    Steps:
      1. Navigate to /analytics
      2. Assert pie chart visible with action type segments
      3. Assert stacked bar chart visible with per-sim breakdown
      4. Assert heatmap matrix visible
      5. Screenshot
    Expected Result: 3 visualizations showing how agents act
    Evidence: .omo/evidence/task-8-action-dist.png
  ```

  **Evidence to Capture**:
  - [ ] task-8-action-dist.png

  **Commit**: YES
  - Message: `feat(analytics): add Action Distribution section`
  - Files: `frontend/components/analytics/ActionDistribution.tsx`

---

- [x] 9. **Relationship Network section component**

  **What to do**:
  - Implement `RelationshipNetwork.tsx` with:
    - Force-directed graph using `react-force-graph-2d`
    - Nodes = agents (size by sim_count, color by avg trust level)
    - Edges = relationships (thickness by trust, color by valence: green=high trust, red=high rivalry)
    - Hover tooltip: agent name + sims participated + avg trust/fear/rivalry
    - Zoom + pan enabled
    - Fallback: static SVG if force graph doesn't have data (empty state)
  - Data from `relationship_network.nodes[]` and `.edges[]`
  - Container with explicit width/height for force graph canvas
  - Responsive: resize graph on container width change

  **Must NOT do**:
  - No 3D force graph (2D only — lighter render)
  - No animation beyond default force simulation
  - No drag physics customization (react-force-graph-2d defaults are fine)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Canvas-based force-directed graph visualization
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-8, 10-12)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 2, 3

  **References**:
  - `react-force-graph-2d` docs: `ForceGraph2D` component, `graphData`, `nodeLabel`, `linkColor`
  - `frontend/app/layout.tsx` — Package already loaded globally
  - D3-force layout for force simulation (bundled with react-force-graph-2d)

  **Acceptance Criteria**:
  - [ ] Force graph renders with nodes and edges
  - [ ] Node size correlates to simulation count
  - [ ] Edge color reflects trust vs rivalry
  - [ ] Hover tooltip shows agent details
  - [ ] Zoom + pan work
  - [ ] Empty state shows "No relationship data" message
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Relationship force graph renders
    Tool: Playwright
    Preconditions: Backend returns relationship_network data with >=2 agents
    Steps:
      1. Navigate to /analytics
      2. Assert canvas element visible with nodes
      3. Hover over a node (if Playwright supports)
      4. Screenshot the graph
    Expected Result: Force-directed graph with connected nodes
    Evidence: .omo/evidence/task-9-force-graph.png

  Scenario: Empty graph state
    Tool: Playwright
    Preconditions: Only 1 or 0 agents (no edges possible)
    Steps:
      1. Navigate to /analytics
      2. Assert "No relationship data" message
    Expected Result: Graceful empty state, not a blank canvas
    Evidence: .omo/evidence/task-9-empty-graph.png
  ```

  **Evidence to Capture**:
  - [ ] task-9-force-graph.png
  - [ ] task-9-empty-graph.png

  **Commit**: YES
  - Message: `feat(analytics): add Relationship Network force graph`
  - Files: `frontend/components/analytics/RelationshipNetwork.tsx`

---

- [x] 10. **Emotional Analytics section component**

  **What to do**:
  - Implement `EmotionalAnalytics.tsx` with:
    - Emotion distribution: Recharts `RadarChart` showing avg levels of anger, fear, joy, shame, surprise across all sims
    - Per-simulation emotion trajectory: `LineChart` with 5 emotion lines over turn index
    - Dominant emotion breakdown: `PieChart` showing which emotion dominates most frequently
    - Color map: anger=coral, fear=amber, joy=teal, shame=purple, surprise=blue
  - Data from `emotional_analytics.emotion_distribution`, `.trajectory[]`
  - Recharts RadarChart, LineChart, PieChart

  **Must NOT do**:
  - No GSAP animation for chart entrance
  - No redundant emotion chart (each chart shows different dimension)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-chart section with radar + line + pie
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-9, 11, 12)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 2, 3

  **References**:
  - Recharts docs: RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
  - `frontend/app/analytics/page.tsx:175-208` — Existing PieChart pattern
  - `backend/app/runtime/internal_state.py` — Emotion model reference (5 emotions)

  **Acceptance Criteria**:
  - [ ] Radar chart renders with 5 emotion axes
  - [ ] Emotion trajectory line chart renders (5 lines)
  - [ ] Dominant emotion pie chart renders
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Emotional analytics charts render
    Tool: Playwright
    Preconditions: Backend returns emotional_analytics data
    Steps:
      1. Navigate to /analytics
      2. Assert radar chart visible with 5 axes
      3. Assert trajectory line chart visible
      4. Assert dominant emotion pie visible
      5. Screenshot
    Expected Result: 3 charts showing emotional landscape
    Evidence: .omo/evidence/task-10-emotional.png
  ```

  **Evidence to Capture**:
  - [ ] task-10-emotional.png

  **Commit**: YES
  - Message: `feat(analytics): add Emotional Analytics section`
  - Files: `frontend/components/analytics/EmotionalAnalytics.tsx`

---

- [x] 11. **Simulation Outcomes section component**

  **What to do**:
  - Implement `SimulationOutcomes.tsx` with:
    - Status breakdown: Recharts `PieChart` — idle vs running vs complete
    - Voltage distribution: `BarChart` — histogram of voltage ranges (0-20, 21-40, 41-60, 61-80, 81-100)
    - Avg turns per status: horizontal `BarChart`
    - Model temperature vs outcomes: grouped bar chart comparing stable vs volatile sims by outcome
    - Voltage vs turns scatter: `ScatterChart` — each dot is a simulation
  - Data from `simulation_outcomes.*`
  - Recharts ScatterChart, grouped BarChart

  **Must NOT do**:
  - No correlation analysis (too complex for MVP)
  - No predictive analytics

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple chart types including scatter plot
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-10, 12)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 2, 3

  **References**:
  - Recharts docs: ScatterChart, Scatter, BarChart with grouped bars
  - `backend/app/models.py:178-208` — SimulationState model (voltage, status fields)

  **Acceptance Criteria**:
  - [ ] Status pie chart renders
  - [ ] Voltage histogram renders
  - [ ] Scatter chart (voltage vs turns) renders
  - [ ] Model temp comparison renders
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Outcomes charts render
    Tool: Playwright
    Preconditions: Backend returns simulation_outcomes data
    Steps:
      1. Navigate to /analytics
      2. Assert status breakdown chart visible
      3. Assert voltage scatter chart visible
      4. Assert model temp comparison visible
      5. Screenshot
    Expected Result: Charts showing outcome patterns
    Evidence: .omo/evidence/task-11-outcomes.png
  ```

  **Evidence to Capture**:
  - [ ] task-11-outcomes.png

  **Commit**: YES
  - Message: `feat(analytics): add Simulation Outcomes section`
  - Files: `frontend/components/analytics/SimulationOutcomes.tsx`

---

- [x] 12. **Temporal Timeline section component**

  **What to do**:
  - Implement `TemporalTimeline.tsx` with:
    - Vertical timeline: chronological list of key moments across all sims
    - Each moment: turn number, simulation name (linked), kind badge (proposal/coalition/challenge/etc.), description, actors
    - Kind badges color-coded (proposal=blue, coalition=teal, challenge=coral, compromise=green, etc.)
    - Topic frequency sidebar/bar: count of mentions per topic from postmortem topics
    - Collapsible per-simulation sections within the timeline
  - Data from `temporal_timeline.moments[]`
  - Pure CSS timeline (no chart lib — vertical layout)

  **Must NOT do**:
  - No horizontal timeline (poor readability for many moments)
  - No GSAP scroll animation
  - No infinite scroll (show all, capped at 100 moments)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Timeline layout with grouping, badges, links
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-11)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 2, 3

  **References**:
  - `frontend/app/simulate/[id]/postmortem/page.tsx` — Postmortem page for key moment display pattern
  - `backend/app/models.py:410-418` — KeyMoment model (turn, kind, description, actors)

  **Acceptance Criteria**:
  - [ ] Vertical timeline renders with moments grouped by simulation
  - [ ] Kind badges color-coded correctly
  - [ ] Each moment shows turn number, description, actors
  - [ ] Simulation names link to `/simulate/{id}`
  - [ ] Topic frequency bar renders
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Timeline renders key moments
    Tool: Playwright
    Preconditions: Backend returns temporal_timeline data with moments
    Steps:
      1. Navigate to /analytics
      2. Assert vertical timeline visible
      3. Assert at least one moment with simulation name link
      4. Assert kind badge visible
      5. Screenshot
    Expected Result: Chronological timeline of key events
    Evidence: .omo/evidence/task-12-timeline.png
  ```

  **Evidence to Capture**:
  - [ ] task-12-timeline.png

  **Commit**: YES
  - Message: `feat(analytics): add Temporal Timeline section`
  - Files: `frontend/components/analytics/TemporalTimeline.tsx`

---

- [x] 13. **Page orchestration + data wiring**

  **What to do**:
  - Complete `frontend/app/analytics/page.tsx`:
    - Wire up all 8 section components with their data slices from `DashboardAnalytics`
    - Add scroll-to-top on data change
    - Add last-refreshed timestamp display
    - Add manual refresh button
    - Page layout: section headers with anchor links, responsive grid
    - Final type checking pass
  - Remove any remaining placeholder/prop-passing stubs
  - Ensure all sections compose correctly together (no layout breaks)

  **Must NOT do**:
  - No new features — just integration of existing sections
  - No changing component APIs (props are already defined)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Integration of 8 independent components into cohesive page
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 14 — design polish is independent)
  - **Parallel Group**: Wave 3 (with Task 14)
  - **Blocks**: F1-F4 (all final verification)
  - **Blocked By**: Tasks 5-12 (all 8 sections must be ready)

  **References**:
  - `frontend/app/analytics/page.tsx` — Current file (full rewrite)
  - `frontend/app/page.tsx` — Home page layout patterns

  **Acceptance Criteria**:
  - [ ] All 8 sections render with correct data
  - [ ] Manual refresh button works
  - [ ] Scroll-to-top works on data change
  - [ ] Responsive at 320px, 768px, 1440px
  - [ ] `cd frontend && npx tsc --noEmit` passes
  - [ ] `cd frontend && npm run build` passes

  **QA Scenarios**:
  ```
  Scenario: Full dashboard renders end-to-end
    Tool: Playwright
    Preconditions: Backend running with data, frontend at :3000
    Steps:
      1. Navigate to /analytics
      2. Wait for all sections to render
      3. Assert page title "Analytics" visible
      4. Assert all 8 sections have non-empty content
      5. Assert no console errors
      6. Full-page screenshot at 1440px
    Expected Result: Complete analytics dashboard with all sections
    Evidence: .omo/evidence/task-13-full-page-1440.png

  Scenario: Responsive at 768px
    Tool: Playwright
    Preconditions: Same as above
    Steps:
      1. Set viewport to 768px wide
      2. Navigate to /analytics
      3. Assert sections stack vertically (single column)
      4. Screenshot
    Expected Result: Single-column layout works, no overflow
    Evidence: .omo/evidence/task-13-responsive-768.png
  ```

  **Evidence to Capture**:
  - [ ] task-13-full-page-1440.png
  - [ ] task-13-responsive-768.png

  **Commit**: YES
  - Message: `feat(analytics): final page orchestration + data wiring`
  - Files: `frontend/app/analytics/page.tsx`
  - Pre-commit: `cd frontend && npx tsc --noEmit && npm run build`

---

- [x] 14. **Impeccable design polish pass**

  **What to do**:
  - Apply impeccable product register standards across the entire analytics page:
    - Typography audit: ensure Inter (UI) and Playfair Display (title only) hierarchy is correct
    - Color audit: ensure chart colors use existing `--chart-*` CSS vars, no new tokens
    - Spacing audit: consistent section spacing, card padding, grid gaps
    - State audit: all interactive elements have hover/focus-visible/active states
    - Layout audit: predictable grid, no cards-inside-cards, no nested-card anti-pattern
    - Empty state audit: each section handles empty data gracefully
    - Skeleton audit: loading states match final layout dimensions (no layout shift)
    - Motion audit: recharts built-in animation only — no GSAP, no layout-animating properties
    - Responsive audit: test 320px, 768px, 1440px
    - Accessibility: heading hierarchy (h1→h2→h3), aria-labels on interactive chart elements
    - Ban check: no side-stripe borders, no gradient text, no identical card grids, no hero-metric template
  - Fix any issues found
  - Read full screenshot and verify visually

  **Must NOT do**:
  - No structural changes to components
  - No adding new design tokens or CSS vars

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Design quality audit + visual polish
  - **Skills**: none required

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 13 — polish can run on built components)
  - **Parallel Group**: Wave 3 (with Task 13)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5-12 (all sections must be implemented)

  **References**:
  - Impeccable product register: Restrained color, system fonts, predictable grids, no decorative motion
  - Product bans: no decorative motion, no inconsistent component vocabulary, no display fonts in labels
  - Shared bans: no side-stripe borders, no gradient text, no glassmorphism, no hero-metric template
  - `frontend/app/globals.css` — Existing CSS var system
  - `PRODUCT.md` — Design principles, brand personality, anti-references

  **Acceptance Criteria**:
  - [ ] No side-stripe borders anywhere
  - [ ] No gradient text anywhere
  - [ ] No identical card grids (vary card content layout across sections)
  - [ ] Chart colors use `--chart-*` CSS vars
  - [ ] All interactive elements have hover + focus-visible states
  - [ ] No layout shift between loading and loaded states
  - [ ] Lighthouse accessibility score ≥90
  - [ ] `cd frontend && npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Design audit pass
    Tool: Playwright
    Preconditions: Frontend at /analytics with data
    Steps:
      1. Navigate to /analytics
      2. Check no side-stripe borders visible (CSS audit via computed styles)
      3. Check no gradient-background-clip:text usage
      4. Check responsive at 1440px, 768px, 320px
      5. Full page screenshots at all 3 breakpoints
    Expected Result: Clean, authoritative design meeting product register standards
    Evidence: .omo/evidence/task-14-audit-1440.png
    Evidence: .omo/evidence/task-14-audit-768.png
    Evidence: .omo/evidence/task-14-audit-320.png
  ```

  **Evidence to Capture**:
  - [ ] task-14-audit-1440.png
  - [ ] task-14-audit-768.png
  - [ ] task-14-audit-320.png

  **Commit**: YES
  - Message: `style(analytics): impeccable design polish pass`
  - Files: all analytics components + page + CSS
  - Pre-commit: `cd frontend && npx tsc --noEmit`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (curl endpoint, run frontend build, check file existence). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.omo/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `cd frontend && npx tsc --noEmit`, `cd frontend && npm run build`, check for: `any` casts, `@ts-ignore`, empty catches, console.log, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-section integration (page as whole, not isolated components). Test edge cases: empty state, error state, loading state. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `feat(analytics): add GET /analytics/dashboard endpoint with full aggregation` - backend/app/analytics/*, backend/app/main.py
- **2**: `feat(analytics): add DashboardAnalytics types and API client` - frontend/lib/types.ts, frontend/lib/api.ts
- **3**: `feat(analytics): scaffold component directory + CSS` - frontend/components/analytics/*, frontend/app/globals.css
- **4**: `feat(analytics): rewrite page skeleton with loading/error/empty states` - frontend/app/analytics/page.tsx
- **5**: `feat(analytics): add KPI Hero section` - frontend/components/analytics/KpiHero.tsx
- **6**: `feat(analytics): add Social Dynamics section` - frontend/components/analytics/SocialDynamics.tsx
- **7**: `feat(analytics): add Agent Intelligence section` - frontend/components/analytics/AgentIntelligence.tsx
- **8**: `feat(analytics): add Action Distribution section` - frontend/components/analytics/ActionDistribution.tsx
- **9**: `feat(analytics): add Relationship Network force graph` - frontend/components/analytics/RelationshipNetwork.tsx
- **10**: `feat(analytics): add Emotional Analytics section` - frontend/components/analytics/EmotionalAnalytics.tsx
- **11**: `feat(analytics): add Simulation Outcomes section` - frontend/components/analytics/SimulationOutcomes.tsx
- **12**: `feat(analytics): add Temporal Timeline section` - frontend/components/analytics/TemporalTimeline.tsx
- **13**: `feat(analytics): final page orchestration + data wiring` - frontend/app/analytics/page.tsx
- **14**: `style(analytics): impeccable design polish pass` - frontend/app/analytics/page.tsx, frontend/components/analytics/*, frontend/app/globals.css

## Success Criteria

### Verification Commands
```bash
curl -s http://localhost:8000/analytics/dashboard | python3 -m json.tool  # Returns 8-section dashboard
cd frontend && npx tsc --noEmit  # No type errors
cd frontend && npm run build  # Production build succeeds
```

### Final Checklist
- [ ] All 8 sections render real data
- [ ] Backend responds <500ms
- [ ] Existing analytics endpoint unchanged
- [ ] Loading/error/empty states work
- [ ] Responsive at 320px, 768px, 1440px
- [ ] Design passes impeccable product register standards

