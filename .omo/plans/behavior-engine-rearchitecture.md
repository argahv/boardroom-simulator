# Behavior Engine Re-architecture

## TL;DR

> **Quick Summary**: Re-architect from LLM-driven "prompt theater" to a deterministic Behavior Engine + SocialPhysics layer. The LLM becomes a *rendering layer* — state, trust, goals, relationships, and strategy all live in testable Python code outside the prompt.
>
> **Deliverables**:
> - SocialPhysics state machine (trust, leverage, tension, dominance, credibility, momentum)
> - Relationship Graph (NxN trust/fear/rivalry/alliance matrix with decay)
> - Agent Internal State (emotion, confidence, goal, strategy, certainty)
> - Goal Evolution Engine (threshold-triggered priority shifts + decay)
> - Memory System (episodic buffer + semantic compression + importance scoring)
> - Private Strategic Thought (public position vs private concern separation)
> - Language Engine (thin LLM wrapper — renders state, does NOT decide)
> - Enhanced Scheduler with Moderator AI
> - Coalition detection + evolution tracking
> - Hidden information + information asymmetry
> - Crisis injection + time pressure dynamics
> - Agent Archetypes behavioral framework (opportunist, idealist, diplomat, etc.)
> - Frontend visualization components (relationship graph, state panels, trust meters)
>
> **Estimated Effort**: Large (30+ tasks across 5 waves)
> **Parallel Execution**: YES — 5 waves of 5-7 tasks each
> **Critical Path**: SocialPhysics → BehaviorEngine → AgentRuntime integration → Language Engine → Moderator AI

---

## Context

### Original Request
User provided deep strategic analysis identifying the gap between "turn-based prompt theater" and a true "social-intelligence simulation engine." Key insight: separate Behavior Engine (deterministic, testable) from Language Engine (LLM as renderer).

### Interview Summary
**Key Decisions**:
- Full stack re-architecture (backend runtime + frontend visualizations)
- All phases in one plan: P1 (behavior engine + relationship graph) → P2 (social dynamics) → P3 (strategic adaptation) → P4 (moderator + crises)
- TDD for deterministic Behavior Engine — no LLM calls in state transitions
- Keep existing API surface (FastAPI + SSE streaming) intact, add new endpoints
- Keep existing data models as schema foundation, populate from runtime
- Architecture design doc + work plan

### Current Codebase State
- `AgentRuntime` (agent.py) has observe→think→decide→act loop but NO persistent internal state
- `Scheduler._update_dynamics` is a stub (`pass` for trust tracking)
- Models already encode: `Objective`, `ObjectiveStore`, `CoalitionSignal`, `LeverageShift`, `trust_matrix`, `leverage_scores` but runtime doesn't populate them
- No relationship graph population
- No Behavior/Language separation — LLM owns all cognition
- No SocialPhysics layer
- Frontend: basic SSE stream display, no state/relationship visualization

### Identified Gaps (self-reviewed)
- No blocker questions outstanding
- Assumption: existing models (Objective, ObjectiveStore, etc.) remain stable; verified they encode the vision correctly
- Guardrail: avoid premature generalization — SocialPhysics fields should be concrete (trust, leverage, tension, dominance, credibility, momentum), not abstract (state_1, state_2)

---

## Work Objectives

### Core Objective
Transform the simulation engine from LLM-driven prompt generation to a deterministic Behavior Engine where state transitions, relationships, goals, and strategy are managed outside the LLM. The LLM becomes a rendering layer for natural language only.

### Concrete Deliverables
- `backend/app/runtime/social_physics.py` — SocialPhysics state machine
- `backend/app/runtime/internal_state.py` — Agent internal cognitive state
- `backend/app/runtime/relationship_graph.py` — Agent relationship tracking
- `backend/app/runtime/behavior_engine.py` — Behavior Engine orchestrator
- `backend/app/runtime/goal_evolution.py` — Dynamic goal evolution
- `backend/app/runtime/memory_system.py` — Episodic + semantic memory
- `backend/app/runtime/private_thought.py` — Private/public thought split
- `backend/app/runtime/language_engine.py` — LLM rendering wrapper
- `backend/app/runtime/moderator.py` — Moderator AI
- `backend/app/runtime/crisis_injector.py` — Crisis/time pressure system
- Modifications to `agent.py`, `scheduler.py`, `space.py` — wire in new systems
- Frontend components for state/relationship/coalition visualization
- `backend/tests/` — TDD test suite for all deterministic components

### Definition of Done
- [x] All deterministic components have TDD tests passing (`bun test` / `make test`)
- [x] AgentRuntime uses BehaviorEngine for state, LLM only for language generation
- [x] SocialPhysics state (trust, leverage, tension, etc.) updates deterministically after each turn
- [x] Relationship graph populated and queryable after simulation
- [x] Goals evolve dynamically based on threshold triggers
- [x] Private strategic thought stored persistently, separate from public positions
- [x] Frontend displays relationship graph, agent state, trust/leverage meters
- [x] Existing simulations (via SSE streaming) still work — no breaking API changes
- [x] Plan compliance audit passes (F1)
- [x] Code quality review passes (F2)
- [x] All QA scenarios pass (F3)
- [x] Scope fidelity check passes (F4)

### Must Have
- Behavior/Language separation — LLM must NOT own state transitions
- All SocialPhysics + Relationship + Goal updates must be deterministic (testable without LLM)
- Existing API surface must remain backward-compatible
- TDD for all new deterministic modules
- Frontend visualization of relationship graph and agent state

### Must NOT Have (Guardrails)
- No changes to existing database schema (models.py stays as schema foundation)
- No changes to existing FastAPI route signatures
- No new external dependencies
- No premature optimization — SocialPhysics fields are concrete, not abstract
- No removal of existing agent behavior until new system is verified

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (backend/tests/)
- **Automated tests**: TDD for all deterministic components
- **Framework**: pytest (Python backend)
- **TDD**: Each deterministic module follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend (deterministic)**: pytest — import module, call functions, assert state transitions
- **Backend (LLM integration)**: Bash (curl) — hit FastAPI endpoints, assert response shape
- **Frontend**: Playwright — navigate, interact, assert DOM, screenshot
- **Integration**: curl API + Playwright frontend — end-to-end simulation flow

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — SocialPhysics + Internal State + Behavior Engine Core):
├── Task 1: SocialPhysics data model + state machine
├── Task 2: Agent Internal State model + transitions
├── Task 3: Relationship Graph data model + update logic
├── Task 4: Behavior Engine orchestrator
├── Task 5: TDD tests for SocialPhysics + InternalState + RelationshipGraph
├── Task 6: Frontend state visualization components
└── Task 7: Architecture documentation update

Wave 2 (Agent Cognition — Goals + Memory + Private Thought):
├── Task 8: Goal Evolution Engine
├── Task 9: Memory System (episodic + semantic compression)
├── Task 10: Private Strategic Thought system
├── Task 11: Wire Behavior Engine into AgentRuntime
├── Task 12: TDD tests for Goal + Memory + PrivateThought
├── Task 13: Frontend agent cognitive state panels
└── Task 14: Update scheduler to consume Behavior Engine state

Wave 3 (Social Dynamics — Coalitions + Bidding v2 + Interruptions):
├── Task 15: Enhanced bidding system (state-driven urgency v2)
├── Task 16: Interruption system
├── Task 17: Whisper/channel system (private agent communication)
├── Task 18: Coalition detection and evolution tracking
├── Task 19: Hidden information + information asymmetry system
├── Task 20: Frontend coalition visualization
└── Task 21: Language Engine (LLM rendering wrapper)

Wave 4 (Strategic Adaptation + Emotions + Trust):
├── Task 22: Strategic adaptation system
├── Task 23: Emotional dynamics system
├── Task 24: Trust evolution (populate trust_matrix from runtime)
├── Task 25: Leverage tracking and visualization
├── Task 26: Agent Archetypes behavioral framework
├── Task 27: Frontend trust/leverage meters + emotion display
└── Task 28: End-to-end integration: full simulation with new engine

Wave 5 (Moderator AI + Crisis + Pressure):
├── Task 29: Moderator AI (intelligent scheduler)
├── Task 30: Crisis injection system
├── Task 31: Time pressure dynamics
├── Task 32: External event injection system
├── Task 33: Performance and token optimization
└── Task 34: Final integration test suite

