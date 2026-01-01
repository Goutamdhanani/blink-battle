# Match Lifecycle Sequence Diagrams

This document illustrates the complete match lifecycle with state transitions, escrow operations, and error handling.

## Overview

The match lifecycle follows this deterministic state machine:

```
MATCHED → FUNDING → READY → STARTED → COMPLETED/CANCELLED/REFUNDED
```

Each state has specific entry/exit conditions and guards to ensure reliable transitions.

---

## 1. Happy Path: Successful Match

```mermaid
sequenceDiagram
    participant P1 as Player 1
    participant P2 as Player 2
    participant BE as Backend
    participant Redis
    participant DB as Database
    participant Contract as Escrow Contract

    Note over P1,Contract: Phase 1: Matchmaking
    P1->>BE: join_matchmaking(stake: 1.0 WLD)
    BE->>Redis: Check active_match:player1
    Redis-->>BE: null (not in match)
    BE->>Redis: Add to queue
    BE-->>P1: matchmaking_queued

    P2->>BE: join_matchmaking(stake: 1.0 WLD)
    BE->>Redis: Check active_match:player2
    Redis-->>BE: null (not in match)
    BE->>Redis: Find match in queue
    Redis-->>BE: Player 1 found
    
    Note over BE: State: MATCHED
    BE->>DB: Create match record
    BE->>Redis: Mark players in active match
    BE-->>P1: match_found(opponent: P2)
    BE-->>P2: match_found(opponent: P1)

    Note over P1,Contract: Phase 2: Payment & Escrow (FUNDING)
    Note over BE: State: MATCHED → FUNDING
    P1->>BE: payment_confirmed(ref: tx1)
    BE->>DB: Verify payment
    DB-->>BE: Payment confirmed
    BE-->>P2: opponent_paid

    P2->>BE: payment_confirmed(ref: tx2)
    BE->>DB: Verify payment
    DB-->>BE: Payment confirmed
    
    Note over BE: Both players paid - verify escrow
    BE->>Contract: verifyEscrowOnChain(matchId)
    Contract-->>BE: Escrow verified ✓
    
    Note over BE: State: FUNDING → READY
    BE-->>P1: both_players_paid(escrowVerified: true)
    BE-->>P2: both_players_paid(escrowVerified: true)

    Note over P1,Contract: Phase 3: Ready & Start (READY → STARTED)
    P1->>BE: player_ready
    BE-->>P2: Player 1 ready
    
    P2->>BE: player_ready
    Note over BE: Check state guards
    Note over BE: ✓ Both ready, ✓ Both connected
    Note over BE: State: READY → STARTED
    
    BE->>Contract: lockFunds(matchId, P1, P2, stake)
    Contract-->>BE: Escrow created (tx: 0xabc)
    BE->>DB: Record stake transactions
    
    BE-->>P1: game_start(countdown: true)
    BE-->>P2: game_start(countdown: true)
    
    Note over P1,P2: Countdown: 3... 2... 1...
    BE-->>P1: signal(timestamp)
    BE-->>P2: signal(timestamp)

    Note over P1,Contract: Phase 4: Gameplay & Completion
    P1->>BE: player_tap(reactionMs: 234)
    P2->>BE: player_tap(reactionMs: 251)
    
    Note over BE: Determine winner (P1)
    BE->>Contract: completeMatch(matchId, winner: P1)
    Contract-->>BE: Winnings distributed (tx: 0xdef)
    BE->>DB: Update match status: COMPLETED
    
    Note over BE: State: STARTED → COMPLETED
    BE-->>P1: match_result(winnerId: P1)
    BE-->>P2: match_result(winnerId: P1)
    
    BE->>Redis: Clear active match tracking
```

---

## 2. Error Path: Payment Timeout

```mermaid
sequenceDiagram
    participant P1 as Player 1
    participant P2 as Player 2
    participant BE as Backend
    participant DB as Database
    participant Wallet as Platform Wallet

    Note over BE: State: MATCHED → FUNDING
    BE-->>P1: match_found(needsPayment: true)
    BE-->>P2: match_found(needsPayment: true)
    
    Note over BE: Start payment timeout (120s)
    
    P1->>BE: payment_confirmed
    BE->>DB: Record payment 1
    BE-->>P2: opponent_paid
    
    Note over P2: Player 2 never pays
    
    Note over BE: Timeout expires
    BE->>DB: Check payments
    DB-->>BE: Only 1 payment confirmed
    
    Note over BE: State: FUNDING → CANCELLED
    BE->>Wallet: Initiate refund for P1
    BE->>DB: Update match status: CANCELLED
    
    BE-->>P1: match_cancelled(reason: payment_timeout)
    BE-->>P2: match_cancelled(reason: payment_timeout)
    
    BE->>BE: cleanupMatch(matchId)
```

