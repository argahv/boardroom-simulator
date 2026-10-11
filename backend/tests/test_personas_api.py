"""Persona contract tests: archetype, GET/PATCH /stakeholders/{id}, evolution context.

Runs against the real Postgres like the other DB tests. Every row a test
creates is removed afterwards, so the shared persona library is left alone.
The ASGI transport keeps requests on the test's event loop, which the Prisma
client is bound to.
"""
from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.database import get_database
from app.evolution import EvolutionService, describe_evolution, outcome_words
from app.main import app
from app.models import PersonaDocument, PersonaEvolution

PERSONA_KEYS = {
    "id", "name", "role", "focus", "incentive_tuning", "hidden_agenda", "tag", "tool_profile",
    "backstory", "stance", "personality", "tools", "archetype", "sim_count", "total_turns",
    "document_count",
}
TRAITS = {"aggressiveness": 60, "empathy": 40, "stubbornness": 70, "verbosity": 50}


@pytest_asyncio.fixture
async def created(db_setup):
    """Ids this test created; deleted on teardown (evolutions and documents cascade)."""
    made: dict[str, list[str]] = {"stakeholders": [], "simulations": []}
    yield made
    client = get_database()._client
    for sim_id in made["simulations"]:
        await client.simulations.delete_many(where={"id": sim_id})
    for sid in made["stakeholders"]:
        await client.stakeholders.delete_many(where={"id": sid})
        await client.personas.delete_many(where={"id": sid})


@pytest_asyncio.fixture
async def api(created):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def _create(api, created, **fields) -> dict:
    body = {"id": "", "name": "Dana Okafor", "role": "CFO", **fields}
    resp = await api.post("/stakeholders", json=body)
    assert resp.status_code == 201, resp.text
    persona = resp.json()
    created["stakeholders"].append(persona["id"])
    return persona


async def _simulation(created, persona: dict, stance: str, outcome: dict, subject="Series B",
                      others: list[dict] | None = None) -> str:
    db = get_database()
    sim_id = str(uuid4())
    created["simulations"].append(sim_id)
    seats = [{"id": persona["id"], "name": persona["name"], "stance": stance}, *(others or [])]
    await db.create_new_simulation(sim_id, {"subject": {"name": subject}, "stakeholders": seats})
    await db.save_simulation_outcome(sim_id, outcome)
    return sim_id


# ── Contract A / B: persona JSON, GET and PATCH ─────────────────────────


