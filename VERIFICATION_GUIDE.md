# Stabilization Hotfixes - Verification Guide

This guide outlines the steps to verify all stabilization hotfixes are working correctly in production.

## Pre-Deployment Checklist

### 1. Environment Variables
Ensure all required environment variables are set:

**Backend (.env)**:
```bash
# Verify these are set
MAX_STAKE_WLD=0.1           # Stake cap
MIN_REACTION_MS=0           # Min reaction time
MAX_REACTION_MS=5000        # Max reaction time
DATABASE_URL=postgresql://... # With SSL enabled
APP_ID=app_...              # MiniKit App ID
DEV_PORTAL_API_KEY=...      # For payment verification
PLATFORM_WALLET_ADDRESS=0x... # Platform wallet
```

**Frontend (.env)**:
```bash
VITE_API_URL=https://your-backend-url
VITE_APP_ID=app_...
VITE_PLATFORM_WALLET_ADDRESS=0x...
VITE_ESCROW_CONTRACT_ADDRESS=0x...
VITE_WLD_TOKEN_ADDRESS=0x...
```

### 2. Database Migrations
Run all migrations before deployment:

```bash
cd backend
npm run migrate:production up
```

Expected output:
```
✅ Created payment_intents table with indexes
✅ Added idempotency_key column and index
✅ Added player1_wallet and player2_wallet columns
✅ Added unique constraint on tap_events(match_id, user_id)
✅ Schema validation completed
```

### 3. Build Verification
Both builds should complete without errors:

```bash
# Backend
cd backend && npm run build
# Should output: tsc (no errors)

# Frontend
cd frontend && npm run build
# Should output: ✓ built in X.XXs
```

## Testing Payment Flow (MiniKit Drawer)

### Test Case 1: Free Match (No Payment)
1. Open app in World App
2. Click "Practice Mode" or select 0 WLD stake
3. Click "Find Opponent"
4. **Expected**: Immediately joins matchmaking queue
5. **Expected**: No payment drawer appears
6. **Verify**: Match starts when opponent found

### Test Case 2: Staked Match with Payment
1. Open app in World App
2. Select stake amount (e.g., 0.1 WLD)
3. Click "Find Opponent"
4. **Expected**: MiniKit payment drawer opens automatically
5. **Expected**: Shows stake amount and recipient
6. Approve payment in drawer
7. **Expected**: Payment confirmation message
8. **Expected**: Joins matchmaking queue after payment confirmed
9. **Verify**: Match starts when opponent found and both paid

### Test Case 3: Stake Cap Enforcement
1. Open app in World App
2. **Expected**: Stakes > 0.1 WLD show as "Temporarily unavailable"
3. **Expected**: Warning message about stake cap
4. Try to select disabled stake option
5. **Expected**: Cannot select disabled option
6. **Verify**: Only 0.1 WLD or lower are selectable

### Test Case 4: Payment Cancellation
1. Select 0.1 WLD stake
2. Click "Find Opponent"
3. Cancel payment in MiniKit drawer
4. **Expected**: Error message displayed
5. **Expected**: "Try Again" button shown
6. Click "Try Again"
7. **Expected**: Can retry payment

### Test Case 5: Payment Gating Backend
Test via API (requires auth token):

```bash
# Attempt to join without payment (should fail)
curl -X POST http://localhost:3001/api/matchmaking/join \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stake": 0.1}'

# Expected response:
# {"error": "Payment required for staked matches", "requiresPayment": true}

# Join with payment reference (should succeed)
curl -X POST http://localhost:3001/api/matchmaking/join \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stake": 0.1, "paymentReference": "confirmed_payment_ref"}'

# Expected response:
# {"status": "searching", "queueId": "...", "stake": 0.1}
```

## Testing Crash Prevention

### Test Case 6: Invalid green_light_time (No 500 Errors)
1. Join a match
2. Both players ready
3. Poll match state: `GET /api/match/state/:matchId`
4. **Expected**: Response with valid green_light_time or null
5. **Expected**: NO RangeError or 500 errors
6. **Verify**: Countdown displays correctly

Check logs for validation messages:
```
[Polling Match] Invalid green_light_time for match X: ...
```

### Test Case 7: Reaction Time Clamping
1. Complete a match (tap when green light appears)
2. Check match result: `GET /api/match/result/:matchId`
3. **Verify**: Reaction times are within 0-5000ms range
4. **Verify**: Negative times are clamped to 0
5. **Verify**: Times > 5000ms are clamped to 5000ms

Check logs for clamping warnings:
```
[TapEvent] ⚠️ Clamped reaction time from Xms to Yms for match ...
```

