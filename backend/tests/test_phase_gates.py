import pytest


def test_models_compile():
    from app.models import (
        SimulationState,
        SimulationCreate,
        Turn,
        Objective,
        ObjectiveStore,
        LeaderboardEntry,
    )

    assert LeaderboardEntry


def test_objective_store_cap():
    from app.models import Objective, ObjectiveStore

    store = ObjectiveStore(max_active=3)
    for i in range(10):
        store.add(
            Objective(
                id=f"obj_{i}",
                text=f"obj {i}",
                source="opportunity",
                priority=float(i % 5),
                created_at_turn=i,
                last_reinforced_turn=i,
            )
        )
    active = [o for o in store.objectives if o.is_active]
    assert len(active) <= 3


def test_objective_decay():
    from app.models import Objective, ObjectiveStore

    store = ObjectiveStore()
    store.add(
        Objective(
            id="a",
            text="x",
            source="initial",
            priority=2.0,
            ttl_turns=5,
            created_at_turn=0,
            last_reinforced_turn=0,
        )
    )
    store.decay(current_turn=10)
    assert not store.objectives[0].is_active


def test_scoring_produces_ranks():
    from app.scoring import compute_scores

    stakeholders = [
        {"id": "a", "name": "Alice"},
        {"id": "b", "name": "Bob"},
    ]
    scores = compute_scores(
        stakeholders=stakeholders,
        trust_matrix={"a": {"b": 60}, "b": {"a": 40}},
        leverage_scores={"a": 70, "b": 50},
        history=[],
        objective_stores={},
        coalitions=[],
        prev_scores={},
    )
    assert len(scores) == 2
    assert scores[0].rank == 1
    assert scores[1].rank == 2


def test_scoring_delta_reason():
    from app.scoring import compute_scores

    stakeholders = [{"id": "a", "name": "Alice"}]
    prev = {"a": 30.0}
    scores = compute_scores(
        stakeholders=stakeholders,
        trust_matrix={},
        leverage_scores={"a": 90},
        history=[],
        objective_stores={},
        coalitions=[],
        prev_scores=prev,
    )
    assert scores[0].delta != 0 or scores[0].delta_reason == "stable"


def test_agent_response_schema():
    from app.agents import AgentResponse

    r = AgentResponse(
        content="test",
        internal_reasoning="r",
        action_type="statement",
        emotional_tone="neutral",
    )
    assert r.content == "test"


def test_budget_guard_trip():
    from app.budget import BudgetGuard, BudgetExhaustedError

    BudgetGuard.reset("test-trip")
    guard = BudgetGuard.for_simulation("test-trip")
    guard.trip("credits_402")
    with pytest.raises(BudgetExhaustedError):
        guard.preflight()


def test_budget_guard_cap():
    from app.budget import BudgetGuard, BudgetExhaustedError

    BudgetGuard.reset("test-cap")
    guard = BudgetGuard(simulation_id="test-cap", budget_tokens=100)
    with pytest.raises(BudgetExhaustedError):
        guard.preflight(estimated_tokens=200)


def test_player_mode_field():
    from app.models import SimulationCreate, Stakeholder, EnvFlags

    sc = SimulationCreate(
        background="x",
        primary_goal="y",
        stakeholders=[],
        voltage=50,
        env_flags=EnvFlags(),
        player_mode=True,
    )
    assert sc.player_mode is True


def test_runtime_status_default():
    from app.models import SimulationState, SimulationCreate, EnvFlags

    sc = SimulationCreate(
        background="x",
        primary_goal="y",
        stakeholders=[],
        voltage=50,
        env_flags=EnvFlags(),
    )
    state = SimulationState(simulation_id="test", config=sc)
    assert state.runtime_status == "idle"
    assert state.state_version == 0
