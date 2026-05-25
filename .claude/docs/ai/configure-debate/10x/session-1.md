# 10x Analysis: Configure Debate — Attributes & Evidence UI
Session 1 | Date: 2026-05-24

## Current State

The Configure Debate step (Step 1 of 4) has two input-group sections:

**Attributes**: Two plain `<input>` fields (Key + Value) + `<Button>Add</Button>`. After adding, items render as tiny pill badges (`key: value ×`). Backed by a flat `Record<string, string | number>`.

**Evidence Items**: Single `<input>` + `<Button>Add</Button>`. Items render as a bullet list (`• item ×`). Backed by `string[]`.

**UX Score**: Functional but primitive. Feels like a dev tool, not a polished product. No guidance, no visual hierarchy, no affordances beyond bare HTML.

## The Question

What would make this Attributes/Evidence flow 10x more valuable — the kind of UX that makes users feel like the product "gets" them?

---

## Massive Opportunities

### 1. Smart Attribute Engine (AI-Suggested Attributes)
**What**: When user types subject name + description, the system auto-suggests relevant attribute templates. E.g., typing "Climate Policy" → suggests `{ "Carbon Tax": "$50/ton", "Emissions Target": "2030", "Regulatory Body": "EPA" }`. User can accept/reject/edit each.
**Why 10x**: Eliminates the cold-start problem. Most users don't know what attributes to define. This teaches them the product's mental model in one click.
**Unlocks**: Turns "data entry" into "configuration assistant." Makes the product feel intelligent from step 1.
**Effort**: Medium (one LLM call + suggestion UI)
**Score**: 🔥 Must do

### 2. Structured Attribute Templates Library
**What**: Pre-built attribute schemas for common debate types: Merger & Acquisition, Policy Debate, Board Resolution, Contract Negotiation, Performance Review. Each template ships with pre-defined attribute keys with sensible defaults.
**Why 10x**: 80% of debates fall into ~5 categories. Templates remove 100% of the "what should I put here?" friction.
**Unlocks**: Makes the tool approachable for non-power-users. Creates a library ecosystem.
**Effort**: Low (hardcoded JSON templates + a picker)
**Score**: 🔥 Must do

### 3. Visual Attribute Canvas
**What**: Replace key-value pills with an interactive visual grid where attributes have: editable label + type-aware input (number slider, string, boolean toggle, date picker) + weight/importance slider + color coding by category.
**Why 10x**: Attributes become a design surface, not a form. Users can see their debate landscape at a glance. Weighted attributes map naturally to agent behavior.
**Unlocks**: Makes "configuring a debate" feel like designing a game board, not filling a spreadsheet.
**Effort**: High
**Score**: 👍 Strong

---

## Medium Opportunities

### 1. Type-Aware Inputs
**What**: Let user specify attribute type (string/number/boolean/enum) when creating. Number gets a slider/stepper. Boolean gets a toggle. Enum gets a dropdown. String gets a text input.
**Why 10x**: A `"stake: 5000000"` is different from `"approved: true"` is different from `"region: EU"`. Type-aware inputs prevent errors and make the data model self-documenting. The backend already auto-detects `isNaN(Number(attrVal))` — this formalizes that.
**Effort**: Medium
**Score**: 🔥 Must do

### 2. Bulk Paste Import
**What**: "Paste attributes from spreadsheet" button. Accepts tab-separated or comma-separated `key,value` pairs. One-click import 20 attributes.
**Why 10x**: Power users coming from spreadsheets can migrate in seconds. Turns a tedious 5-minute entry into a 5-second paste.
**Effort**: Low
**Score**: 👍 Strong

### 3. Evidence Rich Entry
**What**: Replace single-line evidence input with a multi-line card that supports: source URL, importance tag (high/med/low), category tag, optional quote. Render as styled cards with metadata badges instead of flat bullets.
**Why 10x**: Evidence items are the ammunition in a debate. Treating them as strings is like treating weapons as labels. Structured evidence → better agent reasoning → better simulations.
**Effort**: Medium
**Score**: 🔥 Must do

### 4. Inline Duplicate Detection + Merge
**What**: When user adds an attribute key that already exists, show a warning and offer to merge or rename. Same for near-duplicate evidence text.
**Why 10x**: Prevents silent data loss (the current code silently overwrites with `{ ...prev, [key]: val }`). Builds trust.
**Effort**: Low
**Score**: 👍 Strong

