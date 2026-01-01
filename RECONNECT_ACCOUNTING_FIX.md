# Reconnect Accounting Fix - Implementation Summary

## Overview

This document describes the implementation of improved reconnect accounting to prevent premature match cancellations due to rapid client remounting and short-lived connections (< 5 seconds).

## Problem Statement

After the single-socket refactor, matches were still being cancelled due to `max_reconnects_exceeded` when clients churned connections rapidly (< 5s). Even though early disconnects were logged as ignored, reconnect attempts were still incremented and eventually hit the cap, cancelling matches in `funding` state before start.

## Solution

### 1. Two-Tier Reconnect Tracking

Introduced a distinction between "soft" and "hard" reconnect attempts:

- **Soft Reconnects** (`reconnectAttempts`): Counts ALL reconnection attempts, including rapid remounts
- **Hard Reconnects** (`hardReconnectAttempts`): Counts ONLY reconnections from stable connections (≥5s duration)

Only hard reconnects count toward the `MAX_HARD_RECONNECT_ATTEMPTS` limit (5).

### 2. Enhanced Disconnect Classification

In `handleDisconnect()`:
- Measures connection duration from `socketConnectionTimes` map
- If duration < `MIN_STABLE_CONNECTION_MS` (5000ms):
  - Logs as "EARLY DISCONNECT" 
  - Does NOT increment hard reconnect counter
  - Cleans up socket mapping but preserves user-to-match mapping for quick reconnection
- If duration ≥ 5000ms:
  - Logs as "HARD DISCONNECT"
  - Increments `hardReconnectAttempts` counter
  - Applies full disconnection penalties

### 3. Funding State Protection Guard

Added `shouldCancelForMaxReconnects()` method with special logic for `FUNDING` state:

**Cancellation is prevented if ALL of these conditions are true:**
1. Match is in `FUNDING` state
2. No player has sent `player_ready` signal
3. No game signal has been sent (`signalTimestamp` is null)
4. Match age < `MIN_FUNDING_DURATION_MS` (20000ms)

This protects against premature cancellation during initial funding phase when clients might be remounting frequently.

### 4. Comprehensive Diagnostic Logging

Added extensive structured logging throughout the reconnect lifecycle:

**Connection Events:**
- Socket connection with timestamp
- Socket replacement with duration of previous socket

**Disconnect Events:**
- Connection duration measurement
- Early vs. hard disconnect classification
- Current hard/soft attempt counters for all players
- Match state context (age, readiness, signals)

**Reconnect Events:**
- Full match state dump at start
- Soft and hard attempt counters
- Guard check results with detailed reasoning
- Success/failure logging with timing

**Cancellation Events:**
- Complete match context
- All reconnect attempt counters
- Guard evaluation details
- State transition results

All logs use structured formats with clear section markers for easy parsing and debugging.

## Configuration Constants

```typescript
private readonly MIN_STABLE_CONNECTION_MS = 5000;        // Threshold for "hard" disconnect
private readonly MAX_HARD_RECONNECT_ATTEMPTS = 5;        // Limit for hard reconnects
private readonly MIN_FUNDING_DURATION_MS = 20000;        // Min match age before applying limit in funding
private readonly RECONNECT_GRACE_PERIOD_MS = 30000;      // Time to reconnect before timeout
```

## Code Changes

### Modified Interfaces

```typescript
interface ActiveMatch {
  // ... existing fields
  reconnectAttempts?: Map<string, number>;           // Soft (all) reconnects
  hardReconnectAttempts?: Map<string, number>;       // Hard (stable) reconnects
  matchCreatedAt?: number;                           // Track match age
}
```

### Key Methods Modified

1. **`handleDisconnect()`**
   - Added connection duration tracking
   - Implemented early disconnect guard
   - Added hard reconnect counter increment for stable connections

2. **`reconnectPlayerToMatch()`**
   - Updated to use `shouldCancelForMaxReconnects()` guard
   - Enhanced logging for attempt counters
   - Uses hard attempts for cancellation decision

3. **`shouldCancelForMaxReconnects()`** (NEW)
   - Checks hard attempts vs. limit
   - Applies funding state protection guard
   - Returns boolean decision with comprehensive logging

4. **`createMatch()`**
   - Initializes `matchCreatedAt` timestamp
   - Initializes both `reconnectAttempts` and `hardReconnectAttempts` maps

5. **`handleJoinMatchmaking()`**
   - Enhanced socket replacement logging with duration tracking

## Testing Scenarios

### Scenario 1: Rapid Remounting (< 5s connections)
**Expected:** Multiple sub-5s disconnects/reconnects do NOT increment hard counter, match continues

**Log Pattern:**
```
[EARLY DISCONNECT GUARD TRIGGERED]
  Connection Duration: 2000ms
  Decision: IGNORING - Not counting as hard disconnect
  Current Hard Attempts: 0 (UNCHANGED)
```

