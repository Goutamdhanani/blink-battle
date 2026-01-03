# Comprehensive Fixes Plan for Blink Battle Issues

## Summary
This document outlines the plan to address all 20 issues identified in the Blink Battle logs.

## Issues Status

### ✅ COMPLETED (Issues 1-3)

#### Issue #1: Incomplete Payment Flows
**Status**: ✅ Already handled
- `PaymentIntentModel.expireStalePayments()` expires payments without transaction IDs after 5 minutes
- Payment worker runs every 10s and calls this function
- Payments get marked as `FAILED` with reason "Payment expired - no transaction ID received within timeout"
- Location: `backend/src/models/PaymentIntent.ts:264-278`
- Called from: `backend/src/services/paymentWorker.ts:90-93`

#### Issue #2: Excessive Match State Polling
**Status**: ✅ Fixed (indirectly via Issue #3)
- Frontend already has adaptive polling rates:
  - IDLE: 5s
  - MATCHMAKING: 2s
  - MATCHED: 500ms (waiting for ready)
  - COUNTDOWN: 100ms
  - PLAYING: 50ms (brief duration)
  - RESULT: Stops immediately
- Root cause was Issue #3 (ready flow stuck), which kept matches in "ready_wait" state indefinitely
- Now fixed: matches can progress past ready step
- Location: `frontend/src/hooks/usePollingGame.ts:20-28`

#### Issue #3: Redundant Ready Calls  
**Status**: ✅ FIXED
- **Root Cause**: Ready handler rejected `pending` status matches
- **Fix Applied**: Added `pending` to allowed statuses in ready handler
- **Change**: Line 65 in `pollingMatchController.ts`
  ```typescript
  if (!['pending', 'waiting', 'ready', 'matched'].includes(matchData.status))
  ```
- **Test Added**: New test case "should accept ready calls on newly created match with pending status"
- **Impact**: Matches can now progress from `pending` → `countdown` → `in_progress` → `completed`

### 🔄 IN PROGRESS

#### Issue #4: Missing Transaction Hashes
**Priority**: HIGH
**Plan**:
1. Add null-check handling in payment worker when transactionHash is null
2. Log warning but don't fail the payment update
3. Allow payment to remain in `confirmed` state even without transaction hash
4. Add retry logic to fetch transaction hash in subsequent worker runs
**Files to modify**:
- `backend/src/services/paymentWorker.ts` (line 209)
- `backend/src/services/statusNormalization.ts`

### 📋 PLANNED

#### Issue #5: Race Conditions
**Priority**: MEDIUM
**Current State**: 
- Payment worker uses row-level locking (`FOR UPDATE SKIP LOCKED`)
- Matchmaking uses database transactions
**Plan**:
1. Add distributed Redis locks for critical sections
2. Implement idempotency keys for all state transitions
3. Add optimistic locking with version numbers
**Files to modify**:
- `backend/src/services/paymentWorker.ts`
- `backend/src/controllers/pollingMatchmakingController.ts`

#### Issue #6: Payment Timeout Handling
**Priority**: MEDIUM
**Current State**: Partially handled by `expireStalePayments` (5 min timeout)
**Plan**:
1. Add configurable timeout per payment type
2. Send notification to user before timeout
3. Add payment recovery mechanism
**Files to modify**:
- `backend/src/models/PaymentIntent.ts`
- Add new file: `backend/src/services/paymentTimeout.ts`

#### Issue #7: WebSocket/Polling Fallback
**Priority**: LOW (WebSocket disabled, using HTTP polling)
**Status**: Not applicable - WebSockets are disabled
**Note**: Line 290 in `index.ts`: `new GameSocketHandler(io);` is commented out

#### Issue #8: Match State Synchronization
**Priority**: MEDIUM
**Plan**:
1. Add state version number to matches table
2. Implement state reconciliation on reconnect
3. Add state checksum verification
**Files to modify**:
- `backend/src/models/Match.ts`
- `backend/src/controllers/pollingMatchController.ts`

#### Issue #9: Escrow/Treasury Payment Documentation
**Priority**: HIGH (Documentation)
**Plan**:
1. Create PAYMENT_ARCHITECTURE.md documenting the treasury model
2. Update inline comments to clarify off-chain payment tracking
3. Add diagram showing payment flow
**Current Comments**: Lines 82-97 in `pollingMatchController.ts` partially explain this

#### Issue #10: Heartbeat Failure Recovery
**Priority**: MEDIUM
**Current State**: Heartbeat sent every 5s (`HEARTBEAT_INTERVAL_MS`)
**Plan**:
1. Add disconnect checker job (already exists at line 432 in `index.ts`)
2. Add match timeout when player disconnects > 30s
3. Auto-forfeit disconnected player
**Files to modify**:
- `backend/src/jobs/disconnectChecker.ts`

#### Issue #11: Authentication Token Expiry
**Priority**: MEDIUM
**Plan**:
1. Add token refresh endpoint
2. Frontend: Auto-refresh before expiry
3. Add graceful degradation when token expires
**Files to modify**:
- `backend/src/middleware/auth.ts`
- `frontend/src/services/pollingService.ts`

#### Issue #12: Database Lock Contention
**Priority**: LOW
**Current State**: Using `FOR UPDATE SKIP LOCKED` which prevents blocking
**Plan**:
1. Monitor lock wait times
2. Increase worker pool size if needed
3. Add lock timeout configuration
**Files to monitor**:
- `backend/src/services/paymentWorker.ts`

#### Issue #13: Cleanup Job Timing
**Priority**: MEDIUM
**Current State**: Runs every 60s, cleans 1 entry at a time
**Plan**:
1. Increase cleanup batch size (currently LIMIT 1)
2. Add cleanup metrics/monitoring
3. Adjust frequency based on queue size
**Files to modify**:
- `backend/src/index.ts:408-419`
- `backend/src/controllers/pollingMatchmakingController.ts`

#### Issue #14: Transaction Status Normalization
**Priority**: MEDIUM
**Current State**: `statusNormalization.ts` handles various status formats
**Plan**:
1. Add more status edge cases
2. Log unknown statuses for investigation
3. Add fallback to raw status when normalization fails
**Files to modify**:
- `backend/src/services/statusNormalization.ts`

#### Issue #15: Network Partition Scenarios
**Priority**: HIGH
**Plan**:
1. Add circuit breaker pattern for Developer Portal API calls
2. Implement retry with exponential backoff (partially done)
3. Add fallback behavior when API is unreachable
4. Cache last known payment status
**Files to modify**:
- `backend/src/services/paymentWorker.ts`
- Add new file: `backend/src/services/circuitBreaker.ts`

#### Issue #16: Duplicate Payment Prevention
**Priority**: HIGH
**Current State**: Already implemented via `payment_reference` idempotency
**Verification Needed**:
- Confirm UNIQUE constraint on `payment_reference` column
- Add frontend deduplication guard
**Files to check**:
- Database schema migration
- `backend/src/models/PaymentIntent.ts:35-44`

#### Issue #17: Match Abandonment
**Priority**: MEDIUM
**Plan**:
1. Add match timeout (30 minutes inactive)
2. Auto-cancel matches that never progress past `pending`
3. Refund players for abandoned matches
**Files to modify**:
- Add new file: `backend/src/jobs/matchTimeout.ts`
- `backend/src/index.ts` (add job startup)

#### Issue #18: CORS Preflight Overhead
**Priority**: LOW (Performance optimization)
**Plan**:
1. Add CORS preflight caching headers
2. Reduce preflight requests with wildcard methods
3. Consider moving to same-origin deployment
**Files to modify**:
- `backend/src/index.ts:173-191`

#### Issue #19: Missing Error Responses
**Priority**: MEDIUM
**Current State**: All requests show 200/204/304
**Plan**:
1. Audit all endpoints to ensure proper error codes
2. Add error response logging
3. Implement error categorization
**Files to modify**:
- All controller files
- Add middleware for structured error responses

#### Issue #20: Match History / Stale Data from 304
**Priority**: MEDIUM
**Plan**:
1. Add proper Cache-Control headers
2. Implement ETag for match history
3. Add last-modified timestamps
4. Force refresh when match state changes
**Files to modify**:
- `backend/src/controllers/matchController.ts`
- Frontend match history hooks

## Implementation Priority

### Phase 1 (Immediate) - Critical Fixes
1. ✅ Issue #3: Ready flow pending status (COMPLETED)
2. Issue #4: Missing transaction hashes
3. Issue #9: Payment architecture documentation
4. Issue #15: Network partition resilience

### Phase 2 (Short-term) - High Priority
1. Issue #16: Verify duplicate payment prevention
2. Issue #10: Heartbeat failure recovery
3. Issue #13: Cleanup job optimization
4. Issue #17: Match abandonment timeout

### Phase 3 (Medium-term) - Performance & Reliability
1. Issue #5: Distributed locks for race conditions
2. Issue #8: Match state synchronization
3. Issue #11: Token expiry handling
4. Issue #14: Status normalization edge cases
5. Issue #19: Error response standardization
6. Issue #20: Match history caching

### Phase 4 (Long-term) - Optimizations
1. Issue #6: Payment timeout enhancements
2. Issue #12: Lock contention optimization
3. Issue #18: CORS preflight reduction

## Testing Strategy

### Unit Tests
- [x] Test ready flow from pending status
- [ ] Test payment expiration logic
- [ ] Test transaction status normalization
- [ ] Test duplicate payment prevention

### Integration Tests
- [ ] Test complete game flow with pending start
- [ ] Test payment timeout scenarios
- [ ] Test heartbeat failure recovery
- [ ] Test match abandonment

### Load Tests
- [ ] Test polling rate under load
- [ ] Test payment worker under high volume
- [ ] Test cleanup job scalability
- [ ] Test database lock contention

## Monitoring & Observability

### Metrics to Add
1. Payment processing latency
2. Match state transition delays
3. Cleanup job efficiency
4. API error rates by endpoint
5. Database lock wait times

### Alerts to Configure
1. Payment stuck > 10 minutes
2. Match stuck in pending > 5 minutes
3. Cleanup job falling behind
4. Developer Portal API failures
5. High database lock contention

## Rollout Plan

1. **Immediate**: Deploy Issue #3 fix (ready flow)
2. **Week 1**: Deploy Issues #4, #9, #15
3. **Week 2**: Deploy Issues #10, #13, #16, #17
4. **Week 3**: Deploy Phase 3 fixes
5. **Week 4**: Deploy Phase 4 optimizations

## Success Metrics

- Zero "already in pending, ignoring ready" errors
- < 1% payment expiration rate
- < 5% match abandonment rate
- 99.9% API availability
- < 100ms average polling latency
- < 1s payment worker processing time

## Risk Assessment

### High Risk
- Database schema changes (test thoroughly)
- Payment flow modifications (test with real money)
- State machine transitions (could break gameplay)

### Medium Risk
- Polling rate changes (monitor server load)
- Cleanup job changes (could affect performance)
- Error handling changes (ensure proper logging)

### Low Risk
- Documentation updates
- Monitoring additions
- CORS configuration changes

## Rollback Plan

1. Keep previous deployment ready
2. Feature flags for new behavior
3. Database migrations are reversible
4. Gradual rollout with canary deployments
5. Real-time monitoring during deployment
