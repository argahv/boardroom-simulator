# Simulation Document Upload

## TL;DR

> **Summary**: Add file upload to simulation creation — users attach PDF/DOCX/TXT docs as AI stakeholder context during wizard. Multipart POST, local disk storage, text extraction, token-capped prompt injection.
>
> **Deliverables**:
> - `POST /simulations/with-documents` multipart endpoint
> - `document_uploads` DB table (SQLite + Postgres)
> - File validation (type, size), UUID-based disk storage
> - Text extraction (pypdf, python-docx, plaintext)
> - Document metadata in `GET /simulations/{id}` response
> - Drag-drop upload UI in wizard Step 1
> - FormData API client variant
> - Token-capped prompt injection (≤4000 tokens/doc)
>
> **Estimated Effort**: Medium (12 tasks, 4 waves)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Config+models → Endpoint → Frontend upload → Integration

---

## Context

### Original Request
User can upload relevant documents when creating a simulation.

### Interview Summary
**Decisions Made**:
- Upload timing: During creation (multipart POST)
- Storage: Local disk (`./data/uploads/`)
- File types: PDF + DOCX + TXT
- Max file size: 25 MB per file, max 5 files per sim
- Wizard placement: Step 1 — Subject & Context
- Document purpose: General context for all AI agents
- Auth: None (keep open)

### Metis Review
**Identified Gaps** (addressed):
- **Backward compat**: `POST /simulations` stays JSON-only. New multipart endpoint for wizard.
- **Prompt injection**: 4000-token cap per doc. Truncate beyond that.
- **Extraction blocking**: Use `run_in_executor` for PDF/DOCX text extraction.
- **Postgres dual-maintenance**: Both SQLite and Postgres backends get `document_uploads` table.
- **UUID filenames**: Never trust client filenames for storage paths.
- **Orphan cleanup**: Mark files `status: pending` on upload, batch-delete stale pending files.

---

## Work Objectives

### Core Objective
Users can upload PDF/DOCX/TXT files during simulation creation, stored locally with extracted text available as AI stakeholder context.

### Definition of Done
- [ ] Wizard Step 1 shows drag-drop upload area with file type/size validation
- [ ] `POST /simulations/with-documents` accepts config JSON + file uploads, returns sim with doc metadata
- [ ] `GET /simulations/{id}` returns `documents: [{id, filename, size, content_type, created_at}]`
- [ ] Full curl-based QA scenarios pass (happy path, type rejection, size limit, backward compat)

### Must Have
- Backward compat — existing `POST /simulations` JSON-only callers unchanged
- File type validation (reject non-PDF/DOCX/TXT) + size limit (25MB)
- UUID-based storage names
- Text extraction from PDF/DOCX/TXT with 4000-token cap
- Document metadata in sim response
- Frontend upload UI in wizard Step 1
- Both SQLite + Postgres DB backends

### Must NOT Have
- Cloud storage (S3/MinIO) — local disk only
- Image file support (PNG/JPG/SVG)
- Document viewer/preview in wizard
- Document search, tagging, categories, versioning
- Async extraction workers
- Auth/authz
- RAG/ChromaDB embedding
- Changing existing `POST /simulations` endpoint contract

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (`backend/tests/`)
- **Automated tests**: Tests-after — integration tests for multipart parse + validation + DB write
- **Extraction**: pypdf for PDF, python-docx for DOCX, plaintext for TXT
- **Framework**: pytest (backend), Playwright (frontend if UI verification needed)

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}`.

- **API**: Bash (curl) — send requests, assert status + response fields
- **Frontend**: Playwright — navigate, interact, assert DOM, screenshot
- **File ops**: Bash — create files, verify disk storage, cleanup

---

## Execution Strategy

### Parallel Waves

```
Wave 1 (Foundation):
├── 1. Backend deps + config + upload dir setup
├── 2. Document Pydantic model + DB schema (both backends)
├── 3. DB CRUD methods for document_uploads
└── 4. File validation + storage utilities

Wave 2 (Backend endpoints):
├── 5. POST /simulations/with-documents multipart endpoint
├── 6. Text extraction module (PDF/DOCX/TXT)
├── 7. GET /simulations/{id} document metadata
├── 8. StaticFiles mount + cleanup utilities
└── 9. Integration tests

Wave 3 (Frontend):
├── 10. DocumentUpload component (drag-drop + file picker)
├── 11. FormData API client variant
└── 12. Wizard Step 1 integration + submission flow

