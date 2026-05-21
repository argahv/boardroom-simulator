import pytest
from app.models import Stakeholder, SimulationCreate, EnvFlags
from app.workflow import create_workflow


@pytest.mark.asyncio
async def test_workflow_single_turn():
    """Test that workflow can generate at least one turn."""
    stakeholders = [
        Stakeholder(
            id="cfo_test",
            name="Test CFO",
            role="CFO",
            focus="Financial risk",
            incentive_tuning=70
        ),
        Stakeholder(
            id="legal_test",
            name="Test Legal",
            role="Legal Counsel",
            focus="Compliance",
            incentive_tuning=80
        )
    ]
    
    import os
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    
    if not api_key:
        pytest.skip("OPENROUTER_API_KEY not configured")
    
    workflow_graph, initial_state = create_workflow(
        simulation_id="test_001",
        background="Test negotiation scenario",
        primary_goal="Reach agreement on terms",
        stakeholders=stakeholders,
        voltage=50,
        env_flags={},
        max_turns=1,
        openrouter_api_key=api_key
    )
    
    final_state = await workflow_graph.ainvoke(initial_state)
    
    assert len(final_state['history']) >= 1
    
    first_turn = final_state['history'][0]
    assert 'stakeholder_id' in first_turn
    assert 'content' in first_turn
    assert len(first_turn['content']) > 10
    
    print(f"✓ Generated turn from {first_turn['stakeholder_name']}: {first_turn['content'][:100]}")


@pytest.mark.asyncio
async def test_tool_calling():
    """Test that CFO agent can call financial tools."""
    from app.agents import create_agent_for_stakeholder, AgentState
    
    import os
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    
    if not api_key:
        pytest.skip("OPENROUTER_API_KEY not configured")
    
    stakeholder = Stakeholder(
        id="cfo_tool_test",
        name="Tool Test CFO",
        role="CFO",
        focus="ROI analysis",
        incentive_tuning=75
    )
    
    agent = create_agent_for_stakeholder(stakeholder, api_key)
    
    assert len(agent.tools) > 0
    assert any('roi' in tool.name.lower() or 'financial' in tool.name.lower() for tool in agent.tools)
    
    print(f"✓ CFO agent has {len(agent.tools)} tools available")


def test_memory_storage():
    """Test that memory can store and retrieve turns."""
    from app.memory import get_memory
    import os
    
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        pytest.skip("OPENROUTER_API_KEY not configured")
    
    os.environ["OPENAI_API_KEY"] = api_key
    
    memory = get_memory(openrouter_api_key=api_key)
    
    memory.store_turn(
        simulation_id="test_sim",
        agent_id="test_agent",
        turn_index=0,
        content="This is a test turn",
        metadata={"action_type": "statement"}
    )
    
    results = memory.retrieve_relevant_context(
        simulation_id="test_sim",
        agent_id="test_agent",
        query="test",
        n_results=1
    )
    
    assert len(results) >= 1
    assert "test turn" in results[0]['content']
    
    print("✓ Memory storage and retrieval working")


def test_evaluation_metrics():
    """Test evaluation framework."""
    from app.evals import evaluate_turn_quality, evaluate_simulation
    
    turn = {
        'turn_index': 0,
        'stakeholder_id': 'cfo_001',
        'content': 'I propose we proceed with the acquisition at $45M valuation based on ROI analysis.',
        'action_type': 'statement',
        'internal_reasoning': 'Need to establish initial position',
        'tool_calls': [{'tool': 'calculate_roi', 'result': {}}]
    }
    
    expected = {
        'action_types': ['statement', 'compromise'],
        'tool_calls': {'cfo': ['calculate_roi']}
    }
    
    scores = evaluate_turn_quality(turn, expected)
    
    assert 'content_length' in scores
    assert 'tool_usage' in scores
    assert scores['content_length'] == 1.0
    assert scores['tool_usage'] > 0.0
    
    print(f"✓ Evaluation metrics: {scores}")
