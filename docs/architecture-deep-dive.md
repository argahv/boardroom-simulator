# Architecture Deep Dive — A Synthetic Social Operating System

## Core Design Principle

**Separate Language Generation from Behavioral State Evolution.**

The LLM generates dialogue, tactical reasoning, and persuasive language.
Deterministic systems maintain coherence, social continuity, emotional state, and strategic evolution.

Most agent systems fail because the LLM owns everything, making behavior inconsistent and chaotic.
This system avoids that by design.

---

## The 6-Layer Architecture

```
Layer 6: Narrative Layer (LLM)
    ├── dialogue generation
    ├── persuasion, rhetoric, framing
    └── tactical language selection

Layer 5: Strategic Layer
    ├── multi-turn planning (PlanManager)
    ├── subgoal decomposition
    ├── plan tracking and evaluation
    └── trigger-driven plan creation

Layer 4: Cognitive Layer
    ├── emotional state (5 emotions)
    ├── emotional modulation (emotions → behavior biases)
    ├── hybrid urgency (deterministic + LLM strategy score)
    └── confidence, certainty, focus, goals

Layer 3: Social Physics Layer
    ├── 6-dimension state vectors (trust, leverage, tension, etc.)
    ├── deterministic delta updates per action type
    ├── threshold triggers (escalation_risk, trust_collapse, etc.)
    └── decay to baseline (entropy)

Layer 2: Relationship Layer
    ├── NxN directed relationship matrix
    ├── 6-dimension edges (trust, fear, admiration, rivalry, alliance, dependency)
    ├── coalition detection and tracking
    └── hidden information system

Layer 1: Procedural Layer
    ├── SharedSpace (event-sourced message board)
    ├── Scheduler (speaker selection algorithms)
    ├── bidding system (priority queue)
    └── floor control (who speaks when)
```

---

## Component Map

### `backend/app/runtime/` — 30 Files

| File | Layer | Role |
|------|-------|------|
| `space.py` | 1 | Event-sourced shared state. Append-only event log, bid queue, floor control, `wait_for_change()` for async agents |
| `scheduler.py` | 1 | Procedural governance. 4 speaker modes (moderator_led, alternating, freeform, highest_bid), end conditions, turn validation |
| `agent.py` | 4-6 | Agent loop: observe → think → decide → act. Self-directed bidding, LLM turn generation, emotional integration, strategic plan execution |
| `social_physics.py` | 3 | 6-dimension deterministic state machine. Delta table per action type, decay, 8 threshold triggers |
| `internal_state.py` | 4 | Cognitive state: 5 emotions, confidence, certainty, focus, **emotional modulation** (emotions → behavior biases) |
| `relationship_graph.py` | 2 | NxN directed adjacency matrix. 6 dimensions per edge, ally/rival queries, decay |
| `behavior_engine.py` | 3-4 | Orchestrator: SocialPhysics → InternalState(speaker) → InternalState(target) → RelationshipGraph → triggers → output |
| `strategic_plan.py` | 5 | Multi-turn planning: Plan, SubGoal, PlanManager. Auto-subgoal generation, serialization, trigger-driven creation |
| `goal_evolution.py` | 4-5 | Goal lifecycle: priorities, decay, trigger-goal mapping, plan integration |
| `private_thought.py` | 5 | Public position vs private concern vs strategy. Hidden motive detection via lexical overlap |
| `memory_system.py` | 4 | Episodic memory (recent events) + Semantic memory (positions, concessions, red lines) with importance scoring |
| `bidding_v2.py` | 1 | Urgency calculation (now includes hybrid LLM strategy score) |
| `coalition_detection.py` | 2 | Coalition lifecycle: formation, query by agent, dissolution, decay |
| `whisper.py` | 2 | Private backchannel messaging between agents |
| `hidden_info.py` | 2 | Per-agent secrets with reveal and share mechanics |
| `language_engine.py` | 6 | Thin LLM wrapper — receives structured state, generates speech, does NOT modify state |
| `simulation.py` | — | Wiring: creates SharedSpace, AgentRuntimes, Scheduler, launches async tasks |
| `interruptions.py` | 1 | Interruption logic for floor control |
| `crisis_injector.py` | 1 | External crisis events injected into simulation |
| `external_events.py` | 1 | Scheduled external events |
| `time_pressure.py` | 1 | Temporal pressure dynamics |
| `moderator.py` | 1 | Moderator role logic for led discussions |
| `archetypes.py` | — | Agent archetype definitions (opportunist, idealist, diplomat, etc.) |
| `trust_evolution.py` | 3 | Trust trend evaluation |
| `leverage_tracker.py` | 3 | Leverage scoring |
| `performance.py` | — | Token counting, timing metrics |
| `trust_leverage_panel.py` | — | Frontend data formatting helpers |