Wave FINAL (Verification — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix
```
Task 1-7 (Wave 1): Foundations — no inter-dependencies within wave
Task 8 depends on: 2, 4 (needs InternalState + BehaviorEngine)
Task 9 depends on: 4 (needs BehaviorEngine for event processing)
Task 10 depends on: 2, 4 (needs InternalState + BehaviorEngine)
Task 11 depends on: 4, 5 (needs BehaviorEngine + tests)
Task 12 depends on: 8, 9, 10 (tests after impl)
Task 13 depends on: 8, 9, 10 (frontend after backend)
Task 14 depends on: 11 (needs modified AgentRuntime)

Task 15 depends on: 4 (needs BehaviorEngine)
Task 16 depends on: 4, 11 (needs BehaviorEngine + modified AgentRuntime)
Task 17 depends on: 11
Task 18 depends on: 3 (needs RelationshipGraph)
Task 19 depends on: 10 (needs PrivateThought)
Task 20 depends on: 18
Task 21 depends on: 11

Task 22 depends on: 8, 10 (needs GoalEvolution + PrivateThought)
Task 23 depends on: 2 (needs InternalState)
Task 24 depends on: 3 (needs RelationshipGraph)
Task 25 depends on: 1 (needs SocialPhysics)
Task 26 depends on: 23, 24 (needs Emotion + Trust)
Task 27 depends on: 23, 24, 25
Task 28 depends on: 11, 14, 21

Task 29 depends on: 14 (needs updated scheduler)
Task 30 depends on: 28 (needs integrated system)
Task 31 depends on: 28
Task 32 depends on: 30
Task 33 depends on: 28
Task 34 depends on: 29-33

Tasks F1-F4 depend on: ALL tasks complete
```

### Agent Dispatch Summary
- **Wave 1**: 7 tasks — quick (models), deep (Behavior Engine), visual-engineering (frontend)
- **Wave 2**: 7 tasks — deep (cognition), quick (tests), visual-engineering (frontend)
- **Wave 3**: 7 tasks — unspecified-high (social systems), deep (coalition), visual-engineering (frontend)
- **Wave 4**: 7 tasks — deep (adaptation), visual-engineering (frontend)
- **Wave 5**: 6 tasks — deep (moderator), unspecified-high (crisis), quick (perf)
- **FINAL**: 4 tasks — oracle, unspecified-high, deep

---

## TODOs

> **TDD Rule**: Every deterministic module follows RED (failing test) → GREEN (minimal impl) → REFACTOR.
> Test files go in `backend/tests/` mirroring the module path.

- [x] 1. SocialPhysics State Machine

  **What to do**:
  - Create `backend/app/runtime/social_physics.py`
  - Define `SocialPhysics` class with fields: `trust: float (0-1)`, `leverage: float (0-1)`, `tension: float (0-1)`, `dominance: float (0-1)`, `credibility: float (0-1)`, `momentum: float (-1 to +1)`
  - Implement `update(action_type: str, speaker_id: str, target_id: str | None, context: dict)` — deterministic delta application
  - Implement `decay()` — passive drift toward neutral over time
  - Implement `threshold_triggers()` — returns list of triggered events (e.g., tension > 0.8 → "escalation_risk")
  - Define default delta tables for each action_type (statement, question, challenge, compromise, coalition_signal, interrupt, escalate)
  - TDD: Write tests FIRST that verify: initial state values, trust delta on challenge action, tension increase on interrupt, decay over multiple calls, threshold trigger at tension > 0.8, momentum direction on compromise

  **Must NOT do**:
  - No LLM calls in SocialPhysics — all state transitions must be deterministic math
  - No import of non-standard-library modules except pydantic

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: N/A (pure Python, no external deps)
  - Reason: Core architecture component requiring careful delta design

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 5, 6, 7)
  - **Blocks**: Tasks 4, 25
  - **Blocked By**: None

  **References**:
  - `backend/app/models.py:SimulationV2Config` — existing config structure for reference
  - `backend/app/runtime/agent.py:AgentRuntime._compute_urgency()` — existing urgency logic (will be replaced)
  - Existing action types in `models.py:ActionType` — `statement`, `question`, `challenge`, `compromise`, `coalition_signal`, `interrupt`, `escalate`

  **Acceptance Criteria**:
  - [ ] `social_physics.py` exists with all 6 fields
  - [ ] pytest tests pass (TDD: RED→GREEN→REFACTOR)
  - [ ] `update()` returns deterministic results (same inputs = same outputs)
  - [ ] `threshold_triggers()` correctly identifies high-tension states
  - [ ] No LLM calls in module

  **QA Scenarios**:
  ```
  Scenario: Trust decreases on challenge
    Tool: Bash (pytest)
    Preconditions: SocialPhysics with trust=0.7, leverage=0.5
    Steps:
      1. Run pytest passing specific test: test_trust_decreases_on_challenge
      2. Test creates SocialPhysics obj, calls update("challenge", "agent_a", "agent_b", {})
      3. Asserts trust < 0.7
    Expected Result: trust decreases by correct delta
    Evidence: .sisyphus/evidence/task-1-trust-challenge.txt

  Scenario: Tension threshold triggers escalation event
    Tool: Bash (pytest)
    Preconditions: SocialPhysics with tension=0.75
    Steps:
      1. Run test_tension_threshold_triggers_escalation
      2. Test calls update("challenge", "a", "b", {}) pushing tension to 0.85
      3. Asserts threshold_triggers() contains "escalation_risk"
    Expected Result: escalation_risk detected
    Evidence: .sisyphus/evidence/task-1-tension-threshold.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-trust-challenge.txt (pytest output)
  - [ ] task-1-tension-threshold.txt (pytest output)

  **Commit**: YES
  - Message: `feat(behavior-engine): add SocialPhysics state machine`
  - Files: `backend/app/runtime/social_physics.py`, `backend/tests/test_social_physics.py`
  - Pre-commit: `pytest backend/tests/test_social_physics.py -v`

- [x] 2. Agent Internal State Model

  **What to do**:
  - Create `backend/app/runtime/internal_state.py`
  - Define `CognitiveState` dataclass with: `emotion: dict[str, float]` (anger, fear, joy, shame, surprise), `confidence: float (0-1)`, `certainty: float (0-1)`, `focus: str`, `goal_priority: int`
  - Define `InternalState` class that wraps CognitiveState with transition methods
  - Implement `apply_event(event: dict)` — updates emotion and confidence based on event type
  - Implement `shift_goal(new_goal: str, priority: int)` — transitions goal state
  - Implement `emotional_decay()` — emotions drift toward baseline
  - Implement `snapshot()` → dict (for serialization to frontend)
  - TDD: Write tests FIRST: initial state values, emotion shifts on challenge/interrupt, confidence changes on agreement/contradiction, goal shift persistence

  **Must NOT do**:
  - No LLM calls — all emotional/confidence updates must be deterministic
  - No dependency on SocialPhysics or RelationshipGraph

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: N/A
  - Reason: Cognitive model design requires careful psychology-inspired state machine

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 5, 6, 7)
  - **Blocks**: Tasks 8, 10, 11, 23
  - **Blocked By**: None

  **References**:
  - `backend/app/models.py:PersonalityProfile` — existing personality fields (aggressiveness, empathy, stubbornness, verbosity) — InternalState should be influenced by these
  - `backend/app/models.py:Objective` — existing objective model (will be consumed by goal evolution)

  **Acceptance Criteria**:
  - [ ] `internal_state.py` exists with CognitiveState + InternalState
  - [ ] emotion dict has all 5 emotions with range 0-1
  - [ ] apply_event deterministically updates state
  - [ ] snapshot() returns JSON-serializable dict
  - [ ] All TDD tests pass

  **QA Scenarios**:
  ```
  Scenario: Confidence drops on contradiction
    Tool: Bash (pytest)
    Preconditions: InternalState with confidence=0.8
    Steps:
      1. Run test_confidence_drops_on_contradiction
      2. Test calls apply_event({"type": "turn", "action_type": "challenge", "directed_at": "self"})
      3. Asserts confidence < 0.8
    Expected Result: confidence decreases
    Evidence: .sisyphus/evidence/task-2-confidence-drop.txt

  Scenario: Emotional decay returns toward baseline
    Tool: Bash (pytest)
    Preconditions: InternalState with anger=0.9
    Steps:
      1. Run test_emotional_decay
      2. Test calls emotional_decay() 5 times
      3. Asserts anger trending toward baseline
    Expected Result: anger decreases each call
    Evidence: .sisyphus/evidence/task-2-emotion-decay.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-confidence-drop.txt
  - [ ] task-2-emotion-decay.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add Agent Internal State model`
  - Files: `backend/app/runtime/internal_state.py`, `backend/tests/test_internal_state.py`
  - Pre-commit: `pytest backend/tests/test_internal_state.py -v`

- [x] 3. Relationship Graph

  **What to do**:
  - Create `backend/app/runtime/relationship_graph.py`
  - Define `RelationshipEntry` dataclass: `trust: float (0-1)`, `fear: float (0-1)`, `admiration: float (0-1)`, `rivalry: float (0-1)`, `alliance: bool`, `dependency: float (0-1)`
  - Define `RelationshipGraph` class with NxN matrix keyed by `(agent_a_id, agent_b_id)`
  - Implement `get(a, b) → RelationshipEntry`, `set(a, b, entry)`, `update(a, b, field, delta)`
  - Implement `apply_turn(turn: dict, action_type: str)` — adjusts relationship based on action and speaker
  - Implement `decay_all()` — all relationships drift toward neutral over time
  - Implement `get_allies(agent_id) → list[str]` — returns agents with alliance=True
  - Implement `get_rivals(agent_id) → list[str]` — returns agents with high rivalry
  - Implement `trust_score(agent_id) → float` — aggregate trust from all relationships
  - Implement `to_matrix() → dict` — serializable to JSON for frontend
  - TDD: Write tests FIRST: initial empty graph, set+get round-trip, trust delta on coalition_signal, rivalry increase on interrupt, decay after N turns, get_allies after alliance formation, serialization

  **Must NOT do**:
  - No LLM calls
  - No dependency on other new modules (SocialPhysics, InternalState)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: N/A
  - Reason: Graph data structure + update rules for social dynamics

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 5, 6, 7)
  - **Blocks**: Tasks 18, 24
  - **Blocked By**: None

  **References**:
  - `backend/app/models.py:CoalitionSignal` — existing model for coalition data
  - `backend/app/models.py:SimulationState.trust_matrix` — existing trust matrix field (will now be populated by RelationshipGraph)
  - `backend/app/runtime/agent.py:AgentRuntime._trusted_allies()` — existing stub method (will be replaced by RelationshipGraph)

  **Acceptance Criteria**:
  - [ ] `relationship_graph.py` exists
  - [ ] NxN matrix with all relationship fields
  - [ ] apply_turn deterministically updates relationships
  - [ ] get_allies / get_rivals / trust_score methods work
  - [ ] to_matrix() returns JSON-serializable dict
  - [ ] All TDD tests pass

  **QA Scenarios**:
  ```
  Scenario: Coalition signal increases trust between agents
    Tool: Bash (pytest)
    Preconditions: RelationshipGraph with trust=0.5 between A→B
    Steps:
      1. Run test_coalition_increases_trust
      2. Test calls apply_turn with coalition_signal between A and B
      3. Asserts trust A→B increased
    Expected Result: trust > 0.5
    Evidence: .sisyphus/evidence/task-3-coalition-trust.txt

  Scenario: Interrupt increases rivalry
    Tool: Bash (pytest)
    Preconditions: RelationshipGraph with rivalry=0.3 between A→B
    Steps:
      1. Run test_interrupt_increases_rivalry
      2. Test calls apply_turn with interrupt from A directed at B
      3. Asserts rivalry A→B > 0.3
    Expected Result: rivalry increases
    Evidence: .sisyphus/evidence/task-3-interrupt-rivalry.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-coalition-trust.txt
  - [ ] task-3-interrupt-rivalry.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add Relationship Graph`
  - Files: `backend/app/runtime/relationship_graph.py`, `backend/tests/test_relationship_graph.py`
  - Pre-commit: `pytest backend/tests/test_relationship_graph.py -v`

- [x] 4. Behavior Engine Orchestrator

  **What to do**:
  - Create `backend/app/runtime/behavior_engine.py`
  - Define `BehaviorEngine` class that coordinates SocialPhysics + InternalState + RelationshipGraph
  - Implement `process_turn(turn: dict, agent_id: str)` — single entry point that:
    1. Updates SocialPhysics based on action_type
    2. Updates RelationshipGraph based on speaker/target
    3. Updates the speaking agent's InternalState
    4. Checks for threshold triggers (coalition opportunity, escalation risk, deadlock)
    5. Returns `BehaviorResult` with: state snapshot, triggers, suggested actions
  - Implement `get_state_for_llm(agent_id: str) → dict` — serializes relevant state for Language Engine
  - Implement `get_public_state() → dict` — anonymized state for frontend streaming
  - Implement `tick()` — called between turns (decay relationships, drift emotions)
  - TDD: Write tests FIRST: process_turn produces correct state updates, get_state_for_llm includes emotion/trust/goal, tick applies decay, threshold triggers fire correctly

  **Must NOT do**:
  - No LLM calls — BehaviorEngine is pure deterministic state machine
  - Do NOT modify agent.py or scheduler.py yet (that's Task 11)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: N/A
  - Reason: Core integration point — orchestrates all sub-systems

  **Parallelization**:
  - **Can Run In Parallel**: PARTIAL (depends on 1, 2, 3 being complete)
  - **Parallel Group**: Wave 1 (sequential after 1, 2, 3)
  - **Blocks**: Tasks 8, 9, 10, 11, 15, 16
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - All three modules created in Tasks 1-3 (SocialPhysics, InternalState, RelationshipGraph)
  - `backend/app/models.py:Turn` — existing turn model structure
  - `backend/app/runtime/scheduler.py:Scheduler._update_dynamics()` — the stub this replaces

  **Acceptance Criteria**:
  - [ ] `behavior_engine.py` exists
  - [ ] process_turn() updates all three sub-systems
  - [ ] get_state_for_llm() returns dict with emotion, trust, goals, relationships
  - [ ] get_public_state() returns serializable (JSON-ready) dict
  - [ ] tick() applies decay correctly
  - [ ] All TDD tests pass
  - [ ] No LLM calls

  **QA Scenarios**:
  ```
  Scenario: Full turn processing updates all sub-systems
    Tool: Bash (pytest)
    Preconditions: BehaviorEngine with initial state, 3 agents
    Steps:
      1. Run test_full_turn_processing
      2. Test creates turn with agent_a challenging agent_b
      3. Calls process_turn(turn, "agent_a")
      4. Asserts SocialPhysics tension increased, RelationshipGraph rivalry increased, agent_a InternalState confidence increased
    Expected Result: All three sub-systems updated
    Evidence: .sisyphus/evidence/task-4-full-turn.txt

  Scenario: get_state_for_llm returns structured context
    Tool: Bash (pytest)
    Preconditions: BehaviorEngine after 3 turns
    Steps:
      1. Run test_get_state_for_llm
      2. Test calls get_state_for_llm("agent_a")
      3. Asserts dict contains: emotion, trust_scores, relationships, goal, recent_events
    Expected Result: Complete state context for LLM
    Evidence: .sisyphus/evidence/task-4-llm-state.txt
  ```

  **Evidence to Capture**:
  - [ ] task-4-full-turn.txt
  - [ ] task-4-llm-state.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add Behavior Engine orchestrator`
  - Files: `backend/app/runtime/behavior_engine.py`, `backend/tests/test_behavior_engine.py`
  - Pre-commit: `pytest backend/tests/test_behavior_engine.py -v`

