# Plan: Multi-Path Conclusion System for Boardroom Simulator

## Problem

The simulation terminates by turn counter (default 20) and retroactively fabricates a "conclusion" via LLM postmortem. Three `EndCondition` types exist in models but are stubs: `VoteCondition` ignores voters/threshold, `JudgeCondition` returns `False`, and no mechanism detects genuine consensus, deadlock, or walkaway in real-time.

## Goal

Users configure **how the simulation concludes** at creation time. The system detects termination in real-time (vote tally, judge verdict, social physics convergence) and emits a structured outcome. Postmortem enriches known data rather than guessing.

---

## Part 1: User-Facing Conclusion Options (Simulation Creation)

### Current (Step 3 of creation form)

```
End Condition: [timeout] [vote] [judge]      ← simple toggle
Max turns: [====●===================] 10     ← shared slider for all modes
```

### Redesigned

```
┌──────────────────────────────────────────────────────────────┐
│  End Condition                                               │
│  [Timeout] [Vote] [Judge] [Consensus] [Hybrid]              │
│                                                              │
│  ┌─ Config Panel (changes per mode) ──────────────────────┐  │
│  │  ...                                                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Safety Valve (always visible) ───────────────────────┐  │
│  │  Max turns: [====●===================] 30               │  │
│  │  Fallback timeout if no conclusion mechanism triggers   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Per-Mode Config Panels

**1. Timeout** (simple, default)
```
Max turns: [============●========] 15
  [ ] Enable early consensus detection (optional social physics boost)
```

**2. Vote**
```
Max turns (hard cap): [====●===============] 20
Threshold:             [===========●========] 60%
  [ ] Agents must explicitly call a vote (action: "vote")
  [ ] Auto-detect position convergence (no explicit vote needed)
```

**3. Judge**
```
Judge persona: [Select persona... ▼]
  [Alice Chen, CFO]         ← must be one of the stakeholders
  [External: custom LLM]    ← or "external" option

Evaluate every: [====●====] 5 turns

Criteria:
  [Has a fair compromise been reached?          ]
  [Is either party negotiating in bad faith?   ]
  [Add criterion...]
```

**4. Consensus Detection** (NEW — social physics based)
```
Sensitivity: [Diplomatic] [Balanced] [Sensitive]

Detection mode:
  [●] Agreement & Deadlock (both directions)
  [ ] Agreement only
  [ ] Deadlock only

Thresholds (read-only, derived from sensitivity):
  Agreement: trust > 0.75  ∧  tension < 0.20
  Deadlock:  tension > 0.85 ∧  trust < 0.20  for 5+ turns
```

**5. Hybrid** (NEW — combine multiple)
```
Active conditions:
  [x] Vote         threshold 60%, max 20 turns
  [x] Consensus    sensitivity: Balanced
  [ ] Judge
  [x] Timeout      max 30 turns (safety)

First to trigger wins. Priority: Vote > Consensus > Timeout
```

---

## Part 2: Backend Architecture

### 2.1 Checker Pattern (Replace if/elif Chain)

```python
# New: each EndCondition type gets its own checker class
# Scheduler iterates checkers, first to return non-None wins

class TerminationContext:
    turn_count: int
    space: SharedSpace
    behavior_engine: BehaviorEngine
    config: SimulationV2Config
    agent_states: dict[str, AgentState]

class TerminationResult(BaseModel):
    reason: Literal["timeout", "vote_majority", "judge_verdict",
                     "consensus", "deadlock_walkaway"]
    outcome_type: Literal["agreement", "impasse", "walkaway",
                          "judge_ruling", "no_decision"]
    summary: str = ""
    confidence: float = 0.0
    total_turns: int = 0
    # Per-type details (optional)
    vote_breakdown: dict[str, int] = {}
    agreed_issues: list[dict] = []
    judge_notes: str = ""
    walkaway_party: str | None = None
```

#### TimeoutChecker
```
ACTIVE: always (as safety net)
TRIGGER: turn_count >= config.max_normal_turns
OUTCOME: {"reason": "timeout", "outcome_type": "no_decision"}
```

#### VoteChecker
```
ACTIVE: when EndCondition.type == "vote" or Hybrid includes vote
TRIGGER: 
  1. Scan events for action_type == "vote"
  2. Parse target_position from LLM content ("I vote YES on X")
  3. Tally: count[position] / len(voters) >= threshold → triggered
OUTCOME: {"reason": "vote_majority", "outcome_type": "agreement",
           "vote_breakdown": {...}, "agreed_issues": [...]}
FALLBACK: When turn_count >= max_turns → "no_decision"
```

#### JudgeChecker
```
ACTIVE: when EndCondition.type == "judge" or Hybrid includes judge
TRIGGER: Every N turns (config.evaluate_every_n)
  1. Collect turns since last evaluation
  2. Call judge LLM with: transcript + criteria + current social state
  3. Judge returns structured verdict
OUTCOME: {"reason": "judge_verdict", "outcome_type": judge.type,
           "judge_notes": judge.reasoning}
