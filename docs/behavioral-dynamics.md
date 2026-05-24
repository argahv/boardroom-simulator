# Behavioral Dynamics — How Agents Think, Feel, and Plan

## Overview

The simulation engine produces emergent behavior through three interacting systems:

1. **Emotional Causality** — emotions causally shape action probabilities
2. **Hybrid Urgency** — strategic importance modulates who speaks when
3. **Strategic Horizon** — multi-turn plans guide agent behavior across turns

These systems layer on top of the deterministic social physics (trust, leverage, tension, dominance, credibility, momentum) and the NxN relationship graph (pairwise trust, fear, admiration, rivalry, alliance, dependency).

---

## 1. Emotional Causality

### The Architecture

```
Event → emotions update (deterministic deltas)
       → compute_modulation() fires threshold rules
       → AgentRuntime consumes modulation:
           bidding urgency ± urgency_modifier
           LLM prompt includes bias hints
           interrupt threshold adjusted
```

### Modulation Rules (Deterministic, No LLM)

| Emotion | Threshold | Effect |
|---------|-----------|--------|
| **anger** ≥ 0.7 | interrupt_bias +0.4, compromise_bias -0.3, challenge_bias +0.25, urgency_modifier +15 |
| **fear** ≥ 0.6 | challenge_bias -0.2, coalition_bias +0.2, escalate_bias -0.15, urgency_modifier +10 |
| **joy** ≥ 0.7 | compromise_bias +0.2, statement_bias +0.1, urgency_modifier -10 |
| **shame** ≥ 0.6 | interrupt_bias -0.2, statement_bias -0.15 |
| **surprise** ≥ 0.7 | question_bias +0.2, interrupt_bias +0.15 |

### Scenario: The Angry CFO

```
T1: CEO proposes aggressive timeline
    → CFO emotions: anger 0.2 → 0.35 (small bump from disagreement)

T2: CTO supports CEO, dismissing CFO's concerns publicly
    → CFO emotions: anger 0.35 → 0.65 (challenge directed at CFO)

T3: CFO's urgency spikes (+15 from anger). interrupt_bias = 0.4
    → CFO wins bidding, interrupts current speaker
    → LLM prompt: "you feel an urge to INTERRUPT"
    → CFO speaks aggressively, challenging both CEO and CTO

T4: CFO's compromise_bias = -0.3
    → Any attempt at compromise is met with resistance
    → Conversation becomes positional, not collaborative
```

### Scenario: The Fearful Legal Counsel

```
T1: CEO threatens "we'll find outside counsel if you can't deliver"
    → Legal emotions: fear 0.2 → 0.55 (escalation directed at legal)

T2: Legal's coalition_bias +0.2, challenge_bias -0.2
    → Legal seeks ally (bids less, whispers to ally instead)
    → LLM prompt: "you feel AVOIDANT of direct confrontation"
    → Legal avoids direct challenge, looks for compromise

T3: With coalition support, fear drops
    → Legal speaks more assertively, but framed as alliance proposal
```

---

## 2. Hybrid Urgency

### The Architecture

```
Strategy call (LLM, fast, last 4 events, 2s timeout)
    ↓
deterministic_urgency * 0.6 + strategy_score * 0.4
    ↓
submit_bid(agent_id, hybrid_urgency)
    ↓
Scheduler resolves highest urgency bid → grants floor
```

### Deterministic Component (60%)

```
base = 50 + aggressiveness/2
     + (ally spoke last? -10)
     + (consecutive silence > 5? +20)
     + (tension > 0.7? +15)
     + (dominance > 0.7? +10)
     + emotional urgency_modifier
```

### LLM Strategy Component (40%)

The LLM receives: agent identity, recent discussion (last 4 turns), current goal context.
Returns: 0-100 strategic importance score.
Timeout: 2s. On failure → falls back to deterministic-only (warning logged).

### Scenario: Strategic Silence

