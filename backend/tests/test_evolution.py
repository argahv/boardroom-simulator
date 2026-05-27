"""Tests for evolution mapping, service, and approval API.

Covers:
  - compute_evolution_deltas — all outcome types, bounds, vote inference
  - _clamp_trait — boundary conditions
  - compute_evolution — full pipeline, stance shift eligibility
  - EvolutionService — DB-backed store and retrieval
  - API endpoints — pending evolutions, approval, rejection, history
"""

from __future__ import annotations

import asyncio
import json
import os

os.environ["DATABASE_TYPE"] = "sqlite"
os.environ["SQLITE_PATH"] = ":memory:"

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import initialize_database, close_database, get_database
from app.evolution import (
    MAX_DELTA,
    MIN_TRAIT,
    MAX_TRAIT,
    TRAITS,
    OUTCOME_RULES,
    compute_evolution_deltas,
    compute_evolution,
    clamp_trait,
    EvolutionService,
)


# ── Fixtures ────────────────────────────────────────────────────────────────

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


@pytest.fixture
def evo_service(fresh_db):
    """EvolutionService wired to the fresh singleton DB."""
    return EvolutionService(get_database())


# ═══════════════════════════════════════════════════════════════════════════
# Mapping Logic Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestComputeEvolutionDeltas:
    """Pure-function tests for compute_evolution_deltas."""

    def test_vote_win(self):
        d = compute_evolution_deltas("champion", {"outcome_type": "vote", "vote_result": "win"})
        assert d == {"aggressiveness": 5, "empathy": -3, "stubbornness": 0, "verbosity": 0}

    def test_vote_loss(self):
        d = compute_evolution_deltas("detractor", {"outcome_type": "vote", "vote_result": "loss"})
        assert d == {"aggressiveness": 0, "empathy": 5, "stubbornness": -5, "verbosity": 0}

    def test_vote_win_via_breakdown(self):
        """Infer win from vote_breakdown when vote_result is absent."""
        d = compute_evolution_deltas(
            "champion",
            {"outcome_type": "vote", "vote_breakdown": {"for": 5, "against": 2}},
        )
        assert d["aggressiveness"] == 5
        assert d["empathy"] == -3

    def test_vote_loss_via_breakdown(self):
        """Infer loss from vote_breakdown when vote_result is absent."""
        d = compute_evolution_deltas(
            "detractor",
            {"outcome_type": "vote", "vote_breakdown": {"for": 1, "against": 4}},
        )
        assert d["empathy"] == 5

    def test_vote_tie_defaults_to_loss(self):
        """Tie vote (for == against) produces vote_loss deltas."""
        d = compute_evolution_deltas(
            "champion",
            {"outcome_type": "vote", "vote_breakdown": {"for": 3, "against": 3}},
        )
        # Can't determine winner → loss deltas apply
        assert d == {"aggressiveness": 0, "empathy": 5, "stubbornness": -5, "verbosity": 0}

    def test_consensus(self):
        d = compute_evolution_deltas("neutral", {"outcome_type": "consensus"})
        assert d == {"aggressiveness": -3, "empathy": 3, "stubbornness": 0, "verbosity": 0}

    def test_deadlock(self):
        d = compute_evolution_deltas("champion", {"outcome_type": "deadlock"})
        assert d == {"aggressiveness": 5, "empathy": -5, "stubbornness": 5, "verbosity": 0}

    def test_timeout(self):
        d = compute_evolution_deltas("champion", {"outcome_type": "timeout"})
        assert d == {"aggressiveness": 5, "empathy": -5, "stubbornness": 5, "verbosity": 0}

    def test_walkaway(self):
        d = compute_evolution_deltas("champion", {"outcome_type": "walkaway"})
        assert d == {"aggressiveness": 10, "empathy": 5, "stubbornness": 0, "verbosity": 0}

    def test_unknown_outcome_returns_zero(self):
        d = compute_evolution_deltas("neutral", {"outcome_type": "unknown_xyz"})
        assert all(v == 0 for v in d.values())

    def test_missing_outcome_type_defaults_to_timeout(self):
        d = compute_evolution_deltas("champion", {})
        assert d == {"aggressiveness": 5, "empathy": -5, "stubbornness": 5, "verbosity": 0}

    # ── Bound checks ──

    def test_all_deltas_within_bounds(self):
        """Every outcome rule has all four traits and no delta exceeds MAX_DELTA."""
        for outcome_key, deltas in OUTCOME_RULES.items():
            for trait in TRAITS:
                assert trait in deltas, f"{outcome_key} missing trait '{trait}'"
                assert abs(deltas[trait]) <= MAX_DELTA, (
                    f"{outcome_key}.{trait}={deltas[trait]} exceeds ±{MAX_DELTA}"
                )

    def test_compute_deltas_output_always_has_all_traits(self):
        """Output dict always includes all TRAITS keys even when input sparse."""
        for outcome_type in ("vote", "consensus", "timeout", "deadlock", "walkaway", "bogus"):
            d = compute_evolution_deltas("neutral", {"outcome_type": outcome_type})
            for trait in TRAITS:
                assert trait in d, f"Missing trait '{trait}' for outcome '{outcome_type}'"

    # ── Stance-specific triggers ──

    def test_all_stances_produce_same_deltas_for_same_outcome(self):
        """Stance affects vote win/loss inference only, not other outcome types."""
        for outcome_type in ("consensus", "timeout", "deadlock", "walkaway"):
            base = compute_evolution_deltas("neutral", {"outcome_type": outcome_type})
            for stance in ("champion", "detractor", "neutral", "moderator", "wildcard"):
                d = compute_evolution_deltas(stance, {"outcome_type": outcome_type})
                assert d == base, f"Stance '{stance}' differed for '{outcome_type}'"


