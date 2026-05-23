# Implementation Plan: Agentic Architecture v2

## Strategy: Parallel Code Path

The current system works. We don't touch existing files until the new runtime is fully tested.

```
┌──────────────────────────────┐     ┌──────────────────────────────┐
│     EXISTING PATH (v1)       │     │        NEW PATH (v2)         │
│                              │     │                              │
│  POST /simulations           │     │  POST /v2/simulations        │
│       │                      │     │       │                      │
│       ▼                      │     │       ▼                      │
│  LangGraph Workflow          │     │  Agent Runtime               │
│  (workflow.py)               │     │  (runtime/agent.py)          │
│                              │     │                              │
│  Backward compatible         │     │  Accepts full user config    │
│  Seeds/templates in backend  │     │  Zero domain knowledge       │
└──────────────────────────────┘     └──────────────────────────────┘
                                            ▲
                                            │
                                     Frontend V2 create flow
                                     (new route: /simulate/v2/new)
```

Once v2 is stable: deprecate v1, move v2 to `/simulations`, remove seeds.

---

## Phase 0 — Data Models (no behavioral changes)

**Goal:** Add new models alongside existing ones. Zero behavioral changes. Existing simulations keep working.

### Files to modify

**`backend/app/models.py`** — Add these types:

```python
# ── NEW: Agentic v2 models ──────────────────────────────────────────

class Subject(BaseModel):
    """What the simulation is ABOUT — first-class entity."""
    name: str
    description: str
    attributes: dict[str, str | int | float] = {}
    evidence_items: list[str] = []
    stakes_description: str = ""

AgentStance = Literal["champion", "detractor", "neutral", "moderator", "wildcard"]

class PersonalityProfile(BaseModel):
    aggressiveness: int = Field(default=50, ge=0, le=100)
    empathy: int = Field(default=50, ge=0, le=100)
    stubbornness: int = Field(default=50, ge=0, le=100)
    verbosity: int = Field(default=50, ge=0, le=100)

class CustomActionDef(BaseModel):
    """An action type defined by the user for this simulation."""
    name: str
    description: str
    trust_delta: int = 0
    leverage_delta: int = 0

class ActionSpace(BaseModel):
    actions: list[CustomActionDef]
    default_trust_deltas: dict[str, int] = {}
    default_leverage_deltas: dict[str, int] = {}

class SpeakerRules(BaseModel):
    mode: Literal["moderator_led", "alternating", "freeform", "weighed_random"] = "weighed_random"

class VoteCondition(BaseModel):
    type: Literal["vote"] = "vote"
    voters: list[str]
    threshold: float = 0.5
    max_turns: int = 10

class TimeoutCondition(BaseModel):
    type: Literal["timeout"] = "timeout"
    max_normal_turns: int = 20

class JudgeCondition(BaseModel):
    type: Literal["judge"] = "judge"
    judge_id: str
    criteria: list[str] = []

EndCondition = VoteCondition | TimeoutCondition | JudgeCondition

class SimulationV2Config(BaseModel):
    """Full user-defined simulation config — engine has zero opinions."""
    subject: Subject
    stakeholders: list[StakeholderV2]
    action_space: ActionSpace
    speaker_rules: SpeakerRules = SpeakerRules()
    end_condition: EndCondition = TimeoutCondition()
    system_prompt_template: str = ""
    voltage: int = Field(default=50, ge=0, le=100)
    player_mode: bool = False

class StakeholderV2(BaseModel):
    """A stakeholder with stance + personality, no hardcoded tags."""
    id: str
    name: str
    role: str
    backstory: str = ""
    stance: AgentStance = "neutral"
    personality: PersonalityProfile = PersonalityProfile()
    hidden_agenda: str = ""
    tools: list[str] = []
```

**`frontend/lib/types.ts`** — Mirror all types in TypeScript.

