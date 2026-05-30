import importlib.util
import sys
from pathlib import Path

_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "archetypes.py"
_spec = importlib.util.spec_from_file_location("archetypes", _path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["archetypes"] = _mod
_spec.loader.exec_module(_mod)

ArchetypeRegistry = _mod.ArchetypeRegistry
AgentArchetype = _mod.AgentArchetype
make_registry = _mod.make_registry


def test_default_registry_has_six():
    r = make_registry()
    assert len(r.list_names()) == 6


def test_opportunist_exists():
    r = make_registry()
    assert r.get("opportunist") is not None


def test_unknown_returns_none():
    r = make_registry()
    assert r.get("unknown") is None


def test_register_custom():
    r = make_registry()
    r.register(AgentArchetype(name="test"))
    assert r.get("test") is not None


def test_list_names():
    r = make_registry()
    names = r.list_names()
    assert "opportunist" in names
    assert "diplomat" in names
    assert "guardian" in names


def test_archetype_fields():
    a = make_registry().get("agitator")
    assert a is not None
    assert a.description != ""
    assert "aggressiveness" in a.personality_bias
    assert "challenge" in a.tendencies


def test_archetype_delta_agitator_challenge():
    from app.runtime.social_physics import SocialPhysics
    from app.runtime.archetypes import ARCHETYPE_DELTA_MULTIPLIERS
    from app.models import PersonalityProfile

    assert "agitator" in ARCHETYPE_DELTA_MULTIPLIERS
    assert ARCHETYPE_DELTA_MULTIPLIERS["agitator"]["challenge"]["tension"] == 1.5

    sp = SocialPhysics()
    result = sp.update("challenge", "a", None, {"archetype": "agitator", "personality": PersonalityProfile()})
    delta = result.tension - 0.3
    assert abs(delta - 0.18) < 1e-4, f"Expected 0.18 (0.12 * 1.5), got {delta}"


def test_archetype_delta_pragmatist():
    from app.runtime.social_physics import SocialPhysics
    from app.runtime.archetypes import ARCHETYPE_DELTA_MULTIPLIERS
    from app.models import PersonalityProfile

    assert ARCHETYPE_DELTA_MULTIPLIERS["pragmatist"] == {}
    sp = SocialPhysics()
    result_with = sp.update("challenge", "a", None, {"archetype": "pragmatist", "personality": PersonalityProfile()})
    result_without = sp.update("challenge", "a", None, {"personality": PersonalityProfile()})
    assert abs(result_with.tension - result_without.tension) < 1e-6


def test_archetype_delta_unknown():
    from app.runtime.social_physics import SocialPhysics
    from app.models import PersonalityProfile

    sp = SocialPhysics()
    result = sp.update("challenge", "a", None, {"archetype": "nonexistent_type", "personality": PersonalityProfile()})
    delta = result.tension - 0.3
    assert abs(delta - 0.12) < 1e-4, f"Expected default 0.12, got {delta}"