### Test Case 8: Duplicate Tap Prevention
1. Join a match as player A
2. Wait for green light
3. Attempt to tap multiple times rapidly
4. **Expected**: Only first tap is recorded
5. **Expected**: Subsequent taps return existing tap
6. **Verify**: Only one tap_event per player per match in database

Query database:
```sql
SELECT COUNT(*) FROM tap_events 
WHERE match_id = 'test_match_id' 
GROUP BY user_id;
-- Should return 1 for each user
```

## Testing Payout Flow

### Test Case 9: Wallet Validation for Payouts
1. Complete a staked match
2. **Expected**: Winner determined correctly
3. **Verify**: Payment sent to correct winner wallet
4. **Verify**: Platform fee deducted (3%)

Check logs:
```
[Polling Match] Completing match X - winner: Y, wallet: 0x...
[Polling Match] Winner determined: <winnerId>, Result: normal_win, Payment: distribute
```

### Test Case 10: Refund on Both Disqualified
1. Both players tap before green light (early tap)
2. **Expected**: Both disqualified
3. **Expected**: Refund to both players (with fee)
4. **Verify**: Platform fee still applied

Check logs:
```
[Polling Match] Winner determined: none, Result: both_disqualified, Payment: refund
```

## Monitoring in Production

### Key Metrics to Monitor

1. **Payment Success Rate**
   - Monitor confirmed vs failed payments
   - Alert on < 95% success rate

2. **Match 500 Error Rate**
   - Monitor `/api/match/state/:matchId` endpoint
   - Alert on any 500 errors (should be 0)

3. **Reaction Time Distribution**
   - Monitor for frequent clamping warnings
   - Investigate if > 5% of taps are clamped

4. **Duplicate Tap Rate**
   - Monitor logs for duplicate tap messages
   - Should be rare (network race conditions only)

5. **Payment Processing Latency**
   - Monitor time from payment initiation to confirmation
   - Alert if > 30 seconds

### Database Queries for Verification

```sql
-- Check payment_intents table exists
SELECT COUNT(*) FROM payment_intents;

-- Check matches have wallet columns
SELECT player1_wallet, player2_wallet FROM matches LIMIT 1;

-- Check tap_events unique constraint
SELECT indexname FROM pg_indexes 
WHERE tablename = 'tap_events' 
AND indexname LIKE '%unique%';

-- Check transactions have tx_hash
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'transactions' 
AND column_name = 'tx_hash';

-- Monitor payment confirmations
SELECT 
  normalized_status, 
  COUNT(*) 
FROM payment_intents 
GROUP BY normalized_status;

-- Monitor reaction time distribution
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN reaction_ms < 0 THEN 1 END) as negative,
  COUNT(CASE WHEN reaction_ms > 5000 THEN 1 END) as over_max,
  AVG(reaction_ms) as avg_reaction
FROM tap_events;
```

### Log Patterns to Watch

**Success patterns:**
```
[HTTP Matchmaking] Payment verified for user X, reference Y
[Polling Match] Both players staked and wallets validated
[Polling Match] 🟢 Green light active! Match X transitioning to IN_PROGRESS
[Polling Match] Match completed in DB: X, Winner: Y, Payment: success
```

**Warning patterns (investigate if frequent):**
```
[TapEvent] ⚠️ Clamped reaction time from Xms to Yms
[Polling Match] Invalid green_light_time for match X
[TapEvent] Duplicate tap detected for match X, user Y
```

**Error patterns (should be rare):**
```
[Polling Match] Cannot distribute - winner wallet is invalid
[Polling Match] ⚠️ Match completed but payment failed
[PaymentWorker] Error processing payment
```

## Rollback Plan

If critical issues are discovered:

1. **Immediate**: Disable staked matches by setting `MAX_STAKE_WLD=0`
2. **Database rollback**: `npm run migrate:rollback` (if needed)
3. **Code rollback**: Deploy previous stable version
4. **Communication**: Notify users via World App

## Post-Deployment Verification

Within first 24 hours:
- [ ] Monitor error rates (should be < 0.1%)
- [ ] Verify payment success rate (should be > 95%)
- [ ] Check database for duplicate taps (should be minimal)
- [ ] Verify no RangeError in logs
- [ ] Confirm payouts are working correctly
- [ ] Review user feedback for payment flow

## Support Escalation

If issues arise:
1. Check logs for error patterns
2. Query database for data integrity
3. Verify environment variables
4. Check MiniKit Developer Portal for payment issues
5. Review blockchain transactions for payout issues

---

**Last Updated**: 2026-01-03
**Version**: 1.0.0
