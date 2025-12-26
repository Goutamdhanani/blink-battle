import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { AuthController } from './controllers/authController';
import { MatchController } from './controllers/matchController';
import { LeaderboardController } from './controllers/leaderboardController';
import { authenticate } from './middleware/auth';
import { GameSocketHandler } from './websocket/gameHandler';
import { connectRedis } from './config/redis';
import pool from './config/database';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes
app.post('/api/auth/login', AuthController.authenticate);
app.get('/api/auth/me', authenticate, AuthController.getUser);

// Match routes
app.get('/api/matches/history', authenticate, MatchController.getMatchHistory);
app.get('/api/matches/:matchId', authenticate, MatchController.getMatch);

// Leaderboard routes
app.get('/api/leaderboard', LeaderboardController.getLeaderboard);
app.get('/api/leaderboard/me', authenticate, LeaderboardController.getUserRank);

// Initialize WebSocket handler
new GameSocketHandler(io);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

// Start server
const startServer = async () => {
  try {
    // Connect to Redis
    await connectRedis();
    console.log('Connected to Redis');

    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('Connected to PostgreSQL');

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export { app, io };
