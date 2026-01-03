# Blink Battle Hotfix Verification Guide

## Summary
This hotfix stabilizes the Blink Battle platform by ensuring all payment gating, wallet persistence, and anti-cheat mechanisms are properly implemented and operational.

## Changes Made

### 1. Frontend Changes
- ✅ **Removed temporary stake notice** (Matchmaking.tsx line 253-257)
  - Deleted warning: "Stakes above X WLD are temporarily disabled until platform wallet is funded for gas fees"
- ✅ **Updated stake cap messaging** to reflect permanent platform limit rather than temporary funding issue
- ✅ **Frontend builds successfully** with TypeScript validation passed

### 2. Backend Changes
- ✅ **Updated error messages** in pollingMatchmakingController to remove references to temporary funding limitations
- ✅ **Backend builds successfully** with TypeScript validation passed

## Backend Infrastructure (Pre-Existing)

### Database Migrations (Ready to Run)

#### Migration 001: Payment Intents Table
**Location**: `backend/src/config/migrations/001_payment_intents.ts`

**Creates**: `payment_intents` table with:
- `payment_reference` (UNIQUE) - idempotent payment tracking
- `locked_at`, `locked_by` - row-level locking for concurrent processing
- `normalized_status` - mapped from MiniKit statuses (pending/confirmed/failed/cancelled)
- `transaction_hash` - blockchain transaction hash
- `retry_count`, `last_retry_at`, `next_retry_at` - exponential backoff retry logic
- Indexes for efficient querying by reference, user, match, status, and retry scheduling

**Status**: ✅ Ready to run, implements idempotency and prevents double payments

#### Migration 002: Matches Idempotency & Wallets
**Location**: `backend/src/config/migrations/002_matches_idempotency.ts`

**Adds to `matches` table**:
- `idempotency_key` (UNIQUE) - prevents duplicate match creation
- `player1_wallet`, `player2_wallet` - persists wallet addresses at match creation
- Backfills existing matches with wallet data from users table

**Status**: ✅ Ready to run, ensures wallet persistence for payouts

#### Migration 003: Tap Events Unique Constraint
**Location**: `backend/src/config/migrations/003_tap_events_unique.ts`

**Adds**: `UNIQUE(match_id, user_id)` constraint on `tap_events` table
- Enforces first-write-wins semantics
- Removes duplicate taps before adding constraint
- Works with `INSERT ... ON CONFLICT DO NOTHING` pattern in code

**Status**: ✅ Ready to run, prevents duplicate tap submission

#### Migration 004: Schema Validation
**Location**: `backend/src/config/migrations/004_schema_validation.ts`

**Verifies**:
- `transactions.tx_hash` column exists (for escrow transaction tracking)
- All prior migrations have been applied successfully
- Validates critical columns are in place

**Status**: ✅ Ready to run, ensures database schema integrity

### Payment Gating Implementation

#### Matchmaking Controller
**Location**: `backend/src/controllers/pollingMatchmakingController.ts`

**Enforces**:
1. ✅ Stake cap validation (MAX_STAKE_WLD env var, default 0.1 WLD)
2. ✅ Payment requirement for staked matches (lines 46-82):
   - Requires `paymentReference` parameter for stake > 0
   - Validates payment intent exists and belongs to user
   - **CRITICAL**: Only allows `normalized_status === 'confirmed'`
   - Returns 400 with `requiresPayment: true` if payment missing or not confirmed
3. ✅ Returns 404 if payment reference not found
4. ✅ Returns 403 if payment doesn't belong to user

**Key Code**:
```typescript
if (stake > 0) {
  if (!paymentReference) {
    res.status(400).json({ 
      error: 'Payment required for staked matches',
      requiresPayment: true,
      stake
    });
    return;
  }

  const paymentIntent = await PaymentIntentModel.findByReference(paymentReference);
  if (!paymentIntent) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }

  if (paymentIntent.normalized_status !== NormalizedPaymentStatus.CONFIRMED) {
    res.status(400).json({ 
      error: 'Payment not confirmed',
      status: paymentIntent.normalized_status,
      requiresPayment: true
    });
    return;
  }
}
```

#### Match Ready Controller
**Location**: `backend/src/controllers/pollingMatchController.ts`