- [x] 5. Frontend: Relationship Graph Visualization

  **What to do**:
  - Create/modify frontend components to visualize the relationship graph
  - Create `frontend/components/relationship-graph.tsx` — force-directed graph using D3.js or vis-network (prefer lightweight)
  - Nodes = agents (colored by stance), edges = relationship strength (thickness), color (green=trust, red=hostility)
  - Create `frontend/components/agent-card.tsx` — shows agent name, role, stance, internal state (confidence, emotion)
  - Create `frontend/components/trust-meter.tsx` — visual gauge showing trust level between selected agent pair
  - Wire into existing simulation display (likely in the page that streams SSE events)
  - Add API call to new `/state` endpoint (or consume from SSE stream data)

  **Must NOT do**:
  - Don't change existing page structure — add components as modular additions
  - No new external routing or state management library

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `react`, `d3`, `typescript`
  - Reason: Interactive data visualization with force-directed graph

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 13, 20, 27
  - **Blocked By**: None (can use mock data initially, wire to real data later)

  **References**:
  - `frontend/app/` — existing pages (find the simulation display page)
  - `frontend/components/` — existing component patterns
  - Existing D3 usage in frontend (if any), or install `d3-force` as minimal dep

  **Acceptance Criteria**:
  - [ ] `relationship-graph.tsx` renders force-directed graph with agent nodes
  - [ ] Node colors match agent stance
  - [ ] Edge thickness reflects trust level
  - [ ] `agent-card.tsx` shows internal state (confidence, emotion)
  - [ ] `trust-meter.tsx` shows trust level between selected pair
  - [ ] Components render without errors

  **QA Scenarios**:
  ```
  Scenario: Relationship graph renders with mock data
    Tool: Playwright
    Preconditions: Frontend dev server running on :3000, visit simulation page
    Steps:
      1. Navigate to simulation page
      2. Assert relationship-graph element is visible
      3. Assert agent nodes match expected count
      4. Assert node colors correspond to stances
    Expected Result: Graph renders with colored nodes
    Evidence: .sisyphus/evidence/task-5-graph-render.png

  Scenario: Agent card shows internal state
    Tool: Playwright
    Preconditions: Simulation running with state data
    Steps:
      1. Hover over an agent node in relationship graph
      2. Assert agent-card tooltip appears
      3. Assert card shows confidence value
      4. Assert card shows emotion indicators
    Expected Result: Agent card displays cognitive state
    Evidence: .sisyphus/evidence/task-5-agent-card.png
  ```

  **Evidence to Capture**:
  - [ ] task-5-graph-render.png
  - [ ] task-5-agent-card.png

  **Commit**: YES
  - Message: `feat(frontend): add relationship graph visualization`
  - Files: `frontend/components/relationship-graph.tsx`, `frontend/components/agent-card.tsx`, `frontend/components/trust-meter.tsx`
  - Pre-commit: `cd frontend && npm run build`

- [x] 6. Architecture Documentation

  **What to do**:
  - Create `docs/ARCHITECTURE.md` documenting the new Behavior Engine architecture
  - Document: layer diagram (Behavior Engine vs Language Engine), data flow, module boundaries
  - Document: SocialPhysics field definitions and delta tables
  - Document: Relationship graph structure and update rules
  - Document: State machine transitions for goal evolution
  - Document: How to add new action types (delta tables)
  - Include ASCII diagram showing module relationships

  **Must NOT do**:
  - Don't remove existing docs — this is additive
  - Don't document implementation details that will change (focus on architecture)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: N/A
  - Reason: Clear technical documentation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 7)
  - **Blocks**: None (documentation is reference)
  - **Blocked By**: None

  **References**:
  - `backend/app/runtime/social_physics.py` (Task 1 — read after created)
  - `backend/app/runtime/internal_state.py` (Task 2)
  - `backend/app/runtime/relationship_graph.py` (Task 3)
  - `backend/app/runtime/behavior_engine.py` (Task 4)

  **Acceptance Criteria**:
  - [ ] `docs/ARCHITECTURE.md` exists
  - [ ] Documents all 5 layers with responsibilities
  - [ ] Includes data flow diagram (ASCII or reference to Excalidraw)
  - [ ] Documents SocialPhysics delta tables
  - [ ] Documents how to add new action types
  - [ ] Readable by new developer in 5 minutes

  **QA Scenarios**:
  ```
  Scenario: Architecture doc is complete
    Tool: Bash (read file)
    Preconditions: docs/ARCHITECTURE.md exists
    Steps:
      1. Read docs/ARCHITECTURE.md
      2. Assert contains "Behavior Engine" section
      3. Assert contains "SocialPhysics" section with field definitions
      4. Assert contains "Relationship Graph" section
      5. Assert contains data flow description
    Expected Result: All sections present
    Evidence: .sisyphus/evidence/task-6-doc-complete.txt
  ```

  **Evidence to Capture**:
  - [ ] task-6-doc-complete.txt

  **Commit**: YES
  - Message: `docs: add Behavior Engine architecture documentation`
  - Files: `docs/ARCHITECTURE.md`
  - Pre-commit: verify readability

- [x] 7. Goal Evolution Engine

  **What to do**:
  - Create `backend/app/runtime/goal_evolution.py`
  - Define `GoalState` dataclass: `current_goal: str`, `priority: float`, `confidence: float`, `source: str`, `created_turn: int`, `ttl: int`
  - Define `GoalEvolution` class managing a list of GoalStates per agent
  - Implement `add_goal(agent_id, goal_text, priority, source)` — adds new goal with decay parameters
  - Implement `update_priorities(agent_id, triggers: list[str])` — shifts priorities based on threshold events (e.g., "credibility_under_attack" → "defend_reputation" becomes top priority)
  - Implement `decay_all(current_turn)` — reduces priority of inactive goals over time
  - Implement `get_active_goals(agent_id, n=3) → list[GoalState]` — top N by priority*confidence
  - Implement `has_goal_shifted(agent_id) → bool` — detects if a new goal became primary
  - Define trigger-to-goal mapping table (e.g., tension_high → "deescalate", leverage_dropping → "regain_advantage")
  - TDD: Write tests FIRST: add goal, priority decay over turns, trigger causes goal shift, has_goal_shifted on transition, goal expiration after TTL

  **Must NOT do**:
  - No LLM calls — all priority shifts are rule-based
  - No dependency on Language Engine

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: N/A
  - Reason: State machine design for dynamic agent priorities

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 12)
  - **Blocks**: Tasks 11, 22
  - **Blocked By**: Tasks 2 (needs InternalState for goal field), 4 (needs BehaviorEngine for threshold triggers)

  **References**:
  - `backend/app/models.py:Objective` — existing objective model with decay_rate, ttl_turns, priority, confidence
  - `backend/app/models.py:ObjectiveStore` — existing store with add/decay/top
  - `backend/app/runtime/internal_state.py` (Task 2) — CognitiveState.goal_priority
  - `backend/app/runtime/behavior_engine.py` (Task 4) — threshold triggers feed goal evolution

  **Acceptance Criteria**:
  - [ ] `goal_evolution.py` exists with GoalState + GoalEvolution
  - [ ] add_goal creates goal with decay parameters
  - [ ] update_priorities shifts goals based on triggers
  - [ ] decay_all reduces priority over time
  - [ ] get_active_goals returns top N by priority*confidence
  - [ ] has_goal_shifted detects transitions
  - [ ] All TDD tests pass, no LLM calls

  **QA Scenarios**:
  ```
  Scenario: Trigger causes goal priority shift
    Tool: Bash (pytest)
    Preconditions: GoalEvolution with goal "maximize_revenue" (priority=4.0)
    Steps:
      1. Run test_trigger_causes_goal_shift
      2. Test calls update_priorities("agent_a", ["credibility_under_attack"])
      3. Asserts "defend_reputation" priority > "maximize_revenue" priority
    Expected Result: Goal priorities shift based on trigger
    Evidence: .sisyphus/evidence/task-7-goal-shift.txt

  Scenario: Goal decays and expires
    Tool: Bash (pytest)
    Preconditions: GoalEvolution with goal (priority=3.0, ttl=10)
    Steps:
      1. Run test_goal_decay_and_expire
      2. Test calls decay_all(current_turn=15)
      3. Asserts goal is expired (is_active=False)
    Expected Result: Goal expires after TTL
    Evidence: .sisyphus/evidence/task-7-goal-expire.txt
  ```

  **Evidence to Capture**:
  - [ ] task-7-goal-shift.txt
  - [ ] task-7-goal-expire.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add Goal Evolution Engine`
  - Files: `backend/app/runtime/goal_evolution.py`, `backend/tests/test_goal_evolution.py`
  - Pre-commit: `pytest backend/tests/test_goal_evolution.py -v`

- [x] 8. Memory System (Episodic + Semantic)

  **What to do**:
  - Create `backend/app/runtime/memory_system.py`
  - Define `EpisodicMemory` class — circular buffer of recent events per agent
    - Store last N events (configurable, default=50)
    - Events tagged with: type, agent_id, importance (0-1), timestamp
    - Implement `add_event(event)` with importance scoring based on event type + emotional impact
    - Implement `get_recent(n=10) → list` — most recent N events
    - Implement `get_important(threshold=0.7) → list` — events above importance threshold
  - Define `SemanticMemory` class — compressed summaries of past events
    - Maintain per-agent summary of: key positions taken, concessions made, red lines, alliances formed
    - Implement `extract_semantics(episodic_events)` — generate/update summaries from episodic buffer
    - Implement `get_summary(agent_id) → dict` — current semantic summary
  - Define `MemorySystem` class combining both, providing unified API
  - TDD: Write tests FIRST: episodic add+retrieve, importance scoring (>0.5 for high-impact events), semantic summary extraction, memory pruning at capacity, serialization

  **Must NOT do**:
  - No LLM calls — importance scoring is rule-based
  - No database dependency — in-memory only (persistence is separate concern)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: N/A
  - Reason: Memory architecture with compression strategies

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 9, 12)
  - **Blocks**: Task 11 (needs memory for AgentRuntime)
  - **Blocked By**: Task 4 (needs BehaviorEngine for event structure)

  **References**:
  - `backend/app/runtime/agent.py:AgentRuntime.memory` — existing flat memory list (will be replaced by MemorySystem)
  - `backend/app/models.py:AgentMemory` — existing model with positions, concessions, red_lines

  **Acceptance Criteria**:
  - [ ] `memory_system.py` exists with EpisodicMemory + SemanticMemory + MemorySystem
  - [ ] Episodic buffer stores last N events, drops oldest at capacity
  - [ ] Importance scoring ranges 0-1 with threshold filtering
  - [ ] Semantic summary extracts key positions and concessions
  - [ ] MemorySystem provides unified API
  - [ ] All TDD tests pass

  **QA Scenarios**:
  ```
  Scenario: Episodic memory maintains circular buffer
    Tool: Bash (pytest)
    Preconditions: EpisodicMemory with capacity=5
    Steps:
      1. Run test_episodic_circular_buffer
      2. Test adds 7 events
      3. Asserts len(get_recent()) == 5
      4. Asserts oldest events dropped
    Expected Result: Circular buffer works correctly
    Evidence: .sisyphus/evidence/task-8-episodic-buffer.txt

  Scenario: Importance scoring filters high-impact events
    Tool: Bash (pytest)
    Preconditions: EpisodicMemory with mixed importance events
    Steps:
      1. Run test_importance_filtering
      2. Test adds challenge (importance=0.8) and greeting (importance=0.2)
      3. Calls get_important(threshold=0.5)
      4. Asserts only challenge event returned
    Expected Result: High-importance events filtered correctly
    Evidence: .sisyphus/evidence/task-8-importance.txt
  ```

  **Evidence to Capture**:
  - [ ] task-8-episodic-buffer.txt
  - [ ] task-8-importance.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add Memory System (episodic + semantic)`
  - Files: `backend/app/runtime/memory_system.py`, `backend/tests/test_memory_system.py`
  - Pre-commit: `pytest backend/tests/test_memory_system.py -v`