class TestClampTrait:
    """Boundary and edge-case tests for _clamp_trait / clamp_trait."""

    def test_mid_range(self):
        assert clamp_trait(50) == 50
        assert clamp_trait(0) == 0
        assert clamp_trait(100) == 100

    def test_below_min_clamps_to_zero(self):
        assert clamp_trait(-1) == MIN_TRAIT == 0
        assert clamp_trait(-10) == 0
        assert clamp_trait(-999) == 0

    def test_above_max_clamps_to_one_hundred(self):
        assert clamp_trait(101) == MAX_TRAIT == 100
        assert clamp_trait(200) == 100

    def test_negative_input_never_negative_output(self):
        for val in range(-100, 0):
            assert clamp_trait(val) == 0

    def test_exact_boundaries(self):
        assert clamp_trait(MIN_TRAIT) == MIN_TRAIT
        assert clamp_trait(MAX_TRAIT) == MAX_TRAIT


class TestComputeEvolution:
    """Full pipeline tests for compute_evolution."""

    BASE_PERSONALITY = {"aggressiveness": 50, "empathy": 50, "stubbornness": 50, "verbosity": 50}

    def test_deltas_applied_correctly(self):
        """personality_after = personality_before + deltas."""
        prop = compute_evolution("p1", self.BASE_PERSONALITY, "champion",
                                 {"outcome_type": "vote", "vote_result": "win"})
        assert prop["personality_before"]["aggressiveness"] == 50
        assert prop["personality_after"]["aggressiveness"] == 55  # 50 + 5
        assert prop["personality_after"]["empathy"] == 47  # 50 - 3
        assert prop["deltas"]["aggressiveness"] == 5
        assert prop["deltas"]["empathy"] == -3

    def test_clamping_in_pipeline(self):
        """Trait values are clamped to [0, 100] after delta application."""
        near_min = {"aggressiveness": 2, "empathy": 50, "stubbornness": 50, "verbosity": 50}
        prop = compute_evolution("p1", near_min, "champion",
                                 {"outcome_type": "vote", "vote_result": "win"})
        # aggressiveness: 2 + 5 = 7 (within range)
        assert prop["personality_after"]["aggressiveness"] == 7

        # Test clamping on low end
        low_end = {"aggressiveness": 0, "empathy": 1, "stubbornness": 50, "verbosity": 50}
        prop2 = compute_evolution("p1", low_end, "champion",
                                  {"outcome_type": "vote", "vote_result": "win"})
        # empathy: 1 - 3 = -2 → clamped to 0
        assert prop2["personality_after"]["empathy"] == 0

        # Test clamping on high end
        high_end = {"aggressiveness": 98, "empathy": 50, "stubbornness": 50, "verbosity": 50}
        prop3 = compute_evolution("p1", high_end, "champion",
                                  {"outcome_type": "walkaway"})
        # aggressiveness: 98 + 10 = 108 → clamped to 100
        assert prop3["personality_after"]["aggressiveness"] == 100

    def test_stance_preserved_for_normal_outcomes(self):
        prop = compute_evolution("p1", self.BASE_PERSONALITY, "champion",
                                 {"outcome_type": "vote", "vote_result": "win"})
        assert prop["stance_before"] == "champion"
        assert prop["stance_after"] == "champion"
        assert prop["stance_shift_proposed"] is False

    def test_stance_shift_for_walkaway(self):
        prop = compute_evolution("p1", self.BASE_PERSONALITY, "champion",
                                 {"outcome_type": "walkaway"})
        assert prop["stance_shift_proposed"] is True

    def test_stance_shift_for_deadlock(self):
        prop = compute_evolution("p1", self.BASE_PERSONALITY, "detractor",
                                 {"outcome_type": "deadlock"})
        assert prop["stance_shift_proposed"] is True

    def test_stance_shift_for_low_confidence(self):
        prop = compute_evolution("p1", self.BASE_PERSONALITY, "neutral",
                                 {"outcome_type": "vote", "vote_result": "win", "confidence": 0.1})
        assert prop["stance_shift_proposed"] is True

    def test_no_stance_shift_for_normal_confidence(self):
        prop = compute_evolution("p1", self.BASE_PERSONALITY, "neutral",
                                 {"outcome_type": "vote", "vote_result": "win", "confidence": 0.8})
        assert prop["stance_shift_proposed"] is False

    def test_persona_id_preserved(self):
        prop = compute_evolution("my-persona-42", self.BASE_PERSONALITY, "neutral",
                                 {"outcome_type": "consensus"})
        assert prop["persona_id"] == "my-persona-42"

    def test_missing_trait_defaults_to_50(self):
        """Missing traits in current_personality default to 50."""
        partial = {"aggressiveness": 30}
        prop = compute_evolution("p1", partial, "neutral",
                                 {"outcome_type": "consensus"})
        # aggressiveness: 30 - 3 = 27
        assert prop["personality_after"]["aggressiveness"] == 27
        # empathy: default 50 + 3 = 53
        assert prop["personality_after"]["empathy"] == 53
        # stubbornness: default 50 + 0 = 50
        assert prop["personality_after"]["stubbornness"] == 50


