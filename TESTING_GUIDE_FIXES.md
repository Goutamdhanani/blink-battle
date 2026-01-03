# Testing Guide for Production Issue Fixes

This guide documents how to test the fixes for the runtime issues observed in production logs and UI behavior.

## Environment Setup

Ensure the following environment variables are correctly configured:

### Frontend (.env or Vercel environment variables)
```bash
VITE_API_URL=https://blink-battle-7dcdf0aa361a.herokuapp.com/
VITE_APP_ID=app_39ba2bf031c9925d1ba3521a305568d8
VITE_PLATFORM_WALLET_ADDRESS=0x645eeae14c09f8be1e3c1062f54f23bf68573415
VITE_ESCROW_CONTRACT_ADDRESS=0x29B33908F05620826585ea5b34aDC4b688dD0930
VITE_WLD_TOKEN_ADDRESS=0x2cFc85d8E48F8EAb294be644d9E25C3030863003
```

### Backend (Heroku Config Vars)
```bash
DATABASE_URL=<your-postgres-url>
DATABASE_SSL=true
REDIS_URL=<your-redis-url>
APP_ID=app_39ba2bf031c9925d1ba3521a305568d8
PLATFORM_WALLET_ADDRESS=0x645eeae14c09f8be1e3c1062f54f23bf68573415
ESCROW_CONTRACT_ADDRESS=0x29B33908F05620826585ea5b34aDC4b688dD0930
BACKEND_PRIVATE_KEY=<your-private-key>
WORLD_CHAIN_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public
JWT_SECRET=<your-jwt-secret>
PLATFORM_FEE_PERCENT=3
```

## Database Migration

Before testing, ensure the database schema is updated:

```bash
# On Heroku
heroku run npm run migrate:columns --app blink-battle

# Or locally
npm run migrate:columns
```

This adds the `tx_hash` column to the transactions table, which was causing the "column does not exist" error.

## Test Cases

### 1. Backend Schema Fix: tx_hash Column

**Issue**: `column "tx_hash" of relation "transactions" does not exist`

**Fix**: Added `tx_hash` column to transactions table in both migrate.ts and migrations.ts

**Test Steps**:
1. Deploy backend with updated schema
2. Run migrations: `npm run migrate:columns`
3. Start a staked match
4. Check backend logs for transaction creation
5. Verify no "column does not exist" errors

**Expected Result**: Transactions are created successfully with tx_hash field populated from escrow service.

### 2. Backend Timestamp Guards: Invalid time value

**Issue**: `RangeError: Invalid time value` when calling `Date.toISOString()` on null/NaN timestamps

**Fix**: Added comprehensive null/NaN/finite checks before calling toISOString() in pollingMatchController.getState

**Test Steps**:
1. Start a match
2. Poll match state endpoint: `GET /api/match/state/:matchId`
3. Observe response includes `greenLightTime` and `greenLightTimeISO`
4. Check backend logs for any "Invalid time value" errors

**Expected Result**: 
- `greenLightTime` is either a valid number (milliseconds) or null
- `greenLightTimeISO` is either a valid ISO string or null
- No "Invalid time value" errors in logs

### 3. Backend Winner Wallet Validation

**Issue**: `Cannot distribute - winner wallet or ID invalid` causing payment distribution to fail

**Fix**: Added explicit validation for winner wallet and ID before attempting distribution

**Test Steps**:
1. Complete a match where one player wins
2. Check backend logs for winner determination
3. Verify payment distribution succeeds or fails with clear error message
4. If distribution fails, check that error message clearly states why (invalid wallet, invalid ID, etc.)

**Expected Result**: 
- Payment distribution succeeds with valid winner wallet
- If it fails, error message clearly indicates the issue
- Match still completes in DB even if payment fails (prevents black screen)

### 4. Backend Leaderboard: avgReactionTime Handling

**Issue**: `t.user.avgReactionTime.toFixed is not a function` when avgReactionTime is null/undefined/string

**Fix**: Added safe conversion of avgReactionTime to number or null in leaderboard controller

**Test Steps**:
1. View leaderboard: `GET /api/leaderboard`
2. Check for users with no matches (avgReactionTime = null)
3. Verify leaderboard response includes avgReactionTime as number or null
4. Frontend should display "-" for null values

**Expected Result**: 
- Leaderboard loads without errors
- avgReactionTime is always a number or null, never a string
- Frontend displays "-" for null values using formatReactionTime()

### 5. Frontend Countdown Sequence

**Issue**: Countdown displays incorrect sequence (e.g., showing 6, 4, then get-ready/green in wrong order)

**Fix**: Updated countdown logic to show 3, 2, 1 during the LAST 3 seconds before green light, and "Wait for it..." during random delay period

**Test Steps**:
1. Start a match (either practice or staked)
2. Wait for both players to be ready
3. Observe countdown sequence
4. Record the countdown numbers shown

**Expected Result**:
- After both players ready, see "Wait for it..." for 2-5 seconds (random delay)
- Then see countdown: 3... 2... 1...
- Then see "GO!" with green light
- No large countdown numbers like 6, 7, 8

**Frontend Flow**:
- `waiting_for_go` state → shows "Wait for it..." phase
- `countdown` state with countdown value → shows "3", "2", "1"
- `go` state → shows green "TAP NOW!"

