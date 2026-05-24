import importlib.util, sys
from pathlib import Path

_mods = {}
for mod, f in [('external_events', 'external_events.py'), ('leverage_tracker', 'leverage_tracker.py'), ('moderator', 'moderator.py'), ('trust_evolution', 'trust_evolution.py'), ('strategic_adaptation', 'strategic_adaptation.py')]:
    p = Path(__file__).resolve().parent.parent / 'app' / 'runtime' / f
    s = importlib.util.spec_from_file_location(mod.replace(".py",""), p)
    m = importlib.util.module_from_spec(s)
    sys.modules[mod] = m
    s.loader.exec_module(m)
    _mods[mod] = m

def test_external_events():
    ei = _mods['external_events'].ExternalEventInjector()
    ei.add_event({'type':'x'}, 3)
    assert ei.check(3) is not None

def test_leverage_tracker():
    lt = _mods['leverage_tracker'].LeverageTracker()
    lt.update('a', 10, 1)
    assert lt.get('a')['score'] == 60

def test_moderator():
    m = _mods['moderator'].ModeratorAI()
    assert m.select_speaker([('a',80),('b',50)]) == 'a'

def test_trust_evolution_no_graph():
    te = _mods['trust_evolution'].TrustEvolution()
    assert te.evaluate('a') == 0.5

def test_strategic_adaptation():
    sa = _mods['strategic_adaptation'].StrategicAdaptation()
    d = sa.evaluate('a', 'won')
    assert 'aggressiveness' in d