# ═══════════════════════════════════════════════════════════════════════════
# EvolutionService Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestEvolutionService:
    """Database-backed EvolutionService tests."""

    BASE_PERSONALITY = {"aggressiveness": 50, "empathy": 50, "stubbornness": 50, "verbosity": 50}

    @pytest.mark.asyncio
    async def test_compute_and_store_creates_pending_evolution(self, evo_service):
        prop = await evo_service.compute_and_store(
            persona_id="p1",
            simulation_id="sim-1",
            current_personality=self.BASE_PERSONALITY,
            current_stance="champion",
            simulation_result={"outcome_type": "vote", "vote_result": "win"},
        )
        assert prop is not None
        assert prop["persona_id"] == "p1"
        assert prop["deltas"]["aggressiveness"] == 5

        pending = await evo_service.get_pending_evolutions("p1")
        assert len(pending) == 1
        assert pending[0]["persona_id"] == "p1"
        assert pending[0]["status"] == "pending"

    @pytest.mark.asyncio
    async def test_get_pending_evolutions_excludes_processed(self, evo_service):
        await evo_service.compute_and_store(
            persona_id="p2",
            simulation_id="sim-1",
            current_personality=self.BASE_PERSONALITY,
            current_stance="neutral",
            simulation_result={"outcome_type": "consensus"},
        )

        # Approve via DB directly
        db = get_database()
        pending = await evo_service.get_pending_evolutions("p2")
        await db.approve_evolution(pending[0]["id"])

        # Should no longer appear as pending
        remaining = await evo_service.get_pending_evolutions("p2")
        assert len(remaining) == 0

    @pytest.mark.asyncio
    async def test_get_evolution_history_returns_all_statuses(self, evo_service):
        await evo_service.compute_and_store(
            persona_id="p3",
            simulation_id="sim-1",
            current_personality=self.BASE_PERSONALITY,
            current_stance="champion",
            simulation_result={"outcome_type": "walkaway"},
        )

        db = get_database()
        pending = await evo_service.get_pending_evolutions("p3")
        await db.approve_evolution(pending[0]["id"])

        # Second evolution — stays pending
        await evo_service.compute_and_store(
            persona_id="p3",
            simulation_id="sim-2",
            current_personality=self.BASE_PERSONALITY,
            current_stance="detractor",
            simulation_result={"outcome_type": "timeout"},
        )

        history = await evo_service.get_evolution_history("p3")
        assert len(history) == 2
        statuses = {h["status"] for h in history}
        assert "approved" in statuses
        assert "pending" in statuses

    @pytest.mark.asyncio
    async def test_evolution_service_multiple_personas_isolated(self, evo_service):
        await evo_service.compute_and_store(
            persona_id="alice",
            simulation_id="sim-1",
            current_personality=self.BASE_PERSONALITY,
            current_stance="champion",
            simulation_result={"outcome_type": "timeout"},
        )
        await evo_service.compute_and_store(
            persona_id="bob",
            simulation_id="sim-1",
            current_personality=self.BASE_PERSONALITY,
            current_stance="detractor",
            simulation_result={"outcome_type": "consensus"},
        )
        alice_pending = await evo_service.get_pending_evolutions("alice")
        bob_pending = await evo_service.get_pending_evolutions("bob")
        assert len(alice_pending) == 1
        assert len(bob_pending) == 1

    @pytest.mark.asyncio
    async def test_get_pending_evolutions_returns_empty_list_when_none(self, evo_service):
        pending = await evo_service.get_pending_evolutions("nonexistent")
        assert pending == []

    @pytest.mark.asyncio
    async def test_get_evolution_history_returns_empty_list_when_none(self, evo_service):
        history = await evo_service.get_evolution_history("nonexistent")
        assert history == []


