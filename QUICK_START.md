# Quick Start Guide - Blink Battle

This guide will help you get the Blink Battle application running locally in under 10 minutes.

## Prerequisites Checklist

Before you begin, ensure you have:
- [ ] Node.js 18+ installed (`node --version`)
- [ ] PostgreSQL 14+ installed and running
- [ ] Redis 6+ installed and running
- [ ] Git installed

## Step-by-Step Setup

### 1. Clone and Navigate
```bash
git clone https://github.com/Goutamdhanani/blink-battle.git
cd blink-battle
```

### 2. Backend Setup (Terminal 1)

```bash
# Navigate to backend
cd backend

# Install dependencies (takes ~1-2 minutes)
npm install

# Create environment file
cp .env.example .env

# Edit .env with your database credentials
# Minimum required:
# - DATABASE_URL=postgresql://user:password@localhost:5432/blink_battle
# - REDIS_URL=redis://localhost:6379
# - JWT_SECRET=your_secret_here

# Create database
createdb blink_battle

# Run migrations
npm run migrate

# Start backend server
npm run dev
```

Backend should now be running on `http://localhost:3001`

### 3. Frontend Setup (Terminal 2)

```bash
# Open a new terminal
cd blink-battle/frontend

# Install dependencies (takes ~1-2 minutes)
npm install

# Create environment file
cp .env.example .env

# Edit .env if needed (default should work)
# VITE_API_URL=http://localhost:3001

# Start frontend server
npm run dev
```

Frontend should now be running on `http://localhost:3000`

### 4. Test the Application

1. Open your browser to `http://localhost:3000`
2. Click "Demo Mode (Test Wallet)" to create a test account
3. You should see the Dashboard with your stats
4. Try clicking "Play Free" to test the matchmaking

## Common Issues & Solutions

### Issue: Database connection error
**Solution**: Make sure PostgreSQL is running
```bash
# On macOS
brew services start postgresql

# On Linux
sudo systemctl start postgresql

# Check if running
psql -U postgres -c "SELECT version();"
```

### Issue: Redis connection error
**Solution**: Make sure Redis is running
```bash
# On macOS
brew services start redis

# On Linux
sudo systemctl start redis

# Check if running
redis-cli ping
# Should return: PONG
```

### Issue: Port already in use
**Solution**: Change the port in .env files
```bash
# Backend .env
PORT=3002

# Or kill the process using the port
lsof -ti:3001 | xargs kill -9
```

### Issue: Cannot find module errors
**Solution**: Clear cache and reinstall
```bash
rm -rf node_modules package-lock.json
npm install
```

## Testing Matchmaking (2 Players)

Since matchmaking requires two players, you have two options:

### Option 1: Open Two Browser Windows
1. Open `http://localhost:3000` in Chrome
2. Open `http://localhost:3000` in Incognito/Private mode
3. Login with different demo accounts in each
4. Join matchmaking with the same stake in both

### Option 2: Use Two Different Browsers
1. Chrome: `http://localhost:3000`
2. Firefox: `http://localhost:3000`
3. Login with different demo accounts
4. Join matchmaking with the same stake

## Development Commands

### Backend
```bash
# Development with auto-reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run database migrations
npm run migrate

# Lint code
npm run lint
```

### Frontend
```bash
# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## Environment Variables Explained

### Backend (.env)
```bash
# Server configuration
PORT=3001                              # Server port
NODE_ENV=development                   # Environment mode

# Database
DATABASE_URL=postgresql://...          # PostgreSQL connection string

# Redis
REDIS_URL=redis://localhost:6379       # Redis connection string

# Security
JWT_SECRET=your_secret_key             # JWT token signing key

# Worldcoin (for production)
WORLDCOIN_APP_ID=your_app_id          # Your Worldcoin app ID
WORLDCOIN_ACTION=your_action          # Your Worldcoin action

# Game Configuration
PLATFORM_FEE_PERCENT=3                 # Platform fee (3%)
MIN_REACTION_MS=80                     # Minimum valid reaction time
MAX_REACTION_MS=3000                   # Maximum valid reaction time
SIGNAL_DELAY_MIN_MS=2000              # Minimum signal delay
SIGNAL_DELAY_MAX_MS=5000              # Maximum signal delay
MATCHMAKING_TIMEOUT_MS=30000          # Matchmaking timeout
```

### Frontend (.env)
```bash
# API Configuration
VITE_API_URL=http://localhost:3001    # Backend API URL
```

## Verifying Everything Works

### Backend Health Check
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Database Check
```bash
# Connect to database
psql -d blink_battle

# Check tables
\dt

# Should see: users, matches, transactions
```

### Redis Check
```bash
redis-cli
> PING
# Should return: PONG
> exit
```

## Next Steps

Once everything is running:

1. **Explore the UI**: Navigate through Dashboard, Matchmaking, Game Arena
2. **Test Free Mode**: Play a practice match (single player)
3. **Test PvP Mode**: Open two browsers and play against yourself
4. **Check Match History**: View your past games
5. **View Leaderboard**: See your ranking

## Getting Help

If you encounter issues:

1. Check the [README.md](README.md) for detailed documentation
2. Review the [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
3. Check backend logs in Terminal 1
4. Check frontend logs in Terminal 2
5. Open browser DevTools Console for frontend errors

## Development Tips

### Hot Reload
Both frontend and backend support hot reload - changes will automatically restart the servers.

### Debugging
- Backend: Use `console.log()` - output appears in Terminal 1
- Frontend: Use browser DevTools Console (F12)
- WebSocket: Check Network tab → WS filter

### Database GUI
For easier database management, install:
- [pgAdmin](https://www.pgadmin.org/) for PostgreSQL
- [RedisInsight](https://redis.com/redis-enterprise/redis-insight/) for Redis

### API Testing
Use tools like:
- [Postman](https://www.postman.com/)
- [Insomnia](https://insomnia.rest/)
- curl commands

Example:
```bash
# Test authentication
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x1234567890abcdef"}'
```

## Production Deployment

For production deployment to Heroku, see the [README.md](README.md) deployment section.

---

**Happy Coding! ⚡**
