import sys
import importlib.util
from pathlib import Path

_RUNTIME = Path(__file__).resolve().parent

def _bootstrap():
    modules = {}
    for name in ["social_physics", "internal_state", "relationship_graph", "behavior_engine",
                  "goal_evolution", "memory_system", "private_thought", "language_engine",
                  "coalition_detection", "bidding_v2", "archetypes", "performance"]:
        path = _RUNTIME / f"{name}.py"
        if path.exists():
            s = importlib.util.spec_from_file_location(f"_init_{name}", path)
            m = importlib.util.module_from_spec(s)
            sys.modules[f"_init_{name}"] = m
            s.loader.exec_module(m)
            modules[name] = m
    return modules

_MODULES = _bootstrap()

def create_engine(agent_ids):
    return _MODULES["behavior_engine"].BehaviorEngine(agent_ids)
