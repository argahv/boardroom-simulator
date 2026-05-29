"""Tests for scenario_profile — initial conditions per scenario type."""

from app.runtime.scenario_profile import SCENARIO_PROFILES


def test_all_profiles_have_distinct_values():
    """All 6 profiles should have unique social dicts (no two identical)."""
    assert len(SCENARIO_PROFILES) == 6
    social_dicts = [tuple(sorted(p.social.items())) for p in SCENARIO_PROFILES.values()]
    assert len(set(social_dicts)) == 6, "Not all profiles have distinct social values"


def test_profile_crisis_highest_tension():
    """Crisis should have higher tension than debate, which should be higher than podcast."""
    crisis = SCENARIO_PROFILES["crisis"]
    debate = SCENARIO_PROFILES["debate"]
    podcast = SCENARIO_PROFILES["podcast"]
    
    assert crisis.social["tension"] > debate.social["tension"], (
        f"Crisis tension ({crisis.social['tension']}) should exceed debate ({debate.social['tension']})"
    )
    assert debate.social["tension"] > podcast.social["tension"], (
        f"Debate tension ({debate.social['tension']}) should exceed podcast ({podcast.social['tension']})"
    )


def test_profile_investor_highest_joy():
    """Investor meeting should have the highest joy baseline."""
    investor = SCENARIO_PROFILES["investor"]
    partnership = SCENARIO_PROFILES["partnership"]
    legal = SCENARIO_PROFILES["legal"]
    
    max_joy = max(p.emotion["joy"] for p in SCENARIO_PROFILES.values())
    assert abs(investor.emotion["joy"] - max_joy) < 1e-4, (
        f"Investor joy ({investor.emotion['joy']}) should be highest (found {max_joy})"
    )
    assert investor.emotion["joy"] > partnership.emotion["joy"], (
        f"Investor joy ({investor.emotion['joy']}) should exceed partnership ({partnership.emotion['joy']})"
    )
    assert investor.emotion["joy"] > legal.emotion["joy"], (
        f"Investor joy ({investor.emotion['joy']}) should exceed legal ({legal.emotion['joy']})"
    )


def test_profile_unknown_falls_back_to_debate():
    """Unknown scenario_type should return debate profile."""
    from app.runtime.scenario_profile import ScenarioProfile
    
    unknown = SCENARIO_PROFILES.get("not_a_real_scenario", SCENARIO_PROFILES["debate"])
    assert unknown is SCENARIO_PROFILES["debate"], "Unknown scenario should fall back to debate"
    assert unknown.social["tension"] == 0.5
    assert unknown.emotion["anger"] == 0.3


def test_all_profiles_have_required_keys():
    """Every profile must have all required social and emotion keys."""
    required_social_keys = {"trust", "leverage", "tension", "dominance", "credibility", "momentum"}
    required_emotion_keys = {"anger", "fear", "joy", "shame", "surprise"}
    
    for name, profile in SCENARIO_PROFILES.items():
        assert required_social_keys.issubset(profile.social.keys()), (
            f"{name} missing social keys: {required_social_keys - profile.social.keys()}"
        )
        assert required_emotion_keys.issubset(profile.emotion.keys()), (
            f"{name} missing emotion keys: {required_emotion_keys - profile.emotion.keys()}"
        )
