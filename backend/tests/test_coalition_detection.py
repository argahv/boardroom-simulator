from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "coalition_detection.py"
_spec = importlib.util.spec_from_file_location("coalition_detection", _path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["coalition_detection"] = _mod
_spec.loader.exec_module(_mod)

CoalitionDetector = _mod.CoalitionDetector
Coalition = _mod.Coalition


class FakeGraph:
    pass


def make_detector(with_graph: bool = True) -> CoalitionDetector:
    graph = FakeGraph() if with_graph else None
    return CoalitionDetector(graph)


# ── detect ───────────────────────────────────────────────────────────────────


class TestDetect:
    def test_detect_coalition_signal_creates_coalition(self):
        d = make_detector()
        turn = {
            "action_type": "coalition_signal",
            "agent_id": "alice",
            "directed_at": "bob",
            "content": "Let's work together on the budget",
        }
        coalitions = d.detect(turn, turn_index=1)
        assert len(coalitions) == 1
        c = coalitions[0]
        assert c.agent_a == "alice"
        assert c.agent_b == "bob"
        assert c.strength == 0.7
        assert c.formed_turn == 1
        assert c.is_active is True

    def test_detect_compromise_creates_coalition(self):
        d = make_detector()
        turn = {"action_type": "compromise", "agent_id": "alice", "directed_at": "bob"}
        coalitions = d.detect(turn, turn_index=5)
        assert len(coalitions) == 1
        c = coalitions[0]
        assert c.agent_a == "alice"
        assert c.agent_b == "bob"
        assert c.issue == "compromise agreement"
        assert c.strength == 0.5
        assert c.formed_turn == 5

    def test_detect_ignores_unknown_action(self):
        d = make_detector()
        turn = {"action_type": "statement", "agent_id": "alice", "directed_at": "bob"}
        assert d.detect(turn) == []

    def test_detect_ignores_missing_target(self):
        d = make_detector()
        turn = {"action_type": "coalition_signal", "agent_id": "alice", "directed_at": ""}
        assert d.detect(turn) == []

    def test_detect_no_graph_returns_empty(self):
        d = make_detector(with_graph=False)
        turn = {"action_type": "coalition_signal", "agent_id": "alice", "directed_at": "bob"}
        assert d.detect(turn) == []


# ── get_active ───────────────────────────────────────────────────────────────


class TestGetActive:
    def test_returns_only_active_coalitions(self):
        d = make_detector()
        d.detect({"action_type": "coalition_signal", "agent_id": "a", "directed_at": "b"})
        d.detect({"action_type": "coalition_signal", "agent_id": "c", "directed_at": "d"})
        assert len(d.get_active()) == 2
        d.dissolve("a", "b")
        active = d.get_active()
        assert len(active) == 1
        assert active[0].agent_a == "c"

    def test_empty_when_no_coalitions(self):
        d = make_detector()
        assert d.get_active() == []


# ── get_by_agent ─────────────────────────────────────────────────────────────


class TestGetByAgent:
    def test_returns_coalitions_for_agent_a(self):
        d = make_detector()
        d.detect({"action_type": "coalition_signal", "agent_id": "alice", "directed_at": "bob"})
        d.detect({"action_type": "coalition_signal", "agent_id": "charlie", "directed_at": "dave"})
        results = d.get_by_agent("alice")
        assert len(results) == 1
        assert results[0].agent_b == "bob"

    def test_returns_coalitions_for_agent_b(self):
        d = make_detector()
        d.detect({"action_type": "coalition_signal", "agent_id": "alice", "directed_at": "bob"})
        results = d.get_by_agent("bob")
        assert len(results) == 1
        assert results[0].agent_a == "alice"

    def test_excludes_dissolved_coalitions(self):
        d = make_detector()
        d.detect({"action_type": "coalition_signal", "agent_id": "alice", "directed_at": "bob"})
        d.dissolve("alice", "bob")
        assert d.get_by_agent("alice") == []

    def test_returns_empty_for_unknown_agent(self):
        d = make_detector()
        assert d.get_by_agent("nobody") == []


# ── dissolve ─────────────────────────────────────────────────────────────────


class TestDissolve:
    def test_dissolve_marks_coalition_inactive(self):
        d = make_detector()
        d.detect({"action_type": "coalition_signal", "agent_id": "alice", "directed_at": "bob"})
        d.dissolve("alice", "bob")
        assert d.get_active() == []

    def test_dissolve_only_targeted_pair(self):
        d = make_detector()
        d.detect({"action_type": "coalition_signal", "agent_id": "alice", "directed_at": "bob"})
        d.detect({"action_type": "coalition_signal", "agent_id": "alice", "directed_at": "charlie"})
        d.dissolve("alice", "bob")
        assert len(d.get_active()) == 1
        assert d.get_active()[0].agent_b == "charlie"

    def test_dissolve_returns_self(self):
        d = make_detector()
        result = d.dissolve("a", "b")
        assert result is d


# ── decay ────────────────────────────────────────────────────────────────────


class TestDecay:
    def test_decay_reduces_strength(self):
        d = make_detector()
        d.detect({"action_type": "coalition_signal", "agent_id": "a", "directed_at": "b"})
        assert d.get_active()[0].strength == 0.7
        d.decay()
        assert d.get_active()[0].strength < 0.7

    def test_decay_dissolves_at_zero_strength(self):
        d = make_detector()
        d.detect({"action_type": "compromise", "agent_id": "a", "directed_at": "b"})
        assert d.get_active()[0].strength == 0.5
        for _ in range(55):
            d.decay()
        assert d.get_active() == []

    def test_decay_skips_inactive_coalitions(self):
        d = make_detector()
        d.detect({"action_type": "coalition_signal", "agent_id": "a", "directed_at": "b"})
        d.dissolve("a", "b")
        strength_before = d._coalitions[0].strength
        d.decay()
        assert d._coalitions[0].strength == strength_before

    def test_decay_returns_self(self):
        d = make_detector()
        result = d.decay()
        assert result is d


# ── set_graph ────────────────────────────────────────────────────────────────


class TestSetGraph:
    def test_set_graph_enables_detection(self):
        d = make_detector(with_graph=False)
        turn = {"action_type": "coalition_signal", "agent_id": "alice", "directed_at": "bob"}
        assert d.detect(turn) == []
        d.set_graph(FakeGraph())
        result = d.detect(turn)
        assert len(result) == 1

    def test_set_graph_returns_self(self):
        d = make_detector(with_graph=False)
        result = d.set_graph(FakeGraph())
        assert result is d


# ── make_detector factory ────────────────────────────────────────────────────


class TestMakeDetector:
    def test_make_detector_without_graph(self):
        d = _mod.make_detector()
        assert d._graph is None

    def test_make_detector_with_graph(self):
        g = FakeGraph()
        d = _mod.make_detector(g)
        assert d._graph is g


# ── no graph no crash ────────────────────────────────────────────────────────


class TestNoGraph:
    def test_no_graph_no_crash(self):
        d = make_detector(with_graph=False)
        assert d.detect({"action_type": "statement"}) == []
