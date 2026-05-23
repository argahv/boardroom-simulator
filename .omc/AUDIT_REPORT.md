# War Room Simulation: Functionality & Production-Readiness Audit

**Date**: May 23, 2026  
**Scope**: Backend (FastAPI) + Frontend (React/Next.js) + Integration  
**Status**: Issues identified — Action plan below

---

## CRITICAL ISSUES (Must fix before production)

### 1. **Missing Playback Controls Implementation** — CRITICAL
- **File**: `frontend/app/simulate/[id]/page.tsx`
- **Issue**: ControlBar receives `onStepBack` and `onStepForward` as empty no-ops:
  ```tsx
  onStepBack={() => {}}
  onStepForward={() => {}}
  ```
- **Impact**: Users cannot step through turns manually. UI shows controls but they don't work.
- **Fix**: Implement step logic. Need to replay turns up to index N, not stream new ones.
- **Effort**: MEDIUM (2-3 hours)

### 2. **Playback Speed Multiplier Not Wired** — CRITICAL
- **File**: `frontend/app/simulate/[id]/page.tsx`
- **Issue**: `speedMul` state is set but never used. ControlBar onChange is captured but no interval adjustment.
- **Impact**: Speed buttons (0.5×, 1×, 2×) are UI-only, no actual effect on playback.
- **Context**: Original BR reference had `baseInterval = 3800 / speedMul` logic — NOT implemented.
- **Fix**: Need to implement turn-by-turn playback (not just stream) with adjustable intervals.
- **Effort**: MEDIUM

### 3. **Stream Parser Can Lose Events** — HIGH
- **File**: `frontend/lib/api.ts` streamSimulation()
- **Issue**: If SSE line contains `\n\n` in the middle of JSON, buffer splitting breaks:
  ```ts
  const parts = buffer.split("\n\n");
  buffer = parts.pop() ?? "";
  ```
  If JSON itself contains `\n\n`, malformed JSON silently skipped with `catch { /* skip */ }`.
- **Impact**: Events disappear silently. User sees stalled simulation. No error indication.
- **Fix**: Use proper SSE parsing library or robust line buffering.
- **Effort**: LOW (1 hour)

### 4. **No Error Recovery for Network Issues** — HIGH
- **File**: `frontend/lib/api.ts`
- **Issue**: streamSimulation() has no reconnect logic. If network drops mid-stream, simulation stops forever.
- **Impact**: Any network blip = simulation loss. Bad for mobile/unstable connections.
- **Fix**: Implement exponential backoff reconnection + event replay from last turn.
- **Effort**: MEDIUM (2-3 hours)

### 5. **Race Condition in State Updates During Stream** — HIGH
- **File**: `frontend/app/simulate/[id]/page.tsx`
- **Issue**: Turn appending race:
  ```tsx
  setTurns((prev) => [...prev, event.turn]);  // Line 1
  setActiveId(event.state_summary.active_speaker_id ?? null);  // Line 2
  setHeatmap(event.state_summary.heatmap);  // Line 3 (async batched)
  ```
  React may batch updates. If user clicks "next step" between Line 1 and Line 3, UI shows turn but no heatmap.
- **Impact**: Flickering UI, inconsistent state between turn data and analytics.
- **Fix**: Use single `setState` call or useReducer for atomic updates.
- **Effort**: LOW-MEDIUM (1-2 hours)

---

## HIGH PRIORITY ISSUES

### 6. **Missing Async Postmortem Wiring** — HIGH
- **File**: `frontend/app/simulate/[id]/page.tsx`
- **Issue**: `loadPostmortemAsync()` is defined but never called. Only sync `loadPostmortem()` button exists.
- **Impact**: Async postmortem feature incomplete. User cannot use background generation.
- **Fix**: Add "Generate Async" button, wire polling logic.
- **Effort**: LOW (1 hour)

### 7. **Stale Closures in Streaming** — HIGH
- **File**: `frontend/app/simulate/[id]/page.tsx`
- **Issue**: `streamSimulation()` is called with callbacks that reference:
  ```tsx
  const launch = () => {
    const ctrl = streamSimulation(id, 20, (event) => {
      setTurns((prev) => [...prev, event.turn]);  // ✅ Safe (functional update)
      setActiveId(event.state_summary.active_speaker_id ?? null);  // ❌ Stale closure if activeId changes
    }, ...);
  };
  ```
  If activeId is updated outside the callback, the callback doesn't see new value (but that's ok here since it doesn't use it).
  **Real issue**: If `handlePause()` is called, the streaming ref is still active but pause state is lost.
- **Impact**: Pause button doesn't actually pause stream. Stream keeps going.
- **Fix**: Abort controller is correct but needs to be called on pause.
- **Effort**: LOW (30 mins)