### Acceptance Criteria
- [ ] `npx tsc --noEmit` passes (frontend)
- [ ] `python -c "from app.models import Subject, StakeholderV2, ActionSpace"` works (backend)
- [ ] Existing v1 `POST /simulations` still works with same payload
- [ ] Existing simulation pages render correctly

---

## Phase 1 — Agent Runtime (new package, parallel path)

**Goal:** Build the agent runtime engine. Every agent runs as an async task with private memory. SharedSpace routes events. Scheduler grants floor.

### Files to create

**`backend/app/runtime/__init__.py`**
```python
from .space import SharedSpace
from .agent import AgentRuntime
from .scheduler import Scheduler
from .simulation import run_simulation_v2
```

**`backend/app/runtime/space.py`** — Event-sourced message board

```python
class SharedSpace:
    """All agents read/write here. Event-sourced. Single source of truth."""
    
    events: list[dict]           # PublicEvent — every statement
    state: dict                  # Current simulation state
    bid_queue: asyncio.PriorityQueue  # AgentBid(agent_id, urgency, timestamp)
    whisper_queue: asyncio.Queue      # PrivateMessage(from, to, content)
    
    async def publish(self, event) -> None
    async def submit_bid(self, agent_id, urgency) -> None
    async def whisper(self, sender, recipient, message) -> None
    async def wait_for_event(self) -> Event  # blocking read
    async def get_state_snapshot(self) -> dict
```

**`backend/app/runtime/agent.py`** — Persistent agent loop

```python
class AgentRuntime:
    """
    Each agent runs this loop as an asyncio Task.
    The agent has PRIVATE memory — it remembers everything.
    It decides when to bid, when to speak, when to whisper.
    """
    agent_id: str
    config: StakeholderV2
    memory: AgentMemory        # private, persistent
    llm: ChatOpenAI
    space: SharedSpace
    
    async def run(self):
        while self.space.is_running():
            event = await self.space.wait_for_event()
            self.memory.record(event)
            
            # Agent decides for itself whether to bid
            if self._should_bid(event):
                self.space.submit_bid(self.agent_id, self._compute_urgency(event))
            
            # Agent's turn to speak
            if self.space.is_my_turn(self.agent_id):
                response = await self._generate_turn()
                self.space.publish(response)
    
    async def _generate_turn(self) -> dict:
        """Build prompt from user template + full context, call LLM."""
        prompt = self._build_prompt()
        response = await self.llm.invoke(prompt)
        self.memory.record_own_turn(response)
        return response
```

**`backend/app/runtime/scheduler.py`** — Traffic cop

```python
class Scheduler:
    """
    Does NOT decide what agents say.
    Only: reads bids, grants floor, validates actions, checks end condition.
    """
    space: SharedSpace
    rules: SimulationV2Config
    turn_count: int = 0
    
    async def run(self):
        while not self._end_condition_met():
            # Read bids, grant floor
            winner = await self._resolve_next_speaker()
            self.space.grant_floor(winner)
            self.turn_count += 1
            
            # Wait for agent to publish their turn
            event = await self.space.wait_for_next_turn(timeout=60)
            
            # Validate action type is in allowed list
            if event["action_type"] not in self.rules.action_space.actions:
                self.space.reject(event)
            
            # Update shared state (trust, leverage, heatmap)
            self._update_dynamics(event)
            
            # Push event to SSE
            await self.space.stream_event(event)
    
    async def _resolve_next_speaker(self) -> str:
        if self.rules.speaker_rules.mode == "moderator_led":
            return await self._moderator_decides()
        elif self.rules.speaker_rules.mode == "alternating":
            return self._alternating_side()
        else:
            return self._highest_bid()
```

**`backend/app/runtime/simulation.py`** — Orchestrator entry point

