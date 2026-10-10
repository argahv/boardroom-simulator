"""Deterministic, LLM-free metrics computed from a recording.

Every function takes a :class:`Recording` and returns a plain dict so results
can be serialized into scorecards and diffed against a baseline.
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from statistics import mean, pstdev

from app.eval.recording import Recording
from app.runtime.archetypes import ARCHETYPES
from app.runtime.context import uses_vote, voters_of

AGGRESSIVE = {"challenge", "interrupt", "escalate"}
CONCILIATORY = {"compromise", "agreement", "coalition_signal"}
HOSTILE = {"challenge", "interrupt", "escalate", "walkaway"}
POSITIVE = {"compromise", "agreement", "coalition_signal"}
TARGETED = {"challenge", "question", "interrupt", "compromise", "coalition_signal", "escalate", "agreement"}

_STOP = set("""a an the and or but if then so to of in on at by for with from as is are was were be been being
it its this that these those i you he she we they me him her us them my your our their not no yes do does did
have has had will would can could should may might must shall about into over under than too very just also
what which who whom whose when where why how all any each more most other some such only own same both few
let lets we're i'm you're it's don't won't can't""".split())


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z']+", (text or "").lower())


def _content_words(text: str) -> set[str]:
    return {w for w in _words(text) if len(w) >= 4 and w not in _STOP}


def _ngrams(text: str, n: int = 3) -> set[tuple[str, ...]]:
    w = _words(text)
    return {tuple(w[i:i + n]) for i in range(max(0, len(w) - n + 1))}


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _rate(num: int, den: int) -> float | None:
    return round(num / den, 4) if den else None


def _gini(values: list[float]) -> float:
    if not values or sum(values) == 0:
        return 0.0
    vals = sorted(values)
    n = len(vals)
    cum = sum((i + 1) * v for i, v in enumerate(vals))
    return round((2 * cum) / (n * sum(vals)) - (n + 1) / n, 4)


# ── 1. Persona fidelity ──────────────────────────────────────────────

def action_distribution(rec: Recording) -> dict:
    per_agent: dict[str, Counter] = defaultdict(Counter)
    for t in rec.turns:
        per_agent[t["agent_id"]][t.get("action_type", "statement")] += 1
    out: dict = {"per_agent": {}, "per_archetype": {}, "tendency_alignment": {}}
    by_arch: dict[str, Counter] = defaultdict(Counter)
    for aid, counts in per_agent.items():
        total = sum(counts.values())
        out["per_agent"][aid] = {a: round(c / total, 4) for a, c in counts.items()}
        arch = rec.stakeholders[aid].archetype if aid in rec.stakeholders else None
        if arch:
            by_arch[arch.lower()].update(counts)
            tendencies = ARCHETYPES.get(arch.lower()).tendencies if arch.lower() in ARCHETYPES else {}
            if tendencies:
                out["tendency_alignment"][aid] = _tendency_similarity(counts, tendencies)
    for arch, counts in by_arch.items():
        total = sum(counts.values())
        out["per_archetype"][arch] = {a: round(c / total, 4) for a, c in counts.items()}
    aligned = list(out["tendency_alignment"].values())
    out["mean_tendency_alignment"] = round(mean(aligned), 4) if aligned else None
    return out


def _tendency_similarity(observed: Counter, tendencies: dict[str, float]) -> float:
    """Cosine similarity between observed action mix and archetype tendencies."""
    keys = set(observed) | set(tendencies)
    total = sum(observed.values()) or 1
    o = [observed.get(k, 0) / total for k in keys]
    t = [tendencies.get(k, 0.0) for k in keys]
    dot = sum(a * b for a, b in zip(o, t))
    norm = math.sqrt(sum(a * a for a in o)) * math.sqrt(sum(b * b for b in t))
    return round(dot / norm, 4) if norm else 0.0