```

#### SocialPhysicsChecker (NEW)
```
ACTIVE: when EndCondition.type in ["consensus", "hybrid"] or "timeout_with_early_detection"
TRIGGER:
  - AGREEMENT: avg(trust) > threshold ∧ avg(tension) < low_threshold
               for N+ consecutive turns
  - DEADLOCK: avg(tension) > high_threshold ∧ avg(trust) < low_threshold
              for N+ consecutive turns
  - WALKAWAY: any agent has momentum < -0.8 for 3+ turns
OUTCOME: {"reason": "consensus" | "deadlock_walkaway",
           "outcome_type": "agreement" | "impasse",
           "confidence": score}
```

### 2.2 Scheduler Integration

```python
# Scheduler.run() modified:

async def run(self):
    # ... existing prelude ...
    
    while self.space.is_running():
        # ... existing turn loop ...
        
        # NEW: check end conditions via checker registry
        result = await self._check_all_conditions()
        if result:
            await self._handle_termination(result)
            return
    
    # fallback (shouldn't reach here, but safety)
    await self._handle_termination(TerminationResult(
        reason="timeout", outcome_type="no_decision", total_turns=self.turn_count
    ))

async def _check_all_conditions(self) -> TerminationResult | None:
    """Iterate active checkers in priority order. First non-None wins."""
    for checker in self._active_checkers:
        result = await checker.check(TerminationContext(
            turn_count=self.turn_count,
            space=self.space,
            behavior_engine=self.behavior_engine,
            config=self.config,
        ))
        if result is not None:
            return result
    return None

async def _handle_termination(self, result: TerminationResult):
    """Publish structured done event, save outcome, shutdown."""
    await self.space.publish({
        "type": "done",
        **result.model_dump(),
    })
    self.space.shutdown()
```

### 2.3 Checker Registry

```python
# scheduler.py

class EndConditionRegistry:
    """Maps configured EndCondition types to checker instances."""
    
    def build_checkers(self, config: SimulationV2Config) -> list[EndConditionChecker]:
        checkers: list[EndConditionChecker] = []
        
        ec = config.end_condition
        if isinstance(ec, TimeoutCondition):
            checkers.append(TimeoutChecker(ec))
        elif isinstance(ec, VoteCondition):
            checkers.append(VoteChecker(ec))
            checkers.append(TimeoutChecker(TimeoutCondition(max_normal_turns=ec.max_turns)))
        elif isinstance(ec, JudgeCondition):
            checkers.append(JudgeChecker(ec))
            checkers.append(TimeoutChecker(TimeoutCondition(max_normal_turns=30)))
        elif isinstance(ec, ConsensusCondition):
            checkers.append(SocialPhysicsChecker(ec))
            checkers.append(TimeoutChecker(TimeoutCondition(max_normal_turns=ec.max_turns)))
        elif isinstance(ec, HybridCondition):
            for sub_ec in ec.conditions:
                checkers.extend(self.build_checkers(sub_ec))
        
        return checkers
```

### 2.4 New Models

```python
# models.py additions

class ConsensusCondition(BaseModel):
    type: Literal["consensus"] = "consensus"
    sensitivity: Literal["diplomatic", "balanced", "sensitive"] = "balanced"
    detection_mode: Literal["both", "agreement_only", "deadlock_only"] = "both"
    max_turns: int = 30  # safety valve

class HybridCondition(BaseModel):
    type: Literal["hybrid"] = "hybrid"
    conditions: list[VoteCondition | ConsensusCondition | JudgeCondition]
    max_turns: int = 30  # safety valve

# Update EndCondition discriminator
EndCondition = Annotated[
    VoteCondition | TimeoutCondition | JudgeCondition | ConsensusCondition | HybridCondition,
    Field(discriminator="type"),
]
```

### 2.5 Action Type Expansion

```python
# models.py
ActionType = Literal[
    "statement", "question", "challenge", "compromise",
    "coalition_signal", "interrupt", "escalate",
    "vote", "walkaway",  # NEW
]
```

Agent LLM prompt updated to mention available action types. The `vote` action is parsed by `VoteChecker`; `walkaway` feeds into `SocialPhysicsChecker`.

---

## Part 3: The `done` Event

### Now
```json
{"type": "done", "reason": "Timeout after 20 turns", "total_turns": 20}
```

### After
```json
{
  "type": "done",
  "reason": "vote_majority",
  "outcome_type": "agreement",
  "summary": "Motion carried 4-1: partnership proceeds with phased pilot.",
  "confidence": 0.82,
  "total_turns": 12,
  "vote_breakdown": {
    "for": 4,
    "against": 1,
    "abstain": 0
  },
  "agreed_issues": [
    {"issue": "revenue_share", "value": "60/40", "parties": ["Alice", "Bob", "Charlie", "Diana"]},
    {"issue": "data_ownership", "value": "joint_custody", "parties": ["Alice", "Bob", "Charlie", "Diana", "Eve"]}
  ],
  "social_physics_final": {
    "avg_trust": 0.72,
    "avg_tension": 0.18,
    "avg_leverage": 0.55
  }
}
```

Frontend `StreamDoneEvent` type updated to match, and the `page.tsx` handler extracts outcome data for display.

---

## Part 4: Enhanced Postmortem — The Comprehensive Report

The existing `POST /simulations/{id}/postmortem` endpoint absorbs all report data. No separate endpoint. The postmortem becomes the single source of truth for simulation results.

### 4.1 Enhanced Postmortem Model

```python
# models.py — Postmortem gets expanded fields

