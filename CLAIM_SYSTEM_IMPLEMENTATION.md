# Claim System Implementation Summary

## Overview
This document summarizes the implementation of claim system fixes and new features as specified in the requirements.

## Changes Implemented

### 1. Claim Deadline Reduced to 1 Hour ✅
**File:** `backend/src/controllers/pollingMatchController.ts`
- **Changed:** Claim deadline from 24 hours to 1 hour
- **Line:** 618
- **Before:** `const claimDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);`
- **After:** `const claimDeadline = new Date(Date.now() + 60 * 60 * 1000);`

### 2. Claim Expiration Background Job ✅
**File:** `backend/src/jobs/claimExpiry.ts` (NEW)
- **Purpose:** Automatically expire unclaimed matches after their claim deadline
- **Runs:** Every 5 minutes
- **Function:** `expireUnclaimedMatches()` - Updates matches with `claim_status = 'expired'` when `claim_deadline < NOW()`
- **Started in:** `backend/src/index.ts` (line ~323)

### 3. Stake Cap Removed ✅
**File:** `backend/src/controllers/pollingMatchmakingController.ts`
- **Removed:** Maximum stake validation (was 0.1 WLD cap)
- **Kept:** Minimum stake validation (0.01 WLD)
- **Lines:** 32-42
- **Impact:** Users can now stake any amount they have

### 4. Platform Fee from Environment Variable ✅
**File:** `backend/src/controllers/claimController.ts`
- **Changed:** Platform fee calculation to use `PLATFORM_FEE_PERCENT` from environment
- **Lines:** 141-145 and 267-272
- **Environment Variable:** `PLATFORM_FEE_PERCENT` (default: 3%)
- **Calculation:** `platformFeeBps = PLATFORM_FEE_PERCENT * 100` (converts percentage to basis points)
- **Example:** `PLATFORM_FEE_PERCENT=10` means 10% fee, winner gets 90% of pool

### 5. Reduced Logging ✅

#### PaymentWorker Logging
**File:** `backend/src/services/paymentWorker.ts`
- **Added:** Poll counter to log only every 6th poll (every minute instead of every 10 seconds)
- **Lines:** 26-27 (added properties)
- **Lines:** 83-86 (increment counter and check if should log)
- **Lines:** 113-118 (conditional logging based on poll count)
- **Impact:** Logs reduced from every 10s to every 60s

#### Request Stats Logging
**File:** `backend/src/middleware/requestTracking.ts`
- **Changed:** Stats logging interval from 1 minute to 5 minutes
- **Lines:** 16 (added `STATS_LOG_INTERVAL`)
- **Lines:** 48 (comment updated)
- **Lines:** 71 (log message updated to "Last 5 minutes")
- **Lines:** 83 (interval changed to use constant)

### 6. Claim Info in Match State API ✅
**File:** `backend/src/controllers/pollingMatchController.ts`
- **Added:** Claim deadline information to `/api/match/state/:matchId` response
- **Lines:** 211-223
- **Returns for completed matches:**
  - `claimable`: boolean (true if unclaimed and not expired)
  - `claimDeadline`: ISO timestamp
  - `claimTimeRemaining`: seconds remaining
  - `claimStatus`: current claim status

### 7. Frontend Claim Countdown ✅
**File:** `frontend/src/components/ResultScreen.tsx`
- **Added:** Real-time countdown timer for claim window
- **Added:** `formatTimeRemaining()` function to display time in human-readable format
- **Added:** `claimTimeLeft` state that updates every second
- **Added:** Effect hook to update countdown timer
- **Added:** Error handling to prevent crashes
- **Display:** Shows "⏱️ Claim within: Xh Ym" or "Xm Ys" or "Xs"

## Environment Variables

### New/Updated Variables
```bash
# Platform fee percentage (default: 3%)
PLATFORM_FEE_PERCENT=10  # 10% means winner gets 90% of pool

# Minimum stake (optional, defaults to 0.01 in code)
MIN_STAKE_WLD=0.01

# Note: MAX_STAKE_WLD is no longer used - stake cap removed
```

## API Changes

### GET /api/match/state/:matchId
**New fields for completed matches:**
```typescript
{
  // ... existing fields
  claimable: boolean,           // Can the winner claim now?
  claimDeadline: string,         // ISO timestamp of deadline
  claimTimeRemaining: number,    // Seconds remaining
  claimStatus: string            // 'unclaimed' | 'claimed' | 'expired'
}
```

### GET /api/claim/status/:matchId
**Existing endpoint** - No changes required, already returns:
```typescript
{
  matchId: string,
  claimable: boolean,
  isWinner: boolean,
  winnerWallet: string,
  amount: string,
  amountFormatted: string,
  deadline: string,
  status: string,
  txHash?: string,
  deadlineExpired: boolean
}
```

