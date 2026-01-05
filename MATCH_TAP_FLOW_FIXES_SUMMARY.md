# Match Tap Flow & Refund Fixes - Implementation Summary

## Overview
This PR fixes critical issues in the match tap flow, timing validation, refund UI/state handling, and match outcome rendering as specified in the problem statement.

## Issues Fixed

### 1. ✅ 400 on Tap / Connection Failed
**Problem:** Anti-cheat was rejecting legitimate taps with 400 errors due to timing discrepancies, even when server reaction_ms was valid (logs showed 1046ms and 1089ms rejected).

**Solution:**
- Made anti-cheat timing check **audit-only** (no 400 errors)
- Server time is now **fully authoritative** for gameplay
- Client timestamps used only for audit logging
- Timing discrepancies logged but don't block taps
- 150ms tolerance already implemented for clock drift

**Files Changed:**
- `backend/src/services/antiCheat.ts` - Changed `checkTimingDiscrepancy` to return boolean instead of throwing
- `backend/src/controllers/pollingMatchController.ts` - Removed try-catch that returned 400 errors

**Tests:** `backend/src/controllers/__tests__/tapTolerance.test.ts` (3 tests passing)

### 2. ✅ Negative Reaction Times
**Problem:** Client-side reaction calculations used client clock, causing negative values (-515ms, -3704ms).

**Solution:**
- Already implemented: TapEvent model clamps reaction_ms to [0, 10000]ms
- Negative values automatically set to 0
- Frontend displays N/A for -1 sentinel values
- Server time only for gameplay logic

**Files Changed:**
- `frontend/src/components/MatchHistory.tsx` - Shows N/A for negative times

**Tests:** `backend/src/models/__tests__/TapEvent.clamping.test.ts` (4 tests passing)

### 3. ✅ Duplicate Refund Claims
**Problem:** UI still showed claim button after successful refund; subsequent attempts returned 400.

**Solution:**
- Added check for `processing` status in addition to `completed`
- Return `alreadyClaimed` flag in error responses
- Frontend auto-refreshes list when duplicate detected
- Database locking (FOR UPDATE) prevents race conditions
- Applied to both claim endpoints

**Files Changed:**
- `backend/src/controllers/refundController.ts` - Enhanced duplicate detection
- `frontend/src/components/PendingRefunds.tsx` - Handle alreadyClaimed flag

**Tests:** `backend/src/controllers/__tests__/refundDuplicatePrevention.test.ts` (5 tests passing)

### 4. ✅ Match Outcomes UI/Logic
**Problem:** Users couldn't see proper win/loss/draw/cancelled states with refund eligibility.

**Solution:**
- Added explicit `outcome` field to match history API
- Priority logic: `result_type` (specific) > `status` (general)
- Outcomes: win, loss, draw, cancelled
- Refund UI only for draw/cancelled matches
- Claim UI only for win matches

**Files Changed:**
- `backend/src/controllers/matchController.ts` - Added outcome field and refund eligibility logic
- `frontend/src/components/MatchHistory.tsx` - Render based on outcome field

**Tests:** `backend/src/controllers/__tests__/matchOutcome.test.ts` (6 tests passing)

### 5. ✅ Payment/Refund Flow Noise
**Problem:** Redundant PaymentWorker logging spam.

**Solution:**
- Throttled payment status logs to every 6th poll (60s instead of 10s)
- Already had throttling for other messages
- Maintains visibility of errors and key events

**Files Changed:**
- `backend/src/services/paymentWorker.ts` - Conditional logging for status updates

### 6. ✅ Concurrency Safety
**Problem:** Need stable behavior under 100+ concurrent games.

**Solution:**
- Database locking (FOR UPDATE) for refunds
- First-write-wins for tap events (UNIQUE constraint)
- Transaction-safe operations
- No race conditions with proper locking

**Implementation:** Already present in existing code, verified in tests

## Test Coverage

### New Tests (14 tests, all passing)
1. **tapTolerance.test.ts** - 3 tests
   - No errors for legitimate discrepancies
   - Large discrepancy flagging (audit-only)
   - Negative reaction time handling

2. **refundDuplicatePrevention.test.ts** - 5 tests
   - Completed status blocking
   - Processing status blocking
   - Eligible claim success
   - Both endpoints covered

3. **matchOutcome.test.ts** - 6 tests
   - Win/loss/draw/cancelled outcomes
   - Refund eligibility logic
   - Claim button visibility

### Existing Tests (still passing)
- TapEvent.clamping.test.ts - 4 tests
- Plus 226 other tests in the suite

## Key Design Decisions

1. **Server-Authoritative Timing:** Server time is always used for gameplay logic. Client time is for audit only.

2. **Outcome Priority:** `result_type` (tie, both_disqualified) takes precedence over `status` (cancelled) for accurate UI rendering.

3. **Graceful Degradation:** Frontend shows optimistic local reaction time for immediate feedback, but server reaction_ms is authoritative for results.

4. **Audit-Only Anti-Cheat:** Timing discrepancies are logged but don't block legitimate gameplay. Prevents false positives from network/clock issues.

5. **Refund State Machine:** eligible → processing → completed, with proper checks at each transition.

## Concurrency Safety

- **Tap Events:** UNIQUE constraint (match_id, user_id) + ON CONFLICT DO NOTHING
- **Refunds:** FOR UPDATE row locking + transaction safety
- **Match Results:** First-write-wins semantics
- **Payment Worker:** SKIP LOCKED prevents worker conflicts

## Migration/Deployment Notes

- No schema changes required
- Backward compatible API changes
- No data migration needed
- Can be deployed without downtime

## Performance Impact

- Reduced logging: ~83% reduction in PaymentWorker logs (every 60s vs 10s)
- No additional database queries
- Same or better performance (fewer 400 errors = fewer retries)

## Security Improvements

- No client timestamps used for gating gameplay
- Transaction-safe refund claims
- Better duplicate claim prevention
- Audit trail maintained for timing discrepancies