class TopicSummary(BaseModel):
    """An agenda item discussed during the simulation."""
    topic: str
    first_raised_turn: int
    last_discussed_turn: int
    mention_count: int
    proposers: list[str]
    positions: dict[str, str]                 # {agent_id: "60/40" | "50/50" | ...}
    resolved: bool
    resolution: str = ""

class KeyMoment(BaseModel):
    """Significant event in the negotiation arc."""
    turn: int
    kind: Literal["proposal", "coalition", "challenge", "compromise",
                   "vote", "escalation", "walkaway", "judge_ruling",
                   "turning_point"]
    description: str
    actors: list[str]
    impact: str

class StakeholderSummary(BaseModel):
    """Per-stakeholder report card."""
    agent_id: str
    name: str
    role: str
    stance: AgentStance
    initial_position: str = ""
    final_position: str = ""
    position_shifts: int = 0
    total_turns: int
    dominant_action: str
    alignment_delta: int
    leverage_trajectory: Literal["rising", "falling", "stable"]
    key_statements: list[str] = []
    goals_achieved: list[str] = []
    goals_unmet: list[str] = []

class SocialDynamicsSummary(BaseModel):
    """Aggregate social physics across the simulation."""
    trust_arc: list[TVector] = []
    tension_arc: list[TVector] = []
    leverage_arc: list[TVector] = []
    avg_trust: float = 0.0
    avg_tension: float = 0.0
    peak_tension: float = 0.0
    peak_tension_turn: int = 0
    coalition_count: int = 0
    deadlock_episodes: int = 0
    dominant_agent: str = ""

class VoteEvent(BaseModel):
    turn: int
    agent_id: str
    position: str
    rationale: str = ""

class JudgeEvent(BaseModel):
    turn: int
    verdict: str
    reasoning: str
    criteria_evaluations: dict[str, str] = {}

class TVector(BaseModel):
    turn: int
    value: float

class Postmortem(BaseModel):
    """Enhanced postmortem — now the comprehensive report."""
    # Existing fields
    simulation_id: str
    confidence_score: int
    confidence_trend: int
    unanticipated_objections: int
    unanticipated_note: str
    consensus_rating: int
    objection_topology: list[TopologyNode]
    alignment_deltas: list[AlignmentDelta]
    strategy_cards: list[StrategyCard]
    mocked: bool = False
    graph_analytics: Optional[GraphAnalytics] = None

    # I. Executive Summary (NEW)
    summary: str = ""                           # LLM narrative overview
    verdict: str = ""                           # "Deal reached" / "Impasse" / "Walkaway"

    # II. Conclusion Details (NEW)
    termination: dict = Field(default_factory=dict)  # TerminationResult from checker
    end_reason: str = ""                        # "vote_majority" / "consensus" / etc.

    # III. Topics Considered (NEW)
    topics: list[TopicSummary] = []
    topic_agreement_rate: float = 0.0

    # IV. Stakeholder Reports (NEW)
    stakeholder_reports: list[StakeholderSummary] = []

    # V. Key Moments Timeline (NEW)
    key_moments: list[KeyMoment] = []
    narrative_arc: list[str] = []               # Phase labels

    # VI. Social Dynamics (NEW)
    social_dynamics: SocialDynamicsSummary = Field(default_factory=SocialDynamicsSummary)

    # VII. Lessons (NEW)
    lessons_learned: list[str] = []
    what_could_have_changed: list[str] = []

    # VIII. Vote/Judge Events (NEW, condition-specific)
    vote_events: list[VoteEvent] = []
    judge_events: list[JudgeEvent] = []

    # IX. Backlinks
    report_url: str = ""                        # GET /simulations/{id}/postmortem
```

### 4.2 Auto-Generation On Termination

The postmortem generates automatically when the simulation ends (not a separate POST call):

```
Scheduler._handle_termination(result):
  1. Stop simulation
  2. Emit done event with result
  3. Trigger postmortem generation ← NEW
  4. Shutdown

