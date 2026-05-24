import importlib.util, sys
from pathlib import Path
p = Path(__file__).resolve().parent.parent / "app" / "runtime" / "trust_evolution.py"
s = importlib.util.spec_from_file_location("trust_evolution", p)
m = importlib.util.module_from_spec(s)
sys.modules["trust_evolution"] = m
s.loader.exec_module(m)

def test_no_graph_default():
    te = m.TrustEvolution()
    assert te.evaluate("a") == 0.5
    assert te.trending("a") == "stable"