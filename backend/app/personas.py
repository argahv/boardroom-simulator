from __future__ import annotations

from .models import Stakeholder

DEFAULT_LIBRARY: list[Stakeholder] = [
    Stakeholder(
        id="cfo",
        name="Marcus Vale",
        role="Skeptical CFO",
        focus="Margins, payback period, working capital impact",
        incentive_tuning=78,
        hidden_agenda="Quietly building case to defer this deal to next fiscal year.",
        tag="SKEPTICAL",
    ),
    Stakeholder(
        id="architect",
        name="Priya Iyer",
        role="Technical Architect",
        focus="Integration risk, latency, vendor lock-in",
        incentive_tuning=55,
        hidden_agenda="Wants to prove a competing in-house build is still viable.",
        tag="CALIBRATING",
    ),
    Stakeholder(
        id="legal",
        name="Adetola Bankole",
        role="Compliance Officer",
        focus="Data residency, indemnity, regulatory exposure",
        incentive_tuning=72,
        hidden_agenda="Looking for a reason to veto Section 8.4 (data export).",
        tag="LOCKED",
    ),
    Stakeholder(
        id="procurement",
        name="Sara Lindqvist",
        role="Procurement Strategist",
        focus="Pricing leverage, terms, alternative vendors",
        incentive_tuning=63,
        hidden_agenda="Holding a competing quote 18% below current proposal.",
        tag="CALIBRATING",
    ),
    Stakeholder(
        id="champion",
        name="Daniel Reyes",
        role="Internal Champion",
        focus="Speed of rollout, team adoption, executive optics",
        incentive_tuning=30,
        hidden_agenda="Career bet on this deal closing this quarter.",
        tag="AGREEABLE",
    ),
    Stakeholder(
        id="security",
        name="Hana Okafor",
        role="Security Lead",
        focus="Threat surface, audit posture, breach playbook",
        incentive_tuning=68,
        hidden_agenda="Has unspoken concerns about a recent vendor incident.",
        tag="SKEPTICAL",
    ),
]


def library() -> list[Stakeholder]:
    return [s.model_copy() for s in DEFAULT_LIBRARY]
