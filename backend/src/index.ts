import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { AuthController } from './controllers/authController';
import { MatchController } from './controllers/matchController';
import { LeaderboardController } from './controllers/leaderboardController';
import { PaymentController } from './controllers/paymentController';
import { VerificationController } from './controllers/verificationController';
import { authenticate } from './middleware/auth';
import { requestIdMiddleware } from './middleware/requestId';
import { GameSocketHandler } from './websocket/gameHandler';
import { connectRedis } from './config/redis';
import pool from './config/database';

dotenv.config();

// Validate critical environment variables on startup
const validateEnvVars = () => {
  const required = [
    'APP_ID',
    'DEV_PORTAL_API_KEY',
    'PLATFORM_WALLET_ADDRESS',
    'JWT_SECRET',
    'DATABASE_URL',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    console.error('See .env.example for reference.');
    process.exit(1);
  }
  
  // Validate wallet address format
  const walletAddr = process.env.PLATFORM_WALLET_ADDRESS;
  if (walletAddr && !walletAddr.match(/^0x[a-fA-F0-9]{40}$/)) {
    console.error('❌ Invalid PLATFORM_WALLET_ADDRESS format. Must be a valid Ethereum address (0x...)');
    process.exit(1);
  }
  
  console.log('✅ Environment variables validated');
};

validateEnvVars();

const app = express();
const httpServer = createServer(app);

// Build allowed origins list from environment variables
const LOCALHOST_URL = 'http://localhost:3000';

const buildAllowedOrigins = (): string[] => {
  const origins: string[] = [];
  
  if (process.env.FRONTEND_URL) origins.push(process.env.FRONTEND_URL);
  if (process.env.FRONTEND_URL_PRODUCTION) origins.push(process.env.FRONTEND_URL_PRODUCTION);
  
  if (process.env.ALLOWED_ORIGINS) {
    origins.push(
      ...process.env.ALLOWED_ORIGINS
        .split(',')
        .map(o => o.trim())
        .filter(o => o.length > 0)
    );
  }

  const productionOrigins = [
    'https://www.blumea.me',
    'https://blumea.me',
    'https://api.blumea.me',
    'https://blink-battle.vercel.app',
    'https://blink-battle-git-main-blumeame.vercel.app',
    'https://blink-battle-61ey1k4bm-blumeame.vercel.app',
  ];
  
  origins.push(...productionOrigins);
  
  if (process.env.NODE_ENV !== 'production' && !origins.includes(LOCALHOST_URL)) {
    origins.push(LOCALHOST_URL);
  }
  
  return [...new Set(origins)];
};

const allowedOrigins = buildAllowedOrigins();

console.log('✅ CORS allowed origins:', allowedOrigins);

// Create Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) {
        if (process.env.NODE_ENV !== 'production') return callback(null, true);
        console.warn('[WebSocket CORS] Blocked no-origin request in production');
        return callback(new Error('Not allowed by CORS'));
      }
      if (allowedOrigins.includes(origin)) callback(null, true);
      else {
        console.error(`[WebSocket CORS] Blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  },
  // Transport configuration - USE WEBSOCKET ONLY to prevent disconnect loops
  // This avoids polling->websocket upgrade issues on Heroku/World App MiniKit
  transports: ['websocket'],
  allowUpgrades: false,
  // Heartbeat/ping configuration to keep connections alive
  pingInterval: 25000, // Send ping every 25 seconds
  pingTimeout: 60000, // Wait 60 seconds for pong before considering connection dead
  maxHttpBufferSize: 1e6,
  // Disable per-message deflate for better Heroku compatibility
  perMessageDeflate: false,
});

// WebSocket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
    (socket as any).userId = decoded.userId;
    next();
  } catch (error) {
    console.error('[WebSocket] Auth error:', error);
    return next(new Error('Invalid or expired token'));
  }
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      console.warn('[CORS] No-origin blocked in production');
      return callback(new Error('Not allowed by CORS'));
    }
    if (allowedOrigins.includes(origin)) callback(null, true);
    else {
      console.error(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  optionsSuccessStatus: 204,
  preflightContinue: false,
}));

app.use(express.json());
app.use(requestIdMiddleware);

// 🔥 NORMALIZE DOUBLE SLASHES - MUST BE BEFORE ROUTES
app.use((req, _res, next) => {
  const originalUrl = req.url;
  if (req.url.includes('//')) {
    req.url = req.url.replace(/\/{2,}/g, '/');
    console.log(`[URL Normalization] Fixed: ${originalUrl} -> ${req.url}`);
  }
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes
app.get('/api/auth/nonce', AuthController.getNonce);
app.post('/api/auth/verify-siwe', AuthController.verifySiwe);
app.post('/api/auth/login', AuthController.authenticate);
app.get('/api/auth/me', authenticate, AuthController.getUser);

// Payment routes
app.post('/api/initiate-payment', authenticate, PaymentController.initiatePayment);
app.post('/api/confirm-payment', authenticate, PaymentController.confirmPayment);
app.get('/api/payment/:reference', authenticate, PaymentController.getPaymentStatus);

// World ID
app.post('/api/verify-world-id', authenticate, VerificationController.verifyWorldID);

// Matches
app.get('/api/matches/history', authenticate, MatchController.getMatchHistory);
app.get('/api/matches/:matchId', authenticate, MatchController.getMatch);
app.get('/api/matches/:matchId/status', authenticate, MatchController.getMatchStatus);

// Leaderboard
app.get('/api/leaderboard', LeaderboardController.getLeaderboard);
app.get('/api/leaderboard/me', authenticate, LeaderboardController.getUserRank);

// WebSockets
new GameSocketHandler(io);

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    await connectRedis();
    console.log('Connected to Redis');

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