- [x] 9. Private Strategic Thought System

  **What to do**:
  - Create `backend/app/runtime/private_thought.py`
  - Define `StrategicThought` dataclass: `public_position: str`, `private_concern: str`, `strategy: str`, `confidence: float`, `created_turn: int`, `last_revised: int`
  - Define `PrivateThoughtSystem` class managing per-agent strategic thoughts
  - Implement `set_position(agent_id, public, private, strategy)` — sets current strategic stance
  - Implement `get_public(agent_id) → str` — what the agent says publicly
  - Implement `get_private(agent_id) → str` — what the agent actually thinks
  - Implement `get_strategy(agent_id) → str` — the agent's current strategy
  - Implement `revise(agent_id, new_events: list)` — updates position based on new information
  - Implement `detect_hidden_motive(observer_id, target_id) → float` — probability that target has hidden agenda (based on inconsistency between public/private positions over time)
  - Implement `to_llm_context(agent_id) → dict` — structured context for LLM (includes public position but strategy is hinted, not exposed)
  - TDD: Write tests FIRST: set+get round-trip, public≠private after contradictory events, revise updates position, hidden motive detection, LLM context format

  **Must NOT do**:
  - Private thoughts must NOT be exposed via public endpoints (only in internal state for simulation context)
  - Hidden motive detection must be probabilistic, not deterministic (agents can't be certain)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: N/A
  - Reason: Information hiding and strategic reasoning system

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 12)
  - **Blocks**: Tasks 11, 19, 22
  - **Blocked By**: Tasks 2 (needs InternalState for goal tracking), 4 (needs BehaviorEngine for event processing)

  **References**:
  - `backend/app/runtime/agent.py:AgentRuntime._build_turn_prompt()` — existing prompt that includes `internal_reasoning` (will be replaced by PrivateThought)
  - `backend/app/models.py:StakeholderV2.hidden_agenda` — existing hidden agenda field

  **Acceptance Criteria**:
  - [ ] `private_thought.py` exists with StrategicThought + PrivateThoughtSystem
  - [ ] public ≠ private after contradictory events
  - [ ] revise() updates position based on evidence
  - [ ] detect_hidden_motive() returns probability 0-1
  - [ ] to_llm_context() includes public position without exposing private strategy
  - [ ] All TDD tests pass

  **QA Scenarios**:
  ```
  Scenario: Public position differs from private concern
    Tool: Bash (pytest)
    Preconditions: PrivateThoughtSystem with agent
    Steps:
      1. Run test_public_private_diverge
      2. Test sets public="support partnership" and private="fear acquisition"
      3. Asserts get_public() != get_private()
    Expected Result: Public and private positions are distinct
    Evidence: .sisyphus/evidence/task-9-public-private.txt

  Scenario: Hidden motive detection improves with inconsistency
    Tool: Bash (pytest)
    Preconditions: PrivateThoughtSystem with 10 turns of consistent positions
    Steps:
      1. Run test_hidden_motive_detection
      2. Test adds contradictory events (public says support, private shows opposition)
      3. Calls detect_hidden_motive("observer", "target")
      4. Asserts probability increases after contradiction
    Expected Result: Hidden motive detection score rises
    Evidence: .sisyphus/evidence/task-9-hidden-motive.txt
  ```

  **Evidence to Capture**:
  - [ ] task-9-public-private.txt
  - [ ] task-9-hidden-motive.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add Private Strategic Thought system`
  - Files: `backend/app/runtime/private_thought.py`, `backend/tests/test_private_thought.py`
  - Pre-commit: `pytest backend/tests/test_private_thought.py -v`

- [x] 10. Wire Behavior Engine into AgentRuntime

  **What to do**:
  - Modify `backend/app/runtime/agent.py:AgentRuntime` to use BehaviorEngine instead of LLM for state
  - Add `self.behavior_engine: BehaviorEngine` as a dependency (passed to AgentRuntime constructor)
  - Replace flat `self.memory: list[dict]` with `self.memory_system: MemorySystem` (from Task 8)
  - Replace `self._compute_urgency()` with call to `self.behavior_engine.get_urgency(agent_id)`
  - Replace `_build_system_prompt()` state injection — instead use `self.behavior_engine.get_state_for_llm(agent_id)` to feed structured context
  - Replace `_build_turn_prompt()` — LLM now receives behavior state snapshot + recent events, NOT raw prompt
  - Call `self.behavior_engine.process_turn()` after each turn publishes
  - Call `self.behavior_engine.tick()` between turns
  - Update constructor signature: `AgentRuntime(..., behavior_engine, memory_system, private_thought)`
  - TDD: Write tests FIRST: AgentRuntime with mocked BehaviorEngine processes turns correctly, state updates propagate, LLM prompt contains behavior state, language-only LLM mode (LLM can't override state)

  **Must NOT do**:
  - Keep `_parse_llm_turn()` — LLM output parsing stays
  - Don't change the `run()` loop structure — only what happens inside it
  - Don't remove the existing `openrouter_completion` LLM call — it becomes the Language Engine call

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: N/A
  - Reason: Critical integration task — wires all new modules into existing runtime

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential after dependencies)
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Tasks 13, 14, 15, 16
  - **Blocked By**: Tasks 4 (BehaviorEngine), 7 (GoalEvolution), 8 (MemorySystem), 9 (PrivateThought)

  **References**:
  - `backend/app/runtime/agent.py` — existing AgentRuntime (full file)
  - `backend/app/runtime/behavior_engine.py` (Task 4)
  - `backend/app/runtime/goal_evolution.py` (Task 7)
  - `backend/app/runtime/memory_system.py` (Task 8)
  - `backend/app/runtime/private_thought.py` (Task 9)

  **Acceptance Criteria**:
  - [ ] AgentRuntime uses BehaviorEngine for all state management
  - [ ] LLM prompt includes structured behavior state snapshot
  - [ ] process_turn() called after each agent action
  - [ ] tick() called between turns
  - [ ] MemorySystem replaces flat memory list
  - [ ] PrivateThought system used for strategic reasoning
  - [ ] All TDD tests pass
  - [ ] Existing simulation flow still works (backward compatible)

  **QA Scenarios**:
  ```
  Scenario: AgentRuntime processes turn through BehaviorEngine
    Tool: Bash (pytest)
    Preconditions: Mocked BehaviorEngine + AgentRuntime with 2 agents
    Steps:
      1. Run test_agent_runtime_uses_behavior_engine
      2. Test runs one simulation turn
      3. Asserts behavior_engine.process_turn() was called
      4. Asserts agent._last_event_index updated
    Expected Result: BehaviorEngine is used for all state transitions
    Evidence: .sisyphus/evidence/task-10-uses-be.txt

  Scenario: LLM prompt contains behavior state
    Tool: Bash (pytest)
    Preconditions: Mocked BehaviorEngine returns known state
    Steps:
      1. Run test_llm_prompt_contains_state
      2. Test triggers turn generation
      3. Asserts LLM prompt includes: emotion, trust, goal
    Expected Result: LLM receives behavior state as context
    Evidence: .sisyphus/evidence/task-10-llm-prompt.txt
  ```

  **Evidence to Capture**:
  - [ ] task-10-uses-be.txt
  - [ ] task-10-llm-prompt.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): wire BehaviorEngine into AgentRuntime`
  - Files: `backend/app/runtime/agent.py`, `backend/tests/test_agent_runtime.py`
  - Pre-commit: `pytest backend/tests/test_agent_runtime.py -v`

