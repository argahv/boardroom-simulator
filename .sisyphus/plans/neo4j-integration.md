# Neo4j Integration — Boardroom Simulator

## TL;DR

> **Quick Summary**: Add Neo4j as a third storage layer (alongside Postgres + ChromaDB) to persist trust edges, coalition signals, interrupt chains, and influence relationships. Enrich the existing postmortem endpoint with 5 graph-powered analytics queries.
>
> **Deliverables**:
> - `backend/app/graph/` module: Neo4j driver, repository, schema bootstrap
> - `backend/app/graph/writer.py`: idempotent per-turn graph writes
> - `update_dynamics` node in `workflow.py` calls writer (fire-and-forget, non-blocking)
> - Postmortem enriched with 5 Cypher queries (hostile pairs, influence chain, coalition evolution, interrupt replay, cross-sim patterns)
> - `docker-compose.yml` gains `neo4j` service
> - Integration test: 2-agent, 2-turn deterministic mini-sim asserts exact graph state
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (driver) → T2 (schema) → T4 (writer) → T5 (workflow wiring) → T6 (postmortem queries)

---

## Context

### Original Request
Integrate Neo4j to persist trust matrix, coalition signals, interrupt chains, and influence propagation — enabling graph-powered postmortem analytics.

### Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Storage model** | Latest-state only (MERGE, overwrite per turn) | O(agents²) edges max. Simple queries. No cardinality explosion. |
| **Failure semantics** | Log + continue | Neo4j is analytics, not core path. Sim never blocked by graph write failures. |
| **Deployment** | Docker Compose | Local dev + CI friendly. Zero cloud cost. |
| **Backfill** | None — v1 forward-only | Simpler. Existing data stays in Postgres. |
| **Source of truth** | Postgres = canonical sim records. Neo4j = derived analytics graph. | Neo4j can be wiped and rebuilt; Postgres cannot. |
| **Write point** | `update_dynamics` node only | Single integration point. No scattered writes. |
| **Read point** | Postmortem endpoint only | Analytics decoupled from hot simulation path. |

### Postmortem Queries Requested (all 5)
1. **Hostile pair detection** — lowest mutual trust pairs at sim end
2. **Influence chain** — who triggered the most downstream position shifts
3. **Coalition evolution** — coalitions formed/strengthened/fractured by turn
4. **Interrupt chain replay** — structured replay with bid scores and interrupt types
5. **Cross-sim patterns** — which agent tags most often precede deadlock across all sims

### Metis Review — Gaps Addressed
- **ID strategy**: `agent_id` (Stakeholder UUID from Postgres), `simulation_id` (UUID), `turn_id` (int). Every node/relationship scoped to `simulation_id`.
- **Idempotent writes**: all writes use `MERGE` + uniqueness constraints. Re-running same turn = no duplicates.
- **Failure contract**: `GraphWriter` wraps all writes in try/except; failures append to `state["event_log"]` with `[GRAPH_WARN]` prefix; turn continues normally.
- **Graph scoping**: every `MATCH` query includes `simulation_id` filter. No cross-sim contamination.
- **Sim deletion**: `DELETE /simulations/{id}` (if added) SHOULD clean Neo4j subgraph. Out of scope for v1 — flagged as follow-up.
- **Schema versioning**: `GraphSchema` class has `SCHEMA_VERSION = "v1"` stored in a `(:SchemaVersion)` node. Detectable at boot.
- **Interrupt ordering**: `seq` property on `INTERRUPTED` relationships within a turn (0, 1, 2…).

---

## Work Objectives

### Core Objective
Add Neo4j as a fire-and-forget analytics graph layer. Every negotiation turn writes trust/coalition/interrupt/influence edges. The postmortem endpoint gains 5 Cypher-backed analytics sections. Zero impact on simulation hot path.

### Concrete Deliverables
- `backend/app/graph/__init__.py`
- `backend/app/graph/driver.py` — singleton Neo4j async driver
- `backend/app/graph/schema.py` — constraints, indexes, schema bootstrap
- `backend/app/graph/writer.py` — idempotent per-turn writer
- `backend/app/graph/queries.py` — 5 postmortem Cypher queries
- `backend/app/workflow.py` — `update_dynamics` calls `GraphWriter.write_turn()`
- `backend/app/main.py` — postmortem endpoint enriched with graph analytics
- `backend/app/models.py` — `GraphAnalytics` model added to `Postmortem`
- `docker-compose.yml` — `neo4j` service added
- `backend/tests/test_neo4j_integration.py` — integration test
- `backend/app/config.py` — `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` env vars

### Definition of Done
- [ ] `python -m py_compile` passes all app files
- [ ] `docker compose up neo4j` starts cleanly, port 7474 (HTTP) and 7687 (Bolt) reachable
- [ ] `GET /health` returns `{"neo4j": "ok"}` when connected, `{"neo4j": "degraded"}` when not
- [ ] `POST /simulations/{id}/postmortem` response includes `graph_analytics` object with all 5 sections
- [ ] Integration test asserts exact graph state after deterministic mini-sim
- [ ] Neo4j writes are non-blocking — simulation never returns a 5xx due to Neo4j failure

