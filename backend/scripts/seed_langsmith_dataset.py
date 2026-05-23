"""
Seed a LangSmith dataset from real boardroom simulation scenario seeds.

Usage:
  python scripts/seed_langsmith_dataset.py

Creates/updates dataset "boardroom-sim-regression".
Adds real scenarios, persona configs, and expected output structure
for reliability regression gating.

Evaluators this dataset enables:
  - JSON validity rate (AgentResponse schema)
  - fallback rate (degraded flag presence)
  - action_type validity (must be one of ActionType literals)
  - emotional_tone presence
"""
from __future__ import annotations

import json
import os
import sys

# Allow running from any directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    from langsmith import Client
    from langsmith import evaluate
except Exception as exc:
    raise SystemExit(f"LangSmith SDK unavailable: {exc}")

DATASET_NAME = "boardroom-sim-regression"

ACTION_TYPES = [
    "statement", "question", "challenge",
    "compromise", "coalition_signal", "interrupt", "escalate",
]

EMOTIONAL_TONES = ["tense", "neutral", "heated", "conciliatory"]


def _agent_turn_input(
    background: str,
    primary_goal: str,
    persona_name: str,
    persona_role: str,
    persona_focus: str,
    persona_incentive: int,
    hidden_agenda: str,
    voltage: int,
    history: list[dict],
) -> dict:
    """Inputs that mirror what BoardroomAgent.invoke sees."""
    return {
        "background": background,
        "primary_goal": primary_goal,
        "persona": {
            "name": persona_name,
            "role": persona_role,
            "focus": persona_focus,
            "incentive_tuning": persona_incentive,
            "hidden_agenda": hidden_agenda,
        },
        "voltage": voltage,
        "history": history,
    }


def _expected_agent_response(
    action_type: str = "statement",
    emotional_tone: str = "neutral",
) -> dict:
    """Minimal expected output schema — used for structural eval."""
    return {
        "content": "__non_empty_string__",
        "internal_reasoning": "__non_empty_string__",
        "action_type": action_type,
        "emotional_tone": emotional_tone,
        "interrupt_bid": 0.0,
        "position_delta": {},
        "leverage_delta": {},
        "tool_calls": [],
    }


