# Treasury-Based Payment Architecture

## Overview

This document describes the treasury-based payment architecture implemented to solve the "Get Ready screen stuck" issue caused by gas failures in the on-chain escrow contract.

## The Problem

**Original Issue:**
```
Both devices get stuck on "Get Ready" screen because:
1. Platform wallet runs out of gas for escrow contract calls
2. Escrow creation fails mid-match
3. /api/match/ready returns 400
4. Game never starts

From logs:
insufficient funds for gas * price + value: balance 92031272507, tx cost 97483375460, overshot 5452102953
[Escrow] Failed to create match on-chain: insufficient funds for intrinsic transaction cost
```

## The Solution

The treasury-based architecture removes ALL on-chain transactions during gameplay, deferring them to a post-game claim flow.

### Architecture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 1: DEPOSIT (Before Match)              │
└─────────────────────────────────────────────────────────────────┘
Player → World Pay → Treasury Wallet
         ↓
    deposits table: {user_id, wallet, amount, tx_hash, status}

┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 2: MATCH (Off-Chain)                   │
└─────────────────────────────────────────────────────────────────┘
Players compete normally
         ↓
Backend determines winner (NO blockchain calls)
         ↓
    matches table updated: {winner_wallet, claim_deadline, claim_status}
    match_results: {match_id, winner, loser, stake}

┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 3: CLAIM (After Match)                  │
└─────────────────────────────────────────────────────────────────┘
Winner → "Claim Winnings" button
         ↓
Backend validates and sends payout from treasury
         ↓
    claims table: {claim_id, match_id, wallet, amount, tx_hash}
         ↓
WLD tokens transferred: Treasury → Winner
```

## Database Schema

### deposits table
```sql
CREATE TABLE deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  wallet_address VARCHAR(42) NOT NULL,
  amount DECIMAL(18,8) NOT NULL,
  tx_hash VARCHAR(66) UNIQUE NOT NULL,
  payment_reference VARCHAR(64) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, used, refunded
  match_id UUID REFERENCES matches(match_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ
);
```

### claims table
```sql
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(match_id),
  winner_wallet VARCHAR(42) NOT NULL,
  amount DECIMAL(18,8) NOT NULL,
  platform_fee DECIMAL(18,8) NOT NULL,
  net_payout DECIMAL(18,8) NOT NULL,
  tx_hash VARCHAR(66),
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  idempotency_key VARCHAR(128) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  
  CONSTRAINT unique_match_claim UNIQUE (match_id)
);
```

### matches table (new columns)
```sql
ALTER TABLE matches ADD COLUMN
  winner_wallet VARCHAR(42),
  loser_wallet VARCHAR(42),
  claim_deadline TIMESTAMPTZ,
  claim_status VARCHAR(20) DEFAULT 'unclaimed', -- unclaimed, claimed, expired
  result_finalized_at TIMESTAMPTZ;
```

## API Endpoints

### POST /api/claim
Claim winnings for a completed match.

**Request:**
```json
{
  "matchId": "uuid"
}
```

**Response (Success):**
```json
{
  "success": true,
  "txHash": "0x...",
  "amount": "194000000000000000",
  "amountFormatted": "0.194 WLD"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Already claimed" | "Not the winner" | "Claim expired"
}
```

### GET /api/claim/status/:matchId
Get claim status and eligibility.

**Response:**
```json
{
  "matchId": "uuid",
  "claimable": true,
  "isWinner": true,
  "winnerWallet": "0x...",
  "amount": "194000000000000000",
  "amountFormatted": "0.194 WLD",
  "deadline": "2026-01-04T11:46:00Z",
  "status": "unclaimed" | "processing" | "claimed" | "expired",
  "txHash": "0x...",
  "deadlineExpired": false
}
```

## Security Features

### 1. Idempotency
```typescript
const idempotencyKey = `claim:${matchId}:${wallet.toLowerCase()}`;
// Check before processing, return existing result if found
```

### 2. Race Condition Prevention
```sql
-- Always use FOR UPDATE when checking claim status
SELECT * FROM matches WHERE match_id = $1 FOR UPDATE;
```

### 3. Wallet Verification
```typescript
if (match.winner_wallet.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
  throw new Error('Not authorized to claim');
}
```

### 4. Double-Claim Prevention
```sql
ALTER TABLE claims ADD CONSTRAINT unique_match_claim UNIQUE (match_id);
```

### 5. Integer Math Only
```typescript
// NEVER use floating point for money
const stakeWei = BigInt(Math.floor(match.stake * 1e18));
const totalPool = stakeWei * 2n;
const platformFee = (totalPool * 300n) / 10000n; // 3% fee
const netPayout = totalPool - platformFee;
```

### 6. Deadline Enforcement
```typescript
const deadline = new Date(match.claim_deadline);
const gracePeriodMs = 60000; // 1 minute grace
if (now.getTime() > deadline.getTime() + gracePeriodMs) {
  throw new Error('Claim window expired');
}
```

### 7. Rate Limiting
Claims endpoint uses the existing `matchRateLimiter` (100 req/min per user).

## Code Changes

### Backend

**New Files:**
- `backend/src/controllers/claimController.ts` - Claim endpoint logic
- `backend/src/services/treasuryService.ts` - Treasury wallet management
- `backend/src/models/Claim.ts` - Claim data model
- `backend/src/models/Deposit.ts` - Deposit data model
- `backend/src/config/migrations/006_treasury_tables.ts` - Database migration

**Modified Files:**
- `backend/src/controllers/pollingMatchmakingController.ts` - Removed escrow calls
- `backend/src/controllers/pollingMatchController.ts` - Sets winner_wallet, claim_deadline
- `backend/src/index.ts` - Added claim routes
- `backend/src/models/types.ts` - Added treasury fields to Match type

### Frontend

**New Files:**
- `frontend/src/services/claimService.ts` - Claim API client

**Modified Files:**
- `frontend/src/components/ResultScreen.tsx` - Added claim button and status

## Environment Variables

Add these to your `.env` file:

```bash
# Treasury Wallet Configuration (REQUIRED for payouts)
TREASURY_PRIVATE_KEY=<your_private_key_here>