### Must Have
- Idempotent `MERGE`-based writes (re-running same turn = no duplicates)
- Every Cypher query scoped by `simulation_id`
- `GraphWriter` failure never raises to the simulation caller
- `NEO4J_URI` defaults to `bolt://localhost:7687` (works with Docker Compose)
- Uniqueness constraint on `(:Agent {simulation_id, agent_id})`

### Must NOT Have (Guardrails)
- **No Neo4j reads in hot path** — no graph queries inside `generate_turn`, `update_dynamics`, or `advance_turn`
- **No replacement of Postgres** — stakeholders, simulations, turns still live in Postgres
- **No replacement of ChromaDB** — semantic memory stays in Chroma
- **No new product endpoints** beyond enriching `/postmortem` and adding `/health` neo4j status
- **No generic graph ORM** — thin `GraphWriter` + `GraphQueries` only, no abstraction layer
- **No GDS (Graph Data Science) algorithms** — simple path queries only in v1 (no PageRank, community detection)
- **No backfill** of existing simulations

---

## Verification Strategy

### Test Decision
- **Infrastructure**: pytest exists (confirmed from backend dir)
- **Automated tests**: YES — integration test (tests-after style)
- **Framework**: pytest + `neo4j` Python driver in test
- **Agent QA**: all scenarios agent-executable via curl + Cypher shell

### QA Policy
All verification agent-executable. Evidence saved to `.sisyphus/evidence/`.

- **API**: `curl` — POST /postmortem, GET /health
- **Graph state**: `neo4j` Python driver directly in integration test
- **Failure mode**: mock Neo4j down, assert simulation still returns 200

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (foundation — all independent, start immediately):
├── Task 1: Neo4j driver + config (backend/app/graph/driver.py + config.py)
├── Task 2: Graph schema (backend/app/graph/schema.py — constraints, indexes)
├── Task 3: Docker Compose neo4j service + health endpoint update
└── Task 4: GraphAnalytics Pydantic model (backend/app/models.py)

Wave 2 (core writer + queries — after Wave 1):
├── Task 5: GraphWriter — per-turn idempotent writes (backend/app/graph/writer.py)
└── Task 6: GraphQueries — 5 postmortem Cypher queries (backend/app/graph/queries.py)

Wave 3 (wiring + tests — after Wave 2):
├── Task 7: Wire writer into workflow.py update_dynamics node
├── Task 8: Wire queries into main.py postmortem endpoint
└── Task 9: Integration test (backend/tests/test_neo4j_integration.py)
```

### Dependency Matrix
- **T1, T2, T3, T4**: no deps — Wave 1, all parallel
- **T5**: depends on T1, T2 (needs driver + schema constants)
- **T6**: depends on T1, T2 (needs driver + node/rel label constants)
- **T7**: depends on T5 (imports GraphWriter)
- **T8**: depends on T4, T6 (imports GraphAnalytics model + queries)
- **T9**: depends on T5, T6, T7, T8 (tests full stack)

---

## TODOs

- [ ] 1. Neo4j driver + config env vars

  **What to do**:
  - Add to `backend/app/config.py`:
    - `NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")`
    - `NEO4J_USER: str = os.getenv("NEO4J_USER", "neo4j")`
    - `NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "boardroom")`
  - Create `backend/app/graph/__init__.py` (empty, marks package)
  - Create `backend/app/graph/driver.py`:
    - Async singleton using `neo4j` Python driver (`neo4j.AsyncGraphDatabase`)
    - `get_driver() -> AsyncDriver` — creates once, reuses
    - `close_driver()` — called on app shutdown
    - `ping() -> bool` — `RETURN 1` query, returns True/False, never raises
  - Add `neo4j>=5.0` to `requirements.txt` (or `pyproject.toml`)
  - Wire `close_driver()` into `main.py` `shutdown_event`

  **Must NOT do**:
  - Don't use sync driver (`neo4j.GraphDatabase`) — app is async throughout
  - Don't raise exceptions from `ping()` — it must be safe to call always

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4)
  - **Blocks**: T2, T5, T6
  - **Blocked By**: None

  **References**:
  - `backend/app/config.py` — existing env var pattern to follow
  - `backend/app/main.py:shutdown_event` — where to add `close_driver()`
  - `backend/app/memory.py` — example of singleton async resource pattern
  - Official: `https://neo4j.com/docs/python-manual/current/get-started/` — async driver usage

  **Acceptance Criteria**:
  - [ ] `python -m py_compile backend/app/graph/driver.py` passes
  - [ ] `from app.graph.driver import get_driver, ping` imports without error
  - [ ] `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` appear in `config.py`

  ```
  Scenario: Driver connects to running Neo4j
    Tool: Bash (python)
    Preconditions: docker compose up neo4j running
    Steps:
      1. python -c "import asyncio; from app.graph.driver import ping; print(asyncio.run(ping()))"
    Expected Result: prints True
    Evidence: .sisyphus/evidence/task-1-driver-ping.txt

  Scenario: Driver ping when Neo4j is down
    Tool: Bash (python)
    Preconditions: Neo4j not running
    Steps:
      1. python -c "import asyncio; from app.graph.driver import ping; print(asyncio.run(ping()))"
    Expected Result: prints False (no exception)
    Evidence: .sisyphus/evidence/task-1-driver-ping-down.txt
  ```

  **Commit**: YES (groups with T2)
  - Message: `feat(graph): add neo4j async driver and config env vars`
  - Files: `backend/app/graph/__init__.py`, `backend/app/graph/driver.py`, `backend/app/config.py`

