# Agentic Architecture: Boardroom Simulator v2

**Date:** 2026-05-24
**Status:** Proposal (approved in principle)

---

## Core Philosophy

> **The backend is a pure execution engine. It owns zero domain knowledge.**
> The end user defines everything: personas, subject, rules, prompts.
> The backend only orchestrates LLM calls based on whatever configuration it receives.

---

## Current Architecture (What Exists)

```
USER ──picks from──▶ BACKEND (owns everything)
                        │
                        ├─ seeds/personas/    ← 23 hardcoded personas
                        ├─ seeds/templates/   ← 6 hardcoded templates
                        ├─ workflow.py        ← hardcoded rules
                        ├─ models.py          ← hardcoded action types
                        └─ agents.py          ← hardcoded system prompts
```

**Agents are NOT agentic.** They are stateless LLM functions called by a LangGraph state machine.


| Component              | Current Behavior                                 |
| ---------------------- | ------------------------------------------------ |
| `select_speaker`       | Algorithm (leverage-weighted random)             |
| `generate_turn`        | Stateless LLM call — context rebuilt each turn   |
| `update_dynamics`      | Hardcoded dicts for trust/leverage/heatmap       |
| `should_continue`      | Hardcoded: 3 coalitions in 5 turns = end         |
| `interrupt_check`      | Algorithm computes bid from hardcoded formula    |
| `_build_system_prompt` | Hardcoded template with persona data from seeds/ |


---

## Target Architecture (Agentic Runtime)

```
END USER (human) ───defines──▶ UI ───sends config──▶ BACKEND (engine only)
      │                         │                        │
      │  • Personas             │  Renders forms          │  • Agent Runtime
      │  • Subject              │  Sends full config      │  • Shared Space
      │  • Rules                │  Shows results          │  • Scheduler
      │  • Prompts              │                         │  • Event Stream
      │  • End conditions       │                         │
      │                         │                         │
      │  OWNS DOMAIN            │                         │  OWNS ONLY
      │  KNOWLEDGE              │                         │  ORCHESTRATION
```

### Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                   END USER (human)                                │
│                                                                   │
│  DEFINES:                                                         │
│  • Subject: who/what is being discussed, evidence, stakes        │
│  • Agents: each has name, role, backstory, stance,               │
│    personality sliders, hidden agenda, tool access                │
│  • Rules: speaker mode, allowed actions, end condition           │
│  • Relationships: initial trust/distrust between agents          │
│  • Prompt overrides: custom system prompt template               │
│                                                                   │
│  Owns EVERYTHING domain-specific.                                │
└──────────────────────────┬───────────────────────────────────────┘
                           │ POST /simulations { full_config }
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                     ENGINE API (thin layer)                       │
│                                                                   │
│  POST /simulations          → spawn runtime with config           │
│  POST /{id}/inject          → human turn injection                │
│  GET  /{id}/stream          → SSE event stream                    │
│  GET  /{id}/state           → current full state                  │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                      AGENT RUNTIME                                │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                  SHARED SPACE                             │    │
│  │  (in-memory event-sourced message board)                 │    │
│  │                                                          │    │
│  │  • events: List[PublicEvent]  — every public statement   │    │
│  │  • state: { leverage, trust, heatmap, clock }           │    │
│  │  • bid_queue: PriorityQueue[AgentBid] — who wants floor  │    │
│  │  • rules: SpeakerRules, EndCondition, ActionSpace        │    │
│  │  • whispers: List[PrivateMessage] — backchannel comms    │    │
│  └──┬─────────────────┬─────────────────┬───────────────────┘    │
│     │                 │                 │                         │
│  ┌──▼────────┐   ┌───▼────────┐   ┌────▼───────────┐             │
│  │ Agent     │   │ Agent      │   │ Scheduler      │             │
│  │ Runtime   │   │ Runtime    │   │ (traffic cop)  │             │
│  │           │   │            │   │                │             │
│  │ loop:     │   │ loop:      │   │ • reads bids   │             │
│  │ observe   │   │ observe    │   │ • grants floor  │             │
│  │ think     │   │ think      │   │ • validates     │             │
│  │ decide    │   │ decide     │   │   actions       │             │
│  │ act       │   │ act        │   │ • checks end    │             │
│  │           │   │            │   │   condition     │             │
│  │ Has OWN   │   │ Has OWN    │   │ • maintains     │             │
│  │ private   │   │ private    │   │   clock         │             │
│  │ memory    │   │ memory     │   │                │             │
│  └───────────┘   └────────────┘   └────────────────┘             │
│                                                                   │
│  Each agent:                                                      │
│  • Runs continuously (loop, not function call)                    │
│  • Has persistent private memory (remembers everything)           │
│  • Decides IF and WHEN to bid for the floor                      │
│  • Can send PRIVATE messages to other agents                     │
│  • Can form coalitions before public action                      │
│  • Can change strategy mid-simulation                            │
│  • Can REFUSE to speak                                           │
│                                                                   │
│  Agent loop:                                                      │
│    while simulation.is_running():                                 │
│      event = shared_space.wait_for_next()                         │
│      private_memory.store(event)                                  │
│                                                                   │
│      if scheduler.grants_floor_to(my_id):                         │
│        response = llm.invoke(                                     │
│          prompt=user_defined_template,                            │
│          context=private_memory.full_context(),                   │
│          recent=shared_space.last_n_events(10),                   │
│          allowed_actions=user_defined_action_space,               │
│        )                                                          │
│        shared_space.publish(response)                             │
│                                                                   │
│      # Agent can act without the floor too                        │
│      if should_bid_for(event):                                    │
│        shared_space.submit_bid(agent_id, urgency=N)               │
│      if should_whisper_to(other):                                 │
│        shared_space.whisper(from=my_id, to=other, msg="...")     │
│      if should_update_goal():                                     │
│        private_memory.update_strategy(new_goal)                   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Three Key Shifts

