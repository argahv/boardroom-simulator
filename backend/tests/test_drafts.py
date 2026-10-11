"""Draft endpoints (/drafts/persona, /drafts/simulation, /drafts/simulation/upload).

Runs without a database or network: the LLM call, the persona library and the template
catalogue are all monkeypatched. Run with --noconftest.
"""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import config, drafts, llm
from app.models import SimulationConfig


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

LIBRARY = {
    "lib-elena": {
        "id": "lib-elena",
        "name": "Elena Voss",
        "role": "VC General Partner",
        "focus": "Returns",
        "backstory": "Led the seed round and has evolved twice.",
        "stance": "detractor",
        "personality": {"aggressiveness": 71, "empathy": 33, "stubbornness": 88, "verbosity": 42},
        "hidden_agenda": "Wants a board seat before agreeing to anything.",
        "tools": [],
        "archetype": "guardian",
    },
    "lib-dan": {
        "id": "lib-dan",
        "name": "Daniel Reyes",
        "role": "Internal Champion",
        "focus": "Adoption",
        "backstory": "Sponsored the pilot.",
        "stance": "champion",
        "personality": '{"aggressiveness": 40, "empathy": 70, "stubbornness": 55, "verbosity": 60}',
        "hidden_agenda": "Needs this win for a promotion.",
        "tools": "[]",
        "archetype": None,
    },
}