---

- [ ] 2. Graph schema — constraints, indexes, bootstrap

  **What to do**:
  - Create `backend/app/graph/schema.py`:
    - Node labels: `Agent`, `Simulation`, `Turn` (as event node, optional), `SchemaVersion`
    - Relationship types (as constants): `TRUSTS`, `CHALLENGED`, `COMPROMISED`, `INTERRUPTED`, `ALLIED_WITH`, `INFLUENCED`
    - `SCHEMA_VERSION = "v1"` string constant
    - `async def bootstrap_schema(driver)` — runs on startup:
      ```cypher
      CREATE CONSTRAINT agent_unique IF NOT EXISTS
        FOR (a:Agent) REQUIRE (a.simulation_id, a.agent_id) IS UNIQUE;

      CREATE CONSTRAINT sim_unique IF NOT EXISTS
        FOR (s:Simulation) REQUIRE s.simulation_id IS UNIQUE;

      MERGE (:SchemaVersion {version: "v1", applied_at: timestamp()})
      ```
    - Index on `Agent.simulation_id` for scoped queries
  - Call `await bootstrap_schema(driver)` from `main.py:startup_event`

  **Must NOT do**:
  - Don't use `CREATE CONSTRAINT` without `IF NOT EXISTS` — must be idempotent
  - Don't hardcode label/reltype strings in writer or queries — always import from `schema.py`

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4)
  - **Blocks**: T5, T6
  - **Blocked By**: None (but references T1 driver interface)

  **References**:
  - `backend/app/database/sqlite.py:_migrate()` — idempotent migration pattern to mirror
  - Official: `https://neo4j.com/docs/cypher-manual/current/constraints/`

  **Acceptance Criteria**:
  - [ ] `python -m py_compile backend/app/graph/schema.py` passes
  - [ ] Running `bootstrap_schema` twice on same DB raises no errors

  ```
  Scenario: Schema bootstrap is idempotent
    Tool: Bash (python)
    Preconditions: Neo4j running (docker compose)
    Steps:
      1. python -c "import asyncio; from app.graph.driver import get_driver; from app.graph.schema import bootstrap_schema; asyncio.run(bootstrap_schema(asyncio.run(get_driver())))"
      2. Run same command again
    Expected Result: No errors on either run; constraint exists once in DB
    Evidence: .sisyphus/evidence/task-2-schema-bootstrap.txt
  ```

  **Commit**: YES (groups with T1)
  - Message: `feat(graph): add neo4j async driver and config env vars`

---

- [ ] 3. Docker Compose neo4j service + /health neo4j status

  **What to do**:
  - Add to `docker-compose.yml` (create if absent, or append service):
    ```yaml
    neo4j:
      image: neo4j:5-community
      ports:
        - "7474:7474"   # HTTP browser
        - "7687:7687"   # Bolt
      environment:
        NEO4J_AUTH: neo4j/boardroom
      volumes:
        - neo4j_data:/data
    volumes:
      neo4j_data:
    ```
  - Update `GET /health` in `main.py` to include `neo4j` status:
    ```python
    from .graph.driver import ping as neo4j_ping
    neo4j_ok = await neo4j_ping()
    return {"ok": True, "mode": "production", "neo4j": "ok" if neo4j_ok else "degraded"}
    ```

  **Must NOT do**:
  - Don't set `NEO4J_AUTH: none` — keep auth on
  - Don't make `/health` async-blocking if Neo4j is slow — `ping()` already has implicit short timeout via driver

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T9 (integration test needs compose)
  - **Blocked By**: None

  **References**:
  - Existing `docker-compose.yml` (check if it exists first; create if not)
  - `backend/app/main.py:health` route (line 244)

  **Acceptance Criteria**:
  - [ ] `docker compose up neo4j -d` starts without error
  - [ ] `curl http://localhost:7474` returns neo4j browser HTML
  - [ ] `curl http://localhost:8000/health` returns `{"neo4j": "ok"}` when Neo4j is running
  - [ ] `curl http://localhost:8000/health` returns `{"neo4j": "degraded"}` when Neo4j is stopped

  ```
  Scenario: Health reports neo4j ok
    Tool: Bash (curl)
    Preconditions: docker compose up neo4j; server running
    Steps:
      1. curl -s http://localhost:8000/health | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['neo4j']=='ok', d"
    Expected Result: no assertion error
    Evidence: .sisyphus/evidence/task-3-health-ok.txt

  Scenario: Health reports neo4j degraded
    Tool: Bash (curl)
    Preconditions: Neo4j stopped; server running
    Steps:
      1. docker compose stop neo4j
      2. curl -s http://localhost:8000/health | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['neo4j']=='degraded', d"
    Expected Result: no assertion error
    Evidence: .sisyphus/evidence/task-3-health-degraded.txt
  ```

  **Commit**: YES (standalone)
  - Message: `feat(infra): add neo4j to docker-compose and health endpoint`
  - Files: `docker-compose.yml`, `backend/app/main.py`

