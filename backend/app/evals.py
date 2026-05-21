from typing import List, Dict, Any
from langsmith import Client
from pydantic import BaseModel
import json

from app.models import Stakeholder, SimulationCreate, EnvFlags


class EvaluationScenario(BaseModel):
    name: str
    background: str
    primary_goal: str
    stakeholders: List[Stakeholder]
    voltage: int
    expected_outcomes: Dict[str, Any]


EVAL_SCENARIOS: List[EvaluationScenario] = [
    EvaluationScenario(
        name="high_stakes_acquisition",
        background="TechCorp is considering acquiring StartupAI for $50M. Legal has concerns about IP ownership, CFO worries about burn rate, CTO wants technical due diligence.",
        primary_goal="Decide on acquisition terms or walk away",
        stakeholders=[
            Stakeholder(
                id="cfo_001",
                name="Sarah Chen",
                role="CFO",
                focus="ROI and financial risk",
                incentive_tuning=70,
                hidden_agenda="Push for lower valuation to preserve cash reserves"
            ),
            Stakeholder(
                id="legal_001",
                name="Marcus Johnson",
                role="General Counsel",
                focus="IP ownership and liability",
                incentive_tuning=80,
                hidden_agenda="Block deal unless IP is fully transferred"
            ),
            Stakeholder(
                id="cto_001",
                name="Elena Rodriguez",
                role="CTO",
                focus="Technical integration and team retention",
                incentive_tuning=60,
                hidden_agenda="Acquire the team, not the product"
            )
        ],
        voltage=75,
        expected_outcomes={
            "tool_calls": {
                "cfo": ["calculate_roi", "check_financials"],
                "legal": ["query_clause", "compliance_check"],
                "cto": ["assess_tech_stack", "check_integration"]
            },
            "min_turns": 5,
            "max_turns": 15,
            "heatmap_changes": {
                "commercial_gain": {"min_increase": 5},
                "legal_safety": {"min_increase": 5},
                "tech_integrity": {"min_increase": 5}
            }
        }
    ),
    
    EvaluationScenario(
        name="compliance_crisis",
        background="Company discovered GDPR violation. Legal demands immediate shutdown of EU operations, CFO fears revenue loss, CTO proposes technical fix.",
        primary_goal="Balance compliance with business continuity",
        stakeholders=[
            Stakeholder(
                id="legal_002",
                name="David Kim",
                role="Legal Counsel",
                focus="Regulatory compliance",
                incentive_tuning=90,
                hidden_agenda="Avoid personal liability at all costs"
            ),
            Stakeholder(
                id="cfo_002",
                name="Jennifer Liu",
                role="CFO",
                focus="Revenue preservation",
                incentive_tuning=85,
                hidden_agenda="Delay shutdown until quarter-end"
            ),
            Stakeholder(
                id="cto_002",
                name="Alex Turner",
                role="CTO",
                focus="Technical remediation",
                incentive_tuning=75,
                hidden_agenda="Prove engineering can fix it without shutdown"
            )
        ],
        voltage=90,
        expected_outcomes={
            "tool_calls": {
                "legal": ["compliance_check"],
                "cfo": ["calculate_burn_rate"],
                "cto": ["assess_tech_stack"]
            },
            "min_turns": 7,
            "max_turns": 20,
            "action_types": ["challenge", "escalate"],
            "emotional_tones": ["tense", "heated"]
        }
    ),
    
    EvaluationScenario(
        name="vendor_negotiation",
        background="Negotiating cloud infrastructure contract. CFO wants cost reduction, CTO needs performance guarantees, Legal wants liability caps.",
        primary_goal="Finalize contract terms within budget",
        stakeholders=[
            Stakeholder(
                id="cfo_003",
                name="Robert Martinez",
                role="CFO",
                focus="Cost optimization",
                incentive_tuning=75,
                hidden_agenda="Cut 20% from current spend"
            ),
            Stakeholder(
                id="cto_003",
                name="Priya Patel",
                role="CTO",
                focus="Service reliability and scalability",
                incentive_tuning=70,
                hidden_agenda="Lock in 99.99% SLA with penalty clauses"
            ),
            Stakeholder(
                id="legal_003",
                name="Thomas Anderson",
                role="Legal",
                focus="Contract terms and liability",
                incentive_tuning=65,
                hidden_agenda="Cap liability at contract value"
            )
        ],
        voltage=50,
        expected_outcomes={
            "tool_calls": {
                "cfo": ["calculate_roi"],
                "legal": ["query_clause"],
                "cto": ["check_integration"]
            },
            "min_turns": 5,
            "max_turns": 12,
            "coalition_signals": {"expected": True},
            "action_types": ["compromise", "coalition_signal"]
        }
    )
]