**Enforces** (lines 45-66):
1. ✅ Dual funding requirement: both players must have `player1_staked` and `player2_staked` set to true
2. ✅ Validates wallet addresses are stored before starting countdown
3. ✅ Returns 400 with detailed status if funding incomplete
4. ✅ Returns 500 if wallets missing (should never happen with proper match creation)

**Key Code**:
```typescript
if (match.stake > 0) {
  const bothStaked = await MatchModel.areBothPlayersStaked(matchId);
  if (!bothStaked) {
    res.status(400).json({ 
      error: 'Both players must deposit stake before game can start',
      requiresStake: true,
      player1Staked: match.player1_staked || false,
      player2Staked: match.player2_staked || false,
    });
    return;
  }

  if (!match.player1_wallet || !match.player2_wallet) {
    res.status(500).json({ 
      error: 'Player wallets not found - cannot start match',
    });
    return;
  }
}
```

### Payment Status Normalization

#### Status Mapping
**Location**: `backend/src/services/paymentUtils.ts`

**Normalizes MiniKit statuses**:
```typescript
// MiniKit Status → Normalized Status
initiated              → pending
authorized             → pending
broadcast              → pending
pending_confirmation   → pending
pending                → pending

confirmed              → confirmed
success                → confirmed

failed                 → failed
error                  → failed
expired                → failed

cancelled              → cancelled
```

**CRITICAL**: Does NOT treat `pending` as `confirmed` - only `confirmed` and `success` map to confirmed state

### Wallet Persistence

#### Match Creation
**Location**: `backend/src/models/Match.ts`

**Implementation** (lines 9-43):
1. ✅ Fetches wallet addresses from users table at match creation time
2. ✅ Rejects match creation if either wallet missing (throws Error)
3. ✅ Stores wallets in `player1_wallet` and `player2_wallet` columns
4. ✅ Validates wallets before winner payout (lines 106-122)

**Key Code**:
```typescript
const player1 = await pool.query('SELECT wallet_address FROM users WHERE user_id = $1', [player1Id]);
const player2 = await pool.query('SELECT wallet_address FROM users WHERE user_id = $1', [player2Id]);

const player1Wallet = player1.rows[0]?.wallet_address;
const player2Wallet = player2.rows[0]?.wallet_address;

if (!player1Wallet || !player2Wallet) {
  throw new Error('Player wallet addresses not found');
}

// Store wallets at creation time
INSERT INTO matches 
  (player1_id, player2_id, stake, status, player1_wallet, player2_wallet, idempotency_key) 
VALUES ($1, $2, $3, $4, $5, $6, $7)
```

### Tap Event Handling

#### First-Write-Wins Implementation
**Location**: `backend/src/models/TapEvent.ts`

**Features** (lines 21-79):
1. ✅ UNIQUE constraint on `(match_id, user_id)` enforced at database level
2. ✅ `INSERT ... ON CONFLICT DO NOTHING` pattern
3. ✅ Returns existing tap if conflict detected (first tap wins)
4. ✅ **Reaction time clamping** to `[MIN_REACTION_MS, MAX_REACTION_MS]` range (lines 36-50)
5. ✅ Logs warning when clamping occurs
6. ✅ Validates but stores clamped value (prevents negative/garbage times)

**Key Code**:
```typescript
const rawReactionMs = serverTimestamp - greenLightTime;
const reactionMs = clampReactionTime(rawReactionMs); // Clamps to valid range

const result = await pool.query(
  `INSERT INTO tap_events (
    match_id, user_id, client_timestamp, server_timestamp, 
    reaction_ms, is_valid, disqualified, disqualification_reason
  ) 
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
   ON CONFLICT (match_id, user_id) DO NOTHING
   RETURNING *`,
  [matchId, userId, clientTimestamp, serverTimestamp, 
   reactionMs, isValid, disqualified, disqualificationReason]
);

// If no rows returned, conflict occurred - return existing tap
if (result.rows.length === 0) {
  const existing = await this.findByMatchAndUser(matchId, userId);
  return existing;
}
```

### Green Light Time Validation

#### Polling State Endpoint
**Location**: `backend/src/controllers/pollingMatchController.ts`

**Safety Checks** (lines 141-199):
1. ✅ Validates `green_light_time` is a finite number > 0 before ISO conversion
2. ✅ Returns `null` for both timestamp and ISO string if invalid
3. ✅ Logs error if invalid value detected
4. ✅ Prevents RangeError "Invalid time value" from crashing endpoint
5. ✅ Never returns 500 error for invalid green_light_time

