"""Hard invariants every recording must satisfy (no LLM needed).

These catch broken emotional loops, state drift and procedural bugs: each
violation is a concrete, reproducible defect in the engine, not a matter of
taste.
"""

from __future__ import annotations

from app.eval.recording import Recording
from app.runtime.context import allowed_actions
from app.runtime.internal_state import compute_modulation
from app.runtime.social_physics import SocialPhysics

EPS = 1e-6
POSITIVE = {"compromise", "agreement", "coalition_signal"}


def _v(name: str, detail: str, event: dict | None = None) -> dict:
    return {"invariant": name, "detail": detail, "_index": (event or {}).get("_index")}


def check(rec: Recording) -> list[dict]:
    violations: list[dict] = []
    for fn in (_structure, _bounds, _speakers, _targets_and_actions, _urgency_blend,
               _derived_state, _cascades, _alliances):
        violations.extend(fn(rec))
    return violations


def _structure(rec: Recording) -> list[dict]:
    out = []
    dones = [e for e in rec.events if e.get("type") == "done"]
    if len(dones) != 1:
        out.append(_v("done_once", f"expected 1 done event, found {len(dones)}"))
    timeouts = len(rec.system("turn_timeout"))
    if rec.snapshots and len(rec.snapshots) != len(rec.turns):
        out.append(_v("snapshot_per_turn",
                      f"{len(rec.snapshots)} snapshots for {len(rec.turns)} turns ({timeouts} timeouts)"))
    return out


def _bounds(rec: Recording) -> list[dict]:
    out = []
    for snap in rec.snapshots:
        data = snap["data"]
        for aid, sp in data.get("social_physics", {}).items():
            for k, val in sp.items():
                if k == "triggers":
                    continue
                lo = -1.0 if k == "momentum" else 0.0
                if not (lo - EPS <= val <= 1.0 + EPS):
                    out.append(_v("bounds", f"{aid}.{k}={val}", snap))
        for aid, st in data.get("agent_states", {}).items():
            for k, val in st.get("emotion", {}).items():
                if not (-EPS <= val <= 1.0 + EPS):
                    out.append(_v("bounds", f"{aid}.emotion.{k}={val}", snap))
        for a, row in data.get("relationship_matrix", {}).items():
            for b, edge in row.items():
                for k in ("trust", "fear", "admiration", "rivalry", "dependency"):
                    if not (-EPS <= edge.get(k, 0) <= 1.0 + EPS):
                        out.append(_v("bounds", f"{a}->{b}.{k}={edge[k]}", snap))
    return out


def _speakers(rec: Recording) -> list[dict]:
    out = []
    if rec.config.speaker_rules.mode in ("weighed_random", "freeform"):
        # Human interjections break the sequence: replying to one is not a repeat.
        for prev, cur in zip(rec.all_turns, rec.all_turns[1:]):
            if prev.get("is_human") or cur.get("is_human"):
                continue
            if prev["agent_id"] == cur["agent_id"] and len(rec.stakeholders) > 1:
                out.append(_v("no_consecutive_speaker", f"{cur['agent_id']} spoke twice in a row", cur))
    departed_at: dict[str, int] = {}
    for e in rec.system("departure"):
        departed_at.setdefault(e.get("departed"), e.get("_index", 0))
    for t in rec.turns:
        if t["agent_id"] in departed_at and t.get("_index", 0) > departed_at[t["agent_id"]]:
            out.append(_v("departed_silent", f"{t['agent_id']} spoke after walking out", t))
    return out


def _targets_and_actions(rec: Recording) -> list[dict]:
    out = []
    allowed = set(allowed_actions(rec.config))
    for t in rec.turns:
        tgt = t.get("directed_at")
        if tgt is not None and (tgt == t["agent_id"] or tgt not in rec.stakeholders):
            out.append(_v("valid_target", f"{t['agent_id']} directed at {tgt!r}", t))
        if t.get("action_type") not in allowed:
            out.append(_v("valid_action", f"unknown action {t.get('action_type')!r}", t))
    return out


def _urgency_blend(rec: Recording) -> list[dict]:
    out = []
    for e in rec.floor_events:
        for aid, d in (e.get("bid_details") or {}).items():
            det, strat, final = d.get("deterministic"), d.get("strategy"), d.get("final")
            if det is None or final is None:
                continue
            expected = det if strat is None else int(det * 0.6 + strat * 0.4)
            expected = max(0, min(100, expected))
            if abs(expected - final) > 1:
                out.append(_v("urgency_blend", f"{aid}: final {final} != 60/40 blend {expected}", e))
            if sum((d.get("components") or {}).values()) != det:
                out.append(_v("urgency_components", f"{aid}: components do not sum to deterministic", e))
    return out


