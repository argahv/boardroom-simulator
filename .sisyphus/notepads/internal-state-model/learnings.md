# Internal State Model - Learnings

## Files
- `backend/app/runtime/internal_state.py` — `CognitiveState` dataclass + `InternalState` class
- `backend/tests/test_internal_state.py` — 34 tests, all passing

## Key Design Decisions
- `CognitiveState` = stdlib `@dataclass` (not Pydantic), matching task requirement for zero external deps
- `InternalState` wraps `CognitiveState` as `_state`, exposes properties for field access
- `apply_event()` checks `action_type` key in event dict; challenge requires `target="self"` (or absent → defaults to self)
- Decay formula: `val + (baseline - val) * 0.03` per spec, applied to emotions + confidence + certainty
- `dominant_emotion()` uses `max(dict, key=dict.get)` — when all tied, first insertion-order key ("anger") wins

## Test Pattern
- Same `importlib.util.spec_from_file_location` loading as `test_social_physics.py` to bypass broken `app/runtime/__init__.py` chain
- No direct `from app.runtime.internal_state import ...` — only `_mod.xxx` after importlib load
- Section-class per concern: TestInitialValues, TestApplyEvent, TestEmotionalDecay, TestGoalShifts, TestSnapshot, TestDominantEmotion, TestRepr, TestActionEffects

## Gotchas
- Existing file had `PersonalityProfile` dep (from `app.models`) — task says NO deps on other new modules → had to clean-replace
- Edit tool had whitespace matching issues on the existing file — used rm+write instead
- Pytest output was getting piped through a grep-like filter in the environment — used `2>/dev/null` to bypass