PostmortemGenerator.generate(simulation_id, result):
  ├── Step 1: Collect Ground Data (pure code, no LLM)
  │   ├── TopicTracker — scan turns for proposals, positions, agenda items
  │   ├── PositionTracker — map each agent's stance per topic over time
  │   ├── KeyMomentDetector — extract coalitions, compromises, escalations
  │   ├── SocialDynamics — aggregate behavior engine snapshots
  │   ├── Vote/Judge history — from checker state
  │   └── Neo4j graph analytics (if enabled)
  │
  ├── Step 2: LLM Enrichment (narrative only)
  │   Feed structured data (NOT raw transcript):
  │   "Outcome: agreement. Topics: [3 resolved, 1 stalemate].
  │    Key moments: [coalition at turn 5, compromise at turn 10].
  │    Vote: 4-1 in favor."
  │   LLM generates:
  │   ├── summary — "After 14 rounds, the board reached consensus..."
  │   ├── narrative_arc — ["Round 1-4: Positions staked", ...]
  │   ├── lessons_learned — ["Coalitions formed early had outsized influence"]
  │   └── what_could_have_changed — ["If Diana had not conceded on data..."]
  │
  └── Step 3: Assemble + Save
      ├── Build Postmortem with structured data + LLM narrative
      ├── Save to DB
      └── Available via GET /simulations/{id}/postmortem


The LLM receives DATA, not transcripts. Narrative is grounded in known facts.
No fabricating scores — consensus_rating comes from actual vote tally.
No guessing alignment — position_delta tracked throughout simulation.
```

### 4.3 TopicTracker Engine (Pure Code, No LLM)

```python
# backend/app/runtime/postmortem_generator.py

class TopicTracker:
    """Extracts topics, proposals, and positions from turn events.
    Deterministic pattern matching — zero LLM calls.
    """
    
    PROPOSAL_PATTERNS = [
        r"(?:I propose|we should|my proposal is|let's|I suggest) (.+?)(?:\.|$)",
        r"(?:how about|what if|consider) (.+?)(?:\.|$)",
        r"(?:percent|split|ratio|share) (\d+/\d+)",
    ]
    
    POSITION_SIGNALS = {
        "agree": "support",
        "support": "support",
        "accept": "support",
        "disagree": "oppose",
        "reject": "oppose",
        "cannot accept": "oppose",
    }
    
    def process_turn(self, content: str, agent: str, turn_index: int):
        for pattern in self.PROPOSAL_PATTERNS:
            for match in re.findall(pattern, content, re.IGNORECASE):
                topic = self._normalize(match)
                self._record(topic, agent, match, turn_index)

class PositionTracker:
    """Track positions per agent per topic. Detect shifts."""
    
    def process_turn(self, content: str, agent: str, topics: TopicTracker):
        for topic in topics.topics.values():
            old = self.positions.get(agent, {}).get(topic.name)
            new = self._extract_position(content, topic.name)
            if new and new != old:
                self._record_shift(agent, topic.name, old, new)

class KeyMomentDetector:
    """Extract significant events from action types."""
    
    SIGNIFICANCE = {
        "coalition_signal": ("coalition", "Shifts power dynamics"),
        "compromise": ("compromise", "Opens path to agreement"),
        "escalate": ("escalation", "Risks deadlock"),
        "walkaway": ("walkaway", "Negotiation collapses"),
        "vote": ("vote", "Formal decision point"),
    }
    
    def process(self, events: list[dict]) -> list[KeyMoment]:
        moments = []
        for e in events:
            action = e.get("action_type", "")
            if action in self.SIGNIFICANCE:
                kind, impact = self.SIGNIFICANCE[action]
                moments.append(KeyMoment(
                    turn=e.get("turn_index", 0),
                    kind=kind,
                    description=f"{e.get('speaker', '?')} — {e.get('content', '')[:80]}",
                    actors=[e.get("agent_id", "")],
                    impact=impact,
                ))
        return moments

class PostmortemGenerator:
    def generate(self, simulation_id: str, result: TerminationResult) -> Postmortem:
        # Step 1: Ground data collection
        topic_tracker = TopicTracker()
        position_tracker = PositionTracker()
        moment_detector = KeyMomentDetector()
        
        for event in self.space.events:
            if event.get("type") == "turn":
                content = event.get("content", "")
                agent = event.get("agent_id", "")
                idx = event.get("turn_index", 0)
                topic_tracker.process_turn(content, agent, idx)
                position_tracker.process_turn(content, agent, topic_tracker)
        
        moments = moment_detector.process(self.space.events)
        topics = topic_tracker.summarize()
        social = self._aggregate_social_physics()
        
        # Step 2: LLM enrichment (narrative only)
        narrative = await self._llm_enrich(topics, moments, result, social)
        
        # Step 3: Assemble
        return Postmortem(
            simulation_id=simulation_id,
            confidence_score=self._compute_confidence(result, topics),
            consensus_rating=self._compute_consensus(result, topics),
            alignment_deltas=position_tracker.to_alignment_deltas(),
            objection_topology=self._build_topology(topics),
            strategy_cards=await self._generate_strategy_cards(topics, result),
            # Ground truth from termination
            end_reason=result.reason,
            termination=result.model_dump(),
            verdict="Deal reached" if result.outcome_type == "agreement" 
                    else "Walkaway" if result.outcome_type == "walkaway"
                    else "No consensus",
            # Topics
            topics=[/* from topic_tracker */],
            topic_agreement_rate=self._agreement_rate(topics),
            # Stakeholders
            stakeholder_reviews=position_tracker.to_stakeholder_summaries(),
            # Moments
            key_moments=moments,
            narrative_arc=narrative.get("arc", []),
            # Social
            social_dynamics=social,
            # Lessons
            lessons_learned=narrative.get("lessons", []),
            what_could_have_changed=narrative.get("counterfactuals", []),
            # Vote/Judge events
            vote_events=self._collect_vote_events(result),
            judge_events=self._collect_judge_events(),
            # Backward-compatible fields
            unanticipated_note=narrative.get("unanticipated_note", ""),
            mocked=False,
        )