### 1. Agents as Running Processes, Not Functions


| Current                                            | Target                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `agent.invoke(state)` — one call, one response     | Agent runs a persistent `observe → think → decide → act` loop           |
| Context rebuilt every call from WorkflowState      | Agent has private memory — remembers everything it said, thought, heard |
| Agent responds when called by orchestrator         | Agent decides IF it wants to bid for the floor                          |
| Same prompt every turn — no strategy               | Agent tracks goals, adapts tactics mid-simulation                       |
| `internal_reasoning` is a single field in response | Internal reasoning is the agent's *continuous thought log*              |


### 2. Shared Space Replaces State Machine


| Current                                                                | Target                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `WorkflowState` dict passed through LangGraph — all state in one place | Event-sourced message board — agents read/write independently     |
| Orchestrator mutates state for agents                                  | Agents read shared space, write only their own actions            |
| Speaker selection is an algorithm                                      | Moderator agent (or rule engine) decides — agents *bid* for floor |
| Actions validated at generation time                                   | Scheduler validates — agent proposes, scheduler accepts/rejects   |


### 3. User Owns Everything Domain-Specific


| Current                                                 | Target                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Backend has `seeds/personas/` — user picks from library | Library exists in UI for convenience. Backend never sees it. User creates personas. |
| Backend has `_TRUST_DELTAS` hardcoded in workflow.py    | User defines: "endorse +3 trust, refute -4" per simulation                          |
| Backend has `_build_system_prompt` template             | User provides prompt template with `{name}`, `{stance}`, `{subject}` variables      |
| Backend has `should_continue` hardcoded                 | User says: "vote after 8 turns, majority wins"                                      |
| ActionType is a Python Literal union                    | Action types are strings from user's config                                         |
| Tools are 3 hardcoded profiles                          | User attaches any tool/API/dataset to any agent                                     |


---

## Data Model (What the End User Sends)