# WLD Token Contract (World Chain Mainnet)
WLD_TOKEN_ADDRESS=0x2cFc85d8E48F8EAB294be644d9E25C3030863003

# RPC Endpoint
WORLD_CHAIN_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public

# Optional: Platform fee (default: 3%)
PLATFORM_FEE_PERCENT=3
```

## Deployment Steps

### 1. Run Database Migration
```bash
cd backend
npm run migrate:production up
```

This will create:
- `deposits` table
- `claims` table  
- New columns in `matches` table

### 2. Configure Treasury Wallet
1. Generate a new wallet for the treasury (or use existing)
2. Fund it with WLD tokens
3. Set `TREASURY_PRIVATE_KEY` in environment variables

### 3. Test Locally
```bash
# Backend
cd backend
npm run dev

# Frontend
cd frontend
npm run dev
```

### 4. Deploy to Production
```bash
# Build
npm run build

# Deploy (follow your deployment process)
```

## Monitoring

### Check Treasury Balance
```typescript
import { TreasuryService } from './services/treasuryService';

const balance = await TreasuryService.getBalance();
console.log(`Treasury balance: ${TreasuryService.formatWLD(balance)} WLD`);
```

### Monitor Claims
```sql
-- Pending claims
SELECT * FROM claims WHERE status = 'pending' ORDER BY created_at DESC;

-- Failed claims
SELECT * FROM claims WHERE status = 'failed' ORDER BY created_at DESC;

-- Claims by status
SELECT status, COUNT(*) FROM claims GROUP BY status;
```

### Check Unclaimed Winnings
```sql
-- Matches with unclaimed winnings
SELECT 
  m.match_id, 
  m.winner_id, 
  m.winner_wallet,
  m.stake,
  m.claim_deadline,
  m.completed_at
FROM matches m
WHERE m.stake > 0 
  AND m.claim_status = 'unclaimed'
  AND m.winner_id IS NOT NULL
ORDER BY m.completed_at DESC;
```

## Benefits

✅ **No Gas Failures** - Zero blockchain calls during match creation
✅ **Faster Matches** - Players can start immediately after payment
✅ **Better UX** - No stuck "Get Ready" screens
✅ **Lower Costs** - Only one blockchain tx per match (the payout)
✅ **Scalable** - Can handle high match volume without gas issues
✅ **Secure** - Comprehensive security features prevent exploits

## Trade-offs

⚠️ **Trust Required** - Players must trust platform to pay out (mitigated by claim deadline)
⚠️ **Manual Claims** - Winners must actively claim (could add auto-claim later)
⚠️ **Treasury Management** - Platform must maintain WLD balance

## Future Enhancements

1. **Auto-claim** - Automatically claim after deadline for user
2. **Batch Payouts** - Process multiple claims in one transaction
3. **Claim Notifications** - Push notifications when winnings are claimable
4. **Treasury Monitoring** - Alerts when balance gets low
5. **Claim History** - UI to view all past claims