---

## Key Data Flows

### Event → Response (Full Path)

```
1. Event published to SharedSpace
2. SharedSpace wakes all agents via Condition
3. Each agent processes event in _should_bid()
4. _compute_urgency() combines:
   - Deterministic formula (personality, state, modulation)
   - Hybrid strategy score (LLM, async, 2s timeout)
5. Highest urgency agent wins floor via bid queue
6. Winning agent's _generate_turn():
   - BehaviorEngine.get_state_for_llm() → state dict
   - InternalState.snapshot() → emotions, modulation
   - PlanManager.get_plan_summary() → active plan context
   - PrivateThought → strategy hints
   - LLM prompt built from all of the above
7. Turn published back to SharedSpace
8. BehaviorEngine.process_turn():
   - SocialPhysics.update() → deterministic deltas
   - InternalState.apply_event() → emotion updates
   - InternalState.compute_modulation() → new biases
   - RelationshipGraph.apply_turn() → pairwise changes
   - Check threshold triggers
9. BehaviorEngine.tick() → decay all states toward baseline
10. PlanManager.evaluate_plan_progress() → subgoal updates
11. Snapshot persisted to v2_state_snapshots table
```

### State Snapshot Schema

```
get_public_state():
├── turn_count: int
├── relationship_matrix: dict[A][B]
│   └── trust, fear, admiration, rivalry, alliance, dependency
├── social_physics[agent_id]:
│   └── trust, leverage, tension, dominance, credibility, momentum, triggers
├── agent_states[agent_id]:
│   ├── emotion: {anger, fear, joy, shame, surprise}
│   ├── confidence, certainty, focus, goal_priority
│   └── modulation:
│       ├── interrupt_bias, challenge_bias, compromise_bias
│       ├── coalition_bias, escalate_bias, statement_bias
│       ├── question_bias, urgency_modifier
└── agent_plans[agent_id]:
    └── [{goal_text, status, confidence, subgoal_count, completed_subgoals}]
```

---

## Emergent Properties

The architecture is designed for **emergent complexity** — behaviors that arise from the interaction of deterministic rules, not from explicit programming.

### Known Emergent Patterns

| Pattern | How It Emerges |
|---------|---------------|
| **Coalition formation** | Shared stance + repeated coalition_signal actions → alliance flag in relationship graph |
| **Emotional contagion** | Challenge → anger → interrupt_bias → more challenges → cycle |
| **Strategic withdrawal** | Fear + low credibility → agent stops bidding → loses influence → further credibility drop |
| **Trust collapse cascade** | Single challenge → trust drop → rivalry increase → more challenges → trust_collapse trigger |
| **Recovery arcs** | trust_collapse → "rebuild_trust" plan → conciliatory behavior → trust recovery |
| **Deadlock** | Mutual high tension + high dominance + no compromise → no progress |
| **Dark horse emergence** | Quiet agent with low dominance suddenly wins floor at critical moment (hybrid urgency) |

### Minimum Requirements for Emergence

- 3+ agents with diverse personalities and stances
- At least 8 turns for emotional arcs to develop
- Hidden agendas enabled (env_flags.hidden_motives = true)
- Hybrid urgency enabled (default)

---

## Observability System

The observability layer was built pre-emptively for the complexity explosion.

| Tool | What It Shows |
|------|---------------|
| **Replay Mode** | Completed simulations render all state panels from persisted snapshots |
| **State Diff Panel** | Per-turn changes in social physics, color-coded (green=desirable, red=undesirable) |
| **Emotional Influence Panel** | Active bias bars showing which emotions are driving behavior |
| **Strategic Plan Panel** | Active plans, subgoal progress, confidence |
| **Goal Visibility** | Agent detail page shows goals, strategies, hidden motive scores |
| **Structured Logging** | All runtime modules emit key=value context with every log |
| **JSON Export** | One-click full simulation state download |

---

## Comparison to Other Architectures

| Aspect | Typical Agent System | This System |
|--------|---------------------|-------------|
| **State management** | LLM context window | Deterministic state machines + event sourcing |
| **Agent autonomy** | Sequential turns | Async, reactive, event-driven |
| **Relationships** | Implicit in prompt text | Explicit NxN matrix with 6 dimensions |
| **Emotions** | Described in prompt | Numeric state with causal behavioral effects |
| **Strategy** | None (reactive) | Multi-turn plans with subgoals |
| **Urgency** | Round-robin or random | Hybrid deterministic + LLM-inferred |
| **Debugging** | Print statements | Replay, state diff, panel visualizations |
