import sys
import importlib.util
from pathlib import Path

_THIS = Path(__file__).resolve().parent
_name = "_be_wire_be"
if _name not in sys.modules:
    _path = _THIS / "behavior_engine.py"
    _spec = importlib.util.spec_from_file_location(_name, _path)
    _mod = importlib.util.module_from_spec(_spec)
    sys.modules[_name] = _mod
    _spec.loader.exec_module(_mod)
else:
    _mod = sys.modules[_name]

make_engine = _mod.make_engine
