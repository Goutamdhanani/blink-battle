# ⚡ Blink Battle - Worldcoin Reaction Game

A real-time reaction-based PvP game built as a Worldcoin Mini-App where players compete to test their reflexes and win WLD tokens.

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

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development
- **Socket.io Client** for real-time communication
- **Canvas Confetti** for victory celebrations
- **Axios** for API requests
- **Worldcoin IDKit** for wallet authentication

### Backend
- **Node.js** with Express
- **TypeScript** for type safety
- **Socket.io** for WebSocket handling
- **PostgreSQL** for data persistence
- **Redis** for matchmaking queues and caching
- **JWT** for authentication

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

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Worldcoin Developer Account

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Goutamdhanani/blink-battle.git
   cd blink-battle/backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your settings:
   ```env
   PORT=3001
   NODE_ENV=development
   DATABASE_URL=postgresql://user:password@localhost:5432/blink_battle
   REDIS_URL=redis://localhost:6379
   WORLDCOIN_APP_ID=your_app_id
   WORLDCOIN_ACTION=your_action_name
   JWT_SECRET=your_jwt_secret_key
   PLATFORM_FEE_PERCENT=3
   MIN_REACTION_MS=80
   MAX_REACTION_MS=3000
   SIGNAL_DELAY_MIN_MS=2000
   SIGNAL_DELAY_MAX_MS=5000
   MATCHMAKING_TIMEOUT_MS=30000
   ```

4. **Set up database**
   ```bash
   npm run migrate
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd ../frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   Create `.env` file:
   ```env
   VITE_API_URL=http://localhost:3001
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   Navigate to `http://localhost:3000`

## 🎯 Game Flow

1. **Authentication**: Connect Worldcoin wallet
2. **Mode Selection**: Choose Practice or PvP mode
3. **Matchmaking**: Select stake and find opponent
4. **Match Confirmation**: Funds locked in escrow
5. **Countdown**: 3... 2... 1...
6. **Random Delay**: 2-5 seconds wait
7. **Signal Appears**: Tap as fast as possible!
8. **Validation**: Server validates reactions
9. **Results**: Winner determined, funds distributed
10. **Post-Match**: View stats, play again, or return to dashboard

## 🔒 Security Features

- **Server-Side Validation**: All game logic runs on server
- **Cryptographic RNG**: Unpredictable signal timing
- **Anti-Bot Detection**: Flags reactions < 80ms
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

### Heroku Deployment

1. **Create Heroku app**
   ```bash
   heroku create your-app-name
   ```

2. **Add addons**
   ```bash
   heroku addons:create heroku-postgresql:hobby-dev
   heroku addons:create heroku-redis:hobby-dev
   ```

3. **Set environment variables**
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set JWT_SECRET=your_production_secret
   heroku config:set WORLDCOIN_APP_ID=your_app_id
   # ... other variables
   ```

4. **Deploy**
   ```bash
   git push heroku main
   ```

5. **Run migrations**
   ```bash
   heroku run npm run migrate
   ```

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

### Authentication
- `POST /api/auth/login` - Authenticate with wallet
- `GET /api/auth/me` - Get current user

### Matches
- `GET /api/matches/history` - Get match history
- `GET /api/matches/:matchId` - Get match details

### Leaderboard
- `GET /api/leaderboard` - Get global leaderboard
- `GET /api/leaderboard/me` - Get user rank

### WebSocket Events
- `join_matchmaking` - Join matchmaking queue
- `cancel_matchmaking` - Leave queue
- `player_ready` - Mark as ready
- `player_tap` - Send tap event
- `match_found` - Opponent found
- `countdown` - Countdown number
- `signal` - Signal appears
- `match_result` - Match completed

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [Worldcoin Documentation](https://docs.worldcoin.org/)
- [World App Mini-Apps Guide](https://docs.worldcoin.org/mini-apps)

## 📞 Support

For issues and questions, please open an issue on GitHub.

---

Made with ⚡ by the Blink Battle Team