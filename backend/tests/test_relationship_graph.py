import importlib.util
import sys
from pathlib import Path

import pytest

# Direct import to bypass broken runtime __init__.py chain
_module_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "relationship_graph.py"
_spec = importlib.util.spec_from_file_location("relationship_graph", _module_path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["relationship_graph"] = _mod
_spec.loader.exec_module(_mod)

RelationshipEntry = _mod.RelationshipEntry
RelationshipGraph = _mod.RelationshipGraph
DECAY_RATE = _mod.DECAY_RATE
BASELINES = _mod.BASELINES


def make_graph() -> RelationshipGraph:
    return RelationshipGraph()


def make_turn(action_type: str, speaker: str = "a", target: str = "b") -> dict:
    return {"action_type": action_type, "speaker_id": speaker, "target_id": target}


# ── defaults ────────────────────────────────────────────────────────────────


class TestDefaults:
    def test_get_creates_default_entry(self):
        g = make_graph()
        entry = g.get("a", "b")
        assert entry.trust == 0.5
        assert entry.fear == 0.2
        assert entry.admiration == 0.3
        assert entry.rivalry == 0.2
        assert entry.alliance is False
        assert entry.dependency == 0.0

    def test_get_returns_same_entry_on_second_call(self):
        g = make_graph()
        e1 = g.get("a", "b")
        e2 = g.get("a", "b")
        assert e1 is e2


# ── set / get ───────────────────────────────────────────────────────────────


class TestSetGet:
    def test_set_and_get_round_trip(self):
        g = make_graph()
        entry = RelationshipEntry(trust=0.9, rivalry=0.7)
        g.set("a", "b", entry)
        fetched = g.get("a", "b")
        assert fetched.trust == 0.9
        assert fetched.rivalry == 0.7

    def test_set_overwrites_existing(self):
        g = make_graph()
        g.set("a", "b", RelationshipEntry(trust=0.2))
        g.set("a", "b", RelationshipEntry(trust=0.8))
        assert g.get("a", "b").trust == 0.8


# ── update ──────────────────────────────────────────────────────────────────


class TestUpdate:
    def test_update_single_field(self):
        g = make_graph()
        g.update("a", "b", "trust", 0.3)
        assert g.get("a", "b").trust == 0.8  # 0.5 + 0.3

    def test_update_clamps_to_zero(self):
        g = make_graph()
        g.update("a", "b", "trust", -2.0)
        assert g.get("a", "b").trust == 0.0

    def test_update_clamps_to_one(self):
        g = make_graph()
        g.update("a", "b", "trust", 2.0)
        assert g.get("a", "b").trust == 1.0

    def test_negative_delta_decreases(self):
        g = make_graph()
        g.update("a", "b", "rivalry", -0.1)
        assert g.get("a", "b").rivalry == 0.1

    def test_update_chaining(self):
        g = make_graph()
        g.update("a", "b", "trust", 0.2).update("a", "b", "rivalry", 0.3)
        assert g.get("a", "b").trust == 0.7
        assert g.get("a", "b").rivalry == 0.5


# ── apply_turn ──────────────────────────────────────────────────────────────


class TestApplyTurn:
    def test_coalition_increases_trust(self):
        g = make_graph()
        g.apply_turn(make_turn("coalition_signal", "a", "b"))
        assert g.get("a", "b").trust > 0.5

    def test_coalition_sets_alliance(self):
        g = make_graph()
        g.apply_turn(make_turn("coalition_signal", "a", "b"))
        assert g.get("a", "b").alliance is True

    def test_challenge_decreases_trust(self):
        g = make_graph()
        g.apply_turn(make_turn("challenge", "a", "b"))
        assert g.get("a", "b").trust < 0.5

    def test_challenge_increases_rivalry(self):
        g = make_graph()
        g.apply_turn(make_turn("challenge", "a", "b"))
        assert g.get("a", "b").rivalry > 0.2

    def test_interrupt_increases_fear(self):
        g = make_graph()
        g.apply_turn(make_turn("interrupt", "a", "b"))
        assert g.get("a", "b").fear > 0.2

    def test_interrupt_increases_rivalry(self):
        g = make_graph()
        g.apply_turn(make_turn("interrupt", "a", "b"))
        assert g.get("a", "b").rivalry > 0.2

    def test_compromise_increases_trust(self):
        g = make_graph()
        g.apply_turn(make_turn("compromise", "a", "b"))
        assert g.get("a", "b").trust > 0.5

    def test_compromise_sets_alliance(self):
        g = make_graph()
        g.apply_turn(make_turn("compromise", "a", "b"))
        assert g.get("a", "b").alliance is True

    def test_compromise_decreases_rivalry(self):
        g = make_graph()
        g.apply_turn(make_turn("compromise", "a", "b"))
        assert g.get("a", "b").rivalry < 0.2

    def test_statement_is_noop(self):
        g = make_graph()
        tr = g.get("a", "b").trust
        g.apply_turn(make_turn("statement", "a", "b"))
        assert g.get("a", "b").trust == tr

    def test_apply_turn_chaining(self):
        g = make_graph()
        g.apply_turn(make_turn("coalition_signal", "a", "b")).apply_turn(
            make_turn("compromise", "b", "c")
        )
        assert g.get("a", "b").alliance is True
        assert g.get("b", "c").alliance is True


# ── decay_all ───────────────────────────────────────────────────────────────


class TestDecay:
    def test_decay_moves_trust_toward_baseline(self):
        g = make_graph()
        g.set("a", "b", RelationshipEntry(trust=0.9))
        for _ in range(5):
            g.decay_all()
        assert g.get("a", "b").trust < 0.9
        assert g.get("a", "b").trust > 0.5

    def test_decay_moves_fear_toward_baseline(self):
        g = make_graph()
        g.set("a", "b", RelationshipEntry(fear=0.8))
        for _ in range(5):
            g.decay_all()
        assert g.get("a", "b").fear < 0.8

    def test_decay_resets_alliance_to_false(self):
        g = make_graph()
        g.set("a", "b", RelationshipEntry(alliance=True))
        g.decay_all()
        assert g.get("a", "b").alliance is False

    def test_decay_noop_at_baseline(self):
        g = make_graph()
        entry = g.get("a", "b")
        trust_before = entry.trust
        g.decay_all()
        assert entry.trust == trust_before  # already at 0.5 baseline


# ── query methods ───────────────────────────────────────────────────────────


class TestAllies:
    def test_get_allies_returns_alliance_partners(self):
        g = make_graph()
        g.set("a", "b", RelationshipEntry(alliance=True))
        g.set("a", "c", RelationshipEntry(alliance=True))
        allies = g.get_allies("a")
        assert "b" in allies
        assert "c" in allies

    def test_get_allies_excludes_non_allies(self):
        g = make_graph()
        g.set("a", "b", RelationshipEntry(alliance=False))
        assert g.get_allies("a") == []

    def test_get_allies_empty_when_no_edges(self):
        g = make_graph()
        assert g.get_allies("a") == []


class TestRivals:
    def test_get_rivals_returns_high_rivalry(self):
        g = make_graph()
        g.set("a", "b", RelationshipEntry(rivalry=0.7))
        g.set("a", "c", RelationshipEntry(rivalry=0.3))
        rivals = g.get_rivals("a")
        assert "b" in rivals
        assert "c" not in rivals

    def test_get_rivals_empty_when_none(self):
        g = make_graph()
        assert g.get_rivals("x") == []


class TestTrustScore:
    def test_trust_score_averages_incoming(self):
        g = make_graph()
        g.set("x", "a", RelationshipEntry(trust=0.9))
        g.set("y", "a", RelationshipEntry(trust=0.5))
        g.set("z", "a", RelationshipEntry(trust=0.7))
        assert g.trust_score("a") == pytest.approx(0.7, rel=1e-6)

    def test_trust_score_default_when_no_edges(self):
        g = make_graph()
        assert g.trust_score("unknown") == 0.5

    def test_trust_score_only_counts_incoming(self):
        g = make_graph()
        g.set("a", "b", RelationshipEntry(trust=1.0))  # outgoing
        assert g.trust_score("b") == 1.0


# ── asymmetry ───────────────────────────────────────────────────────────────


class TestAsymmetry:
    def test_directed_relationships(self):
        g = make_graph()
        g.set("a", "b", RelationshipEntry(trust=0.9))
        g.set("b", "a", RelationshipEntry(trust=0.2))
        assert g.get("a", "b").trust == 0.9
        assert g.get("b", "a").trust == 0.2


# ── to_matrix ───────────────────────────────────────────────────────────────


class TestToMatrix:
    def test_to_matrix_returns_dict(self):
        g = make_graph()
        g.set("a", "b", RelationshipEntry(trust=0.8))
        m = g.to_matrix()
        assert "a" in m
        assert "b" in m["a"]
        assert m["a"]["b"]["trust"] == 0.8

    def test_to_matrix_empty_when_no_edges(self):
        assert make_graph().to_matrix() == {}

    def test_to_matrix_serializable(self):
        import json

        g = make_graph()
        g.set("a", "b", RelationshipEntry(trust=0.7, alliance=True))
        json.dumps(g.to_matrix())  # should not raise

    def test_to_matrix_includes_all_fields(self):
        g = make_graph()
        g.set("a", "b", RelationshipEntry(trust=0.6, rivalry=0.4))
        entry = g.to_matrix()["a"]["b"]
        assert set(entry.keys()) == {
            "trust",
            "fear",
            "admiration",
            "rivalry",
            "alliance",
            "dependency",
        }


# ── determinism ─────────────────────────────────────────────────────────────


class TestDeterminism:
    def test_same_input_same_output(self):
        a = make_graph()
        b = make_graph()
        for action in ["challenge", "compromise", "coalition_signal"]:
            a.apply_turn(make_turn(action, "x", "y"))
            b.apply_turn(make_turn(action, "x", "y"))
        assert a.get("x", "y").trust == b.get("x", "y").trust
        assert a.get("x", "y").rivalry == b.get("x", "y").rivalry