```python
async def run_simulation_v2(config: SimulationV2Config) -> AsyncIterator[dict]:
    """Spawn all agents, run scheduler, stream events."""
    space = SharedSpace(config)
    agents = [AgentRuntime(s, space, llm) for s in config.stakeholders]
    scheduler = Scheduler(space, config)
    
    # Start all agent loops + scheduler as asyncio tasks
    tasks = [asyncio.create_task(a.run()) for a in agents]
    tasks.append(asyncio.create_task(scheduler.run()))
    
    # Stream events from shared space to caller
    async for event in space.stream():
        yield event
        if event["type"] == "done":
            break
    
    # Cleanup
    for t in tasks:
        t.cancel()
```

### Acceptance Criteria
- [ ] `python -m pytest tests/test_runtime.py` passes (unit tests)
- [ ] Single simulation can be run end-to-end via `asyncio.run(run_simulation_v2(config))`
- [ ] Each agent generates at least one turn
- [ ] Agent memory persists across multiple turns (agent remembers what it said)
- [ ] Scheduler correctly grants floor based on speaker_rules mode
- [ ] End condition triggers correctly (timeout, vote)
- [ ] Events stream as expected (turn → turn → ... → done)

---

## Phase 2 — API Endpoint (parallel path, doesn't touch v1)

**Goal:** New endpoint `POST /v2/simulations` uses the new runtime. v1 `/simulations` untouched.

### Files to modify

**`backend/app/main.py`** — Add:

