# Boardroom Simulator — Behavior Engine Architecture

## Overview

2-layer architecture: **Behavior Engine** (deterministic state) vs **Language Engine** (LLM rendering).

All agent state transitions are pure math — no LLM calls, no randomness, fully testable.

```
┌──────────────────────────────────┐
│         Language Engine          │  ← LLM renderer
│  get_state_for_llm(agent_id)     │     generates speech
└──────────────┬───────────────────┘
               │ state dict
┌──────────────┴───────────────────┐
│         Behavior Engine          │  ← orchestrator
│  ┌─────────┐ ┌───────┐ ┌──────┐ │
│  │Social   │ │Internal│ │Rel.  │ │
│  │Physics  │ │State   │ │Graph │ │
│  │6 fields │ │5 emotns│ │NxN   │ │
│  └─────────┘ └───────┘ └──────┘ │
└──────────────────────────────────┘
```

## SocialPhysics (`social_physics.py`)

6 fields with deterministic delta updates:

| Field | Range | Default |
|-------|-------|---------|
| trust | 0–1 | 0.5 |
| leverage | 0–1 | 0.5 |
| tension | 0–1 | 0.3 |
| dominance | 0–1 | 0.3 |
| credibility | 0–1 | 0.5 |
| momentum | -1–+1 | 0.0 |

Delta table for 7 action types. Decay: `val + (baseline - val) * 0.05`.

8 threshold triggers: tension>0.8→escalation_risk, trust<0.2→trust_collapse, etc.

## InternalState (`internal_state.py`)

5 emotions: anger, fear, joy, shame, surprise (0–1). + confidence, certainty, focus, goal_priority.

Event effects: challenge→anger+0.15, compromise→joy+0.1, escalate→fear+0.1, etc.

Decay: `val + (baseline - val) * 0.03`.

## RelationshipGraph (`relationship_graph.py`)

NxN directed matrix. Entry: trust, fear, admiration, rivalry, alliance, dependency.

Action effects: coalition→trust+0.08, challenge→trust-0.08+rivalry+0.10, etc.

Queries: get_allies(), get_rivals(), trust_score(), to_matrix().

## BehaviorEngine (`behavior_engine.py`)

process_turn: 1.SocialPhysics→2.InternalState(speaker)→3.InternalState(target)→4.RelationshipGraph→5.Triggers→6.BehaviorResult

tick(): decay all 3 subsystems.

Outputs: get_state_for_llm() for prompts, get_public_state() for frontend.

## Adding Action Types

1. Add delta to social_physics.py DEFAULT_DELTAS
2. Add effect to internal_state.py apply_event()
3. Add effect to relationship_graph.py apply_turn()
4. Add trigger→action mapping in behavior_engine.py

## Known Issue

app/runtime/__init__.py broken chain (simulation→llm→budget missing).
Workaround: importlib direct loading in tests and behavior_engine.py.
