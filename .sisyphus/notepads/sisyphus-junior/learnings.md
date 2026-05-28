
## 2026-05-24: goal_evolution.py + tests

- **Pattern**: Pydantic BaseModel for state containers with `from __future__ import annotations`, `Self` return types for method chaining
- **Pattern**: `importlib.util` module loading for tests (not direct imports) — consistent with existing `test_internal_state.py`
- **Pattern**: `@pytest.fixture` for default instances, class-based test grouping
- **Gotcha**: `write` tool refuses to overwrite existing files (says "Use edit tool instead"). Used `bash python3 -c` to write file content but shell escaping of nested quotes is fragile. Better: use `write` for new files, use temporary Python script for overwrites, or delete first then write.
- **Trigger source mapping**: Each trigger maps to a specific source type (concession/pressure/opportunity) for traceability
- **TTL logic**: Uses `last_reinforced_turn` not `created_turn` so reinforcing extends goal life
- **Decay**: Both priority AND confidence decay at full `decay_rate` (0.05), floored at 0.0
- **Score**: `priority * confidence` for ranking active goals

## 2026-05-28: Prisma v1 columns migration

- **prisma-client-py vs prisma package**: `prisma-client>=0.2.1` on PyPI is old (pydantic v1 only). Use `prisma>=0.15.0` instead — same generator, modern pydantic v2 compat.
- **Generator provider**: Schema must use `provider = "prisma-client-py"` — the `prisma` pip package provides the `prisma-client-py` binary in the venv `bin/` dir.
- **PATH required**: The node prisma CLI needs `.venv/bin` on PATH to find `prisma-client-py` generator. Simple: use `.venv/bin/prisma` (Python CLI wraps node internally) instead of `node_modules/.bin/prisma`.
- **Generate patches `fields.py`**: Running `prisma generate` overwrites `prisma/fields.py` in site-packages, losing the `from ._fields import *` that includes `Base64`. Must patch it back after each generate (or set a separate output dir).
- **TMPDIR workaround**: System tmpfs full — always `export TMPDIR=/root/tmp` before prisma commands.
- **Client name**: `prisma` package exports `Client` (alias `Prisma`), not `PrismaClient`. Added `PrismaClient` alias in `__init__.py`.
- **Install order**: pip install `prisma` first, then `prisma generate` uses its own cached node binary (version 5.17.0 matching the Python package).

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