### 5. Iceberg Tip — Preview Attributes in Agent Behavior
**What**: Next to each attribute, show a small tooltip: "This will make Agent X argue for/against Y" based on persona stances. Connected to Step 2 data.
**Why 10x**: Bridges the gap between "configuring data" and "seeing it come alive." Users understand WHY they're filling this out.
**Effort**: Medium-High
**Score**: 🤔 Maybe

### 6. Drag-to-Reorder
**What**: Drag handles on attribute chips and evidence items. Priority ordering matters for agent reasoning.
**Why 10x**: Current order is insertion-order. Power users need control without delete-re-add.
**Effort**: Medium (requires `@dnd-kit` or similar)
**Score**: 👍 Strong

### 7. Keyboard-First Workflow
**What**: Tab goes Key→Value→Add. Enter submits the Add. Focus returns to Key after Add. Arrow keys navigate between existing attribute chips.
**Why 10x**: For users creating 15+ attributes, every second of friction compounds. Keyboard-native flow saves minutes across a session.
**Effort**: Low
**Score**: 🔥 Must do

---

## Small Gems

### 1. Micro-animations on Add/Remove
**What**: Items stagger in with a subtle scale-up on add, fade-slide on remove.
**Why powerful**: Makes the UI feel responsive and alive. Costs ~10 lines of CSS.
**Effort**: Very Low
**Score**: 🔥 Must do

### 2. Empty State Illustrations
**What**: SVG illustration for empty attributes ("Add the first attribute to define your debate") and empty evidence.
**Why powerful**: Turns a blank form into an invitation. Reduces cognitive load.
**Effort**: Low
**Score**: 👍 Strong

### 3. Character Count + Preview on Evidence
**What**: Show "(128 chars)" as the input grows. Trim preview to 2 lines with "..." for long items in list.
**Why powerful**: Evidence items can be long. Users need to visually scan the list.
**Effort**: Very Low
**Score**: 🔥 Must do

### 4. "Add Another" Cmd+Enter
**What**: Cmd+Enter in evidence input adds the item without leaving the keyboard.
**Why powerful**: Feels like a native app shortcut. Power users notice immediately.
**Effort**: Very Low
**Score**: 👍 Strong

### 5. Attribute Counter Badge
**What**: Show "(3 attributes, 5 evidence items)" as a summary line under the section labels.
**Why powerful**: Gives closure — "I've done this much." Reduces anxiety about forgetting.
**Effort**: Very Low
**Score**: 🔥 Must do

### 6. Pulsing "Add" Button on Empty State
**What**: Gentle pulse animation on the Add button when the section is empty.
**Why powerful**: Nudges the user to take the first action. Lowers the activation energy.
**Effort**: Very Low
**Score**: 🤔 Maybe

---

## Recommended Priority

### Do Now (Quick wins — can ship today)
1. **Keyboard shortcuts**: Tab flow Key→Value→Add, Enter submits, auto-focus back to Key
2. **Duplicate attribute detection**: Warn before overwriting existing key
3. **Attribute counter badge**: "4 attributes · 2 evidence items" under section headers
4. **Evidence character count + truncation**: Show char count, clamp preview
5. **Micro-animations**: CSS transitions on add/remove (scale-up, fade-slide)

### Do Next (High leverage — sprint-worthy)
1. **Type-aware inputs**: Add a type selector (string/number/boolean) and render appropriate controls (slider for numbers, toggle for booleans)
2. **Structured evidence cards**: Multi-line input with source URL, importance tag, category tag. Render as styled cards.
3. **Attribute templates library**: 5 pre-built templates (M&A, Policy, Board, Contract, Review)
4. **Drag-to-reorder**: Reorder attributes and evidence by drag handle
5. **Bulk paste import**: Paste CSV/TSV key-value pairs

### Explore (Strategic bets)
1. **Smart Attribute Engine**: AI-suggested attributes from subject name/description
2. **Visual Attribute Canvas**: Grid/board view with type-aware inputs and weight controls
3. **Iceberg Tip preview**: Live preview of how attributes affect agent behavior

---

## Questions

### Answered
- **Q**: What's the current attribute storage model? **A**: Flat `Record<string, string | number>` with silent overwrite on duplicate keys
- **Q**: How are evidence items stored? **A**: Simple `string[]` with no metadata
- **Q**: Is type coercion handled? **A**: Yes — `isNaN(Number(val)) ? val : Number(val)` auto-detects numeric values

### Blockers
- **Q**: Should attribute values support more types (enums, dates, nested objects)? (Needs backend schema check)

## Next Steps
- [ ] Validate that the backend type system supports richer attribute value types
- [ ] Decide on attribute template format (JSON schema / static file / DB)
- [ ] Wire up micro-animations as a first PR