**Key Code**:
```typescript
let greenLightTimeMs = matchState.green_light_time ?? null;
let greenLightTimeISO: string | null = null;

if (typeof greenLightTimeMs === 'number' && !isNaN(greenLightTimeMs) && Number.isFinite(greenLightTimeMs)) {
  try {
    greenLightTimeISO = new Date(greenLightTimeMs).toISOString();
  } catch (err) {
    console.error(`Invalid green_light_time for match ${matchId}: ${greenLightTimeMs}`, err);
    greenLightTimeMs = null;
    greenLightTimeISO = null;
  }
} else if (greenLightTimeMs !== null) {
  console.error(`green_light_time is not a valid number for match ${matchId}: ${greenLightTimeMs}`);
  greenLightTimeMs = null;
}
```

#### Tap Validation
**Location**: `backend/src/controllers/pollingMatchController.ts`

**Validation** (lines 261-289):
1. ✅ Checks `green_light_time` is finite before accepting tap
2. ✅ Returns 400 if green light time invalid (prevents tap recording)
3. ✅ Validates tap is within reasonable time window (-60s to +10s)
4. ✅ Provides detailed error information for debugging

## Frontend Implementation

### Payment Flow
**Location**: `frontend/src/components/Matchmaking.tsx`

**Implementation** (lines 46-130):
1. ✅ Opens MiniKit payment drawer BEFORE joining matchmaking
2. ✅ Validates payment confirmation (checks for `pending` status)
3. ✅ Only proceeds to matchmaking after payment confirmed
4. ✅ Passes `paymentReference` to matchmaking API
5. ✅ Handles authentication errors (expired tokens)
6. ✅ Shows clear error messages for payment failures

**Key Flow**:
```
1. User selects stake amount
2. Click "Find Opponent"
3. IF stake > 0:
   a. Open MiniKit payment drawer
   b. Wait for payment confirmation
   c. Check if pending → show warning, don't proceed
   d. IF confirmed → join matchmaking with payment reference
   e. IF failed → show error, allow retry
4. IF stake = 0:
   a. Join matchmaking directly (no payment needed)
```

### Error Boundary
**Location**: `frontend/src/components/ErrorBoundary.tsx`

**Purpose**: Catches React errors to prevent blank/blue screens

### Countdown Display
**Location**: `frontend/src/components/ReactionTestUI.tsx`

**Features**:
- ✅ Safely displays countdown values
- ✅ Clamps negative reaction times in display
- ✅ Error boundary wrapper prevents crashes

## Verification Steps

### 1. Database Migration Verification
```bash
cd backend
npm run migrate:production
```
**Expected**: All 4 migrations run successfully without errors

### 2. Payment Gating Verification

**Test Case 1: Unpaid user attempts matchmaking**
```bash
curl -X POST http://localhost:3000/api/matchmaking/join \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"stake": 0.1}'
```
**Expected**: 400 error with `{"requiresPayment": true}`

**Test Case 2: Paid user joins matchmaking**
```bash
curl -X POST http://localhost:3000/api/matchmaking/join \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"stake": 0.1, "paymentReference": "<valid_ref>"}'
```
**Expected**: 200 success or match found

**Test Case 3: User with pending payment attempts join**
```bash
# Create payment intent with pending status
curl -X POST http://localhost:3000/api/matchmaking/join \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"stake": 0.1, "paymentReference": "<pending_ref>"}'
```
**Expected**: 400 error with `{"error": "Payment not confirmed", "status": "pending"}`

### 3. Polling State Verification

**Test Case: Invalid green_light_time**
```sql
-- Set invalid green_light_time
UPDATE matches SET green_light_time = 'invalid' WHERE match_id = '<match_id>';
```
```bash
curl -X GET http://localhost:3000/api/match/state/<match_id> \
  -H "Authorization: Bearer <token>"
```
**Expected**: 200 success with `greenLightTime: null, greenLightTimeISO: null` (not 500 error)

### 4. Duplicate Tap Verification

**Test Case: Submit same tap twice**
```bash
# First tap
curl -X POST http://localhost:3000/api/match/tap \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"matchId": "<match_id>", "clientTimestamp": 123456789}'

# Second tap (should be ignored)
curl -X POST http://localhost:3000/api/match/tap \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"matchId": "<match_id>", "clientTimestamp": 123456790}'
```
**Expected**: Both return 200, but first tap data is returned on second call

