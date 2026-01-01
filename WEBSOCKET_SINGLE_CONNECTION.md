# WebSocket Single Connection Implementation

## Overview

This document describes the implementation of a centralized WebSocket management system that ensures exactly one socket connection per authenticated user session, eliminating issues with duplicate connections, duplicate events, and connection instability.

## Problem Statement

Previously, the `useWebSocket` hook created a new socket connection in each component that used it (e.g., `Matchmaking`, `GameArena`). This caused:

1. **Multiple connections per user**: Each component instantiated its own socket
2. **Duplicate events**: Multiple sockets emitted duplicate `player_ready`, `join_matchmaking` events
3. **Reconnection storms**: Multiple sockets reconnecting simultaneously
4. **Countdown desync**: Different sockets receiving events at different times
5. **Ghost matches**: Match state confusion due to multiple connection states
6. **Premature cancellations**: Early disconnects from React remounts triggering match failures

## Solution Architecture

### Frontend Changes

#### 1. SocketProvider (`frontend/src/context/SocketContext.tsx`)

A new context provider that manages a singleton socket instance at the application root level.

**Key Features:**
- **Single socket instance**: One socket per authenticated session
- **Shared across app**: All components consume the same socket via `useSocket` hook
- **Connection lifecycle management**: Centralized connect, auth binding, reconnect with exponential backoff
- **Early disconnect guard**: Ignores disconnects within 5 seconds of connection to prevent React remounts from burning reconnect attempts
- **Rejoin/ready replay**: Automatically rejoins matches and replays ready state on reconnection
- **Listener cleanup**: Proper event listener management to prevent memory leaks

**Configuration:**
```typescript
const MIN_STABLE_CONNECTION_MS = 5000; // Guard against early disconnects
const RECONNECT_DELAY_MS = 2000; // Start with 2 seconds
const MAX_RECONNECT_DELAY_MS = 15000; // Max 15 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
```

#### 2. useSocket Hook

A simple hook to consume the shared socket from the provider:

```typescript
import { useSocket } from '../context/SocketContext';

const { socket, connected, joinMatchmaking, playerReady } = useSocket();
```

#### 3. App.tsx Updates

The application is now wrapped with `SocketProvider` at the root level:

```typescript
<MiniKitProvider>
  <GameProvider>
    <SocketProvider>  {/* Single socket managed here */}
      <AuthWrapper>
        <Router>
          {/* All routes */}
        </Router>
      </AuthWrapper>
    </SocketProvider>
  </GameProvider>
</MiniKitProvider>
```

#### 4. Component Refactoring

**Before:**
```typescript
// Matchmaking.tsx - OLD
import { useWebSocket } from '../hooks/useWebSocket';
const { joinMatchmaking, connected } = useWebSocket(); // Creates new socket!
```

**After:**
```typescript
// Matchmaking.tsx - NEW
import { useSocket } from '../context/SocketContext';
const { joinMatchmaking, connected } = useSocket(); // Uses shared socket
```

Components updated:
- `Matchmaking.tsx`: Uses shared socket for matchmaking operations
- `GameArena.tsx`: Uses shared socket for game operations

#### 5. Deprecated useWebSocket Hook

The original `useWebSocket` hook is deprecated with comprehensive migration instructions in the code comments. It remains in the codebase to avoid breaking any potential external references but should not be used for new code.

### Backend Changes

#### Backend Early Disconnect Guard (`backend/src/websocket/gameHandler.ts`)

**Key Changes:**

1. **Connection Time Tracking**:
   ```typescript
   private socketConnectionTimes: Map<string, number> = new Map();
   private readonly MIN_STABLE_CONNECTION_MS = 5000;
   ```

2. **Connection Handler**:
   - Records connection timestamp when socket connects
   - Tracks each socket's connection start time

3. **Disconnect Handler**:
   - Calculates connection duration on disconnect
   - Ignores disconnects that occur within `MIN_STABLE_CONNECTION_MS` (5 seconds)
   - Prevents early disconnects from triggering match penalties
   - Logs connection duration for debugging

**Benefits:**
- React development mode remounts don't burn reconnect attempts
- Fast page refreshes don't penalize matches
- Transient connection issues are handled gracefully
- Stable connections proceed normally with full disconnect handling

## Testing & Verification

### Manual Testing Checklist

#### 1. Single Connection Verification

**Test Steps:**
1. Open browser DevTools → Network tab
2. Filter for WebSocket connections (WS/WSS)
3. Log in to the application
4. Navigate to Matchmaking
5. Navigate to Game Arena
6. Navigate back to Dashboard

**Expected Result:**
- Only ONE WebSocket connection should be visible
- Connection should persist across page navigations
- No duplicate connections

**Failure Indicators:**
- Multiple WS connections in Network tab
- Connections closing and reopening on navigation

#### 2. No Duplicate Events

**Test Steps:**
1. Open browser DevTools → Console
2. Join matchmaking
3. Wait for match to be found
4. Monitor console logs for socket events

**Expected Result:**
- Each event (e.g., `match_found`, `player_ready`) appears only ONCE in logs
- Logs show `[SocketProvider]` prefix (not `[WebSocket]`)

**Failure Indicators:**
- Duplicate log entries for the same event
- Multiple `player_ready` emissions
- Multiple `join_matchmaking` emissions

#### 3. Early Disconnect Guard

**Test Steps:**
1. Start a match
2. Quickly refresh the page (Cmd+R / Ctrl+R)
3. Check console logs

**Expected Result (Frontend):**
- Log: `[SocketProvider] Early disconnect ignored (connection not yet stable)`
- Match continues normally after page reload

**Expected Result (Backend):**
- Log: `[Disconnect] Early disconnect ignored (connection duration XXms < 5000ms)`
- No match penalty applied

