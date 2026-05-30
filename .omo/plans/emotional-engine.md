# Emotional/Social Engine — Generic Personality + Scenario Modulation

## TL;DR

> **Quick Summary**: Wire existing PersonalityProfile, archetype data, and scenario context into the behavior engine's deterministic delta pipeline so that agents with different personalities/archetypes produce measurably different emotional and social dynamics across different scenario types.
>
> **Deliverables**:
> - `personality_modulate()` function + mapping tables in `internal_state.py` and `social_physics.py`
> - `ARCHETYPE_DELTA_MULTIPLIERS` in `archetypes.py` wired into social physics pipeline
> - `ScenarioProfile` dataclass + 6 predefined profiles in new `scenario_profile.py`
> - Updated `BehaviorEngine.__init__()` and `register_agent()` personality data flow
> - Template seed JSONs declaring `scenario_type`
> - Tests for each modulation stage
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves (foundation → modulation → wiring + tests)
> **Critical Path**: Task 1 → Task 4 → Task 6 → Task 8

---

## Context

### Original Request
Implement a generic emotional/social engine where existing PersonalityProfile (aggressiveness, empathy, stubbornness, verbosity), archetypes (opportunist/diplomat/agitator/etc.), and scenario context (crisis/investor/podcast/etc.) modulate emotional and social deltas. Currently all agents start with identical values regardless of personality or scenario.

### Interview Summary
**Key Discussions**:
- The pipeline: base_delta → personality_modulate → archetype_multiply → (no-op for relationship, deferred) → scenario_override
- Modulation formula: `effective_delta = base_delta × (1 + (trait - 50) / 50 × strength)` — multiplicative amplify/dampen
- Personality data flows from AgentConfig through BehaviorEngine to SocialPhysics/InternalState
- Actor's personality modulates their own deltas (not target's)
- `scenario_type` is optional on SimulationConfig, defaults to "debate"
- Voltage is independent from ScenarioProfile (separate scaling)

**Research Findings**:
- `BehaviorEngine.register_agent()` creates `InternalState(agent_id, PersonalityProfile())` — always uses DEFAULT personality
- `PersonalityProfile` traits range 0-100, only verbosity used in prompts, aggressiveness in bidding
- Archetypes exist with `emotion_bias`, `personality_bias`, `tendencies` — none wired to behavior engine
- All scenarios start with identical SocialPhysics defaults (trust=0.5, tension=0.3)
- `SocialPhysics.update()` accepts context dict — can pass personality through it
- 38 test files follow `tests/test_*.py` pattern mirroring `runtime/`

### Metis Review
**Identified Gaps** (addressed):
- Formula choice: multiplicative amplify/dampen (composes cleanly with archetype multipliers)
- Personality data flow: pass through context dict to SocialPhysics.update(), avoid signature change
- Actor vs target personality: actor's personality modulates their action deltas
- `scenario_type`: optional field on SimulationConfig, defaults to "debate"
- Voltage: independent dimension, no interaction with ScenarioProfile
- Test strategy: tests-after (update existing + new test_scenario_profile.py)

---

## Work Objectives

### Core Objective
Wire PersonalityProfile, archetype, and scenario context into the behavior engine's delta pipeline so emotional and social dynamics vary by agent personality and scenario type.

### Concrete Deliverables
- `personality_modulate()` function in `internal_state.py` with `PERSONALITY_EMOTION_MAP`
- Personality-modulated `apply_event()` in `InternalState`
- `PERSONALITY_SOCIAL_MAP` + modulated `update()` in `SocialPhysics`
- `ARCHETYPE_DELTA_MULTIPLIERS` in `archetypes.py`
- `ScenarioProfile` dataclass + `SCENARIO_PROFILES` dict in new `scenario_profile.py`
- Updated `BehaviorEngine` accepting `scenario_type` and passing personality data
- Template seed JSONs with `scenario_type` field
- Test files: updates to 4 existing + 1 new

### Definition of Done
- [x] `pytest tests/test_internal_state.py` passes with personality modulation tests
- [x] `pytest tests/test_social_physics.py` passes with personality + archetype tests
- [x] `pytest tests/test_archetypes.py` passes with delta multiplier tests
- [x] `pytest tests/test_behavior_engine.py` passes with scenario_type init tests
- [x] `pytest tests/test_scenario_profile.py` passes (new file, all 6 profiles verified)
- [x] All 38 existing tests pass unchanged
- [x] Default personality (50/50/50/50) produces identical deltas to current code