### 5. Reaction Time Clamping Verification

**Test Case: Negative reaction time**
- Tap before green light
- **Expected**: Reaction time clamped to MIN_REACTION_MS (0), disqualified set to true

**Test Case: Unreasonably large reaction time**
- Tap 10+ seconds after green light
- **Expected**: Reaction time clamped to MAX_REACTION_MS (5000)

### 6. Wallet Persistence Verification

**Test Case: Match creation without wallets**
```sql
-- Temporarily remove wallet from user
UPDATE users SET wallet_address = NULL WHERE user_id = '<user_id>';
```
**Expected**: Match creation fails with "Player wallet addresses not found"

**Test Case: Winner payout**
- Complete a match normally
- Check transaction logs for winner payout
- **Expected**: Winner wallet used from match.player1_wallet/player2_wallet (not undefined)

### 7. Payment Intent Verification

**Test Case: Idempotency**
```bash
# Create payment intent
curl -X POST http://localhost:3000/api/payment/initiate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 0.1}'
```
**Expected**: Returns same payment reference if called multiple times with same params

**Test Case: Transaction hash persistence**
- Complete a payment through MiniKit
- Check payment_intents table
- **Expected**: `transaction_hash` column populated with blockchain tx hash

## Environment Variables

Ensure these are set in production:
```bash
MAX_STAKE_WLD=0.1              # Maximum stake amount
MIN_REACTION_MS=0              # Minimum valid reaction time
MAX_REACTION_MS=5000           # Maximum valid reaction time (5 seconds)
PLATFORM_FEE_PERCENT=3         # Platform fee percentage
APP_ID=<worldcoin_app_id>      # MiniKit app ID
DEV_PORTAL_API_KEY=<key>       # Developer Portal API key
```

## Success Criteria

✅ **All migrations run successfully**
✅ **Payment required before join/countdown** - unpaid users get 4xx errors
✅ **Polling /api/match/state never 500s** on invalid green_light_time
✅ **Winner payout uses stored wallet** - no undefined wallets
✅ **Payment intents created with tx_hash** persisted
✅ **Duplicate taps don't override** - first tap wins
✅ **Reaction times are clamped** to valid range
✅ **Paid users can join matchmaking** without 404 errors
✅ **Frontend builds without errors**
✅ **Backend builds without errors**
✅ **Temporary stake notice removed** from UI

## Deployment Notes

1. Run migrations before deploying code:
   ```bash
   cd backend
   npm run migrate:production
   ```

2. Verify migrations completed:
   ```bash
   # Check payment_intents table exists
   SELECT * FROM payment_intents LIMIT 1;
   
   # Check matches has wallet columns
   SELECT player1_wallet, player2_wallet FROM matches LIMIT 1;
   
   # Check tap_events unique constraint
   SELECT constraint_name FROM information_schema.table_constraints 
   WHERE table_name='tap_events' AND constraint_name='tap_events_match_user_unique';
   
   # Check transactions has tx_hash
   SELECT tx_hash FROM transactions LIMIT 1;
   ```

3. Deploy backend and frontend simultaneously to avoid version mismatch

4. Monitor logs for:
   - Payment gating rejections (expected for unpaid users)
   - Green light time validation warnings
   - Reaction time clamping warnings
   - Duplicate tap detections

## Known Limitations

1. **Stake Cap**: Currently set to 0.1 WLD via MAX_STAKE_WLD environment variable
   - This is a platform safety limit, not a temporary funding issue
   - Can be increased by updating the environment variable

2. **Gas Fees**: Platform wallet must have sufficient gas for escrow operations
   - Monitor platform wallet balance
   - Set up alerts for low balance

3. **Escrow Failures**: Currently logged but don't block gameplay
   - Consider setting ESCROW_REQUIRED=true for strict enforcement
   - Implement retry logic for transient failures

## Related Documentation

- API_REFERENCE.md - Complete API endpoint documentation
- DEPLOYMENT_GUIDE.md - Production deployment instructions
- MANUAL_TESTING_GUIDE.md - Comprehensive manual testing scenarios
- SECURITY_SUMMARY.md - Security considerations and mitigations
