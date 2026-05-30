"""
Wave 1 tests: DB migration (v2 columns + new tables) and v2 persona CRUD API.

Tests cover:
- v2 persona creation/update via API
- GET /personas/{id} returns full v2 detail
- Backwards compatibility: v1-only POST still works
"""
from __future__ import annotations

import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import get_database


# ---------------------------------------------------------------------------
# API fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def fresh_db(db_setup):
    """Clean all persona-related data between tests via Prisma delete_many."""
    yield
    db = get_database()
    prisma = getattr(db, "_client", None)
    if prisma is not None:
        await prisma.persona_documents.delete_many()
        await prisma.persona_evolution.delete_many()
        await prisma.persona_research.delete_many()
        await prisma.stakeholders.delete_many()


@pytest_asyncio.fixture
async def client(fresh_db):
    """AsyncTestClient with a fresh DB per test."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


V1_STAKEHOLDER = {
    "id": "",
    "name": "Alice Chen",
    "role": "CTO",
    "focus": "technical feasibility",
    "incentive_tuning": 65,
    "hidden_agenda": "",
    "tag": "VISIONARY",
    "tool_profile": "technical",
}

V2_STAKEHOLDER = {
    "id": "",
    "name": "Bob Rivera",
    "role": "CEO",
    "focus": "revenue growth",
    "incentive_tuning": 80,
    "hidden_agenda": "Want to acquire the startup cheaply",
    "tag": "AGREEABLE",
    "tool_profile": "financial",
    "backstory": "Built and sold two companies.",
    "stance": "champion",
    "personality": json.dumps({"aggressiveness": 60, "empathy": 40, "stubbornness": 70, "verbosity": 50}),
    "tools": '["financial_modeler", "due_diligence_bot"]',
}


# ---------------------------------------------------------------------------
# API tests — v2 persona CRUD
# ---------------------------------------------------------------------------


@pytest.mark.usefixtures("db_setup")
@pytest.mark.asyncio
async def test_create_stakeholder_api_with_v2_fields(client):
    """POST /stakeholders with v2 fields creates persona and returns them."""
    resp = await client.post("/stakeholders", json=V2_STAKEHOLDER)
    assert resp.status_code == 201
    data = resp.json()

    assert data["name"] == "Bob Rivera"
    assert data["role"] == "CEO"
    assert data["backstory"] == "Built and sold two companies."
    assert data["stance"] == "champion"
    assert data["personality"] == json.dumps(
        {"aggressiveness": 60, "empathy": 40, "stubbornness": 70, "verbosity": 50}
    )
    assert data["tools"] == '["financial_modeler", "due_diligence_bot"]'
    assert data["hidden_agenda"] == "Want to acquire the startup cheaply"
    assert "id" in data


@pytest.mark.usefixtures("db_setup")
@pytest.mark.asyncio
async def test_create_stakeholder_api_v1_backwards_compat(client):
    """POST /stakeholders without v2 fields applies defaults."""
    resp = await client.post("/stakeholders", json=V1_STAKEHOLDER)
    assert resp.status_code == 201
    data = resp.json()

    assert data["name"] == "Alice Chen"
    assert data["role"] == "CTO"
    # v2 fields should default to empty/neutral
    assert data["backstory"] == ""
    assert data["stance"] == "neutral"
    assert data["personality"] == "{}"
    assert data["tools"] == "[]"


@pytest.mark.usefixtures("db_setup")
@pytest.mark.asyncio
async def test_update_stakeholder_api_v2_fields(client):
    """PUT /stakeholders/{id} updates v2 fields."""
    # Create
    create_resp = await client.post("/stakeholders", json=V1_STAKEHOLDER)
    sid = create_resp.json()["id"]

    # Update with v2 fields
    updated = {**V1_STAKEHOLDER, "backstory": "Updated backstory", "stance": "detractor"}
    resp = await client.put(f"/stakeholders/{sid}", json=updated)
    assert resp.status_code == 200
    data = resp.json()

    assert data["backstory"] == "Updated backstory"
    assert data["stance"] == "detractor"
    assert data["personality"] == "{}"
    assert data["tools"] == "[]"
    assert data["id"] == sid


@pytest.mark.usefixtures("db_setup")
@pytest.mark.asyncio
async def test_list_personas_v2_returns_v2_fields(client):
    """GET /stakeholders returns v2 fields for v2 personas."""
    await client.post("/stakeholders", json=V2_STAKEHOLDER)

    resp = await client.get("/stakeholders")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1

    bob = next((s for s in data if s["name"] == "Bob Rivera"), None)
    assert bob is not None
    assert bob["backstory"] == "Built and sold two companies."
    assert bob["stance"] == "champion"
    assert bob["personality"] == {"aggressiveness": 60, "empathy": 40, "stubbornness": 70, "verbosity": 50}
    assert bob["tools"] == ["financial_modeler", "due_diligence_bot"]


@pytest.mark.usefixtures("db_setup")
@pytest.mark.asyncio
async def test_get_persona_v2_returns_full_detail(client):
    """GET /personas/{id} returns full v2 detail."""
    create_resp = await client.post("/stakeholders", json=V2_STAKEHOLDER)
    sid = create_resp.json()["id"]

    resp = await client.get(f"/personas/{sid}")
    assert resp.status_code == 200
    data = resp.json()

    assert data["id"] == sid
    assert data["name"] == "Bob Rivera"
    assert data["role"] == "CEO"
    assert data["focus"] == "revenue growth"
    assert data["incentive_tuning"] == 80
    assert data["backstory"] == "Built and sold two companies."
    assert data["stance"] == "champion"
    assert data["personality"] == {"aggressiveness": 60, "empathy": 40, "stubbornness": 70, "verbosity": 50}
    assert data["tools"] == ["financial_modeler", "due_diligence_bot"]
    assert data["hidden_agenda"] == "Want to acquire the startup cheaply"


@pytest.mark.usefixtures("db_setup")
@pytest.mark.asyncio
async def test_get_persona_v2_nonexistent_returns_404(client):
    """GET /personas/{nonexistent} returns 404."""
    resp = await client.get("/personas/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.usefixtures("db_setup")
@pytest.mark.asyncio
async def test_delete_stakeholder_removes_persona(client):
    """DELETE /stakeholders/{id} removes persona (204)."""
    create_resp = await client.post("/stakeholders", json=V1_STAKEHOLDER)
    sid = create_resp.json()["id"]

    del_resp = await client.delete(f"/stakeholders/{sid}")
    assert del_resp.status_code == 204

    # Verify persona is gone
    get_resp = await client.get(f"/personas/{sid}")
    assert get_resp.status_code == 404


@pytest.mark.usefixtures("db_setup")
@pytest.mark.asyncio
async def test_persona_document_upload_model():
    """PersonaDocument model serializes correctly."""
    from app.models import PersonaDocument

    doc = PersonaDocument(
        id="doc-1",
        persona_id="persona-1",
        filename="test.pdf",
        filepath="/uploads/test.pdf",
        content_type="application/pdf",
        size_bytes=1024,
        status="ready",
        extracted_text="Hello",
        embedding_id="emb-1",
        created_at="2025-01-01T00:00:00",
    )
    d = doc.model_dump()
    assert d["persona_id"] == "persona-1"
    assert d["filename"] == "test.pdf"
    assert d["extracted_text"] == "Hello"
    assert d["embedding_id"] == "emb-1"


@pytest.mark.usefixtures("db_setup")
@pytest.mark.asyncio
async def test_persona_evolution_model():
    """PersonaEvolution model serializes correctly."""
    from app.models import PersonaEvolution

    evo = PersonaEvolution(
        id="evo-1",
        persona_id="persona-1",
        simulation_id="sim-1",
        proposed_deltas='{"stance": "detractor"}',
        before_snapshot='{"stance": "neutral"}',
        status="pending",
        created_at="2025-01-01T00:00:00",
    )
    d = evo.model_dump()
    assert d["proposed_deltas"] == '{"stance": "detractor"}'
    assert d["status"] == "pending"


@pytest.mark.usefixtures("db_setup")
@pytest.mark.asyncio
async def test_persona_research_model():
    """PersonaResearch model serializes correctly."""
    from app.models import PersonaResearch

    r = PersonaResearch(
        id="res-1",
        persona_id="persona-1",
        query="Who is Bob Rivera?",
        results='[{"title": "CEO Profile"}]',
        created_at="2025-01-01T00:00:00",
    )
    d = r.model_dump()
    assert d["query"] == "Who is Bob Rivera?"
    assert d["results"] == '[{"title": "CEO Profile"}]'