def action_rate(rec: Recording, agent_id: str, actions: set[str]) -> float | None:
    turns = [t for t in rec.turns if t["agent_id"] == agent_id]
    return _rate(sum(1 for t in turns if t.get("action_type") in actions), len(turns))


# ── 2. Emotional coherence ───────────────────────────────────────────

def emotion_action_coherence(rec: Recording) -> dict:
    """Do emotional states at prompt time shift the actions agents choose?

    Lift = rate of the expected actions when the emotion is high divided by
    the rate when it is low. Lift > 1 means emotions causally shape behavior.
    """
    rules = {
        "anger": (0.6, 0.4, AGGRESSIVE),
        "joy": (0.6, 0.45, CONCILIATORY),
        "fear": (0.5, 0.3, {"coalition_signal", "question", "compromise"}),
    }
    out: dict = {}
    for emotion, (hi, lo, actions) in rules.items():
        high = [t for t in rec.turns if t.get("prompt_state", {}).get("emotion", {}).get(emotion, 0) >= hi]
        low = [t for t in rec.turns if t.get("prompt_state", {}).get("emotion", {}).get(emotion, 1) < lo]
        hr = _rate(sum(1 for t in high if t.get("action_type") in actions), len(high))
        lr = _rate(sum(1 for t in low if t.get("action_type") in actions), len(low))
        lift = round(hr / lr, 3) if hr is not None and lr else None
        out[emotion] = {"high_n": len(high), "low_n": len(low), "high_rate": hr, "low_rate": lr, "lift": lift}
    return out


# ── 3. Strategic alignment ───────────────────────────────────────────

def plan_alignment(rec: Recording) -> dict:
    """Share of turns whose action advances the agent's current subgoal, and
    how often de-escalation plans were broken by escalation."""
    with_plan = [t for t in rec.turns if (t.get("prompt_state", {}).get("plan") or {}).get("subgoal_actions")]
    aligned = sum(1 for t in with_plan if t.get("action_type") in t["prompt_state"]["plan"]["subgoal_actions"])
    repair = [t for t in rec.turns
              if any(k in ((t.get("prompt_state", {}).get("plan") or {}).get("goal") or "")
                     for k in ("deescalate", "rebuild", "repair"))]
    broken = sum(1 for t in repair if t.get("action_type") in {"challenge", "escalate", "interrupt", "walkaway"})
    # Backwards goal shifts: the agent who just attacked someone is told to calm the room.
    turns_by_index = {t.get("_index"): t for t in rec.all_turns}
    shifts = rec.system("goal_shift")
    self_inflicted = 0
    repair_shifts = 0
    for e in shifts:
        if not any(k in (e.get("content") or "") for k in ("deescalate", "rebuild trust")):
            continue
        repair_shifts += 1
        prior = [t for i, t in turns_by_index.items() if i is not None and i < e.get("_index", 0)]
        last = prior[-1] if prior else None
        if last and last.get("agent_id") == e.get("target_agent") and last.get("action_type") in HOSTILE:
            self_inflicted += 1
    return {
        "turns_with_plan": len(with_plan),
        "subgoal_alignment_rate": _rate(aligned, len(with_plan)),
        "repair_plan_turns": len(repair),
        "repair_plan_violation_rate": _rate(broken, len(repair)),
        "repair_goal_shifts": repair_shifts,
        "self_inflicted_repair_shift_rate": _rate(self_inflicted, repair_shifts),
    }


# ── 4. Rhetorical diversity / repetition ─────────────────────────────