def _derived_state(rec: Recording) -> list[dict]:
    """Triggers and emotional modulation must be exactly what the state implies."""
    out = []
    for snap in rec.snapshots:
        data = snap["data"]
        for aid, sp in data.get("social_physics", {}).items():
            fields = {k: v for k, v in sp.items() if k != "triggers"}
            try:
                expected = SocialPhysics(**fields).threshold_triggers()
            except ValueError:
                continue  # out-of-range values are reported by the bounds check
            if sorted(expected) != sorted(sp.get("triggers", [])):
                out.append(_v("trigger_activation", f"{aid}: triggers {sp.get('triggers')} != {expected}", snap))
        for aid, st in data.get("agent_states", {}).items():
            mod = st.get("modulation") or {}
            if not mod:
                continue
            exp = compute_modulation(st.get("emotion", {}))
            for k, val in mod.items():
                if abs(getattr(exp, k, 0) - val) > 1e-4:
                    out.append(_v("emotional_modulation", f"{aid}.{k}={val} but emotions imply {getattr(exp, k, 0)}", snap))
                    break
    return out


def _cascades(rec: Recording) -> list[dict]:
    """A directed action must move the target's emotions and relationships the right way."""
    out = []
    humans = [h.get("_index", 0) for h in rec.human_turns]
    agent_idx = [t["_index"] for t in rec.turns]
    for t in rec.turns:
        tgt, spk, act = t.get("directed_at"), t["agent_id"], t.get("action_type")
        if not tgt:
            continue
        before, after = rec.snapshot_before(t), rec.snapshot_after(t)
        if not before or not after:
            continue
        # Human interjections are processed just before the next agent turn, so any since
        # the previous agent turn land in this window too.
        prev = max((i for i in agent_idx if i < t["_index"]), default=-1)
        if any(prev < h < after["_index"] for h in humans):
            continue
        b, a = before["data"], after["data"]
        if act in ("challenge", "interrupt"):
            ab = b["agent_states"][tgt]["emotion"]["anger"]
            aa = a["agent_states"][tgt]["emotion"]["anger"]
            if ab < 0.9 and aa <= ab:
                out.append(_v("cascade_anger", f"{act} at {tgt} did not raise anger ({ab:.3f}->{aa:.3f})", t))
            rb = b["relationship_matrix"].get(tgt, {}).get(spk, {}).get("rivalry", 0.2)
            ra = a["relationship_matrix"].get(tgt, {}).get(spk, {}).get("rivalry", 0.2)
            if rb < 0.95 and ra <= rb:
                out.append(_v("cascade_rivalry", f"{act} did not raise {tgt}->{spk} rivalry ({rb:.3f}->{ra:.3f})", t))
        if act == "challenge":
            tb = b["social_physics"][spk]["trust"]
            ta = a["social_physics"][spk]["trust"]
            if tb > 0.15 and ta >= tb:
                out.append(_v("cascade_trust_drop", f"{spk} challenge did not lower trust ({tb:.3f}->{ta:.3f})", t))
        if act in POSITIVE:
            tb = b["relationship_matrix"].get(tgt, {}).get(spk, {}).get("trust", 0.5)
            ta = a["relationship_matrix"].get(tgt, {}).get(spk, {}).get("trust", 0.5)
            if tb < 0.95 and ta <= tb:
                out.append(_v("cascade_trust_gain", f"{act} did not raise {tgt}->{spk} trust ({tb:.3f}->{ta:.3f})", t))
    return out


def _alliances(rec: Recording) -> list[dict]:
    """Alliances only exist where the ally made a positive move first."""
    out = []
    if not rec.snapshots:
        return out
    for snap in rec.snapshots:
        for a, row in snap["data"].get("relationship_matrix", {}).items():
            for b, edge in row.items():
                if not edge.get("alliance"):
                    continue
                prior = [t for t in rec.all_turns if t.get("_index", 0) < snap["_index"]]
                if not any(t.get("agent_id") == a and t.get("directed_at") == b
                           and t.get("action_type") in POSITIVE for t in prior):
                    out.append(_v("alliance_origin", f"{a}->{b} alliance without a positive move by {a}", snap))
    # de-duplicate repeated reports of the same edge
    seen, unique = set(), []
    for v in out:
        if v["detail"] not in seen:
            seen.add(v["detail"])
            unique.append(v)
    return unique
