import importlib.util, sys
from pathlib import Path
p = Path(__file__).resolve().parent.parent / "app" / "runtime" / "strategic_adaptation.py"
s = importlib.util.spec_from_file_location("strategic_adaptation", p)
m = importlib.util.module_from_spec(s)
sys.modules["strategic_adaptation"] = m
s.loader.exec_module(m)

def test_outcome_effects():
    sa = m.StrategicAdaptation()
    d = sa.evaluate("a", "won")
    assert "aggressiveness" in d
    assert d["aggressiveness"] < 0