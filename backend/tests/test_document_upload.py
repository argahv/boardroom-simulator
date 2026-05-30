"""Integration tests for document upload endpoints.

Tests POST /simulations/with-documents validation:
- JSON config parsing
- File type, size, count restrictions
- Document metadata in GET response
- PDF text extraction pipeline
"""
from __future__ import annotations

import json
import os
import shutil
import tempfile

# must set DATABASE_TYPE before importing app modules
os.environ["DATABASE_TYPE"] = "prisma"

import pytest
from fastapi.testclient import TestClient

from app.main import app, _active_simulations
from app import config

# ---------------------------------------------------------------------------
# Module-level setup
# ---------------------------------------------------------------------------

# redirect uploads to a temp dir so tests don't pollute dev data
TEST_UPLOAD_DIR = tempfile.mkdtemp()
config.UPLOAD_DIR = TEST_UPLOAD_DIR
os.makedirs(TEST_UPLOAD_DIR, exist_ok=True)

_active_simulations.clear()

client = TestClient(app)

VALID_CONFIG = {
    "subject": {
        "name": "Test Subject",
        "description": "Test",
        "attributes": {},
        "evidence_items": [],
        "stakes_description": "Test",
    },
    "stakeholders": [],
    "action_space": {"actions": []},
    "speaker_rules": {"mode": "alternating"},
    "end_condition": {"type": "timeout", "turns": 5},
    "voltage": 50,
    "player_mode": False,
    "env_flags": {},
    "system_prompt_template": "",
    "model_temperature": "stable",
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _cleanup_after():
    """Clean simulation state + upload files after each test."""
    yield
    _active_simulations.clear()
    for item in os.listdir(TEST_UPLOAD_DIR):
        path = os.path.join(TEST_UPLOAD_DIR, item)
        if os.path.isfile(path):
            os.unlink(path)
        elif os.path.isdir(path):
            shutil.rmtree(path)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_test_pdf(text: str = "Hello World") -> bytes:
    """Build a minimal valid PDF that pypdf can parse.

    The PDF contains a single A4-sized page with *text* rendered in 12pt
    Helvetica at position (100, 700).
    """
    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 100 700 Td({safe}) Tj ET".encode("latin-1")

    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R"
        b" /MediaBox [0 0 612 792] /Contents 4 0 R"
        b" /Resources << /Font << /F1 5 0 R >> >> >>\nendobj",
        b"4 0 obj\n<< /Length "
        + str(len(stream)).encode()
        + b" >>\nstream\n"
        + stream
        + b"\nendstream\nendobj",
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj",
    ]

    header = b"%PDF-1.4"
    body = header + b"\n" + b"\n".join(objects)

    # cross-reference table offsets
    pos = len(header) + 1  # after header + newline
    offsets = [0]
    for obj in objects:
        offsets.append(pos)
        pos += len(obj) + 1

    xref = b"xref\n0 6\n"
    xref += b"%010d 65535 f \n" % 0
    for i in range(1, 6):
        xref += b"%010d 00000 n \n" % offsets[i]

    xref_offset = len(body) + 1
    trailer = b"trailer\n<< /Size 6 /Root 1 0 R >>\n"

    return (
        body
        + b"\n"
        + xref
        + trailer
        + b"startxref\n"
        + str(xref_offset).encode()
        + b"\n%%EOF"
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.usefixtures("db_setup")
def test_json_endpoint_unchanged():
    """POST /simulations with JSON body creates a simulation (200)."""
    resp = client.post("/simulations", json=VALID_CONFIG)
    assert resp.status_code == 200
    data = resp.json()
    assert "simulation_id" in data


@pytest.mark.usefixtures("db_setup")
def test_multipart_with_pdf():
    """POST /simulations/with-documents with valid PDF returns 200 + 1 doc."""
    resp = client.post(
        "/simulations/with-documents",
        data={"config": json.dumps(VALID_CONFIG)},
        files={"files": ("test.pdf", b"%PDF-1.4 test content", "application/pdf")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "simulation_id" in data

    # Verify document metadata via GET
    sim_id = data["simulation_id"]
    get_resp = client.get(f"/simulations/{sim_id}")
    assert get_resp.status_code == 200
    assert len(get_resp.json()["documents"]) == 1


@pytest.mark.usefixtures("db_setup")
def test_multipart_no_files():
    """POST /simulations/with-documents without files returns 200 + empty docs."""
    resp = client.post(
        "/simulations/with-documents",
        data={"config": json.dumps(VALID_CONFIG)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "simulation_id" in data

    # Verify doc list is empty via GET
    sim_id = data["simulation_id"]
    get_resp = client.get(f"/simulations/{sim_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["documents"] == []


@pytest.mark.usefixtures("db_setup")
def test_multipart_reject_invalid_type():
    """POST with .exe file returns 422."""
    resp = client.post(
        "/simulations/with-documents",
        data={"config": json.dumps(VALID_CONFIG)},
        files={
            "files": (
                "malware.exe",
                b"MZ executable",
                "application/x-msdownload",
            )
        },
    )
    assert resp.status_code == 422


@pytest.mark.usefixtures("db_setup")
def test_multipart_reject_oversized():
    """POST with file > 25 MB returns 413."""
    large = b"0" * (26 * 1024 * 1024)
    resp = client.post(
        "/simulations/with-documents",
        data={"config": json.dumps(VALID_CONFIG)},
        files={"files": ("large.pdf", large, "application/pdf")},
    )
    assert resp.status_code == 413


@pytest.mark.usefixtures("db_setup")
def test_multipart_exceed_max_count():
    """POST with 6 files returns 422."""
    files = []
    for i in range(6):
        files.append(
            ("files", (f"doc{i}.pdf", b"%PDF-1.4 content", "application/pdf"))
        )
    resp = client.post(
        "/simulations/with-documents",
        data={"config": json.dumps(VALID_CONFIG)},
        files=files,
    )
    assert resp.status_code == 422


@pytest.mark.usefixtures("db_setup")
def test_multipart_invalid_json():
    """POST with malformed config string returns 422."""
    resp = client.post(
        "/simulations/with-documents",
        data={"config": "not valid json"},
    )
    assert resp.status_code == 422


@pytest.mark.usefixtures("db_setup")
def test_document_metadata_in_get():
    """GET /simulations/{id} returns document metadata without
    extracted_text or filepath."""
    create_resp = client.post(
        "/simulations/with-documents",
        data={"config": json.dumps(VALID_CONFIG)},
        files={"files": ("test.pdf", b"%PDF-1.4 content", "application/pdf")},
    )
    assert create_resp.status_code == 200
    sim_id = create_resp.json()["simulation_id"]

    get_resp = client.get(f"/simulations/{sim_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert "documents" in data
    assert len(data["documents"]) == 1
    doc = data["documents"][0]
    assert "id" in doc
    assert "filename" in doc
    assert "size_bytes" in doc
    assert "content_type" in doc
    assert "status" in doc
    assert "created_at" in doc
    assert "extracted_text" not in doc
    assert "filepath" not in doc


@pytest.mark.usefixtures("db_setup")
def test_extraction_pdf():
    """Upload a PDF with known content, verify extracted_text flows through."""
    pdf_bytes = _make_test_pdf("Test document content for extraction")
    resp = client.post(
        "/simulations/with-documents",
        data={"config": json.dumps(VALID_CONFIG)},
        files={"files": ("test.pdf", pdf_bytes, "application/pdf")},
    )
    assert resp.status_code == 200
    sim_id = resp.json()["simulation_id"]

    # status == "ready" tells us extraction succeeded
    get_resp = client.get(f"/simulations/{sim_id}")
    assert get_resp.status_code == 200
    docs = get_resp.json().get("documents", [])
    assert len(docs) == 1
    assert docs[0]["status"] == "ready"

    # _document_context in the in-memory store contains the extracted text
    ctx = _active_simulations[sim_id].get("_document_context", "")
    assert "Test document content for extraction" in ctx
