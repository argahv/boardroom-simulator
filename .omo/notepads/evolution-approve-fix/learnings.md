## 2026-05-27: Evolution Approval Apply Fix

### Problem
`POST /evolutions/{id}/approve` only set status to "approved" but never applied the proposed personality deltas to the stakeholder record. Feature was cosmetic.

### Solution
Modified 4 files:

1. **`backend/app/database/base.py`** — Added two abstract methods:
   - `get_evolution(evolution_id) → Optional[PersonaEvolution]` — fetch single evolution by ID
   - `update_persona_v2(persona_id, personality, stance=None) → bool` — update v2 persona personality/stance

2. **`backend/app/database/sqlite.py`** — Implemented both methods:
   - `get_evolution`: SELECT from persona_evolution WHERE id = ?
   - `update_persona_v2`: UPDATE stakeholders SET personality = ?, stance = ?, updated_at = ? WHERE id = ?

3. **`backend/app/database/postgres.py`** — Implemented both methods (asyncpg):
   - `get_evolution`: SELECT with $1 placeholder
   - `update_persona_v2`: UPDATE with $1::jsonb cast for personality JSON

4. **`backend/app/main.py`** — Modified approve_evolution route:
   - Fetch evolution record → get persona_id + proposed_deltas
   - Fetch persona via get_persona_v2 → get current personality JSON
   - Parse deltas (JSON) + current personality (JSON)
   - Apply: for each trait (aggressiveness, empathy, stubbornness, verbosity): cur + delta, clamped [0, 100]
   - Save updated personality via update_persona_v2
   - Then approve_evolution (status change)

### Key details
- `proposed_deltas` stored as JSON string like `{"aggressiveness": 5, "empathy": -3, ...}`
- Current personality stored as JSON string in stakeholders.personality column
- Postgres uses `::jsonb` cast for the personality column
- No `proposed_stance` field in PersonaEvolution model — stance update not implemented (would need schema migration)
- Delta clamping: `max(0, min(100, cur + delta))` matches PersonalityProfile field constraints (ge=0, le=100)
- Default value for missing traits: 50 (same as PersonalityProfile defaults)