EXAMPLES = [
    # ── Scenario 1: Partnership negotiation opening (Jordan Kim, low heat) ──
    {
        "name": "partnership_opening_ceo",
        "description": "CEO opens partnership negotiation - expects statement, neutral tone",
        "inputs": _agent_turn_input(
            background=(
                "Startup–enterprise partnership negotiation. The startup prioritizes "
                "distribution, co-brand go-to-market velocity, and capital efficiency. "
                "The counterparty is a risk-averse telecom enterprise."
            ),
            primary_goal=(
                "Close a pragmatic partnership term sheet balancing distribution "
                "scale with workable exclusivity boundaries."
            ),
            persona_name="Jordan Kim",
            persona_role="Startup Founder & CEO",
            persona_focus="distribution reach, velocity to market, co-brand value, runway preservation",
            persona_incentive=62,
            hidden_agenda="Avoid exclusivity traps that cap later channels.",
            voltage=50,
            history=[],
        ),
        "outputs": _expected_agent_response("statement", "neutral"),
    },

    # ── Scenario 2: CFO challenge on ROI (Marcus Bale, high incentive) ──
    {
        "name": "partnership_cfo_challenge",
        "description": "Skeptical CFO challenges ROI - expects challenge, tense tone",
        "inputs": _agent_turn_input(
            background=(
                "Startup–enterprise partnership negotiation. The startup prioritizes "
                "distribution reach. The enterprise CFO is evaluating ROI path and "
                "clawback risk."
            ),
            primary_goal="Close a pragmatic partnership term sheet.",
            persona_name="Marcus Bale",
            persona_role="Telecom CFO / Commercial Finance",
            persona_focus="ROI path, capex-lite structures, breakage risk from startups, clawbacks",
            persona_incentive=76,
            hidden_agenda="Modeling churn if API pricing dips post-launch.",
            voltage=72,
            history=[
                {
                    "stakeholder_name": "Jordan Kim",
                    "role": "Startup Founder & CEO",
                    "content": "We're proposing a 70/30 revenue share on net receipts with a "
                                "12-month pilot gate before any exclusivity kicks in.",
                    "action_type": "statement",
                },
            ],
        ),
        "outputs": _expected_agent_response("challenge", "tense"),
    },

    # ── Scenario 3: Legal counsel compliance block (Olivia Reyes) ──
    {
        "name": "partnership_counsel_compliance",
        "description": "Counsel raises compliance objection - expects escalate or challenge",
        "inputs": _agent_turn_input(
            background=(
                "Partnership negotiation reaching data ownership and compliance terms. "
                "Chief Counsel must protect against SOC2 and GDPR exposure."
            ),
            primary_goal="Resolve compliance clauses and data ownership boundaries.",
            persona_name="Olivia Reyes",
            persona_role="Chief Counsel & Compliance",
            persona_focus="data ownership, SLA breach remedies, portability, SOC2 + regional privacy overlays",
            persona_incentive=82,
            hidden_agenda="Seeking carve-outs that create negotiating leverage downstream.",
            voltage=80,
            history=[
                {
                    "stakeholder_name": "Jordan Kim",
                    "role": "CEO",
                    "content": "We can commit to SOC2 Type II by Q3.",
                    "action_type": "statement",
                },
                {
                    "stakeholder_name": "Marcus Bale",
                    "role": "CFO",
                    "content": "I need hard revenue guarantees before we agree to any compliance timeline.",
                    "action_type": "challenge",
                },
            ],
        ),
        "outputs": _expected_agent_response("escalate", "tense"),
    },

    # ── Scenario 4: Coalition signal between CEO + Corp Dev VP ──
    {
        "name": "coalition_ceo_corpdvp",
        "description": "CEO signals coalition with Corp Dev VP on phased rollout",
        "inputs": _agent_turn_input(
            background=(
                "Partnership negotiation mid-session. CEO and Corp Dev VP have found "
                "common ground on phased rollout timeline despite CFO resistance."
            ),
            primary_goal="Close partnership term sheet with phased rollout agreement.",
            persona_name="Jordan Kim",
            persona_role="Startup Founder & CEO",
            persona_focus="distribution reach, velocity, runway preservation",
            persona_incentive=62,
            hidden_agenda="Avoid exclusivity traps that cap later channels.",
            voltage=55,
            history=[
                {
                    "stakeholder_name": "Priya Kapoor",
                    "role": "Corp Dev VP",
                    "content": "A phased 6-month pilot with clear success metrics could address "
                               "both our concerns.",
                    "action_type": "compromise",
                },
                {
                    "stakeholder_name": "Marcus Bale",
                    "role": "CFO",
                    "content": "I still need revenue guarantees before any pilot starts.",
                    "action_type": "challenge",
                },
            ],
        ),
        "outputs": _expected_agent_response("coalition_signal", "conciliatory"),
    },

    # ── Scenario 5: Crisis response (high voltage) ──
    {
        "name": "crisis_response_opening",
        "description": "Crisis CEO opens incident response - expects statement, tense tone",
        "inputs": _agent_turn_input(
            background=(
                "A major data incident has become public. Media is calling. "
                "Regulatory bodies notified. Leadership must align on response "
                "strategy and public statement within the hour."
            ),
            primary_goal=(
                "Produce a coordinated, legally defensible public response and "
                "internal action plan within the session."
            ),
            persona_name="Alex Morgan",
            persona_role="CEO",
            persona_focus="stakeholder trust, business continuity, reputational recovery",
            persona_incentive=85,
            hidden_agenda="Prevent board from calling emergency shareholder meeting.",
            voltage=90,
            history=[],
        ),
        "outputs": _expected_agent_response("statement", "tense"),
    },

    # ── Scenario 6: Investor meeting objection ──
    {
        "name": "investor_associate_objection",
        "description": "VC associate probes unit economics - expects challenge",
        "inputs": _agent_turn_input(
            background=(
                "Series A pitch meeting. Founder presenting to full VC partnership. "
                "The associate is tasked with finding deal-breakers."
            ),
            primary_goal=(
                "Secure a term sheet commitment or clear next-step by end of meeting."
            ),
            persona_name="Sarah Chen",
            persona_role="VC Associate",
            persona_focus="unit economics, churn, CAC/LTV, burn multiple",
            persona_incentive=70,
            hidden_agenda="Authored internal memo recommending pass on this sector.",
            voltage=60,
            history=[
                {
                    "stakeholder_name": "Founder",
                    "role": "CEO",
                    "content": "Our NRR is 118% and CAC payback is 14 months.",
                    "action_type": "statement",
                },
            ],
        ),
        "outputs": _expected_agent_response("challenge", "neutral"),
    },

    # ── Scenario 7: Compromise on contract terms ──
    {
        "name": "legal_compromise_liability",
        "description": "Counsel offers compromise on liability cap - expects compromise",
        "inputs": _agent_turn_input(
            background=(
                "Final-stage contract negotiation. Both sides have hard deadlines. "
                "Liability cap is the last unresolved issue."
            ),
            primary_goal=(
                "Resolve all open legal issues and reach executable contract language."
            ),
            persona_name="Adetola Bankole",
            persona_role="Compliance Officer",
            persona_focus="Data residency, indemnity, regulatory exposure",
            persona_incentive=72,
            hidden_agenda="Looking for a reason to veto Section 8.4 (data export).",
            voltage=75,
            history=[
                {
                    "stakeholder_name": "Sara Lindqvist",
                    "role": "Procurement Strategist",
                    "content": "We need the liability cap set at 2x annual contract value.",
                    "action_type": "challenge",
                },
                {
                    "stakeholder_name": "Adetola Bankole",
                    "role": "Compliance Officer",
                    "content": "Our standard is 1x. We cannot exceed that without board sign-off.",
                    "action_type": "statement",
                },
            ],
        ),
        "outputs": _expected_agent_response("compromise", "conciliatory"),
    },
]


