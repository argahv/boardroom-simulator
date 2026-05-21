from typing import Dict, Any, List
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, END
import asyncio
import random

from app.agents import BoardroomAgent, AgentState, create_agent_for_stakeholder
from app.memory import NegotiationMemory, get_memory
from app.models import Stakeholder, Turn
from app import config

# ---------------------------------------------------------------------------
# Module-level registries — kept outside LangGraph state so they are never
# serialized / checkpointed by LangGraph (Python objects are not JSON-safe).
# ---------------------------------------------------------------------------
_agent_registry: Dict[str, Dict[str, BoardroomAgent]] = {}
_memory_registry: Dict[str, NegotiationMemory] = {}


def _get_agents(simulation_id: str) -> Dict[str, BoardroomAgent]:
    return _agent_registry.get(simulation_id, {})


def _get_sim_memory(simulation_id: str) -> NegotiationMemory:
    if simulation_id not in _memory_registry:
        _memory_registry[simulation_id] = get_memory(
            openrouter_api_key=config.OPENROUTER_API_KEY
        )
    return _memory_registry[simulation_id]


class WorkflowState(TypedDict):
    simulation_id: str
    turn_index: int
    background: str
    primary_goal: str
    stakeholders: List[Dict[str, Any]]
    voltage: int
    env_flags: Dict[str, bool]
    active_speaker_id: str
    history: List[Dict[str, Any]]
    heatmap: Dict[str, int]
    event_log: List[str]
    max_turns: int
    current_turn: Dict[str, Any]


def select_next_speaker(state: WorkflowState) -> WorkflowState:
    """
    Speaker selection node: decides which agent speaks next.
    
    Selection logic:
    1. If turn_index == 0: random selection
    2. If previous speaker used coalition_with: that person speaks next
    3. If previous speaker used directed_at: that person speaks next
    4. Otherwise: weighted random based on incentive_tuning + voltage
    """
    turn_index = state['turn_index']
    history = state['history']
    stakeholders = state['stakeholders']
    voltage = state['voltage']
    
    if turn_index == 0:
        selected = random.choice(stakeholders)
        state['active_speaker_id'] = selected['id']
        state['event_log'].append(f"Turn {turn_index}: {selected['name']} opens the negotiation")
        return state
    
    last_turn = history[-1]
    
    if last_turn.get('coalition_with'):
        target_id = last_turn['coalition_with']
        state['active_speaker_id'] = target_id
        target = next((s for s in stakeholders if s['id'] == target_id), None)
        if target:
            state['event_log'].append(f"Turn {turn_index}: Coalition signal - {target['name']} responds")
        return state
    
    if last_turn.get('directed_at'):
        target_id = last_turn['directed_at']
        state['active_speaker_id'] = target_id
        target = next((s for s in stakeholders if s['id'] == target_id), None)
        if target:
            state['event_log'].append(f"Turn {turn_index}: {target['name']} responds to direct address")
        return state
    
    weights = []
    for s in stakeholders:
        base_weight = s.get('incentive_tuning', 50)
        voltage_boost = voltage / 100.0
        weight = base_weight * (1 + voltage_boost)
        weights.append(weight)
    
    total = sum(weights)
    normalized = [w / total for w in weights]
    
    selected = random.choices(stakeholders, weights=normalized, k=1)[0]
    state['active_speaker_id'] = selected['id']
    state['event_log'].append(f"Turn {turn_index}: {selected['name']} takes the floor")
    
    return state


async def generate_turn(state: WorkflowState) -> WorkflowState:
    agent_id = state['active_speaker_id']
    agent_instances = _get_agents(state['simulation_id'])

    agent = agent_instances.get(agent_id)
    if not agent:
        state['event_log'].append(f"ERROR: Agent {agent_id} not found")
        return state

    memory = _get_sim_memory(state['simulation_id'])

    query = f"What is my current position on {state['primary_goal']}?"
    relevant_context = memory.retrieve_relevant_context(
        simulation_id=state['simulation_id'],
        agent_id=agent_id,
        query=query,
        n_results=3
    )

    agent_state: AgentState = {
        'simulation_id': state['simulation_id'],
        'turn_index': state['turn_index'],
        'background': state['background'],
        'primary_goal': state['primary_goal'],
        'stakeholders': state['stakeholders'],
        'voltage': state['voltage'],
        'active_speaker_id': agent_id,
        'history': state['history'],
        'agent_memories': {agent_id: relevant_context},
        'heatmap': state['heatmap'],
        'event_log': state['event_log']
    }

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, agent.invoke, agent_state)

    stakeholder = next((s for s in state['stakeholders'] if s['id'] == agent_id), None)

    turn = {
        'turn_index': state['turn_index'],
        'stakeholder_id': agent_id,
        'stakeholder_name': stakeholder['name'] if stakeholder else agent_id,
        'role': stakeholder['role'] if stakeholder else 'Unknown',
        'content': response.content,
        'internal_reasoning': response.internal_reasoning,
        'action_type': response.action_type,
        'directed_at': response.directed_at,
        'coalition_with': response.coalition_with,
        'emotional_tone': response.emotional_tone,
        'tool_calls': response.tool_calls
    }

    state['current_turn'] = turn
    state['history'].append(turn)

    memory.store_turn(
        simulation_id=state['simulation_id'],
        agent_id=agent_id,
        turn_index=state['turn_index'],
        content=response.content,
        metadata={
            'action_type': response.action_type,
            'emotional_tone': response.emotional_tone,
            'tool_count': len(response.tool_calls)
        }
    )

    state['turn_index'] += 1

    return state


