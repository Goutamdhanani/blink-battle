# Payment Architecture Documentation

## Overview

Blink Battle uses a **Treasury-Based Payment Model** for match stakes and payouts. This architecture decouples on-chain transactions from gameplay flow, preventing game delays caused by blockchain confirmation times.

## Architecture Principles

### 1. Off-Chain Game Flow
- Matches start immediately after matchmaking, regardless of on-chain transaction status
- Players can mark ready and play the game while payments are being processed
- Game state is tracked entirely in the PostgreSQL database

### 2. Payment Intent Tracking
- Every payment generates a `payment_intent` record with a unique `payment_reference`
- Payment intents track the full lifecycle: `pending` → `confirmed` → `settled`/`failed`
- MiniKit transaction IDs are linked to payment intents for verification

### 3. Asynchronous Payment Verification
- **Payment Worker** runs every 10 seconds to verify transactions with World Developer Portal
- Uses row-level database locking (`FOR UPDATE SKIP LOCKED`) to prevent race conditions
- Implements exponential backoff retry for transient failures
- Automatically expires stale payments (no transaction ID after 5 minutes)

### 4. Claim-Based Payouts
- Winners don't receive automatic on-chain payouts
- Instead, matches record `winner_wallet`, `claim_deadline`, and `claim_status`
- Winners must actively claim winnings via `/api/claim` endpoint within deadline (1 hour)
- Unclaimed winnings revert to treasury after deadline expires

## Payment Flow Diagrams

### Staked Match Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PLAYER JOURNEY                               │
└─────────────────────────────────────────────────────────────────────┘

1. Player initiates payment
   POST /api/initiate-payment { stake: 0.5 }
   ↓
   Creates payment_intent (status: pending, no transaction_id yet)

2. Player completes MiniKit payment
   Frontend: MiniKit.pay()
   ↓
   POST /api/confirm-payment { payment_reference, minikit_transaction_id }
   ↓
   Updates payment_intent with transaction_id

3. Payment Worker verifies (async, every 10s)
   Developer Portal API: GET /transaction/{minikit_transaction_id}
   ↓
   Normalizes status: pending/mined/failed
   ↓
   Updates payment_intent (normalized_status, transaction_hash)

4. Player joins matchmaking
   POST /api/matchmaking/join { stake, payment_reference }
   ↓
   Verifies payment_intent is confirmed
   ↓
   Creates match_queue entry

5. Match found
   Both players have confirmed payments
   ↓
   Creates match (status: pending, links payment_intents)
   ↓
   Sets player1_staked=true, player2_staked=true

6. Game plays out
   Ready → Countdown → Tap → Winner determined
   ↓
   Match completes (status: completed)
   ↓
   Sets winner_wallet, claim_deadline (1 hour from now)

7. Winner claims payout
   POST /api/claim { match_id }
   ↓
   Verifies claim deadline not expired
   ↓
   Initiates on-chain payout via MiniKit.pay()
   ↓
   Updates claim_status: claimed, sets claim_tx_hash
```

### Free Match Flow (No Stakes)

```
1. Player joins matchmaking
   POST /api/matchmaking/join { stake: 0 }
   ↓
   Creates match_queue entry (no payment_reference needed)

2. Match found
   ↓
   Creates match (status: pending, no payment tracking)

3. Game plays out
   Ready → Countdown → Tap → Winner determined
   ↓
   Match completes (status: completed)
   ↓
   No claim_deadline set (free match, no payout)