---

- [ ] 4. GraphAnalytics Pydantic model

  **What to do**:
  - Add to `backend/app/models.py`:
    ```python
    class HostilePair(BaseModel):
        agent_a: str
        agent_b: str
        mutual_trust_avg: int       # average of trust[a][b] + trust[b][a] / 2
        lowest_turn: int            # turn at which minimum was recorded

    class InfluenceNode(BaseModel):
        agent_name: str
        downstream_shifts: int      # count of position changes traced to this agent
        chain_depth: int            # longest influence path length

    class CoalitionEvolution(BaseModel):
        agent_a: str
        agent_b: str
        formed_at_turn: int
        strength_trend: list[int]   # trust scores at each relevant turn
        fractured: bool

    class InterruptEvent(BaseModel):
        turn_index: int
        interrupter: str
        interrupted: str
        interrupt_type: str         # cut_off / reframe / pile_on / deflect
        bid_score: float
        seq: int                    # position within same-turn interrupt chain

    class CrossSimPattern(BaseModel):
        tag: str                    # e.g. "SKEPTICAL"
        deadlock_precursor_count: int
        total_appearances: int
        rate: float                 # deadlock_precursor_count / total_appearances

    class GraphAnalytics(BaseModel):
        hostile_pairs: list[HostilePair] = Field(default_factory=list)
        influence_chain: list[InfluenceNode] = Field(default_factory=list)
        coalition_evolution: list[CoalitionEvolution] = Field(default_factory=list)
        interrupt_replay: list[InterruptEvent] = Field(default_factory=list)
        cross_sim_patterns: list[CrossSimPattern] = Field(default_factory=list)
        graph_available: bool = True  # False when Neo4j was degraded
    ```
  - Add `graph_analytics: GraphAnalytics = Field(default_factory=GraphAnalytics)` to `Postmortem` model

  **Must NOT do**:
  - Don't make `graph_analytics` required on `Postmortem` — default to empty `GraphAnalytics()` so existing code never breaks

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T8
  - **Blocked By**: None

  **References**:
  - `backend/app/models.py` lines 134-165 — existing Postmortem + StrategyCard pattern to follow

  **Acceptance Criteria**:
  - [ ] `python -m py_compile backend/app/models.py` passes
  - [ ] `from app.models import GraphAnalytics, Postmortem; p = Postmortem(...); p.graph_analytics` works

  ```
  Scenario: GraphAnalytics defaults gracefully
    Tool: Bash (python)
    Steps:
      1. python -c "from app.models import GraphAnalytics; g = GraphAnalytics(); assert g.graph_available == True; assert g.hostile_pairs == []"
    Expected Result: no assertion error
    Evidence: .sisyphus/evidence/task-4-model-defaults.txt
  ```

  **Commit**: YES (groups with T8)
  - Message: `feat(graph): GraphAnalytics model + postmortem enrichment`

---

