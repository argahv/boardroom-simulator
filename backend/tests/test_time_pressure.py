import importlib.util, sys
from pathlib import Path
_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "time_pressure.py"
_spec = importlib.util.spec_from_file_location("time_pressure", _path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["time_pressure"] = _mod
_spec.loader.exec_module(_mod)
TimePressure = _mod.TimePressure
make_time_pressure = _mod.make_time_pressure

def test_pressure_starts_zero():
    tp = make_time_pressure()
    assert tp.get_pressure() == 0.0

def test_pressure_increases():
    tp = make_time_pressure()
    tp.tick(15, 20)
    assert tp.get_pressure() > 0.0

def test_pressure_capped():
    tp = make_time_pressure()
    tp.tick(100, 20)
    assert tp.get_pressure() <= 1.0

def test_escalation_threshold():
    tp = make_time_pressure()
    tp.tick(18, 20)
    assert tp.should_escalate()