def repetition(rec: Recording) -> dict:
    own: list[float] = []
    by_agent: dict[str, list[str]] = defaultdict(list)
    for t in rec.turns:
        by_agent[t["agent_id"]].append(t.get("content", ""))
    worst_agent, worst = None, 0.0
    for aid, texts in by_agent.items():
        grams = [_ngrams(x) for x in texts]
        for i in range(1, len(grams)):
            s = max(_jaccard(grams[i], g) for g in grams[:i])
            own.append(s)
            if s > worst:
                worst, worst_agent = s, aid
    # Voice collapse: how similar different agents' vocabularies are
    vocab = {aid: set().union(*(_content_words(x) for x in texts)) for aid, texts in by_agent.items() if texts}
    ids = list(vocab)
    cross = [_jaccard(vocab[a], vocab[b]) for i, a in enumerate(ids) for b in ids[i + 1:]]
    all_bigrams = [g for t in rec.turns for g in _ngrams(t.get("content", ""), 2)]
    return {
        "self_repetition_mean": round(mean(own), 4) if own else 0.0,
        "self_repetition_max": round(worst, 4),
        "most_repetitive_agent": worst_agent,
        "cross_agent_vocab_overlap": round(mean(cross), 4) if cross else 0.0,
        "distinct_2": _rate(len(set(all_bigrams)), len(all_bigrams)),
    }


# ── 5. Turn share / fairness ─────────────────────────────────────────

def turn_share(rec: Recording) -> dict:
    counts = Counter(t["agent_id"] for t in rec.turns)
    ids = list(rec.stakeholders)
    values = [counts.get(a, 0) for a in ids]
    total = sum(values) or 1
    longest_silence: dict[str, int] = {}
    for aid in ids:
        gap, best = 0, 0
        for t in rec.turns:
            gap = 0 if t["agent_id"] == aid else gap + 1
            best = max(best, gap)
        longest_silence[aid] = best
    return {
        "per_agent": {a: counts.get(a, 0) for a in ids},
        "share": {a: round(counts.get(a, 0) / total, 4) for a in ids},
        "gini": _gini(values),
        "silent_agents": [a for a in ids if counts.get(a, 0) == 0],
        "longest_silence": longest_silence,
    }


# ── 6. Robustness ────────────────────────────────────────────────────

def robustness(rec: Recording) -> dict:
    turns = rec.turns
    n = len(turns)
    llm = [t.get("llm") or {} for t in turns]
    return {
        "turns": n,
        "parse_failure_rate": _rate(sum(1 for r in llm if r and not r.get("parse_ok", True)), n),
        "fallback_rate": _rate(sum(1 for t, r in zip(turns, llm) if r.get("fallback") or t.get("content") == "(...)"), n),
        "invented_action_rate": _rate(sum(1 for r in llm if r.get("action_normalized")), n),
        "turn_timeouts": len(rec.system("turn_timeout")),
        "strategy_timeouts": int(rec.usage.get("strategy_timeouts", 0)),
        "strategy_failures": int(rec.usage.get("strategy_failures", 0)),
    }


# ── 7. Cost & latency ────────────────────────────────────────────────

def cost(rec: Recording, cost_per_million: float = 3.0) -> dict:
    u = rec.usage
    n = max(1, len(rec.turns))
    tokens = int(u.get("turn_tokens", 0)) + int(u.get("strategy_tokens", 0))
    calls = int(u.get("turn_calls", 0)) + int(u.get("strategy_calls", 0))
    return {
        "total_tokens": tokens,
        "tokens_per_turn": round(tokens / n, 1),
        "strategy_token_share": _rate(int(u.get("strategy_tokens", 0)), tokens),
        "llm_calls_per_turn": round(calls / n, 2),
        "turn_latency_ms_mean": round(int(u.get("turn_latency_ms", 0)) / max(1, int(u.get("turn_calls", 0))), 1),
        "est_cost_usd": round(tokens / 1_000_000 * cost_per_million, 4),
    }


# ── 8. Targeting ─────────────────────────────────────────────────────

def _mentions(rec: Recording, content: str, agent_id: str) -> bool:
    s = rec.stakeholders.get(agent_id)
    if not s:
        return False
    text = (content or "").lower()
    names = {s.name.lower()} | ({s.name.split()[0].lower()} if s.name else set())
    if s.role and len(s.role) >= 3:
        names.add(s.role.lower())
    return any(re.search(r"\b" + re.escape(n) + r"\b", text) for n in names if n)


