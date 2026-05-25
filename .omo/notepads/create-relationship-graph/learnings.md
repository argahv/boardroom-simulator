# Relationship Graph Module — Learnings

## Patterns
- Tests use `importlib.util.spec_from_file_location` direct-import to bypass broken `__init__.py` import chain
- API convention: `set/update/apply_turn/decay_all` return `Self` for method chaining
- `apply_turn` takes single `turn: dict`, reads `action_type`, `speaker_id`, `target_id` from it
- Unknown action types in `apply_turn` are silent no-ops
- `trust_score` returns `0.5` default (not 0.0) when no relationships
- Non-validated field access in `update` — assumes field exists on entry
- Float comparisons in tests use `pytest.approx`
- Pydantic `model_dump()` for serialization

## Key decisions
- Directed relationships: A→B independent of B→A
- NxN matrix keyed by `(agent_a_id, agent_b_id)` tuples
- Decay formula: `val + (baseline - val) * 0.04`
- Bool fields (alliance) reset to baseline in one decay step