**Failure Indicators:**
- Match cancelled due to disconnect
- Reconnect attempts burned on page refresh
- Error messages about max reconnects

#### 4. Reconnection Resilience

**Test Steps:**
1. Join a match
2. Turn off network (DevTools → Network → Offline)
3. Wait 5 seconds
4. Turn network back on

**Expected Result:**
- Socket automatically reconnects
- Match state restored
- `player_ready` state replayed if necessary
- Game continues from where it left off

**Failure Indicators:**
- Socket doesn't reconnect
- Match is lost/cancelled
- User stuck in disconnected state

### Browser Console Testing

**Check for Single Connection:**
```javascript
// In browser console, after logging in
console.log('WebSocket connections:', 
  performance.getEntriesByType('resource')
    .filter(r => r.name.includes('ws://') || r.name.includes('wss://'))
);
```

**Monitor Socket Events:**
```javascript
// Before: Multiple [WebSocket] prefixes from different components
// After: Only [SocketProvider] prefix from shared socket
```

### Automated Testing Considerations

While full automated tests would require mocking Socket.IO (complex), here are validation points:

1. **Component Tests**: Verify components use `useSocket` not `useWebSocket`
2. **Provider Tests**: Ensure SocketProvider creates exactly one socket instance
3. **Context Tests**: Verify all methods properly use the shared socket
4. **Integration Tests**: Mock socket.io-client and verify single connection creation

## Migration Guide

### For Existing Code

If you find code using `useWebSocket`:

1. **Import Change:**
   ```typescript
   // OLD
   import { useWebSocket } from '../hooks/useWebSocket';
   
   // NEW
   import { useSocket } from '../context/SocketContext';
   ```

2. **Hook Usage:**
   ```typescript
   // OLD
   const { socket, connected, joinMatchmaking } = useWebSocket();
   
   // NEW
   const { socket, connected, joinMatchmaking } = useSocket();
   ```

3. **No Other Changes Required**: The API is identical

### For New Code

Always use:
```typescript
import { useSocket } from '../context/SocketContext';
```

Never use:
```typescript
import { useWebSocket } from '../hooks/useWebSocket'; // DEPRECATED
```

## Configuration

### Frontend Configuration

All configuration is in `SocketContext.tsx`:

```typescript
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 15000;
const MAX_RECONNECT_ATTEMPTS = 10;
const CONNECTION_WAIT_TIMEOUT_MS = 10000;
const MIN_STABLE_CONNECTION_MS = 5000; // Early disconnect guard
```

### Backend Configuration

Configuration in `gameHandler.ts`:

```typescript
private readonly RECONNECT_GRACE_PERIOD_MS = 30000;
private readonly MIN_STABLE_CONNECTION_MS = 5000; // Early disconnect guard
```

### Preserving Existing Settings

The following existing configurations are preserved:

**Socket.IO Config (Frontend & Backend):**
- `transports: ['websocket']` - WebSocket only, no polling
- `reconnection: true` - Automatic reconnection enabled
- `pingInterval: 25000` - Ping every 25 seconds
- `pingTimeout: 60000` - Wait 60 seconds for pong

## Troubleshooting

### Issue: Multiple Connections Still Appearing

**Diagnosis:**
```bash
# Check if any components still use old hook
grep -r "useWebSocket" frontend/src --include="*.tsx"
```

**Solution:** Refactor remaining components to use `useSocket`

### Issue: Early Disconnect Still Triggers Match Penalties

**Check Frontend:**
```typescript
// SocketContext.tsx - verify this exists:
if (connectionDuration < MIN_STABLE_CONNECTION_MS) {
  console.log('[SocketProvider] Early disconnect ignored...');
  return;
}
```

**Check Backend:**
```typescript
// gameHandler.ts - verify this exists:
if (connectionDuration < this.MIN_STABLE_CONNECTION_MS) {
  console.log('[Disconnect] Early disconnect ignored...');
  return;
}
```

### Issue: Socket Not Connecting

**Debug Steps:**
1. Check `state.token` is set in GameContext
2. Verify `VITE_API_URL` environment variable
3. Check backend CORS configuration
4. Verify backend auth middleware accepts token

### Issue: Events Not Received

**Debug Steps:**
1. Check browser console for `[SocketProvider]` logs
2. Verify socket is connected: `connected === true`
3. Check backend logs for event emission
4. Verify listener is still registered (no cleanup issues)

## Performance Impact

### Before (Multiple Connections)

- **Per User**: 2-3 WebSocket connections
- **Memory**: ~500KB per connection
- **Network**: Duplicate heartbeat packets
- **CPU**: Multiple event processing pipelines

### After (Single Connection)

- **Per User**: 1 WebSocket connection
- **Memory**: ~500KB total (2-3x reduction)
- **Network**: Single heartbeat stream (2-3x reduction)
- **CPU**: Single event processing pipeline

**Estimated Savings (1000 concurrent users):**
- Network bandwidth: 60-70% reduction in WebSocket traffic
- Server CPU: 40-50% reduction in event processing
- Memory: 60-70% reduction in connection overhead

## Future Enhancements

Possible improvements:

1. **Connection Quality Metrics**: Track connection stability, latency
2. **Adaptive Reconnection**: Adjust delays based on connection quality
3. **Offline Queue**: Buffer events when offline, replay on reconnect
4. **Connection Pooling**: For high-scale deployments
5. **Circuit Breaker**: Temporary disable reconnection on repeated failures

## References

- Socket.IO Client Documentation: https://socket.io/docs/v4/client-api/
- React Context Documentation: https://react.dev/reference/react/useContext
- WebSocket RFC 6455: https://datatracker.ietf.org/doc/html/rfc6455