def update_heatmap(state: WorkflowState) -> WorkflowState:
    """
    Heatmap update node: adjust negotiation dimensions based on turn.
    
    Simplified heuristic:
    - CFO turns mentioning ROI/revenue → increase commercial_gain
    - Legal turns mentioning risk/compliance → increase legal_safety
    - CTO turns mentioning tech/architecture → increase tech_integrity
    """
    current_turn = state.get('current_turn')
    if not current_turn:
        return state
    
    role = current_turn.get('role', '').lower()
    content = current_turn.get('content', '').lower()
    
    heatmap = state['heatmap']
    
    if 'cfo' in role or 'finance' in role:
        if any(kw in content for kw in ['roi', 'revenue', 'profit', 'cost']):
            heatmap['commercial_gain'] = min(100, heatmap.get('commercial_gain', 50) + 5)
    
    if 'legal' in role or 'counsel' in role:
        if any(kw in content for kw in ['risk', 'compliance', 'liability', 'regulation']):
            heatmap['legal_safety'] = min(100, heatmap.get('legal_safety', 50) + 5)
    
    if 'cto' in role or 'tech' in role:
        if any(kw in content for kw in ['architecture', 'infrastructure', 'scalability', 'tech']):
            heatmap['tech_integrity'] = min(100, heatmap.get('tech_integrity', 50) + 5)
    
    state['heatmap'] = heatmap
    
    return state


def should_continue(state: WorkflowState) -> str:
    """
    Conditional routing: decide if negotiation should continue.
    
    Stop conditions:
    - Reached max_turns
    - Deadlock detected (3+ consecutive challenges with no compromise)
    - Consensus detected (2+ coalition signals in last 3 turns)
    """
    if state['turn_index'] >= state['max_turns']:
        state['event_log'].append(f"Negotiation complete: reached {state['max_turns']} turns")
        return 'end'
    
    history = state['history']
    
    if len(history) >= 3:
        recent = history[-3:]
        challenge_count = sum(1 for t in recent if t.get('action_type') == 'challenge')
        if challenge_count >= 3:
            state['event_log'].append("Deadlock detected: excessive challenges without compromise")
            return 'end'
    
    if len(history) >= 3:
        recent = history[-3:]
        coalition_count = sum(1 for t in recent if t.get('coalition_with') is not None)
        if coalition_count >= 2:
            state['event_log'].append("Consensus emerging: multiple coalition signals")
            return 'end'
    
    return 'continue'


def create_workflow(
    simulation_id: str,
    background: str,
    primary_goal: str,
    stakeholders: List[Stakeholder],
    voltage: int,
    env_flags: Dict[str, bool],
    max_turns: int,
    openrouter_api_key: str,
):
    agent_instances = {}
    for stakeholder in stakeholders:
        agent = create_agent_for_stakeholder(
            stakeholder=stakeholder,
            openrouter_api_key=openrouter_api_key
        )
        agent_instances[stakeholder.id] = agent
    _agent_registry[simulation_id] = agent_instances

    _get_sim_memory(simulation_id)

    initial_state: WorkflowState = {
        'simulation_id': simulation_id,
        'turn_index': 0,
        'background': background,
        'primary_goal': primary_goal,
        'stakeholders': [
            {
                'id': s.id,
                'name': s.name,
                'role': s.role,
                'focus': s.focus,
                'incentive_tuning': s.incentive_tuning,
                'hidden_agenda': s.hidden_agenda,
                'tag': s.tag
            }
            for s in stakeholders
        ],
        'voltage': voltage,
        'env_flags': env_flags,
        'active_speaker_id': '',
        'history': [],
        'heatmap': {
            'commercial_gain': 50,
            'tech_integrity': 50,
            'legal_safety': 50
        },
        'event_log': [],
        'max_turns': max_turns,
        'current_turn': {}
    }

    workflow = StateGraph(WorkflowState)

    workflow.add_node("select_speaker", select_next_speaker)
    workflow.add_node("generate_turn", generate_turn)
    workflow.add_node("update_heatmap", update_heatmap)

    workflow.set_entry_point("select_speaker")

    workflow.add_edge("select_speaker", "generate_turn")
    workflow.add_edge("generate_turn", "update_heatmap")

    workflow.add_conditional_edges(
        "update_heatmap",
        should_continue,
        {
            'continue': 'select_speaker',
            'end': END
        }
    )

    graph = workflow.compile()

    return graph, initial_state
