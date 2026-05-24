import importlib.util, sys
from pathlib import Path
p = Path(__file__).resolve().parent.parent / "app" / "runtime" / "trust_leverage_panel.py"
s = importlib.util.spec_from_file_location("trust_leverage_panel", p)
m = importlib.util.module_from_spec(s)
sys.modules["trust_leverage_panel"] = m
s.loader.exec_module(m)

def test_update_and_get():
    t = m.TrustLeveragePanel()
    t.update("a", 0.7, 60, 1)
    state = t.get_state()
    assert "a" in state
    assert state["a"]["trust"] == 0.7