```

### 4.4 API — Postmortem Replaces Report

```python
# main.py — existing endpoint expanded

@app.post("/simulations/{simulation_id}/postmortem")
async def postmortem_v2(simulation_id: str) -> dict:
    """Get the comprehensive simulation postmortem.
    
    Auto-generated on termination. Now includes:
    - Executive summary, topic tracking, stakeholder reports,
      key moments, social dynamics, vote/judge events.
    """
    db = get_database()
    
    # Check cache
    cached = await db.get_postmortem(simulation_id)
    if cached:
        return self._format_response(cached)
    
    # If simulation just ended and postmortem not yet cached:
    # Trigger generation on first request
    result = await self._generate_postmortem(simulation_id)
    await db.save_postmortem(simulation_id, result)
    return result
```

### 4.5 Frontend: Postmortem Page Becomes the Report

Existing route `/simulate/[id]/postmortem` displays the full expanded postmortem:

```
┌────────────────────────────────────────────────────────────┐
│  POSTMORTEM ANALYSIS                                       │
│  "Strategic Partnership Negotiation"                       │
│                                                            │
│  DEAL REACHED  │  14 turns  │  5 stakeholders             │
│  ───────────────────────────────────────────────────────    │
│                                                            │
│  EXECUTIVE SUMMARY ─────────────────────────────────────    │
│  After 14 rounds of negotiation, the board reached         │
│  consensus on a phased partnership pilot with a            │
│  60/40 revenue split. The turning point came when          │
│  Alice conceded on data ownership to secure the deal.      │
│                                                            │
│  CONCLUSION DETAILS ─────────────────────────────────────    │
│  Mechanism: Vote (4-1 in favor)   Confidence: 82%          │
│  ┌───┬───┬───┐                                             │
│  │ 4 │ 1 │ 0 │   For │ Against │ Abstain                   │
│  │ Y │ N │ - │                                             │
│  └───┴───┴───┘                                             │
│                                                            │
│  TOPICS DISCUSSED ───────────────────────────────────────    │
│  Revenue split   │ Agreed (60/40)    │ Turn 2-11          │
│  Data ownership  │ Agreed (joint)    │ Turn 4-13          │
│  Timeline        │ Stalemate         │ Turn 6-14          │
│                                                            │
│  STAKEHOLDER REPORTS ───────────────────────────────────    │
│  Alice (CEO)     │ Champion │ 2 shifts │ Leverage ▲       │
│  Bob (CFO)       │ Detractor│ 0 shifts │ Leverage ▬       │
│  ...                                                       │
│                                                            │
│  KEY MOMENTS ──────────────────────────────────────────    │
│  Turn 2  ── Alice proposes 60/40 revenue split             │
│  Turn 5  ── Bob+Charlie form coalition on data             │
│  Turn 8  ── Diana escalates on timeline → tension spikes   │
│  Turn 11 ─ Alice concedes data → breakthrough              │
│  Turn 14 ─ Vote: 4-1 → DEAL REACHED                        │
│                                                            │
│  SOCIAL DYNAMICS ──────────────────────────────────────    │
│  [Trust & Tension Over Time — chart]                       │
│  [Leverage Per Agent — chart]                              │
│                                                            │
│  ALIGNMENT DELTAS ────────────────────────────────────     │
│  Alice ──────── +15 (became more aligned)                  │
│  Bob ────────── -8  (became more oppositional)             │
│                                                            │
│  STRATEGY CARDS ──────────────────────────────────────     │
│  Revenue split was main sticking point                     │
│  → Offer data concession as trade    Risk: MEDIUM          │
│                                                            │
│  LESSONS LEARNED ─────────────────────────────────────     │
│  • Coalitions formed early had outsized influence          │
│  • Deadlock on timeline could have broken the deal         │
│  • Moderator was effective at reducing tension             │
│                                                            │
│  [Export JSON]  [Download PDF]                             │
└────────────────────────────────────────────────────────────┘
```

### 4.6 File Changes

```
NEW: backend/app/runtime/postmortem_generator.py
  - TopicTracker, PositionTracker, KeyMomentDetector
  - SocialDynamics aggregator
  - PostmortemGenerator (orchestrates ground data + LLM enrichment)

MODIFIED: backend/app/models.py
  - Add TopicSummary, KeyMoment, StakeholderSummary, SocialDynamicsSummary
  - Add VoteEvent, JudgeEvent, TVector
  - Expand Postmortem with all new sections

