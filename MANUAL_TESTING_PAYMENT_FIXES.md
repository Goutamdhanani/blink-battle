# Manual Testing Guide: Payment Confirmation & Matchmaking Gating

## Overview
This guide covers manual testing of the payment confirmation flow and matchmaking gating fixes implemented to address issues where pending MiniKit transactions were incorrectly treated as confirmed.

## Changes Implemented

### 1. Status Normalization
- **File**: `backend/src/services/statusNormalization.ts`
- **Function**: `normalizeMiniKitStatus()`
- Maps all MiniKit transaction statuses to canonical set:
  - `pending`: initiated, authorized, broadcast, pending, pending_confirmation, submitted
  - `confirmed`: mined, confirmed, success
  - `failed`: failed, error, rejected
  - `cancelled`: expired, cancelled, canceled, declined
  - Unknown statuses default to `pending` (NOT confirmed)

### 2. Payment Confirmation Updates
- **File**: `backend/src/controllers/paymentController.ts`
- Persists both raw MiniKit status and normalized status to `payment_intents` table
- Persists transaction hash when available
- Only marks payment as confirmed when normalized status is `confirmed`

### 3. Matchmaking Payment Gating
- **File**: `backend/src/controllers/pollingMatchmakingController.ts`
- Returns 403 (instead of 400) when payment is not confirmed
- Clear error message: "Payment not confirmed. Please ensure your payment is confirmed before joining matchmaking."

## Test Scenarios

### Scenario 1: Pending Transaction (Should NOT Confirm)

**Setup**:
1. Start backend: `cd backend && npm start`
2. Initiate a payment for 0.1 WLD
3. Simulate MiniKit returning `status: "pending"` with `transactionHash: null`

**Expected Behavior**:
```json
POST /api/confirm-payment
Response:
{
  "success": true,
  "pending": true,
  "transaction": {
    "status": "pending",
    "transaction_id": "tx-abc-123"
  }
}
```

**Verification**:
- Check logs: Should see "Status normalization: Raw status: 'pending', Normalized: 'pending'"
- Payment should remain in pending state
- `payment_intents` table should have `normalized_status='pending'`
- Matchmaking join should return 403 with this payment reference

### Scenario 2: Mined Transaction (Should Confirm)

**Setup**:
1. Initiate a payment for 0.1 WLD
2. Simulate MiniKit returning `status: "mined"` with `transactionHash: "0xabc123..."`

**Expected Behavior**:
```json
POST /api/confirm-payment
Response:
{
  "success": true,
  "transaction": {
    "status": "mined",
    "transactionHash": "0xabc123..."
  },
  "payment": {
    "id": "payment-ref-123",
    "amount": 0.1,
    "status": "confirmed"
  }
}
```

**Verification**:
- Check logs: Should see "Status normalization: Raw status: 'mined', Normalized: 'confirmed'"
- `payment_intents` table should have:
  - `normalized_status='confirmed'`
  - `raw_status='mined'`
  - `transaction_hash='0xabc123...'`
- Matchmaking join should succeed with this payment reference

### Scenario 3: Unknown Status (Should Default to Pending)

**Setup**:
1. Initiate a payment
2. Simulate MiniKit returning `status: "processing"` (unknown status)

**Expected Behavior**:
- Should be treated as pending (NOT confirmed)
- Logs should show warning: "Unknown MiniKit status: 'processing', defaulting to PENDING"
- Payment should remain in pending state
- Matchmaking join should return 403

### Scenario 4: Matchmaking Payment Gating - Pending Payment

**Setup**:
1. Create user and initiate payment
2. Keep payment in pending state
3. Attempt to join matchmaking with stake 0.1 WLD

**Expected Behavior**:
```json
POST /api/matchmaking/join
Body: { "stake": 0.1, "paymentReference": "pending-payment-ref" }
Response (403):
{
  "error": "Payment not confirmed. Please ensure your payment is confirmed before joining matchmaking.",
  "status": "pending",
  "requiresPayment": true
}
```

### Scenario 5: Matchmaking Payment Gating - Confirmed Payment

