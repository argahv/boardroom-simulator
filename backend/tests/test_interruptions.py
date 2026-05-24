import importlib.util, sys
from pathlib import Path
p = Path(__file__).resolve().parent.parent / "app" / "runtime" / "interruptions.py"
s = importlib.util.spec_from_file_location("interruptions", p)
m = importlib.util.module_from_spec(s)
sys.modules["interruptions"] = m
s.loader.exec_module(m)

def test_can_interrupt():
    mgr = m.InterruptionManager()
    assert mgr.can_interrupt("a", 80, "b") is True
    assert mgr.can_interrupt("a", 50, "b") is False
    assert mgr.can_interrupt("a", 80, "a") is False

def test_record_and_count():
    mgr = m.InterruptionManager()
    mgr.record("a", "b", 1)
    mgr.record("a", "c", 2)
    assert mgr.count_by("a") == 2