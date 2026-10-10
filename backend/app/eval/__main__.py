"""Evaluation CLI.

    python -m app.eval list
    python -m app.eval run   [--scenarios all|a,b] [--seeds 3] [--llm stub|openrouter]
                             [--judge none|llm|stub] [--judge-sample 0.3] [--judge-max 20]
                             [--out DIR] [--baseline report.json] [--save-baseline PATH]
    python -m app.eval score RECORDING_OR_DIR... [--judge ...] [--out DIR]
    python -m app.eval sensitivity RECORDING_OR_DIR... [--judge llm] [--per-probe 8]
    python -m app.eval compare CURRENT_REPORT BASELINE_REPORT [--tolerance 0.05]
    python -m app.eval calibrate --labels labels.jsonl RECORDING_OR_DIR...

Exit code is 1 when a baseline comparison finds regressions or any run
violates an engine invariant.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

from app.eval import judge as judge_mod
from app.eval import runner, scorecard
from app.eval.recording import Recording
from app.eval.scenarios import SCENARIOS


def _out_dir(arg: str | None) -> Path:
    path = Path(arg) if arg else Path("data/eval") / datetime.now().strftime("%Y%m%d-%H%M%S")
    path.mkdir(parents=True, exist_ok=True)
    return path


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, default=str))


def _recording_paths(items: list[str]) -> list[Path]:
    out: list[Path] = []
    for item in items:
        p = Path(item)
        out.extend(sorted(p.glob("*.json")) if p.is_dir() else [p])
    return out


def _print_report(rep: dict, regressions: list[dict] | None = None) -> None:
    print(f"\n{'scenario':<24} {'runs':>4} {'viol':>5} {'expect':>7}  outcomes")
    for name, agg in rep["scenarios"].items():
        exp = agg["headline"].get("expectations.pass_rate", {}).get("mean")
        print(f"{name:<24} {agg['runs']:>4} {agg['invariant_violations_total']:>5} "
              f"{'-' if exp is None else f'{exp:.2f}':>7}  {agg['outcome_distribution']}")
        for ename, e in agg["expectations"].items():
            if e["pass_rate"] is not None and e["pass_rate"] < 1:
                print(f"{'':<26}✗ {ename}: pass {e['pass_rate']:.2f} ({e['decided']}/{e['runs']} decided)")
    overall = rep.get("overall", {}).get("headline", {})
    if overall:
        print("\noverall headline (mean):")
        for k, v in overall.items():
            print(f"  {k:<44} {v['mean']}")
    if regressions is not None:
        print(f"\nregressions vs baseline: {len(regressions)}")
        for r in regressions:
            print(f"  ✗ {r['scenario']}: {r['metric']} {r['baseline']} -> {r['current']}")


async def cmd_run(args) -> int:
    keys = list(SCENARIOS) if args.scenarios == "all" else [k.strip() for k in args.scenarios.split(",")]
    unknown = [k for k in keys if k not in SCENARIOS]
    if unknown:
        print(f"unknown scenarios: {unknown}; see `python -m app.eval list`", file=sys.stderr)
        return 2
    out = _out_dir(args.out)
    cards: dict[str, list[dict]] = {}
    for key in keys:
        for seed in range(args.seeds):
            rec = await runner.run_scenario(SCENARIOS[key], seed=seed, llm_kind=args.llm)
            rec.save(out / "recordings")
            card = await runner.evaluate(rec, SCENARIOS[key], judge_kind=args.judge,
                                         judge_sample=args.judge_sample, judge_max=args.judge_max, seed=seed)
            _write(out / "scorecards" / f"{rec.simulation_id}.json", card)
            cards.setdefault(key, []).append(card)
            print(f"✓ {key} seed={seed}: {len(rec.turns)} turns, "
                  f"{len(card['invariants']['violations'])} violations, "
                  f"outcome={card['metrics']['outcome']['outcome_type']}")
    return _finish(out, cards, args)


async def cmd_score(args) -> int:
    out = _out_dir(args.out)
    cards: dict[str, list[dict]] = {}
    for path in _recording_paths(args.recordings):
        rec = Recording.load(path)
        scen = SCENARIOS.get(rec.meta.get("scenario") or "")
        card = await runner.evaluate(rec, scen, judge_kind=args.judge, judge_sample=args.judge_sample,
                                     judge_max=args.judge_max)
        _write(out / "scorecards" / f"{rec.simulation_id}.json", card)
        cards.setdefault(card["scenario"] or "adhoc", []).append(card)
    return _finish(out, cards, args)


def _finish(out: Path, cards: dict[str, list[dict]], args) -> int:
    rep = scorecard.report(cards)
    _write(out / "report.json", rep)
    regressions = None
    if getattr(args, "baseline", None):
        regressions = scorecard.compare(rep, json.loads(Path(args.baseline).read_text()), args.tolerance)
        _write(out / "regressions.json", regressions)
    if getattr(args, "save_baseline", None):
        _write(Path(args.save_baseline), rep)
    _print_report(rep, regressions)
    print(f"\nwritten to {out}")
    violations = sum(a["invariant_violations_total"] for a in rep["scenarios"].values())
    return 1 if (regressions or violations) else 0


def cmd_compare(args) -> int:
    cur = json.loads(Path(args.current).read_text())
    base = json.loads(Path(args.baseline).read_text())
    regressions = scorecard.compare(cur, base, args.tolerance)
    _print_report(cur, regressions)
    return 1 if regressions else 0


async def cmd_calibrate(args) -> int:
    labels = [json.loads(line) for line in Path(args.labels).read_text().splitlines() if line.strip()]
    recs = {r.simulation_id: r for r in (Recording.load(p) for p in _recording_paths(args.recordings))}
    judge_llm = runner.make_judge(args.judge)
    results = []
    for lab in labels:
        rec = recs.get(lab.get("simulation_id"))
        turn = next((t for t in rec.turns if t.get("_index") == lab.get("_index")), None) if rec else None
        if turn is None:
            print(f"skipping label {lab.get('simulation_id')}#{lab.get('_index')}: turn not found", file=sys.stderr)
            continue
        results.append(await judge_mod.judge_turn(rec, turn, llm=judge_llm))
    rep = judge_mod.calibrate(results, labels)
    print(json.dumps(rep, indent=1))
    return 0 if rep.get("trustworthy") else 1


async def cmd_sensitivity(args) -> int:
    from app.eval import sensitivity
    recs = [Recording.load(p) for p in _recording_paths(args.recordings)]
    rep = await sensitivity.run(recs, llm=runner.make_judge(args.judge), per_probe=args.per_probe, seed=args.seed)
    if args.out:
        _write(Path(args.out), rep)
    print(f"\n{'probe':<16} {'dimension':<20} {'n':>3} {'caught':>7} {'mean drop':>10}")
    for name, v in rep["probes"].items():
        drop = "-" if v["mean_drop"] is None else f"{v['mean_drop']:.2f}"
        print(f"{name:<16} {v['dimension']:<20} {v['n']:>3} {v['detection_rate']:>7.0%} {drop:>10}")
    print(f"\noverall detection {rep['overall_detection_rate']}; sensitive={rep['sensitive']} "
          "(every probe caught >= 80% of the time)")
    return 0 if rep["sensitive"] else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.eval", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="list benchmark scenarios")

    def judge_opts(p):
        p.add_argument("--judge", choices=["none", "llm", "stub"], default="none")
        p.add_argument("--judge-sample", type=float, default=1.0, help="fraction of turns to judge")
        p.add_argument("--judge-max", type=int, default=None, help="max judged turns per run")

    r = sub.add_parser("run", help="run scenarios and score them")
    r.add_argument("--scenarios", default="all")
    r.add_argument("--seeds", type=int, default=1)
    r.add_argument("--llm", choices=["stub", "openrouter"], default="stub")
    r.add_argument("--out")
    r.add_argument("--baseline")
    r.add_argument("--save-baseline")
    r.add_argument("--tolerance", type=float, default=0.05)
    judge_opts(r)

    s = sub.add_parser("score", help="score existing recordings")
    s.add_argument("recordings", nargs="+")
    s.add_argument("--out")
    s.add_argument("--baseline")
    s.add_argument("--save-baseline")
    s.add_argument("--tolerance", type=float, default=0.05)
    judge_opts(s)

    c = sub.add_parser("compare", help="diff a report against a baseline report")
    c.add_argument("current")
    c.add_argument("baseline")
    c.add_argument("--tolerance", type=float, default=0.05)

    k = sub.add_parser("calibrate", help="compare judge scores with human labels")
    k.add_argument("recordings", nargs="+")
    k.add_argument("--labels", required=True, help="JSONL: {simulation_id, _index, scores:{dim:1-5}, agenda_leak?}")
    k.add_argument("--judge", choices=["llm", "stub"], default="llm")

    z = sub.add_parser("sensitivity", help="break turns on purpose and check the judge notices")
    z.add_argument("recordings", nargs="+")
    z.add_argument("--judge", choices=["llm", "stub"], default="llm")
    z.add_argument("--per-probe", type=int, default=8, help="turns per probe type")
    z.add_argument("--seed", type=int, default=0)
    z.add_argument("--out", help="write the full report (with per-turn rows) here")

    args = ap.parse_args(argv)
    if args.cmd == "list":
        for key, sc in SCENARIOS.items():
            print(f"{key:<24} {sc.description}")
            for e in sc.expectations:
                print(f"{'':<26}- {e.name}: {e.description}")
        return 0
    if args.cmd == "run":
        return asyncio.run(cmd_run(args))
    if args.cmd == "score":
        return asyncio.run(cmd_score(args))
    if args.cmd == "compare":
        return cmd_compare(args)
    if args.cmd == "calibrate":
        return asyncio.run(cmd_calibrate(args))
    if args.cmd == "sensitivity":
        return asyncio.run(cmd_sensitivity(args))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
