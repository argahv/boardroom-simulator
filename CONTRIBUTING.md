# Contributing to Boardroom Simulator

Thanks for your interest in contributing! This document covers the process.

## How to Report Bugs

Open a [GitHub Issue](https://github.com/argahv/boardroom-simulator/issues) with the `bug` label. Include:

- Steps to reproduce
- Expected vs actual behavior
- Backend logs and browser console output
- Python / Node versions

## How to Suggest Features

Open a [GitHub Issue](https://github.com/argahv/boardroom-simulator/issues) with the `enhancement` label. Describe:

- The problem you're solving
- Your proposed solution
- Alternatives considered

## Development Setup

See [SETUP.md](SETUP.md) for full setup instructions. Quick start:

```bash
make install    # Install backend + frontend deps
make dev        # Start all services
```

## Code Style

### Python
- PEP 8 via ruff (configured in `backend/pyproject.toml`)
- Type hints required for all public functions
- Async/await for all I/O operations

### TypeScript / TSX
- Strict mode (`strict: true` in tsconfig)
- ESLint config extends `next/core-web-vitals` + `next/typescript`
- No prettier or biome — project convention
- No `any` types (use `unknown` if necessary)
- No `console.log` in committed code

### General
- No `/api/` prefix on API routes — routes are at root (`/stakeholders` not `/api/stakeholders`)
- Make all new fields optional (`?`) in TypeScript interfaces to avoid breaking changes
- Follow existing patterns in the codebase

## Branch Strategy

1. Create a feature branch from `master`: `git checkout -b feat/your-feature`
2. Make changes with atomic commits
3. Open a PR against `master`
4. Ensure CI passes
5. Request review

## Pull Request Checklist

Before submitting, verify:

- [ ] `cd frontend && npx tsc --noEmit` passes
- [ ] `cd backend && PYTHONPATH=. python -m pytest tests/ -x -q` passes
- [ ] No `/api/` prefix in new routes
- [ ] No `console.log` in committed code
- [ ] New code includes tests (if applicable)
- [ ] Documentation updated (if applicable)

## Commit Style

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `fix:` — bug fix
- `feat:` — new feature
- `docs:` — documentation only
- `chore:` — maintenance, refactoring, dependencies
- `github:` — CI, templates, workflows

Examples:

```
fix: add memory_system param to AgentRuntime to prevent simulation crash
feat: add human turn input UI to War Room
docs: add MIT LICENSE and contributing guidelines
chore: remove orphaned API functions with no backend routes
github: add CI workflow with pytest and tsc checks
```

## Testing

### Backend
```bash
cd backend && PYTHONPATH=. python -m pytest tests/ -x -q
```

### Frontend
```bash
cd frontend && npx tsc --noEmit
```
