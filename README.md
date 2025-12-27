# ⚡ Blink Battle - Worldcoin Mini-App Reaction Game

A real-time reaction-based PvP game built as a **Worldcoin Mini-App** that runs inside **World App**. Players compete to test their reflexes and win WLD tokens.

## 🌍 What is a Mini-App?

Blink Battle is a **Worldcoin Mini-App** - a web application that runs natively inside the World App using the **MiniKit SDK**. This means:

- ✅ **No wallet connection** - users are automatically authenticated via World App
- ✅ **Integrated payments** - seamless WLD payments using MiniKit Pay command
- ✅ **World ID verification** - optional anti-cheat using World ID proofs
- ✅ **Native experience** - haptic feedback and mobile-optimized UI
- ✅ **Secure authentication** - Sign-In with Ethereum (SIWE) via MiniKit

## 🎮 Overview

Blink Battle is a fast-paced multiplayer reaction game where two players face off to see who has the fastest reflexes. Players wait for a random signal and tap as quickly as possible - the fastest valid reaction wins the match and takes home the prize!

## ✨ Features

### Game Modes
- **🎯 Practice Mode**: Single-player reaction test for skill improvement (no matchmaking, fully client-side)
- **💎 PvP Staking**: Compete with real WLD stakes (0.1 / 0.25 / 0.5 / 1.0 WLD)

### Core Mechanics
- **Cryptographic RNG**: Server-side random delay (2-5 seconds) for fair play
- **Anti-Cheat System**: 
  - Server-side timestamp validation
  - Bot detection (reactions < 80ms flagged)
  - False start detection
  - Pattern analysis
- **Smart Matchmaking**: 
  - Stake-based queuing
  - 30-second timeout with alternative suggestions
  - Cancel anytime before match starts
- **Edge Case Handling**:
  - False starts → Automatic loss or rematch
  - Ties (within 1ms) → Split pot 50/50
  - Disconnects → Automatic refund or win by default
  - Timeouts → Opponent wins

### Platform Features
- **3% Platform Fee**: Winner receives 97% of total pot
- **Escrow System**: Funds locked securely during matches
- **Match History**: Track all your games and stats
- **Global Leaderboard**: Compete for the top spot
- **Real-time Updates**: WebSocket-powered live gameplay

## 🏗️ Tech Stack

### Frontend (Mini-App)
- **React 18** with TypeScript
- **Vite** for fast development
- **@worldcoin/minikit-js** - MiniKit SDK for World App integration
- **Socket.io Client** for real-time communication
- **Canvas Confetti** for victory celebrations
- **Axios** for API requests

### Backend
- **Node.js** with Express
- **TypeScript** for type safety
- **@worldcoin/minikit-js** - MiniKit SDK for backend verification
- **SIWE** - Sign-In with Ethereum
- **Socket.io** for WebSocket handling
- **PostgreSQL** for data persistence
- **Redis** for matchmaking queues and caching
- **JWT** for authentication
- **Axios** for Developer Portal API calls

### MiniKit Integration
- **Wallet Authentication** - SIWE via MiniKit `walletAuth` command
- **Payments** - WLD staking via MiniKit `pay` command
- **World ID** - Optional verification via MiniKit `verify` command
- **Haptic Feedback** - Native haptics via MiniKit `sendHapticFeedback`
- **Payment Verification** - Developer Portal API integration

## 💳 Payment Flow

### Overview

Blink Battle uses MiniKit's built-in Pay command for secure WLD payments. All payment operations are idempotent and persist in the database to survive server restarts.

### Flow Diagram

```
User Initiates Battle
        ↓
Frontend: Check Auth (JWT token in localStorage)
        ↓ (if not authenticated)
MiniKit: walletAuth() → SIWE signature → Backend verification → JWT token
        ↓
Frontend: Request payment reference
        ↓
Backend: Create payment record (idempotent)
        ↓
Frontend: MiniKit.commandsAsync.pay()
        ↓
User: Approve payment in World App
        ↓
Frontend: Send transaction_id to backend
        ↓
Backend: Verify with Developer Portal API
        ↓
Backend: Update payment status to confirmed
        ↓
Frontend: Join matchmaking queue
```

### Key Features

1. **Idempotency**: All payment endpoints are safe to retry
   - `initiate-payment`: Returns existing payment if reference already exists
   - `confirm-payment`: Safe to call multiple times with same transaction

