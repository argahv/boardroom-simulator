# 10x UX Analysis: Boardroom Simulator
Session 1 | Date: 2026-05-24

## Current Value

Boardroom Simulator is a multi-agent negotiation war room — users configure a debate with AI stakeholders, run the simulation, and watch real-time negotiations unfold across three layout views (roster, table, graph). A post-mortem analysis delivers strategy cards, alignment deltas, and objection topology.

### Who uses it and why?
- **Product leaders / founders** — rehearse high-stakes negotiations before real meetings
- **Strategy consultants** — model stakeholder dynamics in M&A, partnerships, board decisions
- **Negotiation coaches** — demonstrate negotiation theory with AI-generated case studies
- **Sales teams** — simulate procurement/enterprise deal dynamics

### Core user flow:
1. Land on homepage → "Start a simulation" → Configure wizard (4 steps)
2. Set subject, add personas, configure rules/voltage → Launch
3. Watch real-time negotiation (roster, table, or graph layout)
4. View post-mortem analysis when done

---

## The Question

**What would make this 10x more valuable as a UX experience?**

Not "what features to add." What changes to the experience itself transform how users perceive and use this tool?

---

## Massive Opportunities

### 1. One-Click "Dive In" Mode — Zero-config instant simulation
**What**: A single "Quick Play" button on the homepage that launches a fully-configured simulation in 1 click. Choose from 5 curated templates (Series A pitch, Merger dispute, Partnership renewal, etc.) — all personas, tension, rules pre-set. Within 8 seconds you're watching a debate.

**Why 10x**: The biggest UX friction is the 4-step wizard. First-time users face cognitive overload before experiencing the core value. **The wizard is for power users. The front door should be instant gratification.** A single click → instant simulation removes ALL onboarding friction.

**Unlocks**: 
- Embeddable simulation previews (link to a live sim from a blog post)
- "Simulate this" from any template page
- Viral sharing — "here's my simulation, click to watch"

**Effort**: Medium (template data + route + pre-configured defaults)
**Risk**: Users skip customization and miss depth
**Score**: 🔥 **Must do**

### 2. Real-Time "Director Mode" — Interactive intervention during simulation
**What**: While the simulation runs, human users can interrupt, redirect, or inject their own arguments. A "jump in" button pauses the AI and lets the user speak as any stakeholder. The simulation adapts to the human input and continues.

**Why 10x**: Currently the simulation is a spectator sport — you watch. Making it interactive transforms passive viewing into active rehearsal. Instead of "what would happen," users ask "what happens if I say THIS?" This is the difference between a demo and a training tool.

**Unlocks**: 
- True rehearsal value: practice responses, try different approaches
- Learning: see how the room reacts to your intervention
- Teaching tool: coaches can pause, discuss, inject counter-arguments
- Virality: "I talked back to the AI board and here's what happened"

**Effort**: High (SSE changes, turn injection UI, state reconciliation)
**Risk**: Technical complexity; keeping AI coherence after human intervention
**Score**: 🔥 **Must do** (this is the core product pivot)

### 3. Simulation Library & Discovery — Templates, community, remixing
**What**: A rich library of scenario templates with metadata (complexity, voltage, duration, stakeholders). Users can browse, preview, fork, tweak, and share. Template categories: Fundraising, M&A, Partnership, Sales, Policy, Internal strategy.

**Why 10x**: Today `/frameworks` has 3 hardcoded entries. A rich template library makes the product *discoverable* — users can explore scenarios they hadn't thought of. It builds a content moat and turns the product into a destination.

**Unlocks**:
- User-generated templates (viral loop)
- Usage analytics reveal which scenarios resonate
- Onboarding path: browse → pick → play (5 seconds)
- Fractional content marketing: "10 boardroom scenarios you should rehearse"

**Effort**: Medium (UI + storage + maybe markdown-based template format)
**Risk**: Empty library problem at launch
**Score**: 👍 **Strong**

---

## Medium Opportunities

### 1. Narrative Timeline — Where you are in the story
**What**: A visual narrative arc showing the simulation's dramatic structure — introduction, first clash, escalation, resolution. Shows key turning points as labeled milestones on a timeline. Color bands for tension level.

