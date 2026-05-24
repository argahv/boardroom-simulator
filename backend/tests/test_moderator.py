import importlib.util, sys
from pathlib import Path
p = Path(__file__).resolve().parent.parent / "app" / "runtime" / "moderator.py"
s = importlib.util.spec_from_file_location("moderator", p)
m = importlib.util.module_from_spec(s)
sys.modules["moderator"] = m
s.loader.exec_module(m)

def test_select_highest_bid():
    md = m.ModeratorAI()
    assert md.select_speaker([("a", 80), ("b", 50)]) == "a"

def test_summarize_empty():
    md = m.ModeratorAI()
    assert "No discussion" in md.summarize([])