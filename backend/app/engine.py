from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

from langsmith import traceable

from . import config
from .workflow import create_workflow, WorkflowState
from .models import SimulationState, Turn
from .memory import get_memory


@traceable(name="advance_turn", run_type="chain")
async def advance_turn(state: SimulationState) -> SimulationState:
    """
    Advance negotiation by one turn using LangGraph multi-agent workflow.
    
    Replaces single-orchestrator with true multi-agent system:
    - LangGraph StateGraph manages agent selection and turn generation
    - Each stakeholder is a separate BoardroomAgent with role-specific tools
    - Chroma vector memory provides semantic retrieval
    - Enhanced LangSmith tracing captures workflow execution
    """
    from .persistence import get_checkpoint_manager
    
    memory = get_memory(openrouter_api_key=config.OPENROUTER_API_KEY)
    checkpoint_manager = get_checkpoint_manager()
    
    workflow_graph, workflow_state = create_workflow(
        simulation_id=state.simulation_id,
        background=state.config.background,
        primary_goal=state.config.primary_goal,
        stakeholders=state.config.stakeholders,
        voltage=state.config.voltage,
        env_flags=state.config.env_flags.dict(),
        max_turns=1,
        openrouter_api_key=config.OPENROUTER_API_KEY
    )
    
    workflow_state['history'] = [
        {
            'turn_index': t.turn_index,
            'stakeholder_id': t.stakeholder_id,
            'stakeholder_name': t.stakeholder_name,
            'role': t.role,
            'content': t.content,
            'action_type': t.action_type,
            'directed_at': t.directed_at,
            'coalition_with': t.coalition_with,
            'emotional_tone': t.emotional_tone
        }
        for t in state.turns
    ]
    workflow_state['turn_index'] = len(state.turns)
    workflow_state['heatmap'] = {
        'commercial_gain': state.heatmap.commercial_gain,
        'tech_integrity': state.heatmap.tech_integrity,
        'legal_safety': state.heatmap.legal_safety
    }
    
    final_state = await workflow_graph.ainvoke(workflow_state)
    
    if final_state['history'] and len(final_state['history']) > len(state.turns):
        new_turn_data = final_state['history'][-1]
        
        new_turn = Turn(
            turn_index=new_turn_data['turn_index'],
            stakeholder_id=new_turn_data['stakeholder_id'],
            stakeholder_name=new_turn_data['stakeholder_name'],
            role=new_turn_data['role'],
            content=new_turn_data['content'],
            internal_reasoning=new_turn_data.get('internal_reasoning', ''),
            action_type=new_turn_data['action_type'],
            directed_at=new_turn_data.get('directed_at'),
            coalition_with=new_turn_data.get('coalition_with'),
            emotional_tone=new_turn_data.get('emotional_tone', 'neutral')
        )
        
        state.turns.append(new_turn)
        state.active_speaker_id = new_turn.stakeholder_id
        
        state.heatmap.commercial_gain = final_state['heatmap']['commercial_gain']
        state.heatmap.tech_integrity = final_state['heatmap']['tech_integrity']
        state.heatmap.legal_safety = final_state['heatmap']['legal_safety']
        
        state.event_log.extend(final_state.get('event_log', []))
        
        content_lower = new_turn.content.lower()
        if any(kw in content_lower for kw in ['agree', 'support', 'align', 'compromise']):
            sentiment_val = 0.3 + (new_turn.turn_index % 3) * 0.1
        elif any(kw in content_lower for kw in ['concern', 'risk', 'cannot', 'blocked']):
            sentiment_val = -0.4 - (new_turn.turn_index % 3) * 0.1
        else:
            sentiment_val = 0.0
        
        state.sentiment.append(max(-1.0, min(1.0, sentiment_val)))
        
        if new_turn.action_type in ['statement', 'challenge', 'escalate']:
            from .models import ConflictPoint
            conflict_type = 'clash' if new_turn.action_type in ['challenge', 'escalate'] else 'neutral'
            state.conflict_timeline.append(
                ConflictPoint(
                    step=new_turn.turn_index,
                    label=f"{new_turn.stakeholder_name}: {new_turn.action_type}",
                    type=conflict_type
                )
            )
    
    checkpoint_manager.save_checkpoint(
        simulation_id=state.simulation_id,
        state=state,
        metadata={
            "turn_count": len(state.turns),
            "active_speaker": state.active_speaker_id,
            "status": state.status
        }
    )
    
    return state


async def stream_simulation_events(state: SimulationState) -> AsyncIterator[dict[str, Any]]:
    """
    Stream simulation events for SSE endpoint.
    
    Maintains compatibility with existing SSE format while using new workflow.
    """
    for _ in range(10):
        if state.status != "running":
            break
        
        state = await advance_turn(state)
        
        if not state.turns:
            break
        
        last_turn = state.turns[-1]
        
        yield {
            "type": "turn",
            "data": {
                "turn_index": last_turn.turn_index,
                "stakeholder_id": last_turn.stakeholder_id,
                "stakeholder_name": last_turn.stakeholder_name,
                "role": last_turn.role,
                "content": last_turn.content,
                "action_type": last_turn.action_type,
                "emotional_tone": last_turn.emotional_tone,
                "directed_at": last_turn.directed_at,
                "coalition_with": last_turn.coalition_with
            }
        }
        
        yield {
            "type": "heatmap",
            "data": {
                "commercial_gain": state.heatmap.commercial_gain,
                "tech_integrity": state.heatmap.tech_integrity,
                "legal_safety": state.heatmap.legal_safety
            }
        }
        
        from .llm import estimate_token_cost
        last_turn_tokens = len(last_turn.content.split()) * 1.3
        prompt_tokens = int(last_turn_tokens * 3)
        completion_tokens = int(last_turn_tokens)
        total_tokens = prompt_tokens + completion_tokens
        cost_usd = estimate_token_cost(total_tokens)
        
        yield {
            "type": "cost",
            "data": {
                "turn_index": last_turn.turn_index,
                "tokens": {
                    "prompt": prompt_tokens,
                    "completion": completion_tokens,
                    "total": total_tokens
                },
                "cost_usd": round(cost_usd, 6)
            }
        }
        
        await asyncio.sleep(0.5)
    
    state.status = "complete"
    
    yield {
        "type": "complete",
        "data": {
            "total_turns": len(state.turns),
            "final_heatmap": {
                "commercial_gain": state.heatmap.commercial_gain,
                "tech_integrity": state.heatmap.tech_integrity,
                "legal_safety": state.heatmap.legal_safety
            }
        }
    }


def run_simulation(state: SimulationState, max_turns: int | None = None) -> SimulationState:
    async def _run() -> SimulationState:
        limit = max_turns or config.MAX_TURNS
        next_state = state.model_copy(deep=True)
        next_state.status = "running"

        while len(next_state.turns) < limit and next_state.status == "running":
            next_state = await advance_turn(next_state)

        next_state.status = "complete"
        return next_state

    return asyncio.run(_run())