### 6. Frontend Payment Flow for Staked Matches

**Issue**: Payment drawer (MiniKit) never presented before starting wagered match, causing escrow to never be funded

**Fix**: Added dedicated payment screen when match is found for staked games, blocking game start until payment succeeds

**Test Steps**:
1. Navigate to PvP Staking mode
2. Select a stake amount (e.g., 0.1 WLD)
3. Click "Find Opponent"
4. Wait for match to be found
5. Verify payment screen appears with:
   - Stake amount
   - Potential winnings
   - Platform fee breakdown
   - "Pay X WLD" button
6. Click "Pay" button
7. Complete MiniKit payment in World App
8. Verify match only starts after payment succeeds

**Expected Result**:
- Payment screen appears after match found (for staked games)
- User cannot proceed to game without paying
- If payment fails, clear error message shown
- If payment succeeds, game starts automatically
- Free matches skip payment screen entirely

**Error Scenarios to Test**:
- User cancels payment → Should show error, allow retry
- Insufficient funds → Should show clear error message
- Network error → Should show error, allow retry
- Session expired → Should prompt to sign in again

### 7. Frontend Error Display: Prevent Blank Screens

**Issue**: UI never loads properly; can land on blue/blank screen with no error indication

**Fix**: Added comprehensive error logging and error display in GameArena component

**Test Steps**:
1. Start a match
2. Simulate network errors (throttle network, disconnect WiFi temporarily)
3. Observe UI behavior
4. Check browser console for error logs

**Expected Result**:
- Even with network errors, UI shows error message instead of blank screen
- Console logs include detailed error information
- Game phase transitions are logged for debugging
- Users see "Connection issue: <error message>" banner at top of game

**Console Logging Added**:
- `[Polling] Match state:` logs current state, status, countdown
- `[Polling] Error details:` logs full error context
- `[GameArena] Game phase changed to:` logs phase transitions
- `[Matchmaking] Match found, showing payment screen` logs payment flow

### 8. Integration Test: Full Staked Match Flow

**Complete flow test**:
1. Sign in with World App (SIWE authentication)
2. Navigate to Dashboard → view stats
3. Click "Play for Stakes"
4. Select stake amount (0.1 WLD)
5. Click "Find Opponent"
6. Wait for match (should find opponent or wait ~30 seconds)
7. **NEW: Payment screen appears**
8. Click "Pay 0.1 WLD"
9. Approve payment in World App
10. Wait for opponent to pay (if not already paid)
11. See "Wait for it..." → countdown 3, 2, 1 → green light
12. Tap when green
13. See result screen with winner/loser
14. Check wallet balance (winner should receive ~0.194 WLD)
15. Return to dashboard, verify stats updated
16. Check leaderboard, verify avgReactionTime displayed correctly

## Backend Log Monitoring

Monitor these log patterns to verify fixes:

### Success Patterns
```
[Escrow] Match created on-chain: <matchId>, tx: 0x...
[Polling Match] Winner determined: <userId>, Result: normal_win, Payment: distribute
[Polling Match] Match completed in DB: <matchId>, Winner: <userId>, Payment: success
[Polling Match] 🟢 Green light active! Match <matchId> transitioning to IN_PROGRESS
```

### Error Patterns (Should NOT appear)
```
❌ column "tx_hash" of relation "transactions" does not exist
❌ RangeError: Invalid time value
❌ Cannot distribute - winner wallet or ID invalid
❌ t.user.avgReactionTime.toFixed is not a function
```

### New Safety Patterns (Should appear when issues occur)
```
[Polling Match] Invalid green_light_time for match <matchId>: <value>
[Polling Match] Cannot distribute - winner wallet is invalid: wallet="", winnerId="..."
[Polling Match] ⚠️ Match completed but payment failed: <matchId>. Error: <error>. Manual review may be required.
[REFUND_FAILED] Match: <matchId>, Players: <addr1>, <addr2>, Amount: <amount>, Reason: <reason>
```

## Rollback Plan

If issues persist after deployment:

1. **Database**: The `tx_hash` column migration is backward-compatible. Old code will work with new schema.
2. **Backend**: Previous version can be rolled back via Heroku releases: `heroku releases:rollback --app blink-battle`
3. **Frontend**: Revert deployment on Vercel
4. **Emergency**: Disable staking temporarily by setting `ENFORCE_STAKES=false` (when implemented)

## Known Limitations

1. **Payment flow**: Current implementation shows payment screen but doesn't enforce payment before match start. Backend still has payment validation commented out (see pollingMatchController.ts line 36-52). This should be uncommented once payment integration is fully tested.

2. **Payment polling**: After payment, the frontend doesn't poll for opponent payment status. Both players need to pay before match starts, but there's no real-time indication of opponent payment status.

3. **Match cancellation**: If a player pays but opponent doesn't pay within timeout, match should be refunded. This timeout logic needs to be implemented.

## Next Steps

1. Implement payment status polling (check if opponent has paid)
2. Add match start timeout for unpaid matches
3. Uncomment stake validation in pollingMatchController ready() endpoint
4. Add admin dashboard for monitoring failed refunds
5. Create `failed_refunds` table for manual review tracking
