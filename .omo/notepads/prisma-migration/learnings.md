# Learnings

- PrismaBackend is already fully implemented in `prisma.py` (1368 lines) with `PrismaBackend(DatabaseBackend)` class and standalone `get_agent_memories_by_id(db, persona_id)` function
- `PrismaBackend.__init__()` takes no args — singleton factory pattern works cleanly
- PyPI package for prisma-client-py is `prisma` (not `prisma-client`) — requirements.txt has `prisma>=0.15.0`
- `main.py:1446` imports `get_agent_memories_by_id` from `.database.postgres` — this is the one file that will need updating in a future PR to switch to `.database` (after both backends coexist)

## F3 QA Findings

### Passing: 10/10 scenarios
All CRUD operations across stakeholders, templates, simulations (v1+v2), state snapshots, persona docs/evolution/research, agent goals, and agent queries work correctly.

### Issues Found

1. **`_row_to_stakeholder` json.dumps whitespace (low)** — Line 117 uses `json.dumps(row.personality or {})` without `separators=(',',':')`, so compact JSON string `'{"v":1}'` round-trips to `'{"v": 1}'`. Consumers should `json.loads()` anyway.

2. **`get_agent_by_id` queries `personas` table, not `stakeholders` (info)** — Test stakeholder created in `stakeholders` table won't be found. Design intent: `personas` = seeded identities, `stakeholders` = runtime entities. Not a bug.

3. **Cleanup FK ordering** — `delete_stakeholder` fails with `ForeignKeyViolationError` when `persona_evolution` rows reference the stakeholder. Prisma in PG mode doesn't auto-cascade. Workaround: delete dependent evolutions first, or add `ON DELETE CASCADE` to schema.