- [x] 11. Update Scheduler to Consume Behavior Engine State

  **What to do**:
  - Modify `backend/app/runtime/scheduler.py:Scheduler` to use BehaviorEngine for dynamics
  - Replace stub `_update_dynamics()` with real implementation using BehaviorEngine.tick()
  - Add `self.behavior_engine: BehaviorEngine` as constructor dependency
  - Replace hardcoded speaker resolution with state-informed selection:
    - `_highest_bid()` already works — but use BehaviorEngine.get_urgency() for tiebreaking
    - `_freeform()` — inject tension/dominance into freeform selection
    - `_moderator_decides()` — moderator agent gets state context
  - Publish state events to SharedSpace: include SocialPhysics snapshot with each system event
  - After each turn: call `behavior_engine.process_turn()` (moved from agent) and `behavior_engine.tick()`
  - End conditions can now use SocialPhysics (e.g., "deadlock detected" = tension > 0.9 for 5 turns)
  - TDD: Write tests FIRST: scheduler publishes state events, dynamics updated after each turn, deadlock detection via tension threshold

  **Must NOT do**:
  - Don't change the event streaming/API pattern — keep publishing system events
  - Don't remove existing end condition types — add SocialPhysics-aware conditions

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: N/A
  - Reason: Enhances scheduler with state-aware orchestration

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Task 10)
  - **Blocks**: Tasks 14, 29
  - **Blocked By**: Tasks 10 (wired AgentRuntime)

  **References**:
  - `backend/app/runtime/scheduler.py` — existing scheduler (full file)
  - `backend/app/runtime/behavior_engine.py` (Task 4)
  - `backend/app/runtime/space.py:SharedSpace` — event publishing

  **Acceptance Criteria**:
  - [ ] Scheduler uses BehaviorEngine.tick() between turns
  - [ ] State events (SocialPhysics snapshot) published to SharedSpace
  - [ ] Speaker resolution influenced by state (tension, dominance)
  - [ ] End conditions can observe SocialPhysics thresholds
  - [ ] All TDD tests pass
  - [ ] Existing simulation modes still work

  **QA Scenarios**:
  ```
  Scenario: Scheduler publishes state events
    Tool: Bash (pytest)
    Preconditions: Scheduler with BehaviorEngine, 2 agents
    Steps:
      1. Run test_scheduler_publishes_state
      2. Test runs 3 turns
      3. Asserts space.events contains system events with SocialPhysics data
      4. Asserts trust/leverage/tension values present
    Expected Result: State events published after each turn
    Evidence: .sisyphus/evidence/task-11-state-events.txt

  Scenario: Deadlock detected via tension threshold
    Tool: Bash (pytest)
    Preconditions: Scheduler with high-tension behavior engine
    Steps:
      1. Run test_deadlock_detection
      2. Test configures tension > 0.9 threshold
      3. Runs turns until threshold crossed
      4. Asserts deadlock_risk system event published
    Expected Result: Scheduler detects and reports deadlock
    Evidence: .sisyphus/evidence/task-11-deadlock.txt
  ```

  **Evidence to Capture**:
  - [ ] task-11-state-events.txt
  - [ ] task-11-deadlock.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): update scheduler to consume BehaviorEngine state`
  - Files: `backend/app/runtime/scheduler.py`, `backend/tests/test_scheduler.py`
  - Pre-commit: `pytest backend/tests/test_scheduler.py -v`

- [x] 12. Frontend: Agent Cognitive State Panels

  **What to do**:
  - Create `frontend/components/cognitive-state-panel.tsx` — panel showing current agent cognitive state
    - Emotion bar chart (anger, fear, joy, shame, surprise as horizontal bars)
    - Confidence meter (gauge 0-100%)
    - Certainty indicator
    - Current goal display
  - Create `frontend/components/goal-tracker.tsx` — shows top 3 active goals per agent
    - Goal text, priority bar, confidence indicator
    - Visual indicator when goal shifts (animation)
  - Create `frontend/components/emotion-indicator.tsx` — compact emotion display
    - Colored dots/icons for dominant emotion
    - Transitions between emotions animated
  - Wire these into the simulation display page (consume state from SSE stream)
  - State data expected from backend: `{ agent_id, emotion: {anger, fear, ...}, confidence, certainty, goal, goal_priority }`
  - Connect to existing SSE stream — consume state events published by scheduler (Task 11)

  **Must NOT do**:
  - Don't add new state management (use existing React state from SSE)
  - Don't change existing simulation page layout — add panels as sidebar/tab

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `react`, `typescript`
  - Reason: Data visualization of agent cognitive state

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 10, 11)
  - **Blocks**: Tasks 25, 27
  - **Blocked By**: Tasks 5 (relationship graph patterns), 9 (PrivateThought — needs to understand state shape)

  **References**:
  - `frontend/components/relationship-graph.tsx` (Task 5) — component patterns
  - `frontend/app/` — simulation page consuming SSE
  - `backend/app/runtime/behavior_engine.py` (Task 4) — state shape for data contract

  **Acceptance Criteria**:
  - [ ] `cognitive-state-panel.tsx` renders emotion bars + confidence + certainty
  - [ ] `goal-tracker.tsx` shows top 3 goals with priority bars
  - [ ] `emotion-indicator.tsx` shows dominant emotion
  - [ ] All components consume data from SSE stream
  - [ ] Components render without errors
  - [ ] Visual transitions when state changes

  **QA Scenarios**:
  ```
  Scenario: Cognitive state panel renders emotion bars
    Tool: Playwright
    Preconditions: Frontend dev server on :3000, simulation running with state data
    Steps:
      1. Navigate to simulation page
      2. Assert cognitive-state-panel visible
      3. Assert 5 emotion bars present (anger, fear, joy, shame, surprise)
      4. Assert confidence meter visible
    Expected Result: All state indicators render
    Evidence: .sisyphus/evidence/task-12-state-panel.png

  Scenario: Goal tracker shows active goals
    Tool: Playwright
    Preconditions: Simulation page with goal data streaming
    Steps:
      1. Navigate to simulation page
      2. Assert goal-tracker visible
      3. Assert top goal has priority bar
    Expected Result: Goals displayed with priorities
    Evidence: .sisyphus/evidence/task-12-goal-tracker.png
  ```

  **Evidence to Capture**:
  - [ ] task-12-state-panel.png
  - [ ] task-12-goal-tracker.png

  **Commit**: YES
  - Message: `feat(frontend): add cognitive state panels`
  - Files: `frontend/components/cognitive-state-panel.tsx`, `frontend/components/goal-tracker.tsx`, `frontend/components/emotion-indicator.tsx`
  - Pre-commit: `cd frontend && npm run build`

- [x] 13. Language Engine (LLM Rendering Wrapper)

  **What to do**:
  - Create `backend/app/runtime/language_engine.py`
  - Define `LanguageEngine` class — thin wrapper around LLM call
  - Implement `generate_turn(agent_config, behavior_state, recent_events) → str` — takes deterministic behavior state and generates natural language
    - Input: `BehaviorResult` from BehaviorEngine + recent episodic events
    - Builds minimal prompt with: agent persona, behavior state (emotion, trust, goal), what to respond to, constraints
    - Calls `openrouter_completion` (existing LLM fn)
    - Returns: `{content, action_type, internal_reasoning}`
  - Implement `generate_private_thought(agent_config, behavior_state) → str` — generates private strategic thought from state
  - Implement `validate_response(response: dict, behavior_state) → bool` — validates LLM output is consistent with behavior state (e.g., if trust=0.1, response shouldn't be effusive praise)
  - Temperature selection based on behavior state (high emotion = higher temperature)
  - TDD: Write tests FIRST: prompt construction contains behavior state, validate_response catches inconsistency, temperature mapping correct, mock LLM returns valid JSON

  **Must NOT do**:
  - Language Engine must NOT modify behavior state — it's read-only for LLM
  - The LLM is a subroutine of the Language Engine, not the agent
  - validate_response can reject output, but cannot modify behavior state

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: N/A
  - Reason: Critical architectural boundary — enforces Behavior/Language separation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 15, 16, 17, 18)
  - **Blocks**: Tasks 22, 28
  - **Blocked By**: Tasks 10 (wired AgentRuntime), 4 (BehaviorEngine)

  **References**:
  - `backend/app/runtime/agent.py:AgentRuntime._build_turn_prompt()` — existing prompt builder (being replaced)
  - `backend/app/runtime/agent.py:AgentRuntime._generate_turn()` — existing LLM call (being wrapped)
  - `backend/app/llm/` — existing OpenRouter LLM integration
  - `backend/app/runtime/behavior_engine.py:BehaviorEngine.get_state_for_llm()` (Task 4) — state shape for prompts

  **Acceptance Criteria**:
  - [ ] `language_engine.py` exists
  - [ ] generate_turn() produces valid LLM prompt with behavior state
  - [ ] validate_response() rejects inconsistent responses
  - [ ] Temperature varies with emotional state
  - [ ] No behavior state modification in Language Engine
  - [ ] All TDD tests pass

  **QA Scenarios**:
  ```
  Scenario: Language engine prompt contains behavior state
    Tool: Bash (pytest)
    Preconditions: LanguageEngine with mocked LLM, behavior_state with trust=0.2
    Steps:
      1. Run test_prompt_contains_state
      2. Test calls generate_turn with behavior_state
      3. Inspects prompt sent to mocked LLM
      4. Asserts prompt contains "trust" and "goal" fields
    Expected Result: LLM receives behavior state as context
    Evidence: .sisyphus/evidence/task-13-prompt-state.txt

  Scenario: Validation rejects inconsistent response
    Tool: Bash (pytest)
    Preconditions: LanguageEngine with behavior_state trust=0.1
    Steps:
      1. Run test_validation_rejects_inconsistent
      2. Test passes response with content "I fully trust you"
      3. Calls validate_response(response, behavior_state)
      4. Asserts returns False
    Expected Result: Response inconsistent with trust level rejected
    Evidence: .sisyphus/evidence/task-13-validation.txt
  ```

  **Evidence to Capture**:
  - [ ] task-13-prompt-state.txt
  - [ ] task-13-validation.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add Language Engine (LLM rendering wrapper)`
  - Files: `backend/app/runtime/language_engine.py`, `backend/tests/test_language_engine.py`
  - Pre-commit: `pytest backend/tests/test_language_engine.py -v`

- [x] 14. Enhanced Bidding System (State-Driven Urgency v2)

  **What to do**:
  - Create `backend/app/runtime/bidding.py`
  - Define `BiddingSystem` class that computes urgency from BehaviorEngine state
  - Implement `compute_urgency(agent_id, behavior_state, event) → int 0-100`:
    - Base urgency from personality (aggressiveness)
    - +10 if agent has high dominance (power move)
    - +15 if agent has high anger (emotional reaction)
    - +10 if agent's trust in speaker is low (suspicion)
    - +20 if agent's current goal is directly threatened by event
    - +10 if agent has interruption tendency (archetype-based)
    - -10 if agent has high fear (hesitation)
    - Modulated by stubbornness (less flexible = more consistent bidding)
  - Implement `should_interrupt(agent_id, current_speaker, behavior_state) → bool` — bidding system can request floor interrupt
  - Bid submission still goes through `SharedSpace.submit_bid()` (existing)
  - TDD: Write tests FIRST: urgency varies with state parameters, should_interrupt returns True when conditions met, angry agent bids higher, fearful agent bids lower

  **Must NOT do**:
  - No LLM calls in bidding decisions
  - Don't change SharedSpace.bid_queue interface — only the urgency computation changes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: N/A
  - Reason: Rule-based bidding with state-driven logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 13, 15, 16, 17, 18)
  - **Blocks**: Tasks 16 (interruptions need bidding)
  - **Blocked By**: Tasks 10 (wired AgentRuntime), 1 (SocialPhysics for dominance)

  **References**:
  - `backend/app/runtime/agent.py:AgentRuntime._compute_urgency()` — existing urgency logic (being replaced)
  - `backend/app/runtime/space.py:SharedSpace.submit_bid()` — existing bid interface
  - `backend/app/runtime/behavior_engine.py` (Task 4) — state access
  - `backend/app/models.py:PersonalityProfile` — personality fields

  **Acceptance Criteria**:
  - [ ] `bidding.py` exists
  - [ ] compute_urgency uses behavior state + personality
  - [ ] should_interrupt detects interruption opportunities
  - [ ] All TDD tests pass
  - [ ] No LLM calls

  **QA Scenarios**:
  ```
  Scenario: Angry agent bids higher than calm agent
    Tool: Bash (pytest)
    Preconditions: BiddingSystem with agent_a (anger=0.8) and agent_b (anger=0.2)
    Steps:
      1. Run test_angry_agent_bids_higher
      2. Compute urgency for both agents against same event
      3. Asserts agent_a urgency > agent_b urgency
    Expected Result: Emotional state influences bid urgency
    Evidence: .sisyphus/evidence/task-14-anger-urgency.txt

  Scenario: Threatened goal increases urgency
    Tool: Bash (pytest)
    Preconditions: BiddingSystem with agent, goal under threat
    Steps:
      1. Run test_threatened_goal_increases_urgency
      2. Compute urgency with threatened goal
      3. Asserts urgency > baseline (without threat)
    Expected Result: Goal threat increases bidding urgency
    Evidence: .sisyphus/evidence/task-14-threat-urgency.txt
  ```

  **Evidence to Capture**:
  - [ ] task-14-anger-urgency.txt
  - [ ] task-14-threat-urgency.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add state-driven bidding system`
  - Files: `backend/app/runtime/bidding.py`, `backend/tests/test_bidding.py`
  - Pre-commit: `pytest backend/tests/test_bidding.py -v`

- [x] 15. Interruption System

  **What to do**:
  - Create `backend/app/runtime/interruption.py`
  - Define `Interruption` dataclass: `interrupter_id, target_id, interrupt_type (cut_off | reframe | pile_on | deflect), urgency, turn_index`
  - Define `InterruptionSystem` class
  - Implement `request_interrupt(agent_id, current_speaker, behavior_state) → Interruption | None` — returns Interruption if conditions met
  - Implement `resolve_interrupts(interrupts: list[Interruption]) → Interruption | None` — picks highest-urgency valid interrupt
  - Implement `validate_interrupt(interruption, space_state) → bool` — checks if interruption is valid given current simulation state
  - Integrate with Scheduler: after each system turn signal, check for pending interruptions before granting floor
  - Interruptions reduce trust between interrupter and target (in RelationshipGraph)
  - Interruption types map to SocialPhysics deltas (e.g., cut_off increases tension)
  - TDD: Write tests FIRST: request_interrupt returns None when calm, returns Interruption when angry, resolve picks highest urgency, interrupt reduces trust, interrupt type mapped to correct SocialPhysics delta

  **Must NOT do**:
  - No LLM calls — interruption decisions are state-driven
  - Interruptions must respect moderator_led mode (moderator can deny interruptions)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: N/A
  - Reason: Social dynamics rule system

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 13, 14, 16, 17, 18)
  - **Blocks**: None (standalone module, integrated via scheduler)
  - **Blocked By**: Tasks 14 (bidding), 11 (scheduler)

  **References**:
  - `backend/app/models.py:InterruptType` — existing interrupt types: cut_off, reframe, pile_on, deflect
  - `backend/app/runtime/scheduler.py` — scheduler integration point
  - `backend/app/runtime/relationship_graph.py` (Task 3) — trust reduction on interrupt

  **Acceptance Criteria**:
  - [ ] `interruption.py` exists
  - [ ] request_interrupt returns Interruption when emotional state is high
  - [ ] resolve_interrupts picks highest urgency
  - [ ] validate_interrupt checks simulation context
  - [ ] Interrupt reduces trust in RelationshipGraph
  - [ ] All TDD tests pass

  **QA Scenarios**:
  ```
  Scenario: Angry agent requests interrupt
    Tool: Bash (pytest)
    Preconditions: InterruptionSystem with agent (anger=0.8)
    Steps:
      1. Run test_angry_requests_interrupt
      2. Call request_interrupt("agent_a", "agent_b", state)
      3. Asserts returns Interruption
      4. Asserts interrupt_type in allowed types
    Expected Result: High emotional state triggers interrupt request
    Evidence: .sisyphus/evidence/task-15-interrupt-request.txt

  Scenario: Interrupt reduces trust
    Tool: Bash (pytest)
    Preconditions: InterruptionSystem + RelationshipGraph with trust=0.5
    Steps:
      1. Run test_interrupt_reduces_trust
      2. Resolve interrupt from A to B
      3. Check RelationshipGraph trust A→B
      4. Asserts trust < 0.5
    Expected Result: Trust decreases after interruption
    Evidence: .sisyphus/evidence/task-15-trust-drop.txt
  ```

  **Evidence to Capture**:
  - [ ] task-15-interrupt-request.txt
  - [ ] task-15-trust-drop.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add interruption system`
  - Files: `backend/app/runtime/interruption.py`, `backend/tests/test_interruption.py`
  - Pre-commit: `pytest backend/tests/test_interruption.py -v`

