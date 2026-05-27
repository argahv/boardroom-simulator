"""
Wave 1 tests: DB migration (v2 columns + new tables) and v2 persona CRUD API.

Tests cover:
- stakeholders table has v2 columns (backstory, stance, personality, tools)
- persona_documents, persona_evolution, persona_research tables exist
- v2 persona creation/update via API
- GET /personas/{id} returns full v2 detail
- Backwards compatibility: v1-only POST still works
"""
from __future__ import annotations

import asyncio
import json
import os
from uuid import uuid4

# must set env before importing app modules (config.py loads .env at import)
os.environ["DATABASE_TYPE"] = "sqlite"
os.environ["SQLITE_PATH"] = ":memory:"

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import initialize_database, close_database
from app.database.sqlite import SQLiteBackend


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db() -> SQLiteBackend:
    """Create and initialize a fresh in-memory SQLiteBackend for schema tests."""
    db = SQLiteBackend(":memory:")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(db.initialize())
    return db


# ---------------------------------------------------------------------------
# Schema tests — verify DB migration creates correct tables/columns
# ---------------------------------------------------------------------------

def test_stakeholders_table_has_v2_columns():
    """stakeholders table has all v2 columns: backstory, stance, personality, tools."""
    db = _make_db()
    cursor = db.conn.cursor()
    cursor.execute("PRAGMA table_info(stakeholders)")
    cols = {row["name"] for row in cursor.fetchall()}

    assert "backstory" in cols, "missing backstory column"
    assert "stance" in cols, "missing stance column"
    assert "personality" in cols, "missing personality column"
    assert "tools" in cols, "missing tools column"
    assert "hidden_agenda" in cols, "missing hidden_agenda column"
    assert "tool_profile" in cols, "missing tool_profile column"


def test_persona_documents_table_exists():
    """persona_documents table is created with correct columns and FK."""
    db = _make_db()
    cursor = db.conn.cursor()
    cursor.execute("PRAGMA table_info(persona_documents)")
    cols = {row["name"] for row in cursor.fetchall()}

    assert "id" in cols
    assert "persona_id" in cols
    assert "filename" in cols
    assert "filepath" in cols
    assert "content_type" in cols
    assert "size_bytes" in cols
    assert "status" in cols
    assert "extracted_text" in cols
    assert "embedding_id" in cols
    assert "created_at" in cols


def test_persona_evolution_table_exists():
    """persona_evolution table is created with correct columns."""
    db = _make_db()
    cursor = db.conn.cursor()
    cursor.execute("PRAGMA table_info(persona_evolution)")
    cols = {row["name"] for row in cursor.fetchall()}

    assert "id" in cols
    assert "persona_id" in cols
    assert "simulation_id" in cols
    assert "proposed_deltas" in cols
    assert "before_snapshot" in cols
    assert "status" in cols
    assert "applied_at" in cols
    assert "created_at" in cols


def test_persona_research_table_exists():
    """persona_research table is created with correct columns."""
    db = _make_db()
    cursor = db.conn.cursor()
    cursor.execute("PRAGMA table_info(persona_research)")
    cols = {row["name"] for row in cursor.fetchall()}

    assert "id" in cols
    assert "persona_id" in cols
    assert "query" in cols
    assert "results" in cols
    assert "created_at" in cols


def test_persona_documents_fk_constraint():
    """persona_documents has FK on persona_id referencing stakeholders(id)."""
    db = _make_db()
    cursor = db.conn.cursor()
    cursor.execute("PRAGMA foreign_key_list(persona_documents)")
    fks = cursor.fetchall()
    persona_fk = any(
        row["table"] == "stakeholders" and row["from"] == "persona_id" and row["to"] == "id"
        for row in fks
    )
    assert persona_fk, "Missing FK on persona_documents.persona_id → stakeholders.id"