2. **Database Persistence**: Payments stored in PostgreSQL
   - Survives server restarts
   - Enables payment history and auditing
   - Prevents duplicate charges

3. **Transaction Status Handling**:
   - `pending`: Transaction submitted but not yet mined
   - `mined`: Transaction confirmed on-chain
   - `failed`: Transaction failed or rejected

4. **Security**:
   - All payment endpoints require JWT authentication
   - Developer Portal API key never exposed to client
   - User ownership verification for all payment operations

### Backend Endpoints

#### POST /api/initiate-payment
**Authentication**: Required (JWT)

Initiates a payment and returns a reference ID for MiniKit Pay.

**Request**:
```json
{
  "amount": 0.5
}
```

**Response**:
```json
{
  "success": true,
  "id": "abc123def456..."
}
```

#### POST /api/confirm-payment
**Authentication**: Required (JWT)

Verifies payment with Developer Portal and updates status.

**Request**:
```json
{
  "payload": {
    "status": "success",
    "reference": "abc123def456...",
    "transaction_id": "0x..."
  }
}
```

**Response**:
```json
{
  "success": true,
  "transaction": {
    "status": "mined",
    "transaction_id": "0x..."
  },
  "payment": {
    "id": "abc123def456...",
    "amount": 0.5,
    "status": "confirmed"
  }
}
```

#### GET /api/payment/:reference
**Authentication**: Required (JWT)

Get payment status by reference ID.

**Response**:
```json
{
  "success": true,
  "payment": {
    "id": "abc123def456...",
    "amount": 0.5,
    "status": "confirmed",
    "transactionId": "0x...",
    "createdAt": "2024-01-01T00:00:00Z",
    "confirmedAt": "2024-01-01T00:01:00Z"
  }
}
```

### Frontend Integration

```typescript
// Initiate payment flow (from Matchmaking component)
const result = await minikit.initiatePayment(selectedStake);

if (result.success) {
  if (result.pending) {
    // Transaction is pending on-chain
    showPendingMessage();
  } else {
    // Payment confirmed, proceed to matchmaking
    joinMatchmaking();
  }
} else {
  // Handle error
  showError(result.error);
}
```

### Error Handling

Common errors and solutions:

- **401 Unauthorized**: Token expired or missing
  - Solution: Trigger walletAuth flow again
  
- **404 Payment Not Found**: Invalid reference
  - Solution: Initiate new payment
  
- **403 Forbidden**: Payment belongs to different user
  - Solution: Security error, should not happen in normal flow

- **Pending Transaction**: On-chain confirmation in progress
  - Solution: Wait and retry after a few seconds

### Database Schema

```sql
CREATE TABLE payments (
  payment_id UUID PRIMARY KEY,
  reference VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(user_id),
  amount DECIMAL(10, 4) NOT NULL,
  status VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(255),
  match_id UUID REFERENCES matches(match_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP
);
```

### Environment Variables

**Backend** (required for payments):
- `APP_ID`: Worldcoin App ID from Developer Portal
- `DEV_PORTAL_API_KEY`: API key for payment verification
- `PLATFORM_WALLET_ADDRESS`: Your Ethereum wallet address
- `JWT_SECRET`: Secret key for JWT tokens
- `DATABASE_URL`: PostgreSQL connection string

**Frontend** (required for payments):
- `VITE_APP_ID`: Must match backend APP_ID
- `VITE_PLATFORM_WALLET_ADDRESS`: Must match backend address

## 📦 Project Structure

```
blink-battle/
├── frontend/                    # React Mini-App
│   ├── src/
│   │   ├── components/         # UI components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── GameArena.tsx
│   │   │   ├── Matchmaking.tsx
│   │   │   ├── WalletConnect.tsx
│   │   │   ├── ResultScreen.tsx
│   │   │   ├── MatchHistory.tsx
│   │   │   └── Leaderboard.tsx
│   │   ├── hooks/              # Custom hooks
│   │   │   ├── useWorldcoin.ts
│   │   │   ├── useWebSocket.ts
│   │   ├── context/            # React context
│   │   │   └── GameContext.tsx
│   │   └── App.tsx
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── controllers/        # API controllers
│   │   │   ├── authController.ts
│   │   │   ├── matchController.ts
│   │   │   └── leaderboardController.ts
│   │   ├── services/           # Business logic
│   │   │   ├── matchmaking.ts
│   │   │   ├── escrow.ts
│   │   │   ├── antiCheat.ts
│   │   │   └── randomness.ts
│   │   ├── websocket/          # WebSocket handlers
│   │   │   └── gameHandler.ts
│   │   ├── models/             # Data models
│   │   │   ├── User.ts
│   │   │   ├── Match.ts
│   │   │   └── Transaction.ts
│   │   ├── config/             # Configuration
│   │   │   ├── database.ts
│   │   │   ├── redis.ts
│   │   │   └── migrate.ts
│   │   └── index.ts
│   ├── Procfile                # Heroku deployment
│   └── package.json
└── README.md
```

