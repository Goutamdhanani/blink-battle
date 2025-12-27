# API Reference - Blink Battle

Complete API documentation for the Blink Battle backend server.

## Base URL
```
Development: http://localhost:3001
Production: https://your-app.herokuapp.com
```

## Authentication

All authenticated endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

### SIWE (Sign-In with Ethereum) Authentication Flow

The recommended authentication method uses SIWE through World App MiniKit:

1. **Get Nonce**: Request a nonce from the server
2. **Sign Message**: Use MiniKit to sign the SIWE message with the nonce
3. **Verify SIWE**: Send the signed payload and nonce to verify and get a JWT token

---

## REST API Endpoints

### Authentication

#### GET /api/auth/nonce
Generate a nonce for SIWE authentication. The nonce is valid for 5 minutes and can only be used once.

**Request Headers:**
```
X-Request-Id: <optional-request-id>
```

**Response:**
```json
{
  "nonce": "abc123def456...",
  "requestId": "uuid-here"
}
```

**Notes:**
- The nonce must be alphanumeric and at least 8 characters long
- Each nonce expires after 5 minutes
- Nonces are single-use and deleted after verification

#### POST /api/auth/verify-siwe
Verify SIWE (Sign-In with Ethereum) message and authenticate user.

**Request Headers:**
```
Content-Type: application/json
X-Request-Id: <optional-request-id>
```

**Request Body:**
```json
{
  "payload": {
    "status": "success",
    "address": "0x1234567890abcdef...",
    "message": "Sign in to Blink Battle...",
    "signature": "0xabc..."
  },
  "nonce": "abc123def456..."
}
```

**Important:** Both `payload` and `nonce` are required. The `nonce` must be the same nonce that was obtained from `GET /api/auth/nonce`.

**Success Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "uuid-here",
    "walletAddress": "0x1234567890abcdef...",
    "wins": 0,
    "losses": 0,
    "avgReactionTime": null
  },
  "requestId": "uuid-here"
}
```

**Error Responses:**

- `400 Bad Request` - Missing or invalid parameters:
  ```json
  {
    "error": "Authentication failed: nonce is required",
    "code": "NONCE_REQUIRED",
    "hint": "The nonce parameter must be included in the request body",
    "requestId": "uuid-here"
  }
  ```

- `401 Unauthorized` - Invalid or expired nonce, or signature verification failed:
  ```json
  {
    "error": "Authentication failed: invalid or expired nonce",
    "code": "NONCE_NOT_FOUND",
    "hint": "Nonce may have expired or been used already. Please request a new nonce.",
    "requestId": "uuid-here"
  }
  ```

**Error Codes:**
- `NONCE_REQUIRED` - Nonce parameter is missing
- `INVALID_NONCE_FORMAT` - Nonce format is invalid
- `INVALID_PAYLOAD` - Payload is missing or has error status
- `NONCE_NOT_FOUND` - Nonce not found in store (expired or used)
- `NONCE_EXPIRED` - Nonce is older than 5 minutes
- `SIWE_VERIFICATION_FAILED` - SIWE signature verification failed
- `INVALID_SIGNATURE` - Signature validation failed
- `NO_WALLET_ADDRESS` - Could not extract wallet address from SIWE message

#### POST /api/auth/login
Authenticate user with wallet address and get JWT token (legacy method for demo/testing).

**Request Body:**
```json
{
  "walletAddress": "0x1234567890abcdef...",
  "region": "America/Los_Angeles" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "uuid-here",
    "walletAddress": "0x1234567890abcdef...",
    "wins": 0,
    "losses": 0,
    "avgReactionTime": null
  }
}
```

#### GET /api/auth/me
Get current authenticated user information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "user": {
    "userId": "uuid-here",
    "walletAddress": "0x1234567890abcdef...",
    "wins": 5,
    "losses": 3,
    "avgReactionTime": 245.5
  }
}
```

---

### Matches

