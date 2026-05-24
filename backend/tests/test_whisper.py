import importlib.util, sys
from pathlib import Path
p = Path(__file__).resolve().parent.parent / "app" / "runtime" / "whisper.py"
s = importlib.util.spec_from_file_location("whisper", p)
m = importlib.util.module_from_spec(s)
sys.modules["whisper"] = m
s.loader.exec_module(m)

def test_send_receive():
    w = m.WhisperChannel()
    w.send("a", "b", "secret", 1)
    msgs = w.receive("b")
    assert len(msgs) == 1
    assert msgs[0]["content"] == "secret"