from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "memory_system.py"
_spec = importlib.util.spec_from_file_location("memory_system", _path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["memory_system"] = _mod
_spec.loader.exec_module(_mod)

Event = _mod.Event
EpisodicMemory = _mod.EpisodicMemory
SemanticMemory = _mod.SemanticMemory
MemorySystem = _mod.MemorySystem
make_memory_system = _mod.make_memory_system


# ── helpers ────────────────────────────────────────────────────────────────

def make_event(
    type: str = "statement",
    agent_id: str = "alpha",
    content: str = "",
    importance: float = 0.0,
    metadata: dict | None = None,
) -> Event:
    return Event(
        type=type,
        agent_id=agent_id,
        content=content,
        importance=importance,
        metadata=metadata or {},
    )


# ── EpisodicMemory tests ───────────────────────────────────────────────────

class TestEpisodicMemory:
    def test_add_and_get_recent(self) -> None:
        mem = EpisodicMemory(capacity=50)
        for i in range(5):
            mem.add_event("alpha", "statement", f"msg-{i}")
        recent = mem.get_recent("alpha", n=3)
        assert len(recent) == 3
        assert recent[-1].content == "msg-4"

    def test_circular_buffer_drops_oldest(self) -> None:
        mem = EpisodicMemory(capacity=3)
        for i in range(10):
            mem.add_event("alpha", "test", f"e{i}")
        assert mem.count("alpha") == 3
        events = mem.get_recent("alpha", n=3)
        assert events[0].content == "e7"
        assert events[-1].content == "e9"

    def test_multiple_agents_independent(self) -> None:
        mem = EpisodicMemory(capacity=5)
        mem.add_event("alpha", "statement", "a1")
        mem.add_event("beta", "statement", "b1")
        mem.add_event("beta", "statement", "b2")
        assert mem.count("alpha") == 1
        assert mem.count("beta") == 2
        assert len(mem) == 3

    def test_empty_agent_returns_empty(self) -> None:
        mem = EpisodicMemory()
        assert mem.get_recent("nonexistent") == []
        assert mem.get_important("nonexistent") == []

    def test_clear_single_agent(self) -> None:
        mem = EpisodicMemory(capacity=5)
        mem.add_event("alpha", "statement", "keep")
        mem.add_event("beta", "statement", "gone")
        mem.clear("beta")
        assert mem.count("beta") == 0
        assert mem.count("alpha") == 1

    def test_clear_all(self) -> None:
        mem = EpisodicMemory(capacity=5)
        mem.add_event("alpha", "statement", "x")
        mem.add_event("beta", "statement", "y")
        mem.clear()
        assert len(mem) == 0


# ── Importance scoring tests ───────────────────────────────────────────────

class TestImportanceScoring:
    def test_challenge_high_importance(self) -> None:
        e = make_event(type="challenge")
        assert e.importance == 0.8

    def test_escalate_highest_importance(self) -> None:
        e = make_event(type="escalate")
        assert e.importance == 0.9

    def test_statement_low_importance(self) -> None:
        e = make_event(type="statement")
        assert e.importance == 0.3

    def test_question_low_importance(self) -> None:
        e = make_event(type="question")
        assert e.importance == 0.3

    def test_compromise_moderate_importance(self) -> None:
        e = make_event(type="compromise")
        assert e.importance == 0.7

    def test_coalition_signal_importance(self) -> None:
        e = make_event(type="coalition_signal")
        assert e.importance == 0.75

    def test_interrupt_importance(self) -> None:
        e = make_event(type="interrupt")
        assert e.importance == 0.6

    def test_system_lowest_importance(self) -> None:
        e = make_event(type="system")
        assert e.importance == 0.1

    def test_unknown_type_defaults_to_03(self) -> None:
        e = make_event(type="unknown_type")
        assert e.importance == 0.3

    def test_explicit_importance_override(self) -> None:
        e = Event(type="statement", agent_id="a", content="x", importance=1.0)
        assert e.importance == 1.0

    def test_challenge_above_threshold(self) -> None:
        e = make_event(type="challenge")
        assert e.importance > 0.7

    def test_statement_below_04(self) -> None:
        e = make_event(type="statement")
        assert e.importance < 0.4


# ── EpisodicMemory get_important tests ─────────────────────────────────────

class TestGetImportant:
    def test_filters_by_threshold(self) -> None:
        mem = EpisodicMemory(capacity=10)
        mem.add_event("alpha", "statement", "low")
        mem.add_event("alpha", "challenge", "med")
        mem.add_event("alpha", "escalate", "high")
        mem.add_event("alpha", "system", "lowest")
        important = mem.get_important("alpha", threshold=0.7)
        assert len(important) == 2
        assert important[0].type == "challenge"
        assert important[1].type == "escalate"

    def test_custom_threshold(self) -> None:
        mem = EpisodicMemory(capacity=10)
        mem.add_event("alpha", "statement", "x")
        mem.add_event("alpha", "interrupt", "y")
        mem.add_event("alpha", "compromise", "z")
        important = mem.get_important("alpha", threshold=0.5)
        assert len(important) == 2

    def test_no_events_above_threshold(self) -> None:
        mem = EpisodicMemory(capacity=5)
        mem.add_event("alpha", "statement", "x")
        mem.add_event("alpha", "question", "y")
        important = mem.get_important("alpha", threshold=0.7)
        assert important == []


# ── SemanticMemory tests ───────────────────────────────────────────────────

class TestSemanticMemory:
    def test_compromise_adds_to_concessions(self) -> None:
        sem = SemanticMemory()
        ev = make_event(type="compromise", agent_id="alpha", content="accept lower price")
        sem.extract_semantics(ev)
        summary = sem.get_summary("alpha")
        assert "accept lower price" in summary["concessions"]

    def test_coalition_adds_to_alliances(self) -> None:
        sem = SemanticMemory()
        ev = make_event(
            type="coalition_signal", agent_id="alpha",
            content="join forces with beta",
            metadata={"target": "beta"},
        )
        sem.extract_semantics(ev)
        summary = sem.get_summary("alpha")
        assert "beta" in summary["alliances_formed"]

    def test_stance_adds_to_positions(self) -> None:
        sem = SemanticMemory()
        ev = make_event(type="statement", agent_id="alpha", content="I support the merger")
        sem.extract_semantics(ev)
        summary = sem.get_summary("alpha")
        assert any("support" in p for p in summary["positions"])

    def test_red_line_detected(self) -> None:
        sem = SemanticMemory()
        ev = make_event(type="statement", agent_id="alpha", content="we cannot accept this deal")
        sem.extract_semantics(ev)
        summary = sem.get_summary("alpha")
        assert any("cannot" in r for r in summary["red_lines"])

    def test_red_line_with_never(self) -> None:
        sem = SemanticMemory()
        ev = make_event(type="statement", agent_id="alpha", content="I will never agree to this")
        sem.extract_semantics(ev)
        summary = sem.get_summary("alpha")
        assert any("never" in r for r in summary["red_lines"])

    def test_red_line_exact_phrase(self) -> None:
        sem = SemanticMemory()
        ev = make_event(type="statement", agent_id="alpha", content="this is our red line")
        sem.extract_semantics(ev)
        summary = sem.get_summary("alpha")
        assert any("red line" in r for r in summary["red_lines"])

    def test_duplicate_content_not_duplicated(self) -> None:
        sem = SemanticMemory()
        ev1 = make_event(type="compromise", agent_id="alpha", content="concede point")
        ev2 = make_event(type="compromise", agent_id="alpha", content="concede point")
        sem.extract_semantics(ev1)
        sem.extract_semantics(ev2)
        summary = sem.get_summary("alpha")
        assert len(summary["concessions"]) == 1

    def test_coalition_without_target_no_alliance(self) -> None:
        sem = SemanticMemory()
        ev = make_event(type="coalition_signal", agent_id="alpha", content="let's team up")
        sem.extract_semantics(ev)
        summary = sem.get_summary("alpha")
        assert summary["alliances_formed"] == []

    def test_empty_agent_summary(self) -> None:
        sem = SemanticMemory()
        summary = sem.get_summary("nonexistent")
        assert summary == {
            "positions": [],
            "concessions": [],
            "red_lines": [],
            "alliances_formed": [],
        }

    def test_clear_agent(self) -> None:
        sem = SemanticMemory()
        ev = make_event(type="compromise", agent_id="alpha", content="concede")
        sem.extract_semantics(ev)
        sem.clear("alpha")
        summary = sem.get_summary("alpha")
        assert summary["concessions"] == []

    def test_clear_all(self) -> None:
        sem = SemanticMemory()
        sem.extract_semantics(make_event(type="compromise", agent_id="a", content="c1"))
        sem.extract_semantics(make_event(type="compromise", agent_id="b", content="c2"))
        sem.clear()
        assert sem.get_summary("a")["concessions"] == []
        assert sem.get_summary("b")["concessions"] == []


# ── MemorySystem tests ─────────────────────────────────────────────────────

class TestMemorySystem:
    def test_add_event_delegates_to_both(self) -> None:
        ms = make_memory_system(capacity=10)
        result = ms.add_event("alpha", {"type": "compromise", "content": "accept terms"})
        assert result is ms
        recent = ms.get_recent("alpha")
        assert len(recent) == 1
        summary = ms.get_summary("alpha")
        assert "accept terms" in summary["concessions"]

    def test_get_context_returns_unified_dict(self) -> None:
        ms = make_memory_system(capacity=10)
        ms.add_event("alpha", {"type": "statement", "content": "hello"})
        ms.add_event("alpha", {"type": "challenge", "content": "I disagree"})
        ms.add_event("alpha", {"type": "compromise", "content": "fine, deal"})
        ctx = ms.get_context("alpha", n=5, importance_threshold=0.7)
        assert "recent_events" in ctx
        assert "important_events" in ctx
        assert "semantic_summary" in ctx
        assert len(ctx["recent_events"]) == 3
        assert len(ctx["important_events"]) == 2  # challenge 0.8 + compromise 0.7
        assert "fine, deal" in ctx["semantic_summary"]["concessions"]

    def test_get_context_respects_n(self) -> None:
        ms = make_memory_system(capacity=10)
        for i in range(8):
            ms.add_event("alpha", {"type": "statement", "content": f"msg-{i}"})
        ctx = ms.get_context("alpha", n=3)
        assert len(ctx["recent_events"]) == 3
        assert ctx["recent_events"][-1].content == "msg-7"

    def test_clear_via_memory_system(self) -> None:
        ms = make_memory_system(capacity=5)
        ms.add_event("alpha", {"type": "statement", "content": "x"})
        ms.add_event("beta", {"type": "statement", "content": "y"})
        ms.clear("alpha")
        assert len(ms.get_recent("alpha")) == 0
        assert len(ms.get_recent("beta")) == 1


# ── Determinism tests ──────────────────────────────────────────────────────

class TestDeterminism:
    def test_add_events_is_deterministic(self) -> None:
        def build() -> list[tuple[str, str, float]]:
            mem = EpisodicMemory(capacity=10)
            mem.add_event("alpha", "statement", "a")
            mem.add_event("alpha", "challenge", "b")
            mem.add_event("alpha", "compromise", "c")
            return [(e.type, e.content, e.importance) for e in mem.get_recent("alpha", 3)]

        assert build() == build()

    def test_context_is_deterministic(self) -> None:
        def build() -> int:
            ms = make_memory_system(capacity=10)
            ms.add_event("alpha", {"type": "statement", "content": "a"})
            ms.add_event("alpha", {"type": "challenge", "content": "b"})
            ms.add_event("alpha", {"type": "compromise", "content": "c"})
            ctx = ms.get_context("alpha")
            return len(ctx["important_events"])

        assert build() == build()