## 🚀 Getting Started

This project is a Worldcoin Mini-App. For complete setup instructions including Developer Portal configuration, see the **[MiniKit Setup Guide](./MINIKIT_SETUP.md)**.

### Required Environment Variables

#### Backend (.env)

**Critical variables (app will fail to start if missing):**
- `APP_ID` - Your Worldcoin App ID from Developer Portal (e.g., `app_staging_xxxxx`)
- `DEV_PORTAL_API_KEY` - Your Developer Portal API key for payment verification
- `PLATFORM_WALLET_ADDRESS` - Ethereum address for receiving payments (must be valid 0x... format)
- `JWT_SECRET` - Secret key for JWT token generation
- `DATABASE_URL` - PostgreSQL connection string

**Optional but recommended:**
- `REDIS_URL` - Redis connection string (defaults to `redis://localhost:6379`)
- `PORT` - Server port (defaults to 3001)
- `FRONTEND_URL` - Frontend URL for CORS (defaults to `http://localhost:3000`)
- `DEBUG_AUTH` - Set to `true` to enable detailed authentication logging

#### Frontend (.env)

**Critical variables (app will fail or have limited functionality if missing):**
- `VITE_APP_ID` - Your Worldcoin App ID (same as backend APP_ID)
- `VITE_PLATFORM_WALLET_ADDRESS` - Platform wallet address (same as backend)

**Optional:**
- `VITE_API_URL` - Backend API URL (defaults to `http://localhost:3001`)

### Quick Start (Development)

#### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Worldcoin Developer Account ([developer.worldcoin.org](https://developer.worldcoin.org))
- World App installed on mobile device

#### Backend Setup

