import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AuthController } from './controllers/authController';
import { WorldcoinController } from './controllers/worldcoinController';
import { BrainTrainingLeaderboardController } from './controllers/brainTrainingLeaderboardController';
import { UserStatsController } from './controllers/userStatsController';
import { authenticate } from './middleware/auth';
import { statsRateLimiter } from './middleware/rateLimiter';
import pool from './config/database';

dotenv.config();

// Validate critical environment variables on startup
const validateEnvVars = () => {
  const required = [
    'APP_ID',
    'JWT_SECRET',
    'DATABASE_URL',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    process.exit(1);
  }
  
  console.log('✅ Environment variables validated');
};

validateEnvVars();

const app = express();

// Build allowed origins list
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_PRODUCTION,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes
app.get('/api/auth/nonce', AuthController.getNonce);
app.post('/api/auth/verify-siwe', AuthController.verifySiwe);
app.get('/api/auth/me', authenticate, AuthController.getUser);

// World ID verification routes
app.post('/api/verify-worldcoin', WorldcoinController.verifyWorldId);
app.get('/api/verify-worldcoin/check/:nullifier', WorldcoinController.checkNullifier);

// Game score routes
app.post('/api/games/score', authenticate, async (req, res): Promise<void> => {
  try {
    const { gameType, score, accuracy, timeMs, level } = req.body;
    const userId = (req as any).user.userId;

    if (!['memory', 'attention', 'reflex'].includes(gameType)) {
      res.status(400).json({ error: 'Invalid game type' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO game_scores (user_id, game_type, score, accuracy, time_ms, level, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [userId, gameType, score, accuracy, timeMs, level]
    );

    res.json({ success: true, score: result.rows[0] });
  } catch (error) {
    console.error('Error saving game score:', error);
    res.status(500).json({ error: 'Failed to save score' });
  }
});

app.get('/api/games/stats/:gameType', authenticate, async (req, res): Promise<void> => {
  try {
    const { gameType } = req.params;
    const userId = (req as any).user.userId;

    if (!['memory', 'attention', 'reflex'].includes(gameType)) {
      res.status(400).json({ error: 'Invalid game type' });
      return;
    }

    const result = await pool.query(
      `SELECT 
        COUNT(*) as games_played,
        MAX(score) as best_score,
        AVG(score)::integer as average_score,
        AVG(accuracy)::integer as average_accuracy,
        AVG(time_ms)::integer as average_time_ms,
        MAX(level) as highest_level,
        MAX(created_at) as last_played
       FROM game_scores
       WHERE user_id = $1 AND game_type = $2`,
      [userId, gameType]
    );

    res.json({ success: true, stats: result.rows[0] });
  } catch (error) {
    console.error('Error fetching game stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/games/profile', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.userId;

    const totalResult = await pool.query(
      `SELECT COUNT(*) as total_games FROM game_scores WHERE user_id = $1`,
      [userId]
    );

    const memoryResult = await pool.query(
      `SELECT 
        COUNT(*) as games_played,
        MAX(score) as best_score,
        AVG(score)::integer as average_score,
        AVG(accuracy)::integer as average_accuracy,
        AVG(time_ms)::integer as average_time_ms,
        MAX(level) as highest_level
       FROM game_scores WHERE user_id = $1 AND game_type = 'memory'`,
      [userId]
    );

    const attentionResult = await pool.query(
      `SELECT 
        COUNT(*) as games_played,
        MAX(score) as best_score,
        AVG(score)::integer as average_score,
        AVG(accuracy)::integer as average_accuracy,
        AVG(time_ms)::integer as average_time_ms,
        MAX(level) as highest_level
       FROM game_scores WHERE user_id = $1 AND game_type = 'attention'`,
      [userId]
    );

    const reflexResult = await pool.query(
      `SELECT 
        COUNT(*) as games_played,
        MAX(score) as best_score,
        AVG(score)::integer as average_score,
        AVG(accuracy)::integer as average_accuracy,
        AVG(time_ms)::integer as average_time_ms,
        MAX(level) as highest_level
       FROM game_scores WHERE user_id = $1 AND game_type = 'reflex'`,
      [userId]
    );

    res.json({
      success: true,
      profile: {
        totalGames: parseInt(totalResult.rows[0].total_games),
        memory: memoryResult.rows[0],
        attention: attentionResult.rows[0],
        reflex: reflexResult.rows[0],
      }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Leaderboard routes
app.get('/api/leaderboard/global', BrainTrainingLeaderboardController.getGlobalLeaderboard);
app.get('/api/leaderboard/game/:gameType', BrainTrainingLeaderboardController.getGameTypeLeaderboard);
app.get('/api/leaderboard/me', authenticate, BrainTrainingLeaderboardController.getUserGlobalRank);
app.get('/api/leaderboard/me/:gameType', authenticate, BrainTrainingLeaderboardController.getUserGameTypeRank);

// User stats routes
app.get('/api/stats/percentile', authenticate, statsRateLimiter, UserStatsController.getUserPercentile);
app.get('/api/stats/play-style', authenticate, statsRateLimiter, UserStatsController.getPlayStyle);
app.get('/api/stats/global', statsRateLimiter, UserStatsController.getGlobalStats);
app.get('/api/stats/streaks', authenticate, statsRateLimiter, UserStatsController.getStreaks);
app.get('/api/stats/performance-trend', authenticate, statsRateLimiter, UserStatsController.getPerformanceTrend);
app.get('/api/stats/cognitive-comparison', authenticate, statsRateLimiter, UserStatsController.getCognitiveComparison);

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected successfully');
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Brain Training API server running on port ${PORT}`);
  console.log(`📊 Frontend allowed origins:`, allowedOrigins);
});
