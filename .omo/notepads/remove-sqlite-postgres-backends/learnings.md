## Task 6: Delete sqlite.py and postgres.py

- Deleted `backend/app/database/sqlite.py` (804 lines) and `backend/app/database/postgres.py` (1392 lines)
- `__init__.py` already had the old imports removed (only imports `.base` and `.prisma`)
- Zero references to 'sqlite' or 'postgres' remain in any `backend/app/` Python file
- `__pycache__/` cleaned
- Import test fails with prisma.errors missing — pre-existing env dependency issue, not related to this task
- Evidence: `.omo/evidence/task-6-deleted-confirmed.txt`, `.omo/evidence/task-6-import-ok.txt`

## Task 8: Move get_agent_memories_by_id into PrismaBackend class

- Cut standalone fn `get_agent_memories_by_id(db, persona_id)` from `prisma.py` lines 1451-1477
- Added as method `async def get_agent_memories_by_id(self, persona_id: str) -> list[dict]` inside PrismaBackend class at line 1446
- Changes made to function body:
  - Removed `db` parameter, added `self`
  - `db._client_or_raise()` → `self._client_or_raise()`
  - Removed `if not hasattr(db, "_client_or_raise"): return []` guard (redundant inside class)
  - Removed docstring line about "Standalone function"
- Updated caller in `main.py`: removed `from .database import get_agent_memories_by_id as _get_memories`, replaced with `memories = await db.get_agent_memories_by_id(persona_id)`
- `__init__.py` already clean — no import changes needed
- Verified: `grep` shows single match with `self` param; `python -c "from app.database.prisma import PrismaBackend; assert hasattr(PrismaBackend, 'get_agent_memories_by_id')"` passes