@pytest.mark.asyncio
async def test_create_returns_full_persona_with_archetype(api, created):
    persona = await _create(api, created, archetype="Guardian", stance="detractor",
                            personality={"aggressiveness": 80}, tools=["calculator"])
    assert set(persona) == PERSONA_KEYS
    assert persona["archetype"] == "guardian"
    assert persona["stance"] == "detractor"
    assert persona["personality"] == {"aggressiveness": 80, "empathy": 50, "stubbornness": 50, "verbosity": 50}
    assert persona["tools"] == ["calculator"]
    assert persona["focus"] == ""
    assert (persona["sim_count"], persona["total_turns"], persona["document_count"]) == (0, 0, 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", [{"archetype": "wizard"}, {"stance": "furious"}])
async def test_create_rejects_unknown_stance_or_archetype(api, created, bad):
    resp = await api.post("/stakeholders", json={"id": "", "name": "X", "role": "Y", **bad})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_stakeholder_by_id(api, created):
    persona = await _create(api, created, personality=TRAITS)
    resp = await api.get(f"/stakeholders/{persona['id']}")
    assert resp.status_code == 200
    assert resp.json() == persona

    assert (await api.get(f"/stakeholders/{uuid4()}")).status_code == 404


@pytest.mark.asyncio
async def test_list_and_detail_count_documents(api, created):
    persona = await _create(api, created)
    await get_database().create_persona_document(PersonaDocument(
        id=str(uuid4()), persona_id=persona["id"], filename="deck.pdf", status="ready",
    ))
    listed = next(p for p in (await api.get("/stakeholders")).json() if p["id"] == persona["id"])
    assert set(listed) == PERSONA_KEYS
    assert listed["document_count"] == 1
    assert (await api.get(f"/stakeholders/{persona['id']}")).json()["document_count"] == 1
    assert (await api.get(f"/personas/{persona['id']}")).json()["document_count"] == 1


@pytest.mark.asyncio
async def test_patch_changes_only_given_fields_and_merges_personality(api, created):
    persona = await _create(api, created, backstory="Ex-banker.", personality=TRAITS, archetype="pragmatist")
    pid = persona["id"]

    resp = await api.patch(f"/stakeholders/{pid}", json={"personality": {"stubbornness": 95}})
    assert resp.status_code == 200
    assert resp.json()["personality"] == {**TRAITS, "stubbornness": 95}

    resp = await api.patch(f"/stakeholders/{pid}", json={"name": "Dana O.", "stance": "Champion"})
    body = resp.json()
    assert (body["name"], body["stance"]) == ("Dana O.", "champion")
    assert body["backstory"] == "Ex-banker."
    assert body["archetype"] == "pragmatist"
    assert body["personality"]["stubbornness"] == 95
    assert set(body) == PERSONA_KEYS
    assert (await api.get(f"/stakeholders/{pid}")).json() == body

    # The personas row (simulation lookups, history) follows the edit.
    row = await get_database()._client.personas.find_first(where={"id": pid})
    assert row.name == "Dana O."
    assert row.personality["stubbornness"] == 95


@pytest.mark.asyncio
async def test_patch_sets_and_clears_archetype(api, created):
    pid = (await _create(api, created))["id"]
    assert (await api.patch(f"/stakeholders/{pid}", json={"archetype": "Diplomat"})).json()["archetype"] == "diplomat"
    assert (await api.patch(f"/stakeholders/{pid}", json={"role": "COO"})).json()["archetype"] == "diplomat"
    assert (await api.patch(f"/stakeholders/{pid}", json={"archetype": None})).json()["archetype"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", [
    {"stance": "furious"},
    {"archetype": "wizard"},
    {"personality": {"empathy": 120}},
    {"name": "   "},
])
async def test_patch_rejects_invalid_values(api, created, bad):
    pid = (await _create(api, created))["id"]
    assert (await api.patch(f"/stakeholders/{pid}", json=bad)).status_code == 422


@pytest.mark.asyncio
async def test_patch_unknown_persona_is_404(api, created):
    assert (await api.patch(f"/stakeholders/{uuid4()}", json={"name": "Nobody"})).status_code == 404


@pytest.mark.asyncio
async def test_put_still_replaces_but_keeps_archetype_it_does_not_mention(api, created):
    persona = await _create(api, created, archetype="agitator")
    body = {k: persona[k] for k in ("name", "role", "focus", "hidden_agenda", "tag", "tool_profile")}
    resp = await api.put(f"/stakeholders/{persona['id']}", json={**body, "id": "", "backstory": "New."})
    assert resp.status_code == 200
    assert resp.json()["backstory"] == "New."
    assert resp.json()["archetype"] == "agitator"
    assert isinstance(resp.json()["personality"], dict)


# ── Contract C: evolution subject, outcome, reason ──────────────────────


@pytest.mark.asyncio
async def test_evolution_items_say_what_happened(api, created):
    persona = await _create(api, created, stance="champion", personality=TRAITS)
    sim_id = await _simulation(created, persona, "champion",
                               {"reason": "vote_majority", "outcome_type": "rejected"})
    await EvolutionService(get_database()).compute_and_store(
        persona_id=persona["id"], simulation_id=sim_id, current_personality=TRAITS,
        current_stance="champion", simulation_result={"outcome_type": "vote", "vote_result": "loss"},
    )

    pending = (await api.get(f"/personas/{persona['id']}/evolutions/pending")).json()
    assert len(pending) == 1
    item = pending[0]
    assert item["simulation_subject"] == "Series B"
    assert item["outcome"] == "lost the vote"
    assert item["reason"] == "After 'Series B' (lost the vote): +5 empathy, -5 stubbornness"

    # Stored on the row, so it still reads after the simulation is gone.
    await get_database().delete_new_simulation(sim_id)
    history = (await api.get(f"/personas/{persona['id']}/evolutions")).json()
    assert [h["reason"] for h in history] == [item["reason"]]