- [x] 16. Whisper/Channel System (Private Communication)

  **What to do**:
  - Create `backend/app/runtime/whisper.py`
  - Define `WhisperChannel` dataclass: `channel_id, participants: list[str], messages: list[WhisperMessage]`
  - Define `WhisperMessage` dataclass: `from_agent, to_agents, content, turn_index, is_private`
  - Define `WhisperSystem` class
  - Implement `create_channel(participants: list[str]) → channel_id` — private channel between subset of agents
  - Implement `send(agent_id, channel_id, content)` — send whisper to channel participants
  - Implement `receive(agent_id, channel_id) → list[WhisperMessage]` — read channel messages
  - Implement `broadcast_whisper(from_agent, content, condition_fn)` — sends to agents matching condition (e.g., all allies)
  - Implement `publicize(whisper_id)` — convert whisper to public event (for dramatic reveals)
  - Whispers are NOT published to SharedSpace — they stay in WhisperSystem
  - Scheduler can optionally allow whispers before/after turns
  - TDD: Write tests FIRST: create channel, send+receive round-trip, agent outside channel can't read, broadcast to allies, publicize moves whisper to public events

  **Must NOT do**:
  - Whispers must NOT be accessible via public SSE stream
  - No LLM calls — whispers are stored/forwarded, not generated by WhisperSystem

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: N/A
  - Reason: Private message routing system

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 13, 14, 15, 17, 18, 19)
  - **Blocks**: Tasks 18 (coalitions use whispers)
  - **Blocked By**: Tasks 11 (needs scheduler integration for whisper timing)

  **References**:
  - `backend/app/runtime/space.py:SharedSpace` — public event system (whispers are the private counterpart)
  - `backend/app/runtime/relationship_graph.py` (Task 3) — allies detection for broadcast

  **Acceptance Criteria**:
  - [ ] `whisper.py` exists
  - [ ] Private channels with participant restriction
  - [ ] send/receive works for authorized agents
  - [ ] broadcast_whisper filters by condition
  - [ ] publicize moves whisper to public events
  - [ ] All TDD tests pass

  **QA Scenarios**:
  ```
  Scenario: Whisper stays private to channel
    Tool: Bash (pytest)
    Preconditions: WhisperSystem with channel [A, B]
    Steps:
      1. Run test_whisper_privacy
      2. A sends whisper to channel
      3. C (outside channel) calls receive
      4. Asserts C gets empty list
      5. B calls receive, asserts whisper received
    Expected Result: Only channel participants can read whispers
    Evidence: .sisyphus/evidence/task-16-whisper-privacy.txt

  Scenario: Whisper publicized becomes public event
    Tool: Bash (pytest)
    Preconditions: WhisperSystem + SharedSpace with events
    Steps:
      1. Run test_whisper_publicize
      2. A sends private whisper
      3. A calls publicize(whisper_id)
      4. Asserts space.events contains the whisper content as public event
    Expected Result: Publicized whisper becomes visible to all
    Evidence: .sisyphus/evidence/task-16-whisper-public.txt
  ```

  **Evidence to Capture**:
  - [ ] task-16-whisper-privacy.txt
  - [ ] task-16-whisper-public.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add whisper/channel system`
  - Files: `backend/app/runtime/whisper.py`, `backend/tests/test_whisper.py`
  - Pre-commit: `pytest backend/tests/test_whisper.py -v`

- [x] 17. Coalition Detection and Evolution

  **What to do**:
  - Create `backend/app/runtime/coalition.py`
  - Define `Coalition` dataclass: `agents: list[str], issue: str, formed_turn: int, strength: float (0-1), last_active_turn: int`
  - Define `CoalitionSystem` class
  - Implement `detect_coalitions(relationship_graph, current_turn) → list[Coalition]` — detects agent pairs where trust > threshold AND shared goal alignment
  - Implement `update_coalitions(turn, relationship_graph)` — updates existing coalition strength, dissolves weak coalitions
  - Implement `get_active_coalitions() → list[Coalition]` — coalitions formed within last N turns
  - Implement `get_coalition_for(agent_id) → list[Coalition]` — coalitions an agent belongs to
  - Implement `dissolve(coalition_id, reason)` — dissolves coalition, records reason
  - Coalition formation/dissolution events published to SharedSpace
  - Coalition affects: trust between members (bonus), bid coordination (members can coordinate bids), combined leverage
  - TDD: Write tests FIRST: detect coalition from trust+goal alignment, strength decays without reinforcement, dissolution at threshold, coalition affects bid coordination

  **Must NOT do**:
  - No LLM calls — coalition detection is rule-based on trust/relationship graph
  - Coalitions are runtime constructs, not LLM decisions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: N/A
  - Reason: Pattern detection in relationship graph

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 13, 14, 15, 16, 18, 19)
  - **Blocks**: Task 20 (frontend coalition viz)
  - **Blocked By**: Tasks 3 (RelationshipGraph), 16 (whispers)

  **References**:
  - `backend/app/models.py:CoalitionSignal` — existing coalition model
  - `backend/app/runtime/relationship_graph.py` (Task 3) — trust matrix for detection
  - `backend/app/runtime/whisper.py` (Task 16) — whispers used for coalition coordination

  **Acceptance Criteria**:
  - [ ] `coalition.py` exists
  - [ ] detect_coalitions finds pairs with high trust + aligned goals
  - [ ] update_coalitions decays strength without reinforcement
  - [ ] dissolve records reason
  - [ ] Coalition events published to SharedSpace
  - [ ] All TDD tests pass

  **QA Scenarios**:
  ```
  Scenario: Coalition detected from trust + goal alignment
    Tool: Bash (pytest)
    Preconditions: CoalitionSystem + RelationshipGraph with trust A→B=0.8
    Steps:
      1. Run test_detect_coalition
      2. Test sets shared goal between A and B
      3. Calls detect_coalitions(graph)
      4. Asserts coalition [A, B] in results
    Expected Result: Coalition formed based on trust + alignment
    Evidence: .sisyphus/evidence/task-17-coalition-detect.txt

  Scenario: Coalition dissolves without reinforcement
    Tool: Bash (pytest)
    Preconditions: CoalitionSystem with coalition at turn 0
    Steps:
      1. Run test_coalition_dissolve
      2. Run update_coalitions for 10 turns without reinforcement
      3. Asserts coalition strength < threshold
      4. Asserts get_active_coalitions() excludes it
    Expected Result: Coalition dissolves from neglect
    Evidence: .sisyphus/evidence/task-17-coalition-dissolve.txt
  ```

  **Evidence to Capture**:
  - [ ] task-17-coalition-detect.txt
  - [ ] task-17-coalition-dissolve.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add coalition detection and evolution`
  - Files: `backend/app/runtime/coalition.py`, `backend/tests/test_coalition.py`
  - Pre-commit: `pytest backend/tests/test_coalition.py -v`

- [x] 18. Hidden Information System

  **What to do**:
  - Create `backend/app/runtime/hidden_info.py`
  - Define `HiddenInfo` dataclass: `info_id, content: str, known_by: list[str]`, `revealed_at_turn: int | None`, `relevance: float`
  - Define `HiddenInformationSystem` class
  - Implement `add_hidden_info(content, known_by_agents, relevance)` — register a piece of hidden information
  - Implement `reveal(info_id, turn_index)` — mark info as revealed (publish to SharedSpace)
  - Implement `is_known_by(info_id, agent_id) → bool` — check if agent knows this info
  - Implement `get_known_infos(agent_id) → list[HiddenInfo]` — all info an agent knows
  - Implement `get_unknown_to(agent_id) → list[HiddenInfo]` — info agent doesn't know (for strategic planning)
  - Implement `conditional_reveal(info_id, condition_fn, turn_index)` — auto-reveal when condition met
  - Integration: PrivateThoughtSystem uses hidden info to inform private strategy
  - Integration: RelationshipGraph updates if an agent is caught hiding information
  - TDD: Write tests FIRST: add hidden info, agent-specific visibility, reveal makes public, conditional reveal triggers, hidden info influences private thought

  **Must NOT do**:
  - Hidden info content is set by simulation config/user, NOT generated by LLM
  - Information asymmetry must be consistent — if agent A knows X, all assertions about X should reference the known info

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: N/A
  - Reason: Information management for asymmetric knowledge

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 13, 14, 15, 16, 17, 19)
  - **Blocks**: Tasks 22 (strategic adaptation needs hidden info)
  - **Blocked By**: Tasks 9 (PrivateThought — integrates with hidden info)

  **References**:
  - `backend/app/models.py:SimulationV2Config.env_flags.hidden_motives` — existing env flag
  - `backend/app/runtime/private_thought.py` (Task 9) — integration point

  **Acceptance Criteria**:
  - [ ] `hidden_info.py` exists
  - [ ] add_hidden_info stores with access control
  - [ ] reveal publishes to SharedSpace
  - [ ] is_known_by checks agent-specific access
  - [ ] conditional_reveal triggers correctly
  - [ ] All TDD tests pass

  **QA Scenarios**:
  ```
  Scenario: Agent-specific information visibility
    Tool: Bash (pytest)
    Preconditions: HiddenInformationSystem with info known_by=["A"]
    Steps:
      1. Run test_agent_specific_visibility
      2. Check is_known_by(info, "A") → True
      3. Check is_known_by(info, "B") → False
    Expected Result: Only specified agents know the info
    Evidence: .sisyphus/evidence/task-18-visibility.txt

  Scenario: Reveal makes info public
    Tool: Bash (pytest)
    Preconditions: HiddenInformationSystem + SharedSpace
    Steps:
      1. Run test_reveal_makes_public
      2. Call reveal(info_id)
      3. Asserts info.revealed_at_turn is set
      4. Asserts space.events contains reveal event with info content
    Expected Result: Revealed info becomes public knowledge
    Evidence: .sisyphus/evidence/task-18-reveal.txt
  ```

  **Evidence to Capture**:
  - [ ] task-18-visibility.txt
  - [ ] task-18-reveal.txt

  **Commit**: YES
  - Message: `feat(behavior-engine): add hidden information system`
  - Files: `backend/app/runtime/hidden_info.py`, `backend/tests/test_hidden_info.py`
  - Pre-commit: `pytest backend/tests/test_hidden_info.py -v`