**Setup**:
1. Create user and initiate payment
2. Confirm payment (status: mined)
3. Attempt to join matchmaking with stake 0.1 WLD

**Expected Behavior**:
```json
POST /api/matchmaking/join
Body: { "stake": 0.1, "paymentReference": "confirmed-payment-ref" }
Response (200):
{
  "status": "searching",
  "queueId": "queue-abc-123",
  "stake": 0.1,
  "expiresAt": "2026-01-03T10:00:00Z"
}
```

### Scenario 6: Free Match (No Payment Required)

**Setup**:
1. Create user
2. Attempt to join matchmaking with stake 0 (free match)

**Expected Behavior**:
```json
POST /api/matchmaking/join
Body: { "stake": 0 }
Response (200):
{
  "status": "searching",
  "queueId": "queue-def-456",
  "stake": 0,
  "expiresAt": "2026-01-03T10:00:00Z"
}
```

**Verification**:
- Should not check for payment at all
- No payment reference required

## Database Verification Queries

```sql
-- Check payment intent status after confirmation
SELECT 
  payment_reference,
  normalized_status,
  raw_status,
  transaction_hash,
  minikit_transaction_id,
  confirmed_at
FROM payment_intents
WHERE payment_reference = 'your-payment-ref';

-- Expected for pending:
-- normalized_status: 'pending'
-- raw_status: 'pending' (or other pending status)
-- transaction_hash: NULL or value
-- confirmed_at: NULL

-- Expected for confirmed:
-- normalized_status: 'confirmed'
-- raw_status: 'mined', 'confirmed', or 'success'
-- transaction_hash: '0x...'
-- confirmed_at: timestamp
```

## Automated Test Coverage

### Status Normalization Tests
Location: `backend/src/services/__tests__/statusNormalization.test.ts`
- ✅ 12 tests covering all status mappings
- Run: `npm test -- statusNormalization.test.ts`

### Payment Controller Tests
Location: `backend/src/controllers/__tests__/paymentController.test.ts`
- ✅ 15 tests including regression tests for:
  - Pending status must NOT mark payment confirmed
  - Mined status MUST mark payment confirmed
  - Unknown status defaults to pending
- Run: `npm test -- paymentController.test.ts`

### Matchmaking Controller Tests
Location: `backend/src/controllers/__tests__/pollingMatchmakingController.test.ts`
- ✅ 8 tests covering payment gating:
  - Free matches work without payment
  - Staked matches require payment reference
  - Pending/failed/cancelled payments return 403
  - Confirmed payments allow matchmaking join
- Run: `npm test -- pollingMatchmakingController.test.ts`

## Key Logs to Monitor

When running the backend, monitor these log messages:

1. **Status Normalization**:
```
[Payment] Status normalization:
  Raw status: "pending"
  Normalized: "pending"
  Transaction hash: null
```

2. **Payment Confirmation**:
```
[Payment] Payment confirmed reference=xxx transactionId=yyy
```

3. **Payment Still Pending**:
```
[Payment] Transaction still pending reference=xxx
```

4. **Matchmaking Payment Verification**:
```
[HTTP Matchmaking] Payment verified for user xxx, reference yyy
```

## Regression Prevention

These tests ensure:
1. ❌ Pending transactions can NEVER be treated as confirmed
2. ❌ Unknown statuses can NEVER be treated as confirmed
3. ✅ Only mined/confirmed/success statuses mark payments confirmed
4. ✅ Raw status and transaction hash are always persisted
5. ✅ Matchmaking blocks unpaid users with 403 response
6. ✅ Route `/api/matchmaking/join` is accessible (mounted at line 248 in index.ts)

## CI/CD Verification

The following checks should pass:
- ✅ TypeScript compilation: `npm run build`
- ✅ Unit tests: `npm test`
- ✅ All new tests passing (35 new test cases)

## Deployment Checklist

Before deploying:
- [ ] Run all tests: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Database migration applied (payment_intents table exists)
- [ ] Environment variables set (APP_ID, DEV_PORTAL_API_KEY)
- [ ] Monitor logs during first few transactions
- [ ] Verify payment_intents table is being populated
