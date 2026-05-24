import importlib.util
import sys
from pathlib import Path

_path = Path(__file__).resolve().parent.parent / "app" / "runtime" / "language_engine.py"
_spec = importlib.util.spec_from_file_location("language_engine", _path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["language_engine"] = _mod
_spec.loader.exec_module(_mod)

build_llm_context = _mod.build_llm_context
parse_llm_response = _mod.parse_llm_response
LanguageEngine = _mod.LanguageEngine


def test_build_context_includes_state():
    state = {
        "social_physics": {"trust": 0.8, "tension": 0.3, "dominance": 0.4},
        "cognitive_state": {"confidence": 0.9, "emotion": {"joy": 0.7, "anger": 0.1}},
        "allies": ["b"],
        "rivals": [],
    }
    msgs = build_llm_context(state, "Agent A", "Champion", [], [])
    system = msgs[0]["content"]
    assert "trust=0.8" in system
    assert "tension=0.3" in system
    assert "joy" in system or "confidence" in system
    assert "b" in system


def test_build_context_with_conversation():
    state = {"social_physics": {}, "cognitive_state": {}}
    conv = [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "world"},
    ]
    msgs = build_llm_context(state, "A", "R", [], conv)
    assert len(msgs) >= 3


def test_parse_json_response():
    result = parse_llm_response('{"content": "hello", "action_type": "statement"}')
    assert result["content"] == "hello"
    assert result["action_type"] == "statement"


def test_parse_codeblock_response():
    result = parse_llm_response('```\n{"content": "hi", "action_type": "challenge"}\n```')
    assert result["content"] == "hi"
    assert result["action_type"] == "challenge"


def test_parse_fallback():
    result = parse_llm_response("raw text")
    assert result["content"] == "raw text"
    assert result["action_type"] == "statement"


def test_language_engine_no_llm():
    import asyncio
    le = LanguageEngine()
    result = asyncio.run(le.generate({"social_physics": {}}, "A", "R", [], []))
    assert result["action_type"] == "statement"
