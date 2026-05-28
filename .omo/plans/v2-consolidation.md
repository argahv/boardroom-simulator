# v2 Consolidation Plan

## Current State

### Dead Code (0 callers — safe to remove)
| Method | Tables | Status |
|--------|--------|--------|
| `create_v2_simulation` | `v2_simulations` | No callers anywhere |
| `get_v2_simulation` | `v2_simulations` | No callers anywhere |
| `update_v2_simulation_status` | `v2_simulations` | No callers anywhere |
| `insert_v2_turn` | `v2_turns` | No callers anywhere |
| `get_v2_turns` | `v2_turns` | No callers anywhere |
| `insert_agent_goal` | `v2_agent_goals` | No callers anywhere |
| `get_agent_goals_by_id` | `v2_agent_goals` | No callers anywhere |

### Live Code (has callers — must redirect)
| Method | Current Table | Called From |
|--------|--------------|-------------|
| `create_state_snapshot` | `v2_state_snapshots` → `state_snapshots` | `scheduler.py:376`, `main.py:685` |
| `get_state_snapshots_by_simulation` | `v2_state_snapshots` → `state_snapshots` | `main.py:767,789,822` (hasattr) |
| `get_latest_state_snapshot` | `v2_state_snapshots` → `state_snapshots` | `main.py` (hasattr) |
| `delete_old_state_snapshots` | `v2_state_snapshots` → `state_snapshots` | `scheduler.py` (hasattr) |
| `save_postmortem` | `v2_postmortems` → `postmortems` | `scheduler.py:407-408` |
| `get_postmortem` | `v2_postmortems` → `postmortems` | `main.py:1363-1364` (hasattr) |

### Already Unified (no changes needed)
| Method | Uses | Notes |
|--------|------|-------|
| `create_new_simulation` | `simulations` table | Already writes to unified table |
| `insert_new_turn` | `turns` table | Already writes to unified table |
| `get_turns_by_simulation` | `turns` table | Already reads from unified table |

---

## Step-by-Step Plan

### Phase 1: Schema — Rename models in `schema.prisma` (remove v2_ prefix)

Rename these Prisma models and add a `simulation` FK pointing to `simulations.id`:

| Old Model Name | New Model Name | FK Change |
|---------------|---------------|-----------|
| `v2_state_snapshots` | `state_snapshots` | `simulation_id` → FK to `simulations.id` (was FK to `v2_simulations.simulation_id`) |
| `v2_postmortems` | `postmortems` | `simulation_id` → FK to `simulations.id` (was FK to `v2_simulations`) |
| `v2_agent_goals` | `agent_goals` | `simulation_id` → FK to `simulations.id` |

Delete these models entirely (dead tables):
| Delete Model | Because |
|-------------|---------|
| `v2_simulations` | Dead — `create_v2_simulation` has no callers |
| `v2_turns` | Dead — `insert_v2_turn` has no callers |

### Phase 2: Backend — Update `prisma.py`

**Remove dead methods** from `PrismaBackend`:
- `create_v2_simulation()` — gone
- `get_v2_simulation()` — gone
- `update_v2_simulation_status()` — gone
- `insert_v2_turn()` — gone
- `get_v2_turns()` — gone
- `insert_agent_goal()` — gone
- `get_agent_goals_by_id()` — gone

**Redirect live methods** to new model names:
- `create_state_snapshot` → `client.state_snapshots.create(...)` (was `v2_state_snapshots`)
- `get_state_snapshots_by_simulation` → `client.state_snapshots.find_many(...)`
- `get_latest_state_snapshot` → `client.state_snapshots.find_first(order_by={"turn_index": "desc"})`
- `delete_old_state_snapshots` → `client.state_snapshots.delete_many(...)`
- `save_postmortem` → `client.postmortems.upsert(...)` (was `v2_postmortems`)
- `get_postmortem` → `client.postmortems.find_first(...)`

**Update import references**: Any `prisma.v2_*` model references become `prisma.*`.

### Phase 3: Backend — Update `postgres.py` + `sqlite.py`

Same changes as Phase 2 but in the raw SQL implementations:
- Remove dead v2_simulations/v2_turns methods
- Update table names in SQL queries for state_snapshots, postmortems

### Phase 4: Interface — Update `base.py`

**Remove abstract methods** for dead operations:
- `create_v2_simulation` — remove
- `get_v2_simulation` — remove
- `update_v2_simulation_status` — remove
- `insert_v2_turn` — remove
- `get_v2_turns` — remove
- `insert_agent_goal` — remove
- `get_agent_goals_by_id` — remove

### Phase 5: Data Migration

SQL migration script to rename existing tables:
```sql
ALTER TABLE v2_state_snapshots RENAME TO state_snapshots;
ALTER TABLE v2_postmortems RENAME TO postmortems;
ALTER TABLE v2_agent_goals RENAME TO agent_goals;
DROP TABLE IF EXISTS v2_simulations CASCADE;
DROP TABLE IF EXISTS v2_turns CASCADE;
```

Update FK references in `state_snapshots`:
```sql
ALTER TABLE state_snapshots 
  DROP CONSTRAINT IF EXISTS v2_state_snapshots_simulation_id_fkey;
ALTER TABLE state_snapshots
  ADD CONSTRAINT fk_state_snapshot_simulation
  FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE;
```

Same for postmortems and agent_goals.

### Phase 6: Validation

1. `prisma validate` — schema valid
2. `pytest` — all tests pass
3. Full QA sweep — stakeholder CRUD, template dual-write, v1 sims, v2 sims, snapshots, postmortems
4. Git commit: `refactor(db): consolidate v2_* tables into unified models`
