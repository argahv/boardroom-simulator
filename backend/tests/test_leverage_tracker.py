import importlib.util, sys
from pathlib import Path
p = Path(__file__).resolve().parent.parent / "app" / "runtime" / "leverage_tracker.py"
s = importlib.util.spec_from_file_location("leverage_tracker", p)
m = importlib.util.module_from_spec(s)
sys.modules["leverage_tracker"] = m
s.loader.exec_module(m)

def test_update_and_get():
    lt = m.LeverageTracker()
    lt.update("a", 10, 1)
    assert lt.get("a")["score"] == 60
    lt.update("a", -20, 2)
    assert lt.get("a")["score"] == 40