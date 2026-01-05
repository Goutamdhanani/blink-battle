# 🧠 Blink Battle - Brain Training

A modern, offline-first brain training application built as a **Worldcoin Mini-App**. Train your cognitive skills through engaging memory, attention, and reflex games - all working seamlessly within your browser, even offline!

## 🌟 Features

### 🎮 Brain Training Games

**Memory Match** 🧠
- Match pairs of emoji cards to test your memory
- Progressive difficulty with increasing card counts
- Track accuracy and completion time
- 8+ difficulty levels

**Focus Test** 👁️
- Hit blue targets while avoiding red distractors
- Improves attention span and focus
- Progressive speed increases
- Real-time scoring

**Reflex Rush** ⚡
- Test your reaction time with precision
- 5-trial measurement system
- Detect and penalize false starts
- Track personal bests

### 📊 Premium Stats Dashboard

**Visual Analytics**
- Beautiful space-inspired UI design
- Performance trend graphs with glowing SVG charts
- Skill analysis with radar chart visualization
- Score badges and achievements
- Streaks & habits tracking

**Comprehensive Metrics**
- Total games played
- Average session time
- Overall accuracy percentage
- Game-specific statistics
- Personal bests and averages

### 🔌 Offline-First Architecture

**IndexedDB Storage**
- All game data stored locally
- Works without internet connection
- Persistent across sessions
- Automatic stat calculation

**Progressive Web App**
- Mobile-optimized responsive design
- Works on any device
- Premium glass-morphism UI
- Smooth animations and transitions

### 🌍 Worldcoin MiniKit Integration

**Authentication**
- Sign-In with Ethereum (SIWE) via MiniKit
- Seamless World App integration
- Secure JWT-based sessions
- Optional analytics tracking

## 🏗️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and builds
- **@worldcoin/minikit-js** for World App integration
- **IndexedDB** for offline data storage
- **CSS3** with custom glass-morphism effects

### Backend
- **Node.js** with Express
- **TypeScript** for type safety
- **PostgreSQL** for optional server-side storage
- **JWT** for authentication
- **@worldcoin/minikit-js** for backend verification

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- (Optional) PostgreSQL 14+ for backend
- (Optional) Worldcoin Developer Account for MiniKit features

### Quick Start - Frontend Only (Recommended)

The app works completely offline without a backend!

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser and start training!

### Full Stack Setup (Optional)

If you want authentication and server-side stats:

#### Backend Setup

```bash
cd backend
npm install

# Create .env file
cp .env.example .env
# Edit .env with your settings:
# - APP_ID (from developer.worldcoin.org)
# - JWT_SECRET (generate with: openssl rand -base64 32)
# - DATABASE_URL (PostgreSQL connection string)

# Run migrations
npm run migrate:brain

# Start server
npm run dev
```

#### Frontend Setup with Backend

```bash
cd frontend

# Create .env file
cp .env.example .env
# Add:
# VITE_APP_ID=your_app_id
# VITE_API_URL=http://localhost:3001

npm install
npm run dev
```

## 🎯 How to Play

### Memory Match
1. Click "Memory Match" from the main menu
2. Flip cards to find matching pairs
3. Complete all matches to advance levels
4. Track your moves and time

### Focus Test
1. Select "Focus Test" from the menu
2. Wait for the countdown
3. Tap blue targets (🎯) for points
4. Avoid red distractors (🔴)
5. Complete 30-second rounds

### Reflex Rush
1. Choose "Reflex Rush"
2. Wait for the screen to turn green
3. Tap as quickly as possible
4. Complete 5 trials
5. View your average and best reaction times

## 📱 Premium UI Design

### Design Philosophy
- **Space-inspired dark theme** with cosmic gradients
- **Glass-morphism effects** with frosted blur
- **Neon accents** and glowing elements
- **Smooth animations** for premium feel
- **Mobile-first** responsive design

