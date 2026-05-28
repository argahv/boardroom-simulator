"""Basic simulation example for Boardroom Simulator API.

Usage:
    python examples/basic_simulation.py

Requires:
    - Backend running at http://localhost:8000
    - OPENROUTER_API_KEY in environment (for LLM-powered output; mock mode works without it)
    - requests library (pip install requests)

Workflow:
    1. Health check       GET  /health
    2. List templates     GET  /templates
    3. Create simulation  POST /simulations
    4. Stream results     GET  /simulations/{id}/stream
    5. Get postmortem     POST /simulations/{id}/postmortem
    6. Export data        GET  /simulations/{id}/export
"""

from __future__ import annotations

import json
import os
import sys
import time

import requests

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


def step(label: str) -> None:
    """Print a section header."""
    sep = "=" * 60
    print(f"\n{sep}")
    print(f"  {label}")
    print(f"{sep}")


def ok(label: str, detail: str = "") -> None:
    msg = f"  [OK] {label}"
    if detail:
        msg += f" — {detail}"
    print(msg)


def fail(label: str, detail: str = "") -> None:
    msg = f"  [FAIL] {label}"
    if detail:
        msg += f" — {detail}"
    print(msg)


def main() -> None:
    """Run the full simulation lifecycle against the Boardroom Simulator API."""

    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})

    simulation_id: str | None = None

    # ── 1. Health check ─────────────────────────────────────────────────
    step("1. Health check")
    try:
        r = session.get(f"{BASE_URL}/health", timeout=10)
        r.raise_for_status()
        data = r.json()
        ok("Backend is healthy", json.dumps(data))
    except requests.RequestException as e:
        fail("Backdid not respond", str(e))
        sys.exit(1)

    # ── 2. List templates ───────────────────────────────────────────────
    step("2. List available templates")
    try:
        r = session.get(f"{BASE_URL}/templates", timeout=10)
        r.raise_for_status()
        templates = r.json()
        ok(f"Found {len(templates)} templates")
        for t in templates[:3]:
            name = t.get("name", t.get("id", "?"))
            desc = t.get("description", "")[:80]
            print(f"       - {name}: {desc}")
        if len(templates) > 3:
            print(f"       ... and {len(templates) - 3} more")
    except requests.RequestException as e:
        fail("Could not list templates", str(e))

    # ── 3. Create simulation ────────────────────────────────────────────
    step("3. Create simulation")
    try:
        payload = {
            "subject": {
                "name": "Startup-Enterprise Partnership",
                "description": (
                    "A SaaS startup seeks a strategic partnership with a large "
                    "enterprise. Negotiate terms around revenue share, "
                    "integration scope, and exclusivity."
                ),
            },
            "stakeholders": [
                {
                    "id": "stakeholder-1",
                    "name": "Alice Chen",
                    "role": "Startup CEO",
                    "stance": "champion",
                    "backstory": (
                        "Founder of a 40-person SaaS company. Needs this deal "
                        "to close the Series B. Protective of equity and "
                        "product direction."
                    ),
                    "personality": {
                        "aggressiveness": 60,
                        "empathy": 40,
                        "stubbornness": 70,
                        "verbosity": 50,
                    },
                    "hidden_agenda": "",
                },
                {
                    "id": "stakeholder-2",
                    "name": "Bob Martinez",
                    "role": "Enterprise VP of Partnerships",
                    "stance": "detractor",
                    "backstory": (
                        "20-year veteran at a Fortune 500. Skeptical of small "
                        "vendors. Answers to a risk-averse procurement board."
                    ),
                    "personality": {
                        "aggressiveness": 40,
                        "empathy": 30,
                        "stubbornness": 60,
                        "verbosity": 60,
                    },
                    "hidden_agenda": "",
                },
            ],
            "action_space": {
                "actions": [],
                "default_trust_deltas": {},
                "default_leverage_deltas": {},
            },
            "speaker_rules": {"mode": "weighed_random"},
            "end_condition": {
                "type": "timeout",
                "max_normal_turns": 5,
            },
            "voltage": 60,
            "model_temperature": "volatile",
            "auto_research": False,
            "research_topics": [],
            "system_prompt_template": "",
            "player_mode": False,
            "env_flags": {
                "hidden_motives": True,
                "time_pressure": False,
                "external_leaks": False,
                "deadlock_risk": False,
            },
        }

        r = session.post(f"{BASE_URL}/simulations", json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
        simulation_id = data["simulation_id"]
        ok(
            "Simulation created",
            f"id={simulation_id} stakeholders={len(payload['stakeholders'])}",
        )
    except requests.RequestException as e:
        fail("Could not create simulation", str(e))
        sys.exit(1)

    # ── 4. Stream simulation ────────────────────────────────────────────
    step("4. Stream simulation (SSE)")
    if not simulation_id:
        fail("No simulation ID — skipping stream")
        sys.exit(1)

    try:
        r = session.get(
            f"{BASE_URL}/simulations/{simulation_id}/stream",
            stream=True,
            timeout=120,
        )
        r.raise_for_status()

        turn_count = 0
        start = time.time()
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            event = json.loads(line[6:])
            event_type = event.get("type", "?")
            if event_type == "turn":
                turn_count += 1
                speaker = event.get("speaker", event.get("agent_name", "?"))
                content = event.get("content", "")[:80]
                print(f"       Turn {turn_count}: {speaker} — {content}")
            elif event_type == "done":
                elapsed = time.time() - start
                reason = event.get("reason", "completed")
                total = event.get("total_turns", turn_count)
                ok(
                    "Simulation finished",
                    f"{total} turns, reason={reason}, elapsed={elapsed:.1f}s",
                )
                break
            elif event_type == "error":
                fail("Stream error", event.get("message", ""))
                break
            elif event_type == "cancelled":
                fail("Stream cancelled")
                break
    except requests.RequestException as e:
        fail("Stream failed", str(e))

    # ── 5. Postmortem ───────────────────────────────────────────────────
    step("5. Postmortem report")
    if not simulation_id:
        fail("No simulation ID — skipping postmortem")
        sys.exit(1)

    try:
        r = session.post(
            f"{BASE_URL}/simulations/{simulation_id}/postmortem",
            timeout=120,
        )
        r.raise_for_status()
        pm = r.json()

        verdict = pm.get("verdict", "N/A")
        summary = pm.get("summary", "")[:120]
        outcome = pm.get("termination", {}).get("outcome_type", "N/A")
        confidence = pm.get("confidence_score", "N/A")
        ok(
            "Postmortem generated",
            f"verdict={verdict} outcome={outcome} confidence={confidence}",
        )
        if summary:
            print(f"       Summary: {summary}")
    except requests.RequestException as e:
        fail("Postmortem failed", str(e))

    # ── 6. Export simulation ────────────────────────────────────────────
    step("6. Export simulation data")
    if not simulation_id:
        fail("No simulation ID — skipping export")
        sys.exit(1)

    try:
        r = session.get(
            f"{BASE_URL}/simulations/{simulation_id}/export",
            timeout=30,
        )
        r.raise_for_status()
        export = r.json()

        total_turns = export.get("summary", {}).get("total_turns", 0)
        snapshots = export.get("summary", {}).get("total_snapshots", 0)
        ok(
            "Simulation exported",
            f"turns={total_turns} snapshots={snapshots} size={len(r.content)} bytes",
        )
    except requests.RequestException as e:
        fail("Export failed", str(e))

    # ── Done ────────────────────────────────────────────────────────────
    step("Done")
    print(f"  Simulation {simulation_id} completed successfully.")
    print(f"  Export saved at /simulations/{simulation_id}/export")
    print(f"  Replay at /simulations/{simulation_id}/replay")


if __name__ == "__main__":
    main()
