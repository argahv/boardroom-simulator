# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Human turn input UI in War Room
- `player_mode` toggle in simulation wizard
- App-level error boundary
- Full postmortem detail page with 7 new sections (executive summary, termination details, topic summary, stakeholder reports, key moments timeline, social dynamics, lessons learned)
- ActionType now includes `vote` and `walkaway`
- `get_all_turns_count` method to all database backends
- `GET /simulations/{simulation_id}/turns` endpoint for replay mode
- MIT LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md, SECURITY.md
- GitHub issue templates, PR template, and CI workflow
- Basic simulation example script

### Fixed
- Simulation crash: `AgentRuntime.__init__()` now accepts `memory_system` parameter
- Templates API returning empty due to dual-schema desync (`scenario_templates` vs `tables`)
- Wizard data corruption: `addLibraryPersona()` no longer copies `hidden_agenda` into `backstory`
- SSE events silently dropped: frontend now handles `_index`/`agent_name` field fallbacks
- Replay mode not loading turn transcript
- Evolution approval not applying personality deltas (was cosmetic-only)
- 7 orphaned API functions removed (no backend routes)
- Frontend `Postmortem` type synced from 8 to 19+ fields
- Frontend `SimulationV2Config` missing `auto_research`, `research_topics`, `inject_knowledge`
- Analytics `total_turns` always 0
- Export failing for DB-only simulations (memory-dict requirement removed)
- Agent detail crashing on SQLite backends
- 6 unused component files removed
- Dead v1 `streamSimulation()` function removed
- Analytics font reference using unloaded `Newsreader` typeface
- `player_mode` no longer hardcoded to `false`
- Dead `_cfg_to_v2_config` identity function removed
- `test-application.sh` referencing `/api/stakeholders` (404)
- `.env.example` missing required `OPENROUTER_API_KEY`

### Changed
- SETUP.md: purged v1 LangGraph/Chroma ghost sections, fixed API paths, reconciled version numbers
- README.md: added badges, updated quick start to use `make dev`
- Upgraded frontend types to match backend Pydantic models

## [Initial Release] - 2026-05-24

### Added
- Initial release of Boardroom Simulator
- Multi-agent negotiation simulation with FastAPI + LangGraph backend
- Next.js 16 + React 19 frontend with War Room UI
- Behavior Engine with social physics, internal state, and relationship graph
- Persona CRUD, template system, simulation creation wizard
- SSE streaming for real-time simulation events
- Postmortem generation with LLM enrichment
- Chroma vector store for persona knowledge base
- Tavily web research integration
- Persona evolution system
- Document upload (PDF/DOCX/TXT)
- Cross-session memory persistence
- 23 seeded stakeholders, 6 scenario templates
