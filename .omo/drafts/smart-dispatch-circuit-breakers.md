# Draft: Smart Dispatch + Circuit Breakers

## Requirements (confirmed)
- Feature 1: Event relevance layer that filters events per-agent before processing
- Feature 2: Circuit breakers for agent failure modes (repetition, emotional loops, timeouts, quality degradation)

## Technical Decisions
- Feature 1: Deterministic `RelevanceScorer` class (no LLM cost), integrated into `AgentRuntime._should_bid()` path
- Feature 2: `CircuitBreakerRegistry` with modular detectors, recovery prompt injection via `_build_system_prompt()`
- Test framework: pytest (existing patterns)
- No new deps needed

## Open Questions
- [RESOLVED] Relevance threshold: use 0.3 as default, configurable via SimulationV2Config
- [RESOLVED] Circuit breaker cooldown: 3 turns default, configurable
- [RESOLVED] Recovery injection: via system prompt append (already has mechanism)

## Scope Boundaries
- INCLUDE: RelevanceScorer, CircuitBreakerRegistry, RepetitionDetector, EmotionalLoopDetector, TimeoutAccumulator, QualityDegradationDetector, tests
- OUT: SharedSpace changes (per-agent conditions), MCP server, frontend changes