### Must Have
- Personality modulation formula: `effective_delta = base_delta × (1 + (trait - 50) / 50 × strength)`
- Archetype delta multipliers are multiplicative on computed deltas (after personality)
- ScenarioProfile only sets initial state, not runtime overrides
- Backward compat: default personality = no modulation, unknown scenario_type = "debate" defaults
- All existing tests pass unchanged

### Must NOT Have (Guardrails)
- Emotional contagion (deferred)
- Relationship type modulation (deferred)
- Randomness or probabilistic modulation
- Changes to SimulationCreate API contract (scenario_type is optional)
- Per-agent SocialPhysics customization (scenario overrides are global)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (pytest, 38 test files)
- **Automated tests**: Tests-after
- **Framework**: pytest with exact float assertions

### QA Policy
Every task includes pytest-based verification. Evidence: test output logged to `.omo/evidence/`.
- Pipeline: Python pytest — exact numeric assertions for each modulation stage
- Backward compat: pytest run before and after, same results for default personality

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 3 tasks, parallel):
├── Task 1: personality_modulate() in internal_state.py [unspecified-high]
├── Task 2: personality_modulate() in social_physics.py [unspecified-high]
├── Task 3: ScenarioProfile dataclass + profiles [quick]

Wave 2 (Wiring — 3 tasks, parallel):
├── Task 4: Archetype delta multipliers [unspecified-high]
├── Task 5: BehaviorEngine: fix personality data flow + scenario_type [deep]
├── Task 6: Template seed JSONs: add scenario_type [quick]

Wave 3 (Tests — 4 tasks, parallel):
├── Task 7: Update test_internal_state + test_social_physics [unspecified-high]
├── Task 8: Update test_archetypes + test_behavior_engine [unspecified-high]
├── Task 9: New test_scenario_profile.py [unspecified-high]
├── Task 10: Full regression: all 38 tests + backward compat check [unspecified-high]

Wave FINAL (Verification):
├── F1. Plan compliance audit (oracle)
├── F2. Code quality review (unspecified-high)
├── F3. Real QA: run all tests, verify numeric outputs (unspecified-high)
├── F4. Scope fidelity: no creep into contagion/relationships (deep)

Critical Path: Task 3 → Task 5 → Task 9 → F1-F4
Parallel Speedup: ~60%
Max Concurrent: 4 (Wave 2)
```

### Dependency Matrix
- **Task 1-3**: - - 4, 5
- **Task 4**: 2 - 5
- **Task 5**: 1, 3, 4 - 7, 8, 9, 10, 3
- **Task 6**: - 8, 10
- **Task 7**: 1, 5 - 10, 3
- **Task 8**: 2, 4, 5 - 10, 3
- **Task 9**: 3, 5 - 10, 3
- **Task 10**: 7, 8, 9 - F1-F4, 4

### Agent Dispatch Summary
- **Wave 1**: Task 1-2 → `unspecified-high`, Task 3 → `quick`
- **Wave 2**: Task 4 → `unspecified-high`, Task 5 → `deep`, Task 6 → `quick`
- **Wave 3**: Task 7-10 → `unspecified-high`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add personality_modulate() + PERSONALITY_EMOTION_MAP to internal_state.py

  **What to do**:
  - Add `personality_modulate(base_delta, trait_value, strength=0.5)` function that computes `delta × (1 + (trait-50)/50 × strength)`
  - Add `PERSONALITY_EMOTION_MAP` dict: `challenge → [(aggressiveness, anger, 0.6), (empathy, anger, -0.3)]`, `compromise → [(stubbornness, joy, -0.4)]`, `escalate → [(aggressiveness, fear, -0.3), (empathy, fear, 0.4)]`
  - In `apply_event()`: compute base deltas as before, then modulate each by personality before applying. Restructure to separate delta computation from application.
  - Personality data source: `self._personality` already on InternalState (passed at init)
  - Ensure default personality (50/50/50/50) produces identical deltas to current code

  **Must NOT do**:
  - Add emotional contagion (deferred)
  - Change apply_event() signature
  - Add randomness

  **Recommended Agent Profile**:
  > `unspecified-high` with study first: read existing apply_event() structure, then add modulation layer

  **References**:
  - `backend/app/runtime/internal_state.py:124-154` — existing apply_event() logic
  - `backend/app/models.py:221-225` — PersonalityProfile definition (agg/emp/stub/verb)
  - `backend/app/runtime/behavior_engine.py:50-53` — register_agent creates InternalState with personality

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_internal_state.py` passes
  - [ ] Personality 50/50/50/50 produces same deltas as current code
  - [ ] Aggressiveness=80 produces 1.3× anger delta on challenge (all else equal)
  - [ ] Stubbornness=80 produces joy delta 0.6× on compromise (all else equal)

