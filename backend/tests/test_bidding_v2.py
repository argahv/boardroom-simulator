import importlib.util, sys
from pathlib import Path
_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "bidding_v2.py"
_spec = importlib.util.spec_from_file_location("bidding_v2", _path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["bidding_v2"] = _mod
_spec.loader.exec_module(_mod)
BidCalculator = _mod.BidCalculator
make_bid_calculator = _mod.make_bid_calculator

def test_baseline_bid():
    c = make_bid_calculator()
    bid = c.calculate("a", 0.5, {})
    assert 0 <= bid <= 100
    assert abs(bid - 75) <= 25

def test_bid_with_state():
    class MockEngine:
        def get_state_for_llm(self, aid):
            return {"social_physics": {"tension": 0.8, "dominance": 0.3}}
    c = make_bid_calculator(MockEngine())
    bid = c.calculate("a", 0.5, {})
    assert bid > 50

def test_bid_clamped():
    c = make_bid_calculator()
    assert c.calculate("a", -1, {}) >= 0
    assert c.calculate("a", 2, {}) <= 100