import importlib.util
import sys
from pathlib import Path
import pytest

_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "private_thought.py"
_spec = importlib.util.spec_from_file_location("private_thought", _path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["private_thought"] = _mod
_spec.loader.exec_module(_mod)

PrivateThoughtSystem = _mod.PrivateThoughtSystem
StrategicThought = _mod.StrategicThought
make_private_thought_system = _mod.make_private_thought_system


def test_register_agent():
    pts = make_private_thought_system(["a", "b"])
    assert pts.get_public("a") == ""
    assert pts.get_public("b") == ""


def test_set_position():
    pts = make_private_thought_system(["a"])
    pts.set_position("a", "I support the deal", "I fear the valuation", "delay for leverage", turn=1)
    assert pts.get_public("a") == "I support the deal"
    assert pts.get_private("a") == "I fear the valuation"
    assert pts.get_strategy("a") == "delay for leverage"


def test_public_private_differ():
    pts = make_private_thought_system(["a"])
    pts.set_position("a", "support", "oppose", "pretend", turn=1)
    assert pts.get_public("a") != pts.get_private("a")


def test_get_public_state():
    pts = make_private_thought_system(["a"])
    pts.set_position("a", "support", "oppose", "pretend")
    state = pts.get_public_state("a")
    assert "public_position" in state
    assert "private_concern" not in state
    assert "strategy" not in state


def test_hidden_motive_detected():
    pts = make_private_thought_system(["a", "b"])
    pts.set_position("b", "I fully support this merger", "I want to destroy this company", "undermine", turn=1)
    score = pts.detect_hidden_motive("a", "b")
    assert score > 0.5


def test_no_hidden_motive():
    pts = make_private_thought_system(["a", "b"])
    pts.set_position("b", "I support the merger", "I support the merger", "honest", turn=1)
    score = pts.detect_hidden_motive("a", "b")
    assert score < 0.5


def test_hidden_motive_no_agent():
    pts = make_private_thought_system(["a"])
    assert pts.detect_hidden_motive("a", "unknown") == 0.0


def test_strategic_thought_snapshot():
    t = StrategicThought("agent_a")
    t.set_public_position("I support").set_private_concern("I worry").set_strategy("wait")
    snap = t.snapshot()
    assert snap["agent_id"] == "agent_a"
    assert snap["public_position"] == "I support"
    assert "strategy_hint" in snap


def test_get_all_snapshots():
    pts = make_private_thought_system(["a", "b"])
    pts.set_position("a", "yes", "no", "lie")
    pts.set_position("b", "maybe", "no", "wait")
    snaps = pts.get_all_snapshots()
    assert "a" in snaps
    assert "b" in snaps