```json
{
  "scenario_type": "debate",
  "subject": {
    "name": "Will Balen win?",
    "description": "Politician/EX Ktm Mayor",
    "attributes": {
      "kmc_term": "2017–2022",
      "infra_projects_completed": 12,
      "budget_utilization": "78%",
      "controversy_count": 3,
      "term_limit": "2 terms max"
    },
    "evidence_items": [
      "Kathmandu road expansion project — completed under budget",
      "Bagmati riverfront development — stalled midway",
      "Tax revenue growth report during tenure: +34% YoY avg",
      "Ethics committee inquiry on land zoning decision (closed with note)"
    ],
    "stakes_description": "Re-election to Parliament vs retirement from politics vs party shift"
  },
  "stakeholders": [
    {
      "id": "analyst_supporter",
      "name": "Rajesh Pandey",
      "role": "Senior Political Analyst",
      "backstory": "Covers Ktm politics for 15 years, known pro-development bias",
      "stance": "champion",
      "personality": {
        "aggressiveness": 35,
        "empathy": 60,
        "stubbornness": 40,
        "verbosity": 65
      },
      "hidden_agenda": "Has a book coming out about the 'Ktm Renaissance' — needs Will's tenure to look good",
      "tools": []
    },
    {
      "id": "rival_politician",
      "name": "Sunita Thapa",
      "role": "Opposition Party Spokesperson",
      "backstory": "Ran against Will in the last municipal election, lost narrowly",
      "stance": "detractor",
      "personality": {
        "aggressiveness": 80,
        "empathy": 25,
        "stubbornness": 75,
        "verbosity": 50
      },
      "hidden_agenda": "Positioning herself for party leadership — defeating Will's legacy is step one",
      "tools": []
    },
    {
      "id": "journalist",
      "name": "Aasha Khadka",
      "role": "Investigative Journalist",
      "backstory": "Fact-checker and debate moderator, known for neutrality",
      "stance": "moderator",
      "personality": {
        "aggressiveness": 45,
        "empathy": 50,
        "stubbornness": 35,
        "verbosity": 55
      },
      "hidden_agenda": "Working on a corruption expose — not about Will, but wants to see if anyone slips up",
      "tools": []
    },
    {
      "id": "neutral_economist",
      "name": "Dr. Binod Sharma",
      "role": "Urban Economist",
      "backstory": "Published mixed assessment of Ktm's development under Will",
      "stance": "neutral",
      "personality": {
        "aggressiveness": 20,
        "empathy": 45,
        "stubbornness": 60,
        "verbosity": 40
      },
      "hidden_agenda": "Wants to steer conversation toward evidence-based policy, away from personality attacks",
      "tools": []
    }
  ],
  "action_space": {
    "debate": ["endorse", "refute", "cross_examine", "rebut", "call_evidence", "concede"],
    "custom_deltas": {
      "endorse":        { "trust": 3,  "leverage": 2 },
      "refute":         { "trust": -4, "leverage": 4 },
      "cross_examine":  { "trust": -2, "leverage": 3 },
      "rebut":          { "trust": 1,  "leverage": 0 },
      "call_evidence":  { "trust": 2,  "leverage": 1 },
      "concede":        { "trust": 5,  "leverage": -5 }
    }
  },
  "speaker_rules": {
    "mode": "moderator_led"
  },
  "end_condition": {
    "type": "vote",
    "voters": ["analyst_supporter", "rival_politician", "journalist", "neutral_economist"],
    "threshold": 0.5,
    "max_turns": 10
  },
  "system_prompt_template": "You are {name}, {role}. The topic: 'Will Balen win?' — debating {subject.name}'s political career. Your stance is {stance}. {stance_instruction}. Your backstory: {backstory}. Available actions: {allowed_actions}.",
  "voltage": 65,
  "player_mode": false
}
```

---

## Engine Implementation

### Agent Runtime (per-agent loop)

```python
class AgentRuntime:
    def __init__(self, agent_config, shared_space, llm):
        self.config = agent_config       # user-defined identity, stance, personality
        self.shared_space = shared_space # event bus
        self.llm = llm                   # LLM instance
        self.memory = AgentMemory()      # persistent private memory
    
    async def run(self):
        """Main loop — runs until simulation ends."""
        while self.shared_space.is_running():
            event = await self.shared_space.wait_for_next()
            self.memory.record(event)
            
            # Agent can always decide to bid for the floor
            if self._should_bid(event):
                self.shared_space.submit_bid(self.config.id, urgency=self._compute_urgency(event))
            
            # Agent can whisper to others
            if self._has_private_opportunity(event):
                target, message = self._formulate_whisper(event)
                self.shared_space.whisper(self.config.id, target, message)
            
            # Agent's turn to speak
            if self.shared_space.is_my_turn(self.config.id):
                response = await self._generate_turn()
                self.shared_space.publish(response)
    
    async def _generate_turn(self):
        """LLM call using user-defined prompt template + full context."""
        prompt = self._build_prompt()
        response = await self.llm.invoke(prompt)
        self.memory.record_own_turn(response)
        return response
    
    def _should_bid(self, event):
        """Agent decides for itself whether to try interrupting."""
        # Uses personality, stance, current strategy, context
        # Not a hardcoded algorithm
        ...
```

### Shared Space

```python
class SharedSpace:
    """Event-sourced message board. All agents read/write here."""
    
    events: list[PublicEvent]       # every public statement
    whispers: list[PrivateMessage]  # backchannel communications
    state: SimulationState          # leverage, trust, heatmap, clock
    bid_queue: asyncio.PriorityQueue  # agent bids for floor
    rules: SimulationRules          # user-defined rules
    
    async def publish(self, event: PublicEvent): ...
    async def whisper(self, sender: str, recipient: str, message: str): ...
    async def submit_bid(self, agent_id: str, urgency: float): ...
    async def wait_for_next(self) -> Event: ...
    def is_my_turn(self, agent_id: str) -> bool: ...
```

### Scheduler

```python
class Scheduler:
    """Traffic cop — not a puppet master.
    
    Does NOT decide what agents say or when they speak (unless
    moderator-led mode). Only:
    - Reads agent bids
    - Grants floor based on rules (moderator decides in mod-led mode)
    - Validates actions against allowed action space
    - Checks end condition after each turn
    - Maintains simulation clock
    """
    ...
```

