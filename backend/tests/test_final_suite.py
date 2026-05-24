import importlib.util
import sys
from pathlib import Path

modules = {}
for name in ["social_physics", "internal_state", "relationship_graph", "behavior_engine",
             "goal_evolution", "memory_system", "private_thought"]:
    p = Path(__file__).resolve().parent.parent / "app" / "runtime" / f"{name}.py"
    s = importlib.util.spec_from_file_location(name, p)
    m = importlib.util.module_from_spec(s)
    sys.modules[name] = m
    s.loader.exec_module(m)
    modules[name] = m


def test_behavior_engine_determinism():
    be = modules["behavior_engine"].BehaviorEngine(["a", "b"])
    turn = {"speaker_id": "a", "action_type": "challenge", "target_id": "b"}
    r1 = be.process_turn(turn)
    r2 = modules["behavior_engine"].BehaviorEngine(["a", "b"])
    r2.process_turn(turn)
    assert r1.state_snapshot == modules["behavior_engine"].BehaviorEngine(["a", "b"]).process_turn(turn).state_snapshot


def test_social_physics_no_llm():
    s = modules["social_physics"].SocialPhysics()
    s2 = s.update("challenge", "a", "b", {})
    assert type(s2) == modules["social_physics"].SocialPhysics