```

## Database Schema

### payment_intents Table

```sql
CREATE TABLE payment_intents (
  intent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_reference VARCHAR(255) UNIQUE NOT NULL,  -- Idempotency key
  user_id UUID NOT NULL REFERENCES users(user_id),
  match_id UUID REFERENCES matches(match_id),      -- Linked after match created
  amount NUMERIC(18, 8) NOT NULL,                  -- Amount in WLD
  
  -- MiniKit fields
  minikit_transaction_id VARCHAR(255),             -- From MiniKit.pay() response
  transaction_hash VARCHAR(66),                    -- On-chain tx hash (0x...)
  raw_status VARCHAR(50),                          -- From Developer Portal
  normalized_status VARCHAR(50) DEFAULT 'pending', -- pending/confirmed/failed/cancelled
  
  -- Processing tracking
  locked_at TIMESTAMPTZ,                           -- Worker lock timestamp
  locked_by VARCHAR(255),                          -- Worker ID holding lock
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,                       -- Exponential backoff
  last_error TEXT,
  
  -- Refund tracking (Issue #6)
  refund_status VARCHAR(50) DEFAULT 'none',        -- none/eligible/claimed/expired
  refund_amount NUMERIC(18, 8),
  refund_reason VARCHAR(255),
  refund_deadline TIMESTAMPTZ,
  refund_tx_hash VARCHAR(66),
  refund_claimed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX idx_payment_intents_status ON payment_intents(normalized_status);
CREATE INDEX idx_payment_intents_user ON payment_intents(user_id);
CREATE INDEX idx_payment_intents_match ON payment_intents(match_id);
CREATE INDEX idx_payment_intents_tx ON payment_intents(minikit_transaction_id);
CREATE INDEX idx_payment_intents_retry ON payment_intents(next_retry_at) WHERE normalized_status = 'pending';
```

### matches Table (Payment Fields)

```sql
-- Payment tracking columns
player1_staked BOOLEAN DEFAULT false,         -- Player 1 paid stake
player2_staked BOOLEAN DEFAULT false,         -- Player 2 paid stake
player1_stake_tx VARCHAR(66),                 -- Player 1 transaction hash
player2_stake_tx VARCHAR(66),                 -- Player 2 transaction hash
player1_wallet VARCHAR(42),                   -- Stored at match creation
player2_wallet VARCHAR(42),                   -- Stored at match creation

-- Treasury claim fields
winner_wallet VARCHAR(42),                    -- Set when winner determined
loser_wallet VARCHAR(42),                     -- Set when winner determined
claim_deadline TIMESTAMPTZ,                   -- 1 hour from match completion
claim_status VARCHAR(50),                     -- unclaimed/claimed/expired
result_finalized_at TIMESTAMPTZ,              -- When winner was determined

-- Refund tracking
refund_processed BOOLEAN DEFAULT false,       -- Refund transaction completed
cancelled BOOLEAN DEFAULT false,              -- Match cancelled/abandoned
cancellation_reason VARCHAR(255)              -- Why match was cancelled
```

## Payment Status Normalization

The Developer Portal can return various transaction statuses. We normalize them to 4 canonical states:

| Raw Status | Normalized Status | Description |
|------------|------------------|-------------|
| initiated, authorized, broadcast, pending, pending_confirmation, submitted | `pending` | Transaction submitted but not confirmed |
| mined, confirmed, success | `confirmed` | Transaction confirmed on-chain |
| failed, error, rejected | `failed` | Transaction failed permanently |
| expired, cancelled, canceled, declined | `cancelled` | Transaction cancelled by user or system |

Any unknown status defaults to `pending` for safety (conservative approach).

## Worker Processing

### Payment Worker Cycle

```typescript
// Every 10 seconds:
1. Expire stale payments (no transaction_id after 5 minutes)
   UPDATE payment_intents SET normalized_status = 'failed'
   WHERE minikit_transaction_id IS NULL
     AND created_at < NOW() - INTERVAL '5 minutes'

2. Lock next batch of pending payments (up to 10)
   UPDATE payment_intents SET locked_at = NOW(), locked_by = 'worker-{id}'
   WHERE normalized_status = 'pending'
     AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '60 seconds')
     AND (next_retry_at IS NULL OR next_retry_at <= NOW())
   ORDER BY next_retry_at NULLS FIRST, created_at ASC
   LIMIT 10
   FOR UPDATE SKIP LOCKED

3. For each locked payment:
   a. If no transaction_id yet: release lock, skip (user hasn't completed MiniKit flow)
   b. Call Developer Portal API: GET /transaction/{transaction_id}
   c. Extract status and transaction hash
   d. Normalize status
   e. Update payment_intent record
   f. Release lock

4. Handle errors:
   - API 404: Mark as failed (transaction not found)
   - API timeout: Schedule retry with exponential backoff
   - API error: Schedule retry with exponential backoff
```

### Exponential Backoff

```typescript
retry_delay = min(base_delay * 2^retry_count, max_delay)
base_delay = 5 seconds
max_delay = 300 seconds (5 minutes)

Retry Schedule:
- Retry 1: 5s
- Retry 2: 10s
- Retry 3: 20s
- Retry 4: 40s
- Retry 5: 80s (1m 20s)
- Retry 6: 160s (2m 40s)
- Retry 7+: 300s (5m) - capped
```

## Idempotency & Safety

### Payment Intents
- **Idempotency Key**: `payment_reference` (UUID generated by client)
- **Constraint**: UNIQUE constraint on `payment_reference`
- **Behavior**: If duplicate `payment_reference`, return existing intent (no duplicate payment)

### Match Creation
- **Idempotency Key**: `idempotency_key` (optional, passed by matchmaking)
- **Behavior**: If duplicate key, return existing match (no duplicate match)

### Worker Locking
- **Row-Level Locks**: `FOR UPDATE SKIP LOCKED` prevents concurrent processing
- **Lock Timeout**: 60 seconds (if worker crashes, lock auto-releases)
- **Single Processing**: One worker processes one payment at a time
- **Crash Safety**: No open transaction during RPC calls (lock released immediately after)

## Error Handling

### Payment Verification Failures

```
├── API Unreachable (network partition)
│   └── Action: Schedule retry with backoff, keep payment pending
│
├── API 404 (transaction not found)
│   └── Action: Mark payment as failed, release lock
│
├── API Timeout
│   └── Action: Schedule retry with backoff
│
├── Transaction Pending (status: pending/broadcast/etc)
│   └── Action: Keep as pending, schedule next check
│
├── Transaction Confirmed but Missing Hash (Issue #4)
│   └── Action: Keep as pending, retry to fetch hash in next cycle
│
└── Transaction Failed
    └── Action: Mark as failed, notify user, offer refund
```

### Match Abandonment

```
├── Player disconnects > 30 seconds
│   └── Action: Disconnect checker marks player as disconnected
│
├── Match stuck in pending > 30 minutes
│   └── Action: Match timeout job cancels match, initiates refunds
│
└── Player never completes payment
    └── Action: Payment worker expires after 5 minutes, removes from queue
```

## Security Considerations

### Payment Verification
- ✅ All payment status verified with Developer Portal (trusted source)
- ✅ Transaction hashes stored for audit trail
- ✅ Payment amounts validated against match stakes
- ✅ Winner wallet validated (must be one of the match players)

### Anti-Fraud Measures
- ✅ Idempotency keys prevent double-payment
- ✅ Claim deadlines prevent indefinite fund lock
- ✅ Unclaimed winnings revert to treasury
- ✅ Refunds only for cancelled/abandoned matches
- ✅ Player disconnection auto-forfeits after timeout

### Audit Trail
```sql
-- Complete payment history
SELECT * FROM payment_intents WHERE user_id = ? ORDER BY created_at DESC;

-- Match payment tracking
SELECT * FROM matches m
JOIN payment_intents pi ON pi.match_id = m.match_id
WHERE m.match_id = ?;

-- Claim history
SELECT * FROM claims WHERE match_id = ?;

-- Refund history
SELECT * FROM payment_intents WHERE refund_status != 'none';
```

## Monitoring & Alerts

### Key Metrics

1. **Payment Processing Latency**
   - Time from payment initiation to confirmation
   - Alert if > 2 minutes (95th percentile)

2. **Payment Success Rate**
   - % of payments that reach `confirmed` status
   - Alert if < 95%

3. **Payment Expiration Rate**
   - % of payments that expire (no transaction_id after 5 min)
   - Alert if > 5%

4. **Worker Processing Time**
   - Time to process each payment in worker cycle
   - Alert if > 1 second average

5. **Claim Success Rate**
   - % of winners who successfully claim
   - Alert if < 80%

6. **Unclaimed Winnings Amount**
   - Total WLD in expired unclaimed matches
   - Monitor for revenue recovery

### Health Checks

```bash
# Payment worker health
GET /health/payment-worker
→ { running: true, last_cycle: "2025-01-03T12:00:00Z", processed: 42, errors: 0 }

# Pending payments count
SELECT COUNT(*) FROM payment_intents WHERE normalized_status = 'pending';
→ Alert if > 100

# Stuck payments (pending > 10 minutes)
SELECT COUNT(*) FROM payment_intents 
WHERE normalized_status = 'pending' 
  AND minikit_transaction_id IS NOT NULL
  AND updated_at < NOW() - INTERVAL '10 minutes';
→ Alert if > 10

# Unclaimed matches expiring soon
SELECT COUNT(*) FROM matches
WHERE claim_status = 'unclaimed'
  AND claim_deadline < NOW() + INTERVAL '5 minutes';
→ Monitor for user notification
```

## Future Improvements

### Phase 1: Robustness
- [ ] Add circuit breaker for Developer Portal API (Issue #15)
- [ ] Implement distributed Redis locks for multi-instance safety (Issue #5)
- [ ] Add payment status webhooks from World (push instead of poll)

### Phase 2: Performance
- [ ] Cache confirmed payment statuses (reduce API calls)
- [ ] Batch payment verifications (check multiple in one API call)
- [ ] Add payment worker horizontal scaling (multiple workers)

### Phase 3: User Experience
- [ ] Real-time payment status updates via WebSocket
- [ ] Push notifications when payment confirmed
- [ ] Email notifications for claim deadlines
- [ ] Automatic retry UI for failed payments

### Phase 4: Analytics
- [ ] Payment funnel tracking (initiate → confirm → verify → complete)
- [ ] Conversion rate optimization
- [ ] Failed payment analysis and recovery
- [ ] Revenue reporting dashboard

## Related Issues

This architecture addresses the following logged issues:

- ✅ **Issue #1**: Incomplete payment flows - handled by `expireStalePayments`
- ✅ **Issue #3**: Ready flow blocking - fixed by allowing `pending` matches
- ✅ **Issue #4**: Missing transaction hashes - now retries until hash is available
- 🔄 **Issue #6**: Payment timeout handling - partially implemented
- ✅ **Issue #9**: Payment architecture documentation - this document
- 🔄 **Issue #16**: Duplicate payment prevention - implemented via idempotency key

## References

- [World Developer Portal API Docs](https://docs.world.org/)
- [MiniKit SDK Documentation](https://docs.world.org/minikit)
- [PostgreSQL Row-Level Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Idempotency Patterns](https://stripe.com/docs/api/idempotent_requests)