### Scenario 2: Genuine Connection Issues (≥ 5s connections)
**Expected:** Stable connections that disconnect DO increment hard counter, match cancelled after 5 hard attempts

**Log Pattern:**
```
[HARD DISCONNECT RECORDED]
  Connection Duration: 8000ms (>= 5000ms threshold)
  Previous Hard Attempts: 2
  New Hard Attempts: 3/5
  This WILL count toward max reconnect limit
```

### Scenario 3: Funding State Rapid Remounting
**Expected:** In funding state with no ready signals and < 20s age, even 6+ hard reconnects don't cancel

**Log Pattern:**
```
[RECONNECT CANCELLATION GUARD CHECK]
  Hard Attempts: 6/5
  ⚠️  Hard attempts EXCEEDED limit
  FUNDING STATE GUARD:
    Any Ready: false
    Signal Sent: false
    Match Age: 15000ms
    Min Duration: 20000ms
  Decision: ALLOW RECONNECT (Funding Guard)
```

### Scenario 4: Normal Match After Funding
**Expected:** After leaving funding (or after 20s in funding), normal 5-attempt limit applies

**Log Pattern:**
```
[RECONNECT CANCELLATION GUARD CHECK]
  Current State: READY
  Hard Attempts: 6/5
  Decision: CANCEL MATCH
  Reason: Hard attempts exceeded and no guards applied
```

## Observability Improvements

### Log Prefixes for Filtering

- `[Connection]` - Socket connections
- `[ConnectionTracking]` - Connection time registration
- `[SocketReplacement]` - Socket replacement events
- `[Disconnect]` - Disconnect events
- `[EARLY DISCONNECT GUARD TRIGGERED]` - Early disconnects ignored
- `[HARD DISCONNECT RECORDED]` - Stable disconnects counted
- `[Reconnect]` - Reconnection events
- `[Reconnect Guard]` - Guard evaluation results
- `[RECONNECT LIMIT EXCEEDED]` - Max attempts reached
- `[RECONNECT CANCELLATION GUARD CHECK]` - Detailed guard logic
- `[Cancel]` - Match cancellation events

### Structured Log Sections

Major events use boxed sections for easy visibility:
```
========== RECONNECT START: userId ==========
  [detailed context]
========================================================

---------- DISCONNECT EVENT: socketId ----------
  [detailed context]

!!!!! DISCONNECT TIMEOUT EXPIRED !!!!!
  [critical alert context]
```

## Deployment Notes

1. **No Database Schema Changes** - All changes are in-memory only
2. **Backward Compatible** - Existing matches continue without issues
3. **Immediate Effect** - Takes effect on server restart
4. **No Frontend Changes Required** - Client behavior unchanged

## Monitoring Recommendations

After deployment, monitor logs for:

1. Frequency of `[EARLY DISCONNECT GUARD TRIGGERED]` - Should be common during development, rare in production
2. `[HARD DISCONNECT RECORDED]` with high attempt counts - Indicates genuine connectivity issues
3. `[Reconnect Guard]` activations - Shows protection guard working
4. `[RECONNECT LIMIT EXCEEDED]` events - Should be rare after fix

## Environment Variables (Optional Tuning)

While not required, these could be made configurable:

```env
# Connection must last this long to count as "stable" (default: 5000ms)
MIN_STABLE_CONNECTION_MS=5000

# Max hard reconnects before cancellation (default: 5)
MAX_HARD_RECONNECT_ATTEMPTS=5

# Min match age in funding before applying limit (default: 20000ms)
MIN_FUNDING_DURATION_MS=20000
```

## Related Documentation

- [WEBSOCKET_SINGLE_CONNECTION.md](./WEBSOCKET_SINGLE_CONNECTION.md) - Single-socket refactor context
- [MATCH_LIFECYCLE_DIAGRAMS.md](./MATCH_LIFECYCLE_DIAGRAMS.md) - Match state machine diagrams
- [OPERATOR_RUNBOOK.md](./OPERATOR_RUNBOOK.md) - Operational procedures

## Changelog

### 2026-01-01 - Reconnect Accounting Fix

**Changed:**
- Reconnect accounting now distinguishes between soft (<5s) and hard (≥5s) disconnects
- Only hard disconnects count toward max reconnect cancellation limit
- Added funding state protection guard to prevent premature cancellation during initial phase
- Massively enhanced diagnostic logging throughout reconnect lifecycle

**Added:**
- `hardReconnectAttempts` counter per player in ActiveMatch
- `matchCreatedAt` timestamp in ActiveMatch
- `shouldCancelForMaxReconnects()` method with funding state guard
- Comprehensive structured logging for all reconnect events
- Connection duration tracking and classification

**Fixed:**
- Matches no longer cancelled due to rapid React remounts (<5s connections)
- Funding state matches protected from runaway reconnection loops
- Early disconnect guard now properly prevents reconnect counter increment

**Impact:**
- Significantly reduced false-positive match cancellations
- Better visibility into connection issues through enhanced logging
- Maintains protection against genuine connection instability