MODIFIED: backend/app/main.py
  - postmortem endpoint: now auto-generates comprehensive report
  - Remove mock fallback (no longer needed — ground data is deterministic)

MODIFIED: backend/app/runtime/scheduler.py
  - _handle_termination triggers PostmortemGenerator

MODIFIED: frontend/app/simulate/[id]/postmortem/page.tsx
  - Expanded to display all new sections:
    executive summary, topics table, stakeholder grid,
    key moments timeline, social dynamics charts,
    vote breakdown, lessons learned

REMOVED: backend/app/main.py mock postmortem functions
  - _mock_postmortem, _mock_postmortem_from_raw no longer needed

### Now
Postmortem receives raw transcript + static stakeholder tags and fabricates scores via LLM or mock formula.

### After
Postmortem receives structured `TerminationResult` + transcript. The LLM call **enriches** known data rather than guessing:

```python
async def generate_postmortem(simulation_id: str, result: TerminationResult, transcript: str):
    # Ground truth from termination result
    grounded = {
        "consensus_rating": result.confidence * 100,  # real data
        "alignment_deltas": compute_from_position_changes(),  # tracked during sim
        "confidence_score": result.confidence * 100,
        "unanticipated_objections": count_unexpected(transcript),
    }
    
    # LLM only adds narrative around grounded data
    narrative = await llm_judge(
        f"Write the narrative for this negotiation outcome:\n"
        f"Outcome: {result.outcome_type}\n"
        f"Agreed issues: {result.agreed_issues}\n"
        f"Vote breakdown: {result.vote_breakdown}\n"
        f"Transcript summary: {transcript[:2000]}...\n"
        f"Return JSON with: unanticipated_note, strategy_cards, objection_topology"
    )
    
    return {**grounded, **narrative}
```

---

## Part 5: Frontend Changes

### 5.1 Types (`frontend/lib/types.ts`)

```typescript
// NEW: action type update
export type ActionType = "statement" | "question" | "challenge" | "compromise"
  | "coalition_signal" | "interrupt" | "escalate" | "vote" | "walkaway";

// NEW: ConsensusCondition
export type ConsensusCondition = {
  type: "consensus";
  sensitivity: "diplomatic" | "balanced" | "sensitive";
  detection_mode: "both" | "agreement_only" | "deadlock_only";
  max_turns: number;
};

// NEW: HybridCondition
export type HybridCondition = {
  type: "hybrid";
  conditions: (VoteCondition | ConsensusCondition | JudgeCondition)[];
  max_turns: number;
};

// UPDATE: EndCondition union
export type EndCondition = VoteCondition | TimeoutCondition | JudgeCondition
  | ConsensusCondition | HybridCondition;

// NEW: StreamDoneEvent with structured outcome
export type StreamDoneEvent = {
  type: "done";
  reason: "timeout" | "vote_majority" | "judge_verdict" | "consensus" | "deadlock_walkaway";
  outcome_type: "agreement" | "impasse" | "walkaway" | "judge_ruling" | "no_decision";
  summary: string;
  confidence: number;
  total_turns: number;
  vote_breakdown?: Record<string, number>;
  agreed_issues?: Array<{issue: string; value: string; parties: string[]}>;
  judge_notes?: string;
};
```

### 5.2 Simulation Creation UI (`frontend/app/simulate/new/page.tsx`)

Step 3 End Condition section redesigned:

```
END TYPES expanded to include "consensus" and "hybrid"
END_TYPES = ["timeout", "vote", "judge", "consensus", "hybrid"] as const;

Config panels for each mode:
- vote → shows threshold slider + info about "vote" action type
- judge → shows judge persona dropdown + frequency slider + criteria add
- consensus → shows sensitivity selector + detection mode radio
- hybrid → shows multi-select checkboxes + inline sub-configs
- timeout → shows max_turns slider only

Safety valve (max_turns) always visible regardless of mode.
```

### 5.3 War Room Page (`frontend/app/simulate/[id]/page.tsx`)

On `type: "done"` event:
- Extract `reason`, `outcome_type`, `summary`, `confidence` from event
- Display outcome banner at top of postmortem section:
  - Green banner for "agreement" → ✅ Deal reached
  - Red banner for "impasse"/"no_decision" → ❌ No consensus
  - Yellow banner for "walkaway" → ⚠️ Walkaway
- Show `vote_breakdown` as bar chart if available
- Show `agreed_issues` as list if available
- Show `judge_notes` as quote card if judge ended

### 5.4 Full Postmortem Page (`frontend/app/simulate/[id]/postmortem/page.tsx`)

Add outcome summary section at top before existing cards:
- Outcome type badge
- Confidence meter
- Vote breakdown visualization

---

## Part 6: Test Plan

### Backend Tests