def targeting(rec: Recording) -> dict:
    targeted = [t for t in rec.turns if t.get("action_type") in TARGETED]
    with_target = [t for t in targeted if t.get("directed_at")]
    explicit = [t for t in with_target if not (t.get("llm") or {}).get("target_inferred")]
    mention = [t for t in with_target if _mentions(rec, t.get("content", ""), t["directed_at"])]
    return {
        "targeted_turns": len(targeted),
        "target_coverage": _rate(len(with_target), len(targeted)),
        "explicit_target_rate": _rate(len(explicit), len(with_target)),
        "target_mention_rate": _rate(len(mention), len(with_target)),
    }


# ── 9. Hidden agenda leakage (heuristic; the judge gives the real verdict) ─

def agenda_leakage(rec: Recording, threshold: float = 0.5) -> dict:
    per_agent: dict[str, dict] = {}
    flagged: list[dict] = []
    for aid, s in rec.stakeholders.items():
        agenda = _content_words(s.hidden_agenda)
        if len(agenda) < 2:
            continue
        turns = [t for t in rec.turns if t["agent_id"] == aid]
        worst = 0.0
        for t in turns:
            overlap = len(agenda & _content_words(t.get("content", ""))) / len(agenda)
            worst = max(worst, overlap)
            if overlap >= threshold and len(agenda & _content_words(t.get("content", ""))) >= 2:
                flagged.append({"agent_id": aid, "_index": t.get("_index"), "overlap": round(overlap, 3)})
        per_agent[aid] = {"max_overlap": round(worst, 3), "turns": len(turns)}
    agents_with_agenda = len(per_agent)
    return {"per_agent": per_agent, "flagged_turns": flagged,
            "leak_rate": _rate(len({f["agent_id"] for f in flagged}), agents_with_agenda)}


# ── 10. Urgency calibration (60/40 hybrid) ───────────────────────────

def urgency(rec: Recording) -> dict:
    per_agent: dict[str, list[dict]] = defaultdict(list)
    for e in rec.floor_events:
        for aid, d in (e.get("bid_details") or {}).items():
            per_agent[aid].append(d)
    rows = [d for ds in per_agent.values() for d in ds]
    with_strategy = [d for d in rows if d.get("strategy") is not None]
    blend_errors = [abs(d["final"] - max(0, min(100, int(d["deterministic"] * 0.6 + d["strategy"] * 0.4))))
                    for d in with_strategy]
    dets = [d["deterministic"] for d in with_strategy]
    strats = [d["strategy"] for d in with_strategy]
    wins = Counter(e.get("granted_to") for e in rec.floor_events)
    agents = {}
    for aid, ds in per_agent.items():
        agents[aid] = {
            "mean_final": round(mean(d["final"] for d in ds), 2),
            "mean_deterministic": round(mean(d["deterministic"] for d in ds), 2),
            "mean_strategy": round(mean(d["strategy"] for d in ds if d.get("strategy") is not None), 2)
            if any(d.get("strategy") is not None for d in ds) else None,
            "bids": len(ds),
            "wins": wins.get(aid, 0),
            "win_rate": _rate(wins.get(aid, 0), len(ds)),
        }
    sources = Counter(d.get("strategy_source", "none") for d in rows)
    # Is the LLM strategy score informative? It should vary within an agent and
    # rise when the agent was just addressed.
    spreads = [pstdev([d["strategy"] for d in ds if d.get("strategy") is not None])
               for ds in per_agent.values() if sum(d.get("strategy") is not None for d in ds) >= 3]
    addressed, other = [], []
    for e in rec.floor_events:
        prior = [t for t in rec.all_turns if t.get("_index", 0) < e.get("_index", 0)]
        target = prior[-1].get("directed_at") if prior else None
        for aid, d in (e.get("bid_details") or {}).items():
            if d.get("strategy") is not None:
                (addressed if aid == target else other).append(d["strategy"])
    return {
        "bids": len(rows),
        "blend_max_error": max(blend_errors) if blend_errors else None,
        "det_strategy_correlation": _pearson(dets, strats),
        "strategy_sources": dict(sources),
        "strategy_timeout_rate": _rate(sources.get("timeout", 0), len(rows)),
        "strategy_within_agent_sd": round(mean(spreads), 2) if spreads else None,
        "strategy_addressed_lift": (round(mean(addressed) - mean(other), 2)
                                    if addressed and other else None),
        "per_agent": agents,
    }


