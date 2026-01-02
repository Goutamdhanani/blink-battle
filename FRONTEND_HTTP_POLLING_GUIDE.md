# HTTP Polling Architecture Guide

## Overview

Blink Battle uses HTTP polling for matchmaking and gameplay instead of WebSockets. This architecture provides:

- **Better mobile stability**: Works across network changes and app backgrounding
- **No reconnection storms**: Stateless requests eliminate connection management complexity
- **Server-authoritative**: All game logic and timing handled server-side
- **Heroku-compatible**: No H15 idle timeout issues or WebSocket upgrade failures

## Architecture

### State Machine

```
searching → matched → ready_wait → countdown → waiting_for_go → go → resolved
```

### Polling Intervals

- **Matchmaking (searching)**: 1000ms (1 second)
- **Ready wait**: 500ms
- **Countdown/Go**: 100ms (smooth UI updates)
- **After tap**: 500ms (waiting for opponent)

## Frontend Implementation

### 1. Polling Service

The `PollingService` class (`frontend/src/services/pollingService.ts`) provides methods for all HTTP endpoints:

```typescript
import { pollingService } from '../services/pollingService';

// Set auth token
pollingService.setToken(token);

// Join matchmaking
const result = await pollingService.joinMatchmaking(0.5);

// Poll status
const status = await pollingService.getMatchmakingStatus(userId);

// Get match state
const state = await pollingService.getMatchState(matchId);

// Record tap
const tap = await pollingService.recordTap(matchId, Date.now());
```

### 2. usePollingGame Hook

The `usePollingGame` hook (`frontend/src/hooks/usePollingGame.ts`) manages polling lifecycle:

```typescript
const {
  joinMatchmaking,
  cancelMatchmaking,
  recordTap,
  stopPolling,
  resetGameAndStopPolling,
  isPolling,
  error,
  currentMatchState,
} = usePollingGame();

// Join matchmaking (starts polling automatically)
await joinMatchmaking(userId, stake);

// Record tap during game
await recordTap(matchId);

// Cancel matchmaking (stops polling)
await cancelMatchmaking(userId);
```

### 3. Component Integration

#### Matchmaking Component

```typescript
const { joinMatchmaking, cancelMatchmaking, isPolling } = usePollingGame();
const { state } = useGameContext();

// Join matchmaking
const handleJoin = async () => {
  await joinMatchmaking(state.user.userId, selectedStake);
};

// Automatic navigation when matched
useEffect(() => {
  if (state.gamePhase === 'countdown' || state.gamePhase === 'waiting') {
    navigate('/game');
  }
}, [state.gamePhase]);
```

#### GameArena Component

```typescript
const { recordTap } = usePollingGame();
const { state } = useGameContext();

// Handle tap during green light
const handleTap = async () => {
  if (state.gamePhase !== 'signal') return;
  await recordTap(state.matchId);
};

// Automatic navigation to results
useEffect(() => {
  if (state.gamePhase === 'result') {
    navigate('/result');
  }
}, [state.gamePhase]);
```

## Backend Implementation

### Controllers

#### PollingMatchmakingController

Handles matchmaking queue:

- `POST /api/matchmaking/join` - Join queue, instant match if possible
- `GET /api/matchmaking/status/:userId` - Poll queue status
- `DELETE /api/matchmaking/cancel/:userId` - Cancel matchmaking

#### PollingMatchController

Handles game flow:

- `POST /api/match/ready` - Mark player ready
- `GET /api/match/state/:matchId` - Poll match state (state machine)
- `POST /api/match/tap` - Record tap (server timestamp authoritative)
- `GET /api/match/result/:matchId` - Get final results

#### PingController

Handles latency sampling:

- `POST /api/ping` - Record latency sample
- `GET /api/ping/stats` - Get user's latency stats

### Models

#### MatchQueue

Persistent matchmaking queue with expiration:

```typescript
// Enqueue player
await MatchQueueModel.enqueue(userId, stake);

// Find match
const match = await MatchQueueModel.findMatch(stake, excludeUserId);

// Cancel
await MatchQueueModel.cancel(userId);

// Cleanup expired (cron job)
await MatchQueueModel.cleanupExpired();
```

#### TapEvent

Server-authoritative tap recording:

```typescript
// Record tap
const tap = await TapEventModel.create(
  matchId,
  userId,
  clientTimestamp,
  serverTimestamp,
  greenLightTime
);

// Get taps for match
const taps = await TapEventModel.findByMatchId(matchId);

// Find winner
const winner = await TapEventModel.getFirstValidTap(matchId);
```

#### LatencySample

Track network latency for compensation:

```typescript
// Record sample
await LatencySampleModel.create(userId, latencyMs);

// Get average
const avgLatency = await LatencySampleModel.getAverageLatency(userId);
```

## Anti-Cheat

### Server-Side Validation

All anti-cheat logic runs server-side using server timestamps:

1. **Early Tap Detection**: `serverTimestamp < greenLightTime` → Disqualified
2. **Max Reaction Window**: `reactionMs > 5000ms` → Invalid
3. **Bot Detection**: `reactionMs < 100ms` → Flagged as suspicious
4. **Pattern Analysis**: Variance < 5ms or >50% sub-100ms reactions → Flagged
5. **First Tap Only**: Subsequent taps ignored (spam-tap protection)

### Implementation

```typescript
import { AntiCheatService } from '../services/antiCheat';

// Validate reaction
const result = AntiCheatService.validateReaction(
  clientTimestamp,
  serverTimestamp,
  greenLightTime
);

if (!result.valid) {
  console.log(`Invalid tap: ${result.reason}`);
}

if (result.suspicious) {
  console.warn('Suspicious reaction time detected');
}

// Check patterns
const recentTimes = [234, 245, 238, 242, 236];
const suspicious = await AntiCheatService.checkSuspiciousPatterns(
  userId,
  recentTimes
);
```