Wave FINAL (Verification):
├── F1. Plan compliance audit (oracle)
├── F2. Code quality review (unspecified-high)
├── F3. Real manual QA (unspecified-high)
└── F4. Scope fidelity check (deep)
```

### Dependency Matrix
- **1-3**: None (Wave 1 parallel)
- **4**: 2, 3 — 5, 6, 8
- **5**: 3, 4 — 7, 12
- **6**: 4 — 7, 9
- **7**: 5, 6 — 9
- **9**: 5, 6, 7 — (none)
- **10**: None — 11, 12
- **11**: 10 — 12
- **12**: 5, 10, 11 — F1-F4

### Agent Dispatch
- **Wave 1**: Tasks 1-4 → `quick`/`deep`
- **Wave 2**: Tasks 5-9 → `unspecified-high`/`deep`
- **Wave 3**: Tasks 10-12 → `visual-engineering`/`quick`
- **FINAL**: F1-F4 → `oracle`/`unspecified-high`/`deep`

---

## TODOs

- [ ] 1. **Backend deps + config + upload dir setup**

  **What to do**:
  - Add to `backend/requirements.txt`: `pypdf`, `python-docx`, `aiofiles`, `python-multipart` (if not already)
  - Add upload config to `backend/app/config.py`:
    - `UPLOAD_DIR: str = "./data/uploads"`
    - `MAX_UPLOAD_SIZE_MB: int = 25`
    - `ALLOWED_CONTENT_TYPES: list[str] = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]`
  - Create upload dir: `mkdir -p data/uploads`
  - Add `UPLOAD_DIR` to `.env` and `.env.example` as optional override

  **Must NOT do**:
  - Don't add S3/cloud storage config
  - Don't install image-processing libs
  - Don't add auth config

  **Recommended Agent Profile**: `quick`
  - Skills: none needed — straightforward config + dep management

  **Parallelization**: YES — Wave 1 (can start immediately)
  - Blocks: 2, 3, 4
  - Blocked By: None

  **References**:
  - `backend/app/config.py` — existing config pattern (API keys, DB type)
  - `backend/requirements.txt` — existing dep list

  **Acceptance Criteria**:
  - [ ] `pip install -r backend/requirements.txt` succeeds with new deps
  - [ ] `config.UPLOAD_DIR` resolves to `./data/uploads`
  - [ ] `data/uploads/` directory exists
  - [ ] Install deps: `pip install pypdf python-docx aiofiles python-multipart`

  **QA Scenarios**:
  ```
  Scenario: Config values are loadable
    Tool: Bash
    Steps:
      1. cd backend && python3 -c "from app.config import UPLOAD_DIR, MAX_UPLOAD_SIZE_MB, ALLOWED_CONTENT_TYPES; print(UPLOAD_DIR, MAX_UPLOAD_SIZE_MB, ALLOWED_CONTENT_TYPES)"
    Expected Result: Prints values without error
    Evidence: .omo/evidence/task-1-config-load.txt
  ```

  **Commit**: YES
  - Message: `chore: add upload deps + config (pypdf, python-docx, aiofiles)`
  - Files: `backend/requirements.txt`, `backend/app/config.py`, `.env.example`

- [ ] 2. **Document Pydantic model + DB schema (both backends)**

  **What to do**:
  - Add Pydantic models to `backend/app/models.py`:
    - `SimulationDocument`: `id: str`, `simulation_id: str`, `filename: str`, `filepath: str`, `size_bytes: int`, `content_type: str`, `extracted_text: str | None`, `status: str` (pending/ready/failed), `created_at: str`
  - Add `document_uploads` table to `backend/app/database/sqlite.py`:
    ```sql
    CREATE TABLE IF NOT EXISTS document_uploads (
      id TEXT PRIMARY KEY,
      simulation_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      extracted_text TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    )
    ```
  - Add same table to `backend/app/database/postgres.py` (in `_SCHEMA_SQL`)

  **Must NOT do**:
  - Don't store file content in DB — metadata only
  - Don't add FK constraints (simulations may not exist at file upload time, or use CASCADE)

  **Recommended Agent Profile**: `deep` — needs careful alignment between both backends
  - Skills: none needed

  **Parallelization**: YES — Wave 1
  - Blocks: 3, 4
  - Blocked By: 1 (needs config)

  **References**:
  - `backend/app/models.py:SimulationV2Config` — existing Pydantic model pattern (line 294)
  - `backend/app/database/sqlite.py:_create_tables()` — SQLite table creation pattern
  - `backend/app/database/postgres.py:_SCHEMA_SQL` — Postgres DDL pattern

  **Acceptance Criteria**:
  - [ ] `SimulationDocument` model validates correctly: `doc = SimulationDocument(id="x", simulation_id="y", filename="r.pdf", filepath="/p/r.pdf", size_bytes=1000, content_type="application/pdf", created_at="2024-01-01")`
  - [ ] SQLite `document_uploads` table created (check with `.schema document_uploads`)
  - [ ] Postgres DDL includes `document_uploads` table

  **QA Scenarios**:
  ```
  Scenario: Model instance creates without error
    Tool: Bash
    Steps:
      1. cd backend && python3 -c "
      from app.models import SimulationDocument
      doc = SimulationDocument(id='test-id', simulation_id='sim-1', filename='doc.pdf', filepath='/tmp/doc.pdf', size_bytes=1000, content_type='application/pdf', created_at='2025-01-01T00:00:00')
      print(doc.model_dump_json())
    "
    Expected Result: Valid JSON output of model fields
    Evidence: .omo/evidence/task-2-model-valid.txt
  ```

  **Commit**: YES (with task 3)

- [ ] 3. **DB CRUD methods for document_uploads**

  **What to do**:
  - Add abstract methods to `backend/app/database/base.py`:
    - `async def create_document(self, doc: SimulationDocument) -> None`
    - `async def get_documents_by_simulation(self, simulation_id: str) -> list[SimulationDocument]`
    - `async def get_document(self, document_id: str) -> SimulationDocument | None`
    - `async def update_document_status(self, document_id: str, status: str, extracted_text: str | None = None) -> None`
    - `async def delete_documents_by_simulation(self, simulation_id: str) -> None`
  - Implement in `backend/app/database/sqlite.py` (using aiosqlite)
  - Implement in `backend/app/database/postgres.py` (using asyncpg)

  **Must NOT do**:
  - Don't add delete-by-document-id single endpoint (out of scope)
  - Don't add search/list endpoints

  **Recommended Agent Profile**: `deep` — two backends, async patterns
  - Skills: none needed

  **Parallelization**: YES — Wave 1
  - Blocks: 5, 7
  - Blocked By: 2 (needs model + table)

  **References**:
  - `backend/app/database/base.py:DatabaseBackend` — ABC method pattern
  - `backend/app/database/sqlite.py:create_new_simulation()` — existing async CRUD pattern using `await db.execute(...)`
  - `backend/app/database/postgres.py:create_new_simulation()` — Postgres CRUD pattern

  **Acceptance Criteria**:
  - [ ] All 5 abstract methods defined in `DatabaseBackend`
  - [ ] SQLite impl compiles and runs without error
  - [ ] Postgres impl compiles without error

  **QA Scenarios**:
  ```
  Scenario: SQLite create + get_by_simulation works
    Tool: Bash
    Steps:
      1. cd backend && python3 -c "
      import asyncio; from app.database.sqlite import SQLiteBackend
      db = SQLiteBackend(':memory:'); asyncio.run(db.initialize())
      doc = SimulationDocument(id='d1', simulation_id='s1', filename='t.pdf', filepath='/tmp/t.pdf', size_bytes=100, content_type='application/pdf', created_at='...')
      asyncio.run(db.create_document(doc))
      docs = asyncio.run(db.get_documents_by_simulation('s1'))
      assert len(docs) == 1; print('PASS')
    "
    Expected Result: PASS
    Evidence: .omo/evidence/task-3-crud.txt
  ```

  **Commit**: YES (with task 2)
  - Message: `feat: add document model + DB schema + CRUD (SQLite + Postgres)`
  - Files: `models.py`, `database/base.py`, `database/sqlite.py`, `database/postgres.py`

- [ ] 4. **File validation + storage utilities**

  **What to do**:
  - Create `backend/app/upload/utils.py` with:
    - `validate_file_type(filename: str, content_type: str, magic_bytes: bytes) -> bool` — check against ALLOWED_CONTENT_TYPES, verify magic bytes for PDF (%PDF), DOCX (PK\x03\x04), TXT (text/plain-ish)
    - `validate_file_size(size_bytes: int) -> bool` — check MAX_UPLOAD_SIZE_MB
    - `generate_storage_path(upload_dir: str, simulation_id: str, original_filename: str) -> str` — `{upload_dir}/{sim_id}/{uuid4()}-{sanitized_filename}`
    - `sanitize_filename(filename: str) -> str` — strip path separators, control chars, limit 255 bytes
    - `async def write_upload_file(file: UploadFile, storage_path: str) -> int` — aiofiles write, return bytes written
    - `async def delete_file(storage_path: str) -> None` — aiofiles remove
    - `is_pdf(bytes)`, `is_docx(bytes)`, `is_text(bytes)` magic byte helpers

  **Must NOT do**:
  - Don't add image MIME detection
  - Don't add virus scanning
  - Don't add compression/decompression

  **Recommended Agent Profile**: `deep` — file I/O, async, validation edge cases
  - Skills: none needed

  **Parallelization**: YES — Wave 1
  - Blocks: 5, 6, 8
  - Blocked By: 2 (needs model), 1 (needs config)

  **References**:
  - `backend/app/config.py` — `MAX_UPLOAD_SIZE_MB`, `ALLOWED_CONTENT_TYPES`, `UPLOAD_DIR`
  - Python stdlib `magic` / `filetype` lib or manual magic bytes
  - `FastAPI UploadFile` docs: https://fastapi.tiangolo.com/tutorial/request-files/

  **Acceptance Criteria**:
  - [ ] `validate_file_type("test.pdf", "application/pdf", b"%PDF-1.4...")` → True
  - [ ] `validate_file_type("test.exe", "application/x-msdownload", b"MZ...")` → False
  - [ ] `validate_file_size(26 * 1024 * 1024)` → False
  - [ ] `generate_storage_path("./uploads", "sim-1", "report.pdf")` → `./uploads/sim-1/{uuid}-report.pdf`
  - [ ] `sanitize_filename("../../etc/passwd")` → `etc-passwd`

  **QA Scenarios**:
  ```
  Scenario: File type validation rejects .exe
    Tool: Bash
    Steps:
      1. cd backend && python3 -c "
      from app.upload.utils import validate_file_type, validate_file_size
      assert validate_file_type('test.exe', 'application/x-msdownload', b'MZ') == False
      assert validate_file_type('test.pdf', 'application/pdf', b'%PDF-1.4') == True
      print('PASS')
    "
    Expected Result: PASS
    Evidence: .omo/evidence/task-4-type-validation.txt

  Scenario: Size limit rejects oversized
    Tool: Bash
    Steps:
      1. cd backend && python3 -c "
      from app.config import MAX_UPLOAD_SIZE_MB
      from app.upload.utils import validate_file_size
      oversized = 26 * 1024 * 1024
      ok = 10 * 1024 * 1024
      assert validate_file_size(oversized) == False
      assert validate_file_size(ok) == True
      print('PASS')
    "
    Expected Result: PASS
    Evidence: .omo/evidence/task-4-size-validation.txt

  Scenario: Write + delete file round trip
    Tool: Bash
    Steps:
      1. mkdir -p /tmp/test-upload
      2. cd backend && python3 -c "
      import asyncio; from app.upload.utils import write_upload_file, delete_file
      from io import BytesIO; from fastapi import UploadFile
      f = UploadFile(filename='test.txt', file=BytesIO(b'hello'))
      path = '/tmp/test-upload/test.txt'
      size = asyncio.run(write_upload_file(f, path))
      assert size == 5
      assert __import__('os').path.exists(path)
      asyncio.run(delete_file(path))
      assert not __import__('os').path.exists(path)
      print('PASS')
    "
    Expected Result: PASS
    Evidence: .omo/evidence/task-4-io-roundtrip.txt
  ```

  **Commit**: YES
  - Message: `feat: add file validation + storage utilities`
  - Files: `backend/app/upload/__init__.py`, `backend/app/upload/utils.py`

- [ ] 5. **POST /simulations/with-documents multipart endpoint**

  **What to do**:
  - Add new route to `backend/app/main.py`:
    ```python
    @app.post("/simulations/with-documents")
    async def create_simulation_with_documents(
        config: str = Form(...),
        files: list[UploadFile] = File(default=[])
    ) -> dict:
    ```
  - Implementation steps:
    1. Parse `config` JSON string into `SimulationV2Config` (catch JSONDecodeError → 422)
    2. Generate `simulation_id = str(uuid4())`
    3. Validate each file: type (magic bytes + extension) + size. Return 422 with per-file errors on failure
    4. Limit to 5 files max. Return 422 if exceeded
    5. Create sim record in in-memory dict + DB (reuse `create_new_simulation`)
    6. For each valid file: generate storage path via `generate_storage_path()`, write to disk via `write_upload_file()`, create `SimulationDocument` DB record
    7. Extract text (call task 6), update doc status to `ready` or `failed`
    8. Build `documents: [...]` response list
    9. Store extracted text (≤4000 tokens) in sim metadata for prompt injection
    10. Return `{simulation_id, config, status, documents}`
  - Handle cleanup: if any step fails after partial writes, rollback (delete sim + remove files)
  - Reuse existing in-memory dict `_v2_simulations` (add `documents` key to stored config)

  **Must NOT do**:
  - Don't modify `POST /simulations` — keep JSON-only for backward compat
  - Don't add auth checks
  - Don't add S3 upload path
  - Don't block event loop — use `run_in_executor` for extraction

  **Recommended Agent Profile**: `unspecified-high` — FastAPI multipart, error handling, rollback
  - Skills: none needed

  **Parallelization**: NO — Wave 2 core
  - Blocks: 7, 12
  - Blocked By: 3 (needs CRUD), 4 (needs validation utils)

  **References**:
  - `backend/app/main.py:create_simulation_v2()` — existing endpoint pattern (line 414)
  - FastAPI `UploadFile` + `Form` docs: https://fastapi.tiangolo.com/tutorial/request-files-and-form-fields/
  - `backend/app/upload/utils.py` — validation + storage helpers (task 4)
  - `backend/app/models.py:SimulationV2Config` — config parsing

  **Acceptance Criteria**:
  - [ ] POST with valid config + PDF file → 200 + `{simulation_id, documents: [{filename, size, id}]}`
  - [ ] POST with valid config + 3 files → all 3 in documents array
  - [ ] POST with valid config + no files → 200 with empty documents array
  - [ ] POST with .exe file → 422 with per-file error
  - [ ] POST with 26MB file → 413
  - [ ] POST with 6 files → 422 (max 5)
  - [ ] POST with invalid JSON config → 422
  - [ ] Existing `POST /simulations` JSON-only endpoint still returns 200

  **QA Scenarios**:
  ```
  Scenario: Happy path — upload PDF with config
    Tool: Bash
    Steps:
      1. echo '%PDF-1.4 test content' > /tmp/test-valid.pdf
      2. SIM_ID=$(curl -s -X POST http://localhost:8000/simulations/with-documents \
        -F 'config={"subject":{"name":"Test"},"stakeholders":[],"action_space":{},"speaker_rules":{"mode":"alternating"},"end_condition":{"type":"timeout","turns":5},"voltage":50,"player_mode":false,"env_flags":{},"system_prompt_template":"","model_temperature":"stable"}' \
        -F 'files=@/tmp/test-valid.pdf' | python3 -c "import sys,json; print(json.load(sys.stdin)['simulation_id'])")
      3. echo $SIM_ID | grep -E '^[0-9a-f-]{36}$'
    Expected Result: Valid UUID returned
    Evidence: .omo/evidence/task-5-happy-path.txt

  Scenario: Reject invalid file type
    Tool: Bash
    Steps:
      1. HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/simulations/with-documents \
        -F 'config={}' -F 'files=@/bin/ls')
      2. echo $HTTP_CODE
    Expected Result: 422
    Evidence: .omo/evidence/task-5-reject-type.txt

  Scenario: Backward compat — JSON-only endpoint unchanged
    Tool: Bash
    Steps:
      1. HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/simulations \
        -H 'Content-Type: application/json' \
        -d '{}')
      2. echo $HTTP_CODE
    Expected Result: 200 (not 405 or 422 from route conflict)
    Evidence: .omo/evidence/task-5-backward-compat.txt
  ```

  **Commit**: YES
  - Message: `feat: add POST /simulations/with-documents multipart endpoint`
  - Files: `backend/app/main.py`

- [ ] 6. **Text extraction module (PDF/DOCX/TXT)**

  **What to do**:
  - Create `backend/app/upload/extraction.py`:
    - `extract_text_from_pdf(filepath: str) -> str` — use `pypdf.PdfReader`, iterate pages, extract text. Handle password-protected → return ""
    - `extract_text_from_docx(filepath: str) -> str` — use `docx.Document`, extract paragraphs. Handle corrupted → return ""
    - `extract_text_from_txt(filepath: str) -> str` — open with UTF-8, fallback to latin-1 on UnicodeDecodeError
    - `async extract_text(filepath: str, content_type: str) -> str` — dispatcher with `run_in_executor` for blocking I/O
    - `truncate_to_token_limit(text: str, max_tokens: int = 4000) -> str` — simple word-count-based truncation (1 token ≈ 0.75 words). Truncate at word boundary, append `...[truncated]`
    - Handle errors gracefully: log warning, return "", don't crash the upload

  **Must NOT do**:
  - Don't use heavy PDF libs (pymupdf/fitz) — pypdf is lighter
  - Don't add OCR (tesseract, etc.)
  - Don't add image extraction from PDF
  - Don't add chunking for RAG (out of scope)

  **Recommended Agent Profile**: `deep` — PDF parsing edge cases, encoding issues
  - Skills: none needed

  **Parallelization**: YES — Wave 2 (parallel with task 5)
  - Blocks: 7
  - Blocked By: 4 (needs file validation + storage path)

  **References**:
  - `pypdf` docs: https://pypdf.readthedocs.io/
  - `python-docx` docs: https://python-docx.readthedocs.io/
  - `backend/app/upload/utils.py` — storage paths from task 4

  **Acceptance Criteria**:
  - [ ] `extract_text_from_pdf("test.pdf")` where test.pdf contains "Hello World" → "Hello World"
  - [ ] `extract_text_from_docx("test.docx")` → extracted paragraph text
  - [ ] `extract_text_from_txt("test.txt")` → file contents
  - [ ] `truncate_to_token_limit("A B C D", max_tokens=2)` → "A B...[truncated]"
  - [ ] Password-protected PDF → "" (no crash)
  - [ ] Corrupted PDF → "" (no crash)

  **QA Scenarios**:
  ```
  Scenario: Extract from PDF
    Tool: Bash
    Steps:
      1. cd backend && python3 -c "
      from app.upload.extraction import extract_text_from_pdf
      import tempfile, os
      pdf_bytes = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n5 0 obj<</Length 44>>stream\nBT /F1 12 Tf 100 700 Td (Hello World) Tj ET\nendstream\nendobj\nxref\n0 6\n...trailer\n'
      f = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
      f.write(pdf_bytes); f.close()
      text = extract_text_from_pdf(f.name)
      os.unlink(f.name)
      print(repr(text))
    "
    Expected Result: Contains "Hello World"
    Evidence: .omo/evidence/task-6-extract-pdf.txt

  Scenario: Truncation respects token limit
    Tool: Bash
    Steps:
      1. cd backend && python3 -c "
      from app.upload.extraction import truncate_to_token_limit
      text = 'word ' * 100
      result = truncate_to_token_limit(text, max_tokens=10)
      word_count = len(result.split())
      assert word_count <= 13
      print(f'Result word count: {word_count}')
    "
    Expected Result: word_count ≤ 13 and ends with "[truncated]"
    Evidence: .omo/evidence/task-6-truncation.txt
  ```

  **Commit**: YES
  - Message: `feat: add text extraction module (PDF/DOCX/TXT)`
  - Files: `backend/app/upload/extraction.py`

- [ ] 7. **GET /simulations/{id} document metadata + prompt injection**

  **What to do**:
  - Modify `GET /simulations/{id}` in `main.py` to include `documents` field:
    - Fetch documents from DB via `get_documents_by_simulation(simulation_id)`
    - Return: `{id, filename, size_bytes, content_type, status, created_at}` per doc
  - Add prompt injection logic:
    - Append doc text to system prompt template: `\n\n## Reference Documents\n\n{doc_filename}:\n{truncated_text}`
    - Only inject documents with `status == "ready"` and non-empty extracted_text
    - Track in sim metadata under `_document_context` key
  - Ensure SSE streaming includes document context in initial system prompt
  - **Must NOT expose** `extracted_text` or `filepath` in API response

  **Recommended Agent Profile**: `unspecified-high` — API response, prompt engineering
  - Skills: none needed

  **Parallelization**: YES — Wave 2
  - Blocks: 9
  - Blocked By: 5, 6

  **References**:
  - `backend/app/main.py:get_simulation_v2()` — existing GET endpoint (line 511)

  **Acceptance Criteria**:
  - [ ] GET returns `documents: [{id, filename, size_bytes, content_type, status, created_at}]`
  - [ ] `extracted_text` not present in API response
  - [ ] Doc text appears in system prompt when doc has `status: ready`
  - [ ] Total injected text ≤ 4000 tokens

  **QA Scenarios**:
  ```
  Scenario: Document metadata in GET response
    Tool: Bash
    Steps:
      1. create sim with doc via POST /simulations/with-documents
      2. curl -s GET /simulations/$SIM_ID | python3 -c "
      import sys,json; d = json.load(sys.stdin)
      assert 'documents' in d
      assert 'extracted_text' not in d['documents'][0]
    "
    Expected Result: PASS
    Evidence: .omo/evidence/task-7-get-metadata.txt
  ```

  **Commit**: YES
  - Message: `feat: add document metadata to GET /simulations/{id} + prompt injection`
  - Files: `backend/app/main.py`

