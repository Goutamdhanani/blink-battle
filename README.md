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
- **🎯 Practice Mode**: Free-to-play mode for skill testing without stakes
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
   # Edit .env with your settings (see MINIKIT_SETUP.md)
   ```

3. **Set up database**
   ```bash
   npm run migrate
   ```

4. **Start server**
   ```bash
   npm run dev
   ```

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

# Set all required environment variables (see MINIKIT_SETUP.md)
heroku config:set APP_ID=your_app_id
heroku config:set DEV_PORTAL_API_KEY=your_api_key
# ... (see MINIKIT_SETUP.md for complete list)

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

**Important**: Update redirect URLs in the Worldcoin Developer Portal after deployment.

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

### Authentication Issues

If you're experiencing authentication failures or SIWE verification errors, this project includes comprehensive debugging tools:

#### Frontend Debug Panel

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

#### Backend Debug Logging

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

#### Manual Testing

Test backend auth endpoints:

```bash
./test-auth-debug.sh
```

#### Common Issues

**"Invalid or expired nonce"**
- Check if backend has multiple instances (nonces are in-memory)
- Verify user completed auth within 5 minutes
- Consider migrating to Redis-based nonce storage

**"SIWE message verification failed"**
- Verify domain/uri configuration matches
- Check for clock skew between client and server
- Review SIWE error details in debug logs

**"Backend verification failed"**
- Check DEBUG_AUTH logs for specific error
- Verify database connectivity
- Ensure JWT_SECRET is configured

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