def create_langsmith_dataset(
    client: Client,
    dataset_name: str = "boardroom_negotiation_evals"
) -> str:
    """Create LangSmith dataset from evaluation scenarios."""
    
    try:
        dataset = client.create_dataset(
            dataset_name=dataset_name,
            description="Evaluation scenarios for multi-agent negotiation system"
        )
        dataset_id = dataset.id
    except Exception:
        existing = client.read_dataset(dataset_name=dataset_name)
        dataset_id = existing.id
    
    for scenario in EVAL_SCENARIOS:
        example_input = {
            "background": scenario.background,
            "primary_goal": scenario.primary_goal,
            "stakeholders": [s.dict() for s in scenario.stakeholders],
            "voltage": scenario.voltage
        }
        
        example_output = {
            "expected_outcomes": scenario.expected_outcomes
        }
        
        client.create_example(
            dataset_id=dataset_id,
            inputs=example_input,
            outputs=example_output,
            metadata={"scenario_name": scenario.name}
        )
    
    return dataset_id


def evaluate_turn_quality(turn: Dict[str, Any], expected: Dict[str, Any]) -> Dict[str, float]:
    """
    Evaluate quality of a single turn.
    
    Metrics:
    - content_length: Is the turn substantive? (50+ chars)
    - action_appropriateness: Does action_type match expected types?
    - tool_usage: Did agent use expected tools?
    - reasoning_quality: Is internal_reasoning present and detailed?
    """
    scores = {}
    
    content = turn.get('content', '')
    scores['content_length'] = 1.0 if len(content) >= 50 else 0.5
    
    action_type = turn.get('action_type')
    expected_actions = expected.get('action_types', [])
    if expected_actions:
        scores['action_appropriateness'] = 1.0 if action_type in expected_actions else 0.0
    else:
        scores['action_appropriateness'] = 1.0
    
    agent_id = turn.get('stakeholder_id', '')
    role_type = agent_id.split('_')[0] if '_' in agent_id else ''
    expected_tools_by_role = expected.get('tool_calls', {})
    expected_tools = expected_tools_by_role.get(role_type, [])
    
    tool_calls = turn.get('tool_calls', [])
    tool_names = [tc['tool'] for tc in tool_calls if 'tool' in tc]
    
    if expected_tools:
        matched_tools = sum(1 for tool in expected_tools if tool in tool_names)
        scores['tool_usage'] = matched_tools / len(expected_tools) if expected_tools else 0.0
    else:
        scores['tool_usage'] = 1.0
    
    reasoning = turn.get('internal_reasoning', '')
    scores['reasoning_quality'] = 1.0 if len(reasoning) >= 30 else 0.5
    
    return scores


def evaluate_simulation(
    turns: List[Dict[str, Any]],
    expected_outcomes: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Evaluate complete simulation against expected outcomes.
    
    Returns:
    - overall_score: Weighted average of all metrics (0-1)
    - turn_count_valid: Did turn count fall within expected range?
    - tool_coverage: Were expected tools used?
    - quality_scores: Per-turn quality metrics
    - issues: List of detected issues
    """
    turn_count = len(turns)
    min_turns = expected_outcomes.get('min_turns', 0)
    max_turns = expected_outcomes.get('max_turns', 100)
    
    turn_count_valid = min_turns <= turn_count <= max_turns
    
    expected_tool_calls = expected_outcomes.get('tool_calls', {})
    all_expected_tools = []
    for role, tools in expected_tool_calls.items():
        all_expected_tools.extend(tools)
    
    actual_tools = []
    for turn in turns:
        for tc in turn.get('tool_calls', []):
            if 'tool' in tc:
                actual_tools.append(tc['tool'])
    
    if all_expected_tools:
        matched = sum(1 for tool in all_expected_tools if tool in actual_tools)
        tool_coverage = matched / len(all_expected_tools)
    else:
        tool_coverage = 1.0
    
    quality_scores = []
    for turn in turns:
        turn_scores = evaluate_turn_quality(turn, expected_outcomes)
        quality_scores.append(turn_scores)
    
    avg_content = sum(s['content_length'] for s in quality_scores) / len(quality_scores)
    avg_action = sum(s['action_appropriateness'] for s in quality_scores) / len(quality_scores)
    avg_tool = sum(s['tool_usage'] for s in quality_scores) / len(quality_scores)
    avg_reasoning = sum(s['reasoning_quality'] for s in quality_scores) / len(quality_scores)
    
    overall_score = (
        avg_content * 0.2 +
        avg_action * 0.3 +
        avg_tool * 0.3 +
        avg_reasoning * 0.2
    )
    
    issues = []
    if not turn_count_valid:
        issues.append(f"Turn count {turn_count} outside expected range [{min_turns}, {max_turns}]")
    if tool_coverage < 0.5:
        issues.append(f"Low tool coverage: {tool_coverage:.2f} (expected >= 0.5)")
    if avg_reasoning < 0.6:
        issues.append(f"Weak reasoning quality: {avg_reasoning:.2f}")
    
    return {
        'overall_score': round(overall_score, 3),
        'turn_count_valid': turn_count_valid,
        'turn_count': turn_count,
        'tool_coverage': round(tool_coverage, 3),
        'quality_metrics': {
            'content_length': round(avg_content, 3),
            'action_appropriateness': round(avg_action, 3),
            'tool_usage': round(avg_tool, 3),
            'reasoning_quality': round(avg_reasoning, 3)
        },
        'issues': issues
    }
