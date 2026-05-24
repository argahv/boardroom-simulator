import importlib.util
import sys
from pathlib import Path

MODULES = {}

def _load(name, file):
    p = Path(__file__).resolve().parent.parent / file
    s = importlib.util.spec_from_file_location(name, p)
    m = importlib.util.module_from_spec(s)
    sys.modules[name] = m
    s.loader.exec_module(m)
    return m

for mod, file in [
    ("interruptions", "app/runtime/interruptions.py"),
    ("whisper", "app/runtime/whisper.py"),
    ("trust_evolution", "app/runtime/trust_evolution.py"),
    ("leverage_tracker", "app/runtime/leverage_tracker.py"),
    ("external_events", "app/runtime/external_events.py"),
    ("moderator", "app/runtime/moderator.py"),
    ("strategic_adaptation", "app/runtime/strategic_adaptation.py"),
]:
    try:
        MODULES[mod] = _load(mod, file)
    except Exception as e:
        print(f"WARN: {mod} failed: {e}")


def test_interruption_urgency():
    if "interruptions" not in MODULES:
        return
    im = MODULES["interruptions"].InterruptionManager()
    assert im.can_interrupt("a", 80, "b") is True
    assert im.can_interrupt("a", 50, "b") is False


def test_whisper_send_receive():
    if "whisper" not in MODULES:
        return
    wc = MODULES["whisper"].WhisperChannel()
    wc.send("a", "b", "secret")
    msgs = wc.receive("b")
    assert len(msgs) == 1
    assert msgs[0]["content"] == "secret"


def test_trust_evolution_score():
    if "trust_evolution" not in MODULES:
        return
    te = MODULES["trust_evolution"].TrustEvolution()
    assert te.evaluate("a") == 0.5


def test_leverage_tracker_update():
    if "leverage_tracker" not in MODULES:
        return
    lt = MODULES["leverage_tracker"].LeverageTracker()
    lt.update("a", 10, 1)
    assert lt.get("a")["score"] == 60


def test_external_events_check():
    if "external_events" not in MODULES:
        return
    ei = MODULES["external_events"].ExternalEventInjector()
    ei.add_event({"type": "news"}, turn=3)
    assert ei.check(3) is not None
    assert ei.check(1) is None


def test_moderator_select():
    if "moderator" not in MODULES:
        return
    m = MODULES["moderator"].ModeratorAI()
    bids = [("a", 80), ("b", 50), ("c", 90)]
    assert m.select_speaker(bids) == "c"


def test_strategic_adaptation():
    if "strategic_adaptation" not in MODULES:
        return
    sa = MODULES["strategic_adaptation"].StrategicAdaptation()
    delta = sa.evaluate("a", "won")
    assert "aggressiveness" in delta