---

## 3. Error Path: Disconnect Before Signal

```mermaid
sequenceDiagram
    participant P1 as Player 1
    participant P2 as Player 2
    participant BE as Backend
    participant Contract as Escrow Contract

    Note over BE: State: READY
    P1->>BE: player_ready
    P2->>BE: player_ready
    
    Note over BE: State: READY → STARTED
    BE->>Contract: lockFunds(matchId)
    Contract-->>BE: Escrow created ✓
    
    BE-->>P1: game_start
    BE-->>P2: game_start
    
    Note over P1: Player 1 disconnects
    P1-xBE: disconnect
    
    Note over BE: Mark P1 disconnected
    BE-->>P2: opponent_disconnected(gracePeriod: 30s)
    
    Note over BE: Start timeout (30s)
    
    alt Player reconnects within grace period
        P1->>BE: rejoin_match
        BE-->>P1: match_found(reconnected: true)
        Note over BE: Continue game
    else Timeout expires
        Note over BE: Signal not sent yet → refund
        BE->>Contract: cancelMatch(matchId)
        Contract-->>BE: Refund completed
        
        Note over BE: State: STARTED → REFUNDED
        BE-->>P2: opponent_disconnected(refund: true)
        BE->>BE: cleanupMatch(matchId)
    end
```

---

## 4. Error Path: Disconnect After Signal

```mermaid
sequenceDiagram
    participant P1 as Player 1
    participant P2 as Player 2
    participant BE as Backend
    participant Contract as Escrow Contract

    Note over BE: State: STARTED
    BE-->>P1: signal(timestamp)
    BE-->>P2: signal(timestamp)
    
    P2->>BE: player_tap(reactionMs: 198)
    
    Note over P1: Player 1 disconnects after signal
    P1-xBE: disconnect
    
    Note over BE: Start timeout (30s)
    BE-->>P2: opponent_disconnected(gracePeriod: 30s)
    
    alt Player reconnects and taps
        P1->>BE: rejoin_match
        P1->>BE: player_tap
        Note over BE: Determine winner normally
    else Timeout expires
        Note over BE: Signal was sent → P2 wins by default
        BE->>Contract: completeMatch(matchId, winner: P2)
        Contract-->>BE: Winnings distributed
        
        Note over BE: State: STARTED → COMPLETED
        BE-->>P2: opponent_disconnected(win: true)
    end
```

---

## 5. Reconnection Flow

```mermaid
sequenceDiagram
    participant Client
    participant BE as Backend
    participant Redis
    participant SM as State Machine

    Client->>BE: rejoin_match(userId, matchId)
    
    BE->>Redis: Get active_match:userId
    Redis-->>BE: matchId found
    
    BE->>BE: Get activeMatch from memory
    
    alt Match not found
        BE-->>Client: rejoin_failed(match_not_found)
    else Match found
        Note over BE: Check reconnect attempts
        BE->>BE: reconnectAttempts.get(userId)
        
        alt Exceeded max (5)
            BE-->>Client: error(MAX_RECONNECTS_EXCEEDED)
            BE->>BE: cancelMatchAndRefund
        else Within limit
            BE->>BE: Update socketId
            BE->>Redis: Register new socket
            
            Note over BE: Wait for stabilization (500ms)
            
            BE->>SM: Get current state
            SM-->>BE: state, escrowStatus
            
            BE-->>Client: match_found(reconnected: true, state, escrowStatus)
            
            opt Player was ready before disconnect
                BE-->>Client: player_ready_restored
            end
            
            opt Signal already sent
                BE-->>Client: signal(timestamp, reconnected: true)
            end
        end
    end
```

---

## 6. State Machine Transitions

```mermaid
stateDiagram-v2
    [*] --> MATCHED: Players matched

    MATCHED --> FUNDING: Paid match
    MATCHED --> READY: Free match
    MATCHED --> CANCELLED: Matchmaking cancelled

    FUNDING --> READY: Both paid & escrow verified
    FUNDING --> CANCELLED: Payment timeout
    FUNDING --> REFUNDED: Partial payment

    READY --> STARTED: Both ready & connected
    READY --> CANCELLED: Disconnect before start
    READY --> REFUNDED: Cancel and refund

    STARTED --> COMPLETED: Winner determined
    STARTED --> CANCELLED: Both timeout
    STARTED --> REFUNDED: Both false start

    COMPLETED --> [*]
    CANCELLED --> [*]
    REFUNDED --> [*]

    note right of FUNDING
        Guards:
        - player1Staked
        - player2Staked
        - escrowVerified
    end note

    note right of READY
        Guards:
        - player1Ready
        - player2Ready
        - player1Connected
        - player2Connected
    end note
```