## State Transitions

### Matchmaking → Match

1. Player 1 joins queue: `POST /api/matchmaking/join`
2. Client polls: `GET /api/matchmaking/status/:userId` every 1s
3. Player 2 joins queue: instant match!
4. Both clients receive `status: 'matched'` with `matchId`
5. Both clients automatically mark ready: `POST /api/match/ready`

### Ready → Countdown → Go

1. Both players call `POST /api/match/ready`
2. Server picks random green light time (now + 3s countdown + 2-5s random)
3. Clients poll `GET /api/match/state/:matchId` every 100-500ms
4. Server returns state transitions:
   - `ready_wait` → waiting for opponent
   - `countdown` → 3, 2, 1 countdown
   - `waiting_for_go` → random delay (no countdown number)
   - `go` → green light active!

### Tap → Result

1. Player sees `greenLightActive: true`, taps screen
2. Client calls `POST /api/match/tap` with `clientTimestamp`
3. Server records tap with authoritative `serverTimestamp`
4. Server calculates `reactionMs = serverTimestamp - greenLightTime`
5. Anti-cheat validates: early tap → disqualified, >5s → invalid
6. When both tap, server determines winner
7. Clients poll `GET /api/match/state/:matchId`, see `state: 'resolved'`
8. Clients call `GET /api/match/result/:matchId` for final results

## Error Handling

### Network Errors

```typescript
try {
  await pollingService.joinMatchmaking(stake);
} catch (error) {
  if (error.response?.status === 401) {
    // Auth error - redirect to login
    setToken(null);
    navigate('/');
  } else if (error.response?.status === 400) {
    // Already in queue or match
    alert('Already in matchmaking or active match');
  } else {
    // Network error - retry
    console.error('Network error:', error);
  }
}
```

### Disconnection / Refresh

The HTTP polling architecture is stateless and resume-friendly:

1. User refreshes page
2. Auth token restored from localStorage
3. `activeMatchId` restored from localStorage
4. If match exists, resume polling `GET /api/match/state/:matchId`
5. Server returns current state (countdown, go, or resolved)
6. UI catches up instantly

## Performance

### Request Load

- Searching: 1 req/sec per player
- Countdown/Go: 2-10 req/sec per player (100ms-500ms)
- Typical match: 30-40 requests total per player
- Peak: ~10 req/sec during countdown (50 concurrent matches)

### Database

- Indexes on foreign keys (user_id, match_id)
- `FOR UPDATE SKIP LOCKED` prevents race conditions
- Cron cleanup every 60s for expired queue entries
- Latency samples limited to 100 per user

### Optimization

- Use Redis caching for match state (optional)
- Implement rate limiting (10 req/sec per user)
- Add CDN for static assets
- Enable gzip compression

## Testing

### Manual Testing

1. Open two browser windows
2. Log in as different users
3. Both join matchmaking with same stake
4. Verify instant match
5. Both see countdown
6. Both see green light simultaneously
7. Tap on green light
8. Verify winner determined correctly

### Integration Tests

See `backend/src/controllers/__tests__/httpPollingIntegration.test.ts`:

```bash
cd backend
npm test -- httpPollingIntegration
```

Tests cover:
- Full game flow (matchmaking → tap → result)
- Early tap disqualification
- Slow tap invalidation
- Spam tap protection
- Queue expiration
- State polling

## Migration from WebSocket

### What Changed

- ❌ Removed: `SocketContext`, `SocketProvider`, `socket.io-client`
- ✅ Added: `PollingService`, `usePollingGame` hook
- ✅ Updated: Matchmaking, GameArena components
- ✅ New: HTTP endpoints for matchmaking and gameplay

### Backward Compatibility

- WebSocket handlers still exist but marked deprecated
- Can be removed in future version
- Database schema is backward compatible

### Rollback Plan

If issues arise:

1. Revert frontend to use WebSocket
2. Re-enable WebSocket handlers in backend
3. HTTP polling tables (match_queue, tap_events) can remain

## Deployment

### Environment Variables

```bash
# Anti-cheat configuration
MIN_REACTION_MS=80        # Minimum valid reaction (default: 80ms)
MAX_REACTION_MS=5000      # Maximum valid reaction (default: 5s)
SIGNAL_DELAY_MIN_MS=2000  # Min random delay (default: 2s)
SIGNAL_DELAY_MAX_MS=5000  # Max random delay (default: 5s)
```

### Database Migration

```bash
cd backend
npm run migrate
```

Creates:
- `match_queue` table
- `tap_events` table
- `latency_samples` table
- Indexes for performance

### Monitoring

Key metrics to monitor:

- Match completion rate
- Average polling frequency
- Database query times
- Anti-cheat flag rate
- Queue expiration rate

## Troubleshooting

### Stuck in Searching

- Check queue cleanup cron is running
- Verify stake amounts match between players
- Check database indexes exist

### Countdown Not Starting

- Verify both players called `/api/match/ready`
- Check `green_light_time` is set in database
- Ensure polling interval is fast enough (< 500ms)

### Taps Not Recorded

- Verify `green_light_time` is in the past
- Check anti-cheat is not disqualifying taps
- Ensure only first tap is accepted (no duplicates)

### Performance Issues

- Add Redis caching for match state
- Implement rate limiting
- Optimize database queries with `EXPLAIN ANALYZE`
- Consider connection pooling

## Future Enhancements

- [ ] Adaptive polling (slow down when idle)
- [ ] Server-sent events for real-time updates (optional)
- [ ] WebSocket as optional enhancement (not required)
- [ ] Machine learning for bot detection
- [ ] Geolocation-based matchmaking
- [ ] Tournament mode with brackets
