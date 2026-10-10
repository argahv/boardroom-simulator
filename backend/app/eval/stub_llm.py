"""Offline stand-in LLMs for exercising the evaluation pipeline without an API key.

``StubLLM`` produces persona-shaped (archetype-driven) turns so metrics and
expectations have realistic structure to work on. It is NOT a quality signal:
judge scores and rhetorical metrics on stub runs are meaningless. Use it to
test the harness, then run the same scenarios with ``--llm openrouter``.
"""

from __future__ import annotations

import json
import random
import re
import zlib

from app.models import SimulationConfig
from app.runtime.archetypes import ARCHETYPES

_DEFAULT_TENDENCIES = {"statement": 0.35, "question": 0.2, "challenge": 0.25, "compromise": 0.2}

_TEMPLATES = {
    "statement": "{target}, my position on {subject} stands: the numbers in front of us favour {side}.",
    "question": "{target}, what evidence do you actually have that {subject} will work as promised?",
    "challenge": "{target}, that argument collapses under scrutiny — the risks in {subject} are being ignored.",
    "compromise": "{target}, I'm willing to meet you halfway on {subject} if we phase it and cap the exposure.",
    "coalition_signal": "{target}, you and I want the same safeguards on {subject}; let's push for them together.",
    "interrupt": "Hold on, {target} — before you go further, that claim about {subject} is simply wrong.",
    "escalate": "{target}, this is unacceptable. If {subject} goes ahead like this I'll take it to the board.",
    "agreement": "{target}, I agree with that point on {subject}.",
    "walkaway": "I'm done here. Without real movement on {subject} I'm walking out.",
    "vote": "On {subject}, I vote {vote}.",
}


class StubLLM:
    def __init__(self, config: SimulationConfig, seed: int = 0) -> None:
        self.config = config
        self.rng = random.Random(seed)
        self.by_id = {s.id: s for s in config.stakeholders}

    async def __call__(self, messages, temperature=0.6, simulation_id=None, turn_index=None,
                       agent_id=None, model=None):
        last = messages[-1]["content"] if messages else ""
        agent = self.by_id.get(agent_id or "")
        if "Return ONLY a number" in last:
            aggr = agent.personality.aggressiveness if agent else 50
            score = int(25 + aggr * 0.5 + self.rng.randint(-10, 10))
            return str(max(0, min(100, score))), True, {"token_count": 60, "latency_ms": 5}
        if agent is None:
            return json.dumps({"content": "Noted.", "action_type": "statement"}), True, {"token_count": 50}
        return json.dumps(self._turn(agent, messages)), True, {"token_count": 220, "latency_ms": 20}

    def _turn(self, agent, messages) -> dict:
        system = messages[0]["content"] if messages else ""
        last = messages[-1]["content"] if messages else ""
        allowed = re.search(r'"action_type": "([^"]+)"', last)
        allowed_set = set(allowed.group(1).split("|")) if allowed else set(_DEFAULT_TENDENCIES)
        arch = ARCHETYPES.get((agent.archetype or "").lower())
        weights = dict(arch.tendencies) if arch else dict(_DEFAULT_TENDENCIES)
        # Emotional hints in the prompt bias the choice, as they should for a real model.
        if "urge to INTERRUPT" in system or "inclined to CHALLENGE" in system:
            weights["challenge"] = weights.get("challenge", 0) + 0.3
        if "inclined to COMPROMISE" in system or "rebuild trust" in system or "deescalate" in system:
            weights["compromise"] = weights.get("compromise", 0) + 0.3
        if "seek ALLIANCES" in system:
            weights["coalition_signal"] = weights.get("coalition_signal", 0) + 0.3
        vote_now = "cast your vote now" in system
        if vote_now:
            weights = {"vote": 1.0}
        weights = {a: w for a, w in weights.items() if a in allowed_set and w > 0}
        if not weights:
            weights = {"statement": 1.0}
        action = self.rng.choices(list(weights), weights=list(weights.values()), k=1)[0]

        others = [s for s in self.config.stakeholders if s.id != agent.id and s.name in last]
        addresser = self._addressed_by(agent, messages)
        if addresser is not None and action not in ("vote", "walkaway"):
            pool = [addresser]
        elif action in ("compromise", "coalition_signal", "agreement"):
            pool = [s for s in others if s.stance == agent.stance] or others
        else:
            pool = [s for s in others if s.stance != agent.stance] or others
        target = self.rng.choice(pool) if pool else None
        if addresser is not None and action not in ("vote", "walkaway"):
            target = addresser
        vote = "yes" if agent.stance in ("champion", "neutral", "moderator") else "no"
        side = "moving ahead" if agent.stance == "champion" else "holding back"
        content = _TEMPLATES.get(action, _TEMPLATES["statement"]).format(
            target=target.name if target else "Everyone", subject=self.config.subject.name, side=side, vote=vote)
        out = {"content": content, "action_type": action,
               "directed_at": target.name if target and action not in ("vote", "walkaway") else None,
               "internal_reasoning": f"As a {agent.stance}, {action} serves my goals right now."}
        if action == "vote":
            out["vote"] = vote
        return out


def _addressed_by(self, agent, messages):
    """If the latest transcript line is aimed at this agent, return its speaker."""
    for m in reversed(messages[1:-1]):
        line = m.get("content", "")
        match = re.match(r"\[([^\]→]+?)(?: → ([^\]]+))?\]", line)
        if not match:
            continue
        speaker, target = match.group(1).strip(), (match.group(2) or "").strip()
        if target == agent.name:
            return next((s for s in self.config.stakeholders if s.name == speaker), None)
        return None
    return None


StubLLM._addressed_by = _addressed_by


async def stub_judge(messages, temperature=0.0, simulation_id=None, model=None, **_):
    """Deterministic judge for pipeline tests: scores derive from a hash of the prompt."""
    payload = messages[-1]["content"]
    h = zlib.crc32(payload.encode())
    if '"transcript"' in payload:
        dims = ["outcome_believability", "rhetorical_quality", "voice_diversity", "dynamics_realism", "injection_handling"]
        return json.dumps({"scores": {d: 2 + (h >> i) % 4 for i, d in enumerate(dims)},
                           "artificial_consensus": False, "notes": "stub"}), True, {}
    dims = ["persona_fit", "emotion_fit", "plan_fit", "action_text_match", "target_match",
            "memory_consistency", "public_private_consistency", "rhetorical_quality"]
    return json.dumps({"scores": {d: 2 + (h >> i) % 4 for i, d in enumerate(dims)},
                       "agenda_leak": False, "notes": "stub"}), True, {}
