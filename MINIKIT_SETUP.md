# 🌍 Worldcoin Mini-App Setup Guide

## Overview

This document provides step-by-step instructions for setting up Blink Battle as a Worldcoin Mini-App using the MiniKit SDK.

## Prerequisites

1. **Worldcoin Developer Account**: Create an account at [developer.worldcoin.org](https://developer.worldcoin.org)
2. **World App**: Install the World App on your mobile device for testing
3. **Node.js**: Version 18 or higher
4. **PostgreSQL**: Version 14 or higher
5. **Redis**: Version 6 or higher

## Developer Portal Configuration

### 1. Create a Mini-App

1. Log in to the [Worldcoin Developer Portal](https://developer.worldcoin.org)
2. Click "Create New App"
3. Select **"Mini App"** as the app type
4. Fill in the details:
   - **App Name**: Blink Battle
   - **Description**: A real-time reaction-based PvP game
   - **Category**: Games

### 2. Configure App Settings

#### App ID
- Copy your `APP_ID` (e.g., `app_staging_xxxxx` for staging)
- This will be used in both frontend and backend

#### Platform Wallet
1. Go to the "Payments" section
2. Add your platform wallet address
3. **Important**: This wallet must be whitelisted to receive payments
4. Copy the wallet address for your environment variables

#### Incognito Actions (Optional for World ID)
1. Navigate to "Incognito Actions"
2. Create a new action: `play-reaction-game`
3. Set verification level to **Orb** (highest security)
4. Copy the action ID

#### API Keys
1. Go to "API Keys" section
2. Generate a new API key for your backend
3. Copy the `DEV_PORTAL_API_KEY`
4. **Keep this secret** - never commit it to version control

### 3. Configure Redirect URLs

Add the following URLs in the Developer Portal:

**Development:**
- `http://localhost:3000`
- `http://localhost:3000/dashboard`

**Production (Heroku):**
- `https://your-app-name.herokuapp.com`
- `https://your-app-name.herokuapp.com/dashboard`

## Frontend Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

The MiniKit SDK (`@worldcoin/minikit-js`) is already included in dependencies.

### 2. Configure Environment Variables

Create a `.env` file in the `frontend` directory:

```env
# API URL (use your Heroku backend URL in production)
VITE_API_URL=http://localhost:3001

# MiniKit Configuration from Developer Portal
VITE_APP_ID=app_staging_your_app_id_here
VITE_PLATFORM_WALLET_ADDRESS=0xYourPlatformWalletAddress
```

### 3. Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## Backend Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

Key packages installed:
- `@worldcoin/minikit-js` - MiniKit SDK for backend verification
- `siwe` - Sign-In with Ethereum library
- `axios` - For Developer Portal API calls

### 2. Configure Environment Variables

Create a `.env` file in the `backend` directory:

```env
# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/blink_battle

# Redis
REDIS_URL=redis://localhost:6379

# MiniKit Configuration (from Developer Portal)
APP_ID=app_staging_your_app_id_here
DEV_PORTAL_API_KEY=your_dev_portal_api_key_here
PLATFORM_WALLET_ADDRESS=0xYourPlatformWalletAddress

# JWT Secret (generate a secure random string)
JWT_SECRET=your_secure_jwt_secret_here

# Game Configuration
PLATFORM_FEE_PERCENT=3
MIN_REACTION_MS=80
MAX_REACTION_MS=3000
SIGNAL_DELAY_MIN_MS=2000
SIGNAL_DELAY_MAX_MS=5000

# Matchmaking
MATCHMAKING_TIMEOUT_MS=30000
MATCH_START_TIMEOUT_MS=60000
```

### 3. Database Setup

Run the migration to create tables:

```bash
npm run migrate
```

### 4. Start Development Server

```bash
npm run dev
```

The server will run on `http://localhost:3001`.

## Testing in World App

### 1. Install World App

- **iOS**: Download from the App Store
- **Android**: Download from Google Play Store

### 2. Access Developer Mode

1. Open World App
2. Go to Settings
3. Enable "Developer Mode"
4. Add your development URL: `http://localhost:3000`

**Note**: For local testing, you may need to use ngrok or a similar tool to expose your local server to the internet:

```bash
ngrok http 3000
```

Then use the ngrok URL in the Developer Portal and World App.

### 3. Test Features

#### Authentication (SIWE)
- The app should auto-detect that it's running in World App
- Click "Sign In with World App"
- Approve the signature request in World App
- You should be redirected to the dashboard

#### Payments
- Select a stake amount in PvP mode
- Click "Find Opponent"
- The MiniKit Pay interface should appear
- Approve the payment in World App
- Wait for matchmaking

#### Haptic Feedback
- During countdown: Warning haptic
- On signal: Success haptic
- On win: Success haptic
- On loss: Warning haptic
- On payment: Success/Error haptic

## Heroku Deployment

### 1. Create Heroku App

```bash
heroku create your-app-name
```

### 2. Add Addons

```bash
# PostgreSQL
heroku addons:create heroku-postgresql:mini

# Redis
heroku addons:create heroku-redis:mini
```

### 3. Set Environment Variables

```bash
# MiniKit Configuration
heroku config:set APP_ID=app_staging_your_app_id
heroku config:set DEV_PORTAL_API_KEY=your_api_key
heroku config:set PLATFORM_WALLET_ADDRESS=0xYourWalletAddress

# Application Configuration
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your_secure_jwt_secret
heroku config:set FRONTEND_URL=https://your-frontend-url.com
heroku config:set PLATFORM_FEE_PERCENT=3
heroku config:set MIN_REACTION_MS=80
heroku config:set MAX_REACTION_MS=3000
heroku config:set SIGNAL_DELAY_MIN_MS=2000
heroku config:set SIGNAL_DELAY_MAX_MS=5000
heroku config:set MATCHMAKING_TIMEOUT_MS=30000
heroku config:set MATCH_START_TIMEOUT_MS=60000
```

### 4. Deploy

```bash
# Backend
cd backend
git push heroku main

# Run migrations
heroku run npm run migrate
```

### 5. Frontend Deployment

For the frontend, use a service like:
- **Vercel**: `vercel deploy`
- **Netlify**: `netlify deploy`
- **GitHub Pages**: Configure in repository settings

Update the frontend `.env` to point to your Heroku backend:

```env
VITE_API_URL=https://your-backend-app.herokuapp.com
```

### 6. Update Developer Portal

After deployment, update the redirect URLs in the Developer Portal to include your production URLs.

## Troubleshooting

### MiniKit Not Detected

**Problem**: `MiniKit.isInstalled()` returns `false`

**Solutions**:
- Ensure you're testing inside the World App
- Check that Developer Mode is enabled
- Verify the URL is correctly configured
- Clear World App cache and restart

### SIWE Authentication Fails

**Problem**: Authentication returns "Invalid SIWE message"

**Solutions**:
- Verify `APP_ID` matches in frontend and backend
- Check that nonce is being generated correctly
- Ensure clock synchronization between client and server
- Check backend logs for detailed error messages

### Payment Not Processing

**Problem**: Payment stuck in "Processing" state

**Solutions**:
- Verify `PLATFORM_WALLET_ADDRESS` is whitelisted in Developer Portal
- Check `DEV_PORTAL_API_KEY` is correct and active
- Ensure the payment reference ID matches on frontend and backend
- Check Developer Portal API logs for failed requests
- Verify WLD token balance in user's wallet

### Haptic Feedback Not Working

**Problem**: No haptic feedback during game

**Solutions**:
- Verify device supports haptic feedback
- Check that `MiniKit.isInstalled()` returns true
- Test with different haptic styles (success, warning, error)
- Check browser console for errors

### Database Connection Issues

**Problem**: Backend can't connect to PostgreSQL

**Solutions**:
- Verify `DATABASE_URL` is correct
- Check PostgreSQL is running: `pg_isready`
- Ensure database exists: `createdb blink_battle`
- Run migrations: `npm run migrate`

### WebSocket Connection Fails

**Problem**: Real-time game features not working

**Solutions**:
- Check CORS settings in backend
- Verify `FRONTEND_URL` environment variable
- Ensure Redis is running
- Check firewall/security group settings in production

## API Endpoints

### Authentication
- `GET /api/auth/nonce` - Generate nonce for SIWE
- `POST /api/auth/verify-siwe` - Verify SIWE signature
- `POST /api/auth/login` - Legacy login (for demo mode)
- `GET /api/auth/me` - Get current user info

### Payments
- `POST /api/initiate-payment` - Initialize payment reference
- `POST /api/confirm-payment` - Confirm payment via Developer Portal
- `GET /api/payment/:reference` - Get payment status

### Verification
- `POST /api/verify-world-id` - Verify World ID proof

### Matches
- `GET /api/matches/history` - Get user's match history
- `GET /api/matches/:matchId` - Get specific match details

### Leaderboard
- `GET /api/leaderboard` - Get global leaderboard
- `GET /api/leaderboard/me` - Get user rank

## WebSocket Events

### Client → Server
- `join_matchmaking` - Join matchmaking queue
- `cancel_matchmaking` - Leave matchmaking queue
- `player_ready` - Mark player as ready
- `player_tap` - Send tap event with timestamp

### Server → Client
- `match_found` - Opponent found
- `matchmaking_queued` - Added to queue
- `matchmaking_timeout` - No opponent found
- `matchmaking_cancelled` - Queue cancelled
- `game_start` - Game starting
- `countdown` - Countdown number
- `signal` - Signal to tap
- `match_result` - Match completed
- `opponent_disconnected` - Opponent left
- `error` - Error occurred

## Security Best Practices

1. **Never commit secrets**: Use `.env` files and `.gitignore`
2. **Validate all inputs**: Both on client and server
3. **Use HTTPS in production**: Required for MiniKit
4. **Implement rate limiting**: Prevent abuse
5. **Monitor API usage**: Track Developer Portal API calls
6. **Rotate API keys regularly**: Update `DEV_PORTAL_API_KEY`
7. **Use server-side timestamps**: Don't trust client timestamps
8. **Implement anti-cheat**: Use World ID verification for high-stakes games

## Resources

- [Worldcoin Developer Docs](https://docs.worldcoin.org/)
- [MiniKit SDK Documentation](https://docs.worldcoin.org/minikit)
- [Developer Portal](https://developer.worldcoin.org)
- [World App Download](https://worldcoin.org/download)
- [GitHub Repository](https://github.com/Goutamdhanani/blink-battle)

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review the [GitHub Issues](https://github.com/Goutamdhanani/blink-battle/issues)
3. Join the Worldcoin Discord community
4. Contact Worldcoin Developer Support
