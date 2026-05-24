# Snapshot Schema — Boardroom Simulator

## Section 1: Fields in `get_public_state()`

Source: `behavior_engine.py:95-98`

```python
def get_public_state(self) -> dict:
    return {
        "turn_count": self._turn_count,
        "relationship_matrix": self._graph.to_matrix(),
        "social_physics": {aid: sp.snapshot() for aid, sp in self._social_physics.items()},
        "agent_states": {aid: st.snapshot() for aid, st in self._internal_states.items()},
    }
```

### Top-Level Fields

| Field | Type | Description | Source Module |
|-------|------|-------------|---------------|
| `turn_count` | `int` | Total turns processed so far | `behavior_engine.py` |
| `relationship_matrix` | `dict[str, dict[str, dict]]` | NxN directed edge weights | `relationship_graph.py:104-117` |
| `social_physics` | `dict[str, dict]` | Per-agent 6-dimension state | `social_physics.py:109-118` |
| `agent_states` | `dict[str, dict]` | Per-agent cognitive state | `internal_state.py:90-99` |

### `social_physics[agent_id]` — Per-Agent Social State

Source: `social_physics.py:109-118`

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `trust` | `float` | 0.0-1.0 | Generalized trust (global average) |
| `leverage` | `float` | 0.0-1.0 | Bargaining power |
| `tension` | `float` | 0.0-1.0 | Conversational friction |
| `dominance` | `float` | 0.0-1.0 | Control of the conversation |
| `credibility` | `float` | 0.0-1.0 | Perceived believability |
| `momentum` | `float` | -1.0-1.0 | Trajectory direction |
| `triggers` | `list[str]` | — | Active threshold triggers (e.g. `escalation_risk`, `trust_collapse`) |

### `relationship_matrix[from_agent][to_agent]` — Pairwise Relationship

Source: `relationship_graph.py:104-117`

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `trust` | `float` | 0.0-1.0 | Directed trust from A to B |
| `fear` | `float` | 0.0-1.0 | Fear A has of B |
| `admiration` | `float` | 0.0-1.0 | Admiration A has for B |
| `rivalry` | `float` | 0.0-1.0 | Rivalry A feels toward B |
| `alliance` | `bool` | true/false | Whether A considers B an ally |
| `dependency` | `float` | 0.0-1.0 | How much A depends on B |

### `agent_states[agent_id]` — Per-Agent Cognitive State

Source: `internal_state.py:90-99`

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `agent_id` | `str` | — | Agent identifier |
| `emotion` | `dict[str, float]` | 0.0-1.0 | 5 emotions: anger, fear, joy, shame, surprise |
| `confidence` | `float` | 0.0-1.0 | Self-confidence level |
| `certainty` | `float` | 0.0-1.0 | Certainty in current position |
| `focus` | `str` | — | Current goal/focus text |
| `goal_priority` | `int` | 0-5 | Priority level of current focus |

---

## Section 2: Fields Tracked But NOT in Public State

### `get_state_for_llm()` — Additional Fields (Not in Public State)

Source: `behavior_engine.py:85-93`

These fields ARE computed and available per-agent, but deliberately excluded from `get_public_state()`:

| Field | Range | Source | Gap Severity |
|-------|-------|--------|-------------|
| `trust_scores[other_agent]` | 0.0-1.0 | `relationship_graph.get(aid, other).trust` | **HIGH** — pairwise trust per agent is critical for debugging |
| `allies` | `list[str]` | `relationship_graph.get_allies(aid)` | **MEDIUM** — derivable from relationship_matrix |
| `rivals` | `list[str]` | `relationship_graph.get_rivals(aid)` | **MEDIUM** — derivable from relationship_matrix |

### Modules Entirely Missing from Public State

| Module | Data Available | Why Missing | Severity |
|--------|---------------|-------------|----------|
| `goal_evolution.py` | `get_active_goals(agent_id) -> list[GoalState]` | Never wired into state | **HIGH** — goals are core agent state |
| `private_thought.py` | `snapshot() -> dict` (public_position, strategy_hint, confidence) | Never wired into state | **HIGH** — strategy is critical for debugging |
| `whisper.py` | `channel_history() -> list[dict]` | By design (private comms) | **LOW** — agent-internal |
| `hidden_info.py` | `known_by(agent_id, observer) -> list[dict]` | By design (hidden info) | **LOW** — spoilers |
| `coalition_detection.py` | `get_active() -> list[Coalition]` | Never wired into state | **MEDIUM** — derivable from relationship_matrix alliances |

---

## Section 3: Schema Version Recommendations

- Start with `snapshot_version: int = 1`
- When new fields are added to `get_public_state()`, bump version
- Use the version field in `v2_state_snapshots` table for migration detection
- Frontend should check `snapshot_version` and render accordingly (graceful degradation for unknown versions)
- Future: add `snapshot_id` (UUID) for exact replay positioning
