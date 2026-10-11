"""Cross-meeting insights: outcome mapping, rates, people and headlines from plain rows."""

from datetime import datetime, timedelta, timezone

from app.analytics.insights import build_insights, outcome_kind, _gini

NOW = datetime(2026, 10, 11, tzinfo=timezone.utc)


def _sim(i, outcome, people=3, days_ago=1, voltage=50):
    return {"id": f"s{i}", "subject_name": f"Meeting {i}", "status": "complete", "voltage": voltage,
            "model_temperature": "volatile", "created_at": NOW - timedelta(days=days_ago),
            "outcome": outcome, "people": people}


def _room(i):
    return [{"id": f"s{i}-{n}", "simulation_id": f"s{i}", "persona_id": f"p-{n}", "name": n.title(),
             "role": "", "stance": "neutral"} for n in ("ann", "ben", "cy")]


def _turns(i, actions, speaker="ann", target="ben", vote=None):
    return [{"simulation_id": f"s{i}", "participant_id": f"s{i}-{speaker if k % 2 == 0 else target}",
             "turn_index": k, "action_type": a, "emotional_state": {"anger": 0.5},
             "turn_data": {"turn_number": k + 1, "agent_id": speaker if k % 2 == 0 else target,
                           "directed_at": target if k % 2 == 0 else speaker,
                           **({"vote": vote} if vote and k == len(actions) - 1 else {}),
                           "llm": {"fallback": k == 0, "parse_ok": True, "latency_ms": 100, "tokens": 50}}}
            for k, a in enumerate(actions)]


CARRIED = {"reason": "vote_majority", "outcome_type": "agreement"}
STALLED = {"reason": "timeout", "outcome_type": "no_decision"}


def test_outcome_kind_maps_every_ending():
    assert outcome_kind(CARRIED, "complete") == "carried"
    assert outcome_kind({"reason": "vote_majority", "outcome_type": "rejected"}, "complete") == "voted_down"
    assert outcome_kind({"reason": "walkaway", "outcome_type": "walkaway"}, "complete") == "walkout"
    assert outcome_kind({"reason": "consensus", "outcome_type": "agreement"}, "complete") == "agreed"
    assert outcome_kind({"reason": "stopped", "outcome_type": "no_decision"}, "complete") == "stopped"
    assert outcome_kind(STALLED, "complete") == "stalled"
    assert outcome_kind(None, "idle") == "unfinished"


def test_gini_is_zero_when_equal_and_high_when_one_speaks():
    assert _gini([3, 3, 3]) == 0.0
    assert _gini([9, 0, 0]) > 0.6


def test_rates_people_and_window():
    sims = [_sim(1, CARRIED), _sim(2, CARRIED), _sim(3, STALLED), _sim(4, STALLED),
            _sim(5, None), _sim(6, CARRIED, days_ago=90)]
    parts = [p for i in range(1, 7) for p in _room(i)]
    turns = (_turns(1, ["compromise", "agreement", "compromise", "vote"], vote="yes")
             + _turns(2, ["compromise", "challenge", "agreement", "vote"], vote="yes")
             + _turns(3, ["challenge", "escalate", "challenge", "interrupt"])
             + _turns(4, ["escalate", "challenge", "challenge", "statement"]))
    out = build_insights(sims, parts, turns, days=30, now=NOW)

    assert out["totals"]["meetings"] == 5  # the 90-day-old one is outside the window
    o = out["outcomes"]
    assert o["finished"] == 4 and o["decision_rate"] == 0.5 and o["stall_rate"] == 0.5
    assert {m["kind"]: m["count"] for m in o["mix"]} == {"carried": 2, "stalled": 2, "unfinished": 1}

    moves = {m["action"]: m for m in out["tactics"]["moves"]}
    assert moves["compromise"]["share_open"] == 0 and moves["compromise"]["lift"] is None
    assert moves["challenge"]["lift"] < 1
    assert "vote" not in moves  # a vote is the ending itself, not a move toward it

    ann = next(p for p in out["people"] if p["name"] == "Ann")
    ben = next(p for p in out["people"] if p["name"] == "Ben")
    assert ann["meetings"] == 5 and ann["targeted_per_meeting"] > 0
    assert ben["votes"] == {"yes": 2} and ben["sided_with_result"] == 1.0
    assert ann["airtime"] == 1.5  # two of three seats spoke, evenly

    q = out["quality"]
    assert q["fallback_rate"] == 0.25 and q["never_finished"] == 1
    assert out["recent"][0]["label"] == "Motion carried"


def test_empty_is_safe():
    out = build_insights([], [], [], now=NOW)
    assert out["totals"]["meetings"] == 0 and out["headlines"] == [] and out["outcomes"]["decision_rate"] is None