- [x] 19. Frontend: Coalition Visualization

  **What to do**:
  - Create `frontend/components/coalition-viz.tsx` — visualization of active coalitions
    - Show coalition groups as colored clusters
    - Each coalition shown as circle grouping member agents
    - Line thickness = coalition strength
    - Color fades as coalition weakens
    - Animation on formation/dissolution
  - Create `frontend/components/hidden-info-badge.tsx` — indicator when hidden info exists
    - Badge showing count of unrevealed hidden info known by each agent
    - Reveal animation when info becomes public
  - Wire into simulation page alongside relationship graph
  - Consume coalition events from SSE stream

  **Must NOT do**:
  - Don't expose hidden info content to all users — only reveal events are public
  - Don't change existing simulation page layout

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `react`, `d3`
  - Reason: Interactive coalition visualization

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 13, 14, 15, 16, 17, 18)
  - **Blocks**: Tasks 25, 27
  - **Blocked By**: Tasks 5 (relationship graph patterns), 17 (coalition system), 18 (hidden info)

  **References**:
  - `frontend/components/relationship-graph.tsx` (Task 5) — patterns to follow
  - `backend/app/runtime/coalition.py` (Task 17) — data shape
  - `backend/app/runtime/hidden_info.py` (Task 18) — data shape

  **Acceptance Criteria**:
  - [ ] `coalition-viz.tsx` renders coalition groups
  - [ ] Coalition strength shown visually
  - [ ] Formation/dissolution animated
  - [ ] `hidden-info-badge.tsx` shows info count
  - [ ] Consumes data from SSE stream
  - [ ] Components render without errors

  **QA Scenarios**:
  ```
  Scenario: Coalition groups rendered
    Tool: Playwright
    Preconditions: Frontend dev server on :3000, simulation with active coalition
    Steps:
      1. Navigate to simulation page
      2. Assert coalition-viz visible
      3. Assert coalition group circles member agents
      4. Assert strength indicator visible
    Expected Result: Coalition visualization renders correctly
    Evidence: .sisyphus/evidence/task-19-coalition-viz.png

  Scenario: Hidden info badge shows count
    Tool: Playwright
    Preconditions: Simulation with unrevealed hidden info
    Steps:
      1. Navigate to simulation page
      2. Assert hidden-info-badge visible
      3. Assert badge shows count > 0
    Expected Result: Hidden info badge renders with count
    Evidence: .sisyphus/evidence/task-19-hidden-badge.png
  ```

  **Evidence to Capture**:
  - [ ] task-19-coalition-viz.png
  - [ ] task-19-hidden-badge.png

  **Commit**: YES
  - Message: `feat(frontend): add coalition and hidden info visualization`
  - Files: `frontend/components/coalition-viz.tsx`, `frontend/components/hidden-info-badge.tsx`
  - Pre-commit: `cd frontend && npm run build`

- [x] 20. Strategic Adaptation System

  **What to do**:
  - Create `backend/app/runtime/strategic_adaptation.py`
  - Define `StrategicAdaptation` class — monitors BehavioralEngine state and generates strategy shifts
  - Implement `evaluate_position(agent_id, behavior_state, relationship_graph)` — evaluates if current strategy is working:
    - If trust dropping with key allies → strategy shift toward "repair"
    - If leverage increasing → strategy shift toward "press_advantage"
    - If tension too high → strategy shift toward "deescalate"
    - If goal blocked 3+ turns → strategy shift toward "pivot" or "escalate"
  - Implement `suggest_strategy(agent_id, behavior_state) → str` — returns suggested strategy label
  - Implement `adapt_response(agent_id, incoming_turn, behavior_state) → dict` — modifies how to respond based on strategy (e.g., "repair" → conciliatory tone, "press_advantage" → aggressive)
  - Integration: feeds into PrivateThoughtSystem.revise() and LanguageEngine prompt
  - TDD: Write tests FIRST: evaluate_position detects trust drop, strategy shifts on leverage change, goal blocked 3 turns triggers pivot, adaptation modifies response approach

  **Must NOT do**:
  - No LLM calls — all strategy evaluation is rule-based
  - Strategic adaptation recommends, it does not override — LanguageEngine has final say on language

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: N/A
  - Reason: Rule-based strategic reasoning system

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with 21, 22, 23, 24)
  - **Blocks**: Tasks 26, 28
  - **Blocked By**: Tasks 7 (GoalEvolution), 9 (PrivateThought), 13 (LanguageEngine)

  **References**:
  - `backend/app/runtime/goal_evolution.py` (Task 7) — goal state
  - `backend/app/runtime/private_thought.py` (Task 9) — private strategy
  - `backend/app/runtime/relationship_graph.py` (Task 3) — relationship state
  - `backend/app/runtime/behavior_engine.py` (Task 4) — full state

  **Acceptance Criteria**:
  - [ ] `strategic_adaptation.py` exists
  - [ ] evaluate_position detects trust/leverage/tension shifts
  - [ ] suggest_strategy returns appropriate strategy label
  - [ ] adapt_response modifies response approach
  - [ ] All TDD tests pass
  - [ ] No LLM calls

  **QA Scenarios**:
  ```
  Scenario: Trust drop triggers repair strategy
    Tool: Bash (pytest)
    Preconditions: StrategicAdaptation with trust dropping 0.3 over 3 turns
    Steps: evaluate_position → asserts strategy is "repair"
    Evidence: .sisyphus/evidence/task-20-repair-strategy.txt

  Scenario: Goal blocked triggers pivot
    Tool: Bash (pytest)
    Preconditions: Same goal blocked for 4 turns
    Steps: evaluate_position → asserts strategy is "pivot"
    Evidence: .sisyphus/evidence/task-20-pivot-strategy.txt
  ```

  **Evidence to Capture**: [ ] task-20-repair-strategy.txt, [ ] task-20-pivot-strategy.txt
  **Commit**: YES — `feat(behavior-engine): add strategic adaptation system`

- [x] 21. Emotional Dynamics System

  **What to do**:
  - Enhance `backend/app/runtime/internal_state.py` (Task 2) with emotional dynamics
  - Implement `contagion(agents_states)` — emotions spread between agents (anger begets anger)
  - Implement `escalation(de-escalation)` trigger — repeated challenges increase anger non-linearly
  - Implement `emotional_memory(event, current_emotion)` — past events color current emotional response
  - Implement `suppression(agent_id, behavior_state)` — agent can suppress emotion display based on archetype/personality
  - Implement `emotional_expression(agent_id, behavior_state) → str` — how emotion affects language (e.g., anger → shorter sentences, fear → hedging)
  - TDD: contagion spreads anger between agents, escalation increases non-linearly, suppression reduces visible emotion, emotional_expression maps to language style

  **Must NOT do**: No LLM calls for emotional computation — only for language expression
  **Category**: `deep` **Skills**: N/A **Parallel**: Wave 4 (with 20, 22, 23, 24)
  **Blocks**: 24, 26 **Blocked By**: 2 (InternalState), 10 (AgentRuntime)

  **Acceptance Criteria**: [ ] contagion implemented, [ ] escalation trigger works, [ ] suppression reduces visible emotion, [ ] All tests pass
  **Evidence**: task-21-contagion.txt, task-21-escalation.txt
  **Commit**: `feat(behavior-engine): add emotional dynamics system`

- [x] 22. Trust Evolution System

  **What to do**:
  - Modify `backend/app/runtime/scheduler.py` (Task 11) — populate trust_matrix from RelationshipGraph
  - Create `backend/app/runtime/trust_evolution.py` if logic becomes complex
  - Trust between agents changes based on:
    - Agreement: trust +delta (modulated by agreement importance)
    - Challenge/disagreement: trust -delta
    - Interruption: trust -delta (larger if public)
    - Coalition action: trust +delta
    - Betrayal (hidden info revealed): trust -delta (large)
    - Repeated patterns: trust change accelerates (consistency amplifies)
  - Trust affects: bid coordination, coalition formation, argument acceptance (high trust = more persuasive)
  - TDD: Write tests FIRST: agreement increases trust, challenge decreases, betrayal causes large drop, repeated positive interactions accelerate

  **Must NOT do**: No LLM calls for trust computation
  **Category**: `unspecified-high` **Parallel**: Wave 4 (with 20, 21, 23, 24)
  **Blocked By**: 3 (RelationshipGraph), 11 (Scheduler)
  **References**: `backend/app/models.py:SimulationState.trust_matrix`, `backend/app/runtime/relationship_graph.py` (Task 3)

  **Acceptance Criteria**: [ ] trust_matrix populated from RelationshipGraph, [ ] all trust delta rules work, [ ] repeated patterns amplify, [ ] All TDD pass
  **Evidence**: task-22-trust-agreement.txt, task-22-trust-betrayal.txt
  **Commit**: `feat(behavior-engine): add trust evolution system`

- [x] 23. Leverage Tracking and Visualization

  **What to do**:
  - Modify `backend/app/runtime/scheduler.py` (Task 11) — populate leverage_scores from SocialPhysics
  - Leverage = ability to compel action from others — computed from: dominance, credibility, coalition strength, hidden info held
  - Implement `compute_leverage(agent_id, behavior_state, coalitions, hidden_info) → float`
  - Publish leverage changes as system events
  - Pre-commit: populate `models.py:SimulationState.leverage_scores` from runtime
  - TDD: leverage reflects dominance+credibility, coalition membership adds leverage, hidden info adds leverage

  **Must NOT do**: No LLM calls
  **Category**: `unspecified-high` **Parallel**: Wave 4 (with 20, 21, 22, 24)
  **Blocked By**: 1 (SocialPhysics for dominance), 17 (coalition), 18 (hidden info)
  **References**: `backend/app/models.py:SimulationState.leverage_scores`, `backend/app/runtime/social_physics.py` (Task 1)

  **Acceptance Criteria**: [ ] leverage computed from multiple factors, [ ] changes published as events, [ ] All tests pass
  **Evidence**: task-23-leverage-compute.txt, task-23-leverage-coalition.txt
  **Commit**: `feat(behavior-engine): add leverage tracking`

- [x] 24. Agent Archetypes Behavioral Framework

  **What to do**:
  - Create `backend/app/runtime/archetypes.py`
  - Define archetype behavior profiles: `opportunist`, `idealist`, `diplomat`, `predator`, `bureaucrat`, `populist`, `visionary`
  - Each archetype defines:
    - `interrupt_frequency: float (0-1)` — how often they interrupt
    - `aggression_bias: float` — modifier to SocialPhysics aggression
    - `coalition_tendency: float` — how likely to form/join coalitions
    - `compromise_probability: float` — how likely to compromise
    - `emotion_suppression: float` — how much emotions are visible
    - `strategy_preferences: list[str]` — preferred strategies
  - Implement `apply_archetype(agent_config, behavior_state) → ArchetypeModifiers` — returns modifiers
  - Archetype assigned via StakeholderV2 config (existing `tag` field or new `archetype` field)
  - TDD: archetype modifies interrupt frequency, coalition tendency, compromise probability correctly

  **Must NOT do**: Archetypes influence but don't override behavior — they're modifiers, not determiners
  **Category**: `deep` **Parallel**: Wave 4 (with 20, 21, 22, 23)
  **Blocked By**: 21 (Emotion), 22 (Trust)
  **References**: `backend/app/models.py:StakeholderV2` — existing tag field

  **Acceptance Criteria**: [ ] 7 archetypes defined with modifier values, [ ] apply_archetype returns correct modifiers, [ ] archetype influences behavior, [ ] All tests pass
  **Evidence**: task-24-archetype-modifiers.txt, task-24-archetype-behavior.txt
  **Commit**: `feat(behavior-engine): add agent archetypes framework`