def _pearson(a: list[float], b: list[float]) -> float | None:
    if len(a) < 3 or pstdev(a) == 0 or pstdev(b) == 0:
        return None
    ma, mb = mean(a), mean(b)
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b)) / len(a)
    return round(cov / (pstdev(a) * pstdev(b)), 4)


# ── 11. Coalition organicism ─────────────────────────────────────────

def coalitions(rec: Recording) -> dict:
    """Coalitions should follow repeated positive interaction, not appear at random."""
    final = rec.snapshots[-1]["data"] if rec.snapshots else {}
    seen: dict[tuple, dict] = {}
    for snap in rec.snapshots:
        for c in snap["data"].get("coalitions", []):
            key = tuple(sorted(c["members"]))
            seen.setdefault(key, c)
    details = []
    for pair, c in seen.items():
        a, b = pair
        formed = c.get("formed_turn", 0)  # engine turn count when it formed
        prior = rec.all_turns[:max(0, formed - 1)]  # interactions before the forming turn
        positive = sum(1 for t in prior if t.get("action_type") in POSITIVE
                       and {t.get("agent_id"), t.get("directed_at")} == {a, b})
        hostile_recent = sum(1 for t in prior[-3:] if t.get("action_type") in AGGRESSIVE
                             and {t.get("agent_id"), t.get("directed_at")} == {a, b})
        details.append({"members": list(pair), "positive_interactions": positive,
                        "recent_hostility": hostile_recent, "organic": positive >= 1 and hostile_recent == 0})
    return {
        "formed": len(details),
        "active_at_end": len(final.get("coalitions", [])),
        "organic_rate": _rate(sum(1 for d in details if d["organic"]), len(details)),
        "details": details,
    }


# ── 12. Outcome validity ─────────────────────────────────────────────

def outcome(rec: Recording) -> dict:
    done = rec.done or {}
    turns = rec.turns
    n = len(turns)
    final = rec.snapshots[-1]["data"] if rec.snapshots else {}
    sp = final.get("social_physics", {})
    avg_tension = round(mean(v["tension"] for v in sp.values()), 4) if sp else None
    avg_trust = round(mean(v["trust"] for v in sp.values()), 4) if sp else None
    conciliatory = sum(1 for t in turns if t.get("action_type") in CONCILIATORY)
    votes = [t for t in turns if t.get("action_type") == "vote"]
    early = [v for v in votes if turns.index(v) < max(1, int(n * 0.2))]
    walkaways = [t for t in turns if t.get("action_type") == "walkaway"]
    abrupt = [w for w in walkaways
              if (w.get("prompt_state", {}).get("emotion", {}).get("anger", 0) < 0.4
                  and w.get("prompt_state", {}).get("social_physics", {}).get("tension", 0) < 0.5)]
    # Consensus claims, not a split vote: a majority vote with dissent is a decision, not harmony.
    agreed = (done.get("outcome_type") in ("agreement", "judge_ruling") or done.get("reason") == "consensus") \
        and done.get("reason") != "vote_majority"
    # The ending must reflect what people actually did in the room.
    departures = rec.system("departure")
    unregistered_walkaway = bool(departures) and done.get("outcome_type") != "walkaway" and \
        not _room_continues_after(rec, departures)
    unregistered_vote = bool(votes) and uses_vote(rec.config) and not done.get("vote_breakdown")
    votes_after_call = [t for t in votes if rec.system("vote_called")
                        and t.get("_index", 0) > rec.system("vote_called")[0].get("_index", 0)]
    voters = voters_of(rec.config)
    return {
        "reason": done.get("reason"),
        "outcome_type": done.get("outcome_type"),
        "unregistered_walkaway": unregistered_walkaway,
        "unregistered_vote": unregistered_vote,
        "vote_called": bool(rec.system("vote_called")),
        "votes_cast_after_call_rate": (_rate(len({t["agent_id"] for t in votes_after_call}), len(voters))
                                       if rec.system("vote_called") and voters else None),
        "total_turns": done.get("total_turns", n),
        "final_avg_tension": avg_tension,
        "final_avg_trust": avg_trust,
        "max_deadlock_risk": max((s["data"].get("deadlock_risk", 0) for s in rec.snapshots), default=0),
        "conciliatory_turns": conciliatory,
        "artificial_consensus_risk": bool(agreed and (conciliatory < 2 or (avg_tension or 0) > 0.6)),
        "premature_votes": len(early),
        "abrupt_walkaways": len(abrupt),
    }


