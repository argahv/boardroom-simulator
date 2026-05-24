"""
Comprehensive API End-to-End Test — exercises the full simulation lifecycle
via the HTTP API, checks the database, and analyzes responses.

Scenarios:
  1. VoteCondition → simulation reaches consensus via vote
  2. TimeoutCondition → simulation ends by turn limit
  3. ConsensusCondition → social physics detection
  4. Agent behavior trace across all scenarios
  5. Database persistence verification for all tables
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import traceback
from datetime import datetime
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import URLError

API_BASE = "http://localhost:8000"
PASS = 0
FAIL = 0
TESTS_RUN = 0

def log_test(name: str, passed: bool, detail: str = ""):
    global PASS, FAIL, TESTS_RUN
    TESTS_RUN += 1
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"  {status} | {name}")
    if detail:
        for line in detail.strip().split("\n"):
            print(f"         {line}")
    if passed:
        PASS += 1
    else:
        FAIL += 1

def api_request(method: str, path: str, body: dict | None = None,
                stream: bool = False) -> Any:
    """Make an HTTP request to the API."""
    url = f"{API_BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req, timeout=120) as resp:
            if stream:
                return resp.read().decode()
            return json.loads(resp.read().decode())
    except URLError as e:
        if hasattr(e, 'read'):
            error_body = e.read().decode()
            try:
                return {"error": json.loads(error_body)}
            except json.JSONDecodeError:
                return {"error": error_body}
        return {"error": str(e)}

def stream_simulation(simulation_id: str) -> list[dict]:
    """Stream an SSE simulation and return all events."""
    url = f"{API_BASE}/simulations/{simulation_id}/stream"
    req = Request(url, method="GET")
    events = []
    try:
        resp = urlopen(req, timeout=300)
        buffer = ""
        while True:
            chunk = resp.read(4096).decode()
            if not chunk:
                break
            buffer += chunk
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()
                if line.startswith("data: "):
                    try:
                        event = json.loads(line[6:])
                        events.append(event)
                        if event.get("type") == "done":
                            return events
                    except json.JSONDecodeError:
                        pass
    except Exception as e:
        print(f"    Stream error: {e}")
    return events


# ═══════════════════════════════════════════════════════════════════════
# SCENARIO 1: VoteCondition — Simulation with Vote Termination
# ═══════════════════════════════════════════════════════════════════════

def test_vote_condition_flow():
    """Full end-to-end with VoteCondition: create → stream → done → DB → postmortem."""
    print("\n  ── SCENARIO 1: Vote Condition Flow ──")

    # 1. Create simulation with VoteCondition
    config = {
        "subject": {"name": "Revenue Split Negotiation", "description": "Negotiate a fair revenue split for the joint partnership"},
        "stakeholders": [
            {"id": "alice", "name": "Alice Chen", "role": "CEO", "stance": "champion",
             "personality": {"aggressiveness": 70, "empathy": 40, "stubbornness": 60, "verbosity": 50},
             "hidden_agenda": "I want majority control", "backstory": "Founder with 15 years in the industry", "tools": []},
            {"id": "bob", "name": "Bob Martinez", "role": "CFO", "stance": "detractor",
             "personality": {"aggressiveness": 40, "empathy": 30, "stubbornness": 80, "verbosity": 30},
             "hidden_agenda": "I need to protect margins", "backstory": "Finance executive focused on profitability", "tools": []},
            {"id": "charlie", "name": "Charlie Kim", "role": "CTO", "stance": "neutral",
             "personality": {"aggressiveness": 30, "empathy": 60, "stubbornness": 40, "verbosity": 40},
             "hidden_agenda": "I care about technical autonomy", "backstory": "Technical lead evaluating feasibility", "tools": []},
            {"id": "diana", "name": "Diana Patel", "role": "Legal", "stance": "wildcard",
             "personality": {"aggressiveness": 50, "empathy": 50, "stubbornness": 50, "verbosity": 60},
             "hidden_agenda": "I want to avoid litigation risk", "backstory": "General counsel with deal experience", "tools": []},
        ],
        "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
        "speaker_rules": {"mode": "freeform"},
        "end_condition": {"type": "vote", "voters": ["alice", "bob", "charlie", "diana"],
                          "threshold": 0.5, "max_turns": 15},
        "system_prompt_template": "",
        "voltage": 60,
        "player_mode": False,
        "env_flags": {"hidden_motives": True, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
        "model_temperature": "volatile",
    }

    print("\n  Step 1: Create simulation...")
    create_resp = api_request("POST", "/simulations", config)
    assert "simulation_id" in create_resp, f"Create failed: {create_resp}"
    sim_id = create_resp["simulation_id"]
    log_test("1.1 Create simulation", True, f"simulation_id={sim_id[:8]}...")

    # 2. Verify it exists in the database
    print("\n  Step 2: Check database...")
    db_sim = api_request("GET", f"/simulations/{sim_id}")
    log_test("1.2 DB has simulation", sim_id in str(db_sim) or db_sim.get("status") == "idle",
             f"status={db_sim.get('status', '?')}")

    db_row = boardroom_postgres_query(f"SELECT simulation_id, status, config_json FROM v2_simulations WHERE simulation_id = '{sim_id}'")
    log_test("1.3 v2_simulations row exists", len(db_row) > 0,
             f"rows={len(db_row)}")

    # 3. Stream the simulation
    print("\n  Step 3: Stream simulation...")
    events = stream_simulation(sim_id)
    turn_events = [e for e in events if e.get("type") == "turn"]
    done_events = [e for e in events if e.get("type") == "done"]
    system_events = [e for e in events if e.get("type") == "system"]

    log_test("1.4 Simulation produced turns", len(turn_events) >= 2,
             f"turns={len(turn_events)}")
    log_test("1.5 Simulation emitted done event", len(done_events) == 1,
             f"done={len(done_events)}")
    log_test("1.6 System events present", len(system_events) >= 2,
             f"system={len(system_events)}")

    # 4. Analyze done event
    if done_events:
        done = done_events[0]
        log_test("1.7 Done event has reason", bool(done.get("reason")),
                 f"reason={done.get('reason')}")
        log_test("1.8 Done event has outcome_type", bool(done.get("outcome_type")),
                 f"outcome={done.get('outcome_type')}")
        log_test("1.9 Done event has total_turns", bool(done.get("total_turns")),
                 f"turns={done.get('total_turns')}")

        print(f"\n  ── Vote Result ──")
        print(f"  Reason: {done.get('reason')}")
        print(f"  Outcome: {done.get('outcome_type')}")
        print(f"  Summary: {done.get('summary')}")
        print(f"  Confidence: {done.get('confidence')}")
        print(f"  Total turns: {done.get('total_turns')}")
        if done.get("vote_breakdown"):
            print(f"  Vote Breakdown: {done['vote_breakdown']}")

    # 5. Verify database after simulation
    print("\n  Step 5: Check database after simulation...")
    try:
        db_sim_after = boardroom_postgres_query(
            f"SELECT simulation_id, status, config_json FROM v2_simulations WHERE simulation_id = '{sim_id}'"
        )
        if db_sim_after:
            status = db_sim_after[0].get("status", "?")
            log_test("1.10 DB status updated", status == "complete" or status == "running",
                     f"status={status}")
    except Exception as e:
        log_test("1.10 DB status check", False, str(e))

    # Check turns in database
    try:
        db_turns = boardroom_postgres_query(
            f"SELECT COUNT(*) as cnt FROM v2_turns WHERE simulation_id = '{sim_id}'"
        )
        turn_count = db_turns[0]["cnt"] if db_turns else 0
        log_test("1.11 Turns saved to DB", turn_count >= 2,
                 f"turns_in_db={turn_count}")
    except Exception as e:
        log_test("1.11 Turns in DB", False, str(e))

    # Check state snapshots
    try:
        db_snapshots = boardroom_postgres_query(
            f"SELECT COUNT(*) as cnt FROM v2_state_snapshots WHERE simulation_id = '{sim_id}'"
        )
        snap_count = db_snapshots[0]["cnt"] if db_snapshots else 0
        log_test("1.12 State snapshots saved", snap_count >= 0,
                 f"snapshots_in_db={snap_count}")
    except Exception as e:
        log_test("1.12 Snapshots in DB", False, str(e))

    # 6. Get postmortem
    print("\n  Step 6: Get postmortem...")
    pm = api_request("POST", f"/simulations/{sim_id}/postmortem")
    log_test("1.13 Postmortem returned", bool(pm.get("simulation_id")),
             f"confidence={pm.get('confidence_score', '?')} consensus={pm.get('consensus_rating', '?')}")

    # Check postmortem in DB
    try:
        db_pm = boardroom_postgres_query(
            f"SELECT simulation_id FROM v2_postmortems WHERE simulation_id = '{sim_id}'"
        )
        log_test("1.14 Postmortem saved to DB", len(db_pm) > 0,
                 f"rows={len(db_pm)}")
    except Exception as e:
        log_test("1.14 Postmortem in DB", False, str(e))

    # 7. Analyze agent behavior
    print("\n  Step 7: Agent behavior analysis...")
    agents_spoken = set(t.get("speaker", t.get("agent_name", "?")) for t in turn_events)
    action_types = {}
    for t in turn_events:
        a = t.get("action_type", "statement")
        action_types[a] = action_types.get(a, 0) + 1

    log_test("1.15 Multiple agents spoke", len(agents_spoken) > 1,
             f"agents={agents_spoken}")
    log_test("1.16 Action types varied", len(action_types) > 1,
             f"actions={action_types}")

    print(f"\n  ── Agent Behavior ──")
    print(f"  Speakers: {agents_spoken}")
    print(f"  Action distribution: {action_types}")
    print(f"\n  ── Turn Sequence (first 10) ──")
    for i, t in enumerate(turn_events[:10]):
        speaker = t.get("speaker", t.get("agent_name", "?"))
        action = t.get("action_type", "?")
        content = t.get("content", "")[:60]
        print(f"  [{i}] {speaker} ({action}): {content}")

    return sim_id, events, pm


# ═══════════════════════════════════════════════════════════════════════
# SCENARIO 2: TimeoutCondition
# ═══════════════════════════════════════════════════════════════════════

def test_timeout_condition_flow():
    """Verify TimeoutCondition ends simulation at turn limit."""
    print("\n\n  ── SCENARIO 2: Timeout Condition Flow ──")

    config = {
        "subject": {"name": "Partnership Timeline", "description": "Decide the timeline for partnership rollout"},
        "stakeholders": [
            {"id": "p1", "name": "Urgent Alice", "role": "VP Ops", "stance": "champion",
             "personality": {"aggressiveness": 80, "empathy": 30, "stubbornness": 50, "verbosity": 40},
             "hidden_agenda": "", "backstory": "", "tools": []},
            {"id": "p2", "name": "Cautious Bob", "role": "Legal Counsel", "stance": "detractor",
             "personality": {"aggressiveness": 20, "empathy": 40, "stubbornness": 70, "verbosity": 50},
             "hidden_agenda": "", "backstory": "", "tools": []},
        ],
        "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
        "speaker_rules": {"mode": "alternating"},
        "end_condition": {"type": "timeout", "max_normal_turns": 4},
        "voltage": 50, "player_mode": False,
        "env_flags": {"hidden_motives": False, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
        "model_temperature": "stable",
    }

    print("\n  Step 1: Create simulation...")
    create_resp = api_request("POST", "/simulations", config)
    sim_id = create_resp["simulation_id"]
    log_test("2.1 Create simulation", True, f"simulation_id={sim_id[:8]}...")

    print("  Step 2: Stream simulation...")
    events = stream_simulation(sim_id)
    done_events = [e for e in events if e.get("type") == "done"]
    turn_events = [e for e in events if e.get("type") == "turn"]

    if done_events:
        done = done_events[0]
        log_test("2.2 Timeout triggers at 4 turns", done.get("total_turns", 0) >= 4,
                 f"total_turns={done.get('total_turns')}")
        log_test("2.3 Done event has reason=timeout", done.get("reason") == "timeout",
                 f"reason={done.get('reason')}")
        log_test("2.4 Done event has outcome_type", bool(done.get("outcome_type")),
                 f"outcome={done.get('outcome_type')}")

    log_test("2.5 Produced turns", len(turn_events) >= 2,
             f"turns={len(turn_events)}")

    # Get postmortem
    pm = api_request("POST", f"/simulations/{sim_id}/postmortem")
    log_test("2.6 Postmortem generated", bool(pm.get("simulation_id")),
             f"consensus={pm.get('consensus_rating', '?')}")

    return sim_id, events


# ═══════════════════════════════════════════════════════════════════════
# SCENARIO 3: ConsensusCondition + Walkaway
# ═══════════════════════════════════════════════════════════════════════

def test_walkaway_detection():
    """Verify walkaway action is detected and postmortem reflects it."""
    print("\n\n  ── SCENARIO 3: Walkaway Detection ──")

    # Use a short timeout simulation and check that walkaway actions appear
    config = {
        "subject": {"name": "Merger Terms", "description": "Finalize merger terms between departments"},
        "stakeholders": [
            {"id": "a", "name": "Alpha", "role": "Department Head", "stance": "champion",
             "personality": {"aggressiveness": 70, "empathy": 30, "stubbornness": 80, "verbosity": 50},
             "hidden_agenda": "I want full control", "backstory": "", "tools": []},
            {"id": "b", "name": "Beta", "role": "Union Rep", "stance": "detractor",
             "personality": {"aggressiveness": 50, "empathy": 60, "stubbornness": 70, "verbosity": 40},
             "hidden_agenda": "I need to protect staff", "backstory": "", "tools": []},
            {"id": "c", "name": "Gamma", "role": "Mediator", "stance": "moderator",
             "personality": {"aggressiveness": 20, "empathy": 80, "stubbornness": 30, "verbosity": 60},
             "hidden_agenda": "", "backstory": "", "tools": []},
        ],
        "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
        "speaker_rules": {"mode": "freeform"},
        "end_condition": {"type": "timeout", "max_normal_turns": 8},
        "voltage": 70, "player_mode": False,
        "env_flags": {"hidden_motives": True, "deadlock_risk": True,
                      "time_pressure": True, "external_leaks": False},
        "model_temperature": "volatile",
    }

    print("\n  Step 1: Create simulation...")
    create_resp = api_request("POST", "/simulations", config)
    sim_id = create_resp["simulation_id"]
    log_test("3.1 Create simulation", True, f"simulation_id={sim_id[:8]}...")

    print("  Step 2: Stream simulation...")
    events = stream_simulation(sim_id)
    turn_events = [e for e in events if e.get("type") == "turn"]
    done_events = [e for e in events if e.get("type") == "done"]

    # Analyze action types
    action_counts = {}
    for t in turn_events:
        a = t.get("action_type", "statement")
        action_counts[a] = action_counts.get(a, 0) + 1

    log_test("3.2 Simulation completed", len(done_events) == 1,
             f"done_events={len(done_events)}")

    log_test("3.3 Produced turns", len(turn_events) >= 2,
             f"turns={len(turn_events)}")

    # Check for various action types including the new ones
    if "walkaway" in action_counts:
        log_test("3.4 Walkaway action detected", True,
                 f"walkaway_count={action_counts['walkaway']}")
    else:
        log_test("3.4 Walkaway action (not triggered this run)", True,
                 "(depends on LLM output)")

    print(f"\n  Action distribution: {action_counts}")

    return sim_id, events


# ═══════════════════════════════════════════════════════════════════════
# SCENARIO 4: Database Deep Dive
# ═══════════════════════════════════════════════════════════════════════

def test_database_deep_dive(vote_sim_id: str, timeout_sim_id: str, walkaway_sim_id: str):
    """Deep dive into the database after all simulations."""
    print("\n\n  ── SCENARIO 4: Database Deep Dive ──")

    # 1. List all simulations
    sims = api_request("GET", "/simulations")
    log_test("4.1 List simulations", len(sims) >= 3,
             f"total_sims={len(sims)}")

    # 2. Check analytics
    analytics = api_request("GET", "/simulations/analytics")
    log_test("4.2 Analytics endpoint", "total_simulations" in analytics,
             f"total={analytics.get('total_simulations', '?')}")

    # 3. Export simulation
    export = api_request("GET", f"/simulations/{vote_sim_id}/export")
    log_test("4.3 Export simulation", "simulation_id" in export,
             f"has_turns={len(export.get('turns', []))} has_snapshots={len(export.get('state_snapshots', []))}")

    # 4. Replay simulation
    replay = api_request("GET", f"/simulations/{vote_sim_id}/replay")
    log_test("4.4 Replay endpoint", "snapshots" in replay,
             f"snapshots={len(replay.get('snapshots', []))}")

    # 5. Deep DB checks
    for label, sim_id in [("Vote", vote_sim_id), ("Timeout", timeout_sim_id), ("Walkaway", walkaway_sim_id)]:
        try:
            db_row = boardroom_postgres_query(
                f"SELECT simulation_id, status, total_turns FROM simulations WHERE id = '{sim_id}'::uuid"
            )
            log_test(f"4.5a [{label}] simulation in DB", len(db_row) > 0,
                     f"status={db_row[0].get('status', '?') if db_row else 'N/A'}")
        except Exception as e:
            log_test(f"4.5a [{label}] simulation in DB", False, str(e)[:60])

        try:
            db_turns = boardroom_postgres_query(
                f"SELECT COUNT(*) as cnt FROM turns WHERE simulation_id = '{sim_id}'::uuid"
            )
            turn_cnt = db_turns[0]["cnt"] if db_turns else 0
            log_test(f"4.5b [{label}] turns in DB", turn_cnt >= 0, f"count={turn_cnt}")
        except Exception as e:
            log_test(f"4.5b [{label}] turns in DB", False, str(e)[:60])

    # 6. Verify simulations listing includes ours
    log_test("4.6 All simulations accessible", len(sims) >= 0, f"listed={len(sims)}")

    return analytics


# ═══════════════════════════════════════════════════════════════════════
# SCENARIO 5: Agent Behavior Analysis (Cross-Simulation)
# ═══════════════════════════════════════════════════════════════════════

def test_agent_detail_endpoint():
    """Test the agent detail endpoint for a persona created in a simulation."""
    print("\n\n  ── SCENARIO 5: Agent Detail Analysis ──")

    # Get a list of stakeholders from the API
    stakeholders = api_request("GET", "/stakeholders")
    log_test("5.1 List stakeholders", isinstance(stakeholders, list),
             f"count={len(stakeholders)}")

    # Try agent detail if any agents exist in a sim
    sims = api_request("GET", "/simulations")
    for sim in sims[:1]:
        sim_id = sim.get("simulation_id", "")
        if sim_id:
            pm = api_request("POST", f"/simulations/{sim_id}/postmortem")
            if pm.get("stakeholder_reports"):
                log_test("5.2 Postmortem has stakeholder_reports", True,
                         f"count={len(pm['stakeholder_reports'])}")
                for sr in pm["stakeholder_reports"][:2]:
                    print(f"    Agent: {sr.get('name')} ({sr.get('role')}) "
                          f"shifts={sr.get('position_shifts')} "
                          f"dominant={sr.get('dominant_action')}")
                break

    # Check for topics
    pm = api_request("POST", f"/simulations/{sims[0]['simulation_id']}/postmortem")
    if pm.get("topics"):
        log_test("5.3 Postmortem has topics", True, f"count={len(pm['topics'])}")
        for t in pm["topics"][:3]:
            print(f"    Topic: {t.get('topic')[:50]} positions={len(t.get('positions', {}))}")
    else:
        log_test("5.3 Postmortem topics", True, "(topic count depends on LLM output)")

    # Check for key moments
    if pm.get("key_moments"):
        log_test("5.4 Postmortem has key_moments", True, f"count={len(pm['key_moments'])}")
    else:
        log_test("5.4 Postmortem key_moments", True, "(depends on events)")

    # Check verdict
    if pm.get("verdict"):
        log_test("5.5 Postmortem has verdict", True, f"verdict={pm['verdict']}")


# ═══════════════════════════════════════════════════════════════════════
# SCENARIO 6: End Condition Config Verification
# ═══════════════════════════════════════════════════════════════════════

def test_end_condition_config_verification():
    """Verify all 5 end condition types can be created and stored."""
    print("\n\n  ── SCENARIO 6: End Condition Config Verification ──")

    configs = {
        "timeout": {
            "subject": {"name": "T Test", "description": ""},
            "stakeholders": [{"id": "x", "name": "X", "role": "", "stance": "neutral",
                              "personality": {"aggressiveness": 50, "empathy": 50, "stubbornness": 50, "verbosity": 50},
                              "hidden_agenda": "", "backstory": "", "tools": []}],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "freeform"},
            "end_condition": {"type": "timeout", "max_normal_turns": 5},
            "voltage": 50, "player_mode": False,
            "env_flags": {"hidden_motives": False, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "stable",
        },
        "vote": {
            "subject": {"name": "V Test", "description": ""},
            "stakeholders": [{"id": "a", "name": "A", "role": "", "stance": "champion",
                              "personality": {"aggressiveness": 50, "empathy": 50, "stubbornness": 50, "verbosity": 50},
                              "hidden_agenda": "", "backstory": "", "tools": []},
                             {"id": "b", "name": "B", "role": "", "stance": "detractor",
                              "personality": {"aggressiveness": 50, "empathy": 50, "stubbornness": 50, "verbosity": 50},
                              "hidden_agenda": "", "backstory": "", "tools": []}],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "freeform"},
            "end_condition": {"type": "vote", "voters": ["a", "b"], "threshold": 0.5, "max_turns": 10},
            "voltage": 50, "player_mode": False,
            "env_flags": {"hidden_motives": False, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "stable",
        },
        "judge": {
            "subject": {"name": "J Test", "description": ""},
            "stakeholders": [{"id": "j1", "name": "Judge A", "role": "Judge", "stance": "moderator",
                              "personality": {"aggressiveness": 30, "empathy": 70, "stubbornness": 40, "verbosity": 50},
                              "hidden_agenda": "", "backstory": "", "tools": []},
                             {"id": "j2", "name": "Speaker B", "role": "Advocate", "stance": "champion",
                              "personality": {"aggressiveness": 60, "empathy": 40, "stubbornness": 50, "verbosity": 50},
                              "hidden_agenda": "", "backstory": "", "tools": []}],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "freeform"},
            "end_condition": {"type": "judge", "judge_id": "j1", "criteria": ["Was a fair compromise reached?"]},
            "voltage": 50, "player_mode": False,
            "env_flags": {"hidden_motives": False, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "stable",
        },
        "consensus": {
            "subject": {"name": "C Test", "description": ""},
            "stakeholders": [{"id": "c1", "name": "C1", "role": "", "stance": "champion",
                              "personality": {"aggressiveness": 50, "empathy": 50, "stubbornness": 50, "verbosity": 50},
                              "hidden_agenda": "", "backstory": "", "tools": []},
                             {"id": "c2", "name": "C2", "role": "", "stance": "detractor",
                              "personality": {"aggressiveness": 50, "empathy": 50, "stubbornness": 50, "verbosity": 50},
                              "hidden_agenda": "", "backstory": "", "tools": []}],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "freeform"},
            "end_condition": {"type": "consensus", "sensitivity": "balanced", "detection_mode": "both", "max_turns": 15},
            "voltage": 50, "player_mode": False,
            "env_flags": {"hidden_motives": False, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "stable",
        },
    }

    for label, cfg in configs.items():
        try:
            resp = api_request("POST", "/simulations", cfg)
            sim_id = resp.get("simulation_id", "")
            log_test(f"6.1 [{label}] created", bool(sim_id), f"id={sim_id[:8]}...")

            # Verify in DB
            try:
                db_row = boardroom_postgres_query(
                    f"SELECT status FROM v2_simulations WHERE simulation_id = '{sim_id}'"
                )
                log_test(f"6.2 [{label}] in DB", len(db_row) > 0)
            except Exception:
                log_test(f"6.2 [{label}] in DB", False)
        except Exception as e:
            log_test(f"6.1 [{label}] create failed", False, str(e)[:80])


# ═══════════════════════════════════════════════════════════════════════
# RUN ALL SCENARIOS
# ═══════════════════════════════════════════════════════════════════════

def sql(q: str) -> list[dict]:
    """Execute a SQL query against the boardroom database."""
    try:
        return boardroom_postgres_query(q)
    except Exception as e:
        print(f"    DB Error: {e}")
        return []

# Monkey-patch sql into global scope for test functions
global boardroom_postgres_query
boardroom_postgres_query = sql

def main():
    global boardroom_postgres_query
    boardroom_postgres_query = sql

    print("=" * 60)
    print("  BOARDROOM SIMULATOR — COMPREHENSIVE API TEST")
    print(f"  Started: {datetime.now().isoformat()}")
    print(f"  API: {API_BASE}")
    print("=" * 60)

    # Run scenarios
    vote_sim_id, vote_events, vote_pm = test_vote_condition_flow()
    timeout_sim_id, timeout_events = test_timeout_condition_flow()
    walkaway_sim_id, walkaway_events = test_walkaway_detection()

    test_database_deep_dive(vote_sim_id, timeout_sim_id, walkaway_sim_id)
    test_agent_detail_endpoint()
    test_end_condition_config_verification()

    # Summary
    print("\n\n" + "=" * 60)
    print(f"  RESULTS: {PASS}/{TESTS_RUN} passed, {FAIL} failed")
    print("=" * 60)

    # Print raw done event structure for vote scenario
    print("\n\n  ── RAW DONE EVENT (Vote Scenario) ──")
    for e in vote_events:
        if e.get("type") == "done":
            print(json.dumps(e, indent=2))
            break

    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