#### GET /api/matches/history
Get match history for authenticated user.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (optional): Number of matches to return (default: 10, max: 100)

**Response:**
```json
{
  "success": true,
  "matches": [
    {
      "matchId": "uuid-here",
      "stake": 0.5,
      "yourReaction": 234,
      "opponentReaction": 267,
      "won": true,
      "opponent": {
        "wallet": "0xabcdef...",
        "avgReaction": 280.5
      },
      "completedAt": "2024-12-26T10:30:00.000Z"
    }
  ]
}
```

#### GET /api/matches/:matchId
Get detailed information about a specific match.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "match": {
    "matchId": "uuid-here",
    "stake": 0.5,
    "status": "completed",
    "player1Reaction": 234,
    "player2Reaction": 267,
    "winnerId": "uuid-here",
    "fee": 0.03,
    "createdAt": "2024-12-26T10:28:00.000Z",
    "completedAt": "2024-12-26T10:30:00.000Z"
  },
  "transactions": [
    {
      "transaction_id": "uuid-here",
      "type": "stake",
      "amount": 0.5,
      "from_wallet": "0x123...",
      "to_wallet": "escrow",
      "status": "completed",
      "created_at": "2024-12-26T10:28:00.000Z"
    }
  ]
}
```

---

### Leaderboard

#### GET /api/leaderboard
Get global leaderboard rankings.

**Query Parameters:**
- `limit` (optional): Number of entries to return (default: 10, max: 100)

**Response:**
```json
{
  "success": true,
  "leaderboard": [
    {
      "rank": 1,
      "walletAddress": "0x1234...",
      "wins": 50,
      "losses": 10,
      "avgReactionTime": 215.5,
      "winRate": 0.833
    }
  ]
}
```

#### GET /api/leaderboard/me
Get current user's leaderboard ranking and stats.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "rank": 42,
  "stats": {
    "wins": 15,
    "losses": 8,
    "avgReactionTime": 245.5,
    "winRate": 0.652
  }
}
```

---

## WebSocket API