- [ ] 8. **StaticFiles mount + cleanup utilities**

  **What to do**:
  - Add `StaticFiles` mount: `app.mount("/uploads", StaticFiles(directory=config.UPLOAD_DIR), name="uploads")`
  - Create `backend/app/upload/cleanup.py`:
    - `async def cleanup_orphaned_pending_files(db, upload_dir, max_age_hours=24)` — delete pending docs older than threshold
    - `async def cleanup_simulation_files(db, upload_dir, simulation_id)` — delete all files + DB records for a sim

  **Recommended Agent Profile**: `quick`
  - Skills: none needed

  **Parallelization**: YES — Wave 2
  - Blocked By: 1, 4

  **References**:
  - FastAPI `StaticFiles` docs
  - `backend/app/config.py:UPLOAD_DIR`

  **Acceptance Criteria**:
  - [ ] `GET /uploads/{sim_id}/{filename}` returns stored file
  - [ ] `cleanup_orphaned_pending_files()` deletes pending docs older than threshold

  **QA Scenarios**:
  ```
  Scenario: Static file serving
    Tool: Bash
    Steps:
      1. Create sim with doc
      2. curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/uploads/$SIM_ID/$DOC_FILENAME
    Expected Result: 200
    Evidence: .omo/evidence/task-8-static-serve.txt
  ```

  **Commit**: YES
  - Message: `feat: add static file serving + cleanup utilities`
  - Files: `backend/app/main.py`, `backend/app/upload/cleanup.py`

