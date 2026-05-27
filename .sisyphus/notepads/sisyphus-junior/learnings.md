
## 2026-05-24: goal_evolution.py + tests

- **Pattern**: Pydantic BaseModel for state containers with `from __future__ import annotations`, `Self` return types for method chaining
- **Pattern**: `importlib.util` module loading for tests (not direct imports) — consistent with existing `test_internal_state.py`
- **Pattern**: `@pytest.fixture` for default instances, class-based test grouping
- **Gotcha**: `write` tool refuses to overwrite existing files (says "Use edit tool instead"). Used `bash python3 -c` to write file content but shell escaping of nested quotes is fragile. Better: use `write` for new files, use temporary Python script for overwrites, or delete first then write.
- **Trigger source mapping**: Each trigger maps to a specific source type (concession/pressure/opportunity) for traceability
- **TTL logic**: Uses `last_reinforced_turn` not `created_turn` so reinforcing extends goal life
- **Decay**: Both priority AND confidence decay at full `decay_rate` (0.05), floored at 0.0
- **Score**: `priority * confidence` for ranking active goals

## 2026-05-27: Human turn input (T15)

- Added human turn input bar to War Room (`frontend/app/simulate/[id]/page.tsx`)
- Uses existing `injectV2Turn(simulationId, stakeholderId, content)` from api.ts
- Optimistic update: appends turn to state immediately, rolls back on error
- Stakeholder selector dropdown populated from `config.stakeholders`
- Textarea with Enter-to-send (Shift+Enter for newline)
- Loading spinner on button while sending
- Error display below input bar
- TypeScript check passes: `npx tsc --noEmit` (0 errors)
- Standing section marker comment pattern matches existing codebase convention