### Connection
Connect to WebSocket server:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { token: 'your-jwt-token' }
});
```

### Events Reference

#### Client → Server Events

##### join_matchmaking
Join the matchmaking queue.

**Payload:**
```json
{
  "userId": "uuid-here",
  "stake": 0.5,
  "walletAddress": "0x1234..."
}
```

##### cancel_matchmaking
Leave the matchmaking queue.

**Payload:**
```json
{
  "userId": "uuid-here",
  "stake": 0.5
}
```

##### player_ready
Indicate that player is ready to start the match.

**Payload:**
```json
{
  "matchId": "uuid-here"
}
```

##### player_tap
Send tap event during game.

**Payload:**
```json
{
  "matchId": "uuid-here",
  "clientTimestamp": 1703599800000
}
```

---

#### Server → Client Events

##### connect
Emitted when WebSocket connection is established.

**Payload:** None

##### disconnect
Emitted when WebSocket connection is lost.

**Payload:** None

##### matchmaking_queued
Emitted when successfully added to matchmaking queue.

**Payload:**
```json
{
  "stake": 0.5
}
```

##### matchmaking_timeout
Emitted when matchmaking times out (30 seconds).

**Payload:**
```json
{
  "message": "No opponent found",
  "suggestedStakes": [0.1, 0.25, 1.0]
}
```

##### matchmaking_cancelled
Emitted when matchmaking is cancelled.

**Payload:** None

##### match_found
Emitted when an opponent is found.

**Payload:**
```json
{
  "matchId": "uuid-here",
  "opponent": {
    "userId": "uuid-here",
    "wallet": "0xabcdef..."
  },
  "stake": 0.5
}
```

##### game_start
Emitted when game is about to start (after both players ready).

**Payload:**
```json
{
  "countdown": true
}
```

##### countdown
Emitted during countdown sequence.

**Payload:**
```json
{
  "count": 3  // Then 2, then 1
}
```

##### signal
Emitted when the reaction signal appears.

**Payload:**
```json
{
  "timestamp": 1703599800000
}
```

##### match_result
Emitted when match is complete with results.

**Payload:**
```json
{
  "result": "normal_win",
  "winnerId": "uuid-here",
  "player1Reaction": 234,
  "player2Reaction": 267
}
```

**Result Types:**
- `normal_win`: Standard win by fastest reaction
- `tie`: Both players had same reaction (±1ms)
- `player1_false_start`: Player 1 tapped before signal
- `player2_false_start`: Player 2 tapped before signal
- `both_false_start_rematch`: Both false started, rematch initiated
- `both_false_start_cancelled`: Both false started twice, match cancelled
- `timeout`: One or both players didn't tap in time

##### opponent_disconnected
Emitted when opponent disconnects.

**Payload:**
```json
{
  "win": true,
  "refund": false,
  "reason": "after_signal"
}
```

**Reasons:**
- `before_signal`: Disconnect before game signal
- `after_signal`: Disconnect after game signal

##### error
Emitted when an error occurs.

**Payload:**
```json
{
  "message": "Error description"
}
```

---

## Error Responses

All API endpoints follow this error format:

```json
{
  "error": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (access denied)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

---

## Rate Limiting

Currently, no rate limiting is implemented. In production, consider:
- 100 requests per minute per IP
- 1000 requests per hour per authenticated user

---

## Data Types

### User Object
```typescript
{
  userId: string;          // UUID
  walletAddress: string;   // Ethereum address
  wins: number;
  losses: number;
  avgReactionTime?: number; // In milliseconds, null if no matches
}
```

### Match Object
```typescript
{
  matchId: string;              // UUID
  player1Id: string;            // UUID
  player2Id: string;            // UUID
  stake: number;                // WLD amount
  player1ReactionMs?: number;   // Milliseconds
  player2ReactionMs?: number;   // Milliseconds
  winnerId?: string;            // UUID
  status: MatchStatus;
  fee?: number;                 // WLD amount
  signalTimestamp?: number;     // Unix timestamp
  falseStartCount: number;
  createdAt: Date;
  completedAt?: Date;
}
```

### Transaction Object
```typescript
{
  transactionId: string;  // UUID
  matchId: string;        // UUID
  type: TransactionType;  // 'stake' | 'payout' | 'refund' | 'fee'
  amount: number;         // WLD amount
  fromWallet?: string;    // Wallet address
  toWallet?: string;      // Wallet address
  status: TransactionStatus; // 'pending' | 'completed' | 'failed'
  createdAt: Date;
}
```

---

## Example Workflows

### Complete Match Flow

```javascript
// 1. Connect to WebSocket
const socket = io('http://localhost:3001', {
  auth: { token: userToken }
});

// 2. Set up event listeners
socket.on('match_found', (data) => {
  console.log('Match found:', data.matchId);
  // Automatically send player_ready
  socket.emit('player_ready', { matchId: data.matchId });
});

socket.on('countdown', (data) => {
  console.log('Countdown:', data.count);
  // Update UI
});

socket.on('signal', (data) => {
  console.log('SIGNAL! Tap now!');
  // User taps, send event
  socket.emit('player_tap', {
    matchId: currentMatchId,
    clientTimestamp: Date.now()
  });
});

socket.on('match_result', (data) => {
  console.log('Match complete:', data);
  // Show results
});

// 3. Join matchmaking
socket.emit('join_matchmaking', {
  userId: user.userId,
  stake: 0.5,
  walletAddress: user.walletAddress
});
```

### Fetch Match History

```javascript
const response = await fetch('http://localhost:3001/api/matches/history?limit=20', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log('Match history:', data.matches);
```

---

## Testing with curl

### Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x1234567890abcdef"}'
```

### Get User Info
```bash
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Get Leaderboard
```bash
curl http://localhost:3001/api/leaderboard?limit=10
```

---

For more information, see the [README.md](README.md) and [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md).
