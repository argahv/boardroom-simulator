import importlib.util, sys
from pathlib import Path
_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "crisis_injector.py"
_spec = importlib.util.spec_from_file_location("crisis_injector", _path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["crisis_injector"] = _mod
_spec.loader.exec_module(_mod)
CrisisInjector = _mod.CrisisInjector
make_crisis_injector = _mod.make_crisis_injector

def test_schedule_and_check():
    c = make_crisis_injector()
    c.schedule({"event_type": "test", "description": "test crisis"}, turn=5)
    assert c.check(5) is not None
    assert c.check(1) is None

def test_no_crisis_by_default():
    c = make_crisis_injector()
    assert c.check(0) is None
    assert c.is_active() is False

def test_resolve():
    c = make_crisis_injector()
    c.schedule({"event_type": "x"}, turn=1)
    c.check(1)
    assert c.is_active()
    c.resolve()
    assert c.is_active() is False