- [ ] 5. GraphWriter — idempotent per-turn writes

  **What to do**:
  - Create `backend/app/graph/writer.py`:
    - Class `GraphWriter` with `async def write_turn(simulation_id, turn_dict, trust_matrix, leverage_scores, agent_objectives, stakeholders)` 
    - All writes inside a single async session, wrapped in try/except — never raises
    - Returns `True` on success, `False` on failure (caller logs)
    - Write operations (all `MERGE`-based):

    **Ensure Agent nodes exist** (idempotent):
    ```cypher
    MERGE (a:Agent {simulation_id: $sim_id, agent_id: $agent_id})
    SET a.name = $name, a.role = $role, a.tag = $tag, a.tool_profile = $tool_profile
    ```

    **Ensure Simulation node exists**:
    ```cypher
    MERGE (s:Simulation {simulation_id: $sim_id})
    SET s.updated_at = timestamp()
    ```

    **Upsert TRUSTS edges** (latest-state only — overwrite score):
    ```cypher
    MATCH (a:Agent {simulation_id: $sim_id, agent_id: $a_id})
    MATCH (b:Agent {simulation_id: $sim_id, agent_id: $b_id})
    MERGE (a)-[r:TRUSTS]->(b)
    SET r.score = $score, r.last_updated_turn = $turn_index
    ```

    **Write action-type relationships** (MERGE by turn_id to prevent duplicates):
    ```cypher
    -- For challenge/escalate → CHALLENGED
    MERGE (a:Agent {simulation_id: $sim_id, agent_id: $speaker_id})
      -[r:CHALLENGED {simulation_id: $sim_id, turn_id: $turn_index}]->
      (b:Agent {simulation_id: $sim_id, agent_id: $directed_at})
    SET r.content_snippet = $snippet, r.action_type = $action_type

    -- For coalition_signal → ALLIED_WITH
    MERGE (a)-[r:ALLIED_WITH {simulation_id: $sim_id, turn_id: $turn_index}]->(b)
    SET r.strength = $trust_score_at_time

    -- For compromise → COMPROMISED
    MERGE (a)-[r:COMPROMISED {simulation_id: $sim_id, turn_id: $turn_index}]->(s:Simulation {simulation_id: $sim_id})
    SET r.position_delta = $position_delta_json

    -- For interrupt → INTERRUPTED
    MERGE (a)-[r:INTERRUPTED {simulation_id: $sim_id, turn_id: $turn_index, seq: $seq}]->(b)
    SET r.interrupt_type = $interrupt_type, r.bid_score = $bid_score
    ```

    **Write INFLUENCED edges** when compromise follows a challenge/escalate:
    ```cypher
    -- If previous turn was challenge by B directed at A, and current turn is A compromising:
    MATCH (b:Agent {simulation_id: $sim_id, agent_id: $challenger_id})
    MATCH (a:Agent {simulation_id: $sim_id, agent_id: $compromiser_id})
    MERGE (b)-[r:INFLUENCED {simulation_id: $sim_id, turn_id: $turn_index}]->(a)
    SET r.mechanism = "challenge_led_to_concession"
    ```

  - `seq` for interrupts: scan `history` for all interrupts in current turn, assign 0-based seq
  - `position_delta_json`: `json.dumps(turn_dict.get("position_delta", {}))`

  **Must NOT do**:
  - Don't use `CREATE` — always `MERGE`
  - Don't write TRUSTS edges for agents not in the simulation
  - Don't let any exception propagate out of `write_turn`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6)
  - **Parallel Group**: Wave 2
  - **Blocks**: T7, T9
  - **Blocked By**: T1, T2

  **References**:
  - `backend/app/workflow.py:update_dynamics` (lines 317-429) — the caller context; `current_turn` dict structure
  - `backend/app/models.py:Turn` — field names available in turn_dict
  - `backend/app/graph/schema.py` — label/reltype constants to import
  - `backend/app/graph/driver.py` — `get_driver()` to call

  **Acceptance Criteria**:
  - [ ] `python -m py_compile backend/app/graph/writer.py` passes
  - [ ] Running `write_turn` with valid data → Neo4j contains expected nodes + edges
  - [ ] Running `write_turn` twice with same turn data → no duplicate nodes or edges

  ```
  Scenario: Write turn creates correct graph
    Tool: Bash (python)
    Preconditions: Neo4j running; 2 agents, 1 challenge turn
    Steps:
      1. Call write_turn with: sim_id="test-sim-1", turn_dict={turn_index:1, stakeholder_id:"a1", directed_at:"b1", action_type:"challenge", ...}, trust_matrix={"a1":{"b1":35},"b1":{"a1":55}}, ...
      2. Query: MATCH (a:Agent {simulation_id:"test-sim-1"}) RETURN count(a)
      3. Query: MATCH ()-[r:CHALLENGED {simulation_id:"test-sim-1"}]->() RETURN count(r)
      4. Query: MATCH ()-[r:TRUSTS {simulation_id:"test-sim-1"}]->() RETURN count(r)
    Expected Result: 2 agents, 1 CHALLENGED edge, 2 TRUSTS edges (a→b and b→a)
    Evidence: .sisyphus/evidence/task-5-writer-graph.txt

  Scenario: Write is idempotent
    Tool: Bash (python)
    Preconditions: Same as above, already written once
    Steps:
      1. Call write_turn again with identical arguments
      2. Query counts as above
    Expected Result: Still 2 agents, 1 CHALLENGED, 2 TRUSTS — no duplicates
    Evidence: .sisyphus/evidence/task-5-writer-idempotent.txt

  Scenario: Write fails gracefully when Neo4j is down
    Tool: Bash (python)
    Preconditions: Neo4j stopped
    Steps:
      1. result = asyncio.run(writer.write_turn(...))
      2. assert result == False
    Expected Result: Returns False, no exception raised
    Evidence: .sisyphus/evidence/task-5-writer-failure.txt
  ```

  **Commit**: YES (groups with T6)
  - Message: `feat(graph): GraphWriter idempotent per-turn writes`
  - Files: `backend/app/graph/writer.py`

---

