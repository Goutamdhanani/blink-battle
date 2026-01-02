# Match Flow: Before and After Fix

## BEFORE (Broken)

### Match State API (`/api/match/state`)
```
Request → Controller
          ↓
          Check green_light_time
          ↓
          new Date(green_light_time)  ❌ CRASH if null/undefined
          ↓
          RangeError: Invalid time value
```

### Winner Determination Flow
```
Both players tap
    ↓
determineWinner()
    ↓
    Check disqualifications/validity
    ↓
    distributeWinnings(winner_wallet)  ❌ winner_wallet = undefined!
    ↓
    Contract call fails: "unsupported addressable value"
    ↓
    completeMatch(winnerId)  ← Never reached!
    ↓
    ❌ Match stuck, black screen
```

### Polling Behavior
```
Match resolved
    ↓
    Poll every 1s... (continues forever) ❌
    ↓
    Poll every 1s...
    ↓
    Poll every 1s...
    (Server load increases)
```

---

## AFTER (Fixed)

### Match State API (`/api/match/state`)
```
Request → Controller
          ↓
          greenLightTimeMs = green_light_time ?? null  ✅
          ↓
          if (typeof === 'number' && !isNaN())
          |    ↓
          |    greenLightTimeISO = new Date().toISOString()
          |
          else ↓
               greenLightTimeISO = null
          ↓
          Return { greenLightTime: ms, greenLightTimeISO: iso }  ✅
```

### Winner Determination Flow (3-Step)
```
Both players tap
    ↓
determineWinner()
    ↓
    STEP 1: Compute Winner (No external calls)
    ├─ Check disqualifications
    ├─ Check validity
    ├─ Compare reaction times
    └─ Determine: winnerId, winnerWallet, paymentAction
           ↓
    STEP 2: Execute Payment (With Guards)  ✅
    ├─ if (paymentAction === 'distribute')
    │  └─ if (winnerWallet && winnerId)  ← Guards!
    │     └─ distributeWinnings(winnerWallet)
    ├─ if (paymentAction === 'refund')
    │  └─ if (wallet1 && wallet2)
    │     └─ refundWithFee()
    └─ if (paymentAction === 'split')
       └─ if (wallet1 && wallet2)
          └─ splitPot()
           ↓
    try { payment } catch { log error }  ✅
           ↓
    STEP 3: Complete Match (Always runs)  ✅
    └─ completeMatch(winnerId, reactions)
       ↓
       updateUserStats()
       ↓
       ✅ Match completed, result shown to players
```

### Polling Behavior
```
Match resolved
    ↓
    State = 'resolved'
    ↓
    if (state === 'resolved') {
        clearInterval(pollInterval);  ✅
        setIsPolling(false);
        return;  ← Early exit
    }
    ↓
    ✅ Polling stops immediately
```

---

## Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| **Null handling** | ❌ Crashes on null | ✅ Safely returns null |
| **Winner compute** | ❌ After payment call | ✅ Before payment call |
| **Payment guards** | ❌ No validation | ✅ Wallet & ID checks |
| **Payment failure** | ❌ Match stuck | ✅ Match completes anyway |
| **Polling** | ❌ Continues forever | ✅ Stops immediately |
| **User experience** | ❌ Black screen | ✅ Result shown |

---

## Environment Variables Used

```bash
SIGNAL_DELAY_MIN_MS=2000    # Min random delay before green light
SIGNAL_DELAY_MAX_MS=5000    # Max random delay before green light
```

These delays ensure fair gameplay with unpredictable GO signal timing.

---

## Match Timeline (Fixed Flow)

```
1. Players matched
   ↓
2. Both click ready
   ↓
3. Server schedules green_light_time = now + 3000ms + random(2-5s)  ✅
   Status: COUNTDOWN
   ↓
4. Players see countdown (3...2...1...)
   ↓
5. Random delay (2-5s)
   ↓
6. Green light! (go signal)
   Status: IN_PROGRESS
   greenLightTime: numeric ms  ✅
   greenLightTimeISO: ISO string  ✅
   ↓
7. Both players tap
   ↓
8. Server determines winner (STEP 1)  ✅
   ↓
9. Server calls payment (STEP 2)  ✅
   - Validates addresses
   - Try-catch wrapper
   ↓
10. Server completes match (STEP 3)  ✅
    - Always runs
    - Updates DB
    ↓
11. Clients poll and see 'resolved' state  ✅
    - Stop polling immediately
    - Show result screen
```

---

## Error Scenarios Handled

### Scenario 1: green_light_time is null
- **Before**: Crash with RangeError
- **After**: Return `{ greenLightTime: null, greenLightTimeISO: null }`

### Scenario 2: Payment fails (network error)
- **Before**: Match stuck, black screen
- **After**: Log error, complete match anyway, show result

### Scenario 3: Winner wallet undefined
- **Before**: Contract call with undefined → crash
- **After**: Validation guard prevents call, logs error

### Scenario 4: Both players disqualified
- **Before**: Calls distributeWinnings with undefined winner
- **After**: Determines paymentAction = 'refund', no winner computed

### Scenario 5: Match resolved, polling continues
- **Before**: 1 req/sec forever (server load)
- **After**: Polling stops immediately (early return)

---

## Testing Coverage

✅ Null/undefined green_light_time handling
✅ NaN handling
✅ Valid timestamp → ISO conversion
✅ Winner computed before payment
✅ Payment failure resilience
✅ Wallet validation guards
✅ Tie scenario handling
✅ Disqualification scenarios
✅ Timeout scenarios
✅ Early return on resolved state

All 10 unit tests passing!
