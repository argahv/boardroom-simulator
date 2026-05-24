# Logging Audit — `backend/app/runtime/`

Generated: 2026-05-24

## Summary

| Metric | Count |
|--------|-------|
| Python files | 30 |
| Files with logging | 4 |
| Total log calls | 6 |
| Calls with `extra=` (before) | 0 |
| Calls with `extra=` (after) | 12 |

## Per-file breakdown

### 1. `scheduler.py` — 2 existing calls → 4 after enrichment

| Line | Current | Level | Message | Enriched? | Event tag |
|------|---------|-------|---------|-----------|-----------|
| 69 | Existing | WARNING | `Agent %s timed out, skipping` | ✅ extra added | `agent_timeout` |
| 204 | Existing | DEBUG | `Neo4j write skipped for turn %d` | ✅ extra added | `neo4j_write_skipped` |
| 66 | **NEW** | INFO | `Turn %d — %s has the floor` | ✅ extra added | `turn_granted` |
| 87 | **NEW** | INFO | `Simulation ended: %s` | ✅ extra added | `simulation_ended` |

### 2. `agent.py` — 2 existing calls → 4 after enrichment

| Line | Current | Level | Message | Enriched? | Event tag |
|------|---------|-------|---------|-----------|-----------|
| 222 | Existing | WARNING | `Agent %s turn gen failed: %s` | ✅ extra added | `generation_failed` |
| 256 | Existing | DEBUG | `Agent %s published turn %d` | ✅ extra added | `turn_generated` |
| 70 | **NEW** | DEBUG | `Agent %s bid urgency=%d` | ✅ extra added | `bid_submitted` |
| 238 | **NEW** | INFO | `Agent %s generated turn %d` | ✅ extra added | `turn_generated` |

### 3. `simulation.py` — 1 existing call → 2 after enrichment

| Line | Current | Level | Message | Enriched? | Event tag |
|------|---------|-------|---------|-----------|-----------|
| 51 | Existing | ERROR | `V2_SIM_STREAM_ERR simulation_id=%s` | ✅ extra added | `simulation_error` |
| 43 | **NEW** | INFO | `Simulation %s started` | ✅ extra added | `simulation_started` |

### 4. `language_engine.py` — 1 existing call → 1 after enrichment

| Line | Current | Level | Message | Recommendation |
|------|---------|-------|---------|---------------|
| 136 | Existing | WARNING | `LanguageEngine call failed: %s` | Enrich with `extra={"error": str(exc), "event": "llm_call_failed"}` |

### 5. `behavior_engine.py` — 0 existing calls → 1 after enrichment

| Line | Current | Level | Message | Event tag |
|------|---------|-------|---------|-----------|
| 65 | **NEW** | DEBUG | `Turn %d processed` | `turn_processed` |

### 6. `space.py` — 0 existing calls → 1 after enrichment

| Line | Current | Level | Message | Event tag |
|------|---------|-------|---------|-----------|
| 46 | **NEW** | DEBUG | `Event published: type=%s` | `published` |

### Files with no logging (24 files)

Below files have no `import logging` and no log calls. No enrichment needed.

`_be_wire.py`, `archetypes.py`, `bidding_v2.py`, `coalition_detection.py`,
`crisis_injector.py`, `external_events.py`, `goal_evolution.py`,
`hidden_info.py`, `init_engine.py`, `internal_state.py`, `interruptions.py`,
`leverage_tracker.py`, `memory_system.py`, `moderator.py`, `performance.py`,
`private_thought.py`, `relationship_graph.py`, `social_physics.py`,
`strategic_adaptation.py`, `time_pressure.py`, `trust_evolution.py`,
`trust_leverage_panel.py`, `whisper.py`

## Formatter

Custom `StructuredFormatter` added to `backend/app/runtime/__init__.py`.
Configured in `backend/app/main.py` via `logging.basicConfig`.
Appends `extra` dict as `key=value` pairs after the log message.

## Verification

```
$ grep -c "extra=" backend/app/runtime/*.py
# Before: 0  After: 12
```
