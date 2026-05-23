# V1 War Room Integration Map

**Purpose**: Document exact props, usage patterns, and integration points for ControlBar and layout components to enable v2 war room to reuse them with minimal changes.

**Date**: 2026-05-24  
**Scope**: ControlBar, RosterLayout, TableLayout, GraphLayout, and their data flow in v1 war room page

---

## 1. ControlBar Component Interface

**File**: `frontend/components/ControlBar.tsx`

### Props Interface

```typescript
interface ControlBarProps {
  turn: number;                          // Current turn index (0-based)
  total: number;                         // Total turns available
  status: PlaybackStatus;                // "idle" | "running" | "complete"
  speedMul: SpeedMultiplier;             // 0.5 | 1 | 2
  layout: WarRoomLayout;                 // "roster" | "table" | "graph"
  scenarioLabel?: string;                // First word of scenario background
  voltage?: number;                      // Scenario voltage (optional)
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSpeedChange: (s: SpeedMultiplier) => void;
  onLayoutChange: (l: WarRoomLayout) => void;
}
```

### Exported Types

```typescript
export type WarRoomLayout = "roster" | "table" | "graph";
export type PlaybackStatus = "idle" | "running" | "complete";
export type SpeedMultiplier = 0.5 | 1 | 2;
```

### Key Behaviors

- **Status indicator**: Pulsing dot (primary color when running, muted when idle/complete)
- **Playback controls**: Restart, step back, play/pause, step forward
- **Speed selector**: Three buttons (0.5×, 1×, 2×) with active state highlighting
- **Turn counter**: Monospace display "T00 / T19" format
- **Layout switcher**: Three buttons (Roster, Table, Graph) with icons and hover states
- **Sticky positioning**: `top: 64px` (below header), `z-index: 40`

### Integration in v1 Page

```typescript
<ControlBar
  turn={turns.length}
  total={simulation?.turns.length ?? 20}
  status={status}
  speedMul={speedMul}
  layout={layout}
  scenarioLabel={simulation?.config.background?.split(" ")[0]}
  voltage={simulation?.config.voltage}
  onPlay={togglePlay}
  onPause={togglePlay}
  onRestart={handleRestart}
  onStepBack={handleStepBack}
  onStepForward={handleStepForward}
  onSpeedChange={setSpeedMul}
  onLayoutChange={setLayout}
/>
```

---

## 2. RosterLayout Component

**File**: `frontend/components/layouts/RosterLayout.tsx`

### Props Interface

```typescript
interface RosterLayoutProps {
  turns: Turn[];
  activeId: string | null;
  stakeholders: Stakeholder[];
  heatmap: HeatmapState | null;
  sentiment: number[];
  coalitions: CoalitionSignal[];
  leverageShifts: LeverageShift[];
  leaderboard: LeaderboardEntry[];
  eventLog: string[];
  conflictStep: number;
  totalSteps: number;
}
```

### Layout Structure

**Grid**: `gridTemplateColumns: "260px 1fr 340px"` (left rail, center, right sidebar)

#### Left Rail (260px)
- **Component**: `StakeholderRail`
- **Content**: List of all stakeholders
- **Per stakeholder**:
  - Avatar (36px, accent color changes on speaking)
  - Name + role
  - Badge: "SPEAKING" (if active) or last action type
  - Last turn quote (2-line clamp, italic)
  - Background: ink color when speaking, surface-card otherwise
  - Transition: 240ms ease

#### Center (1fr)
- **Top**: `TranscriptStream` component
  - Full transcript of all turns
  - Auto-scrolls to bottom on new turn
  - Shows speaker avatar, name, action type, turn index
  - Renders turn content as markdown (supports bold, italic, lists, code, blockquotes, links)
  - Min height: 360px, max height: 440px
  
- **Bottom**: `EventLogPanel` component
  - Monospace event stream
  - Prefixed with turn index (T00, T01, etc.)
  - Color-coded by event type: [agent], [tool], [alert]
  - Auto-scrolls to bottom
  - Max height: 200px

#### Right Sidebar (340px)
- **Stacked panels** (gap: 14px):
  1. `HeatmapPanel` - Three incentive bars (Commercial Gain, Tech Integrity, Legal Safety)
  2. `SentimentPanel` - Diverging bar chart (aggressive ↔ aligned)
  3. `LeveragePanel` - Recent 4 leverage shifts with arrow visualization
  4. `CoalitionPanel` - List of formed coalitions with overlapping avatars

### Data Usage