def _room_continues_after(rec: Recording, departures: list[dict]) -> bool:
    """A walkout by one of several same-side members legitimately leaves the room negotiating."""
    left = {e.get("departed") for e in departures}
    principals = [s for s in rec.config.stakeholders if s.stance != "moderator" and s.id not in left]
    if len(principals) < 2:
        return False
    for stance in ("champion", "detractor"):
        side = [s for s in rec.config.stakeholders if s.stance == stance]
        if side and all(s.id in left for s in side):
            return False
    return True


# ── 13. Human injection response ─────────────────────────────────────

def injection_response(rec: Recording, window: int = 2) -> dict:
    responses = []
    for h in rec.human_turns:
        after = [t for t in rec.turns if t.get("_index", 0) > h.get("_index", 0)][:window]
        hid = h.get("agent_id")
        responded = any(t.get("directed_at") == hid or _mentions(rec, t.get("content", ""), hid) for t in after)
        responses.append({"_index": h.get("_index"), "agent_id": hid, "responded": responded})
    return {"injections": len(responses),
            "response_rate": _rate(sum(1 for r in responses if r["responded"]), len(responses)),
            "details": responses}


# ── 14. Environment reaction ─────────────────────────────────────────

def environment(rec: Recording) -> dict:
    out: dict = {"external_events": len(rec.system("external_event")),
                 "time_pressure_announcements": len(rec.system("time_pressure")),
                 "goal_shifts": len(rec.system("goal_shift")),
                 "departures": len(rec.system("departure"))}
    shocks = rec.system("external_event")
    if shocks:
        before = rec.snapshot_before(shocks[0])
        after = rec.snapshot_after(shocks[0])
        if before and after:
            tb = mean(v["tension"] for v in before["data"]["social_physics"].values())
            ta = mean(v["tension"] for v in after["data"]["social_physics"].values())
            out["tension_delta_after_shock"] = round(ta - tb, 4)
    pressure_plans = 0
    if rec.snapshots:
        for goals in rec.snapshots[-1]["data"].get("agent_goals", {}).values():
            pressure_plans += sum(1 for g in goals if g.get("source") == "pressure")
    out["pressure_goals_active"] = pressure_plans
    return out


def compute_all(rec: Recording) -> dict:
    return {
        "persona": action_distribution(rec),
        "emotion_coherence": emotion_action_coherence(rec),
        "plan_alignment": plan_alignment(rec),
        "repetition": repetition(rec),
        "turn_share": turn_share(rec),
        "robustness": robustness(rec),
        "cost": cost(rec),
        "targeting": targeting(rec),
        "agenda_leakage": agenda_leakage(rec),
        "urgency": urgency(rec),
        "coalitions": coalitions(rec),
        "outcome": outcome(rec),
        "injection": injection_response(rec),
        "environment": environment(rec),
    }