- [ ] 9. **Integration tests**

  **What to do**:
  - Create `backend/tests/test_document_upload.py` with scenarios:
    - `test_json_endpoint_unchanged` — POST /simulations JSON → 200
    - `test_multipart_with_pdf` — 200 + documents array
    - `test_multipart_no_files` — 200 + empty documents
    - `test_multipart_reject_exe` — 422
    - `test_multipart_reject_oversized` — 413
    - `test_multipart_exceed_max_count` — 6 files → 422
    - `test_multipart_invalid_json` — malformed config → 422
    - `test_extraction_pdf` — verify extracted text in DB
    - `test_document_metadata_in_get` — verify GET returns document list
    - `test_prompt_injection` — verify doc text in system prompt
  - Use `httpx.AsyncClient` with FastAPI `TestClient`
  - Use `pytest-asyncio`
  - Clean up test files after each test

  **Recommended Agent Profile**: `deep` — async test patterns, file fixtures
  - Skills: none needed

  **Parallelization**: YES — Wave 2
  - Blocked By: 5, 6, 7

  **References**:
  - `backend/tests/` — existing test directory
  - FastAPI `TestClient` with `httpx.AsyncClient`

  **Acceptance Criteria**:
  - [ ] All tests pass: `pytest backend/tests/test_document_upload.py -v`
  - [ ] Tests clean up after themselves

  **QA Scenarios**:
  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. cd backend && python3 -m pytest tests/test_document_upload.py -v 2>&1
    Expected Result: All tests pass
    Evidence: .omo/evidence/task-9-test-results.txt
  ```

  **Commit**: YES
  - Message: `test: add document upload integration tests (10 scenarios)`
  - Files: `backend/tests/test_document_upload.py`

- [ ] 10. **DocumentUpload component (drag-drop + file picker)**

  **What to do**:
  - Create `frontend/components/DocumentUpload.tsx`:
    - Drag-drop zone with dashed border, upload_file icon, "Drag & drop or click to upload" text
    - Hidden `<input type="file" multiple accept=".pdf,.docx,.txt">`
    - Client-side validation: file type (check extension), file size (< 25MB each), max 5 files
    - File list display: filename, size (formatted), status indicator (pending/uploading/ready/error)
    - Remove button per file
    - Error messages per-file (type rejection, size exceeded, max count)
    - Styling: follow wizard pattern — `rounded-xl border border-hairline bg-surface-card/50`, Material Symbols icons
    - Props: `files: File[]`, `onFilesChange: (files: File[]) => void`, `maxFiles?: number`, `maxSizeMB?: number`

  **Must NOT do**:
  - Don't preview document content
  - Don't add file reordering
  - Don't show upload progress bar (indeterminate indicator only — native fetch can't do upload progress)

  **Recommended Agent Profile**: `visual-engineering` — frontend component, drag-drop UX
  - Skills: none needed

  **Parallelization**: YES — Wave 3
  - Blocks: 11, 12
  - Blocked By: None (standalone component)

  **References**:
  - `frontend/components/Button.tsx` — existing shared component pattern
  - `frontend/app/globals.css` — CSS variable theme tokens
  - Material Symbols: `upload_file`, `description`, `close`, `check_circle`, `error`, `hourglass_empty`

  **Acceptance Criteria**:
  - [ ] Drag-drop zone renders with correct styling
  - [ ] Clicking zone opens file picker filtered to .pdf,.docx,.txt
  - [ ] Dropping .exe shows inline error "File type not allowed"
  - [ ] Dropping 26MB file shows inline error "File too large (max 25 MB)"
  - [ ] Dropping 6th file shows error "Max 5 files"
  - [ ] File appears in list with filename and formatted size
  - [ ] Remove button removes file from list
  - [ ] Component follows existing wizard styling (border, bg, rounded-xl)

  **QA Scenarios**:
  ```
  Scenario: Component renders with upload zone
    Tool: Playwright
    Steps:
      1. Navigate to /simulate/new
      2. Verify upload zone visible with text "Drag & drop or click to upload"
      3. Verify dashed border styling
    Expected Result: Upload zone renders correctly
    Evidence: .omo/evidence/task-10-render.png
  ```

  **Commit**: YES
  - Message: `feat: add DocumentUpload component with drag-drop + validation`
  - Files: `frontend/components/DocumentUpload.tsx`

- [ ] 11. **FormData API client variant**

  **What to do**:
  - Add to `frontend/lib/api.ts`:
    ```typescript
    export const createSimulationWithDocuments = async (
      config: SimulationV2Config,
      files: File[]
    ): Promise<{ simulation_id: string; config: SimulationV2Config; status: string; documents: DocumentMeta[] }> => {
      const formData = new FormData();
      formData.append("config", JSON.stringify(config));
      files.forEach((f) => formData.append("files", f));

      const response = await fetch(`${API_URL}/simulations/with-documents`, {
        method: "POST",
        body: formData,
        headers: { "X-Request-ID": requestId },
      });
      // DO NOT set Content-Type — browser sets multipart boundary
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    };
    ```
  - Add `DocumentMeta` type to `frontend/lib/types.ts`:
    ```typescript
    export type DocumentMeta = {
      id: string;
      filename: string;
      size_bytes: number;
      content_type: string;
      status: "pending" | "ready" | "failed";
      created_at: string;
    };
    ```

  **Must NOT do**:
  - Don't modify existing `createSimulationV2()` — backward compat

  **Recommended Agent Profile**: `quick` — type + API client
  - Skills: none needed

  **Parallelization**: YES — Wave 3
  - Blocks: 12
  - Blocked By: 10 (needs component to exist for the type contract)

  **References**:
  - `frontend/lib/api.ts:createSimulationV2()` — existing pattern (line 197)
  - `frontend/lib/types.ts` — existing type definitions

  **Acceptance Criteria**:
  - [ ] `createSimulationWithDocuments` sends multipart/form-data
  - [ ] `DocumentMeta` type has all required fields
  - [ ] Existing `createSimulationV2` unchanged

  **QA Scenarios**:
  ```
  Scenario: Type compiles
    Tool: Bash
    Steps:
      1. cd frontend && npx tsc --noEmit --strict lib/types.ts 2>&1 | head -20
    Expected Result: No type errors
    Evidence: .omo/evidence/task-11-types.txt
  ```

  **Commit**: YES (with task 12 or standalone)
  - Message: `feat: add FormData API client + DocumentMeta type`
  - Files: `frontend/lib/api.ts`, `frontend/lib/types.ts`

- [ ] 12. **Wizard Step 1 integration + submission flow**

  **What to do**:
  - Modify `frontend/app/simulate/new/page.tsx`:
    - Import `DocumentUpload` component
    - Add `const [uploadFiles, setUploadFiles] = useState<File[]>([])` state
    - In Step 1 (Subject & Context), add `<DocumentUpload>` below existing evidence_items section
    - Modify `buildConfig()` — it stays the same (config is JSON, separate from files)
    - Modify `finish()`:
      - If `uploadFiles.length > 0`: call `createSimulationWithDocuments(config, uploadFiles)`
      - Else: call existing `createSimulationV2(config)` unchanged
    - Handle loading state during upload (disable Launch button, show spinner)
    - Handle error state (show error inline, keep button enabled)
    - On success: redirect to `/simulate/${simulation_id}` (same as now)

  **Must NOT do**:
  - Don't change validation logic for existing fields
  - Don't remove or alter existing Step 1 fields (name, description, evidence, stakes, attributes)
  - Don't make file upload required (optional)

  **Recommended Agent Profile**: `visual-engineering` — wizard modification, state integration
  - Skills: none needed

  **Parallelization**: NO — Wave 3 (integration task)
  - Blocks: F1-F4
  - Blocked By: 5 (needs endpoint), 10 (needs component), 11 (needs API client)

  **References**:
  - `frontend/app/simulate/new/page.tsx` — existing wizard, 817 lines
  - `frontend/lib/api.ts:createSimulationV2()` — existing submission (line 197)

  **Acceptance Criteria**:
  - [ ] Upload area visible in Step 1 below evidence_items
  - [ ] Files can be added/removed before submission
  - [ ] Clicking Launch with files → calls `createSimulationWithDocuments`
  - [ ] Clicking Launch without files → calls `createSimulationV2` (backward compat)
  - [ ] Loading state disables Launch button during upload
  - [ ] Error state shows inline error message
  - [ ] On success: redirects to `/simulate/${simulation_id}`
  - [ ] No regressions: existing wizard fields still work (name, description, etc.)

  **QA Scenarios**:
  ```
  Scenario: Wizard uploads file and creates simulation
    Tool: Playwright
    Steps:
      1. Navigate to /simulate/new
      2. Fill Step 1 fields (name, description)
      3. Upload test.pdf via DocumentUpload component
      4. Navigate through Steps 2-4
      5. Click "Launch" on Step 4
      6. Wait for redirect to /simulate/{id}
      7. Verify simulation page loads
    Expected Result: Simulation created with document
    Evidence: .omo/evidence/task-12-wizard-flow.mp4
  ```

  **Commit**: YES
  - Message: `feat: integrate document upload into simulation creation wizard`
  - Files: `frontend/app/simulate/new/page.tsx`, `frontend/components/DocumentUpload.tsx`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  - Read plan end-to-end. Verify each Must Have has implementation. Search codebase for Must NOT Have patterns — reject with file:line if found. Check evidence in `.omo/evidence/`. Compare deliverables against plan.
  - Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  - Run build + lint + tests. Check for: `async` without `await`, bare excepts, hardcoded paths, unused deps, AI slop (excessive comments, over-abstraction, generic names).
  - Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  - Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration (upload → extract → store → retrieve → inject). Save evidence to `.omo/evidence/final-qa/`.
  - Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  - For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec built, nothing beyond spec built. Check "Must NOT do" compliance. Detect cross-task contamination.
  - Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

Not pre-defining commit boundaries. Executor to commit per logical unit (per task or per task group) with descriptive messages following conventional commits format.

---

## Success Criteria

### Verification Commands
```bash
# Existing JSON-only endpoint still works
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/simulations \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 200

# Multipart with valid files
curl -s -X POST http://localhost:8000/simulations/with-documents \
  -F 'config={...}' \
  -F 'files=@test.pdf'
# Expected: 200 with simulation_id + documents array

# Reject invalid type
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/simulations/with-documents \
  -F 'config={}' -F 'files=@malware.exe'
# Expected: 422

# Reject oversized
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/simulations/with-documents \
  -F 'config={}' -F 'files=@oversized.pdf'
# Expected: 413

# Document metadata in GET response
curl -s http://localhost:8000/simulations/$SIM_ID | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'documents' in d"
# Expected: exit 0
```

### Final Checklist
- [ ] All Must Have items present
- [ ] All Must NOT Have items absent
- [ ] All QA scenarios pass
- [ ] Existing callers unchanged and working