- [ ] 6. GraphQueries — 5 postmortem Cypher queries

  **What to do**:
  - Create `backend/app/graph/queries.py`:
    - Class `GraphQueries` with one async method per query
    - All methods take `simulation_id: str` as first arg
    - Return typed dicts matching `GraphAnalytics` sub-models
    - All wrapped in try/except → return empty list on failure

    **1. Hostile pairs**:
    ```cypher
    MATCH (a:Agent {simulation_id: $sim_id})-[r1:TRUSTS]->(b:Agent {simulation_id: $sim_id})
    MATCH (b)-[r2:TRUSTS]->(a)
    WHERE a.agent_id < b.agent_id  -- deduplicate pairs
    WITH a, b, (r1.score + r2.score) / 2 AS mutual_avg, r1.last_updated_turn AS turn
    ORDER BY mutual_avg ASC
    LIMIT 5
    RETURN a.name AS agent_a, b.name AS agent_b, mutual_avg, turn
    ```

    **2. Influence chain**:
    ```cypher
    MATCH (a:Agent {simulation_id: $sim_id})-[r:INFLUENCED*1..]->(b:Agent {simulation_id: $sim_id})
    WITH a, count(r) AS downstream_shifts, max(length(r)) AS chain_depth
    ORDER BY downstream_shifts DESC
    LIMIT 5
    RETURN a.name AS agent_name, downstream_shifts, chain_depth
    ```

    **3. Coalition evolution**:
    ```cypher
    MATCH (a:Agent {simulation_id: $sim_id})-[r:ALLIED_WITH {simulation_id: $sim_id}]->(b:Agent {simulation_id: $sim_id})
    WHERE a.agent_id < b.agent_id
    WITH a, b, min(r.turn_id) AS formed_at_turn
    OPTIONAL MATCH (a)-[t:TRUSTS]->(b)
    RETURN a.name AS agent_a, b.name AS agent_b, formed_at_turn,
           [t.score] AS strength_trend,
           CASE WHEN t.score < 40 THEN true ELSE false END AS fractured
    ```

    **4. Interrupt chain replay**:
    ```cypher
    MATCH (a:Agent {simulation_id: $sim_id})-[r:INTERRUPTED {simulation_id: $sim_id}]->(b:Agent {simulation_id: $sim_id})
    RETURN a.name AS interrupter, b.name AS interrupted,
           r.turn_id AS turn_index, r.interrupt_type, r.bid_score, r.seq
    ORDER BY r.turn_id ASC, r.seq ASC
    ```

    **5. Cross-sim patterns** (all sims, not scoped to one):
    ```cypher
    MATCH (a:Agent)-[:CHALLENGED|ESCALATED*3..]->(b:Agent)
    WHERE a.simulation_id = b.simulation_id
    WITH a.tag AS tag, count(DISTINCT a.simulation_id) AS deadlock_precursor_count
    MATCH (all_a:Agent {tag: tag})
    WITH tag, deadlock_precursor_count, count(DISTINCT all_a.simulation_id) AS total
    RETURN tag, deadlock_precursor_count, total,
           toFloat(deadlock_precursor_count) / total AS rate
    ORDER BY rate DESC
    ```

  **Must NOT do**:
  - Don't use `MATCH` without `simulation_id` scope (except cross-sim query #5 which intentionally spans)
  - Don't return raw Neo4j `Record` objects — map to plain dicts

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5)
  - **Parallel Group**: Wave 2
  - **Blocks**: T8, T9
  - **Blocked By**: T1, T2

  **References**:
  - `backend/app/graph/schema.py` — label/reltype constants
  - `backend/app/models.py` — `GraphAnalytics` sub-models (from T4) for return shape
  - Official: `https://neo4j.com/docs/cypher-manual/current/clauses/match/`

  **Acceptance Criteria**:
  - [ ] `python -m py_compile backend/app/graph/queries.py` passes
  - [ ] All 5 methods return empty list when `simulation_id` has no graph data (no error)
  - [ ] After running mini-sim (T9 setup), hostile_pairs returns ≥ 1 result with correct agent names

  ```
  Scenario: Queries return empty gracefully for unknown sim
    Tool: Bash (python)
    Steps:
      1. python -c "import asyncio; from app.graph.queries import GraphQueries; q = GraphQueries(); r = asyncio.run(q.hostile_pairs('nonexistent-sim-id')); assert r == [], r"
    Expected Result: empty list, no error
    Evidence: .sisyphus/evidence/task-6-queries-empty.txt

  Scenario: Queries return data after mini-sim
    Tool: Bash (python)
    Preconditions: mini-sim written via GraphWriter (T5 test data)
    Steps:
      1. python -c "import asyncio; from app.graph.queries import GraphQueries; q = GraphQueries(); r = asyncio.run(q.hostile_pairs('test-sim-1')); print(r); assert len(r) >= 1"
    Expected Result: at least 1 hostile pair with correct agent names
    Evidence: .sisyphus/evidence/task-6-queries-data.txt
  ```

  **Commit**: YES (groups with T5)
  - Message: `feat(graph): GraphWriter idempotent per-turn writes`

---