# ═══════════════════════════════════════════════════════════════════════════
# API Endpoint Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestEvolutionAPI:
    """Full HTTP integration tests for evolution endpoints."""

    PERSONALITY = {"aggressiveness": 50, "empathy": 50, "stubbornness": 50, "verbosity": 50}

    def _create_persona(self, client, name="Test Persona", stance="neutral") -> str:
        payload = {
            "id": "",
            "name": name,
            "role": "Analyst",
            "focus": "data analysis",
            "incentive_tuning": 50,
            "hidden_agenda": "",
            "tag": "VISIONARY",
            "tool_profile": "technical",
            "backstory": f"Backstory for {name}",
            "stance": stance,
            "personality": json.dumps(self.PERSONALITY),
            "tools": '[]',
        }
        resp = client.post("/stakeholders", json=payload)
        assert resp.status_code == 201
        return resp.json()["id"]

    def _seed_evolution(self, client, persona_id: str, outcome_type: str = "consensus") -> str:
        """Create an evolution via EvolutionService directly."""
        import asyncio
        svc = EvolutionService(get_database())
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            svc.compute_and_store(
                persona_id=persona_id,
                simulation_id="sim-api-test",
                current_personality=self.PERSONALITY,
                current_stance="neutral",
                simulation_result={"outcome_type": outcome_type},
            )
        )
        loop.close()
        # Fetch the evolution ID
        pending = asyncio.new_event_loop()
        asyncio.set_event_loop(pending)
        evos = pending.run_until_complete(svc.get_pending_evolutions(persona_id))
        pending.close()
        return evos[0]["id"]

    # ── GET evolutions/pending ──

    def test_pending_evolutions_empty_for_new_persona(self, client):
        pid = self._create_persona(client)
        resp = client.get(f"/personas/{pid}/evolutions/pending")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_pending_evolutions_returns_after_compute(self, client):
        pid = self._create_persona(client)
        evo_id = self._seed_evolution(client, pid)

        resp = client.get(f"/personas/{pid}/evolutions/pending")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == evo_id
        assert data[0]["status"] == "pending"

    # ── GET evolutions history ──

    def test_evolution_history_empty_for_new_persona(self, client):
        pid = self._create_persona(client)
        resp = client.get(f"/personas/{pid}/evolutions")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_evolution_history_after_approval(self, client):
        pid = self._create_persona(client)
        evo_id = self._seed_evolution(client, pid)

        # Approve
        client.post(f"/evolutions/{evo_id}/approve")

        # History should show it
        resp = client.get(f"/personas/{pid}/evolutions")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["status"] == "approved"

    # ── POST approve ──

    def test_approve_nonexistent_returns_404(self, client):
        resp = client.post("/evolutions/nonexistent/approve")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_approve_pending_evolution(self, client):
        pid = self._create_persona(client)
        evo_id = self._seed_evolution(client, pid)

        resp = client.post(f"/evolutions/{evo_id}/approve")
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"
        assert resp.json()["evolution_id"] == evo_id

    def test_approve_already_approved_returns_404(self, client):
        pid = self._create_persona(client)
        evo_id = self._seed_evolution(client, pid)

        client.post(f"/evolutions/{evo_id}/approve")
        resp2 = client.post(f"/evolutions/{evo_id}/approve")
        assert resp2.status_code == 404  # Already processed

    # ── POST reject ──

    def test_reject_nonexistent_returns_404(self, client):
        resp = client.post("/evolutions/nonexistent/reject")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_reject_pending_evolution(self, client):
        pid = self._create_persona(client)
        evo_id = self._seed_evolution(client, pid)

        resp = client.post(f"/evolutions/{evo_id}/reject")
        assert resp.status_code == 200
        assert resp.json()["status"] == "rejected"
        assert resp.json()["evolution_id"] == evo_id

    def test_reject_already_rejected_returns_404(self, client):
        pid = self._create_persona(client)
        evo_id = self._seed_evolution(client, pid)

        client.post(f"/evolutions/{evo_id}/reject")
        resp2 = client.post(f"/evolutions/{evo_id}/reject")
        assert resp2.status_code == 404

    def test_approve_reject_cycle_updates_status(self, client):
        """Approve updates status, then history shows it."""
        pid = self._create_persona(client)
        evo_id = self._seed_evolution(client, pid)

        client.post(f"/evolutions/{evo_id}/approve")

        resp = client.get(f"/personas/{pid}/evolutions")
        assert resp.status_code == 200
        data = resp.json()
        assert data[0]["status"] == "approved"

    def test_reject_removes_from_pending(self, client):
        pid = self._create_persona(client)
        evo_id = self._seed_evolution(client, pid)

        client.post(f"/evolutions/{evo_id}/reject")

        resp = client.get(f"/personas/{pid}/evolutions/pending")
        assert resp.status_code == 200
        assert resp.json() == []
