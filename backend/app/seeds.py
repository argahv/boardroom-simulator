"""
Idempotent seed loader.

Reads all JSON files from seeds/personas/ and seeds/templates/ and inserts
any records that don't already exist in the DB.  Safe to run on every startup.
"""
from __future__ import annotations

import json
from pathlib import Path

from .database import get_database
from .models import ScenarioTemplate, Stakeholder

_SEEDS_DIR = Path(__file__).parent.parent / "seeds"


async def run() -> None:
    db = get_database()

    personas_dir = _SEEDS_DIR / "personas"
    templates_dir = _SEEDS_DIR / "templates"

    # --- personas ---
    persona_files = sorted(personas_dir.glob("*.json")) if personas_dir.exists() else []
    inserted_personas = 0
    for fp in persona_files:
        records = json.loads(fp.read_text())
        for rec in records:
            if not await db.stakeholder_exists(rec["id"]):
                await db.create_stakeholder(Stakeholder(**rec))
                inserted_personas += 1

    # --- templates ---
    template_files = sorted(templates_dir.glob("*.json")) if templates_dir.exists() else []
    inserted_templates = 0
    for fp in template_files:
        records = json.loads(fp.read_text())
        for rec in records:
            if not await db.template_exists(rec["id"]):
                await db.create_template(ScenarioTemplate(**rec))
                inserted_templates += 1

    print(f"✓ Seeds: inserted {inserted_personas} persona(s), {inserted_templates} template(s)")