## Database Schema

### No schema changes required
The following columns already exist in the `matches` table:
- `claim_deadline` (TIMESTAMP)
- `claim_status` (TEXT) - values: 'unclaimed', 'claimed', 'expired'

## Background Jobs

### Claim Expiry Job
- **Interval:** 5 minutes
- **Function:** `expireUnclaimedMatches()`
- **Action:** Updates `claim_status = 'expired'` for matches where `claim_deadline < NOW()`
- **Logging:** Only logs when matches are expired

## Expected Behavior

### After Match Completion
1. Winner has **1 hour** to claim winnings (changed from 24 hours)
2. Claim button shown in ResultScreen with live countdown
3. Countdown updates every second showing time remaining
4. After 1 hour, claim expires automatically (background job)

### Platform Fee
- Configurable via `PLATFORM_FEE_PERCENT` environment variable
- Default: 3% (winner gets 97% of pool)
- Example with 10% fee:
  - Stake: 1 WLD each (2 WLD total pool)
  - Platform fee: 0.2 WLD (10%)
  - Winner receives: 1.8 WLD (90%)

### Stake Limits
- **No maximum stake** - users can stake any amount
- **Minimum stake:** 0.01 WLD (if staking at all)
- Free matches (stake = 0) still allowed

### Logging Improvements
- PaymentWorker: Logs every 60s instead of every 10s (83% reduction)
- Request Stats: Logged every 5 minutes instead of every minute (80% reduction)
- Only logs state changes and important events

## Testing Checklist

### Backend
- [x] TypeScript compilation successful
- [x] Claim expiry job compiles and exports correctly
- [x] No syntax errors in modified files
- [ ] Manual test: Create match, wait 1 hour, verify expiry
- [ ] Manual test: Verify platform fee calculation with different env values

### Frontend
- [x] ResultScreen changes compile
- [x] Error handling prevents crashes
- [ ] Manual test: Win match, verify countdown timer
- [ ] Manual test: Claim winnings, verify success flow
- [ ] Manual test: Wait for expiry, verify expired state

### Integration
- [ ] End-to-end: Win → See countdown → Claim → Success
- [ ] End-to-end: Win → Wait for expiry → See expired message
- [ ] Verify no stake cap on new matches
- [ ] Verify platform fee applied correctly

## Files Modified

1. `backend/src/controllers/claimController.ts` - Platform fee from env
2. `backend/src/controllers/pollingMatchController.ts` - 1hr deadline, claim info in state
3. `backend/src/controllers/pollingMatchmakingController.ts` - Removed stake cap
4. `backend/src/index.ts` - Start claim expiry job
5. `backend/src/jobs/claimExpiry.ts` - NEW: Expiry background job
6. `backend/src/middleware/requestTracking.ts` - Reduced logging frequency
7. `backend/src/services/paymentWorker.ts` - Reduced logging frequency
8. `frontend/src/components/ResultScreen.tsx` - Countdown timer, error handling

## Deployment Notes

### Environment Variables to Set
```bash
# Optional: Set custom platform fee (default 3%)
PLATFORM_FEE_PERCENT=10

# Note: MAX_STAKE_WLD no longer needed (feature removed)
```

### Post-Deployment Verification
1. Check logs for "Claim expiry job started" message
2. Verify PaymentWorker logs appear every ~60s (not every 10s)
3. Verify Request Stats logs appear every ~5min (not every 1min)
4. Test creating a match with high stake (>0.1 WLD) - should succeed
5. Test winning a match and seeing countdown timer
6. Test claiming winnings

## Rollback Plan

If issues occur:
1. Revert to previous commit
2. Or set `PLATFORM_FEE_PERCENT=3` to restore default fee
3. Frontend countdown is gracefully degraded - errors don't crash UI

## Security Considerations

- ✅ Minimum stake check prevents dust attacks
- ✅ Platform fee calculation uses integer math (wei) to prevent rounding errors
- ✅ Claim deadline enforced both in API and background job
- ✅ No changes to authentication or authorization
- ✅ SQL injection protected (parameterized queries)
- ✅ Error handling prevents information leakage

## Performance Impact

- ✅ **Reduced:** Log volume by ~80% (fewer log writes)
- ✅ **Added:** Background job runs every 5 minutes (minimal impact)
- ✅ **Neutral:** API response size slightly larger (adds 3 fields for completed matches)
- ✅ **Frontend:** Timer updates every 1s (standard React pattern, minimal impact)

---

**Implementation Date:** January 3, 2026
**Status:** ✅ Complete - Ready for Testing
