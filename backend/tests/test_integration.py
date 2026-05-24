import importlib.util
import sys
from pathlib import Path

import pytest

# Load all modules via importlib
modules = {}
for name in ["social_physics", "internal_state", "relationship_graph", "behavior_engine",
             "goal_evolution", "memory_system", "private_thought", "hidden_info"]:
    _p = Path(__file__).resolve().parent.parent / "app" / "runtime" / f"{name}.py"
    _s = importlib.util.spec_from_file_location(name, _p)
    _m = importlib.util.module_from_spec(_s)
    sys.modules[name] = _m
    _s.loader.exec_module(_m)
    modules[name] = _m


@pytest.fixture
def engine():
    e = modules["behavior_engine"].BehaviorEngine(["a", "b", "c"])
    return e


@pytest.fixture
def memory():
    E = modules["memory_system"].EpisodicMemory
    S = modules["memory_system"].SemanticMemory
    return modules["memory_system"].MemorySystem(E(20), S())


@pytest.fixture
def thoughts():
    return modules["private_thought"].PrivateThoughtSystem()


def test_full_simulation_cycle(engine, memory, thoughts):
    """Simulate a full negotiation cycle: 3 turns across 3 agents."""
    turns = [
        {"speaker_id": "a", "action_type": "challenge", "target_id": "b", "agent_id": "a", "directed_at": "b"},
        {"speaker_id": "b", "action_type": "compromise", "target_id": "a", "agent_id": "b", "directed_at": "a"},
        {"speaker_id": "c", "action_type": "coalition_signal", "target_id": "a", "agent_id": "c", "directed_at": "a"},
    ]

    for i, turn in enumerate(turns):
        result = engine.process_turn(turn)
        engine.tick()
        memory.add_event(turn["speaker_id"], {"type": turn["action_type"], "content":
                           f"turn_{i}", })
        thoughts.set_position(turn["speaker_id"], f"public_{i}", f"private_{i}", f"strategy_{i}", turn=i)

    result = engine.get_public_state()
    assert result["turn_count"] >= 2
    llm_state = engine.get_state_for_llm("a")
    assert "social_physics" in llm_state
    assert "cognitive_state" in llm_state
    assert len(llm_state["trust_scores"]) == 2

    state = engine.get_public_state()
    assert len(state["agent_states"]) == 3

    assert thoughts.get_public("b") == "public_1"
    assert thoughts.get_private("b") == "private_1"
