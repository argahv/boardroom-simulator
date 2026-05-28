# OSS Documentation — Boardroom Simulator

## TL;DR

> **Quick Summary**: Add missing OSS-essential files (LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, SECURITY), fix dangerously outdated SETUP.md (v1 architecture ghosts mislead contributors), repair broken test-application.sh, add .github templates and minimal CI, create examples/ walkthrough.
>
> **Deliverables**:
> - LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md, SECURITY.md
> - Fixed SETUP.md (purge v1 ghosts, fix API paths, reconcile versions)
> - Fixed README.md (badges, consistent quick start)
> - Fixed test-application.sh (API routes)
> - Fixed .env.example (add OPENROUTER_API_KEY)
> - .github/ISSUE_TEMPLATE/*, PULL_REQUEST_TEMPLATE.md, workflows/ci.yml
> - examples/basic_simulation.py
> - Deprecation notices on 3 outdated docs
>
> **Estimated Effort**: Medium (14 tasks, 3 waves)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 4 → Task 8 → Task 12 → Task 14 → F1-F4

---

## Context

### Original Request
"Is everything properly documented? Is there proper docs for an open-source project?"

### Metis Findings
**Critical gaps** beyond initial assessment:
- `test-application.sh` is BROKEN — references `/api/stakeholders` (actual routes are `/stakeholders`)
- SETUP.md contains full ghost sections on LangGraph StateGraph, Chroma memory, guardrails, checkpointing — **none exist in v2 codebase**. Will actively mislead every OSS contributor.
- `.env.example` has only `UPLOAD_DIR` — missing `OPENROOTER_API_KEY` which is **required**. First contributor hits silent failure.
- Version conflicts across docs (Python 3.10 vs 3.11, Node 18 vs 20, Next.js 15 vs 16)
- `docker-compose.yml` has Postgres but no docs mention it
- docs/ files reference outdated v1 LangGraph architecture

---

## Work Objectives

### Core Objective
Make project OSS-ready: fix broken/misleading docs, add standard OSS files, add minimal CI and contribution infrastructure.

### Concrete Deliverables
- 5 new OSS-essential files (LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, SECURITY)
- 2 fixed critical docs (SETUP.md, README.md)
- 1 fixed broken script (test-application.sh)
- 1 fixed env template (.env.example)
- 4 .github files (2 issue templates, PR template, CI workflow)
- 1 example script (basic_simulation.py)
- Deprecation notices on 3 outdated docs

### Definition of Done
- [ ] `grep -r "LangGraph\|Chroma.*memory\|Guardrails system\|Checkpoint System\|Agent-Tool Mapping" SETUP.md` → 0 matches
- [ ] `grep "OPENROUTER_API_KEY" backend/.env.example` → 1 match
- [ ] `./test-application.sh` exits 0
- [ ] `cd frontend && npx tsc --noEmit` passes
- [ ] `cd backend && PYTHONPATH=. python -m pytest tests/ -x -q` passes

### Must Have
- LICENSE (MIT)
- CONTRIBUTING.md with code style, PR process, branch strategy
- CODE_OF_CONDUCT.md (Contributor Covenant)
- CHANGELOG.md with all prior releases documented
- SECURITY.md with reporting process
- SETUP.md purged of v1 ghost sections, API paths fixed, versions reconciled
- README.md with badges, consistent quick start
- Fixed .env.example with OPENROUTER_API_KEY
- Fixed test-application.sh routes
- Minimal GitHub issue/PR templates
- Minimal CI workflow (pytest + tsc)
- 1 example script
- Deprecation notes on 3 outdated docs

### Must NOT Have (Guardrails)
- Do NOT rewrite docs/tech-stack.md — add deprecation notice only (scope creep)
- Do NOT rewrite docs/MVP.md or docs/ROADMAP.md — add deprecation notice only
- Do NOT add CI beyond pytest + tsc — no Docker build, no matrix, no deploy
- Do NOT create more than 2 example files
- Do NOT touch behavior engine or runtime source code
- Do NOT consolidate dual DB schemas
- Do NOT remove docs/claude-design/ (internal, leave as-is)
- Do NOT remove docs/logging-audit.md (leave as-is)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (pytest + tsc)
- **Automated tests**: Tests-after
- **Framework**: pytest (backend), tsc (frontend)

### QA Policy
Every task includes agent-executed verification via grep/bash. Evidence to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Core OSS files — independent):
├── Task 1: Create LICENSE (MIT)
├── Task 2: Create CONTRIBUTING.md
├── Task 3: Create CODE_OF_CONDUCT.md
├── Task 4: Create CHANGELOG.md
├── Task 5: Create SECURITY.md
└── Task 6: Fix .env.example (add OPENROUTER_API_KEY)

Wave 2 (Fix broken docs — sequential-ish):
├── Task 7: Purge v1 ghost sections from SETUP.md + fix API paths + reconcile versions
├── Task 8: Fix README.md (badges, cleanup quick start, remove duplicate content)
├── Task 9: Fix test-application.sh API routes
└── Task 10: Add deprecation notices to 3 outdated docs (MVP.md, ROADMAP.md, tech-stack.md)

Wave 3 (Infrastructure + examples — independent):
├── Task 11: Add .github/ISSUE_TEMPLATE/ (bug_report.md + feature_request.md)
├── Task 12: Add .github/PULL_REQUEST_TEMPLATE.md
├── Task 13: Add .github/workflows/ci.yml (pytest + tsc)
└── Task 14: Create examples/basic_simulation.py

Wave FINAL:
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Build/lint/test suite
├── Task F3: Real QA (run test-application.sh + check all docs)
└── Task F4: Scope fidelity check
```

---

## TODOs

- [ ] 1. Create LICENSE (MIT)

  **What to do**:
  - Create `LICENSE` at project root with MIT license text
  - Year: 2026
  - Author: argahv (or full name if available)
  - Full MIT license template:
  ```
  MIT License

  Copyright (c) 2026 argahv

  Permission is hereby granted...
  ```

  **References**:
  - Standard MIT license: https://opensource.org/licenses/MIT

  **QA Scenarios**:
  ```
  Scenario: LICENSE file exists with MIT text
    Tool: Bash
    Steps: grep "MIT License" LICENSE
    Expected: "MIT License" found
    Evidence: .sisyphus/evidence/task-1-license.txt
  ```

  **Commit**: YES
  - Message: `docs: add MIT LICENSE`

- [ ] 2. Create CONTRIBUTING.md

  **What to do**:
  - Create `CONTRIBUTING.md` at project root
  - Sections:
    1. Welcome + project overview (1-2 sentences)
    2. How to report bugs (link to ISSUE_TEMPLATE)
    3. How to suggest features (link to ISSUE_TEMPLATE)
    4. Development setup (link to SETUP.md + Makefile)
    5. Code style: Python (PEP 8 via ruff), TypeScript (strict mode, eslint next/core-web-vitals), no prettier/biome (project convention)
    6. Branch strategy: feature branches → PR to master
    7. PR checklist: tsc passes, pytest passes, no /api/ prefix, no console.log
    8. Commit style: Conventional Commits (fix:, feat:, chore:, docs:)
    9. Testing: pytest for backend, tsc for frontend

  **References**:
  - `CONTRIBUTING.md` from popular OSS projects (follow format, not content)
  - Project AGENTS.md for conventions
  - Frontend eslint config: `extends: ["next/core-web-vitals", "next/typescript"]`

  **QA Scenarios**:
  ```
  Scenario: CONTRIBUTING.md exists with all sections
    Tool: Bash
    Steps: grep -c "How to Report\|Development Setup\|Pull Request\|Code Style\|Commit" CONTRIBUTING.md
    Expected: ≥5 matches
    Evidence: .sisyphus/evidence/task-2-contributing.txt
  ```

  **Commit**: YES (groups with 3, 5)
  - Message: `docs: add CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md`

- [ ] 3. Create CODE_OF_CONDUCT.md

  **What to do**:
  - Create `CODE_OF_CONDUCT.md` at project root
  - Use Contributor Covenant 2.1 template
  - Email for reporting: use project GitHub issues or generic contact

  **References**:
  - https://www.contributor-covenant.org/version/2/1/code_of_conduct/

  **QA Scenarios**:
  ```
  Scenario: CODE_OF_CONDUCT.md exists
    Tool: Bash
    Steps: grep "Contributor Covenant" CODE_OF_CONDUCT.md
    Expected: 1 match
    Evidence: .sisyphus/evidence/task-3-coc.txt
  ```

  **Commit**: YES (with 2, 5)

- [ ] 4. Create CHANGELOG.md

  **What to do**:
  - Create `CHANGELOG.md` at project root
  - Format: Keep a Changelog (https://keepachangelog.com/)
  - Document all releases from git history:
    - Unreleased section
    - List all prior commits grouped by type (Added, Changed, Fixed, Removed)
  - Use git log to build release history:
    ```
    git log --oneline --reverse --format="%h %s"
    ```
  - Group by semantic version if tags exist, otherwise use date-based

  **References**:
  - `git log --oneline` for commit history
  - https://keepachangelog.com/en/1.1.0/

  **QA Scenarios**:
  ```
  Scenario: CHANGELOG.md has Unreleased and past versions
    Tool: Bash
    Steps: grep "Unreleased\|## \[" CHANGELOG.md
    Expected: ≥2 matches
    Evidence: .sisyphus/evidence/task-4-changelog.txt
  ```

  **Commit**: YES
  - Message: `docs: add CHANGELOG.md`

- [ ] 5. Create SECURITY.md

  **What to do**:
  - Create `SECURITY.md` at project root
  - Brief: how to report vulnerabilities (GitHub Issues for now, private if possible)
  - Supported versions table (current only)
  - Reporting expectations: response within 48h, disclosure timeline

  **References**:
  - Standard SECURITY.md format from GitHub

  **QA Scenarios**:
  ```
  Scenario: SECURITY.md exists with reporting info
    Tool: Bash
    Steps: grep "report\|vulnerability" SECURITY.md
    Expected: ≥2 matches
    Evidence: .sisyphus/evidence/task-5-security.txt
  ```

  **Commit**: YES (with 2, 3)


- [ ] 6. Fix .env.example

  **What to do**:
  - Edit `backend/.env.example`
  - Add required variables at minimum:
  ```env
  OPENROUTER_API_KEY=                     # Required: get from https://openrouter.ai/keys
  OPENROUTER_MODEL=anthropic/claude-sonnet-4
  DATABASE_TYPE=sqlite
  SQLITE_PATH=./data/boardroom.db
  MAX_TURNS=20
  ```
  - Comment each variable with its purpose
  - Keep existing `UPLOAD_DIR`

  **References**:
  - `backend/.env.example` — current file
  - `backend/app/config.py` — all env vars read

  **QA Scenarios**:
  ```
  Scenario: .env.example has OPENROUTER_API_KEY
    Tool: Bash
    Steps: grep "OPENROUTER_API_KEY" backend/.env.example
    Expected: 1 match
    Evidence: .sisyphus/evidence/task-6-env.txt
  ```

  **Commit**: YES
  - Message: `fix: add OPENROUTER_API_KEY to .env.example`


- [ ] 7. Fix SETUP.md — Purge v1 Ghosts + Fix API Paths + Reconcile Versions

  **What to do**:
  - **PURGE** these entire sections from SETUP.md (grep for and remove):
    - LangGraph StateGraph workflow (lines ~156-208)
    - Chroma vector memory (lines ~210-237)
    - Agent-Tool Mapping table (lines ~202-208)
    - Guardrails system (lines ~255-272)
    - Checkpoint System (lines ~239-253)
  - REPLACE with 2-3 sentence note: "This project uses a v2 Behavior Engine runtime. See `docs/ARCHITECTURE.md` for full architecture description."
  - **FIX** all API path references:
    - `/api/stakeholders` → `/stakeholders`
    - `/api/stakeholders/{id}` → `/stakeholders/{id}`
  - **RECONCILE** versions:
    - Python: 3.11+ (remove 3.10 references)
    - Node: 20+ (remove 18 references)
    - Dev command: `make dev` as primary, `uvicorn` as alternative
  - FIX Docker section to mention Postgres (from docker-compose.yml)
  - FIX Frontend Next.js version: 16 (not 15)
  - FIX .env.local setup to not add NEXT_PUBLIC_API_URL (it's not needed with same-host dev)

  **References**:
  - `SETUP.md` — target file
  - `docs/ARCHITECTURE.md` — replacement architecture reference
  - `docker-compose.yml` — Postgres service definition
  - `frontend/package.json` — Next.js version

  **QA Scenarios**:
  ```
  Scenario: SETUP.md has zero v1 ghost references
    Tool: Bash
    Steps: grep -ci "LangGraph\|Chroma.*memory\|Guardrails system\|Checkpoint System\|Agent-Tool Mapping\|BoardroomAgent" SETUP.md
    Expected: 0
    Evidence: .sisyphus/evidence/task-7-no-ghosts.txt

  Scenario: SETUP.md has correct API paths
    Tool: Bash
    Steps: grep -c "/api/" SETUP.md
    Expected: 0
    Evidence: .sisyphus/evidence/task-7-api-paths.txt

  Scenario: Versions reconciled
    Tool: Bash
    Steps: grep -c "3\.10\|Node\.js 18\|Next\.js 15" SETUP.md
    Expected: 0
    Evidence: .sisyphus/evidence/task-7-versions.txt
  ```

  **Commit**: YES
  - Message: `docs: fix SETUP.md — purge v1 ghosts, fix API paths, reconcile versions`


- [ ] 8. Fix README.md — Badges + Cleanup

  **What to do**:
  - Add badge row at top:
  ```markdown
  <div align="center">
  
  # Boardroom Simulator
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  [![Python](https://img.shields.io/badge/python-3.11+-blue.svg)]()
  [![Node](https://img.shields.io/badge/node-20+-green.svg)]()
  [![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)]()
  
  </div>
  ```
  - Move "What Makes This Different" table higher (before Behavioral Dynamics)
  - Remove duplicative "Frontend" bullet list (covered by "Key Endpoints" and docs/)
  - Update Quick Start to use `make dev` as primary command
  - Add `make install` step before dev
  - Add link to SETUP.md for full setup guide
  - Update "Verification" to use both `make test` or explicit commands
  - Remove duplicate content shared with SETUP.md (API endpoint table detail — keep brief reference, point to SETUP.md for full list)

  **References**:
  - `README.md` — target file
  - Shields.io for badge URLs
  - `Makefile` — canonical dev commands

  **QA Scenarios**:
  ```
  Scenario: README.md has badges
    Tool: Bash
    Steps: grep -c "shields.io\|badge" README.md
    Expected: ≥2
    Evidence: .sisyphus/evidence/task-8-badges.txt

  Scenario: Quick start uses make dev
    Tool: Bash
    Steps: grep "make dev" README.md
    Expected: ≥1 match
    Evidence: .sisyphus/evidence/task-8-quickstart.txt
  ```

  **Commit**: YES
  - Message: `docs: fix README.md — add badges, fix quick start`


- [ ] 9. Fix test-application.sh

  **What to do**:
  - Read `test-application.sh`
  - Find all `/api/` prefixed routes and fix:
    - `/api/stakeholders` → `/stakeholders`
    - `/api/templates` → `/templates`
    - Any other `/api/` route
  - Check all curl endpoints against actual backend routes (from main.py)
  - Remove any assertions for features that don't exist anymore (v1 checks)
  - Test the script after fixing

  **References**:
  - `test-application.sh` — target
  - `backend/app/main.py` — actual routes
  - Metis found broken `/api/stakeholders` calls

  **QA Scenarios**:
  ```
  Scenario: test-application.sh exits 0
    Tool: Bash
    Steps: bash test-application.sh
    Expected: exit 0
    Evidence: .sisyphus/evidence/task-9-test-script.txt
  ```

  **Commit**: YES
  - Message: `fix: repair test-application.sh API routes`


- [ ] 10. Add Deprecation Notices to Outdated Docs

  **What to do**:
  - Add a banner notice at TOP of these 3 files:
    - `docs/MVP.md`: "⚠️ This document references v1 architecture (LangGraph). Current runtime is v2 Behavior Engine. See `docs/ARCHITECTURE.md`."
    - `docs/ROADMAP.md`: "⚠️ Roadmap references v1 architecture. Some items may be completed or superseded. See current codebase for accurate state."
    - `docs/tech-stack.md`: "⚠️ This document discusses v1 LangGraph/CrewAI architecture. Current v2 runtime uses Behavior Engine (deterministic state machines). See `docs/ARCHITECTURE.md`."
  - Keep all existing content beneath the notice

  **References**:
  - `docs/MVP.md`, `docs/ROADMAP.md`, `docs/tech-stack.md`

  **QA Scenarios**:
  ```
  Scenario: All 3 docs have deprecation notice
    Tool: Bash
    Steps: grep -c "⚠️" docs/MVP.md docs/ROADMAP.md docs/tech-stack.md
    Expected: 1 match in each file
    Evidence: .sisyphus/evidence/task-10-deprecation.txt
  ```

  **Commit**: YES
  - Message: `docs: add deprecation notices to 3 outdated docs`


- [ ] 11. Add GitHub Issue Templates

  **What to do**:
  - Create directory: `.github/ISSUE_TEMPLATE/`
  - Create `bug_report.md`:
    ```markdown
    ---
    name: Bug Report
    about: Report a bug to help us improve
    title: ''
    labels: bug
    assignees: ''
    ---
    
    **Describe the bug**
    A clear description of what the bug is.
    
    **To Reproduce**
    Steps to reproduce the behavior.
    
    **Expected behavior**
    What you expected to happen.
    
    **Screenshots/Logs**
    If applicable.
    
    **Environment:**
    - OS: [e.g. Linux, macOS]
    - Python version:
    - Node version:
    - Backend commit:
    
    **Additional context**
    ```
  - Create `feature_request.md`:
    ```markdown
    ---
    name: Feature Request
    about: Suggest an idea for this project
    title: ''
    labels: enhancement
    assignees: ''
    ---
    
    **Is your feature request related to a problem?**
    A clear description of the problem.
    
    **Describe the solution you'd like**
    What you want to happen.
    
    **Describe alternatives you've considered**
    Other approaches.
    
    **Additional context**
    ```

  **QA Scenarios**:
  ```
  Scenario: Both issue templates exist
    Tool: Bash
    Steps: ls .github/ISSUE_TEMPLATE/
    Expected: bug_report.md and feature_request.md
    Evidence: .sisyphus/evidence/task-11-templates.txt
  ```

  **Commit**: YES (groups with 12, 13)
  - Message: `github: add issue templates, PR template, CI workflow`


- [ ] 12. Add GitHub PR Template

  **What to do**:
  - Create `.github/PULL_REQUEST_TEMPLATE.md`:
  ```markdown
  ## Description
  Brief description of the change.
  
  ## Related Issue
  Fixes #(issue)
  
  ## Type of Change
  - [ ] Bug fix
  - [ ] New feature
  - [ ] Documentation update
  - [ ] Refactor
  - [ ] Other
  
  ## Testing
  - [ ] `cd frontend && npx tsc --noEmit` passes
  - [ ] `cd backend && PYTHONPATH=. python -m pytest tests/ -x -q` passes
  - [ ] Tested with real API call (if applicable)
  
  ## Checklist
  - [ ] My code follows the project code style
  - [ ] I have updated documentation accordingly
  - [ ] My changes generate no new warnings
  - [ ] I have added tests that prove my fix is effective
  ```

  **QA Scenarios**:
  ```
  Scenario: PR template exists
    Tool: Bash
    Steps: grep "Testing\|Checklist" .github/PULL_REQUEST_TEMPLATE.md
    Expected: 2 matches
    Evidence: .sisyphus/evidence/task-12-pr-template.txt
  ```

  **Commit**: YES (with 11, 13)


- [ ] 13. Add GitHub CI Workflow

  **What to do**:
  - Create `.github/workflows/ci.yml`:
  ```yaml
  name: CI

  on:
    push:
      branches: [master]
    pull_request:
      branches: [master]

  jobs:
    backend:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-python@v5
          with:
            python-version: "3.11"
        - name: Install deps
          run: |
            cd backend
            pip install -r requirements.txt
        - name: Test
          run: |
            cd backend
            PYTHONPATH=. python -m pytest tests/ -x -q

    frontend:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: "20"
        - name: Install
          run: |
            cd frontend
            npm ci
        - name: Type check
          run: |
            cd frontend
            npx tsc --noEmit
  ```

  **QA Scenarios**:
  ```
  Scenario: CI workflow exists with backend + frontend jobs
    Tool: Bash
    Steps: grep -c "backend:\|frontend:" .github/workflows/ci.yml
    Expected: 2 matches
    Evidence: .sisyphus/evidence/task-13-ci.txt
  ```

  **Commit**: YES (with 11, 12)


- [ ] 14. Create basic_simulation.py Example

  **What to do**:
  - Create `examples/basic_simulation.py`:
  ```python
  """
  Basic Simulation Example
  
  Creates a simulation with two stakeholders and streams the results.
  
  Usage:
      OPENROUTER_API_KEY=sk-or-... python examples/basic_simulation.py
  
  Requires:
      - Running backend at http://localhost:8000
      - OpenRouter API key in env OPENROUTER_API_KEY
  """
  
  import json
  import os
  import requests
  import time
  
  BASE = "http://localhost:8000"
  
  def main():
      # 1. Check health
      r = requests.get(f"{BASE}/health")
      r.raise_for_status()
      print(f"✓ Backend healthy: {r.json()}")
  
      # 2. List templates
      r = requests.get(f"{BASE}/templates")
      templates = r.json()
      print(f"✓ Loaded {len(templates)} templates")
      for t in templates[:3]:
          print(f"  - {t['name']}")
  
      # 3. Create simulation
      payload = {
          "subject": {
              "name": "Partnership Negotiation",
              "description": "Decide whether to merge or stay independent",
              "stakes_description": "Company future and valuation",
              "attributes": {"revenue": "$100M", "team_size": "500"},
              "evidence_items": ["Market growing 20% YoY"]
          },
          "stakeholders": [
              {
                  "id": "ceo",
                  "name": "Alice",
                  "role": "CEO",
                  "stance": "champion",
                  "backstory": "Founded the company 10 years ago",
                  "hidden_agenda": "IPO within 2 years",
                  "personality": {"aggressiveness": 60, "empathy": 40, "stubbornness": 70, "verbosity": 50}
              },
              {
                  "id": "cfo",
                  "name": "Bob", 
                  "role": "CFO",
                  "stance": "detractor",
                  "backstory": "15 years in corporate finance",
                  "hidden_agenda": "Protect margins above all",
                  "personality": {"aggressiveness": 30, "empathy": 60, "stubbornness": 50, "verbosity": 40}
              }
          ],
          "voltage": 50,
          "model_temperature": "stable",
          "max_turns": 5,
          "action_space": {"actions": []},
          "auto_research": False,
          "inject_knowledge": False
      }
      r = requests.post(f"{BASE}/simulations", json=payload)
      r.raise_for_status()
      sim = r.json()
      sim_id = sim["simulation_id"]
      print(f"✓ Created simulation: {sim_id[:16]}...")
  
      # 4. Stream simulation
      print("○ Streaming simulation...")
      r = requests.get(f"{BASE}/simulations/{sim_id}/stream", stream=True, timeout=120)
      turn_count = 0
      for line in r.iter_lines():
          if not line:
              continue
          line = line.decode()
          if not line.startswith("data: "):
              continue
          event = json.loads(line[6:])
          if event.get("type") == "turn":
              turn_count += 1
              speaker = event.get("speaker", event.get("agent_name", "?"))
              content = event.get("content", "")[:80]
              print(f"  [{turn_count}] {speaker}: {content}...")
          elif event.get("type") == "done":
              print(f"✓ Simulation complete: {turn_count} turns, reason={event.get('reason', 'N/A')}")
          elif event.get("type") == "error":
              print(f"✗ Error: {event.get('message', 'Unknown')}")
              return
  
      # 5. Get postmortem
      r = requests.post(f"{BASE}/simulations/{sim_id}/postmortem")
      pm = r.json()
      print(f"✓ Postmortem: confidence={pm.get('confidence_score')}, "
            f"consensus={pm.get('consensus_rating')}")
  
      # 6. Export
      r = requests.get(f"{BASE}/simulations/{sim_id}/export")
      data = r.json()
      print(f"✓ Export: {len(data.get('turns', []))} turns, "
            f"{len(data.get('state_snapshots', []))} snapshots")
  
      print("\n✓ Demo complete!")
  
  if __name__ == "__main__":
      main()
  ```

  **References**:
  - `backend/app/main.py` — API routes

  **QA Scenarios**:
  ```
  Scenario: Example script has valid Python syntax
    Tool: Bash
    Steps: python -m py_compile examples/basic_simulation.py
    Expected: exit 0
    Evidence: .sisyphus/evidence/task-14-example.txt
  ```

  **Commit**: YES
  - Message: `docs: add basic simulation example`


---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
- [ ] F2. **Build + Lint + Test Suite** — `unspecified-high`
- [ ] F3. **Real QA** — Run test-application.sh + check all docs
- [ ] F4. **Scope Fidelity** — `deep`

---

## Commit Strategy

- **1**: `docs: add MIT LICENSE`
- **2,3,5**: `docs: add CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md`
- **4**: `docs: add CHANGELOG.md`
- **6**: `fix: add OPENROUTER_API_KEY to .env.example`
- **7**: `docs: fix SETUP.md — purge v1 ghosts, fix API paths, reconcile versions`
- **8**: `docs: fix README.md — add badges, fix quick start`
- **9**: `fix: repair test-application.sh API routes`
- **10**: `docs: add deprecation notices to 3 outdated docs`
- **11**: `github: add issue templates`
- **12**: `github: add PR template`
- **13**: `github: add CI workflow`
- **14**: `docs: add basic simulation example`

---

## Success Criteria

### Verification Commands
```bash
# No v1 ghosts in SETUP.md
grep -c "LangGraph\|Chroma.*memory\|Guardrails\|Checkpoint System\|Agent-Tool Mapping" SETUP.md | xargs test 0 -eq

# OPENROUTER_API_KEY in .env.example
grep -q "OPENROUTER_API_KEY" backend/.env.example

# test-application.sh passes
./test-application.sh

# Builds pass
cd frontend && npx tsc --noEmit
cd backend && PYTHONPATH=. python -m pytest tests/ -x -q
```