```python
@app.post("/v2/simulations", response_model=SimulationState)
async def create_simulation_v2(payload: SimulationV2Config) -> SimulationState:
    """Agentic v2 simulation. User defines everything."""
    simulation_id = str(uuid4())
    
    # Convert to SimulationState for backward compat
    state = SimulationState(
        simulation_id=simulation_id,
        config=SimulationCreate(
            background=payload.subject.description,
            primary_goal=f"Debate: {payload.subject.name}",
            stakeholders=[_convert_stakeholder(s) for s in payload.stakeholders],
            voltage=payload.voltage,
            player_mode=payload.player_mode,
        ),
        player_mode=payload.player_mode,
    )
    saved = await store.put(state)
    return saved

@app.get("/v2/simulations/{simulation_id}/stream")
async def stream_simulation_v2(simulation_id: str):
    """SSE stream using new agentic runtime."""
    state = await _get_state_or_404(simulation_id)
    
    async def event_stream():
        async for event in run_simulation_v2(state.config):
            yield f"data: {json.dumps(event)}\n\n"
    
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

### Acceptance Criteria
- [ ] `POST /v2/simulations` with a full `SimulationV2Config` payload returns 201
- [ ] `GET /v2/simulations/{id}/stream` returns SSE events until done
- [ ] v1 `POST /simulations` still works identically
- [ ] Existing war room page (`/simulate/[id]`) can render v2 simulation results (same SSE format)

---

## Phase 3 — Frontend V2 Create Flow (new route)

**Goal:** New page at `/simulate/v2/new` with persona builder, subject config, rules config. Existing `/simulate/new` untouched.

### Files to create

**`frontend/app/simulate/v2/new/page.tsx`** — 5-step create flow

| Step | Content | Component |
|------|---------|-----------|
| 1 | Subject definition | `SubjectConfig` |
| 2 | Create/edit personas | `PersonaBuilder` (per-agent) |
| 3 | Assign stances + relationships | `StanceAssigner` |
| 4 | Rules + end condition | `RulesConfig` |
| 5 | Review + launch | Summary panel |

### Components to create

**`frontend/components/v2/SubjectConfig.tsx`**
- Name, description, attributes table (key-value pairs with evidence attachments)
- Free-form evidence items list
- Stakes description

**`frontend/components/v2/PersonaBuilder.tsx`**
- Name, role, backstory (textarea)
- Stance selector (champion/detractor/neutral/moderator/wildcard)
- Personality sliders (aggressiveness, empathy, stubbornness, verbosity)
- Hidden agenda
- Tool toggles

**`frontend/components/v2/StanceAssigner.tsx`**
- Visual matrix showing all personas + their stances
- Drag-to-reorder speaker priority
- Initial trust sliders between pairs (who trusts whom)

**`frontend/components/v2/RulesConfig.tsx`**
- Speaker mode selector (moderator-led, alternating, freeform, weighed)
- Custom action type builder (name, description, trust/leverage deltas)
- End condition selector (vote, timeout, judge) with parameters
- System prompt template editor (with variable hints)

### Acceptance Criteria
- [ ] User can navigate through all 5 steps
- [ ] User can create a custom persona from scratch (not from library)
- [ ] User can define a subject with attributes and evidence
- [ ] User can assign stances and see the visual stance matrix
- [ ] User can define custom action types
- [ ] User can choose end condition (vote/timeout/judge)
- [ ] `npm run build` passes on frontend
- [ ] Form submits to `POST /v2/simulations` successfully
- [ ] After submit, user is redirected to war room page

---

## Phase 4 — Wire to War Room (render v2 results)

**Goal:** The v2 war room page renders the simulation properly — showing stances, vote results, agent thought logs.

### New file

**`frontend/app/simulate/v2/[id]/page.tsx`** — V2 war room

Similar to existing `/simulate/[id]/page.tsx` but with:
- **Stance badges** instead of `tag` labels (champion→green, detractor→red, moderator→blue)
- **Vote tally panel** that appears when end condition triggers
- **Subject card** pinned at the top showing what's being debated
- **Thought log drawer** per agent (their continuous internal reasoning)
- **Action type glyphs** for custom actions (not hardcoded ActionGlyph icons)

### Acceptance Criteria
- [ ] V2 simulation renders turn-by-turn via SSE
- [ ] Player can inject human turns
- [ ] Vote is tallied and displayed when end condition triggers
- [ ] Agent thought logs are viewable
- [ ] Custom action types are displayed correctly
- [ ] Back button returns to v2 create flow

---

## Phase 5 — Migrate v1 → v2 (deprecate old system)

**Goal:** Move v2 to primary path. Remove seeds from backend.

### Changes
1. Move v2 routes to `/simulations` and v1 routes to `/v1/simulations`
2. Remove `seeds/personas/all.json` and `seeds/templates/all.json` from backend
3. Convert persona library to frontend-only JSON file
4. Remove workflow.py, agents.py (BoardroomAgent), memory.py — all replaced by runtime/

### Acceptance Criteria
- [ ] `/simulations` now uses agentic runtime by default
- [ ] `/v1/simulations` still serves existing simulations
- [ ] Frontend persona library renders from local JSON, not backend endpoint
- [ ] All existing test simulations render correctly (backward compat)

---

## Implementation Order (Recommended)

| # | Phase | What | Why This Order |
|---|-------|------|----------------|
| 1 | **Phase 0** | Data models | Foundation. Nothing else compiles without it. |
| 2 | **Phase 1** | Agent runtime | Core engine. Must be built and tested before API. |
| 3 | **Phase 2** | API endpoint | Minimal API to test engine end-to-end without UI. |
| 4 | **Phase 3** | Frontend create flow | Users can create v2 simulations. |
| 5 | **Phase 4** | Frontend war room | Users can SEE v2 simulations. |
| 6 | **Phase 5** | Migration + cleanup | Deprecate old system. |

Each phase is **independently deployable**. The system never breaks — old and new paths coexist.

---

## Quickest Path to "Will Balen win?"

If you want the fastest way to see a political debate running on the new architecture:

1. **Phase 0** (models) — 1-2 hours
2. **Phase 1** (runtime with moderator-led, vote end, 4 agents) — 4-6 hours
3. **Phase 2** (API endpoint) — 1 hour
4. **Test with curl**: `curl -X POST /v2/simulations -d @will-balen-config.json` → see SSE stream in terminal

**That's 6-9 hours to a running political debate in the terminal.** Frontend comes after.

Want me to start with Phase 0?