| Data | Component | Usage |
|------|-----------|-------|
| `turns` | TranscriptStream | Full transcript rendering |
| `activeId` | StakeholderRail, TranscriptStream | Highlight speaking stakeholder |
| `stakeholders` | StakeholderRail | List all participants |
| `heatmap` | HeatmapPanel | Three incentive values + recommendation |
| `sentiment` | SentimentPanel | Array of sentiment scores per turn |
| `coalitions` | CoalitionPanel | List of agent pairs + issue |
| `leverageShifts` | LeveragePanel | Recent shifts (from_agent, to_agent, reason) |
| `leaderboard` | (not used in Roster) | — |
| `eventLog` | EventLogPanel | Monospace event stream |

---

## 3. TableLayout Component

**File**: `frontend/components/layouts/TableLayout.tsx`

### Props Interface

```typescript
interface TableLayoutProps {
  turns: Turn[];
  activeId: string | null;
  stakeholders: Stakeholder[];
  heatmap: HeatmapState | null;
  coalitions: CoalitionSignal[];
  leverageShifts: LeverageShift[];
  leaderboard: LeaderboardEntry[];
  eventLog: string[];
}
```

### Layout Structure

**Grid**: `gridTemplateColumns: "1fr 340px"` (main canvas, right sidebar)

#### Left (1fr)
- **Top**: Circular table visualization
  - SVG with elliptical seat positions (computed from stakeholder count)
  - Radial gradient background (dark brown tones)
  - Concentric ellipses (grid lines)
  - Coalition lines: dashed, primary color, opacity 0.7
  - Center display: Current turn quote + speaker name
  - Avatars at seat positions (scale up when speaking, 300ms transition)
  - Name + role labels below each avatar

- **Bottom**: Event stream (same as Roster)
  - Monospace, max height: 160px

#### Right Sidebar (340px)
- **Stacked panels**:
  1. `LeaderboardPanel` - Ranked list with score + delta
  2. `HeatmapPanel` - Three incentive bars
  3. `LeveragePanel` - Recent 3 leverage shifts

### Data Usage

| Data | Component | Usage |
|------|-----------|-------|
| `turns` | Center display | Current turn quote + action |
| `activeId` | Avatar scaling | Highlight speaking stakeholder |
| `stakeholders` | Seat positions | Compute elliptical layout |
| `heatmap` | HeatmapPanel | Three incentive values |
| `coalitions` | SVG lines | Draw coalition connections |
| `leverageShifts` | LeveragePanel | Recent shifts |
| `leaderboard` | LeaderboardPanel | Ranked scores + deltas |
| `eventLog` | Event stream | Monospace log |

### Key Computation

```typescript
function buildSeatPositions(stakeholders: Stakeholder[]): SeatPosition[] {
  const cx = 50, cy = 50;
  const rx = 38, ry = 30;  // Ellipse radii
  const n = stakeholders.length;
  return stakeholders.map((s, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + Math.PI / n;
    return {
      id: s.id,
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    };
  });
}
```

---

## 4. GraphLayout Component

**File**: `frontend/components/layouts/GraphLayout.tsx`

### Props Interface

```typescript
interface GraphLayoutProps {
  turns: Turn[];
  activeId: string | null;
  stakeholders: Stakeholder[];
  coalitions: CoalitionSignal[];
  leaderboard: LeaderboardEntry[];
  eventLog: string[];
}
```

### Layout Structure

**Grid**: `gridTemplateColumns: "1fr 360px"` (main canvas, right sidebar)

#### Left (1fr)
- **Top**: Network graph visualization
  - SVG with dot grid background pattern
  - Fixed node positions (hardcoded for 5 stakeholders: marin, devon, yuki, aaron, priya)
  - Edges: Weighted by turn-to-turn transitions (darker/thicker = more exchanges)
  - Coalition edges: Primary color, thicker, higher opacity
  - Active speaker: Pulsing circle around node
  - Avatars at fixed positions (scale up when speaking)
  - Name + role labels in pill-shaped badges
  - Legend: exchange (ink line), coalition (primary line), speaking now (primary dot)
  - Statement bubble: Positioned left/right of speaker, shows quote + action

- **Bottom**: Event stream (same as Roster/Table)
  - Max height: 140px

#### Right Sidebar (360px)
- **Stacked panels**:
  1. `CurrentSpeakerPanel` - Full speaker card with avatar, name, action, full quote, internal reasoning
  2. `LeaderboardPanel` - Top 3 with score bars
  3. `CoalitionPanel` - List of coalitions

### Data Usage

| Data | Component | Usage |
|------|-----------|-------|
| `turns` | Edge computation, CurrentSpeaker | Compute edge weights, display current turn |
| `activeId` | Avatar scaling, pulsing circle | Highlight speaking stakeholder |
| `stakeholders` | Node positions | Fixed layout |
| `coalitions` | Edge coloring, CoalitionPanel | Highlight coalition edges, list coalitions |
| `leaderboard` | LeaderboardPanel | Top 3 scores with bars |
| `eventLog` | Event stream | Monospace log |

