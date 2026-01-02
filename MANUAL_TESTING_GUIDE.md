# Manual Testing Guide - HTTP Polling Migration

## Prerequisites

1. **Database Setup**
   ```bash
   cd backend
   npm run migrate
   ```

2. **Start Backend**
   ```bash
   cd backend
   npm run dev
   ```

3. **Start Frontend**
   ```bash
   cd frontend
   npm run dev
   ```

## Test Scenarios

### 1. Basic Matchmaking Flow

**Test**: Two players can match, ready up, and play a game

**Steps**:
1. Open two browser windows (or use incognito for second window)
2. In both windows, navigate to the app and sign in with different wallet addresses
3. Both players click "Find Opponent" with the same stake (e.g., 0.1 WLD)
4. **Expected**: Players are matched instantly (or after ~1s if one joins first)
5. Both players see countdown: 3, 2, 1...
6. Both players see green light
7. Both players tap as fast as possible
8. Both players see results showing winner and reaction times

**Verify**:
- ✅ No WebSocket connections in Network tab (only XHR/fetch requests)
- ✅ Match found within 1-2 seconds
- ✅ Countdown synchronized between both clients
- ✅ Green light appears at same time for both
- ✅ Winner determined correctly (faster reaction wins)

### 2. Page Refresh / Remount

**Test**: Refreshing the page doesn't create duplicate connections or break the game

**Steps**:
1. Player 1 joins matchmaking
2. Player 2 joins matchmaking (match found)
3. Player 1 refreshes the page
4. **Expected**: Player 1 re-enters the match automatically
5. Both players continue to countdown
6. Complete the game normally

**Verify**:
- ✅ Match state restored after refresh
- ✅ No duplicate polling requests
- ✅ Game continues normally
- ✅ Results still calculated correctly

### 3. Cancel Matchmaking

**Test**: Player can cancel matchmaking before match is found

**Steps**:
1. Player joins matchmaking
2. Click "Cancel" before opponent joins
3. **Expected**: Returns to dashboard/lobby
4. Join matchmaking again
5. **Expected**: Successfully re-enters queue

**Verify**:
- ✅ Polling stops when cancelled
- ✅ Can re-join immediately
- ✅ No lingering queue entries

### 4. Different Stakes

**Test**: Players with different stakes don't match

**Steps**:
1. Player 1 joins with 0.1 WLD stake
2. Player 2 joins with 0.5 WLD stake
3. **Expected**: Both remain in "Searching" state
4. Player 3 joins with 0.1 WLD stake
5. **Expected**: Player 1 and Player 3 match instantly

**Verify**:
- ✅ Only matching stakes are paired
- ✅ No cross-stake matching
- ✅ Queue persists across different stake levels

### 5. Anti-Cheat: Early Tap

**Test**: Tapping before green light disqualifies the player

**Steps**:
1. Two players start a match
2. During countdown or random delay, one player taps
3. Other player waits for green light and taps correctly
4. **Expected**: Early tapper is disqualified, other player wins

**Verify**:
- ✅ Early tap detected server-side
- ✅ Player marked as disqualified
- ✅ Opponent wins by default
- ✅ Results show disqualification reason

### 6. Anti-Cheat: Late/No Tap

**Test**: Not tapping within 5 seconds marks tap as invalid

**Steps**:
1. Two players start a match
2. Both see green light
3. One player taps immediately (~200ms)
4. Other player waits >5 seconds or doesn't tap
5. **Expected**: Fast tapper wins, slow/no tap is invalid

**Verify**:
- ✅ Reactions > 5000ms marked invalid
- ✅ Missing tap counted as loss
- ✅ Winner determined correctly

### 7. Anti-Cheat: Both Early Tap

**Test**: Both players tap early, match is cancelled with fee refund

**Steps**:
1. Two players start a match
2. Both tap before green light
3. **Expected**: Match cancelled, both disqualified

**Verify**:
- ✅ Both marked as disqualified
- ✅ Match status: cancelled
- ✅ Both see appropriate message

### 8. Tie Game

**Test**: Both players tap with reaction times within 1ms

**Steps**:
1. Two players start a match
2. Both tap very close to same time
3. **Expected**: If within 1ms, declared a tie

**Verify**:
- ✅ Tie detected correctly
- ✅ Pot split 50/50 (if using real stakes)
- ✅ Both players see tie result

