import importlib.util
import sys
from pathlib import Path

_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "hidden_info.py"
_spec = importlib.util.spec_from_file_location("hidden_info", _path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["hidden_info"] = _mod
_spec.loader.exec_module(_mod)

HiddenInformation = _mod.HiddenInformation
make_hidden_info = _mod.make_hidden_info


def test_reveal_and_known():
    h = make_hidden_info()
    h.reveal("a", {"info": "secret_plan", "turn": 1, "credibility": 0.8})
    known = h.known_by("a", None)
    assert len(known) == 1
    assert known[0]["info"] == "secret_plan"


def test_share():
    h = make_hidden_info()
    h.reveal("a", {"info": "secret", "turn": 1, "credibility": 0.5})
    h.share("a", "b")
    known = h.known_by("a", "b")
    assert len(known) == 1
    assert known[0]["info"] == "secret"


def test_known_by_observer():
    h = make_hidden_info()
    h.reveal("a", {"info": "s1", "revealed_to": "b", "turn": 1, "credibility": 0.5})
    h.reveal("a", {"info": "s2", "turn": 2, "credibility": 0.3})
    known_b = h.known_by("a", "b")
    known_all = h.known_by("a", None)
    assert len(known_b) >= 1
    assert len(known_all) == 2