---

## What the Backend No Longer Does


| Concept               | Removed From Backend                | Who Owns It Now                 |
| --------------------- | ----------------------------------- | ------------------------------- |
| Persona definitions   | `seeds/personas/`                   | User (via UI form)              |
| Scenario templates    | `seeds/templates/`                  | User (per-simulation config)    |
| Action types          | `ActionType` literal union          | User (strings in config)        |
| Trust/leverage deltas | `_TRUST_DELTAS`, `_LEVERAGE_DELTAS` | User (in action_space config)   |
| Heatmap rules         | `_HEATMAP_RULES`                    | User (optional, per-simulation) |
| System prompt         | `_build_system_prompt()`            | User (template with variables)  |
| Speaker selection     | `select_next_speaker` algorithm     | User (speaker_rules config)     |
| End condition         | `should_continue` consensus logic   | User (end_condition config)     |
| Moderator logic       | Doesn't exist                       | User (moderator-stance agent)   |
| Subject of debate     | Doesn't exist                       | User (subject config)           |


---

## What the Backend ONLY Does

1. **Boot**: Accept full config, spawn agent runtimes, create shared space
2. **Run**:
  - Each agent runs its own observe-think-decide-act loop
  - Scheduler reads bids, grants floor, validates actions, checks end conditions
  - Shared space routes events between agents
3. **Stream**: Push all public events to frontend via SSE
4. **Cleanup**: Terminate agent runtimes when end condition met

Zero domain knowledge. Zero hardcoded personas. Zero templates. Just orchestration.

---

## Comparison: "Will Balen win?" Simulation

### Current System

- No Will Balen exists → agents discuss abstract business metrics (LTV, CAC, burn rate) instead of political track record
- Samuel (AGREEABLE) coalition-signals everything → triggers false consensus
- Morgan (host) never speaks → no moderator
- Simulation ends early (3 coalitions detected) → no verdict
- Result: generic discussion, no decision, wrong context entirely

### Target System

- Will Balen is the defined Subject: ex-Kathmandu Mayor, politician
- Rajesh (champion) argues FOR — cites road projects, tax revenue growth, infra delivery
- Sunita (detractor) argues AGAINST — cites stalled riverfront project, ethics inquiry, missed targets
- Binod (neutral) asks evidence-based questions — budget utilization, feasibility studies
- Aasha (moderator) runs alternating speakers, keeps time, fact-checks claims
- After 10 turns, Aasha calls vote → "Will wins 3-1"
- Result: clear verdict with per-stakeholder breakdown and cited evidence

---

## Implementation Phases


| Phase | What                                                                          | Files                    | Effort |
| ----- | ----------------------------------------------------------------------------- | ------------------------ | ------ |
| **1** | Data models: Subject, Stance, CustomAction, EndCondition, SpeakerRules        | `models.py` + `types.ts` | Medium |
| **2** | Agent Runtime: persistent loop with private memory                            | `agents.py` (rewrite)    | High   |
| **3** | Shared Space: event-sourced message bus                                       | `space.py` (new)         | Medium |
| **4** | Scheduler: bid reader, floor granter, action validator, end condition checker | `scheduler.py` (new)     | Medium |
| **5** | Dynamic action space + custom deltas in dynamics                              | `workflow.py` (rewrite)  | High   |
| **6** | Frontend: persona builder, subject config, rules config                       | New components           | High   |
| **7** | Frontend: extended create flow (5 steps)                                      | `new/page.tsx`           | Medium |
| **8** | Wire end-to-end: full config → runtime → SSE → frontend render                | `main.py`, `api.ts`      | Medium |


---

## Key Design Decisions

1. **Single process, async**: Agent runtimes run as asyncio tasks in one process (not separate containers). Simpler, cheaper, sufficient for simulations with 3-12 agents.
2. **Event-sourced shared space**: Every event is append-only. Agents can replay history. No mutable state races.
3. **Agent memory is private**: Other agents cannot read an agent's `memory`. Only the moderator (if configured) can see thought logs.
4. **Bid-based floor control**: Agents don't self-assign the floor. They bid. Scheduler (or moderator) grants it. Prevents talking over each other.
5. **User prompt templates use `{variables}`**: The backend fills in `{name}`, `{stance}`, `{subject}`, `{backstory}` etc. from config. No prompt engineering in backend code.
6. **Seeds/ become frontend-only library**: Stored in the UI as "starter templates." Backend never reads them. Users can save their own scenario configurations locally.
7. **Backward compatible**: All existing `SimulationCreate` fields still work with defaults. `scenario_type="negotiation"` + `speaker_rules.mode="weighed_random"` produces exact same behavior as current system.

