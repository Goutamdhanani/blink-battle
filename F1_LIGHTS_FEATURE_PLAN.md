# F1-Style 5-Light System Implementation Plan

## Overview
Transform the current "countdown → green light ON" system to F1-style "5 lights turn ON sequentially → random delay → ALL lights OFF" system.

## Current System (to be replaced)
1. Both players ready
2. 3-second countdown (3, 2, 1)
3. Random delay (2-5 seconds)
4. Green light turns ON → players react
5. Measure reaction time

## New F1-Style System
1. Both players ready
2. **5 lights turn ON one-by-one** (~0.5s between each, with randomness)
3. **Random delay (1-3 seconds)** after all 5 lights are ON
4. **ALL lights turn OFF** → this is the trigger moment
5. User reacts → click/tap
6. Measure reaction time from lights-OUT moment
7. False starts show: "Jump start. Relax, Verstappen."

## Backend Changes Required

### 1. Database Schema (if needed)
- Consider adding `lights_sequence` JSON column to store timing of each light
- Add `lights_out_time` column (replaces `green_light_time` semantically)
- Or: repurpose `green_light_time` to mean `lights_out_time`

### 2. Match State Machine
Current states: `pending` → `waiting` → `ready` → `matched` → `countdown` → `go` → `completed`

New states needed:
- `lights_1` through `lights_5` (or use single `lights_on` state with counter)
- `lights_all_on` (waiting for random delay)
- `lights_out` (equivalent to current `go`)

### 3. pollingMatchController.ts Changes

#### ready() endpoint
- Generate light sequence timing:
  ```typescript
  const lightIntervals = generateLightIntervals(); // [~500ms, ~500ms, ~500ms, ~500ms, ~500ms] with randomness
  const totalLightsTime = lightIntervals.reduce((a, b) => a + b, 0);
  const randomDelay = generateRandomDelay(1000, 3000); // 1-3 seconds
  const lightsOutTime = now + totalLightsTime + randomDelay;
  ```
- Store light sequence and lights_out_time in database

#### getState() endpoint
- Return current light state (how many lights are on)
- Return `lightsOutTime` instead of `greenLightTime`
- Client calculates which lights to show based on time

#### tap() endpoint
- Replace references to `greenLightTime` with `lightsOutTime`
- Update logging: "early tap" → "Jump start"
- Keep all other logic (tolerance, clamping, etc.)

### 4. Constants to Update
```typescript
const LIGHT_INTERVAL_BASE_MS = 500; // Base time between each light
const LIGHT_INTERVAL_VARIANCE_MS = 100; // ±100ms randomness per light
const NUM_LIGHTS = 5;
const MIN_RANDOM_DELAY_MS = 1000; // 1 second
const MAX_RANDOM_DELAY_MS = 3000; // 3 seconds
```

## Frontend Changes Required

### 1. ReactionTestUI Component
- Replace countdown display with 5-light visual
- Show lights turning on sequentially
- Show all lights turning OFF simultaneously
- Update messages:
  - Early tap: "Jump start. Relax, Verstappen."
  - Keep reaction time display in milliseconds

### 2. GameArena.tsx
- Update phase detection for new states
- Handle `lights_on` and `lights_out` phases
- Adjust haptic feedback for each light

### 3. usePollingGame.ts
- Update state machine to handle new phases
- Parse new backend response fields
- Calculate which lights should be on based on time

### 4. CSS/Styling
- Design 5-light visual (horizontal row of circles/rectangles)
- Red lights when ON
- Dark/off state
- Smooth transitions

## Implementation Steps

### Phase 1: Backend Core Logic ✓ (Bug Fixes - DONE)
1. ✓ Fix tap handling bugs
2. ✓ Clamp reaction times
3. ✓ Update tests

### Phase 2: Backend F1 Mechanics (NEXT)
1. Add light sequence generation function
2. Update ready() endpoint to generate 5-light timing
3. Update getState() to return light states
4. Update tap() to use lightsOutTime
5. Update logging messages
6. Add tests for light sequence generation

### Phase 3: Frontend F1 UI (AFTER BACKEND)
1. Create F1Lights component (5 lights visual)
2. Update ReactionTestUI to use F1Lights
3. Update GameArena event handlers
4. Update usePollingGame state machine
5. Add CSS animations for lights

### Phase 4: Testing & Polish
1. Test full flow end-to-end
2. Verify timing accuracy
3. Test edge cases (early taps, late taps)
4. Verify "Jump start" messages
5. Performance testing with multiple games

## Migration Strategy
- Use feature flag or environment variable to toggle between old and new system
- Default to new system for new matches
- Consider database migration script if schema changes

## Risks & Considerations
1. **Breaking change**: Existing in-progress matches may need to be cancelled
2. **Timing precision**: 5 individual light events = more network calls or more complex state machine
3. **Client-side rendering**: Client must accurately render lights based on timing data
4. **Testing complexity**: More states = more test cases

## Decision: Client-Side Timing
To minimize server complexity and network calls:
- Server calculates and sends: `lightsOutTime` and `lightSequence` array
- Client renders lights locally based on timestamps
- This is similar to current countdown system (client-side rendering)

## Message Copy
- Early tap: "Jump start. Relax, Verstappen." 🏎️
- Valid tap: "Reaction time: {X}ms"
- Too slow: "Too slow! Reaction time: {X}ms"
