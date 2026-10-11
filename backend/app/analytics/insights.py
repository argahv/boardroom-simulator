"""What the meetings so far say: how they end, who drives them, which moves pay off.

The dashboard aggregator counts things. This answers questions instead: do rooms
reach decisions, what separates the ones that do, who holds the floor, who takes
the heat, and whether the runs themselves can be trusted. Every number is
computed from stored outcomes and turns; sections with too few meetings say so
rather than show a trend that isn't there.

``build_insights`` is pure (plain dicts in, a dict out) so it can be tested
without a database; ``load_insights`` reads the rows and calls it.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any, Iterable

# Below this many meetings in a group, a rate is shown but never called a pattern.
MIN_GROUP = 3

HOSTILE = {"challenge", "escalate", "interrupt", "walkaway"}
CONCILIATORY = {"compromise", "agreement", "coalition_signal"}
OUTCOME_MOVES = {"vote", "walkaway"}

# How a meeting ended, in words a user would use.
OUTCOME_KINDS = ("carried", "agreed", "voted_down", "walkout", "impasse", "stalled", "stopped", "unfinished")
DECIDED = {"carried", "agreed", "voted_down"}
OUTCOME_LABELS = {
    "carried": "Motion carried",
    "agreed": "Agreed",
    "voted_down": "Voted down",
    "walkout": "Walkout",
    "impasse": "Impasse",
    "stalled": "Ran out of turns",
    "stopped": "Stopped early",
    "unfinished": "Never finished",
}


def _json(val: Any) -> Any:
    if isinstance(val, str):
        try:
            return json.loads(val)
        except ValueError:
            return {}
    return val if val is not None else {}


def outcome_kind(outcome: dict | None, status: str | None) -> str:
    """Map a stored ending (``done`` event fields) to one of OUTCOME_KINDS."""
    o = outcome or {}
    reason, kind = o.get("reason"), o.get("outcome_type")
    if not o:
        return "unfinished"
    if reason == "stopped":
        return "stopped"
    if kind == "walkaway" or reason in ("walkaway", "deadlock_walkaway"):
        return "walkout"
    if reason == "vote_majority":
        return "carried" if kind == "agreement" else "voted_down" if kind == "rejected" else "impasse"
    if kind in ("agreement", "judge_ruling") or reason in ("consensus", "explicit_agreement"):
        return "agreed"
    if kind == "rejected":
        return "voted_down"
    if kind == "impasse":
        return "impasse"
    return "stalled"


def _rate(num: int, den: int) -> float | None:
    return round(num / den, 3) if den else None


def _gini(values: list[int]) -> float:
    """0 = everyone spoke equally, 1 = one person held the floor."""
    vals = sorted(v for v in values if v >= 0)
    n, total = len(vals), sum(vals)
    if n < 2 or total == 0:
        return 0.0
    cum = sum((i + 1) * v for i, v in enumerate(vals))
    return round((2 * cum) / (n * total) - (n + 1) / n, 3)


def _band(voltage: int | None) -> str:
    v = voltage if voltage is not None else 50
    return "calm" if v < 40 else "tense" if v < 70 else "heated"


def _phase(pos: float) -> str:
    return "opening" if pos < 1 / 3 else "middle" if pos < 2 / 3 else "closing"


def build_insights(
    simulations: Iterable[dict],
    participants: Iterable[dict],
    turns: Iterable[dict],
    *,
    days: int | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Compute every section from plain rows.

    simulations: id, subject_name, status, voltage, model_temperature, created_at, outcome, people
    participants: id, simulation_id, persona_id, name, role, stance
    turns: simulation_id, participant_id, turn_index, action_type, emotional_state, turn_data
    """
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(days=days) if days else None

    sims = []
    for s in simulations:
        created = s.get("created_at")
        if since and created and created < since:
            continue
        sims.append(s)
    sim_ids = {s["id"] for s in sims}
    parts = [p for p in participants if p["simulation_id"] in sim_ids]
    part_by_id = {p["id"]: p for p in parts}

    turns_by_sim: dict[str, list[dict]] = defaultdict(list)
    for t in turns:
        if t["simulation_id"] in sim_ids:
            turns_by_sim[t["simulation_id"]].append(t)
    for ts in turns_by_sim.values():
        ts.sort(key=lambda t: (_json(t.get("turn_data")).get("turn_number") or 0, t.get("turn_index") or 0))

    # ── Per meeting ──────────────────────────────────────────────────
    meetings: list[dict] = []
    for s in sims:
        ts = turns_by_sim.get(s["id"], [])
        kind = outcome_kind(s.get("outcome"), s.get("status"))
        speakers = Counter(t["participant_id"] for t in ts)
        size = s.get("people") or len({p["id"] for p in parts if p["simulation_id"] == s["id"]}) or len(speakers)
        seat_turns = [speakers.get(p["id"], 0) for p in parts if p["simulation_id"] == s["id"]] or list(speakers.values())
        meetings.append({
            "id": s["id"],
            "subject": s.get("subject_name") or "Untitled meeting",
            "created_at": s["created_at"].isoformat() if s.get("created_at") else None,
            "kind": kind,
            "decided": kind in DECIDED,
            "finished": kind != "unfinished",
            "turns": len(ts) or (s.get("outcome") or {}).get("total_turns") or 0,
            "size": size,
            "band": _band(s.get("voltage")),
            "temperature": s.get("model_temperature") or "volatile",
            "gini": _gini(seat_turns),
            "opener": next((t.get("action_type") for t in ts), None),
            "outcome_summary": (s.get("outcome") or {}).get("summary") or "",
        })

    finished = [m for m in meetings if m["finished"] and m["kind"] != "stopped"]
    decided = [m for m in finished if m["decided"]]

    # ── Outcomes ─────────────────────────────────────────────────────
    mix = Counter(m["kind"] for m in meetings)

    def by(key: str, order: list | None = None) -> list[dict]:
        groups: dict[Any, list[dict]] = defaultdict(list)
        for m in finished:
            groups[m[key]].append(m)
        keys = order or sorted(groups)
        return [{"group": k, "meetings": len(groups[k]),
                 "decided_rate": _rate(sum(m["decided"] for m in groups[k]), len(groups[k])),
                 "enough": len(groups[k]) >= MIN_GROUP}
                for k in keys if groups.get(k)]

    def size_group(n: int) -> str:
        return "2" if n <= 2 else "3" if n == 3 else "4" if n == 4 else "5+"

    for m in finished:
        m["size_group"] = size_group(m["size"])
        m["balance"] = "balanced" if m["gini"] < 0.2 else "uneven" if m["gini"] < 0.4 else "dominated"

    turns_to_decision = [m["turns"] for m in decided if m["turns"]]
    outcomes = {
        "mix": [{"kind": k, "label": OUTCOME_LABELS[k], "count": mix[k]} for k in OUTCOME_KINDS if mix[k]],
        "finished": len(finished),
        "decision_rate": _rate(len(decided), len(finished)),
        "stall_rate": _rate(sum(m["kind"] == "stalled" for m in finished), len(finished)),
        "walkout_rate": _rate(sum(m["kind"] == "walkout" for m in finished), len(finished)),
        "median_turns_to_decision": median(turns_to_decision) if turns_to_decision else None,
        "median_turns_stalled": median([m["turns"] for m in finished if m["kind"] == "stalled"] or [0]) or None,
        "by_size": by("size_group", ["2", "3", "4", "5+"]),
        "by_heat": by("band", ["calm", "tense", "heated"]),
        "by_temperature": by("temperature"),
        "by_balance": by("balance", ["balanced", "uneven", "dominated"]),
    }

    # ── Tactics: which moves show up where rooms decide ───────────────
    decided_ids = {m["id"] for m in decided}
    open_ids = {m["id"] for m in finished if not m["decided"]}
    moves_all: Counter[str] = Counter()
    moves_dec: Counter[str] = Counter()
    moves_open: Counter[str] = Counter()
    replies: Counter[str] = Counter()
    heat: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for sid, ts in turns_by_sim.items():
        for i, t in enumerate(ts):
            a = t.get("action_type") or "statement"
            moves_all[a] += 1
            if sid in decided_ids:
                moves_dec[a] += 1
            elif sid in open_ids:
                moves_open[a] += 1
            if a in HOSTILE and i + 1 < len(ts):
                replies[ts[i + 1].get("action_type") or "statement"] += 1
            es = _json(t.get("emotional_state"))
            if isinstance(es, dict):
                ph = _phase(i / max(len(ts), 1))
                for emo in ("anger", "fear", "joy"):
                    v = es.get(emo)
                    if isinstance(v, (int, float)):
                        heat[ph][emo].append(float(v))
    n_all = sum(moves_all.values())
    n_dec = sum(c for a, c in moves_dec.items() if a not in OUTCOME_MOVES)
    n_open = sum(c for a, c in moves_open.items() if a not in OUTCOME_MOVES)
    moves = []
    for a, c in moves_all.most_common():
        if a in OUTCOME_MOVES:
            continue  # a vote or walkout *is* the ending; comparing it to endings is circular
        sd = moves_dec[a] / n_dec if n_dec else None
        so = moves_open[a] / n_open if n_open else None
        lift = round(sd / so, 2) if sd is not None and so else None
        moves.append({"action": a, "count": c, "share": _rate(c, n_all),
                      "share_decided": round(sd, 3) if sd is not None else None,
                      "share_open": round(so, 3) if so is not None else None, "lift": lift})
    openers: dict[str, list[dict]] = defaultdict(list)
    for m in finished:
        if m["opener"]:
            openers[m["opener"]].append(m)
    n_replies = sum(replies.values())
    tactics = {
        "moves": moves,
        "openers": sorted(({"action": a, "meetings": len(ms), "decided_rate": _rate(sum(x["decided"] for x in ms), len(ms)),
                            "enough": len(ms) >= MIN_GROUP} for a, ms in openers.items()),
                          key=lambda r: -r["meetings"]),
        "answers_to_pressure": [{"action": a, "share": _rate(c, n_replies)} for a, c in replies.most_common(6)],
        "heat_by_phase": [{"phase": ph, **{emo: round(sum(v) / len(v), 3) if v else 0.0 for emo, v in heat[ph].items()}}
                          for ph in ("opening", "middle", "closing") if ph in heat],
        "hostile_share": _rate(sum(moves_all[a] for a in HOSTILE), n_all),
        "conciliatory_share": _rate(sum(moves_all[a] for a in CONCILIATORY), n_all),
    }

    # ── People: who holds the floor, who takes the heat, who wins ─────
    global_share = {a: c / n_all for a, c in moves_all.items()} if n_all else {}
    people: dict[str, dict] = {}

    def person_key(p: dict) -> str:
        return p.get("persona_id") or f"name:{(p.get('name') or '').strip().lower()}"

    for p in parts:
        k = person_key(p)
        d = people.setdefault(k, {"key": k, "persona_id": p.get("persona_id"), "name": p.get("name") or "Unknown",
                                  "role": p.get("role") or "", "meetings": set(), "turns": 0, "airtime": [],
                                  "targeted": 0, "hostile_in": 0, "moves": Counter(), "votes": Counter(),
                                  "sided_with_result": 0, "voted_in_decided": 0, "walkouts": 0, "stances": Counter()})
        d["meetings"].add(p["simulation_id"])
        d["stances"][p.get("stance") or "neutral"] += 1

    outcome_of = {s["id"]: (s.get("outcome") or {}) for s in sims}
    kind_of = {m["id"]: m["kind"] for m in meetings}
    for sid, ts in turns_by_sim.items():
        sim_parts = [p for p in parts if p["simulation_id"] == sid]
        if not ts or not sim_parts:
            continue
        # agent_id (config id) -> participant, learned from who spoke.
        by_agent: dict[str, dict] = {}
        for t in ts:
            aid = _json(t.get("turn_data")).get("agent_id")
            if aid and t["participant_id"] in part_by_id:
                by_agent.setdefault(aid, part_by_id[t["participant_id"]])
        counts = Counter(t["participant_id"] for t in ts)
        fair = len(ts) / len(sim_parts)
        for p in sim_parts:
            people[person_key(p)]["airtime"].append(counts.get(p["id"], 0) / fair if fair else 0)
        result = outcome_of.get(sid, {})
        walker = result.get("walkaway_party")
        for t in ts:
            p = part_by_id.get(t["participant_id"])
            if not p:
                continue
            d = people[person_key(p)]
            a = t.get("action_type") or "statement"
            d["turns"] += 1
            d["moves"][a] += 1
            td = _json(t.get("turn_data"))
            target = by_agent.get(td.get("directed_at")) if td.get("directed_at") else None
            if target and target["id"] != p["id"]:
                tk = people[person_key(target)]
                tk["targeted"] += 1
                if a in HOSTILE:
                    tk["hostile_in"] += 1
            vote = td.get("vote")
            if vote in ("yes", "no", "abstain"):
                d["votes"][vote] += 1
                if kind_of.get(sid) in ("carried", "voted_down") and vote != "abstain":
                    d["voted_in_decided"] += 1
                    if (vote == "yes") == (kind_of[sid] == "carried"):
                        d["sided_with_result"] += 1
        if walker and walker in by_agent:
            people[person_key(by_agent[walker])]["walkouts"] += 1

    people_rows = []
    for d in people.values():
        n = len(d["meetings"])
        if not d["turns"]:
            continue
        signature = None
        if d["turns"] >= 4 and global_share:
            # The move they make most out of proportion to everyone else (ignoring one-offs).
            best = max(((a, (c / d["turns"]) / global_share[a]) for a, c in d["moves"].items()
                        if global_share.get(a) and c >= 2 and a not in OUTCOME_MOVES),
                       key=lambda x: x[1], default=None)
            if best and best[1] >= 1.3:
                signature = {"action": best[0], "times_typical": round(best[1], 1)}
        people_rows.append({
            "key": d["key"], "persona_id": d["persona_id"], "name": d["name"], "role": d["role"],
            "meetings": n, "turns": d["turns"],
            "airtime": round(sum(d["airtime"]) / len(d["airtime"]), 2) if d["airtime"] else None,
            "targeted_per_meeting": round(d["targeted"] / n, 2) if n else 0,
            "hostility_received": _rate(d["hostile_in"], d["targeted"]),
            "hostility_given": _rate(sum(d["moves"][a] for a in HOSTILE), d["turns"]),
            "signature": signature,
            "votes": dict(d["votes"]),
            "sided_with_result": _rate(d["sided_with_result"], d["voted_in_decided"]),
            "walkouts": d["walkouts"],
            "usual_stance": d["stances"].most_common(1)[0][0] if d["stances"] else "neutral",
        })
    people_rows.sort(key=lambda r: (-r["meetings"], -r["turns"]))

    # ── Run quality: can these runs be trusted ──────────────────────
    llm = [_json(t.get("turn_data")).get("llm") for ts in turns_by_sim.values() for t in ts]
    llm = [x for x in llm if isinstance(x, dict)]
    lat = sorted(x["latency_ms"] for x in llm if isinstance(x.get("latency_ms"), (int, float)))
    tokens = [x["tokens"] for x in llm if isinstance(x.get("tokens"), (int, float))]
    quality = {
        "turns_checked": len(llm),
        "fallback_rate": _rate(sum(bool(x.get("fallback")) for x in llm), len(llm)),
        "parse_fail_rate": _rate(sum(x.get("parse_ok") is False for x in llm), len(llm)),
        "relabelled_rate": _rate(sum(bool(x.get("action_normalized")) for x in llm), len(llm)),
        "target_guessed_rate": _rate(sum(bool(x.get("target_inferred")) for x in llm), len(llm)),
        "p50_latency_ms": lat[len(lat) // 2] if lat else None,
        "p95_latency_ms": lat[min(len(lat) - 1, int(len(lat) * 0.95))] if lat else None,
        "tokens_per_meeting": round(sum(tokens) / len(turns_by_sim)) if tokens and turns_by_sim else None,
        "never_finished": mix["unfinished"],
        "stopped": mix["stopped"],
        "models": dict(Counter(x.get("model") or "unknown" for x in llm).most_common(5)),
    }

    totals = {
        "meetings": len(meetings), "finished": len(finished), "decided": len(decided),
        "turns": sum(m["turns"] for m in meetings), "people": len(people_rows),
    }
    recent = [{k: m[k] for k in ("id", "subject", "created_at", "kind", "turns", "size", "outcome_summary")}
              | {"label": OUTCOME_LABELS[m["kind"]]} for m in meetings[:8]]

    return {
        "window_days": days,
        "totals": totals,
        "headlines": _headlines(outcomes, tactics, people_rows, quality, totals),
        "outcomes": outcomes,
        "tactics": tactics,
        "people": people_rows,
        "quality": quality,
        "recent": recent,
    }


def _pct(x: float) -> str:
    return f"{round(x * 100)}%"


def _headlines(outcomes: dict, tactics: dict, people: list[dict], quality: dict, totals: dict) -> list[dict]:
    """The few things worth acting on, strongest first. Each says what to try."""
    out: list[dict] = []
    fin = outcomes["finished"]
    if fin >= MIN_GROUP and outcomes["stall_rate"] is not None and outcomes["stall_rate"] >= 0.4:
        out.append({"tone": "warn", "area": "outcomes",
                    "title": f"{_pct(outcomes['stall_rate'])} of meetings ran out of turns",
                    "body": "No vote, no agreement, no walkout. Give the room a vote rule or fewer open issues."})
    elif fin >= MIN_GROUP and outcomes["decision_rate"] is not None:
        out.append({"tone": "good" if outcomes["decision_rate"] >= 0.5 else "info", "area": "outcomes",
                    "title": f"{_pct(outcomes['decision_rate'])} of finished meetings reached a decision",
                    "body": f"{totals['decided']} of {fin} ended in a vote or an agreement."})

    sized = [g for g in outcomes["by_size"] if g["enough"] and g["decided_rate"] is not None]
    if len(sized) >= 2:
        best, worst = max(sized, key=lambda g: g["decided_rate"]), min(sized, key=lambda g: g["decided_rate"])
        if best["decided_rate"] - worst["decided_rate"] >= 0.25:
            out.append({"tone": "info", "area": "outcomes",
                        "title": f"Rooms of {best['group']} decide most often",
                        "body": f"{_pct(best['decided_rate'])} decided, against {_pct(worst['decided_rate'])} "
                                f"with {worst['group']} people."})

    lifted = [m for m in tactics["moves"] if m["lift"] and m["count"] >= 5]
    if lifted:
        top = max(lifted, key=lambda m: m["lift"])
        if top["lift"] >= 1.4:
            out.append({"tone": "good", "area": "tactics",
                        "title": f"“{top['action'].replace('_', ' ')}” moves rooms to a decision",
                        "body": f"It shows up {top['lift']}× as often in meetings that decided as in ones that didn't."})
        low = min(lifted, key=lambda m: m["lift"])
        if low["lift"] <= 0.6:
            out.append({"tone": "warn", "area": "tactics",
                        "title": f"“{low['action'].replace('_', ' ')}” goes with rooms that stall",
                        "body": f"{round((1 - low['lift']) * 100)}% less common in meetings that reached a decision."})

    loud = [p for p in people if p["meetings"] >= 2 and p["airtime"] and p["airtime"] >= 1.5]
    if loud:
        p = max(loud, key=lambda p: p["airtime"])
        out.append({"tone": "info", "area": "people", "title": f"{p['name']} holds the floor",
                    "body": f"Speaks {p['airtime']}× their fair share across {p['meetings']} meetings."})
    rods = [p for p in people if p["meetings"] >= 2 and p["targeted_per_meeting"] >= 2]
    if rods:
        p = max(rods, key=lambda p: (p["hostility_received"] or 0, p["targeted_per_meeting"]))
        if (p["hostility_received"] or 0) >= 0.5:
            out.append({"tone": "info", "area": "people", "title": f"{p['name']} draws the fire",
                        "body": f"Addressed {p['targeted_per_meeting']} times a meeting; "
                                f"{_pct(p['hostility_received'])} of it is a challenge or worse."})

    if quality["turns_checked"] >= 20 and (quality["fallback_rate"] or 0) >= 0.05:
        out.append({"tone": "warn", "area": "quality",
                    "title": f"{_pct(quality['fallback_rate'])} of turns were canned fallbacks",
                    "body": "The model failed or timed out on these. Results from those meetings are less reliable."})
    return out[:5]


async def load_insights(days: int | None = None) -> dict[str, Any]:
    from app.database import get_database

    client = get_database()._client_or_raise()
    sim_rows = await client.simulations.find_many(order={"created_at": "desc"})
    pm_rows = await client.postmortems.find_many()
    ended = {}
    for pm in pm_rows:
        pj = _json(pm.postmortem_json)
        term = pj.get("termination") if isinstance(pj, dict) else None
        if isinstance(term, dict) and term.get("reason"):
            ended[pm.simulation_id] = term
    sims = []
    for s in sim_rows:
        meta = _json(s.metadata)
        outcome = (meta.get("outcome") if isinstance(meta, dict) else None) or ended.get(s.id)
        cfg = _json(s.config)
        people = len(cfg.get("stakeholders") or []) if isinstance(cfg, dict) else 0
        sims.append({"id": s.id, "subject_name": s.subject_name, "status": s.status, "voltage": s.voltage,
                     "model_temperature": s.model_temperature, "created_at": s.created_at,
                     "outcome": outcome, "people": people or s.total_participants})
    # Participants point at `personas`; the library page is keyed by the stakeholder id,
    # which is that persona's id or slug. Only link people who are still in the library.
    library = {s.id for s in await client.stakeholders.find_many()}
    page_of = {}
    for row in await client.personas.find_many():
        page_of[row.id] = row.id if row.id in library else row.slug if row.slug in library else None
    parts = [{"id": p.id, "simulation_id": p.simulation_id, "persona_id": page_of.get(p.persona_id) if p.persona_id else None,
              "name": p.name, "role": p.role, "stance": p.stance}
             for p in await client.simulation_participants.find_many()]
    turns = [{"simulation_id": t.simulation_id, "participant_id": t.participant_id, "turn_index": t.turn_index,
              "action_type": t.action_type, "emotional_state": t.emotional_state, "turn_data": t.turn_data}
             for t in await client.turns.find_many()]
    return build_insights(sims, parts, turns, days=days)
