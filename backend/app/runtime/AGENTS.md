# runtime/ — Simulation Engine

LangGraph StateGraph-based multi-agent negotiation runtime.

## FILES

| File | Lines | Role |
|------|-------|------|
| `agent.py` | 225 | Role-tooled agent builder (CFO, Legal, CTO per-stakeholder) |
| `simulation.py` | — | `run_simulation_v2()` — StateGraph definition |
| `scheduler.py` | 254 | Speaker selection (4 algorithms), turn scheduling |
| `space.py` | — | State management, heatmap, conflict timeline |

## WORKFLOW

```
select_speaker → generate_turn → update_heatmap → should_continue → END
```

## SPEAKER SELECTION ALGORITHMS

1. **Random** — uniform random
2. **Coalition-based** — stakeholders with aligned incentives speak in sequence
3. **Directed-at** — speaker addresses specific stakeholder
4. **Weighted-random** — probability ∝ incentive × voltage

## CONVENTIONS

- Agent tools bound per-role (CFO gets financial tools, Legal gets clause tools)
- Chroma vector store for per-agent semantic retrieval
- Structured Pydantic outputs for every turn, heatmap, conflict timeline
- Guardrails: input filter + jailbreak detector + output hallucination/contradiction checks
- Scoring: confidence trends, consensus rating, objection topology