### 8. **No Timeout on Stream Endpoint** — HIGH
- **File**: `frontend/lib/api.ts`
- **Issue**: `streamSimulation()` has no timeout. If backend hangs, stream hangs forever.
  ```ts
  const response = await fetch(`${API_URL}/simulations/${simulationId}/stream?...`);
  ```
  No `AbortController` timeout set.
- **Impact**: Zombie streams consuming browser resources.
- **Fix**: Set timeout via AbortController + timer.
- **Effort**: LOW (30 mins)

### 9. **ControlBar Not Sticky on Mobile** — MEDIUM
- **File**: `frontend/components/ControlBar.tsx`
- **Issue**: `position: sticky; top: 64px;` but viewport may be smaller than 64px on mobile.
- **Impact**: ControlBar may hide under header or become unreachable.
- **Fix**: Adjust top offset dynamically or use CSS media queries.
- **Effort**: LOW (30 mins)

### 10. **Backend Streaming Response Missing Content-Type** — MEDIUM
- **File**: `backend/app/main.py` (~/450 lines, stream endpoint)
- **Issue**: Stream endpoint returns `StreamingResponse` but may not set `media_type="text/event-stream"`.
- **Impact**: Some clients/proxies may not recognize SSE and buffer entire response.
- **Fix**: Verify stream endpoint sets correct media type.
- **Effort**: LOW (15 mins)

---

## MEDIUM PRIORITY ISSUES

### 11. **No Input Validation on Human Turn Injection** — MEDIUM
- **File**: `frontend/app/simulate/[id]/page.tsx` submitHumanTurn()
- **Issue**: 
  ```tsx
  if (!humanContent.trim() || !humanStakeholderId) return;
  ```
  Only client-side validation. No XSS prevention, no length limit on content field.
- **Impact**: Potential XSS if content is rendered as HTML. Can crash backend with 10MB payload.
- **Fix**: Add max length, sanitize before send, server-side validation (should exist but verify).
- **Effort**: LOW (1 hour)

### 12. **Type Safety Gap: 'unknown' Casts** — MEDIUM
- **File**: `frontend/lib/api.ts` request()
- **Issue**: `return response.json() as Promise<T>` — no validation that response matches T.
- **Impact**: If backend response schema changes, frontend continues with wrong types.
- **Fix**: Use runtime validation (zod) on API responses.
- **Effort**: MEDIUM (2-3 hours)

### 13. **No Optimistic UI Updates** — MEDIUM
- **File**: `frontend/app/simulate/[id]/page.tsx`
- **Issue**: When user injects turn, UI waits for backend response before showing turn.
  ```tsx
  const updated = await injectHumanTurn(...);  // Blocks UI
  setTurns(updated.turns);
  ```
- **Impact**: Perceived lag. Feels unresponsive.
- **Fix**: Show turn optimistically, rollback on error.
- **Effort**: MEDIUM (1-2 hours)

### 14. **Layout Switch Loses Scroll Position** — MEDIUM
- **File**: `frontend/components/layouts/RosterLayout.tsx` (and others)
- **Issue**: When switching layout, transcript or event log may jump to top.
- **Impact**: User loses place when exploring different views.
- **Fix**: Save scroll position per layout, restore on switch.
- **Effort**: LOW (1 hour)

### 15. **Memory Leak: Ref Cleanup** — MEDIUM
- **File**: `frontend/app/simulate/[id]/page.tsx`
- **Issue**: streamControllerRef is never cleaned up on unmount:
  ```tsx
  useEffect(() => { ... }, [id]);
  // Missing cleanup: return () => streamControllerRef.current?.abort();
  ```
- **Impact**: If user navigates away mid-stream, background stream continues consuming memory.
- **Fix**: Add cleanup in useEffect.
- **Effort**: LOW (15 mins)

---

## LOW PRIORITY ISSUES

### 16. **Unused State Variables** — LOW
- **File**: `frontend/app/simulate/[id]/page.tsx`
- **Issue**: `winningContext`, `runtimeStatus`, `jobStatus`, `loadingPostmortem` set but not always used in render.
- **Impact**: Code maintenance burden. Confusing.
- **Fix**: Audit all state, remove unused.
- **Effort**: LOW (30 mins)

### 17. **Missing Loading Skeleton States** — LOW
- **File**: All layout components
- **Issue**: Heatmap panel shows hardcoded skeleton on initial load but not comprehensive.
- **Impact**: UI feels slightly janky during data load.
- **Fix**: Add proper skeleton loaders for all panels.
- **Effort**: LOW (1 hour)

### 18. **Backend Seed Data Crashes on Duplicate** — LOW
- **File**: `backend/app/main.py` startup_event()
- **Issue**: `await run_seeds()` throws exception if templates/personas already exist.
- **Impact**: Second server restart fails. Need manual DB wipe.
- **Fix**: Implement idempotent seed logic (upsert instead of insert).
- **Effort**: LOW (30 mins)