**Why 10x**: Currently users see turn-by-turn but lack a sense of narrative progression. A timeline gives **orientation** — "we're in the escalation phase" — and makes each simulation feel like a story with shape, not a flat list of exchanges.

**Impact**: Dramatically improves comprehension of long simulations. Makes re-watching/scrolling purposeful. Users can jump to "the part where it got heated."

**Effort**: Low-Medium (existing ConflictTimeline component exists but isn't prominent)
**Score**: 👍 **Strong**

### 2. Before/After Stakeholder State Comparison
**What**: At simulation end, show each stakeholder's position shift. A "where they started → where they ended" visual: stance, sentiment, leverage deltas. Animated Sankey or parallel coordinates.

**Why 10x**: This answers the core question users have: "did anything actually change?" Seeing position drift makes the simulation's impact tangible. It surfaces the hidden win (someone who moved from detractor to neutral) that the raw transcript obscures.

**Impact**: Immediate comprehension of outcomes. Shareable summary graphic.
**Effort**: Low-Medium (data exists in post-mortem; needs visualization)
**Score**: 👍 **Strong**

### 3. Transcript Search & Highlights
**What**: Cmd+F search across the transcript. Auto-highlight key phrases (objections, commitments, numbers). Pin/bookmark important turns. Shareable link to specific turn.

**Why 10x**: War rooms generate dense transcripts. Finding "when did the CFO mention budget?" becomes a hunt. Search turns the transcript from a log into a reference document. Pins make it collaborative: "look at turn 14."

**Impact**: Both individual productivity and team collaboration improvement.
**Effort**: Low (text search on turns array + URL hash for sharing)
**Score**: 🔥 **Must do**

### 4. "What If" Branching — Fork a simulation at any point
**What**: From any turn in a completed simulation, click "What if..." to fork. Creates a new simulation starting from that turn's context, with one parameter changed (different stakeholder response, different voltage).

**Why 10x**: This is the most natural question after watching a simulation: "what if the CFO hadn't conceded?" Forking makes the product a hypothesis engine, not just a simulator.

**Impact**: Turns one-off simulations into exploration trees. Compounding value — each run feeds the next. Deep engagement.
**Effort**: High (state serialization, engine modifications)
**Score**: 🤔 **Maybe** (technical complexity, but high potential)

### 5. Simulation Sharing & Embeds
**What**: Generate a shareable link to any simulation with a summary card (title, voltage, participants, outcome). Optional public embed widget for blogs/notion. Turn-by-turn collaborative commenting.

**Why 10x**: Makes the tool collaborative and viral. A founder rehearses a board meeting and shares the post-mortem with their co-founder. A consultant embeds a sim in a strategy deck.

**Impact**: Organic distribution, team adoption, stickiness.
**Effort**: Medium (public routes, embed, commenting UI)
**Score**: 👍 **Strong**

---

## Small Gems

### 1. Voltage visual indicator during wizard
**What**: As users adjust voltage slider (0-100), a live preview shows the emotional tone — a small animated indicator of "calm" ↔ "heated." Makes an abstract number tangible.
**Effort**: Low
**Score**: 🔥 **Must do**

### 2. "Skip to end" in playback controls
**What**: Jump-to-last-turn button next to the playback controls. Also "jump to next clash" button.
**Effort**: Very low
**Score**: 🔥 **Must do**

### 3. Empty state improvements across all pages
**What**: Currently `/simulate` empty state just says "No simulations yet." Could show: a sample embed, a quick-start template picker, or a "Watch demo" button. Same for analytics, frameworks, library.
**Effort**: Low
**Score**: 🔥 **Must do**

### 4. Turn counter with estimated time remaining
**What**: During live simulation, show "Turn 7/15 · ~2 min remaining" based on speed and turn count. Reduces uncertainty during waiting.
**Effort**: Very low
**Score**: 👍 **Strong**

### 5. Keyboard shortcuts in war room
**What**: Space = play/pause, ← → = step back/forward, 1/2/3 = switch layout, S = speed cycle, Esc = close panels. Power users navigate without touching the mouse.
**Effort**: Low
**Score**: 👍 **Strong**

### 6. Post-mortem email/notification when long sim completes
**What**: Background simulations (worker-queued) notify user when done. Currently user must sit and watch.
**Effort**: Low (notification component exists but unused)
**Score**: 👍 **Strong**

### 7. Persona "mood ring" in roster panel
**What**: Small color dot next to each stakeholder indicating current emotional state (from sentiment data). Changes as simulation progresses. Instant read on room temperature.
**Effort**: Low
**Score**: 👍 **Strong**

---

## Recommended Priority

### Do Now (Quick wins — <1 day each)
1. **Empty state improvements** — all pages get rich empty states with sample data, CTAs, or demo links
2. **"Skip to end"** playback button + jump-to-clash
3. **Turn counter with ETA** during live simulation
4. **Voltage visual indicator** in wizard (live emotion preview)
5. **Keyboard shortcuts** in war room (space, arrows, 1/2/3)

### Do Next (High leverage — 1-2 weeks)
1. **One-click "Quick Play"** — instant simulation from template, no wizard
2. **Transcript search & highlights** — Cmd+F, URL-per-turn sharing
3. **Narrative timeline** — visible narrative arc with milestone labels
4. **Before/After stakeholder state** comparison summary
5. **Persona "mood ring"** in roster stakeholder panel

### Explore (Strategic bets — 2-6 weeks)
1. **Director Mode** — interactive intervention during simulation (core product pivot)
2. **Simulation Library & Discovery** — templates, categories, remixing
3. **Sharing & Embeds** — public links, embedded widget

### Backlog (Good but not now)
1. **"What If" branching** — fork simulation mid-stream (high complexity)
2. **Analytics page** — cross-simulation patterns (needs data first)

---

## Key UX Friction Points Found

| Friction | Location | Impact | Fix |
|----------|----------|--------|-----|
| 4-step wizard is the ONLY entry | `/simulate/new` | Blocks new users | Quick Play bypass |
| No template discovery | `/frameworks` | 3 hardcoded entries | Rich template library |
| Transcript is a wall of text | War room | Hard to find moments | Search + highlights |
| No narrative shape | War room | Turn list lacks context | Timeline arc |
| Analytics empty | `/analytics` | Dead-end page | Fill with data or remove |
| No interaction during sim | Everywhere | Passive spectator | Director Mode |
| Postmortem in dark card inline | War room | Hard to read | Proper full-width display |
| Persona creation is modal | `/personas` | Feels disconnected | Inline or page design |
| Loading = blank | Sim list, war room | Uncertainty | Skeletons everywhere |

## Visual Design Notes

**What works**: The warm earth palette (canvas #faf9f5, ink #141413, primary #924a31) is distinctive — doesn't feel like another blue-white SaaS. Typography choices (Newsreader for display, Inter for UI) are strong. The Table layout with radial seating is genuinely beautiful.

**What could improve**:
- The dark war room panels lack visual hierarchy — sentiment graph, heatmap, coalitions all bleed into each other
- Avatar component is simple (initials + colored circle) — could be more expressive with stance indicators
- Post-mortem inline card on war room is cramped — needs its own proper full-width treatment
- Responsive breakpoints barely exist — war room is desktop-only currently

---

## Questions

### Answered
- **Q**: What's the biggest UX bottleneck? **A**: The 4-step wizard as the only entry point
- **Q**: Are the components there? **A**: Yes — solid foundation, needs interaction layer
- **Q**: What builds a moat? **A**: Template library + sharing/embeds (content network effect)
- **Q**: Mobile? **A**: Not ready — war room layouts are desktop-only

### Blockers
- **Q**: For Director Mode — can the engine handle mid-simulation human injection? (needs backend check)
- **Q**: For Quick Play — what's the fastest template format? (markdown? JSON?)

## Next Steps
- [ ] Implement Quick Play mode (instant sim from template)
- [ ] Add empty state improvements across all pages
- [ ] Build narrative timeline component
- [ ] Research: can engine support Director Mode?
- [ ] Research: template library format
