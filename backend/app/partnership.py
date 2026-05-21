from __future__ import annotations

"""
Default personas for the partnership-negotiation scenario (startup <> enterprise telecom-style counterparty).
Mirrors stakeholder tension from docs & UI mockups; tune copy without changing IDs used by persisted sims.
"""

from .models import SimulationCreate, Stakeholder


PARTNERSHIP_BLUEPRINT = (
    "Scenario: Startup–enterprise partnership negotiation. "
    "The startup prioritizes distribution, co-brand go-to-market velocity, "
    "and capital efficiency under a constrained budget. The counterparty behaves like a risk-averse "
    "telecom/global tech enterprise: favors exclusivity, compliance-heavy contractual posture, "
    "and prefers revenue-aligned economics over flat fees alone."
)


def default_stakeholders() -> list[Stakeholder]:
    return [
        Stakeholder(
            id="startup_ceo",
            name="Jordan Kim",
            role="Startup Founder & CEO",
            focus="distribution reach, velocity to market, co-brand value, runway preservation",
            incentive_tuning=62,
            hidden_agenda="Avoid exclusivity traps that cap later channels; anchor on landmark logo win.",
            tag="VISIONARY",
        ),
        Stakeholder(
            id="corp_dev_vp",
            name="Priya Kapoor",
            role="Corp Dev VP (Counterparty)",
            focus="risk posture, reputational optics with regulators, phased rollout readiness",
            incentive_tuning=58,
            hidden_agenda="Internal pressure to show a marquee AI partnership before fiscal year-end.",
            tag="CALIBRATING",
        ),
        Stakeholder(
            id="telecom_cfo",
            name="Marcus Bale",
            role="Telecom CFO / Commercial Finance",
            focus="ROI path, capex-lite structures, breakage risk from startups, clawbacks",
            incentive_tuning=76,
            hidden_agenda="Modeling churn if API pricing dips post-launch.",
            tag="SKEPTICAL",
        ),
        Stakeholder(
            id="telecom_counsel",
            name="Olivia Reyes",
            role="Chief Counsel & Compliance",
            focus="data ownership, SLA breach remedies, portability, SOC2 + regional privacy overlays",
            incentive_tuning=82,
            hidden_agenda="Seeking carve-outs that create negotiating leverage downstream.",
            tag="LOCKED",
        ),
    ]


def default_create() -> SimulationCreate:
    return SimulationCreate(
        background=(
            PARTNERSHIP_BLUEPRINT
            + " Agenda: distribution scope, exclusivity & carve-outs, revenue share mechanics, compliance pack."
        ),
        primary_goal=(
            "Close a pragmatic partnership term sheet balancing distribution scale with workable "
            "exclusivity boundaries and sane compliance obligations."
        ),
        stakeholders=default_stakeholders(),
        voltage=72,
        model_temperature="volatile",
    )