```
Agent wants CFO to discredit themselves.
Deterministic urgency: 65 (high tension, aggressive personality)
Strategy score: 20 (LLM senses it's better to let CFO speak)

Hybrid urgency: 65 * 0.6 + 20 * 0.4 = 47

Agent stays quiet. CFO keeps talking, loses credibility.
Next turn: deterministic urgency = 70, strategy score = 85
Hybrid urgency: 70 * 0.6 + 85 * 0.4 = 76

Agent now bids and wins the floor at the perfect strategic moment.
```

---

## 3. Strategic Horizon

### The Architecture

```
Trigger fires (from social physics thresholds)
    ↓
PlanManager.create_plan(goal_text, auto-subgoals)
    ↓
Each turn: plan summary injected into LLM system prompt
    ↓
After each turn: evaluate subgoal progress
    ↓
Subgoal completed → advance plan → recalculate confidence
    ↓
All subgoals done → plan.status = "completed"
```

### Auto-Generated Subgoals

| Goal Pattern | Subgoal 1 | Subgoal 2 |
|-------------|-----------|-----------|
| deescalate / rebuild / repair | acknowledge concerns | offer concessions |
| defend / regain / leverage | restate position with evidence | expose weakness in opposition |
| (default) | establish position | build support |

### Scenario: Trust Collapse → Strategic Recovery

```
T1-3: Agent aggressively challenges CEO on every point
       → CEO's trust in agent drops below 0.2
       → "trust_collapse" trigger fires

T4: PlanManager creates plan "rebuild_trust" (priority 5.0)
    Subgoal 1: acknowledge concerns (strategy: validate the other side)
    Subgoal 2: offer concessions (strategy: propose compromise)

    Agent's system prompt now includes:
    "Active plan: rebuild_trust (confidence 1.0).
     Current objective: acknowledge concerns.
     Strategy: validate the other side's position"

T5: Agent acknowledges CEO's concerns in a conciliatory tone
    → action_type: "statement" with compromising language
    → Subgoal 1 marked completed

T6: Agent's prompt updates:
    "Active plan: rebuild_trust (confidence 0.5).
     Current objective: offer concessions."

    Agent proposes a compromise on secondary issues
    → Subgoal 2 marked completed
    → Plan confidence recalculated

T7: Plan status: "completed"
    → Agent relaxed, trust slowly rebuilding via decay mechanics
```

### Scenario: Multi-Turn Political Campaign

```
Agent's long-term goal visible only in PrivateThoughtSystem:
"Weakens CFO credibility → isolate legal → push vote"

T1-2: Agent questions CFO's financial projections (challenge actions)
      → CFO credibility drops from 0.5 to 0.35

T3-4: Agent proposes coalition with CTO against legal
      → coalition_signal action type
      → Alliance formed: Agent + CTO

T5-6: Agent frames vote as "technical decision, not financial"
      → Pushes vote while CFO's credibility is low

Note: This scenario requires manual plan creation (not auto-generated).
The auto-plan system handles reactive plans from triggers.
```

---

## System Interaction Matrix

```
                Emotional        Hybrid            Strategic
                Causality        Urgency           Horizon
                ─────────        ──────            ────────
Feeds From      social physics   deterministic     social physics
                events           urgency           triggers
                                 emotional mod     GoalEvolution
                                 strategy LLM

Feeds Into      urgency calc     Scheduler         LLM prompt
                bidding          (floor grant)     plan tracking
                action bias      turn order        subgoal progress
                LLM prompt

Time Horizon    Immediate (1T)   Current turn      2-5 turns
```

---

## Debugging Behavior

Use the frontend panels during replay to inspect:

| Panel | What to Look For |
|-------|-----------------|
| **Emotional Influence** | Bias bars showing which emotions are active and their magnitude |
| **Strategic Plans** | Active plans, subgoal progress, confidence |
| **State Diff** | Per-turn changes in social physics (causality chain) |
| **Cognitive State** | Current emotion values, confidence, certainty |
| **Relationship Matrix** | Pairwise trust changes showing coalition formation |