1. **Clone and install**
   ```bash
   git clone https://github.com/Goutamdhanani/blink-battle.git
   cd blink-battle/backend
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```
   
   **⚠️ Important:** Ensure all critical variables are set:
   - Get `APP_ID` and `DEV_PORTAL_API_KEY` from [developer.worldcoin.org](https://developer.worldcoin.org)
   - Set `PLATFORM_WALLET_ADDRESS` to your Ethereum wallet address
   - Generate a strong `JWT_SECRET` (e.g., `openssl rand -base64 32`)

3. **Set up database**
   
   For local development with PostgreSQL (no SSL):
   ```bash
   npm run migrate
   ```
   
   For managed Postgres instances (Heroku, AWS RDS, etc.) that require SSL:
   ```bash
   DATABASE_SSL=true npm run migrate
   # Or add DATABASE_SSL=true to your .env file
   ```
   
   **Note:** Commands can be run from the backend directory or from the repo root:
   ```bash
   # From repo root
   cd backend && npm run migrate
   
   # From backend directory
   cd blink-battle/backend
   npm run migrate
   ```

4. **Start server**
   ```bash
   npm run dev
   ```
   
   The server will validate all critical environment variables on startup. If any are missing, you'll see a clear error message.

#### Frontend Setup

1. **Navigate and install**
   ```bash
   cd ../frontend
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Add your APP_ID and PLATFORM_WALLET_ADDRESS
   ```
   
   **⚠️ Important:** 
   - Set `VITE_APP_ID` to the same value as backend `APP_ID`
   - Set `VITE_PLATFORM_WALLET_ADDRESS` to the same wallet address

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Test in World App**
   - Enable Developer Mode in World App
   - Add `http://localhost:3000` (or ngrok URL)
   - Open the Mini-App in World App

For detailed setup instructions, troubleshooting, and deployment guides, see **[MINIKIT_SETUP.md](./MINIKIT_SETUP.md)**.

## 🎯 Game Flow

1. **Open in World App**: Launch the Mini-App inside World App
2. **Auto-Authentication**: Sign in with World App wallet (SIWE)
3. **Mode Selection**: Choose Practice or PvP mode
4. **Matchmaking**: For PvP, stake WLD via MiniKit Pay command
5. **Match Confirmation**: Funds locked in escrow, opponent matched
6. **Countdown**: 3... 2... 1... (with haptic feedback)
7. **Random Delay**: 2-5 seconds wait
8. **Signal Appears**: Tap as fast as possible! (with haptic feedback)
9. **Validation**: Server validates reactions with anti-cheat
10. **Results**: Winner determined, funds distributed (with haptic feedback)
11. **Post-Match**: View stats, play again, or return to dashboard

## 🔒 Security Features

- **Server-Side Validation**: All game logic runs on server
- **Cryptographic RNG**: Unpredictable signal timing
- **Anti-Bot Detection**: Flags reactions < 80ms
- **World ID Verification**: Optional enhanced trust via MiniKit
- **SIWE Authentication**: Secure wallet-based authentication
- **Payment Verification**: Developer Portal API validation
- **Audit Logging**: All matches logged for review
- **Escrow Protection**: Funds locked until match completion
- **JWT Authentication**: Secure API access

## 🏆 Scoring & Payouts

| Scenario | Result |
|----------|--------|
| Normal Win | Winner gets 97% of pot (2x stake × 0.97) |
| Tie (±1ms) | Both get 48.5% (split pot minus fee) |
| False Start | Opponent wins by default |
| Both False Start (1st) | Free rematch |
| Both False Start (2nd) | Cancelled, refund minus 3% |
| Disconnect Before Signal | Full refund to both |
| Disconnect After Signal | Opponent wins |
| Timeout (3s) | Opponent wins |

## 📊 Database Schema

### Users Table
- `user_id` (UUID, PK)
- `wallet_address` (VARCHAR, UNIQUE)
- `region` (VARCHAR)
- `wins` (INTEGER)
- `losses` (INTEGER)
- `avg_reaction_time` (DECIMAL)
- `created_at` (TIMESTAMP)

### Matches Table
- `match_id` (UUID, PK)
- `player1_id` (UUID, FK)
- `player2_id` (UUID, FK)
- `stake` (DECIMAL)
- `player1_reaction_ms` (INTEGER)
- `player2_reaction_ms` (INTEGER)
- `winner_id` (UUID, FK)
- `status` (VARCHAR)
- `fee` (DECIMAL)
- `signal_timestamp` (BIGINT)
- `false_start_count` (INTEGER)
- `created_at` (TIMESTAMP)
- `completed_at` (TIMESTAMP)

### Transactions Table
- `transaction_id` (UUID, PK)
- `match_id` (UUID, FK)
- `type` (VARCHAR: stake/payout/refund/fee)
- `amount` (DECIMAL)
- `from_wallet` (VARCHAR)
- `to_wallet` (VARCHAR)
- `status` (VARCHAR)
- `created_at` (TIMESTAMP)

## 🚢 Deployment

This Mini-App requires both frontend and backend deployment.

### Backend (Heroku)

```bash
# Create app and add addons
heroku create your-app-name
heroku addons:create heroku-postgresql:mini
heroku addons:create heroku-redis:mini

# Set all required environment variables
heroku config:set APP_ID=your_app_id
heroku config:set DEV_PORTAL_API_KEY=your_api_key
heroku config:set PLATFORM_WALLET_ADDRESS=0xYourWalletAddress
heroku config:set JWT_SECRET=$(openssl rand -base64 32)
heroku config:set DATABASE_SSL=true

# IMPORTANT: Set CORS allowed origins
heroku config:set FRONTEND_URL=https://your-frontend.vercel.app
# If you have multiple frontend URLs (staging, production):
heroku config:set FRONTEND_URL_PRODUCTION=https://your-prod-frontend.vercel.app

# Deploy
git push heroku main
heroku run npm run migrate
```

### Frontend (Vercel/Netlify)

```bash
# Update .env with production backend URL
VITE_API_URL=https://your-backend-app.herokuapp.com
VITE_APP_ID=app_staging_your_app_id
VITE_PLATFORM_WALLET_ADDRESS=0xYourWalletAddress

# Deploy to Vercel
vercel deploy

# Or deploy to Netlify
netlify deploy
```

**Important Configuration Notes:**

1. **CORS Configuration**: The backend MUST have your frontend URL set in `FRONTEND_URL` or `FRONTEND_URL_PRODUCTION` to allow API requests. Without this, all API calls will fail with CORS errors.

2. **API URL**: The frontend MUST have `VITE_API_URL` pointing to your deployed backend. If not set, it will try to use localhost (which won't work in production).

3. **Matching IDs**: `VITE_APP_ID` on frontend must exactly match `APP_ID` on backend.

4. **Update Developer Portal**: After deployment, update redirect URLs in the Worldcoin Developer Portal to point to your production URLs.

For detailed deployment instructions, see **[MINIKIT_SETUP.md](./MINIKIT_SETUP.md)**.

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

## 📝 API Documentation

### MiniKit Integration APIs

#### Authentication (SIWE)
- `GET /api/auth/nonce` - Generate nonce for SIWE
- `POST /api/auth/verify-siwe` - Verify SIWE signature
- `POST /api/auth/login` - Legacy login (demo mode)
- `GET /api/auth/me` - Get current user

#### Payments (MiniKit)
- `POST /api/initiate-payment` - Initialize payment reference
- `POST /api/confirm-payment` - Confirm via Developer Portal
- `GET /api/payment/:reference` - Get payment status

#### Verification (World ID)
- `POST /api/verify-world-id` - Verify World ID proof

#### Matches
- `GET /api/matches/history` - Get match history
- `GET /api/matches/:matchId` - Get match details

#### Leaderboard
- `GET /api/leaderboard` - Get global leaderboard
- `GET /api/leaderboard/me` - Get user rank

### WebSocket Events

**Client → Server:**
- `join_matchmaking` - Join queue
- `cancel_matchmaking` - Leave queue
- `player_ready` - Mark ready
- `player_tap` - Send tap

**Server → Client:**
- `match_found` - Opponent found
- `matchmaking_queued` - Queued
- `countdown` - Countdown number
- `signal` - Signal to tap
- `match_result` - Match completed

For complete API documentation, see **[API_REFERENCE.md](./API_REFERENCE.md)**.

## 🔍 Debugging & Troubleshooting

### Common Issues

#### Payment Fails with "Request failed with status code 401"

This error occurs when payment-related API calls don't include proper authentication. 

**Causes:**
1. User is not authenticated (token missing or expired)
2. Token not properly stored in localStorage
3. API client not including Authorization header
4. **CORS configuration blocking credentials in production**
5. **Frontend using wrong API URL (localhost in production)**

**Solutions:**
1. **Check authentication status:**
   - Ensure you're signed in through World App
   - Check browser console for auth errors
   - Look for token in localStorage (DevTools → Application → Local Storage)

2. **Enable debug mode:**
   ```
   Open app with ?debug=1 parameter: https://your-app.com/?debug=1
   ```
   This shows the debug panel with detailed auth flow information.

3. **Verify environment variables:**
   - Backend: `APP_ID`, `DEV_PORTAL_API_KEY`, `JWT_SECRET` must be set
   - Frontend: `VITE_APP_ID` must match backend `APP_ID`
   - **Frontend: `VITE_API_URL` must point to your deployed backend (not localhost)**
   - Check that wallet addresses match between frontend and backend

4. **Check CORS configuration (Production):**
   - Backend must set `FRONTEND_URL` to your deployed frontend URL
   - For multiple frontend URLs, set `FRONTEND_URL_PRODUCTION` as well
   - CORS is configured to allow credentials and specific origins
   - Example Heroku config:
     ```bash
     heroku config:set FRONTEND_URL=https://your-app.vercel.app
     ```

5. **Check backend logs:**
   - Look for JWT verification errors
   - Look for CORS blocking messages: `[CORS] Blocked request from origin: ...`
   - Enable `DEBUG_AUTH=true` in backend .env for detailed logs

6. **Verify API URL in browser console:**
   - Open browser DevTools → Console
   - Look for `[API] Using API URL: ...` message
   - Should show your production backend URL, not localhost

#### App Stuck on "Initializing..." or Loading Screen

**Causes:**
1. MiniKit not properly installed
2. Missing or incorrect `VITE_APP_ID`
3. Race condition in MiniKit initialization
4. Running outside World App

**Solutions:**
1. **Verify you're in World App:**
   - The app must be opened inside World App, not in a regular browser
   - Check debug panel: MiniKit Installed should show ✅

2. **Check environment variables:**
   - Ensure `VITE_APP_ID` is set in frontend `.env`
   - Format should be: `app_staging_xxxxx` or `app_xxxxx`

3. **Clear cache and restart:**
   - Close World App completely
   - Clear app cache
   - Reopen World App and try again

4. **Check console for errors:**
   - Open debug mode with `?debug=1`
   - Look for MiniKit installation errors
   - Check supported commands in debug panel

#### Authentication Issues

If you're experiencing authentication failures or SIWE verification errors, this project includes comprehensive debugging tools:

##### Frontend Debug Panel

Enable the debug panel by adding `?debug=1` to the URL or running in development mode:

```
https://your-app.com/?debug=1
```

The debug panel shows:
- API endpoint being used
- MiniKit installation and readiness status
- Supported World App commands
- Complete auth flow tracking (nonce → walletAuth → verify-siwe)
- Request IDs for correlation with backend logs
- Redacted sensitive data (addresses, signatures)

##### Backend Debug Logging

Enable detailed authentication logs by setting the environment variable:

```bash
DEBUG_AUTH=true npm run dev
```

Debug logs include:
- Nonce generation and store size
- Nonce validation (exists, age)
- SIWE verification attempts and failures
- Request IDs for correlation
- Redacted sensitive information

##### Manual Testing

Test backend auth endpoints:

```bash
./test-auth-debug.sh
```

##### Common Authentication Errors

**"Invalid or expired nonce"**
- Check if backend has multiple instances (nonces are in-memory by default)
- Verify user completed auth within 5 minutes
- Consider using Redis for nonce storage in production

**"SIWE message verification failed"**
- Verify domain/uri configuration matches
- Check for clock skew between client and server
- Review SIWE error details in debug logs

**"Backend verification failed"**
- Check DEBUG_AUTH logs for specific error
- Verify database connectivity
- Ensure JWT_SECRET is configured

#### Missing Environment Variables

**Backend fails to start:**
```
❌ Missing required environment variables:
   - APP_ID
   - DEV_PORTAL_API_KEY
```

**Solution:**
- Copy `.env.example` to `.env`
- Fill in all required variables
- See "Required Environment Variables" section above

**Frontend shows configuration errors:**
- Check browser console for error messages
- Verify `.env` file exists and contains `VITE_APP_ID`
- Restart Vite dev server after changing `.env`

### Database Connection Issues

**"no pg_hba.conf entry" or "no encryption" error**

This error means your Postgres instance requires SSL connections. Most managed Postgres providers (Heroku, AWS RDS, DigitalOcean) require SSL.

**Solution:**
```bash
# Set in your environment
DATABASE_SSL=true npm run migrate
DATABASE_SSL=true npm run dev

# Or add to .env file
DATABASE_SSL=true
```

**For Heroku:**
```bash
heroku config:set DATABASE_SSL=true
```

**"Connection refused" or timeout errors**

Check these potential issues:
1. Verify your `DATABASE_URL` is correct
2. Ensure your IP address is allowed in the database firewall/security group
3. Check if the database server is running and accessible
4. If behind a firewall/VPN, ensure the database port is accessible

**"Authentication failed" errors**

Verify:
1. Database credentials in `DATABASE_URL` are correct
2. Database user has proper permissions
3. Database exists and is accessible

For detailed debugging instructions, see:
- **[AUTH_DEBUGGING.md](./AUTH_DEBUGGING.md)** - Complete debugging guide
- **[DEBUG_PANEL_REFERENCE.md](./DEBUG_PANEL_REFERENCE.md)** - Visual reference

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- **[MiniKit Setup Guide](./MINIKIT_SETUP.md)** - Complete setup and deployment guide
- **[Worldcoin Documentation](https://docs.worldcoin.org/)**
- **[MiniKit SDK Documentation](https://docs.worldcoin.org/minikit)**
- **[Developer Portal](https://developer.worldcoin.org)**
- **[World App Download](https://worldcoin.org/download)**
- **[GitHub Repository](https://github.com/Goutamdhanani/blink-battle)**

## 📞 Support

For issues and questions, please open an issue on GitHub.

---

Made with ⚡ by the Blink Battle Team