### Key Computation

```typescript
function computeEdges(turns: Turn[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (let i = 1; i < turns.length; i++) {
    const a = turns[i - 1].stakeholder_id;
    const b = turns[i].stakeholder_id;
    if (a === b) continue;  // Skip self-loops
    const key = [a, b].sort().join("-");
    m[key] = (m[key] ?? 0) + 1;
  }
  return m;
}
```

---

## 5. Data Flow in V1 War Room Page

**File**: `frontend/app/simulate/[id]/page.tsx`

### State Management

```typescript
type SimState = {
  turns: Turn[];
  heatmap: HeatmapState | null;
  sentiment: number[];
  eventLog: string[];
  coalitions: CoalitionSignal[];
  leverageShifts: LeverageShift[];
  leaderboard: NonNullable<SimulationState["leaderboard"]>;
  activeId: string | null;
  deadlockScore: number;
};
```

### Reducer Actions

| Action | Payload | Effect |
|--------|---------|--------|
| `TURN_APPENDED` | `turn`, `summary` | Append turn, update all derived state from summary |
| `SIMULATION_LOADED` | `state` | Bulk load from SimulationState |
| `RESET` | — | Clear all turns, reset to initial state |
| `STEP_BACK` | — | Remove last turn |
| `STEP_TO` | `index`, `allTurns`, `state` | Jump to specific turn index |

### Playback Logic

- **Base interval**: 3800ms per turn
- **Speed adjustment**: `interval = baseInterval / speedMul`
- **Playback loop**: Increments turn index every interval until `turns.length >= simulation.turns.length`
- **Status transitions**: idle → running → complete

### Layout Conditional Rendering

```typescript
{layout === "roster" && <RosterLayout {...props} />}
{layout === "table" && <TableLayout {...props} />}
{layout === "graph" && <GraphLayout {...props} />}
```

All three layouts receive same core props:
- `turns`, `activeId`, `stakeholders`, `coalitions`, `eventLog`

Layout-specific props:
- **Roster**: `heatmap`, `sentiment`, `leverageShifts`, `leaderboard`
- **Table**: `heatmap`, `leverageShifts`, `leaderboard`
- **Graph**: `leaderboard`

---

## 6. Critical Integration Points for V2

### Must Preserve
1. **ControlBar props contract** — exact same interface, no changes
2. **Layout switching logic** — conditional rendering by `layout` state
3. **Playback interval calculation** — `baseInterval / speedMul`
4. **Reducer pattern** — TURN_APPENDED, SIMULATION_LOADED, STEP_TO actions
5. **Data shape** — Turn, HeatmapState, CoalitionSignal, LeverageShift, LeaderboardEntry types

### Can Enhance
1. **Real-time streaming** — v2 can append turns as they arrive (already supports TURN_APPENDED)
2. **Layout-specific data** — Each layout only needs its subset of props
3. **Sentiment calculation** — Roster uses sentiment array; Graph/Table don't
4. **Leaderboard rendering** — Each layout has own LeaderboardPanel variant

### Migration Path
1. Copy ControlBar, RosterLayout, TableLayout, GraphLayout as-is
2. Update page component to wire v2 streaming data into reducer
3. Adjust layout props based on v2 data availability
4. Test playback, layout switching, speed control

---

## 7. Data Type Dependencies

### Core Types (from `@/lib/types`)

```typescript
Turn {
  turn_index: number;
  stakeholder_id: string;
  stakeholder_name: string;
  role: string;
  content: string;
  internal_reasoning: string;
  action_type: string;
  is_human?: boolean;
}

HeatmapState {
  commercial_gain: number;
  tech_integrity: number;
  legal_safety: number;
  recommendation?: string;
}

CoalitionSignal {
  agent_a: string;
  agent_b: string;
  issue: string;
}

LeverageShift {
  from_agent: string;
  to_agent: string;
  reason: string;
}

LeaderboardEntry {
  agent_id: string;
  name: string;
  rank: number;
  score: number;
  delta: number;
  delta_reason: string;
}

Stakeholder {
  id: string;
  name: string;
  role: string;
}
```

---

## 8. Summary: Minimal Changes Required for V2

| Component | Change | Effort |
|-----------|--------|--------|
| ControlBar | None — copy as-is | 0 |
| RosterLayout | None — copy as-is | 0 |
| TableLayout | None — copy as-is | 0 |
| GraphLayout | None — copy as-is | 0 |
| Page component | Wire v2 streaming → reducer | Low |
| Types | Ensure Turn, Heatmap, Coalition, Leverage, Leaderboard match | Low |

**Conclusion**: All layout components are **reusable without modification**. Only the page-level integration needs adjustment to feed v2 streaming data into the existing reducer pattern.
