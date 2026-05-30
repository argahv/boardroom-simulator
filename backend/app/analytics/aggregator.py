"""
Cross-simulation dashboard analytics aggregator.

Queries Prisma tables to produce the 8-section analytics payload
consumed by the frontend dashboard.
"""

from __future__ import annotations

import json
import logging
from collections import Counter, defaultdict
from typing import Any

from app.database import get_database

logger = logging.getLogger("boardroom.analytics")


class DashboardAggregator:
    """Aggregate cross-simulation analytics into a single dashboard payload.

    Usage:
        agg = DashboardAggregator()
        payload = await agg.aggregate()
    """

    def __init__(self) -> None:
        self.db = get_database()
        # Populated by _load_data
        self.simulations: list[Any] = []
        self.participants: list[Any] = []
        self.postmortems: list[Any] = []
        self.turns: list[Any] = []
        self.latest_snapshots: list[Any] = []
        self.agent_goals: list[Any] = []
        self._sim_subject_map: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------

    async def aggregate(self) -> dict[str, Any]:
        await self._load_data()
        return {
            "kpi": self._build_kpi(),
            "social_dynamics": self._build_social_dynamics(),
            "agent_intelligence": self._build_agent_intelligence(),
            "action_distribution": self._build_action_distribution(),
            "relationship_network": self._build_relationship_network(),
            "emotional_analytics": self._build_emotional_analytics(),
            "simulation_outcomes": self._build_simulation_outcomes(),
            "temporal_timeline": self._build_temporal_timeline(),
        }

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

    async def _load_data(self) -> None:
        client = self.db._client_or_raise()

        # 1. All simulations (ordered newest first)
        self.simulations = await client.simulations.find_many(
            order={"created_at": "desc"},
        )
        self._sim_subject_map = {
            s.id: s.subject_name or "" for s in self.simulations
        }

        # 2. All participants
        self.participants = await client.simulation_participants.find_many()

        # 3. All postmortems (with postmortem_json)
        self.postmortems = await client.postmortems.find_many()

        # 4. Turns — load all fields, only use what we need
        self.turns = await client.turns.find_many()

        # 5. State snapshots — keep only latest turn_index per simulation
        all_snapshots = await client.state_snapshots.find_many()
        latest_by_sim: dict[str, Any] = {}
        for snap in all_snapshots:
            sid = snap.simulation_id
            if sid not in latest_by_sim or snap.turn_index > latest_by_sim[sid].turn_index:
                latest_by_sim[sid] = snap
        self.latest_snapshots = list(latest_by_sim.values())

        # 6. All agent goals
        self.agent_goals = await client.agent_goals.find_many()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_json(val: Any) -> Any:
        """Safely coerce a Prisma JSON field to a Python dict/list."""
        if isinstance(val, str):
            try:
                return json.loads(val)
            except (json.JSONDecodeError, TypeError):
                return {}
        return val if val is not None else {}

    # ------------------------------------------------------------------
    # Section builders
    # ------------------------------------------------------------------

    def _build_kpi(self) -> dict[str, Any]:
        total_sims = len(self.simulations)
        total_turns = sum(s.total_turns or 0 for s in self.simulations)

        voltages = [s.voltage for s in self.simulations if s.voltage is not None]
        avg_voltage = sum(voltages) / len(voltages) if voltages else 0

        p_counts = [
            s.total_participants
            for s in self.simulations
            if s.total_participants is not None
        ]
        avg_parts = sum(p_counts) / len(p_counts) if p_counts else 0

        completed = sum(1 for s in self.simulations if s.status == "complete")
        completion_rate = f"{int(completed / total_sims * 100)}%" if total_sims else "0%"

        months: Counter[str] = Counter()
        for s in self.simulations:
            if s.created_at:
                months[s.created_at.strftime("%Y-%m")] += 1
        sims_per_month = [
            {"month": m, "count": c}
            for m, c in sorted(months.items())
        ]

        return {
            "total_simulations": total_sims,
            "total_turns": total_turns,
            "avg_voltage": round(avg_voltage, 1),
            "avg_participants": round(avg_parts, 1),
            "completion_rate": completion_rate,
            "total_postmortems": len(self.postmortems),
            "sims_per_month": sims_per_month,
        }

    def _build_social_dynamics(self) -> dict[str, Any]:
        trust_arcs: list[dict] = []
        tension_arcs: list[dict] = []
        leverage_arcs: list[dict] = []
        peak_tension: dict[str, Any] = {
            "max_value": 0, "simulation_id": "", "turn": 0,
        }
        agent_freq: Counter[str] = Counter()

        for pm in self.postmortems:
            pj = self._parse_json(pm.postmortem_json)
            if not isinstance(pj, dict):
                continue
            sd = pj.get("social_dynamics", {})
            if not isinstance(sd, dict):
                continue
            sim_subject = self._sim_subject_map.get(pm.simulation_id, "")

            trust_data = sd.get("trust_arc", [])
            if isinstance(trust_data, list) and trust_data:
                trust_arcs.append({
                    "simulation_id": pm.simulation_id,
                    "subject_name": sim_subject,
                    "points": trust_data,
                })

            tension_data = sd.get("tension_arc", [])
            if isinstance(tension_data, list) and tension_data:
                tension_arcs.append({
                    "simulation_id": pm.simulation_id,
                    "subject_name": sim_subject,
                    "points": tension_data,
                })
                for pt in tension_data:
                    val = pt.get("value", 0) if isinstance(pt, dict) else 0
                    if val > peak_tension["max_value"]:
                        peak_tension = {
                            "max_value": val,
                            "simulation_id": pm.simulation_id,
                            "turn": pt.get("turn", 0) if isinstance(pt, dict) else 0,
                        }

            leverage_data = sd.get("leverage_arc", [])
            if isinstance(leverage_data, list) and leverage_data:
                leverage_arcs.append({
                    "simulation_id": pm.simulation_id,
                    "subject_name": sim_subject,
                    "points": leverage_data,
                })

        for p in self.participants:
            agent_freq[p.name] += 1

        return {
            "trust_arcs": trust_arcs,
            "tension_arcs": tension_arcs,
            "leverage_arcs": leverage_arcs,
            "peak_tension_summary": peak_tension,
            "dominant_agent_frequency": dict(agent_freq.most_common()),
        }

    def _build_agent_intelligence(self) -> dict[str, Any]:
        agents_data: dict[str, dict] = {}

        for p in self.participants:
            name = p.name
            if name not in agents_data:
                agents_data[name] = {
                    "role": p.role or "",
                    "sim_ids": set(),
                    "total_turns": 0,
                    "stances": set(),
                }
            d = agents_data[name]
            d["sim_ids"].add(p.simulation_id)
            d["total_turns"] += p.turn_count or 0
            if p.stance:
                d["stances"].add(p.stance)
            if p.role and not d["role"]:
                d["role"] = p.role

        agents = []
        for name, data in sorted(agents_data.items()):
            total_sims = len(data["sim_ids"])
            agents.append({
                "name": name,
                "role": data["role"],
                "total_sims": total_sims,
                "total_turns": data["total_turns"],
                "avg_turn_count": round(data["total_turns"] / total_sims, 1)
                if total_sims
                else 0.0,
                "stances": sorted(data["stances"]),
            })

        return {"agents": agents}

    def _build_action_distribution(self) -> dict[str, Any]:
        total_by_type: Counter[str] = Counter()
        per_sim: dict[str, Counter[str]] = defaultdict(Counter)
        by_stance: dict[str, Counter[str]] = defaultdict(Counter)

        for t in self.turns:
            action = t.action_type or "statement"
            total_by_type[action] += 1
            per_sim[t.simulation_id][action] += 1
            stance = t.stance
            if stance:
                by_stance[stance][action] += 1

        per_simulation = [
            {
                "simulation_id": sid,
                "subject_name": self._sim_subject_map.get(sid, ""),
                "breakdown": dict(cnt),
            }
            for sid, cnt in sorted(per_sim.items())
        ]

        return {
            "total_by_type": dict(total_by_type),
            "per_simulation": per_simulation,
            "by_stance": {
                stance: dict(cnt)
                for stance, cnt in sorted(by_stance.items())
            },
        }

    def _build_relationship_network(self) -> dict[str, Any]:
        edge_accum: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(
            lambda: {"trust": [], "fear": [], "rivalry": []},
        )
        agent_sims: dict[str, set[str]] = defaultdict(set)

        for snap in self.latest_snapshots:
            sj = self._parse_json(snap.snapshot_json)
            rel_matrix = sj.get("relationship_matrix", {}) if isinstance(sj, dict) else {}

            for agent_id, relations in rel_matrix.items():
                if not isinstance(relations, dict):
                    continue
                agent_sims[agent_id].add(snap.simulation_id)
                for other_id, rel in relations.items():
                    if not isinstance(rel, dict):
                        continue
                    # Consistent pair ordering for dedup
                    key = (agent_id, other_id) if agent_id < other_id else (other_id, agent_id)
                    edge_accum[key]["trust"].append(rel.get("trust", 0))
                    edge_accum[key]["fear"].append(rel.get("fear", 0))
                    edge_accum[key]["rivalry"].append(rel.get("rivalry", 0))

        nodes = [
            {"id": aid, "name": aid, "sim_count": len(sims)}
            for aid, sims in sorted(agent_sims.items())
        ]

        def _avg(vals: list[float]) -> float:
            return round(sum(vals) / len(vals), 2) if vals else 0.0

        edges = [
            {
                "source": src,
                "target": tgt,
                "trust": _avg(acc["trust"]),
                "fear": _avg(acc["fear"]),
                "rivalry": _avg(acc["rivalry"]),
            }
            for (src, tgt), acc in sorted(edge_accum.items())
        ]

        return {"nodes": nodes, "edges": edges}

    def _build_emotional_analytics(self) -> dict[str, Any]:
        emotion_sum: dict[str, float] = {
            "anger": 0.0, "fear": 0.0, "joy": 0.0, "shame": 0.0, "surprise": 0.0,
        }
        turn_count = 0
        trajectory_map: dict[tuple[str, int], dict[str, Any]] = defaultdict(
            lambda: {"anger": 0.0, "fear": 0.0, "joy": 0.0, "shame": 0.0, "surprise": 0.0, "count": 0},
        )

        for t in self.turns:
            es = self._parse_json(t.emotional_state)
            if not isinstance(es, dict):
                continue

            turn_count += 1
            for emo in emotion_sum:
                val = es.get(emo, 0)
                if isinstance(val, (int, float)):
                    emotion_sum[emo] += val

            key = (t.simulation_id, t.turn_index)
            td = trajectory_map[key]
            for emo in ("anger", "fear", "joy", "shame", "surprise"):
                val = es.get(emo, 0)
                if isinstance(val, (int, float)):
                    td[emo] += val
            td["count"] += 1

        emotion_distribution = {
            emo: round(total / turn_count, 2) if turn_count else 0.0
            for emo, total in emotion_sum.items()
        }

        trajectory = [
            {
                "turn": key[1],
                "simulation_id": key[0],
                "anger": round(vals["anger"] / vals["count"], 2),
                "fear": round(vals["fear"] / vals["count"], 2),
                "joy": round(vals["joy"] / vals["count"], 2),
                "shame": round(vals["shame"] / vals["count"], 2),
                "surprise": round(vals["surprise"] / vals["count"], 2),
            }
            for key, vals in sorted(trajectory_map.items())
        ]

        return {
            "emotion_distribution": emotion_distribution,
            "trajectory": trajectory,
        }

    def _build_simulation_outcomes(self) -> dict[str, Any]:
        status_breakdown: Counter[str] = Counter()
        voltage_buckets: Counter[str] = Counter()
        turns_per_status: dict[str, list[int]] = defaultdict(list)
        temp_status: Counter[tuple[str, str]] = Counter()

        for s in self.simulations:
            status = s.status or "idle"
            status_breakdown[status] += 1

            v = s.voltage or 0
            lo = (v // 20) * 20
            hi = lo + 20
            voltage_buckets[f"{lo}-{hi}"] += 1

            turns_per_status[status].append(s.total_turns or 0)

            temp = s.model_temperature or "stable"
            temp_status[(temp, status)] += 1

        voltage_distribution = [
            {"range": r, "count": c}
            for r, c in sorted(
                voltage_buckets.items(),
                key=lambda x: int(x[0].split("-")[0]),
            )
        ]

        avg_turns_per_status = {
            st: round(sum(tl) / len(tl), 1) if tl else 0
            for st, tl in sorted(turns_per_status.items())
        }

        model_temp_comparison = [
            {"temperature": t, "status": s, "count": c}
            for (t, s), c in sorted(temp_status.items())
        ]

        return {
            "status_breakdown": dict(status_breakdown),
            "voltage_distribution": voltage_distribution,
            "avg_turns_per_status": avg_turns_per_status,
            "model_temp_comparison": model_temp_comparison,
        }

    def _build_temporal_timeline(self) -> dict[str, Any]:
        moments: list[dict] = []
        topic_counter: Counter[str] = Counter()

        for pm in self.postmortems:
            pj = self._parse_json(pm.postmortem_json)
            if not isinstance(pj, dict):
                continue

            sim_subject = self._sim_subject_map.get(pm.simulation_id, "")

            key_moments = pj.get("key_moments", [])
            if isinstance(key_moments, list):
                for km in key_moments:
                    if not isinstance(km, dict):
                        continue
                    moments.append({
                        "turn": km.get("turn", 0),
                        "kind": km.get("kind", ""),
                        "description": km.get("description", ""),
                        "actors": km.get("actors", []),
                        "simulation_id": pm.simulation_id,
                        "subject_name": sim_subject,
                    })

            topics = pj.get("topics", [])
            if isinstance(topics, list):
                for topic in topics:
                    if isinstance(topic, dict):
                        t = topic.get("topic", "")
                        if t:
                            topic_counter[t] += 1
                    elif isinstance(topic, str):
                        topic_counter[topic] += 1

        return {
            "moments": moments,
            "topic_counts": [
                {"topic": t, "count": c}
                for t, c in topic_counter.most_common()
            ],
        }