def main() -> None:
    client = Client()

    # Find or create the dataset
    existing = list(client.list_datasets(dataset_name=DATASET_NAME))
    if existing:
        dataset = existing[0]
        print(f"Found existing dataset '{DATASET_NAME}' (id={dataset.id})")
        # Delete old examples so we don't accumulate duplicates on re-run
        old_examples = list(client.list_examples(dataset_id=dataset.id))
        for ex in old_examples:
            client.delete_example(ex.id)
        print(f"  Cleared {len(old_examples)} old example(s)")
    else:
        dataset = client.create_dataset(
            dataset_name=DATASET_NAME,
            description=(
                "Regression set for boardroom simulator reliability. "
                "Covers: parse validity, action_type correctness, fallback rate, "
                "emotional tone presence. 7 real scenario examples."
            ),
        )
        print(f"Created dataset '{DATASET_NAME}' (id={dataset.id})")

    # Seed examples
    created = 0
    for ex in EXAMPLES:
        try:
            client.create_example(
                dataset_id=dataset.id,
                inputs=ex["inputs"],
                outputs=ex["outputs"],
                metadata={"name": ex["name"], "description": ex["description"]},
            )
            created += 1
            print(f"  ✓ {ex['name']}")
        except Exception as e:
            print(f"  ✗ {ex['name']}: {e}")

    print(f"\nSeeded {created}/{len(EXAMPLES)} examples into '{DATASET_NAME}'")
    print(f"View at: https://smith.langchain.com/o/6eb897e2-f15e-4a6b-bf9f-6c44d0e37d64")


if __name__ == "__main__":
    main()