- [x] 2. Add personality_modulate() + PERSONALITY_SOCIAL_MAP to social_physics.py

  **What to do**:
  - Add `PERSONALITY_SOCIAL_MAP` dict: `challenge → [(aggressiveness, tension, 0.5), (aggressiveness, dominance, 0.4)]`, `compromise → [(stubbornness, tension, -0.3), (empathy, trust, 0.3)]`, `interrupt → [(aggressiveness, dominance, 0.3), (empathy, trust, 0.2)]`
  - Add personality modulation to `SocialPhysics.update()` as a second pass after computing base deltas from DEFAULT_DELTAS
  - The `personality` is received via the context dict (`turn` parameter) — behavior_engine passes it when calling update()
  - Default personality = no modulation (trait=50 → multiplier=1.0)

  **Must NOT do**:
  - Change `update()` method signature — use context dict for personality
  - Add relationship type modulation (deferred)

  **References**:
  - `backend/app/runtime/social_physics.py:60-77` — existing update() signature
  - `backend/app/runtime/social_physics.py:10-39` — DEFAULT_DELTAS table
  - `backend/app/runtime/behavior_engine.py:63-64` — how update() is called today

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_social_physics.py` passes
  - [ ] Aggressiveness=80 produces 1.3× tension delta on challenge
  - [ ] Default personality produces same deltas as current code
  - [ ] context dict without personality field falls back to neutral (trait=50)

- [x] 3. Create ScenarioProfile dataclass + SCENARIO_PROFILES dict in new scenario_profile.py

  **What to do**:
  - Create `backend/app/runtime/scenario_profile.py` with `ScenarioProfile` dataclass
  - Define `SCENARIO_PROFILES: dict[str, ScenarioProfile]` with all 6 types:

  ```python
  @dataclass
  class ScenarioProfile:
      social: dict  # trust, leverage, tension, dominance, credibility, momentum
      emotion: dict  # anger, fear, joy, shame, surprise
      volatility: float = 1.0  # multiplier on all emotional deltas

  SCENARIO_PROFILES = {
      "crisis": ScenarioProfile(
          social={"trust": 0.4, "leverage": 0.3, "tension": 0.7, "dominance": 0.5, "credibility": 0.3, "momentum": -0.2},
          emotion={"anger": 0.5, "fear": 0.6, "joy": 0.15, "shame": 0.3, "surprise": 0.4},
          volatility=1.5,
      ),
      "investor": ScenarioProfile(
          social={"trust": 0.3, "leverage": 0.6, "tension": 0.4, "dominance": 0.4, "credibility": 0.6, "momentum": 0.1},
          emotion={"anger": 0.1, "fear": 0.3, "joy": 0.6, "shame": 0.15, "surprise": 0.2},
          volatility=0.8,
      ),
      "podcast": ScenarioProfile(
          social={"trust": 0.5, "leverage": 0.3, "tension": 0.3, "dominance": 0.3, "credibility": 0.4, "momentum": 0.2},
          emotion={"anger": 0.15, "fear": 0.1, "joy": 0.6, "shame": 0.15, "surprise": 0.4},
          volatility=1.2,
      ),
      "legal": ScenarioProfile(
          social={"trust": 0.25, "leverage": 0.6, "tension": 0.6, "dominance": 0.5, "credibility": 0.5, "momentum": 0.0},
          emotion={"anger": 0.35, "fear": 0.25, "joy": 0.2, "shame": 0.2, "surprise": 0.2},
          volatility=0.9,
      ),
      "partnership": ScenarioProfile(
          social={"trust": 0.45, "leverage": 0.5, "tension": 0.35, "dominance": 0.3, "credibility": 0.5, "momentum": 0.1},
          emotion={"anger": 0.15, "fear": 0.2, "joy": 0.5, "shame": 0.15, "surprise": 0.2},
          volatility=0.7,
      ),
      "debate": ScenarioProfile(
          social={"trust": 0.5, "leverage": 0.4, "tension": 0.5, "dominance": 0.4, "credibility": 0.5, "momentum": 0.0},
          emotion={"anger": 0.3, "fear": 0.2, "joy": 0.4, "shame": 0.2, "surprise": 0.3},
          volatility=1.0,
      ),
  }
  ```

  - The "debate" profile should closely match current defaults (backward compat)
  - All emotion values sum to approximately 1.5-2.0 (not normalized, just plausible defaults)

  **Must NOT do**:
  - Add runtime drift toward scenario baselines (deferred)
  - Add decay rate overrides (deferred)

  **References**:
  - `backend/app/runtime/internal_state.py:11-25` — current _EMOTION_BASELINES
  - `backend/app/runtime/social_physics.py:53-58` — current SocialPhysics defaults
  - `backend/app/runtime/archetypes.py:6` — existing @dataclass pattern for configuration

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_scenario_profile.py` passes
  - [ ] All 6 profiles have distinct social dicts (no two identical)
  - [ ] Crisis tension > debate tension > podcast tension
  - [ ] Investor joy > partnership joy > legal joy
  - [ ] Unknown scenario_type raises KeyError or falls back to "debate"

