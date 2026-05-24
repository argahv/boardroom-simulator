import importlib.util, sys
from pathlib import Path
p = Path(__file__).resolve().parent.parent / "app" / "runtime" / "external_events.py"
s = importlib.util.spec_from_file_location("external_events", p)
m = importlib.util.module_from_spec(s)
sys.modules["external_events"] = m
s.loader.exec_module(m)

def test_schedule_and_check():
    ei = m.ExternalEventInjector()
    ei.add_event({"type": "news", "content": "test"}, 3)
    assert ei.check(3) is not None
    assert ei.check(1) is None