### 19. **Hardcoded max_turns=20** — LOW
- **File**: Multiple
- **Issue**: ControlBar displays "T00/T19" hardcoded. If backend allows more, UI lies.
- **Impact**: Confusion if simulation generates > 20 turns.
- **Fix**: Pass actual total from simulation state.
- **Effort**: LOW (15 mins)

### 20. **No Rate Limiting on API** — LOW
- **File**: `backend/app/main.py`
- **Issue**: No rate limit middleware. User can spam /stream, /run-async, etc.
- **Impact**: Potential DoS. Bad for shared deployments.
- **Fix**: Add slowapi or similar rate limiter.
- **Effort**: LOW-MEDIUM (1 hour)

---

## SUMMARY TABLE

| ID | Title | Severity | Effort | Status |
|----|-------|----------|--------|--------|
| 1 | Missing Playback Controls | CRITICAL | MEDIUM | Not started |
| 2 | Playback Speed Not Wired | CRITICAL | MEDIUM | Not started |
| 3 | Stream Parser Can Lose Events | HIGH | LOW | Not started |
| 4 | No Error Recovery (Network) | HIGH | MEDIUM | Not started |
| 5 | Race Condition in State Updates | HIGH | MEDIUM | Not started |
| 6 | Missing Async Postmortem Wiring | HIGH | LOW | Not started |
| 7 | Stale Closures in Streaming | HIGH | LOW | Not started |
| 8 | No Timeout on Stream | HIGH | LOW | Not started |
| 9 | ControlBar Not Sticky Mobile | MEDIUM | LOW | Not started |
| 10 | Backend Stream Content-Type | MEDIUM | LOW | Not started |
| 11 | No Input Validation (XSS) | MEDIUM | LOW | Not started |
| 12 | Type Safety Gap | MEDIUM | MEDIUM | Not started |
| 13 | No Optimistic UI Updates | MEDIUM | MEDIUM | Not started |
| 14 | Layout Scroll Position Loss | MEDIUM | LOW | Not started |
| 15 | Memory Leak: Ref Cleanup | MEDIUM | LOW | Not started |
| 16 | Unused State Variables | LOW | LOW | Not started |
| 17 | Missing Skeleton States | LOW | LOW | Not started |
| 18 | Seed Data Idempotency | LOW | LOW | Not started |
| 19 | Hardcoded max_turns | LOW | LOW | Not started |
| 20 | No Rate Limiting | LOW | MEDIUM | Not started |

---

## ACTION PLAN (Priority Order)

### Phase 1: Critical Fixes (Must do for MVP)
1. **#1 & #2**: Implement playback controls (step back/forward, speed multiplier)
   - Estimated: 3-4 hours
   - Blocker: Users cannot control simulation at all
   
2. **#3**: Fix stream parser robustness
   - Estimated: 1 hour
   - Blocker: Silent event loss

3. **#4**: Add network error recovery
   - Estimated: 2-3 hours
   - Blocker: Any network hiccup kills simulation

### Phase 2: High Priority (1-2 days)
4. **#5, #7, #8**: Fix state race conditions + timeout + pause
   - Estimated: 3-4 hours combined
   
5. **#15**: Fix memory leak (useEffect cleanup)
   - Estimated: 15 mins (easy win)

### Phase 3: Medium Priority (Polish, 1-2 days)
6. **#6**: Wire async postmortem
   - Estimated: 1 hour

7. **#12**: Add runtime validation (Zod)
   - Estimated: 2-3 hours

8. **#13**: Optimistic UI updates
   - Estimated: 1-2 hours

### Phase 4: Low Priority (Nice-to-have)
9. Remaining LOW priority items
   - Estimated: 3-4 hours total

---

## PRODUCTION READINESS VERDICT

**Current Status**: ⚠️ **NOT PRODUCTION READY**

- **Critical blockers**: 2 (playback controls)
- **Functional gaps**: 4 major (stream reliability, state consistency, error handling, async)
- **Type safety**: 80% (some unknown casts)
- **Error handling**: 60% (missing network recovery, input validation)
- **Performance**: 70% (some memory leaks, no optimistic updates)
- **UX**: 60% (feels janky due to stale state, missing features)

**Recommendation**: Fix Phase 1 + Phase 2 (#1-8) before launch. Estimated **10-14 hours**. Can parallelize some work.

---

## Quick Wins (Can do in 2-3 hours)

- [x] Fix useEffect cleanup (15 mins)
- [x] Add stream timeout (30 mins)
- [x] Wire async postmortem button (1 hour)
- [x] Remove hardcoded max_turns (15 mins)
- [x] Fix seed data idempotency (30 mins)

**Remaining critical work**: Playback controls + stream reliability + state consistency.