- [x] 4. Add ARCHETYPE_DELTA_MULTIPLIERS to archetypes.py

  **What to do**:
  - Add `ARCHETYPE_DELTA_MULTIPLIERS: dict[str, dict[str, dict[str, float]]]` mapping archetype→action→{field: multiplier}
  - Define multipliers for all 6 archetypes:
    - `agitator`: challenge → tension × 1.5, dominance × 1.4, trust × -1.2; interrupt → dominance × 1.4, tension × 1.3; escalate → tension × 1.3, dominance × 1.2
    - `diplomat`: challenge → tension × 0.7, trust × -0.6; compromise → trust × 1.3, tension × -1.3; coalition_signal → trust × 1.4
    - `guardian`: challenge → tension × 1.2, credibility × -1.1; escalate → tension × 1.5; compromise → trust × 1.2
    - `idealist`: challenge → tension × 1.3, credibility × -1.2
    - `opportunist`: challenge → trust × -0.8, tension × 0.9; compromise → trust × 0.8, leverage × 0.8
    - `pragmatist`: {} (no multipliers)
  - Wire into `SocialPhysics.update()` as multiplicative step after personality modulation
  - In `BehaviorEngine.register_agent()`, store archetype alongside agent (default "pragmatist")

  **Must NOT do**: Merge with personality_bias/emotion_bias (separate concepts)

  **References**: `backend/app/runtime/archetypes.py`, `backend/app/runtime/social_physics.py:60-77`

  **Acceptance Criteria**:
  - [x] Agitator challenge produces 1.5× baseline tension delta
  - [x] Diplomat challenge produces 0.7× baseline tension delta
  - [x] Pragmatist produces no change (1.0× all fields)
  - [x] Unknown archetype defaults to 1.0× (no multiplier)

- [x] 5. Fix BehaviorEngine personality data flow + add scenario_type

  **What to do**:
  - Update `__init__()` to accept `scenario_type: str = "debate"` and `personas: list[PersonalityProfile] | None = None`
  - Load `ScenarioProfile` from `SCENARIO_PROFILES.get(scenario_type, SCENARIO_PROFILES["debate"])`
  - Update `register_agent()` to accept optional `personality: PersonalityProfile` and `archetype: str | None`
  - In `register_agent()`, use scenario profile baselines for init values
  - In `process_turn()`, pass personality + archetype via context dict to `SocialPhysics.update()`
  - Default personality (no arg) → `PersonalityProfile()` with all 50s
  - Default archetype → "pragmatist"

  **Must NOT do**: Change process_turn() return type, add runtime scenario switching

  **References**: `backend/app/runtime/behavior_engine.py:41-76`

  **Acceptance Criteria**:
  - [ ] BehaviorEngine(scenario_type="crisis") → SocialPhysics.tension=0.7
  - [ ] BehaviorEngine() → default tension=0.3
  - [ ] register_agent("id") with no personality → PersonalityProfile() defaults
  - [ ] Personality data appears in context dict passed to SocialPhysics.update()

- [x] 6. Add scenario_type to template seed JSONs

  **What to do**:
  - Add `scenario_type` string to each template in `backend/seeds/templates/all.json`
  - Map: partnership_negotiation→"partnership", investor_meeting→"investor", internal_strategy→"debate", crisis_simulation→"crisis", legal_contract→"legal", podcast→"podcast"
  - Backward compat: templates without scenario_type still work

  **References**: `backend/seeds/templates/all.json`

  **Acceptance Criteria**:
  - [ ] All 6 templates have `scenario_type` set
  - [ ] Templates without `scenario_type` load without error
  - [ ] `python -c "import json; json.load(open('backend/seeds/templates/all.json'))"` succeeds