### Color Palette
- Deep space gradients (navy → indigo → cosmic purple)
- Neon cyan (#00ffff) and magenta (#ff00ff)
- Soft glows and particle effects
- High contrast for accessibility

## 🗄️ Data Storage

### IndexedDB Schema

**Game Scores Store**
```typescript
{
  gameType: 'memory' | 'attention' | 'reflex',
  score: number,
  accuracy: number,
  timeMs: number,
  level: number,
  timestamp: number
}
```

**Automatic Stats Calculation**
- Games played per type
- Best scores
- Average scores and accuracy
- Highest levels achieved
- Last played timestamps

### Achievements System
- Unlock badges for milestones
- Dedicated Trainer (10 games)
- Brain Athlete (50 games)
- Cognitive Champion (100 games)
- Game-specific mastery badges

## 🔒 Privacy & Security

- **All data stored locally** in your browser
- **No tracking** without explicit opt-in
- **Optional backend** for cloud sync
- **Secure authentication** via MiniKit SIWE
- **No third-party analytics** by default

## 🌐 Deployment

### Frontend Only (Static Hosting)

Deploy to Vercel, Netlify, or any static host:

```bash
cd frontend
npm run build
# Deploy the dist/ folder
```

### Full Stack Deployment

**Backend (Heroku)**
```bash
heroku create your-app-name
heroku addons:create heroku-postgresql:mini

heroku config:set APP_ID=your_app_id
heroku config:set JWT_SECRET=$(openssl rand -base64 32)
heroku config:set DATABASE_SSL=true

git push heroku main
heroku run npm run migrate:brain
```

**Frontend (Vercel)**
```bash
# Set environment variables in Vercel dashboard:
VITE_APP_ID=your_app_id
VITE_API_URL=https://your-backend.herokuapp.com

vercel deploy
```

## 📊 API Endpoints (Optional Backend)

### Authentication
- `GET /api/auth/nonce` - Get SIWE nonce
- `POST /api/auth/verify-siwe` - Verify SIWE signature
- `GET /api/auth/me` - Get current user

### Game Data
- `POST /api/games/score` - Save game score
- `GET /api/games/stats/:gameType` - Get game stats
- `GET /api/games/profile` - Get full player profile

### Leaderboards
- `GET /api/leaderboard/global` - Get global leaderboard across all games
  - Query params: `limit` (default: 20), `offset` (default: 0)
  - Returns: Ranked list of users by total score
- `GET /api/leaderboard/game/:gameType` - Get game-specific leaderboard
  - Supported game types: `memory`, `attention`, `reflex`
  - Query params: `limit` (default: 20), `offset` (default: 0)
  - Returns: Ranked list of users for specific game
- `GET /api/leaderboard/me` - Get current user's global rank (requires auth)
  - Returns: User's rank and stats across all games
- `GET /api/leaderboard/me/:gameType` - Get user's rank for specific game (requires auth)
  - Returns: User's rank and stats for the specified game type

## 🎨 Customization

### Themes
Edit `frontend/src/index.css` to customize:
- Color palette
- Gradient effects
- Glass-morphism opacity
- Glow effects

### Game Difficulty
Adjust in game component files:
- Card counts in `MemoryGame.tsx`
- Target spawn rates in `AttentionGame.tsx`
- Trial counts in `ReflexGame.tsx`

## 📈 Performance

- **Lighthouse Score:** 95+ on mobile
- **Bundle Size:** ~510KB (gzipped: ~155KB)
- **Offline Support:** 100% functionality
- **Load Time:** < 2s on 3G networks

## 🤝 Contributing

Contributions welcome! Areas for improvement:
- Additional brain training games
- More visualization charts
- Multiplayer challenges
- Social features
- Accessibility enhancements

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- **Worldcoin MiniKit Docs:** https://docs.worldcoin.org/minikit
- **Developer Portal:** https://developer.worldcoin.org
- **World App Download:** https://worldcoin.org/download

## 💡 Tips for Best Experience

1. **Add to Home Screen** - Install as PWA for native app feel
2. **Regular Training** - Play daily for best cognitive benefits
3. **Track Progress** - Check stats dashboard weekly
4. **Challenge Yourself** - Push to higher levels
5. **Stay Consistent** - Build a streak for achievement badges

---

**Made with 🧠 for brain health and cognitive fitness**

Train your brain, one game at a time! 🎮✨