---

## 7. Escrow Operation Flow

```mermaid
sequenceDiagram
    participant BE as Backend
    participant In-Flight as Idempotency Map
    participant DB as Database
    participant Contract as Escrow Contract

    Note over BE: Operation: lockFunds(matchId)
    
    BE->>In-Flight: Check operation key
    
    alt Operation in progress
        In-Flight-->>BE: Wait for existing operation
        Note over BE: Idempotency - return existing result
    else New operation
        BE->>In-Flight: Add operation key
        
        BE->>Contract: verifyEscrowOnChain(matchId)
        Contract-->>BE: Check if already exists
        
        alt Escrow exists
            BE->>DB: Get existing transaction
            DB-->>BE: tx_hash
            BE->>In-Flight: Remove operation key
            BE-->>BE: Return {success: true, txHash}
        else Create new escrow
            BE->>Contract: createMatch(matchId, p1, p2, stake)
            Contract-->>BE: Transaction hash
            
            BE->>DB: Record stake transactions
            DB-->>BE: Transactions created
            
            BE->>In-Flight: Remove operation key
            BE-->>BE: Return {success: true, txHash}
        end
    end
```

---

## State Invariants

### MATCHED State
- **Invariants:**
  - Match exists in database
  - Players marked in Redis active_match
  - Both players have registered sockets

### FUNDING State
- **Entry Conditions:**
  - Stake > 0 (not free match)
- **Invariants:**
  - Payment timeout active
  - Tracking player1Staked, player2Staked
- **Exit Conditions:**
  - Both players paid AND escrow verified → READY
  - Payment timeout → CANCELLED
  - Partial payment + timeout → REFUNDED

### READY State
- **Entry Conditions:**
  - Free match OR (both paid AND escrow verified)
- **Invariants:**
  - Escrow funded (for paid matches)
  - Match start timeout active
- **Exit Conditions:**
  - Both ready AND both connected → STARTED
  - Disconnect or timeout → CANCELLED/REFUNDED

### STARTED State
- **Entry Conditions:**
  - Guards passed (both ready, both connected)
  - Escrow locked on-chain
- **Invariants:**
  - Signal will be sent within 2-5 seconds
  - Reaction timeout active (3 seconds post-signal)
- **Exit Conditions:**
  - Valid winner determined → COMPLETED
  - Both timeout or both false start → CANCELLED/REFUNDED
  - Disconnect → COMPLETED (other player wins) or REFUNDED (before signal)

### Terminal States (COMPLETED, CANCELLED, REFUNDED)
- **Invariants:**
  - No further transitions allowed
  - Redis tracking cleared
  - All timeouts cancelled

---

## Error Handling Matrix

| Scenario | State | Action | Next State |
|----------|-------|--------|------------|
| Payment timeout | FUNDING | Cancel + refund paid players | CANCELLED |
| Escrow verify fail | FUNDING | Cancel + refund | CANCELLED |
| Disconnect before signal | STARTED | Wait 30s, then refund | REFUNDED |
| Disconnect after signal | STARTED | Wait 30s, other player wins | COMPLETED |
| Both false start (1st) | STARTED | Rematch | STARTED |
| Both false start (2nd) | STARTED | Refund with fee | CANCELLED |
| Max reconnects exceeded | ANY | Cancel + refund | CANCELLED |
| Escrow creation fails | READY | Cancel + refund | CANCELLED |
| Contract tx reverts | ANY | Retry or refund | CANCELLED/REFUNDED |

---

## Metrics and Observability

### Key Events to Track
1. `match_created` - Match entered MATCHED state
2. `match_state_transition` - Any state change with from/to
3. `payment_received` - Player payment confirmed
4. `escrow_verified` - On-chain verification passed
5. `player_ready` - Player marked ready
6. `game_started` - Signal sent
7. `match_completed` - Winner determined
8. `match_cancelled` - Match cancelled at any stage
9. `refund_initiated` / `refund_completed` - Refund flow
10. `player_disconnected` / `player_reconnected` - Connection events

### Correlation IDs
Every match has a correlation ID for tracing:
```
match_${matchId}_${timestamp}
```

This allows full lifecycle tracing in logs:
```bash
grep "correlationId.*match_abc123" logs/production.log
```

---

## Additional Resources

- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
- [Operator Runbook](./OPERATOR_RUNBOOK.md)
- [API Reference](./API_REFERENCE.md)