- [ ] 7. Wire GraphWriter into workflow.py update_dynamics

  **What to do**:
  - In `backend/app/workflow.py`, at the end of `update_dynamics()`:
    ```python
    # Fire-and-forget graph write (non-blocking, never raises)
    try:
        import asyncio
        from app.graph.writer import GraphWriter
        writer = GraphWriter()
        # schedule as background task — don't await inline (update_dynamics is sync)
        loop = asyncio.get_event_loop()
        loop.create_task(
            writer.write_turn(
                simulation_id=state["simulation_id"],
                turn_dict=current_turn,
                trust_matrix=state.get("trust_matrix", {}),
                leverage_scores=state.get("leverage_scores", {}),
                agent_objectives=state.get("agent_objectives", {}),
                stakeholders=state["stakeholders"],
            )
        )
    except Exception as e:
        state["event_log"] = list(state["event_log"]) + [f"[GRAPH_WARN] write failed: {e}"]
    ```
  - Note: `update_dynamics` is a **sync** function called inside LangGraph. Use `loop.create_task()` to schedule the coroutine without blocking. If no event loop is running (edge case in tests), catch `RuntimeError` and log.

  **Must NOT do**:
  - Don't `await` the write inline — `update_dynamics` is sync and must remain fast
  - Don't let any exception from the writer propagate up to LangGraph
  - Don't import `GraphWriter` at module level in workflow.py (avoid circular imports)

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T8)
  - **Parallel Group**: Wave 3
  - **Blocks**: T9
  - **Blocked By**: T5

  **References**:
  - `backend/app/workflow.py:update_dynamics` lines 317-429 — the function to modify
  - `backend/app/graph/writer.py` — `GraphWriter.write_turn()` signature (from T5)

  **Acceptance Criteria**:
  - [ ] `python -m py_compile backend/app/workflow.py` passes
  - [ ] Running a simulation turn with Neo4j up → graph nodes/edges appear in Neo4j
  - [ ] Running a simulation turn with Neo4j down → turn completes normally, `[GRAPH_WARN]` in event_log

  ```
  Scenario: Graph written after sim turn (Neo4j up)
    Tool: Bash (curl + python)
    Preconditions: Neo4j running; server running with 2 stakeholders
    Steps:
      1. POST /simulations with 2 stakeholders
      2. GET /simulations/{id}/stream?max_turns=1 (wait for done event)
      3. python -c "query Neo4j: MATCH (a:Agent {simulation_id:'{id}'}) RETURN count(a)"
    Expected Result: count = 2 agents in Neo4j
    Evidence: .sisyphus/evidence/task-7-workflow-graph.txt

  Scenario: Simulation succeeds when Neo4j is down
    Tool: Bash (curl)
    Preconditions: Neo4j stopped; server running
    Steps:
      1. POST /simulations; GET /simulations/{id}/stream?max_turns=1
      2. Assert response type=done with total_turns >= 1
      3. Assert event_log contains "[GRAPH_WARN]"
    Expected Result: simulation completes, GRAPH_WARN logged
    Evidence: .sisyphus/evidence/task-7-workflow-degraded.txt
  ```

  **Commit**: YES (groups with T8)
  - Message: `feat(graph): wire GraphWriter into update_dynamics and postmortem`

---

