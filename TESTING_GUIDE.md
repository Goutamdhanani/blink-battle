# Testing & Verification Guide

## Pre-Deployment Checklist

### 1. Database Migration
Before deploying, run the column migration:

```bash
# Production
cd backend
npm run migrate:columns

# Or manually verify columns exist
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='matches' AND column_name IN ('player1_ready', 'player2_ready', 'green_light_time');"
```

Expected output: All three columns should be listed.

### 2. Health Check Verification

After deployment, verify schema health:

```bash
curl https://your-api.com/health/schema
```

Expected response:
```json
{
  "valid": true,
  "missingColumns": [],
  "details": "All required columns exist",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Manual Testing Scenarios

### Scenario 1: Two-Device Matchmaking (Primary Issue)

**Goal**: Verify both devices can match and progress through the game

**Steps**:

1. **Device 1**: Open app, click "Find Match" with 0.5 WLD stake
   - Should see "Finding opponent..." state
   - Poll logs should show 5s intervals (not 1s)

2. **Device 2**: Open app, click "Find Match" with 0.5 WLD stake
   - Should immediately match with Device 1
   - Both devices should see opponent info

3. **Device 1**: Check status after ~5 seconds
   - Should now show "Get Ready" screen (not stuck on "Finding opponent")
   - Match info should be visible

4. **Both Devices**: Click "Ready"
   - POST `/api/match/ready` should return 200 (not 500)
   - Should see countdown timer

5. **Continue Game**: Complete the tap game
   - Both should see green light
   - Both can tap
   - Winner declared correctly

**Success Criteria**:
- ✅ No 500 errors on `/api/match/ready`
- ✅ Device 1 sees match after Device 2 joins (within 5s polling window)
- ✅ Both progress to "Get Ready" screen
- ✅ Game completes successfully

### Scenario 2: Rate Limiting

**Goal**: Verify rate limiting prevents abuse

**Setup**: Use a tool like `curl` or Postman with a valid JWT token

**Test Matchmaking Rate Limit** (20 requests/minute):
```bash
# Make 25 requests rapidly
for i in {1..25}; do
  echo "Request $i"
  curl -w "\nStatus: %{http_code}\n" \
    -H "Authorization: Bearer $YOUR_JWT_TOKEN" \
    https://your-api.com/api/matchmaking/status/YOUR_USER_ID
  sleep 1
done
```

**Expected**:
- First 20 requests: Status 200
- Requests 21-25: Status 429 with headers:
  ```
  X-RateLimit-Limit: 20
  X-RateLimit-Remaining: 0
  Retry-After: 30
  ```

**Test Match State Rate Limit** (100 requests/minute):
Similar test but should allow 100 requests before throttling.

### Scenario 3: Polling Frequency

**Goal**: Verify reduced polling frequency in browser

**Steps**:

1. Open browser DevTools → Network tab
2. Start matchmaking on one device
3. Filter network requests to `/api/matchmaking/status`
4. Observe request timing

**Expected**:
- Matchmaking status requests: ~5 seconds apart
- Match state (waiting): ~2 seconds apart
- Match state (countdown/active): ~100ms apart

**Success Criteria**:
- ✅ Matchmaking polls every 5s (not 1s)
- ✅ Much fewer total requests than before
- ✅ Still responsive during gameplay (100ms polling)

### Scenario 4: Request Monitoring

**Goal**: Verify request tracking logs are working

**Steps**:

1. Have 2-3 users actively playing
2. Wait 1 minute
3. Check server logs

**Expected Log Output**:
```
[Request Stats] Last minute: 245 requests from 3 users
  GET /api/matchmaking/status/:userId: 36 requests
  GET /api/match/state/:matchId: 180 requests
  POST /api/match/ready: 6 requests
  POST /api/match/tap: 6 requests
```

**Success Criteria**:
- ✅ Stats logged every minute
- ✅ Shows request breakdown by endpoint
- ✅ Total request count significantly lower than before (~80% reduction)

### Scenario 5: Migration Idempotency

**Goal**: Verify migration can run multiple times safely

**Steps**:
```bash
# Run migration twice
npm run migrate:columns
npm run migrate:columns
```

**Expected**:
- First run: Adds columns (if missing) or reports they exist
- Second run: Reports columns already exist
- No errors or duplicate columns

## Automated Testing

### Unit Tests

Run existing tests to ensure no regressions:
```bash
cd backend
npm test
```

**Expected**: Payment and auth controller tests pass. HTTP polling tests may fail without database connection (acceptable for dev).

### Integration Test (with Database)

If you have a test database configured:

```bash
# Set test database URL
export DATABASE_URL="postgresql://user:pass@localhost:5432/testdb"

# Run migration
npm run migrate:columns

# Run tests
npm test
```

All tests should pass with database available.

## Performance Verification

### Before/After Comparison

**Metrics to Compare**:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Matchmaking polls/min | 60 (1 req/sec) | 12 (5s interval) | 80% reduction |
| Match state polls/min (waiting) | 120 (500ms) | 30 (2s interval) | 75% reduction |
| Avg server load | Baseline | Should be ~70% of baseline | 30% reduction |
| Database connections | Baseline | Should be stable | More predictable |

**How to Measure**:

1. Monitor server metrics before deployment
2. Deploy changes
3. Monitor for 1 hour with similar traffic
4. Compare request rates in logs

Expected: ~70-80% reduction in polling requests while maintaining game responsiveness.

## Rollback Plan

If issues occur:

1. **Database**: Don't rollback columns - they have safe defaults
2. **Code**: Revert to previous deployment
3. **Monitoring**: Check which specific issue occurred:
   - Still getting 500 errors? → Migration didn't run
   - Game too slow? → Increase polling frequency in frontend
   - Rate limit too strict? → Adjust limits in `rateLimiter.ts`

## Success Metrics

**Must Pass**:
- [ ] No 500 errors on `/api/match/ready`
- [ ] Both players reach "Get Ready" state
- [ ] Games complete successfully
- [ ] Rate limiting returns 429 when exceeded
- [ ] Request volume reduced by >60%

**Nice to Have**:
- [ ] Server load reduced by >20%
- [ ] Database connection pool more stable
- [ ] No user complaints about responsiveness

## Post-Deployment Monitoring

**First 24 Hours**:
- Monitor error rates on `/api/match/ready`
- Check rate limit hit frequency
- Verify request volume reduction
- Monitor user feedback on game flow

**First Week**:
- Analyze request patterns
- Adjust rate limits if needed
- Optimize polling intervals if too slow/fast
- Document any edge cases found