- [x] 7. Update test_internal_state + test_social_physics for personality modulation

  **What to do**:
  - Use exact float assertions

  **Acceptance Criteria**:
  - [ ] `test_personality_modulate_default()` passes — default personality = same deltas
  - [ ] `test_personality_high_aggression_challenge()` passes — agg=80 → 1.3× anger
  - [ ] `test_personality_social_default()` passes — default = same as current
  - [ ] `test_personality_social_high_agg_challenge()` passes — agg=80 → 1.3× tension
  - [ ] `test_update_without_personality()` passes — no personality in context uses defaults
  - [ ] `test_update_with_personality_context()` passes — explicit personality via context

- [x] 8. Update test_archetypes + test_behavior_engine for delta multipliers + scenario

  **What to do**:
  - Add tests: `test_archetype_delta_agitator_challenge()`, `test_archetype_delta_pragmatist()`, `test_archetype_delta_unknown()`, `test_engine_scenario_crisis_init()`, `test_engine_personality_flow()`

  **Acceptance Criteria**:
  - [ ] `test_archetype_delta_agitator_challenge()` passes — agitator → 1.5× tension
  - [ ] `test_archetype_delta_pragmatist()` passes — pragmatist → no change
  - [ ] `test_archetype_delta_unknown()` passes — unknown archetype → 1.0× (no-op)
  - [ ] `test_engine_scenario_crisis_init()` passes — crisis scenario → tension=0.7
  - [ ] `test_engine_personality_flow()` passes — personality reaches context dict

- [x] 9. New test_scenario_profile.py

  **What to do**:
  - Tests: all 6 profiles distinct, crisis highest tension, investor highest joy, unknown→debate fallback

  **Acceptance Criteria**:
  - [ ] `test_all_profiles_have_distinct_values()` passes — all 6 social dicts unique
  - [ ] `test_profile_crisis_highest_tension()` passes — crisis > debate > podcast
  - [ ] `test_profile_investor_highest_joy()` passes — investor joy highest
  - [ ] `test_profile_unknown_falls_back_to_debate()` passes — unknown type returns debate

- [x] 10. Full regression: all tests + backward compat check

  **What to do**:
  - `python -m pytest tests/` — all 38+ pass
  - Default personality matches exact current outputs

  **Acceptance Criteria**:
  - [ ] `python -m pytest tests/` exits 0 — all tests pass
  - [ ] Default personality (50/50/50/50) produces identical social deltas to current code
  - [ ] Default personality produces identical emotional deltas to current code

---

## Final Verification Wave (MANDATORY)

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`
  **AC**: All "Must Have" verified present; zero "Must NOT Have" violations; evidence files exist.

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `python -m pytest tests/`. Check: no `import *`, no unused imports, no commented-out code. Verify backward compat: default personality produces same deltas as current code.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`
  **AC**: All tests pass; no `import *` or unused imports; default personality backward compat.

- [x] F3. **Real QA: run all tests, verify numeric outputs** — `unspecified-high`
  Execute EVERY QA scenario from EVERY task — follow exact steps. Test all 6 scenario profiles have distinct values. Test default personality backward compat. Save evidence to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`
  **AC**: All scenarios pass; 6 profiles verified distinct; evidence saved.

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify no emotional contagion (deferred). Verify no relationship type modulation (deferred). Verify no randomness added. Check "Must NOT do" compliance.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`
  **AC**: All tasks compliant; zero contamination; zero unaccounted changes.

---

## Commit Strategy

- **1-3**: `feat(engine): add personality modulation function + mapping tables`
- **4**: `feat(engine): add archetype delta multipliers`
- **5**: `feat(engine): fix personality data flow, add scenario_type wiring`
- **6**: `feat(seeds): add scenario_type to template configs`
- **7-9**: `test(engine): add modulation + scenario tests`
- **10**: `test(engine): full regression pass`
- **F1-F4**: `chore: verification artifacts`

## Success Criteria

### Verification Commands
```bash
cd backend && python -m pytest tests/ -v  # Expected: all tests pass
cd backend && python -c "
from app.runtime.behavior_engine import make_engine
e = make_engine(['a'], scenario_type='crisis')
from app.runtime.social_physics import SocialPhysics
s = SocialPhysics()
print('Default tension:', s.tension)  # Expected: 0.3
print('Crisis tension:', e._social_physics['a'].tension)  # Expected: 0.7
"
```

### Final Checklist
- [x] All "Must Have" present — personality modulation, archetype multipliers, scenario profiles
- [x] All "Must NOT Have" absent — no contagion, no relationship types, no randomness
- [x] All 38+ tests pass with default personality producing identical deltas