- [ ] 8. Wire GraphQueries into postmortem endpoint

  **What to do**:
  - In `backend/app/main.py`, enrich `create_postmortem`:
    ```python
    from .graph.queries import GraphQueries
    from .models import GraphAnalytics

    # After building postmortem from LLM...
    try:
        gq = GraphQueries()
        graph_analytics = GraphAnalytics(
            hostile_pairs=await gq.hostile_pairs(simulation_id),
            influence_chain=await gq.influence_chain(simulation_id),
            coalition_evolution=await gq.coalition_evolution(simulation_id),
            interrupt_replay=await gq.interrupt_replay(simulation_id),
            cross_sim_patterns=await gq.cross_sim_patterns(),
            graph_available=True,
        )
    except Exception:
        graph_analytics = GraphAnalytics(graph_available=False)

    postmortem.graph_analytics = graph_analytics
    return postmortem
    ```

  **Must NOT do**:
  - Don't make graph queries blocking/sequential if they can be parallelized — use `asyncio.gather()`
  - Don't fail the postmortem if graph queries fail — catch all exceptions, return `graph_available=False`

  **Better approach** — use `asyncio.gather` for all 5 queries in parallel:
  ```python
  results = await asyncio.gather(
      gq.hostile_pairs(simulation_id),
      gq.influence_chain(simulation_id),
      gq.coalition_evolution(simulation_id),
      gq.interrupt_replay(simulation_id),
      gq.cross_sim_patterns(),
      return_exceptions=True,
  )
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7)
  - **Parallel Group**: Wave 3
  - **Blocks**: T9
  - **Blocked By**: T4, T6

  **References**:
  - `backend/app/main.py:create_postmortem` lines 437-449 — function to enrich
  - `backend/app/models.py:Postmortem` — add `graph_analytics` field (from T4)
  - `backend/app/graph/queries.py` — method signatures (from T6)

  **Acceptance Criteria**:
  - [ ] `python -m py_compile backend/app/main.py` passes
  - [ ] `POST /simulations/{id}/postmortem` response JSON includes `graph_analytics` key
  - [ ] `graph_analytics.graph_available` is `true` when Neo4j is up, `false` when down

  ```
  Scenario: Postmortem includes graph analytics
    Tool: Bash (curl)
    Preconditions: Neo4j running; simulation with ≥2 turns completed
    Steps:
      1. curl -s -X POST http://localhost:8000/simulations/{id}/postmortem | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'graph_analytics' in d; assert d['graph_analytics']['graph_available']==True; print('OK')"
    Expected Result: prints OK
    Evidence: .sisyphus/evidence/task-8-postmortem-graph.txt

  Scenario: Postmortem degrades gracefully when Neo4j is down
    Tool: Bash (curl)
    Preconditions: Neo4j stopped; simulation exists
    Steps:
      1. curl -s -X POST http://localhost:8000/simulations/{id}/postmortem | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['graph_analytics']['graph_available']==False"
    Expected Result: 200 response, graph_available=False
    Evidence: .sisyphus/evidence/task-8-postmortem-degraded.txt
  ```

  **Commit**: YES (groups with T7)
  - Message: `feat(graph): wire GraphWriter into update_dynamics and postmortem`
  - Files: `backend/app/main.py`, `backend/app/models.py`

---

- [ ] 9. Integration test — deterministic mini-sim asserts exact graph state

  **What to do**:
  - Create `backend/tests/test_neo4j_integration.py`:
    - Uses `pytest` + `neo4j` Python driver directly (not via app HTTP)
    - Test setup: clear `test-sim-integ` subgraph before each test
    - **Test 1**: `test_writer_creates_correct_nodes`
      - Call `GraphWriter().write_turn()` with deterministic data (2 agents, 1 challenge turn, known trust matrix)
      - Assert: 2 `Agent` nodes, 1 `Simulation` node, 1 `CHALLENGED` edge, 2 `TRUSTS` edges with correct scores
    - **Test 2**: `test_writer_is_idempotent`
      - Call `write_turn` twice with identical args
      - Assert: same counts as Test 1 (no duplicates)
    - **Test 3**: `test_queries_hostile_pairs`
      - Write 2 agents with low mutual trust (scores: 20 and 25)
      - Call `GraphQueries().hostile_pairs("test-sim-integ")`
      - Assert: 1 result, mutual_avg = 22 (or 22.5 rounded), correct agent names
    - **Test 4**: `test_writer_fails_gracefully`
      - Patch `get_driver()` to raise `ConnectionError`
      - Call `write_turn`
      - Assert: returns `False`, no exception
    - **Fixtures**: `@pytest.fixture` for `sim_id="test-sim-integ"` + teardown that deletes sim subgraph
    - Mark tests with `@pytest.mark.integration` — skip if `NEO4J_URI` not set or Neo4j unreachable

  **Must NOT do**:
  - Don't hardcode `localhost:7687` in tests — read from `config.NEO4J_URI`
  - Don't leave test data in Neo4j — always cleanup in fixture teardown

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (but sequential — last)
  - **Blocks**: nothing
  - **Blocked By**: T5, T6, T7, T8

  **References**:
  - `backend/app/graph/writer.py` — `GraphWriter` (T5)
  - `backend/app/graph/queries.py` — `GraphQueries` (T6)
  - `backend/app/config.py` — `NEO4J_URI` (T1)
  - Official: `https://neo4j.com/docs/python-manual/current/` — async session usage in tests

  **Acceptance Criteria**:
  - [ ] `pytest backend/tests/test_neo4j_integration.py -v -m integration` — 4 tests pass
  - [ ] Tests skip cleanly when Neo4j is not available (`pytest.skip`)
  - [ ] No test data remains in Neo4j after test run

  ```
  Scenario: All integration tests pass
    Tool: Bash
    Preconditions: docker compose up neo4j; deps installed
    Steps:
      1. cd backend && pytest tests/test_neo4j_integration.py -v -m integration 2>&1 | tail -20
    Expected Result: "4 passed" in output
    Evidence: .sisyphus/evidence/task-9-integration-tests.txt

  Scenario: Tests skip without Neo4j
    Tool: Bash
    Preconditions: NEO4J_URI unset or Neo4j stopped
    Steps:
      1. NEO4J_URI="" pytest tests/test_neo4j_integration.py -v -m integration
    Expected Result: "4 skipped" or "4 deselected" — no failures
    Evidence: .sisyphus/evidence/task-9-skip-without-neo4j.txt
  ```

  **Commit**: YES (standalone)
  - Message: `test(graph): neo4j integration test suite`
  - Files: `backend/tests/test_neo4j_integration.py`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Verify all Must Have items implemented. Check for any `CREATE` (non-MERGE) writes. Verify every Cypher query has `simulation_id` scope. Check event_log `[GRAPH_WARN]` path exists. Verify `graph_analytics` on Postmortem has default.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `python -m py_compile` all graph files. Check for bare `except:`, missing `async/await`, sync driver in async context, hardcoded credentials, missing `IF NOT EXISTS` on constraints.
  Output: `Compile [PASS/FAIL] | Issues [N] | VERDICT`

- [ ] F3. **Real QA** — `unspecified-high`
  Start docker compose. Run server. Execute all QA scenarios from T3, T7, T8. Confirm `graph_available: true` in postmortem. Confirm degraded mode returns 200.
  Output: `Scenarios [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity** — `deep`
  Confirm no new endpoints added beyond `/health` enrichment and `/postmortem` enrichment. Confirm no Postgres/Chroma tables modified. Confirm no Neo4j reads in hot path (workflow.py, engine.py advance_turn path).
  Output: `Compliant [N/N tasks] | VERDICT`

---

## Commit Strategy

- Wave 1+: `feat(graph): add neo4j async driver and config env vars` — T1+T2
- Wave 1: `feat(infra): add neo4j to docker-compose and health endpoint` — T3
- Wave 2: `feat(graph): GraphWriter idempotent per-turn writes` — T5+T6
- Wave 3: `feat(graph): wire GraphWriter into update_dynamics and postmortem` — T7+T8
- Wave 3: `test(graph): neo4j integration test suite` — T9

---

## Success Criteria

```bash
# Neo4j up
docker compose up neo4j -d
curl http://localhost:7474  # → neo4j browser HTML

# Health check
curl http://localhost:8000/health | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['neo4j']=='ok'"

# After a sim run
curl -X POST http://localhost:8000/simulations/{id}/postmortem \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['graph_analytics'])"
# → {hostile_pairs:[...], influence_chain:[...], ...}

# Integration tests
cd backend && pytest tests/test_neo4j_integration.py -v -m integration
# → 4 passed
```