# ---------------------------------------------------------------------------
# API fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def fresh_db():
    """Reset the global DB singleton to a fresh in-memory database."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(close_database())
    loop.run_until_complete(initialize_database())
    yield
    loop.run_until_complete(close_database())
    loop.close()


@pytest.fixture
def client(fresh_db):
    """TestClient with a fresh DB per test."""
    return TestClient(app)


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

def test_create_stakeholder_api_with_v2_fields(client):
    """POST /stakeholders with v2 fields creates persona and returns them."""
    resp = client.post("/stakeholders", json=V2_STAKEHOLDER)
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


def test_create_stakeholder_api_v1_backwards_compat(client):
    """POST /stakeholders without v2 fields applies defaults."""
    resp = client.post("/stakeholders", json=V1_STAKEHOLDER)
    assert resp.status_code == 201
    data = resp.json()

    assert data["name"] == "Alice Chen"
    assert data["role"] == "CTO"
    # v2 fields should default to empty/neutral
    assert data["backstory"] == ""
    assert data["stance"] == "neutral"
    assert data["personality"] == "{}"
    assert data["tools"] == "[]"


def test_update_stakeholder_api_v2_fields(client):
    """PUT /stakeholders/{id} updates v2 fields."""
    # Create
    create_resp = client.post("/stakeholders", json=V1_STAKEHOLDER)
    sid = create_resp.json()["id"]

    # Update with v2 fields
    updated = {**V1_STAKEHOLDER, "backstory": "Updated backstory", "stance": "detractor"}
    resp = client.put(f"/stakeholders/{sid}", json=updated)
    assert resp.status_code == 200
    data = resp.json()

    assert data["backstory"] == "Updated backstory"
    assert data["stance"] == "detractor"
    assert data["personality"] == "{}"
    assert data["tools"] == "[]"
    assert data["id"] == sid


def test_list_personas_v2_returns_v2_fields(client):
    """GET /stakeholders returns v2 fields for v2 personas."""
    client.post("/stakeholders", json=V2_STAKEHOLDER)

    resp = client.get("/stakeholders")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1

    bob = next((s for s in data if s["name"] == "Bob Rivera"), None)
    assert bob is not None
    assert bob["backstory"] == "Built and sold two companies."
    assert bob["stance"] == "champion"
    assert bob["personality"] == json.dumps(
        {"aggressiveness": 60, "empathy": 40, "stubbornness": 70, "verbosity": 50}
    )
    assert bob["tools"] == '["financial_modeler", "due_diligence_bot"]'


def test_get_persona_v2_returns_full_detail(client):
    """GET /personas/{id} returns full v2 detail."""
    create_resp = client.post("/stakeholders", json=V2_STAKEHOLDER)
    sid = create_resp.json()["id"]

    resp = client.get(f"/personas/{sid}")
    assert resp.status_code == 200
    data = resp.json()

    assert data["id"] == sid
    assert data["name"] == "Bob Rivera"
    assert data["role"] == "CEO"
    assert data["focus"] == "revenue growth"
    assert data["incentive_tuning"] == 80
    assert data["backstory"] == "Built and sold two companies."
    assert data["stance"] == "champion"
    assert data["personality"] == json.dumps(
        {"aggressiveness": 60, "empathy": 40, "stubbornness": 70, "verbosity": 50}
    )
    assert data["tools"] == '["financial_modeler", "due_diligence_bot"]'
    assert data["hidden_agenda"] == "Want to acquire the startup cheaply"


def test_get_persona_v2_nonexistent_returns_404(client):
    """GET /personas/{nonexistent} returns 404."""
    resp = client.get("/personas/nonexistent-id")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_delete_stakeholder_removes_persona(client):
    """DELETE /stakeholders/{id} removes persona (204)."""
    create_resp = client.post("/stakeholders", json=V1_STAKEHOLDER)
    sid = create_resp.json()["id"]

    del_resp = client.delete(f"/stakeholders/{sid}")
    assert del_resp.status_code == 204

    # Verify persona is gone
    get_resp = client.get(f"/personas/{sid}")
    assert get_resp.status_code == 404


def test_persona_document_upload_model():
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


def test_persona_evolution_model():
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


def test_persona_research_model():
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
