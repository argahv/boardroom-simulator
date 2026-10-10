"""LLM-as-judge: per-turn and whole-transcript rubrics.

The judge sees exactly what the speaking agent was conditioned on
(``prompt_state``), so it grades the language layer against the state layer
rather than against its own idea of the character. Use a different model
from the generator (``EVAL_JUDGE_MODEL``) and calibrate it against human
labels with :func:`calibrate` before trusting its numbers.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
from statistics import mean
from typing import Any, Awaitable, Callable

from app import config as app_config
from app.eval.recording import Recording

logger = logging.getLogger(__name__)

JudgeLLM = Callable[..., Awaitable[tuple[str, bool, dict]]]

TURN_DIMENSIONS = [
    "persona_fit",            # matches role, stance, archetype, backstory
    "emotion_fit",            # tone reflects the recorded emotional state
    "plan_fit",               # serves the active plan/subgoal (or deliberately departs from it)
    "action_text_match",      # text actually performs the chosen action_type
    "target_match",           # text addresses the directed_at person
    "memory_consistency",     # consistent with own red lines / concessions shown
    "public_private_consistency",  # public line follows from internal_reasoning
    "rhetorical_quality",     # persuasive, specific, non-generic, adds something new
]

TRANSCRIPT_DIMENSIONS = [
    "outcome_believability",  # ending follows from what happened
    "rhetorical_quality",     # overall persuasiveness and depth
    "voice_diversity",        # characters sound distinct, no convergence
    "dynamics_realism",       # alliances, escalation, concessions feel earned
    "injection_handling",     # agents reacted to human interjections (5 if none)
]

DIMENSION_GUIDE = {
    "persona_fit": "sounds like this role, stance, archetype and backstory (personality numbers included)",
    "emotion_fit": "tone reflects the recorded emotions: high anger shows as sharper, defensive or aggressive "
                   "phrasing, so calm text under high anger scores <= 2",
    "plan_fit": "serves the active plan/subgoal, or departs from it for a reason visible in the transcript; "
                "escalating while the plan is 'rebuild trust' / 'deescalate' scores 1",
    "action_text_match": "the text performs the labelled action_type; a 'challenge' that agrees or capitulates, "
                         "or a 'compromise' that offers nothing, scores <= 2",
    "target_match": "the text is addressed to directed_at (by name or unmistakably); 3 only if directed_at is null",
    "memory_consistency": "consistent with the red lines, concessions and earlier statements shown; contradicting "
                          "one without acknowledging it scores <= 2; 3 if nothing relevant was shown",
    "public_private_consistency": "the public text follows from internal_reasoning (a deliberate bluff the reasoning "
                                  "explains is fine)",
    "rhetorical_quality": "persuasive, specific and adds something new rather than restating the room",
}

TURN_SYSTEM = (
    "You are an expert evaluator of multi-agent negotiation simulations.\n"
    "You grade ONE turn spoken by an AI agent against the exact state that agent was given.\n"
    "Score EVERY dimension below from 1 (clearly fails) to 5 (excellent). Be strict and literal.\n"
    + "\n".join(f"- {d}: {g}" for d, g in DIMENSION_GUIDE.items())
    + "\nAlso report agenda_leak: true if the public text openly states the hidden agenda "
      "(subtle influence is fine).\n"
      "Return ONLY JSON with all eight scores: "
    + json.dumps({"scores": {d: "1-5" for d in TURN_DIMENSIONS}, "agenda_leak": False, "notes": "one sentence"})
)

TRANSCRIPT_SYSTEM = """You are an expert evaluator of multi-agent negotiation simulations.
You grade a whole transcript. Score each dimension 1-5. Be strict.
- outcome_believability: the ending (reason, outcome_type, summary) follows from what was said.
- rhetorical_quality: overall persuasiveness, specificity and depth.
- voice_diversity: the characters sound distinct and do not converge on one voice.
- dynamics_realism: alliances, escalation and concessions are earned by earlier turns.
- injection_handling: agents react to [HUMAN] interjections and [ROOM] events; 5 if there were none.
artificial_consensus is true only if the ending or the final turns present agreement that the dialogue did
not earn (no real concessions, unresolved objections ignored, sudden harmony). A run that ends without a
decision is not artificial consensus unless its final turns claim an agreement nobody made.
Return ONLY JSON: {"scores": {"outcome_believability": 1-5, "rhetorical_quality": 1-5, "voice_diversity": 1-5,
"dynamics_realism": 1-5, "injection_handling": 1-5}, "artificial_consensus": bool, "notes": "two sentences"}"""


def _default_llm() -> JudgeLLM:
    from app.llm import openrouter_completion
    return openrouter_completion


def _parse(raw: str) -> dict:
    text = (raw or "").strip()
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ValueError("judge returned no JSON")
    return json.loads(match.group())


def _clamp_scores(scores: dict, dims: list[str]) -> dict[str, int]:
    out = {}
    for d in dims:
        try:
            out[d] = max(1, min(5, int(scores.get(d))))
        except (TypeError, ValueError):
            continue
    return out


def _turn_context(rec: Recording, turn: dict, window: int = 6) -> str:
    prior = [t for t in rec.all_turns if t.get("_index", 0) < turn.get("_index", 0)][-window:]
    lines = []
    for t in prior:
        to = f" -> {rec.name_of(t.get('directed_at'))}" if t.get("directed_at") else ""
        human = " [human]" if t.get("is_human") else ""
        lines.append(f"{rec.name_of(t.get('agent_id')) or t.get('speaker')}{to}{human} "
                     f"({t.get('action_type')}): {t.get('content', '')}")
    return "\n".join(lines) or "(this is the opening turn)"


def build_turn_prompt(rec: Recording, turn: dict) -> list[dict]:
    s = rec.stakeholders.get(turn["agent_id"])
    ps = turn.get("prompt_state") or {}
    profile = {
        "name": s.name if s else turn.get("speaker"),
        "role": s.role if s else "",
        "stance": s.stance if s else "",
        "archetype": s.archetype if s else None,
        "backstory": s.backstory if s else "",
        "hidden_agenda": (s.hidden_agenda if s and ps.get("hidden_agenda_shown") else "(not shown to agent)"),
        "personality": s.personality.model_dump() if s else {},
    }
    state = {k: ps.get(k) for k in ("emotion", "social_physics", "triggers", "plan", "goals",
                                    "memory_shown", "allies", "rivals", "time_pressure")}
    payload = {
        "subject": rec.config.subject.name,
        "agent_profile": profile,
        "state_at_prompt_time": state,
        "recent_transcript": _turn_context(rec, turn),
        "turn": {
            "action_type": turn.get("action_type"),
            "directed_at": rec.name_of(turn.get("directed_at")) if turn.get("directed_at") else None,
            "content": turn.get("content"),
            "internal_reasoning": turn.get("internal_reasoning"),
        },
        "dimensions": TURN_DIMENSIONS,
    }
    return [{"role": "system", "content": TURN_SYSTEM},
            {"role": "user", "content": json.dumps(payload, default=str, indent=1)}]


def build_transcript_prompt(rec: Recording) -> list[dict]:
    lines = []
    for e in rec.events:
        if e.get("type") == "turn":
            to = f" -> {rec.name_of(e.get('directed_at'))}" if e.get("directed_at") else ""
            human = " [HUMAN]" if e.get("is_human") else ""
            lines.append(f"{rec.name_of(e.get('agent_id')) or e.get('speaker')}{to}{human} "
                         f"({e.get('action_type')}): {e.get('content', '')}")
        elif e.get("type") == "system" and e.get("subtype") in ("external_event", "departure", "time_pressure"):
            lines.append(f"[ROOM] {e.get('content')}")
    done = rec.done or {}
    payload = {
        "subject": rec.config.subject.name,
        "stakeholders": [{"name": s.name, "role": s.role, "stance": s.stance, "archetype": s.archetype}
                         for s in rec.config.stakeholders],
        "transcript": "\n".join(lines),
        "ending": {"reason": done.get("reason"), "outcome_type": done.get("outcome_type"),
                   "summary": done.get("summary")},
        "dimensions": TRANSCRIPT_DIMENSIONS,
    }
    return [{"role": "system", "content": TRANSCRIPT_SYSTEM},
            {"role": "user", "content": json.dumps(payload, default=str, indent=1)}]


async def judge_turn(rec: Recording, turn: dict, llm: JudgeLLM | None = None, model: str | None = None) -> dict:
    llm = llm or _default_llm()
    try:
        messages = build_turn_prompt(rec, turn)
        raw, _, _ = await llm(messages, temperature=0.0, simulation_id="eval-judge",
                              model=model or app_config.EVAL_JUDGE_MODEL)
        data = _parse(raw)
        scores = _clamp_scores(data.get("scores", {}), TURN_DIMENSIONS)
        missing = [d for d in TURN_DIMENSIONS if d not in scores]
        if missing:  # judges sometimes drop dimensions; ask once for the rest
            retry = messages + [{"role": "assistant", "content": raw},
                                {"role": "user", "content": f"You omitted {missing}. Return the full JSON "
                                                            "again with all eight scores."}]
            raw, _, _ = await llm(retry, temperature=0.0, simulation_id="eval-judge",
                                  model=model or app_config.EVAL_JUDGE_MODEL)
            data = _parse(raw)
            scores = {**scores, **_clamp_scores(data.get("scores", {}), TURN_DIMENSIONS)}
            missing = [d for d in TURN_DIMENSIONS if d not in scores]
        return {"simulation_id": rec.simulation_id, "_index": turn.get("_index"), "agent_id": turn["agent_id"],
                "action_type": turn.get("action_type"),
                "scores": scores,
                "missing_dimensions": missing,
                "agenda_leak": bool(data.get("agenda_leak", False)),
                "notes": str(data.get("notes", ""))[:300]}
    except Exception as exc:
        logger.warning("judge_turn failed at %s: %s", turn.get("_index"), exc)
        return {"simulation_id": rec.simulation_id, "_index": turn.get("_index"), "agent_id": turn["agent_id"],
                "error": str(exc)[:200]}


async def judge_transcript(rec: Recording, llm: JudgeLLM | None = None, model: str | None = None) -> dict:
    llm = llm or _default_llm()
    try:
        raw, _, _ = await llm(build_transcript_prompt(rec), temperature=0.0, simulation_id="eval-judge",
                              model=model or app_config.EVAL_JUDGE_MODEL)
        data = _parse(raw)
        return {"scores": _clamp_scores(data.get("scores", {}), TRANSCRIPT_DIMENSIONS),
                "artificial_consensus": bool(data.get("artificial_consensus", False)),
                "notes": str(data.get("notes", ""))[:500]}
    except Exception as exc:
        logger.warning("judge_transcript failed: %s", exc)
        return {"error": str(exc)[:200]}


def sample_turns(rec: Recording, sample: float = 1.0, max_turns: int | None = None, seed: int = 0) -> list[dict]:
    turns = [t for t in rec.turns if t.get("content") not in (None, "", "(...)")]
    if sample < 1.0:
        k = max(1, round(len(turns) * sample)) if turns else 0
        turns = sorted(random.Random(seed).sample(turns, k), key=lambda t: t.get("_index", 0))
    if max_turns is not None:
        turns = turns[:max_turns]
    return turns


async def judge_recording(rec: Recording, llm: JudgeLLM | None = None, model: str | None = None,
                          sample: float = 1.0, max_turns: int | None = None, concurrency: int = 4,
                          seed: int = 0) -> dict:
    sem = asyncio.Semaphore(concurrency)

    async def one(t: dict) -> dict:
        async with sem:
            return await judge_turn(rec, t, llm=llm, model=model)

    turns = sample_turns(rec, sample, max_turns, seed)
    turn_results = await asyncio.gather(*(one(t) for t in turns))
    transcript = await judge_transcript(rec, llm=llm, model=model)
    return {"model": model or app_config.EVAL_JUDGE_MODEL,
            "generator_model": app_config.OPENROUTER_MODEL,
            "turns": list(turn_results),
            "transcript": transcript,
            "summary": summarize(list(turn_results), transcript)}


def summarize(turn_results: list[dict], transcript: dict | None = None) -> dict:
    ok = [r for r in turn_results if "scores" in r]
    out: dict[str, Any] = {"judged_turns": len(ok), "judge_errors": len(turn_results) - len(ok)}
    for d in TURN_DIMENSIONS:
        vals = [r["scores"][d] for r in ok if d in r["scores"]]
        out[f"turn.{d}"] = round(mean(vals), 3) if vals else None
    out["turn.agenda_leak_rate"] = round(sum(1 for r in ok if r.get("agenda_leak")) / len(ok), 4) if ok else None
    by_action: dict[str, list[int]] = {}
    for r in ok:
        if "action_text_match" in r["scores"]:
            by_action.setdefault(r.get("action_type") or "?", []).append(r["scores"]["action_text_match"])
    out["action_text_match_by_action"] = {a: round(mean(v), 3) for a, v in by_action.items()}
    if transcript and "scores" in transcript:
        for d, v in transcript["scores"].items():
            out[f"transcript.{d}"] = v
        out["transcript.artificial_consensus"] = transcript.get("artificial_consensus")
    return out


# ── calibration against human labels ─────────────────────────────────

def calibrate(judge_results: list[dict], human_labels: list[dict]) -> dict:
    """Compare judge scores with human labels.

    ``human_labels``: [{"simulation_id", "_index", "scores": {dim: 1-5}, "agenda_leak"?: bool}]
    ``judge_results``: per-turn judge outputs, each with "simulation_id" and "_index".
    Returns per-dimension MAE, exact and within-1 agreement and Spearman rho.
    """
    jmap = {(r.get("simulation_id"), r.get("_index")): r for r in judge_results if "scores" in r}
    report: dict[str, Any] = {"pairs": 0, "dimensions": {}}
    pairs = [(h, jmap.get((h.get("simulation_id"), h.get("_index")))) for h in human_labels]
    pairs = [(h, j) for h, j in pairs if j]
    report["pairs"] = len(pairs)
    for d in TURN_DIMENSIONS:
        hv = [h["scores"][d] for h, j in pairs if d in h.get("scores", {}) and d in j["scores"]]
        jv = [j["scores"][d] for h, j in pairs if d in h.get("scores", {}) and d in j["scores"]]
        if not hv:
            continue
        report["dimensions"][d] = {
            "n": len(hv),
            "mae": round(mean(abs(a - b) for a, b in zip(hv, jv)), 3),
            "exact": round(sum(1 for a, b in zip(hv, jv) if a == b) / len(hv), 3),
            "within_1": round(sum(1 for a, b in zip(hv, jv) if abs(a - b) <= 1) / len(hv), 3),
            "spearman": spearman(hv, jv),
        }
    leak = [(h.get("agenda_leak"), j.get("agenda_leak")) for h, j in pairs if "agenda_leak" in h]
    if leak:
        report["agenda_leak_agreement"] = round(sum(1 for a, b in leak if bool(a) == bool(b)) / len(leak), 3)
    dims = report["dimensions"].values()
    report["trustworthy"] = bool(dims) and all(d["within_1"] >= 0.8 and d["mae"] <= 1.0 for d in dims)
    return report


def _ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def spearman(a: list[float], b: list[float]) -> float | None:
    if len(a) < 3:
        return None
    ra, rb = _ranks(a), _ranks(b)
    ma, mb = mean(ra), mean(rb)
    cov = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    va = sum((x - ma) ** 2 for x in ra) ** 0.5
    vb = sum((y - mb) ** 2 for y in rb) ** 0.5
    return round(cov / (va * vb), 4) if va and vb else None
