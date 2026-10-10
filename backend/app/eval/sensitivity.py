"""Judge sensitivity: does the LLM judge notice when a turn is broken on purpose?

Human labels are the real calibration (see ``judge.calibrate``), but they take
time. This is the cheap check in between: take real turns, apply one known
defect each, and see whether the score for the dimension that defect targets
falls. A judge that scores a deliberately broken turn as highly as the
original is too lenient to trust, whatever its average scores look like.

Each probe changes one thing about a recorded turn:

- ``wrong_action``: the label says the opposite of what the text does.
- ``wrong_target``: ``directed_at`` names someone the text never addresses.
- ``plan_violation``: the agent was told to cool the room down, yet escalates.
- ``agenda_leak``: the text states the hidden agenda outright.
- ``hollow_content``: the text is replaced by generic filler.
"""

from __future__ import annotations

import asyncio
import copy
import random
from typing import Any

from app.eval import judge as judge_mod
from app.eval.recording import Recording

# Label swaps that contradict the text: what a turn does -> a label it clearly is not.
_OPPOSITE = {
    "challenge": "agreement", "escalate": "agreement", "interrupt": "agreement",
    "compromise": "escalate", "agreement": "challenge", "coalition_signal": "challenge",
    "question": "walkaway", "statement": "walkaway", "vote": "challenge",
}
_HOLLOW = "That is an interesting point and there are many things to consider here. Let's keep talking."
_HOSTILE = {"challenge", "escalate", "interrupt"}

# Probe -> (dimension expected to drop, or "agenda_leak" for the flag).
PROBES: dict[str, str] = {
    "wrong_action": "action_text_match",
    "wrong_target": "target_match",
    "plan_violation": "plan_fit",
    "agenda_leak": "agenda_leak",
    "hollow_content": "rhetorical_quality",
}


def _wrong_action(rec: Recording, turn: dict) -> dict | None:
    new = _OPPOSITE.get(turn.get("action_type"))
    if not new:
        return None
    t = copy.deepcopy(turn)
    t["action_type"] = new
    return t


_GROUP_ADDRESS = ("both", "everyone", "all of you", "you two", "you all", "each of you")


def _wrong_target(rec: Recording, turn: dict) -> dict | None:
    content = (turn.get("content") or "").lower()
    if any(g in content for g in _GROUP_ADDRESS):
        return None  # a turn aimed at several people has no single wrong target
    others = [s for s in rec.config.stakeholders
              if s.id not in (turn.get("agent_id"), turn.get("directed_at"))
              and s.name.split()[0].lower() not in content]
    if not turn.get("directed_at") or not others:
        return None
    t = copy.deepcopy(turn)
    t["directed_at"] = others[0].id
    return t


def _plan_violation(rec: Recording, turn: dict) -> dict | None:
    if turn.get("action_type") not in _HOSTILE:
        return None
    t = copy.deepcopy(turn)
    ps = t.setdefault("prompt_state", {})
    ps["plan"] = {"goal": "deescalate", "subgoal": "acknowledge concerns",
                  "subgoal_actions": ["question", "agreement", "statement"], "progress": 0.1}
    return t


def _agenda_leak(rec: Recording, turn: dict) -> dict | None:
    s = rec.stakeholders.get(turn.get("agent_id"))
    if not s or not s.hidden_agenda or not (turn.get("prompt_state") or {}).get("hidden_agenda_shown"):
        return None
    t = copy.deepcopy(turn)
    t["content"] = f"{t.get('content', '')} To be honest with you all: {s.hidden_agenda}."
    return t


def _hollow(rec: Recording, turn: dict) -> dict | None:
    t = copy.deepcopy(turn)
    t["content"] = _HOLLOW
    return t


_MAKERS = {"wrong_action": _wrong_action, "wrong_target": _wrong_target, "plan_violation": _plan_violation,
           "agenda_leak": _agenda_leak, "hollow_content": _hollow}


def build_probes(recs: list[Recording], per_probe: int = 8, seed: int = 0) -> list[dict]:
    """Pick up to ``per_probe`` turns per probe type across the recordings."""
    rng = random.Random(seed)
    candidates = [(rec, t) for rec in recs for t in rec.turns if t.get("content") not in (None, "", "(...)")]
    rng.shuffle(candidates)
    probes: list[dict] = []
    for name, make in _MAKERS.items():
        made = 0
        for rec, turn in candidates:
            if made >= per_probe:
                break
            broken = make(rec, turn)
            if broken is not None:
                probes.append({"probe": name, "rec": rec, "original": turn, "broken": broken})
                made += 1
    return probes


async def run(recs: list[Recording], llm: Any = None, model: str | None = None, per_probe: int = 8,
              seed: int = 0, concurrency: int = 4) -> dict:
    """Judge each original and its broken copy; report how often the judge caught the defect."""
    sem = asyncio.Semaphore(concurrency)

    async def judged(rec: Recording, turn: dict) -> dict:
        async with sem:
            return await judge_mod.judge_turn(rec, turn, llm=llm, model=model)

    probes = build_probes(recs, per_probe, seed)
    results = await asyncio.gather(*(asyncio.gather(judged(p["rec"], p["original"]), judged(p["rec"], p["broken"]))
                                     for p in probes))
    by_probe: dict[str, dict] = {}
    rows = []
    for p, (orig, broken) in zip(probes, results):
        dim = PROBES[p["probe"]]
        if "scores" not in orig or "scores" not in broken:
            continue
        if dim == "agenda_leak":
            caught = bool(broken.get("agenda_leak")) and not orig.get("agenda_leak")
            drop = None
        else:
            if dim not in orig["scores"] or dim not in broken["scores"]:
                continue
            drop = orig["scores"][dim] - broken["scores"][dim]
            caught = drop >= 2 or broken["scores"][dim] <= 2
        row = {"probe": p["probe"], "simulation_id": p["rec"].simulation_id, "_index": p["original"].get("_index"),
               "dimension": dim, "original": orig["scores"].get(dim, orig.get("agenda_leak")),
               "broken": broken["scores"].get(dim, broken.get("agenda_leak")), "drop": drop, "caught": caught}
        rows.append(row)
        agg = by_probe.setdefault(p["probe"], {"dimension": dim, "n": 0, "caught": 0, "drops": []})
        agg["n"] += 1
        agg["caught"] += int(caught)
        if drop is not None:
            agg["drops"].append(drop)
    summary = {}
    for name, agg in by_probe.items():
        summary[name] = {"dimension": agg["dimension"], "n": agg["n"],
                         "detection_rate": round(agg["caught"] / agg["n"], 3) if agg["n"] else None,
                         "mean_drop": round(sum(agg["drops"]) / len(agg["drops"]), 2) if agg["drops"] else None}
    rates = [v["detection_rate"] for v in summary.values() if v["detection_rate"] is not None]
    return {"probes": summary, "overall_detection_rate": round(sum(rates) / len(rates), 3) if rates else None,
            "sensitive": bool(rates) and min(rates) >= 0.8, "rows": rows}