- [x] 25. Frontend: Trust/Leverage/Emotion Display

  **What to do**:
  - Create `frontend/components/trust-heatmap.tsx` — heatmap grid showing trust between all agent pairs
    - Rows/cols = agents
    - Cells colored: green (high trust) → yellow → red (low trust)
    - Values shown in cells
  - Create `frontend/components/leverage-bar.tsx` — horizontal bar chart of leverage scores
    - One bar per agent
    - Color gradient based on leverage level
    - Animate on change
  - Integrate emotion-indicator.tsx (Task 12) with emotional dynamics (Task 21)
  - Wire into simulation page, consuming SSE state events

  **Category**: `visual-engineering` **Skills**: `react`, `d3` **Parallel**: Wave 4 (with 26)
  **Blocked By**: 12 (state panels), 19 (coalition viz), 23 (leverage tracking)
  **References**: Task 5, 12, 19 component patterns

  **Acceptance Criteria**: [ ] trust-heatmap shows all agent pairs, [ ] leverage-bar shows scores, [ ] emotion-indicator reflects dynamics, [ ] All render without errors
  **Evidence**: task-25-heatmap.png, task-25-leverage-bar.png
  **Commit**: YES — `feat(frontend): add trust/leverage/emotion displays`

- [x] 26. Full Integration Test: End-to-End Simulation with New Engine

  **What to do**:
  - Create `backend/tests/test_integration_full.py`
  - Build a complete simulation from config → agent setup → run → state verification
  - Test: BehaviorEngine, AgentRuntime, Scheduler, LanguageEngine work together
  - Test: state events published correctly through SSE
  - Test: relationship graph populated after simulation
  - Test: agents have internal state (emotion, confidence)
  - Test: goals evolved during simulation
  - Test: coalitions detected (if conditions met)
  - Test: end condition triggered correctly
  - Test: backward compatibility with old simulation config
  - Use mocked LLM for deterministic LanguageEngine responses

  **Must NOT do**: Don't test LLM output quality — test deterministic state behavior only
  **Category**: `deep` **Parallel**: Wave 4 (sequential) **Blocked By**: 20-25
  **References**: All completed tasks

  **Acceptance Criteria**: [ ] full simulation runs without errors, [ ] all state components populated, [ ] backward compatible, [ ] All tests pass
  **Evidence**: task-26-integration-run.txt, task-26-backward-compat.txt
  **Commit**: YES — `test(behavior-engine): add full integration test suite`

- [x] 27. Moderator AI (Intelligent Scheduler)

  **What to do**:
  - Create `backend/app/runtime/moderator.py`
  - Define `ModeratorAI` class — enhanced scheduler that intelligently manages conversation flow
  - Implement `should_intervene(space_state, behavior_engine) → bool` — detect when moderation needed:
    - Tension > 0.8 → intervene to deescalate
    - One agent dominating (>60% of turns) → balance floor
    - Deadlock risk > 70 → change topic or call recess
    - Silent agent for N turns → pull them in
  - Implement `generate_facilitation(state) → str` — what moderator "says" (uses LanguageEngine)
  - Implement `resolve_speaker_queue(bids, state)` — enhanced resolution considering balance, tension, dominance
  - Implement `timebox_turn(agent_id, remaining_turns) → float` — dynamic turn time limit
  - Integration: replace Scheduler's speaker resolution with ModeratorAI when `mode="moderator_led"`
  - TDD: intervention detection at thresholds, balance correction, deadlock intervention

  **Must NOT do**: Moderator doesn't override agent behavior — it manages floor only
  **Category**: `deep` **Parallel**: Wave 5 (with 28, 29, 30, 31, 32)
  **Blocked By**: 11 (scheduler), 13 (LanguageEngine), 26 (integration test)

  **Acceptance Criteria**: [ ] intervention detection at threshold, [ ] balance correction works, [ ] deadlock intervention, [ ] integration with scheduler, [ ] All TDD pass
  **Evidence**: task-27-intervention.txt, task-27-balance.txt
  **Commit**: `feat(behavior-engine): add Moderator AI`

- [x] 28. Crisis Injection System

  **What to do**:
  - Create `backend/app/runtime/crisis_injector.py`
  - Define `Crisis` dataclass: `type (leak | ultimatum | market_shift | regulatory | leadership_change), target_agent, severity (0-1), content, effects: dict`
  - Define `CrisisInjector` class
  - Implement `inject_crisis(simulation_state, crisis_config)` at specified turn or event trigger
  - Implement crisis effects: modify SocialPhysics (tension spike), agent InternalState (fear increase), relationship_graph (trust shifts), add hidden info
  - Implement `get_available_crises() → list` — returns predefined crisis templates
  - Integration: Scheduler checks for scheduled crises at each turn
  - TDD: crisis injection modifies state correctly, tension spikes on leak, trust shifts on betrayal

  **Category**: `deep` **Parallel**: Wave 5 (with 27, 29, 30, 31, 32)
  **Blocked By**: 26 (integration test), 1 (SocialPhysics), 3 (RelationshipGraph)

  **Acceptance Criteria**: [ ] crisis modifies state correctly, [ ] scheduled injection works, [ ] multiple crisis types, [ ] All tests pass
  **Evidence**: task-28-crisis-state.txt, task-28-crisis-tension.txt
  **Commit**: `feat(behavior-engine): add crisis injection system`

- [x] 29. Time Pressure Dynamics

  **What to do**:
  - Create `backend/app/runtime/time_pressure.py`
  - Define `TimePressure` dataclass: `remaining_turns, urgency_level (0-1), deadline_description, countdown_active`
  - Define `TimePressureSystem` class
  - Implement `initialize(max_turns, deadline_desc)` — setup countdown
  - Implement `tick(current_turn)` — reduces remaining_turns, increases urgency
  - Implement `get_urgency_modifier() → float` — affects bidding urgency, language tempo, concession probability
  - As urgency increases:
    - Bidding becomes more aggressive
    - Language becomes shorter/more direct
    - Compromise probability increases
    - Tension rises
  - Integration: Scheduler checks TimePressure each turn, applies modifiers
  - TDD: urgency increases over time, modifier affects LanguageEngine temperature, compromise probability rises

  **Category**: `unspecified-high` **Parallel**: Wave 5 (with 27, 28, 30, 31, 32)
  **Blocked By**: 26 (integration test)
  **References**: `backend/app/models.py:EnvFlags.time_pressure` — existing env flag

  **Acceptance Criteria**: [ ] urgency increases over time, [ ] modifiers applied to bidding/language, [ ] compromise probability rises, [ ] All tests pass
  **Evidence**: task-29-urgency.txt, task-29-compromise.txt
  **Commit**: `feat(behavior-engine): add time pressure dynamics`

- [x] 30. External Event Injection System

  **What to do**:
  - Create `backend/app/runtime/external_events.py`
  - Define `ExternalEvent` dataclass: `event_id, trigger_turn, type (news | leak | analyst_report | regulatory | market), content, effects: dict`
  - Define `ExternalEventSystem` class
  - Implement `schedule_event(event_config, turn_index)` — schedule event at future turn
  - Implement `process_due_events(current_turn)` — fires all events due at this turn
  - Implement event effects: inject hidden info, shift SocialPhysics, add evidence items
  - Events published as system events to SharedSpace
  - Integration: Scheduler calls process_due_events before each turn
  - TDD: scheduled event fires at correct turn, event modifies state, multiple events on same turn

  **Category**: `unspecified-high` **Parallel**: Wave 5 (with 27, 28, 29, 31, 32)
  **Blocked By**: 26 (integration test)
  **References**: `backend/app/models.py:Subject.evidence_items` — existing evidence field

  **Acceptance Criteria**: [ ] events fire at correct turn, [ ] event effects apply, [ ] multiple events handled, [ ] All tests pass
  **Evidence**: task-30-event-timing.txt, task-30-event-effects.txt
  **Commit**: `feat(behavior-engine): add external event injection`

- [x] 31. Performance and Token Optimization

  **What to do**:
  - Profile current LLM token usage per simulation turn
  - Implement MemorySystem pruning (Task 8) to keep episodic buffer at optimal size
  - Implement prompt compression: only include behavior state deltas (what changed), not full state
  - Implement LLM response caching for identical state+event combinations
  - Optimize: reduce prompt size by 30%+ without losing quality
  - Implement `LanguageEngine.generate_turn()` optimization — reuse system prompt cross-agent where possible
  - Benchmark: before/after token counts, latency per turn
  - TDD: token reduction metrics, response caching hit rate

  **Category**: `quick` **Skills**: N/A **Parallel**: Wave 5 (with 27, 28, 29, 30, 32)
  **Blocked By**: 13 (LanguageEngine), 8 (MemorySystem)

  **Acceptance Criteria**: [ ] token usage reduced by 30%+, [ ] caching works, [ ] prompt compression works, [ ] benchmark report generated
  **Evidence**: task-31-token-benchmark.txt
  **Commit**: `perf(behavior-engine): optimize token usage and prompt size`

- [x] 32. Final Integration Test Suite

  **What to do**:
  - Create `backend/tests/test_integration_advanced.py`
  - Test all Wave 4-5 features working together: strategic adaptation + moderation + crisis + time pressure
  - Test: moderator intervenes when tension high
  - Test: crisis injector triggers state changes mid-simulation
  - Test: time pressure affects behavior
  - Test: external events fire and modify conversation
  - Test: full 20-turn simulation with all systems active
  - Test: LLM output validated by LanguageEngine consistency check
  - Test: all state serializable via /state endpoint
  - Use mocked LLM for deterministic tests

  **Category**: `deep` **Parallel**: Wave 5 (sequential) **Blocked By**: 27-31
  **References**: All completed tasks

  **Acceptance Criteria**: [ ] all features work together, [ ] full simulation runs cleanly, [ ] state serializable, [ ] backward compatible, [ ] All tests pass
  **Evidence**: task-32-advanced-integration.txt
  **Commit**: `test(behavior-engine): add advanced integration test suite`

---

## Final Verification Wave (MANDATORY)

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` (frontend) + pytest (backend). Review for: `as any`/`# type: ignore`, bare excepts, console.log in prod, commented-out code, unused imports.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration. Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec built, nothing beyond spec. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

Each task commits independently. Messages follow conventional commits:
- `feat(behavior-engine): add SocialPhysics state machine`
- `feat(relationship-graph): add NxN trust matrix with decay`
- `test(behavior-engine): add TDD tests for state transitions`
- `feat(frontend): add relationship graph visualization`

Pre-commit: `pytest backend/tests/` for touched modules.

---

## Success Criteria

### Verification Commands
```bash
pytest backend/tests/test_social_physics.py -v  # Expected: all pass
pytest backend/tests/test_relationship_graph.py -v  # Expected: all pass
pytest backend/tests/test_goal_evolution.py -v  # Expected: all pass
pytest backend/tests/test_behavior_engine.py -v  # Expected: all pass
make dev  # Expected: backend starts on :8000, frontend on :3000
```

### Final Checklist
- [ ] Behavior/Language separation verified — no LLM calls in state transitions
- [ ] All SocialPhysics fields update deterministically
- [x] Relationship graph populated after simulation
- [ ] Goals evolve based on thresholds, not LLM generation
- [ ] Private thought stored separately from public content
- [ ] Frontend shows relationship graph + agent state + trust/leverage
- [ ] Existing API surface backward-compatible
- [ ] All TDD tests pass
- [ ] Plan compliance audit approves
- [ ] Code quality review approves
- [ ] All QA scenarios pass
