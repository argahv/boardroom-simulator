import importlib.util, sys
from pathlib import Path

_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "performance.py"
_spec = importlib.util.spec_from_file_location("performance", _path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["performance"] = _mod
_spec.loader.exec_module(_mod)


def test_tracks_turns():
    pt = _mod.PerformanceTracker()
    pt.record_turn("a", 100)
    pt.record_turn("b", 200)
    s = pt.summary()
    assert s["total_turns"] == 2
    assert s["total_tokens"] == 300
    assert s["agent_tokens"]["a"] == 100