| Test | File | What |
|---|---|---|
| `test_vote_checker_tallies_votes` | `test_runtime.py` | Inject "vote" turns, assert threshold triggers done |
| `test_vote_checker_max_turns_fallback` | `test_runtime.py` | Inject insufficient votes, assert timeout fallback |
| `test_judge_checker_periodic_evaluation` | `test_runtime.py` | Mock judge LLM, assert it fires every N turns |
| `test_judge_verdict_agreement` | `test_runtime.py` | Judge returns "agreement", assert done with outcome |
| `test_judge_verdict_impasse` | `test_runtime.py` | Judge returns "impasse", assert done |
| `test_social_physics_agreement` | `test_runtime.py` | Set trust=0.9, tension=0.1, assert consensus detected |
| `test_social_physics_deadlock` | `test_runtime.py` | Set tension=0.9, trust=0.1 for 5 turns, assert walkaway |
| `test_social_physics_walkaway_action` | `test_runtime.py` | Agent emits "walkaway" action, assert triggered |
| `test_hybrid_first_wins` | `test_runtime.py` | Enable vote + consensus, trigger vote first, assert vote won |
| `test_done_event_structure` | `test_runtime.py` | Assert reason, outcome_type, summary, total_turns present |
| `test_postmortem_grounded_in_outcome` | `test_runtime.py` | Pass TerminationResult, assert consensus_rating matches confidence |
| `test_action_type_vote_parsing` | `test_agent.py` | Assert LLM turn with vote action is parsed correctly |

### Frontend Tests

| Test | File | What |
|---|---|---|
| `handles_done_with_vote_outcome` | `WarRoomPage.test.tsx` | SSE emits done with vote_breakdown, verify banner renders |
| `handles_done_with_judge_verdict` | `WarRoomPage.test.tsx` | SSE emits done with judge_notes, verify quote card |
| `displays_outcome_type_badge` | `WarRoomPage.test.tsx` | Green/red/yellow badge based on outcome_type |
| `renders_conclusion_config_panel_vote` | `NewSimulation.test.tsx` | Vote mode shows threshold slider |
| `renders_conclusion_config_panel_judge` | `NewSimulation.test.tsx` | Judge mode shows persona dropdown |
| `renders_conclusion_config_panel_consensus` | `NewSimulation.test.tsx` | Consensus mode shows sensitivity selector |
| `renders_conclusion_config_panel_hybrid` | `NewSimulation.test.tsx` | Hybrid mode shows multi-select |
| `builds_correct_end_config_timeout` | `NewSimulation.test.tsx` | buildEndCondition returns correct type |
| `builds_correct_end_config_vote` | `NewSimulation.test.tsx` | buildEndCondition includes threshold/voters |

---

## Part 7: Implementation Sequence

```
Phase 1: Foundation (Backend)
├── 1.1 Add new models: ConsensusCondition, HybridCondition, TopicSummary,
│       KeyMoment, StakeholderSummary, SocialDynamicsSummary, VoteEvent, JudgeEvent
├── 1.2 Add action types: "vote", "walkaway"
├── 1.3 Create checker base class + registry (scheduler.py)
├── 1.4 Implement TimeoutChecker (refactor existing)
├── 1.5 Implement VoteChecker
├── 1.6 Implement SocialPhysicsChecker
├── 1.7 Implement JudgeChecker
├── 1.8 Wire checkers into Scheduler.run()
├── 1.9 Restructure done event with TerminationResult
├── 1.10 Create PostmortemGenerator (postmortem_generator.py)
│   ├── TopicTracker (regex-based topic extraction)
│   ├── PositionTracker (position change detection)
│   ├── KeyMomentDetector (event classification)
│   └── SocialDynamics aggregator (behavior engine snapshots)
├── 1.11 Scheduler._handle_termination triggers PostmortemGenerator
└── 1.12 Expand Postmortem model with all new sections

Phase 2: Frontend (Creation UI)
├── 2.1 Update frontend types (new conditions, done event, postmortem)
├── 2.2 Redesign Step 3 End Condition panel
│   ├── 2.2.1 Consensus config panel
│   ├── 2.2.2 Hybrid config panel
│   ├── 2.2.3 Vote config panel (threshold)
│   └── 2.2.4 Judge config panel (persona, criteria)
├── 2.3 Add safety valve UI to all modes
└── 2.4 Update buildEndCondition() for all types

Phase 3: Frontend (Display)
├── 3.1 Update WarRoomPage done handler (extract outcome data)
├── 3.2 Add outcome banner (green/red/yellow)
├── 3.3 Add vote_breakdown visualization
├── 3.4 Add agreed_issues display
├── 3.5 Add judge_notes card
└── 3.6 Expand postmortem page with:
    ├── Executive summary card
    ├── Topics discussed table
    ├── Stakeholder reports grid
    ├── Key moments timeline
    ├── Social dynamics charts
    ├── Vote breakdown (if applicable)
    ├── Judge events (if applicable)
    └── Lessons learned section

Phase 4: Tests
├── 4.1 VoteChecker tests
├── 4.2 JudgeChecker tests
├── 4.3 SocialPhysicsChecker tests
├── 4.4 Hybrid mode tests
├── 4.5 done event contract tests
├── 4.6 PostmortemGenerator tests
│   ├── TopicTracker extracts topics from turns
│   ├── PositionTracker detects position shifts
│   ├── KeyMomentDetector identifies events
│   └── SocialDynamics aggregates correctly
├── 4.7 Postmortem endpoint returns expanded report
├── 4.8 Frontend rendering tests
└── 4.9 Frontend config building tests

Phase 5: Polish
├── 5.1 Wire Sound.simulationEnd() to done event
├── 5.2 Add completion overlay/confetti
├── 5.3 Add replay prompt when done
└── 5.4 Update templates to use new conditions
```

