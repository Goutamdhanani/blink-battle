# Socket.IO Transport Hardening - Implementation Guide

## Overview

This document describes the Socket.IO transport hardening improvements implemented to address connection stability issues on Heroku/Vercel deployments and mobile backgrounding scenarios.

## Problem Statement

The application experienced:
- Connection instability with sub-second disconnects (0.4-0.9s)
- Heroku H15 idle timeout errors (55s idle connection drops)
- Mobile backgrounding causing immediate match/queue loss
- Immediate queue removal on short disconnects

## Solutions Implemented

### 1. Backend HTTP Server Configuration

**File:** `backend/src/index.ts`

Added HTTP server keepAlive timeouts to prevent Heroku H15 errors:

```typescript
httpServer.keepAliveTimeout = 65000; // 65 seconds - longer than Heroku's 55s
httpServer.headersTimeout = 66000;   // 66 seconds - slightly longer than keepAliveTimeout
```

**Why This Works:**
- Heroku's routing layer has a 55-second idle timeout
- Setting Node.js keepAlive to 65s ensures the server keeps connections alive longer than Heroku's timeout
- This prevents H15 errors where Heroku closes the connection before Node.js

**Verification:**
```bash
# Backend logs should show:
✅ HTTP server timeouts configured:
  keepAliveTimeout: 65000ms
  headersTimeout: 66000ms
  (Heroku H15 protection: both > 55s routing timeout)
```

### 2. Socket.IO Compression Disabled

**File:** `backend/src/index.ts`

Explicitly disabled HTTP compression for better proxy compatibility:

```typescript
const io = new Server(httpServer, {
  // ... other config
  perMessageDeflate: false,  // Disable WebSocket per-message deflate
  httpCompression: false,     // Disable HTTP compression for polling
});
```

**Why This Works:**
- Reduces CPU usage on server and client
- Better compatibility with proxy servers (Heroku routing mesh)
- Prevents compression-related connection drops

### 3. Queue Grace Period Handling

**File:** `backend/src/services/matchmaking.ts`

Implemented 30-second grace period for queue disconnects:

```typescript
private static readonly QUEUE_GRACE_PERIOD_MS = 30000; // 30 seconds

// Mark queue entry as disconnected (not removed)
static async markQueueEntryDisconnected(userId, stake)

// Restore queue entry on reconnect within grace period
static async restoreQueueEntry(userId, stake)

// Cleanup expired entries after grace period
static async cleanupExpiredQueueEntry(userId, stake)
```

**Flow:**
1. Player disconnects → Queue entry marked as disconnected (30s TTL in Redis)
2. Player reconnects within 30s → Queue entry restored, position maintained
3. Grace period expires → Queue entry removed automatically

**Benefits:**
- Players can briefly disconnect (network hiccup, mobile switch) without losing queue position
- Prevents frustration from being removed from queue on momentary disconnects
- Automatic cleanup via Redis TTL (no memory leaks)

### 4. Background/Foreground Handling

**Files:** 
- `backend/src/websocket/gameHandler.ts`
- `frontend/src/context/SocketContext.tsx`

Added mobile backgrounding support with grace periods:

**Frontend:**
```typescript
const BACKGROUND_DISCONNECT_TIMEOUT_MS = 300000; // 5 minutes

// On page background:
- Emit 'player_backgrounded' event
- Start 5-minute timeout to disconnect if still backgrounded

// On page foreground:
- Clear background timeout
- Emit 'player_foregrounded' event
- Request state sync if in match
- Reconnect if disconnected during background
```

**Backend:**
```typescript
// Track background events
- Log visibility changes
- Apply 30s grace period if disconnect occurs during background
- Restore state on foreground within grace period
```

**Benefits:**
- Mobile users can briefly switch apps without losing match/queue state
- Prolonged background (>5 min) saves battery by disconnecting
- Automatic reconnection and state restoration on foreground

### 5. Enhanced Reconnection Strategy

**File:** `frontend/src/context/SocketContext.tsx`

Improved reconnection with exponential backoff + jitter:

```typescript
// Infinite reconnection attempts
const MAX_RECONNECT_ATTEMPTS = Infinity;

// Exponential backoff with jitter
const calculateBackoffWithJitter = (attempt: number): number => {
  const exponentialDelay = Math.min(
    RECONNECT_DELAY_MS * Math.pow(2, attempt),
    MAX_RECONNECT_DELAY_MS
  );
  // Add 0-25% jitter to prevent thundering herd
  const jitter = Math.random() * exponentialDelay * 0.25;
  return exponentialDelay + jitter;
};
```

**Reconnection Pattern:**
- Attempt 0: ~2000ms (2s + 0-500ms jitter)
- Attempt 1: ~4000ms (4s + 0-1000ms jitter)
- Attempt 2: ~8000ms (8s + 0-2000ms jitter)
- Attempt 3+: ~15000ms (15s + 0-3750ms jitter, capped)

**Benefits:**
- Prevents "thundering herd" when server restarts (jitter spreads reconnections)
- Never gives up reconnecting (Infinity attempts)
- Smart backoff reduces server load during outages

### 6. Socket Singleton Protection

**File:** `frontend/src/context/SocketContext.tsx`

Prevents unnecessary socket recreation:

```typescript
// Don't recreate if socket exists and token unchanged
if (socket && socket.connected && socket.auth.token === state.token) {
  console.log('[SocketProvider] Socket already connected with same token, skipping recreation');
  return;
}
```

**Benefits:**
- Prevents socket churn on component re-renders
- Maintains single stable connection per session
- Only recreates when necessary (new token or disconnected)

## Configuration Summary

### Environment Variables

No new environment variables required. Existing configs are used:

```bash
# Backend (.env)
FRONTEND_URL=https://your-app.vercel.app  # Already supported for CORS
MATCHMAKING_TIMEOUT_MS=30000              # Already used for queue timeout
```

### Socket.IO Config

**Backend:**
- Transports: `['websocket', 'polling']` (hybrid)
- pingInterval: `20000ms` (keep-alive every 20s)
- pingTimeout: `60000ms` (wait 60s for pong)
- perMessageDeflate: `false` (disabled)
- httpCompression: `false` (disabled)
- allowEIO3: `true` (backward compatibility)

**Frontend:**
- Transports: `['websocket', 'polling']` (hybrid)
- reconnectionAttempts: `Infinity` (never give up)
- reconnectionDelay: `2000ms` (starting delay)
- reconnectionDelayMax: `15000ms` (max delay)
- upgrade: `true` (allow polling → websocket)
- rememberUpgrade: `true` (remember successful upgrades)

## Testing & Verification

### Automated Test Script

Run the verification script:

```bash
./test-socket-stability-enhanced.sh
```

This will guide you through manual verification of:
1. ✅ Connection stability (>2 minutes)
2. ✅ No sub-second reconnect churn
3. ✅ Queue grace period (30s)
4. ✅ Background/foreground handling
5. ✅ Heroku H15 prevention
6. ✅ Transport upgrade monitoring
7. ✅ Exponential backoff with jitter

### Manual Testing Checklist

#### Test 1: Stable Connection
```
1. Open browser console
2. Login to app
3. Wait 2+ minutes
4. Verify: Single connection, no reconnects
5. Check: Connection duration in logs
```

#### Test 2: Queue Grace Period
```
1. Join matchmaking queue
2. Close browser tab (simulate disconnect)
3. Wait 10 seconds
4. Reopen and login
5. Verify: Still in queue or matched
```

#### Test 3: Background/Foreground
```
1. Open DevTools console
2. Simulate background:
   Object.defineProperty(document, 'hidden', { value: true, writable: true })
   document.dispatchEvent(new Event('visibilitychange'))
3. Wait 10 seconds
4. Simulate foreground:
   Object.defineProperty(document, 'hidden', { value: false, writable: true })
   document.dispatchEvent(new Event('visibilitychange'))
5. Verify: Connection maintained, state restored
```

#### Test 4: Reconnection Backoff
```
1. Stop backend server
2. Watch console for reconnect attempts
3. Verify: Delays increase with jitter (2s, 4s, 8s, 15s)
4. Verify: Continues indefinitely
5. Restart backend
6. Verify: Reconnects successfully
```

## Monitoring & Observability

### Backend Logs to Watch