### 9. Network Tab Verification

**Test**: Confirm HTTP polling is used, not WebSockets

**Steps**:
1. Open DevTools → Network tab
2. Start a match flow
3. Filter by "WS" (WebSocket)
4. **Expected**: No WebSocket connections
5. Filter by "XHR" or "Fetch"
6. **Expected**: Multiple HTTP requests to `/api/match/state/`, `/api/matchmaking/status/`, etc.

**Verify**:
- ✅ Zero WebSocket connections
- ✅ Polling requests at expected intervals
- ✅ No socket.io connections

### 10. Polling Interval Check

**Test**: Verify polling speeds up during countdown

**Steps**:
1. Open DevTools → Network tab
2. Start a match
3. During matchmaking: observe ~1 request per second
4. During countdown/go: observe ~2-10 requests per second
5. After tap: observe polling continues until result

**Verify**:
- ✅ Matchmaking: ~1000ms interval
- ✅ Countdown: ~100-500ms interval
- ✅ Polling stops after result received

### 11. Multiple Remounts

**Test**: Rapidly refreshing doesn't cause issues

**Steps**:
1. Join matchmaking
2. Refresh page 5 times quickly
3. **Expected**: Matchmaking continues, no errors
4. Get matched
5. Refresh during countdown
6. **Expected**: Countdown continues where it left off

**Verify**:
- ✅ No duplicate requests
- ✅ State restored correctly each time
- ✅ No memory leaks or stuck polling

### 12. Performance Test

**Test**: System handles multiple concurrent matches

**Steps**:
1. Open 10 browser windows (5 pairs of players)
2. All join matchmaking with same stake
3. **Expected**: All 5 pairs match and play
4. Monitor server logs for errors
5. Check database for correct match records

**Verify**:
- ✅ All matches complete successfully
- ✅ No database deadlocks
- ✅ Response times < 100ms
- ✅ No memory leaks

## Backend Verification

### Database Check

```bash
# Connect to PostgreSQL
psql $DATABASE_URL

# Check queue entries
SELECT * FROM match_queue;

# Check active matches
SELECT * FROM matches WHERE status = 'in_progress';

# Check tap events
SELECT * FROM tap_events ORDER BY created_at DESC LIMIT 10;

# Check latency samples
SELECT user_id, AVG(latency_ms) as avg_latency, COUNT(*) as sample_count
FROM latency_samples
GROUP BY user_id;
```

### Log Verification

Monitor server logs for:
- ✅ No WebSocket connection logs
- ✅ HTTP polling endpoint requests
- ✅ Anti-cheat warnings for suspicious patterns
- ✅ Queue cleanup cron job running every 60s

### API Testing with curl

```bash
# Get nonce
curl http://localhost:3001/api/auth/nonce

# Login (get token)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x1234567890abcdef"}'

# Join matchmaking
curl -X POST http://localhost:3001/api/matchmaking/join \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"stake":0.5}'

# Check status
curl http://localhost:3001/api/matchmaking/status/USER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Record latency
curl -X POST http://localhost:3001/api/ping \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"clientTimestamp":'$(date +%s000)'}'
```

## Common Issues & Solutions

### Issue: Stuck in "Searching"

**Solution**:
1. Check backend logs for queue cleanup
2. Verify database connection
3. Check if other player has matching stake

### Issue: Countdown doesn't start

**Solution**:
1. Verify both players called `/api/match/ready`
2. Check `green_light_time` is set in database
3. Ensure polling interval is < 500ms

### Issue: Tap not recorded

**Solution**:
1. Check green light time has passed
2. Verify anti-cheat isn't disqualifying
3. Ensure only first tap is accepted

### Issue: High latency / slow polling

**Solution**:
1. Check network connection
2. Verify backend is running
3. Check database query performance
4. Add Redis caching if needed

## Success Criteria

All tests must pass with:
- ✅ No WebSocket connections
- ✅ Smooth polling at correct intervals
- ✅ Accurate winner determination
- ✅ Anti-cheat working correctly
- ✅ Page refresh/remount resilient
- ✅ Clean database state
- ✅ No errors in console or logs

## Reporting Issues

If any test fails, provide:
1. Test scenario number
2. Browser console errors
3. Network tab screenshot
4. Backend logs
5. Database state (relevant tables)
6. Steps to reproduce
