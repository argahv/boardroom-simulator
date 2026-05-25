# Critical Finding: Attributes & Evidence Data Gap

**Date**: 2026-05-24  
**Status**: Requires decision on intended vs actual design

---

## The Data Flow — What Actually Happens

```
User fills in UI
  ↓ (frontend/app/simulate/new/page.tsx)
Subject { name, description, attributes {}, evidence_items [] }
  ↓ (api.ts: createSimulationV2)
POST /simulations → SimulationV2Config
  ↓ (main.py: create_simulation_v2 + stream_simulation_v2)
Stored in _v2_simulations[simulation_id]["config"]
  ↓ (main.py: run_simulation_v2)
Passed to SimulationV2Config
  ↓ (runtime/simulation.py)
AgentRuntime created with system_prompt_template
  ↓ (runtime/agent.py: _build_system_prompt)
System prompt: "Current subject: {subject_name} — {subject_description}\n"
  ✗ attributes and evidence_items NEVER appear
```

---

## What's Collected vs What's Used

| Field | Collected? | Stored? | Seen by Agents? | Impact on Reasoning? |
|-------|-----------|---------|-----------------|---------------------|
| `subject.name` | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Critical |
| `subject.description` | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Critical |
| `subject.stakes_description` | ✅ Yes | ✅ Yes | ❌ No | ❌ Zero |
| `subject.attributes` | ✅ Yes | ✅ Yes | ❌ No | ❌ Zero |
| `subject.evidence_items` | ✅ Yes | ✅ Yes | ❌ No | ❌ Zero |

**Conclusion**: Users fill out 5 fields. Only 2 reach agents. 60% of collected data is dead weight.

---

## Seed Data Reveals Intended Design

Look at `backend/scripts/seed_fresh.py` and `seed_templates.py`:

```python
{
    "name": "Acquisition Bidding War",
    "description": "Two rival tech conglomerates...",
    "attributes": {
        "valuation": 2800000000,
        "employees": 120,
        "revenue_arr": 42000000
    },
    "evidence_items": [
        "MegaCorp offered $2.6B all-cash...",
        "TechGlobal offered $3.1B with 4-year...",
        "Startup grew 340% ARR in 18 months...",
    ]
}
```

Every seed scenario has **rich, structured attributes and evidence**. This was intentional design. The data is meant to ground agents in factual context.

But the runtime ignores it. **Design intention ≠ Implementation**.

---

## Why This Matters — The Relevance Chain

### For Agents
- **Without attributes/evidence**: Agents debate based only on name + description. They invent facts, make assumptions, wing it.
- **With attributes/evidence**: Agents have quantifiable stakes ("valuation: $2.8B") and documented evidence to reference. Reasoning becomes grounded.

### For Simulation Quality
- **Current**: A debate about "Acquisition" with no numbers is vague. Agents say generic things.
- **Intended**: A debate with `valuation: 2800000000, employees: 120` + 4 specific evidence items forces agents to reason about concrete facts. Better emergent behavior.

### For UX (why UI improvements matter)
- **If attributes/evidence are dead**: Making the UI prettier is theater. Users fill in data for nothing.
- **If they're connected**: Improving the UI becomes essential. Users are providing grounding facts that determine simulation quality.

---

## What's Actually Missing (3-Layer Gap)

### Layer 1: Backend — System Prompt Integration
Lines in `runtime/agent.py` _build_system_prompt():

**Current**:
```python
template = (
    self.system_prompt_template or (
        "You are {name}, {role}. {backstory}\n"
        "Your stance: {stance}.\n{stance_description}\n"
        "Current subject: {subject_name} — {subject_description}\n"  # ← Only these
        "Hidden agenda: {hidden_agenda}\n"
        "Personality: aggressiveness={aggressiveness}, empathy={empathy}, "
        ...
    )
)
```

**Should be**:
```python
"Current subject: {subject_name} — {subject_description}\n"
"Key facts: {attributes_formatted}\n"  # ← ADD THIS
"Evidence: {evidence_formatted}\n"    # ← AND THIS
```

With formatting helpers:
```python
attributes_formatted = ", ".join([
    f"{k}: {v}" 
    for k, v in self.space.config.subject.attributes.items()
]) or "None"

evidence_formatted = "\n".join([
    f"• {item}" 
    for item in self.space.config.subject.evidence_items
]) or "None"
```

**Effort**: ~15 lines. **Impact**: Agents now reason about concrete facts.

### Layer 2: Frontend — Richer Data Collection
Current UI lets users enter arbitrary Key/Value strings. No structure.

**What's needed**:
1. **Type selection**: Indicate if each attribute is number/string/boolean
2. **Evidence metadata**: Source URL, importance (high/med/low), category
3. **Structure validation**: Warn on duplicates, suggest templates

**Example UI flow**:
- Subject name: "Acquisition Bidding War"
- Auto-suggest attributes from templates or description
- Each attribute row: `[Key select] [Type dropdown] [Value input] [Delete]`
- Evidence: Rich card with source + importance tag instead of flat text

### Layer 3: Design Intent Alignment
Decide: **Are attributes/evidence core to the simulation, or optional flavor?**

If **core**: Implement both Layer 1 + Layer 2. Emphasize them in the UI.  
If **optional**: Remove them from the form, or clearly mark as "advanced/optional".

---

## What Can Be Done — Prioritized

### Priority 1: Layer 1 (backend integration)
**Effort**: 15 lines  
**Timeline**: 30 minutes  
**Impact**: 10x — agents now have grounding facts

1. Add `attributes_formatted` and `evidence_formatted` to system prompt template
2. Pass `subject.attributes` and `subject.evidence_items` into template.format()
3. Test: Create a simulation with attributes, verify they appear in agent reasoning in the war room UI

**This is the critical move. Without this, all UI work is wasted.**

### Priority 2: Layer 2 (frontend data quality)
**Effort**: 4-6 hours  
**Timeline**: 1 sprint  
**Impact**: High — users provide better structured data

**Quick wins (low-hanging fruit)**:
1. Duplicate attribute key detection + merge warning
2. Character count on evidence items
3. Empty state illustrations
4. Keyboard shortcuts (Tab, Enter)

**Medium wins**:
1. Type-aware inputs (number → slider, boolean → toggle)
2. Evidence cards with source URL + importance tag
3. Attribute templates (5 pre-built schemas)

### Priority 3: Layer 3 (design decision)
**Effort**: 1 meeting  
**Timeline**: Now  
**Impact**: Prevents wasted work

Decide: Are attributes/evidence **core** or **nice-to-have**?

- If **core**: Make them visually prominent. Required fields. Rich data collection.
- If **nice-to-have**: Move to "Advanced" section. Optional. Minimal UI.

Current state is neither — they're in the normal flow but never used. That's the worst of both worlds.

---

## Recommendation

**Start with Priority 1 (backend, 30 min).** Add attributes and evidence to the agent system prompt. This unlocks the feature.

Then **decide Priority 3** (is this core or optional?). If core, invest in Priority 2 (frontend) to collect richer data.

If you do Priority 2 without Priority 1, you're optimizing dead data. The UI improvements won't matter because agents still won't see the attributes/evidence.

---

## Questions to Answer

1. **Was the attributes/evidence gap intentional** (features cut for MVP) **or accidental** (implemented but forgotten)?
2. **Are attributes/evidence meant to be core** to simulations, or just optional context?
3. **Should we enforce typed attributes** (number/string/boolean), or keep them flexible?
4. **Should evidence items have metadata** (source, credibility, category), or stay flat strings?

Answers to these will determine the roadmap.

