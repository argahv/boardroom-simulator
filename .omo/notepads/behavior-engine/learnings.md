# behavior_engine.py learnings

## Key observations
- `app/runtime/__init__.py` is broken (imports simulation → app.llm → app.budget missing)
- Must use importlib bootstrap pattern to load sibling modules, bypassing package init
- `internal_state.py` requires `agent_id` and `personality=PersonalityProfile()` — not no-arg init
- `internal_state.py` uses `emotion` (not `emotions`) and `directed_at` (not `target`/`target_id`)
- `PersonalityProfile` from `app.models` is safely importable (healthy import chain)
- All 35 tests pass with zero randomness — pure deterministic math

## docs/ARCHITECTURE.md (Session 2026-05-24)
- Created comprehensive architecture doc covering all 4 modules
- Key sections: overview/layer-diagram, module responsibilities, data flow, delta tables, trigger-to-action mapping, adding new actions, testing strategy, known issues
- ASCII diagram uses 3-layer stack: Language Engine → Behavior Engine → SocialPhysics/InternalState/RelationshipGraph
- Delta table documented as markdown table with all 7 action types × 6 fields
- Trigger-to-action mapping: 8 threshold triggers with suggested actions
- "How to add a new action type": 3 required changes (DEFAULT_DELTAS + apply_event + apply_turn)
- Known issues section covers broken __init__.py import chain and workaround

## Edge cases handled
- Unknown agent in get_state_for_llm → returns empty dicts (not crash)
- Empty target_id → no target InternalState update
- Speaker = target → no duplicate InternalState update
- tick() returns self for method chaining

## Session 3 — verification
- Both `behavior_engine.py` and `test_behavior_engine.py` already exist with full implementations
- 35/35 tests pass — zero failures
- Implementation uses threshold-based `_suggest_action` (tension/trust/dominance thresholds) not trigger-keyed `_derive_action` from spec
- Action names differ from spec: "repair_trust" (not "rebuild_trust"), "share_floor" (not "assert_boundaries"), "deepen_alliance" (not "press_advantage")
- No derived actions for losing_ground, credibility_crisis, leverage_advantage, leverage_collapse triggers
- Tests are comprehensive and align with the threshold-based approach

## Session 2 takeaways
- `_suggest_action` priority: tension > 0.7 → trust < 0.25 → dominance > 0.8 → trust > 0.75
- Test `sample_turn()` agent IDs must match engine agent IDs (bug: "agent_1" vs "alice")
- `get_state_for_llm` unknown agent must return empty trust_scores (not ghost 0.5 entries)
- Importlib bootstrap: pre-load `app.runtime` fake module before loading siblings as `app.runtime.xxx`
- Escalate: trust -0.15, tension +0.20 per turn — 2 escalates needed for trust < 0.25 without tension > 0.7
- `emotional_decay()` decays anger toward 0.2 baseline at 3%/tick
- `decay()` uses 5% rate toward baselines (trust→0.5, tension→0.3, etc.)
- RelationshipGraph `decay_all()` uses 4% rate, alliance resets to False immediately