---

## Part 8: File Change Map

```
BACKEND (Python):
  backend/app/models.py
    - Add ConsensusCondition, HybridCondition
    - Add "vote", "walkaway" to ActionType
    - Update EndCondition discriminator union
    - Add TopicSummary, KeyMoment, StakeholderSummary, SocialDynamicsSummary
    - Add VoteEvent, JudgeEvent, TVector
    - Expand Postmortem with all new report sections
  
  backend/app/runtime/scheduler.py
    - Add EndConditionChecker base class
    - Add TimeoutChecker, VoteChecker, JudgeChecker, SocialPhysicsChecker
    - Add EndConditionRegistry
    - Refactor _end_condition_met() → _check_all_conditions()
    - Add _handle_termination() → triggers PostmortemGenerator
    - Add TerminationResult dataclass
  
  backend/app/runtime/postmortem_generator.py           ← NEW FILE
    - TopicTracker (regex proposal/position extraction)
    - PositionTracker (stance changes over time)
    - KeyMomentDetector (event classification)
    - SocialDynamics aggregator
    - PostmortemGenerator (orchestrator)
  
  backend/app/runtime/simulation.py
    - No change needed (streams whatever scheduler publishes)
  
  backend/app/main.py
    - Postmortem endpoint: returns expanded Postmortem
    - Remove mock_postmortem functions (ground data replaces fabrication)
  
  backend/app/runtime/agent.py
    - Update _build_turn_prompt to include "vote" and "walkaway" in allowed action types
  
  backend/tests/test_runtime.py
    - Add checker tests (Vote, Judge, SocialPhysics, Hybrid)
    - Add TerminationResult contract tests
  
  backend/tests/test_postmortem_generator.py             ← NEW FILE
    - TopicTracker tests
    - PositionTracker tests
    - KeyMomentDetector tests
    - Full PostmortemGenerator integration test

FRONTEND (TypeScript):
  frontend/lib/types.ts
    - Add ConsensusCondition, HybridCondition types
    - Update EndCondition union
    - Update StreamDoneEvent with outcome fields
    - Add "vote", "walkaway" to ActionType
    - Add TopicSummary, KeyMoment, StakeholderSummary types
  
  frontend/app/simulate/new/page.tsx
    - Add "consensus" and "hybrid" to END_TYPES
    - Add config panels for each mode
    - Update buildEndCondition()
    - Update Review section to show condition details
  
  frontend/app/simulate/[id]/page.tsx
    - Extract outcome fields from done event
    - Add outcome banner component
    - Add vote breakdown display
    - Add judge notes display
  
  frontend/app/simulate/[id]/postmortem/page.tsx        ← EXPANDED
    - Executive summary card
    - Conclusion details + vote viz
    - Topics discussed table
    - Stakeholder reports grid
    - Key moments timeline
    - Social dynamics charts
    - Strategy cards + lessons learned
    - Export JSON button
  
  frontend/lib/api.ts
    - StreamDoneEvent handler: pass structured data to frontend
  
  frontend/lib/use-simulation-state.ts
    - No change needed (computed from state_snapshot events)
```

---

## Part 9: Effort & Dependencies

| Phase | Est. Time | Depends On |
|---|---|---|
| 1. Backend foundation (checkers + models) | 6h | — |
| 2. PostmortemGenerator (TopicTracker, PositionTracker, etc.) | 4h | Phase 1 (models) |
| 3. Frontend creation UI (5 config panels) | 4h | Phase 1 (types) |
| 4. Frontend display (banner + expanded postmortem page) | 5h | Phase 2 (models+API) |
| 5. Tests (checkers + generator + frontend) | 4h | Phases 1-4 |
| 6. Polish (sound, overlay, templates, replay) | 2h | Phase 4 |
| **Total** | **~25h** | |

## Key Design Decisions

1. **Checker pattern** over if/elif — each condition is an independently testable unit. Adding a new condition means writing one class, not modifying a switch statement.
2. **Timeout always active** — safety net prevents infinite simulations regardless of configuration errors in vote/judge/consensus modes.
3. **Structured `done` event** — frontend can render outcome without parsing natural language. Vote breakdown, agreed issues, and judge notes are first-class fields.
4. **Consensus mode derives thresholds from sensitivity** — user picks "high/med/low" rather than raw numbers. The system maps sensitivity to trust/tension thresholds behind the scenes, preventing misconfiguration.
5. **Hybrid mode is a composition** — reuses individual condition configs rather than having its own logic. Reduces duplication and test surface.
