# Operator Runbook: Blink Battle Multiplayer

This runbook provides troubleshooting guides for common production issues with the hardened matchmaking and escrow system.

## Table of Contents
1. [Match Lifecycle Issues](#match-lifecycle-issues)
2. [Escrow and Payment Problems](#escrow-and-payment-problems)
3. [Connection and Socket Issues](#connection-and-socket-issues)
4. [Monitoring and Diagnostics](#monitoring-and-diagnostics)

---

## Match Lifecycle Issues

### Issue: Matches stuck in FUNDING state

**Symptoms:**
- Matches remain in "waiting for payment" indefinitely
- Players report payment completed but match doesn't progress
- Database shows match in `pending` status with `waitingForStakes = true`

**Diagnosis:**
```bash
# Check match status via API
curl -H "Authorization: Bearer $JWT_TOKEN" \
  https://api.blumea.me/api/matches/$MATCH_ID/status

# Check Redis for active match tracking
redis-cli GET "active_match:$USER_ID"

# Check transaction records
psql $DATABASE_URL -c "SELECT * FROM transactions WHERE match_id = '$MATCH_ID';"
```

**Common Causes:**
1. Payment confirmed but `payment_confirmed` socket event not fired
2. One player paid but other player disconnected before paying
3. Escrow verification failed but frontend not notified

**Resolution:**
1. Check if both payments exist in database:
   ```sql
   SELECT * FROM payments WHERE match_id = '$MATCH_ID' AND status = 'confirmed';
   ```
2. If both paid but match stuck, manually trigger escrow verification:
   - Restart backend to trigger reconnection flow
   - Or use admin endpoint (if implemented) to force verification
3. If only one player paid and timeout exceeded (>2 minutes):
   - Match should auto-cancel via `STAKE_DEPOSIT_TIMEOUT_MS`
   - Verify `match_cancelled` event was emitted
   - Check refund status for paid player

**Prevention:**
- Monitor `STAKE_DEPOSIT_TIMEOUT_MS` alerts
- Track `match_created` vs `escrow_verified` event ratio
- Alert on matches stuck in FUNDING for >3 minutes

---

### Issue: Match cancelled but refund not processed

**Symptoms:**
- Match shows status `cancelled` or `refunded`
- Players report not receiving refunds
- Escrow contract still holds funds

**Diagnosis:**
```bash
# Check match and transaction status
curl -H "Authorization: Bearer $JWT_TOKEN" \
  https://api.blumea.me/api/matches/$MATCH_ID

# Check on-chain escrow state
cast call $ESCROW_CONTRACT "getMatch(bytes32)" $(cast --to-bytes32 $MATCH_ID) \
  --rpc-url $WORLD_CHAIN_RPC_URL

# Check server logs for refund failures
grep "REFUND_FAILED.*$MATCH_ID" logs/production.log
```

**Common Causes:**
1. No escrow exists on-chain (payments stayed in platform wallet)
2. Partial stakes only (one player paid, other didn't)
3. Contract `cancelMatch` requires both stakes but only one deposited
4. Gas issues or RPC failure during refund transaction

**Resolution:**

**Case 1: No on-chain escrow** (`noEscrow: true` in response)
- Funds are in platform wallet
- Manual refund required from platform wallet to player wallets
- Document in failed_refunds table for tracking

**Case 2: Partial stakes**
- Verify which player(s) paid: 
  ```sql
  SELECT from_wallet, amount, tx_hash FROM transactions 
  WHERE match_id = '$MATCH_ID' AND type = 'stake';
  ```
- Refund platform wallet deposits manually if stakes didn't reach contract

**Case 3: Contract refund failed**
- Check contract state:
  ```bash
  cast call $ESCROW_CONTRACT "getMatch(bytes32)" \
    $(cast --to-bytes32 $MATCH_ID) --rpc-url $WORLD_CHAIN_RPC_URL
  ```
- If both stakes deposited, retry `cancelMatch`:
  ```bash
  cast send $ESCROW_CONTRACT "cancelMatch(bytes32)" \
    $(cast --to-bytes32 $MATCH_ID) \
    --private-key $BACKEND_PRIVATE_KEY \
    --rpc-url $WORLD_CHAIN_RPC_URL
  ```

**Prevention:**
- Implement failed_refunds database table to track all refund failures
- Alert on `[REFUND_FAILED]` log entries
- Monitor escrow contract events vs database records for discrepancies

---

## Escrow and Payment Problems

### Issue: Escrow verification fails after both players paid

**Symptoms:**
- Both players report payment successful
- Match transitions to FUNDING but fails at verification
- Error: "Escrow verification failed" or "No on-chain escrow found"

**Diagnosis:**
```bash
# Verify payments in database
psql $DATABASE_URL -c "
  SELECT * FROM payments 
  WHERE match_id = '$MATCH_ID' AND status = 'confirmed';
"

# Check if escrow contract was called
grep "EscrowService.*lockFunds.*$MATCH_ID" logs/production.log

# Verify on-chain match state
cast call $ESCROW_CONTRACT "getMatch(bytes32)" \
  $(cast --to-bytes32 $MATCH_ID) --rpc-url $WORLD_CHAIN_RPC_URL
```

**Common Causes:**
1. `lockFunds` never called (logic error or crash before escrow creation)
2. `createMatch` transaction failed but not logged properly
3. RPC endpoint issue (timeout, rate limit)
4. Match ID hashing mismatch between backend and contract

**Resolution:**
1. Check if `createMatch` transaction exists:
   ```sql
   SELECT * FROM transactions 
   WHERE match_id = '$MATCH_ID' AND type = 'stake' AND tx_hash IS NOT NULL;
   ```
2. If no transaction, escrow was never created:
   - Call `lockFunds` manually via admin endpoint
   - Or refund players via platform wallet
3. If transaction exists but verification fails:
   - Verify transaction succeeded on-chain: `cast tx $TX_HASH --rpc-url $RPC_URL`
   - Check match ID encoding: 
     ```typescript
     ethers.id(matchId) === contract_bytes32_matchId
     ```

**Prevention:**
- Add metric: `lockFunds_calls` vs `escrow_verified_events`
- Alert on escrow creation failures
- Implement retry logic with exponential backoff for RPC calls

---

### Issue: Idempotency failure - duplicate escrow operations

**Symptoms:**
- Multiple refund transactions for same match
- Multiple payout transactions
- Error: "Transaction reverted" from contract

**Diagnosis:**
```bash
# Check for duplicate operations
psql $DATABASE_URL -c "
  SELECT type, COUNT(*) as count 
  FROM transactions 
  WHERE match_id = '$MATCH_ID' AND status = 'completed'
  GROUP BY type 
  HAVING COUNT(*) > 1;
"

# Check in-flight operations map (logs)
grep "Operation.*$MATCH_ID.*already in progress" logs/production.log
```

**Common Causes:**
1. Idempotency guard bypassed (server restart mid-operation)
2. Concurrent requests from multiple server instances
3. Race condition in `withIdempotency` wrapper

**Resolution:**
1. Verify actual on-chain state (source of truth):
   ```bash
   cast call $ESCROW_CONTRACT "getMatch(bytes32)" \
     $(cast --to-bytes32 $MATCH_ID) --rpc-url $WORLD_CHAIN_RPC_URL
   ```
2. If contract shows correct state (completed/cancelled), update database to match
3. If duplicate transactions pending, mark older ones as failed

**Prevention:**
- Use distributed locks (Redis) for critical operations
- Ensure single backend instance per environment or use proper clustering
- Add request ID tracking for duplicate detection

---

## Connection and Socket Issues

### Issue: Players stuck in disconnect/reconnect loop

**Symptoms:**
- `opponent_disconnected` and `player_reconnected` events cycling
- Match never starts despite both players "ready"
- Server logs show rapid connect/disconnect

**Diagnosis:**
```bash
# Check player's reconnection attempts
grep "reconnection attempt.*$USER_ID" logs/production.log | tail -20

# Check socket connections
redis-cli GET "player_socket:$USER_ID"

# Check active match state
curl -H "Authorization: Bearer $JWT_TOKEN" \
  https://api.blumea.me/api/matches/$MATCH_ID/status
```

**Common Causes:**
1. Network instability (mobile connection switching)
2. Multiple browser tabs/windows open (competing sockets)
3. Exceeded MAX_RECONNECT_ATTEMPTS (5)
4. Socket ID not properly updated in match state

**Resolution:**
1. Check reconnection attempts:
   ```javascript
   activeMatch.reconnectAttempts.get(userId)
   ```
2. If exceeded max attempts (5):
   - Match should auto-cancel
   - Verify refund was processed
3. If stuck below max attempts:
   - Force disconnect stale socket: disconnect old socket before new connection
   - Clear Redis socket tracking: `redis-cli DEL "player_socket:$USER_ID"`

**Prevention:**
- Enforce single socket per player (implemented)
- Add client-side detection of multiple tabs
- Debounce reconnections with `RECONNECT_DEBOUNCE_MS` (1 second)
- Monitor reconnection rate per match

---

### Issue: "Already in active match" error prevents requeueing

**Symptoms:**
- Player cannot join matchmaking
- Error: "Already in active match"
- Player reports previous match ended/cancelled

**Diagnosis:**
```bash
# Check Redis tracking
redis-cli GET "active_match:$USER_ID"

# Check actual match state
MATCH_ID=$(redis-cli GET "active_match:$USER_ID")
psql $DATABASE_URL -c "SELECT * FROM matches WHERE match_id = '$MATCH_ID';"
```

**Common Causes:**
1. Match cleanup didn't run (server crash during match)
2. Redis key not cleared after match ended
3. Match marked completed in DB but Redis not updated

**Resolution:**
1. Verify match is actually terminal (completed/cancelled/refunded):
   ```sql
   SELECT status FROM matches WHERE match_id = '$MATCH_ID';
   ```
2. If match is terminal, clear Redis:
   ```bash
   redis-cli DEL "active_match:$USER_ID"
   redis-cli DEL "player_socket:$USER_ID"
   ```
3. If match is still active, player needs to rejoin or wait for timeout

**Prevention:**
- Redis keys have TTL (2 hours for active_match)
- Cleanup match tracking in finally block of all match handlers
- Periodic cleanup job to reconcile Redis with database state

---

## Monitoring and Diagnostics

### Key Metrics to Monitor

**Match Lifecycle:**
- `match_created` events per minute
- `escrow_verified` events per minute
- `match_completed` events per minute
- Average time from match_created to game_started
- Ratio of completed matches to created matches

**Errors:**
- `payment_timeout` events per hour
- `escrow_verification_failed` events per hour
- `[REFUND_FAILED]` log entries per hour
- `max_reconnects_exceeded` events per hour

**Performance:**
- Matchmaking queue length by stake tier
- Average time to match (queued → matched)
- Socket connection count
- Active matches count

### Health Check Endpoints

```bash
# Server health
curl https://api.blumea.me/health

# Database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# Redis connectivity
redis-cli PING

# RPC connectivity
cast block-number --rpc-url $WORLD_CHAIN_RPC_URL
```

### Log Correlation

All match-related operations include a correlation ID for tracing:

```bash
# Find all events for a specific match
grep "correlationId.*match_${MATCH_ID}" logs/production.log

# Trace player journey
grep "userId.*$USER_ID" logs/production.log | \
  grep -E "(join_matchmaking|match_found|payment|ready|disconnect)"
```

### Structured Log Queries

Examples using structured logging:

```bash
# Find all escrow verification failures
grep '"eventType":"escrow_verification_failed"' logs/production.log | jq .

# Find all matches that timed out
grep '"reason":"payment_timeout"' logs/production.log | jq .

# Find matches by correlation ID
grep '"correlationId":"match_uuid_timestamp"' logs/production.log | jq .
```

---

## Escalation Procedures

### Critical Issues (Immediate Response Required)
- All matches failing to start (>90% failure rate)
- Refunds not processing for >10 matches
- RPC endpoint completely unavailable
- Database connection pool exhausted

**Action**: Page on-call engineer, rollback if necessary

### High Priority (Response within 1 hour)
- Escrow verification failing for >50% of matches
- Payment timeout rate >20%
- Redis connection issues

**Action**: Investigate logs, check dependencies, apply fixes

### Medium Priority (Response within 4 hours)
- Individual match stuck
- Player reconnection issues
- Single refund failure

**Action**: Review logs, apply manual remediation if needed

---

## Contact Information

- **On-Call Engineer**: [PagerDuty/Slack]
- **Database Admin**: [Contact]
- **Smart Contract Owner**: [Contact]
- **Worldcoin Support**: https://worldcoin.org/support

## Additional Resources

- [Environment Variables Documentation](./ENVIRONMENT_VARIABLES.md)
- [API Reference](./API_REFERENCE.md)
- [Smart Contract Documentation](./contracts/README.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