TEMPLATES = [
    {
        "slug": "series-b-fundraise",
        "name": "Series B Fundraise",
        "description": "Founder pitches to a skeptical VC board. Tension over valuation, dilution, and governance terms.",
        "category": "Fundraising",
        "config": {
            "subject": {"name": "Series B Fundraise", "description": "Seeking $15M at a $75M valuation.",
                        "attributes": {"valuation": 75000000}, "evidence_items": ["ARR grew 180% YoY"],
                        "stakes_description": "Capital to capture the market."},
            "stakeholders": [
                {"id": "ceo", "name": "Sarah Chen", "role": "CEO", "stance": "champion",
                 "personality": {"aggressiveness": 60, "empathy": 40, "stubbornness": 70, "verbosity": 60},
                 "backstory": "Founder.", "hidden_agenda": "Close before the rival.", "tools": []},
                {"id": "angel", "name": "Elena Torres", "role": "Angel Investor", "stance": "detractor",
                 "personality": {"aggressiveness": 55, "empathy": 50, "stubbornness": 75, "verbosity": 45},
                 "backstory": "Early angel.", "hidden_agenda": "Wants advisory shares.", "tools": []},
                {"id": "cfo", "name": "Diana Park", "role": "CFO", "stance": "neutral",
                 "personality": {"aggressiveness": 40, "empathy": 45, "stubbornness": 80, "verbosity": 55},
                 "backstory": "Conservative.", "hidden_agenda": "Found $200K of waste.", "tools": []},
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "alternating"},
            "end_condition": {"type": "timeout", "max_normal_turns": 12},
            "voltage": 62,
            "env_flags": {"hidden_motives": True, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "volatile",
        },
    },
    {
        "slug": "crisis-simulation",
        "name": "Crisis Simulation",
        "description": "High-pressure incident response: data breach, PR disaster or product recall.",
        "category": "Crisis",
        "config": {
            "subject": {"name": "Data Breach", "description": "Customer data leaked."},
            "stakeholders": [
                {"id": "crisis-ceo", "name": "Thomas Adeyemi", "role": "CEO", "stance": "champion"},
                {"id": "gc", "name": "Nadia Kowalski", "role": "General Counsel", "stance": "detractor"},
            ],
            "action_space": {"actions": []},
            "end_condition": {"type": "timeout", "max_normal_turns": 14},
            "voltage": 90,
        },
    },
]


class FakeDB:
    def __init__(self, personas=None, templates=None):
        self.personas = personas or {}
        self.templates = templates or []

    async def get_persona_detail(self, persona_id):
        return self.personas.get(persona_id)

    async def get_stakeholder(self, persona_id):
        return None

    async def list_templates_catalog(self):
        return self.templates


class FakeLLM:
    """Stands in for llm.openrouter_completion: returns canned replies in order, or raises."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls: list[dict] = []

    async def __call__(self, messages, temperature=0.6, **kwargs):
        self.calls.append({"messages": messages, "temperature": temperature, **kwargs})
        reply = self.replies.pop(0) if self.replies else "{}"
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, dict):
            reply = json.dumps(reply)
        return reply, False, {}


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB(personas=dict(LIBRARY), templates=json.loads(json.dumps(TEMPLATES)))
    monkeypatch.setattr(drafts, "get_database", lambda: fake)
    return fake


@pytest.fixture
def no_llm(monkeypatch):
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "")

    async def must_not_call(*args, **kwargs):
        raise AssertionError("LLM must not be called without a key")

    monkeypatch.setattr(llm, "openrouter_completion", must_not_call)


@pytest.fixture
def use_llm(monkeypatch):
    def install(*replies):
        fake = FakeLLM(*replies)
        monkeypatch.setattr(config, "OPENROUTER_API_KEY", "test-key")
        monkeypatch.setattr(llm, "openrouter_completion", fake)
        return fake
    return install


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(drafts.router)
    return TestClient(app)


def _assert_valid_room(config_json: dict) -> SimulationConfig:
    cfg = SimulationConfig.model_validate(config_json)
    ids = [s.id for s in cfg.stakeholders]
    assert len(ids) == len(set(ids)), "stakeholder ids must be unique"
    non_moderators = [s for s in cfg.stakeholders if s.stance != "moderator"]
    assert len(non_moderators) >= 2
    assert cfg.subject.name and cfg.subject.description
    if cfg.end_condition.type == "vote":
        assert sorted(cfg.end_condition.voters) == sorted(s.id for s in non_moderators)
        assert 0 < cfg.end_condition.threshold <= 1
    return cfg


# ---------------------------------------------------------------------------
# /drafts/persona
# ---------------------------------------------------------------------------


def test_persona_fallback_reads_name_role_and_cues(client, no_llm):
    res = client.post("/drafts/persona", json={"text": "Dana Okafor, CFO. Skeptical of the valuation and hates dilution."})
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "fallback"
    persona = body["persona"]
    assert persona["name"] == "Dana Okafor"
    assert persona["role"] == "CFO"
    assert persona["stance"] == "detractor"
    assert persona["archetype"] in drafts.ARCHETYPES
    assert set(persona["personality"]) == set(drafts.TRAITS)
    assert persona["personality"]["stubbornness"] > 50
    assert "hidden_agenda" in body["guessed"] and persona["hidden_agenda"]
    assert "name" not in body["guessed"] and "role" not in body["guessed"]
    assert set(persona) == {"name", "role", "focus", "backstory", "stance", "archetype", "personality", "hidden_agenda"}


@pytest.mark.parametrize("text,name,role", [
    ("Marcus Webb - VC Lead", "Marcus Webb", "VC Lead"),
    ("dana okafor, cfo", "Dana Okafor", "CFO"),
    ("Elena Torres (angel investor), wrote the first check", "Elena Torres", "Angel Investor"),
    ("Priya Iyer is our Technical Architect. Very blunt.", "Priya Iyer", "Technical Architect"),
])
def test_persona_fallback_name_role_forms(client, no_llm, text, name, role):
    persona = client.post("/drafts/persona", json={"text": text}).json()["persona"]
    assert (persona["name"], persona["role"]) == (name, role)


def test_persona_fallback_without_a_name_marks_it_guessed(client, no_llm):
    body = client.post("/drafts/persona", json={"text": "skeptical CFO who hates dilution"}).json()
    assert body["persona"]["name"]
    assert body["persona"]["role"] == "CFO"
    assert "name" in body["guessed"]


def test_persona_from_llm_is_validated(client, use_llm):
    fake = use_llm("```json\n" + json.dumps({
        "name": "Dana Okafor", "role": "Chief Financial Officer", "focus": "Runway",
        "backstory": "Ex-banker.", "stance": "Skeptic", "archetype": "warrior",
        "personality": {"aggressiveness": 0.8, "empathy": 0.3, "stubbornness": 0.9, "verbosity": 0.4},
        "hidden_agenda": "Wants the CEO job.", "guessed": ["backstory", "bogus"],
    }) + "\n```")
    body = client.post("/drafts/persona", json={"text": "Dana Okafor, CFO. Hates dilution."}).json()
    assert body["source"] == "llm"
    persona = body["persona"]
    assert persona["stance"] == "detractor"
    assert persona["archetype"] in drafts.ARCHETYPES  # "warrior" is not one; the rules fill it in
    assert persona["personality"] == {"aggressiveness": 80, "empathy": 30, "stubbornness": 90, "verbosity": 40}
    assert "hidden_agenda" in body["guessed"]  # nothing in the text says it, whatever the model claims
    assert "bogus" not in body["guessed"]
    assert fake.calls and fake.calls[0]["simulation_id"].startswith("draft:")


def test_persona_llm_error_falls_back(client, use_llm):
    use_llm(RuntimeError("402 credits exhausted"))
    res = client.post("/drafts/persona", json={"text": "Marcus Webb - VC Lead"})
    assert res.status_code == 200
    assert res.json()["source"] == "fallback"
    assert res.json()["persona"]["name"] == "Marcus Webb"


def test_persona_empty_text_is_rejected(client, no_llm):
    assert client.post("/drafts/persona", json={"text": "   "}).status_code == 422


# ---------------------------------------------------------------------------
# /drafts/simulation: drafting from a brief
# ---------------------------------------------------------------------------

LLM_ROOM = {
    "subject": {"name": "Series B at $75M", "description": "We pitch the board.", "evidence_items": ["ARR $3.2M"]},
    "stakeholders": [
        {"name": "Sarah Chen", "role": "CEO", "stance": "champion", "archetype": "opportunist",
         "backstory": "Founder.", "hidden_agenda": "Close before a rival raises."},
        {"id": "x", "name": "Raj Patel", "role": "CTO", "stance": "supporter",
         "personality": {"aggressiveness": 30, "empathy": 60, "stubbornness": 55, "verbosity": 35}},
        {"id": "x", "name": "Marcus Webb", "role": "Board Chair", "stance": "moderator"},
        {"role": "nameless, dropped"},
    ],
    "end_condition": {"type": "vote", "threshold": 60, "voters": ["nobody"], "max_turns": 100},
    "scenario_type": "investor",
    "env_flags": {"time_pressure": True, "bogus": True},
    "voltage": 62,
    "notes": ["Marcus chairs the vote."],
}


def test_simulation_draft_from_brief_with_llm(client, db, use_llm):
    fake = use_llm(LLM_ROOM)
    body = client.post("/drafts/simulation", json={
        "brief": "Tomorrow I pitch our Series B at $75M to the board; they vote on it.",
    }).json()
    assert body["source"] == "llm"
    cfg = _assert_valid_room(body["config"])
    assert cfg.scenario_type == "investor"
    assert cfg.voltage == 55
    assert cfg.env_flags == {"hidden_motives": True, "time_pressure": True, "external_leaks": False, "deadlock_risk": False}
    assert cfg.end_condition.type == "vote"
    assert cfg.end_condition.threshold == 0.6
    assert cfg.end_condition.max_turns == 40
    marcus = next(s for s in cfg.stakeholders if s.name == "Marcus Webb")
    assert marcus.stance == "moderator" and marcus.id not in cfg.end_condition.voters
    assert len({s.id for s in cfg.stakeholders}) == len(cfg.stakeholders)  # the model's duplicate "x" ids were split
    raj = next(s for s in cfg.stakeholders if s.name == "Raj Patel")
    assert raj.stance == "champion" and raj.personality.aggressiveness == 30
    sarah = next(s for s in cfg.stakeholders if s.name == "Sarah Chen")
    assert sarah.personality.model_dump() == drafts.ARCHETYPE_PRESETS["opportunist"]
    assert "Marcus chairs the vote." in body["notes"]
    user_prompt = fake.calls[0]["messages"][-1]["content"]
    assert "Series B at $75M" in user_prompt


def test_guaranteed_detractor_is_added_with_a_note(client, db, use_llm):
    use_llm(LLM_ROOM)
    body = client.post("/drafts/simulation", json={"brief": "Series B pitch to the board."}).json()
    cfg = _assert_valid_room(body["config"])
    skeptics = [s for s in cfg.stakeholders if s.stance == "detractor"]
    assert len(skeptics) == 1
    assert any(skeptics[0].name in note and "skeptic" in note for note in body["notes"])
    if cfg.end_condition.type == "vote":
        assert skeptics[0].id in cfg.end_condition.voters


def test_detractor_not_forced_when_brief_opts_out(client, db, use_llm):
    use_llm(LLM_ROOM)
    body = client.post("/drafts/simulation", json={"brief": "A friendly room, no detractors: rehearse the happy path."}).json()
    cfg = _assert_valid_room(body["config"])
    assert not any(s.stance == "detractor" for s in cfg.stakeholders)


def test_library_personas_keep_their_ids_and_saved_settings(client, db, use_llm):
    fake = use_llm({
        "subject": {"name": "Pilot expansion", "description": "Expand the pilot to all regions."},
        "stakeholders": [
            # The model tries to re-cast a library person; the saved version must win.
            {"name": "Elena Voss", "role": "Cheerleader", "stance": "champion"},
            {"name": "Hana Okafor", "role": "Security Lead", "stance": "neutral"},
        ],
        "end_condition": {"type": "timeout", "max_normal_turns": 13},
        "voltage": 80,
    })
    body = client.post("/drafts/simulation", json={
        "brief": "Expand the pilot to all regions.", "persona_ids": ["lib-elena", "lib-dan", "missing-id"],
    }).json()
    cfg = _assert_valid_room(body["config"])
    by_id = {s.id: s for s in cfg.stakeholders}
    elena = by_id["lib-elena"]
    assert (elena.role, elena.stance, elena.archetype) == ("VC General Partner", "detractor", "guardian")
    assert elena.personality.model_dump() == LIBRARY["lib-elena"]["personality"]
    assert elena.hidden_agenda == LIBRARY["lib-elena"]["hidden_agenda"]
    dan = by_id["lib-dan"]
    assert dan.personality.empathy == 70 and dan.stance == "champion"
    assert [s.name for s in cfg.stakeholders].count("Elena Voss") == 1
    assert "Hana Okafor" in [s.name for s in cfg.stakeholders]
    assert cfg.end_condition.type == "timeout" and cfg.end_condition.max_normal_turns == 13
    assert any("Couldn't find 1" in n for n in body["notes"])
    assert any("from your library" in n for n in body["notes"])
    assert "Elena Voss" in fake.calls[0]["messages"][-1]["content"]  # told who is already seated


def test_bad_json_from_llm_falls_back_to_closest_template(client, db, use_llm):
    use_llm("Sure! Here is your room: it has a CEO and...")
    body = client.post("/drafts/simulation", json={
        "brief": "We are pitching our Series B to VC investors. Valuation and dilution are the fight.",
    }).json()
    assert body["source"] == "template"
    cfg = _assert_valid_room(body["config"])
    assert {"ceo", "angel", "cfo"} <= {s.id for s in cfg.stakeholders}
    assert cfg.subject.name == "Pitching our Series B to VC investors"
    assert cfg.subject.attributes == {}  # the template's own figures don't belong to this meeting
    assert any("Series B Fundraise" in n for n in body["notes"])


# ---------------------------------------------------------------------------
# Fallbacks without an LLM
# ---------------------------------------------------------------------------


def test_template_fallback_picks_best_match_and_merges_library(client, db, no_llm):
    body = client.post("/drafts/simulation", json={
        "brief": "Data breach went public overnight. The board must approve our response by Friday; reporters are calling.",
        "persona_ids": ["lib-elena"],
    }).json()
    assert body["source"] == "template"
    cfg = _assert_valid_room(body["config"])
    assert cfg.scenario_type == "crisis"
    assert {"crisis-ceo", "gc", "lib-elena"} <= {s.id for s in cfg.stakeholders}
    assert cfg.end_condition.type == "vote"
    assert cfg.env_flags["time_pressure"] and cfg.env_flags["external_leaks"]
    assert cfg.voltage == 80
    assert cfg.subject.description.startswith("Data breach went public")


def test_requested_template_without_brief_skips_the_llm(client, db, use_llm):
    fake = use_llm(LLM_ROOM)
    body = client.post("/drafts/simulation", json={"template": "series-b-fundraise"}).json()
    assert body["source"] == "template"
    assert fake.calls == []
    cfg = _assert_valid_room(body["config"])
    assert cfg.subject.name == "Series B Fundraise"
    assert cfg.subject.evidence_items == ["ARR grew 180% YoY"]
    assert cfg.voltage == 55  # 62 snapped to the "Tense" stop
    assert cfg.speaker_rules.mode == "alternating"


def test_generic_fallback_when_no_template_matches(client, monkeypatch, no_llm):
    monkeypatch.setattr(drafts, "get_database", lambda: FakeDB())
    body = client.post("/drafts/simulation", json={"brief": "Quarterly roadmap prioritisation with engineering and sales."}).json()
    assert body["source"] == "fallback"
    cfg = _assert_valid_room(body["config"])
    assert {s.stance for s in cfg.stakeholders} >= {"champion", "detractor"}
    assert cfg.end_condition.type == "timeout" and cfg.end_condition.max_normal_turns == 12
    assert cfg.voltage in drafts.VOLTAGE_STOPS


def test_generic_fallback_seats_the_people_the_brief_mentions(client, monkeypatch, no_llm):
    monkeypatch.setattr(drafts, "get_database", lambda: FakeDB())
    body = client.post("/drafts/simulation", json={
        "brief": "Diana Park, our CFO, is wary of the pricing change while CTO Raj Patel supports it. The board votes Friday.",
    }).json()
    cfg = _assert_valid_room(body["config"])
    people = {s.name: s for s in cfg.stakeholders}
    assert (people["Diana Park"].role, people["Diana Park"].stance) == ("CFO", "detractor")
    assert (people["Raj Patel"].role, people["Raj Patel"].stance) == ("CTO", "champion")
    assert cfg.end_condition.type == "vote"
    assert cfg.subject.name == "Diana Park, our CFO, is wary of the pricing change"


def test_database_down_never_500s(client, monkeypatch, no_llm):
    class Down:
        def __getattr__(self, name):
            raise RuntimeError("Database client not connected")

    monkeypatch.setattr(drafts, "get_database", lambda: Down())
    res = client.post("/drafts/simulation", json={"brief": "Board vote on the merger.", "persona_ids": ["lib-elena"]})
    assert res.status_code == 200
    _assert_valid_room(res.json()["config"])


# ---------------------------------------------------------------------------
# Refine
# ---------------------------------------------------------------------------


def _current_room() -> dict:
    return {
        "subject": {"name": "Pricing review", "description": "Should we raise prices 20%?"},
        "stakeholders": [
            {"id": "bob", "name": "Bob Hart", "role": "VP Sales", "stance": "champion",
             "personality": {"aggressiveness": 50, "empathy": 50, "stubbornness": 50, "verbosity": 50}},
            {"id": "alice", "name": "Alice Moreau", "role": "CFO", "stance": "detractor",
             "personality": {"aggressiveness": 40, "empathy": 60, "stubbornness": 70, "verbosity": 40}},
            {"id": "chair", "name": "Grace Lin", "role": "CEO", "stance": "moderator"},
        ],
        "action_space": {"actions": []},
        "end_condition": {"type": "timeout", "max_normal_turns": 12},
        "voltage": 40,
        "env_flags": {"hidden_motives": True, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
        "scenario_type": "debate",
    }


def test_refine_with_rules_when_llm_is_unavailable(client, db, no_llm):
    body = client.post("/drafts/simulation", json={
        "current": _current_room(),
        "instruction": "make Bob angrier, end on a vote and add their lawyer; add a deadline",
    }).json()
    assert body["source"] == "fallback"
    cfg = _assert_valid_room(body["config"])
    by_id = {s.id: s for s in cfg.stakeholders}
    assert by_id["bob"].personality.aggressiveness == 70
    assert cfg.voltage == 40  # the room's temperature was not the target, and refine keeps exact values
    assert cfg.end_condition.type == "vote"
    assert "chair" not in cfg.end_condition.voters
    lawyer = next(s for s in cfg.stakeholders if s.id not in ("bob", "alice", "chair"))
    assert lawyer.role == "Lawyer" and lawyer.stance == "detractor"
    assert cfg.env_flags["time_pressure"] is True
    assert all(s.name not in ("Deadline",) for s in cfg.stakeholders)
    assert len(body["notes"]) >= 4


def test_refine_rules_room_temperature_and_removal(client, db, no_llm):
    room = _current_room()
    body = client.post("/drafts/simulation", json={"current": room, "instruction": "Make it more hostile"}).json()
    assert body["config"]["voltage"] == 55
    body = client.post("/drafts/simulation", json={"current": body["config"], "instruction": "make it hostile"}).json()
    assert body["config"]["voltage"] == 80
    body = client.post("/drafts/simulation", json={"current": room, "instruction": "remove Alice"}).json()
    cfg = _assert_valid_room(body["config"])
    # Alice was the only detractor and the instruction didn't ask for a friendly room, so a skeptic comes back.
    assert "alice" not in {s.id for s in cfg.stakeholders}
    assert any(s.stance == "detractor" for s in cfg.stakeholders)
    assert any("skeptic" in n for n in body["notes"])


def test_refine_opting_out_of_opposition(client, db, no_llm):
    body = client.post("/drafts/simulation", json={
        "current": _current_room(), "instruction": "remove Alice, no detractors",
    }).json()
    cfg = _assert_valid_room(body["config"])
    assert not any(s.stance == "detractor" for s in cfg.stakeholders)


def test_refine_with_llm_patch(client, db, use_llm):
    fake = use_llm({
        "update": [{"id": "bob", "personality": {"aggressiveness": 85}, "stance": "wildcard"}],
        "add": [{"name": "Tom Reyes", "role": "Outside Counsel", "stance": "detractor", "archetype": "guardian"}],
        "remove": ["chair"],
        "end_condition": {"type": "judge", "judge_id": "nobody"},
        "voltage": 80,
        "notes": ["Bob is now unpredictable."],
    })
    body = client.post("/drafts/simulation", json={
        "current": _current_room(), "instruction": "make Bob a loose cannon and add their lawyer",
    }).json()
    assert body["source"] == "llm"
    cfg = _assert_valid_room(body["config"])
    bob = next(s for s in cfg.stakeholders if s.id == "bob")
    assert bob.personality.aggressiveness == 85 and bob.personality.empathy == 50 and bob.stance == "wildcard"
    assert "chair" not in {s.id for s in cfg.stakeholders}
    assert "Tom Reyes" in [s.name for s in cfg.stakeholders]
    # No moderator is left to judge, so the ending falls back to a timeout with a note.
    assert cfg.end_condition.type == "timeout"
    assert cfg.voltage == 80
    assert "Bob is now unpredictable." in body["notes"]
    assert "Bob Hart" in fake.calls[0]["messages"][-1]["content"]


def test_refine_llm_failure_uses_rules(client, db, use_llm):
    use_llm(TimeoutError())
    body = client.post("/drafts/simulation", json={"current": _current_room(), "instruction": "end on a vote, 75%"}).json()
    assert body["source"] == "fallback"
    cfg = _assert_valid_room(body["config"])
    assert cfg.end_condition.type == "vote" and cfg.end_condition.threshold == 0.75


def test_refine_adds_requested_library_persona(client, db, no_llm):
    body = client.post("/drafts/simulation", json={"current": _current_room(), "persona_ids": ["lib-elena"]}).json()
    cfg = _assert_valid_room(body["config"])
    elena = next(s for s in cfg.stakeholders if s.id == "lib-elena")
    assert elena.personality.stubbornness == 88


# ---------------------------------------------------------------------------
# Upload variant
# ---------------------------------------------------------------------------


def test_upload_reads_documents_into_the_prompt(client, db, use_llm):
    fake = use_llm(LLM_ROOM)
    res = client.post(
        "/drafts/simulation/upload",
        data={"brief": "Board meeting on the raise", "persona_ids": "lib-elena, lib-dan"},
        files=[
            ("files", ("term-sheet.txt", b"Pre-money valuation: $75M. Liquidation preference 1x.", "text/plain")),
            ("files", ("deck.pptx", b"PK\x03\x04junk", "application/vnd.ms-powerpoint")),
        ],
    )
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "llm"
    cfg = _assert_valid_room(body["config"])
    assert {"lib-elena", "lib-dan"} <= {s.id for s in cfg.stakeholders}
    prompt = fake.calls[0]["messages"][-1]["content"]
    assert "Pre-money valuation: $75M" in prompt and "<documents>" in prompt
    assert any("deck.pptx" in n for n in body["notes"])


def test_upload_without_llm_uses_document_text(client, db, no_llm):
    res = client.post(
        "/drafts/simulation/upload",
        data={"brief": ""},
        files=[("files[]", ("breach-notes.txt", b"Customer data breach confirmed. Regulators notified within 72 hours.", "text/plain"))],
    )
    assert res.status_code == 200
    body = res.json()
    cfg = _assert_valid_room(body["config"])
    assert cfg.scenario_type == "crisis"
    assert "Regulators notified within 72 hours." in cfg.subject.evidence_items