@pytest.mark.asyncio
async def test_evolution_without_a_known_simulation_still_has_a_reason(api, created):
    persona = await _create(api, created)
    await EvolutionService(get_database()).compute_and_store(
        persona_id=persona["id"], simulation_id="not-a-simulation", current_personality=TRAITS,
        current_stance="neutral", simulation_result={"outcome_type": "timeout"},
    )
    item = (await api.get(f"/personas/{persona['id']}/evolutions")).json()[0]
    assert item["simulation_subject"] is None
    assert item["outcome"] == "no decision"
    assert item["reason"] == "After a meeting (no decision): +5 aggressiveness, -5 empathy, +5 stubbornness"


@pytest.mark.asyncio
async def test_older_evolution_rows_are_described_from_the_simulation(api, created):
    persona = await _create(api, created)
    marcus = {"id": "marcus", "name": "Marcus Webb", "stance": "detractor"}
    sim_id = await _simulation(created, persona, "neutral",
                               {"reason": "walkaway", "outcome_type": "walkaway", "walkaway_party": "marcus"},
                               subject="Merger terms", others=[marcus])
    # A row written before subject/outcome were stored.
    await get_database().create_persona_evolution(PersonaEvolution(
        id=str(uuid4()), persona_id=persona["id"], simulation_id=sim_id,
        proposed_deltas='{"aggressiveness": 10, "empathy": 5}', before_snapshot="{}",
    ))
    item = (await api.get(f"/personas/{persona['id']}/evolutions/pending")).json()[0]
    assert item["simulation_subject"] == "Merger terms"
    assert item["outcome"] == "Marcus Webb walked out"
    assert item["reason"] == "After 'Merger terms' (Marcus Webb walked out): +10 aggressiveness, +5 empathy"


@pytest.mark.asyncio
async def test_approving_an_evolution_moves_the_dials(api, created):
    persona = await _create(api, created, personality=TRAITS)
    await EvolutionService(get_database()).compute_and_store(
        persona_id=persona["id"], simulation_id="sim-x", current_personality=TRAITS,
        current_stance="neutral", simulation_result={"outcome_type": "consensus"},
    )
    evo_id = (await api.get(f"/personas/{persona['id']}/evolutions/pending")).json()[0]["id"]
    assert (await api.post(f"/evolutions/{evo_id}/approve")).status_code == 200

    expected = {**TRAITS, "aggressiveness": 57, "empathy": 43}
    assert (await api.get(f"/stakeholders/{persona['id']}")).json()["personality"] == expected
    row = await get_database()._client.personas.find_first(where={"id": persona["id"]})
    assert row.personality == expected


# ── Plain words, no DB ──────────────────────────────────────────────────


@pytest.mark.parametrize("outcome,stance,words", [
    ({"reason": "vote_majority", "outcome_type": "agreement"}, "champion", "won the vote"),
    ({"reason": "vote_majority", "outcome_type": "agreement"}, "detractor", "lost the vote"),
    ({"reason": "vote_majority", "outcome_type": "rejected"}, "detractor", "won the vote"),
    ({"reason": "vote_majority", "outcome_type": "rejected"}, "neutral", "voted down"),
    ({"reason": "explicit_agreement", "outcome_type": "agreement"}, "neutral", "deal reached"),
    ({"reason": "judge_verdict", "outcome_type": "judge_ruling"}, "moderator", "deal reached"),
    ({"reason": "walkaway", "outcome_type": "walkaway", "walkaway_party": "me"}, "detractor", "walked out"),
    ({"reason": "deadlock", "outcome_type": "impasse"}, "champion", "impasse"),
    ({"reason": "timeout", "outcome_type": "no_decision"}, "champion", "no decision"),
    (None, "champion", None),
])
def test_outcome_words(outcome, stance, words):
    assert outcome_words(outcome, stance, persona_id="me") == words


def test_describe_evolution_without_changes():
    assert describe_evolution("Q3 budget", "deal reached", {"empathy": 0}) == "After 'Q3 budget' (deal reached): no change"