```
✅ HTTP server timeouts configured: keepAliveTimeout: 65000ms
✅ CORS allowed origins: [...]
[Connection] Client connected: <socketId>
  Initial Transport: websocket|polling
[Transport Upgrade] Socket <id> upgraded to: websocket
[Keepalive] Ping from <socketId> (Uptime: <ms>)
[QueueGrace] Marked <userId> as disconnected from queue (grace: 30000ms)
[QueueGrace] Restored queue entry for <userId>
[Visibility] Player backgrounded/foregrounded
```

### Frontend Console Logs to Watch

```
[SocketProvider] Connected
  Socket ID: <id>
  Transport: websocket|polling
  Client Version: 4.7.5
[SocketProvider] Transport upgraded from: polling to: websocket
[SocketProvider] Connection stabilized
[SocketProvider] Page backgrounded, notifying server
[SocketProvider] Page foregrounded
[SocketProvider] Attempting reconnect
  Delay: <ms> (with jitter)
  Attempt: <n>
```

### Success Indicators

✅ **Stable Connection:**
- Connection duration >2 minutes
- No sub-second disconnects
- Transport upgraded to WebSocket

✅ **Queue Resilience:**
- Players remain in queue after brief disconnects
- Automatic restoration within 30s grace period
- Clean removal after grace period expiry

✅ **Mobile Support:**
- Background/foreground events logged
- Connection maintained for brief backgrounds (<5min)
- State restored on foreground

✅ **Reconnection:**
- Exponential backoff with jitter
- Infinite attempts (never gives up)
- Successful reconnection after outages

### Failure Indicators

❌ **Connection Issues:**
- Multiple "Connected" messages within seconds
- Connection durations <5 seconds
- Stuck on polling transport (no upgrade)
- Heroku H15 errors in logs

❌ **Queue Problems:**
- Players removed immediately on disconnect
- Queue position lost after brief disconnect
- No grace period logs

❌ **Mobile Issues:**
- Immediate disconnects on background
- State loss on foreground
- No background/foreground events

## Troubleshooting

### Issue: Sub-Second Reconnects

**Symptoms:**
- Multiple connections within 1 second
- Connection durations <1 second

**Solutions:**
1. Check for duplicate SocketProvider instances
2. Verify React StrictMode is disabled in production
3. Check browser console for errors
4. Verify token is stable (not changing rapidly)

### Issue: Heroku H15 Errors

**Symptoms:**
- H15 errors in Heroku logs
- Connections drop after ~55 seconds

**Solutions:**
1. Verify keepAliveTimeout is 65000ms in logs
2. Check Heroku logs for timeout settings
3. Ensure trust proxy is enabled
4. Monitor ping/pong keepalive logs

### Issue: Queue Loss

**Symptoms:**
- Players removed from queue immediately
- No grace period on disconnect

**Solutions:**
1. Check Redis is running and accessible
2. Verify queue grace period logs in backend
3. Check disconnect tracking in Redis
4. Ensure TTL is set correctly (30s)

### Issue: Mobile Disconnects

**Symptoms:**
- Immediate disconnects on background
- No background timeout (5min)

**Solutions:**
1. Verify visibility change events are firing
2. Check background timeout is set
3. Ensure player_backgrounded events are sent
4. Monitor background duration logs

## Performance Impact

### Backend
- CPU: Minimal impact (compression disabled reduces CPU)
- Memory: Slight increase for queue grace tracking in Redis
- Network: Slightly higher due to keepalive pings (20s interval)

### Frontend
- Memory: Minimal impact (single socket instance)
- Network: Slightly higher due to reconnection attempts with backoff
- Battery: Reduced battery drain with 5-min background disconnect

## Future Improvements

### Potential Enhancements
1. Implement automatic reconnection on network change events
2. Add retry logic for failed state sync requests
3. Implement connection quality monitoring (latency, packet loss)
4. Add server-side queue position persistence across restarts
5. Implement WebRTC data channels for ultra-low-latency matches

### Monitoring Recommendations
1. Add metrics for connection duration distribution
2. Track reconnection attempt counts
3. Monitor queue grace period usage
4. Alert on high reconnection rates
5. Dashboard for transport upgrade success rates

## References

- [Socket.IO Transports](https://socket.io/docs/v4/how-it-works/)
- [Heroku HTTP Routing](https://devcenter.heroku.com/articles/http-routing)
- [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [Exponential Backoff](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
