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
import { PollingMatchmakingController } from './controllers/pollingMatchmakingController';
import { PollingMatchController } from './controllers/pollingMatchController';
import { PingController } from './controllers/pingController';
import { authenticate } from './middleware/auth';
import { requestIdMiddleware } from './middleware/requestId';
import { requestTrackingMiddleware } from './middleware/requestTracking';
import { matchmakingRateLimiter, matchRateLimiter } from './middleware/rateLimiter';
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

// Trust Heroku proxy for WebSocket support
app.set('trust proxy', 1);

const httpServer = createServer(app);

// Configure HTTP server timeouts to prevent Heroku H15 idle connection drops
// Heroku routing layer has a 55-second idle timeout. We set keepAliveTimeout to 65s
// so the Node.js server keeps connections alive longer than Heroku's routing timeout.
// This prevents H15 errors where Heroku closes the connection before the server does.
httpServer.keepAliveTimeout = 65000; // 65 seconds - longer than Heroku's 55s idle timeout
httpServer.headersTimeout = 66000;   // 66 seconds - slightly longer than keepAliveTimeout

console.log(
  `✅ HTTP server timeouts configured:\n` +
  `  keepAliveTimeout: ${httpServer.keepAliveTimeout}ms\n` +
  `  headersTimeout: ${httpServer.headersTimeout}ms\n` +
  `  (Heroku H15 protection: both > 55s routing timeout)`
);

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

// Create Socket.IO server with hybrid transport strategy
// HYBRID TRANSPORTS: Use websocket + polling fallback for maximum reliability
// This prevents disconnect loops caused by websocket-only upgrade failures on Heroku/Vercel
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
  // HYBRID TRANSPORT STRATEGY - Critical for Heroku/Vercel stability
  // Start with WebSocket, allow polling fallback if upgrade fails
  transports: ['websocket', 'polling'],
  allowUpgrades: true, // Allow transport upgrades
  upgradeTimeout: 10000, // 10 seconds to upgrade from polling to websocket
  // Heartbeat/ping configuration - optimized for Heroku H15 idle timeout (55s)
  pingInterval: 20000, // Send ping every 20 seconds (well under 55s Heroku limit)
  pingTimeout: 60000, // Wait 60 seconds for pong before considering connection dead
  maxHttpBufferSize: 1e6,
  // Disable compression for better proxy compatibility and lower CPU usage
  perMessageDeflate: false,  // Disable per-message deflate (WebSocket compression)
  httpCompression: false,     // Disable HTTP compression for polling transport
  // Allow EIO3 clients for broader compatibility
  allowEIO3: true,
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

app.use(requestIdMiddleware);
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Schema verification endpoint
app.get('/health/schema', async (_req, res) => {
  const { verifyPollingSchema } = await import('./config/schemaVerification');
  const result = await verifyPollingSchema();
  
  res.status(result.valid ? 200 : 503).json({
    ...result,
    timestamp: new Date().toISOString()
  });
});

// Auth routes
app.get('/api/auth/nonce', AuthController.getNonce);
app.post('/api/auth/verify-siwe', AuthController.verifySiwe);
app.post('/api/auth/login', AuthController.authenticate);
app.get('/api/auth/me', authenticate, matchRateLimiter, AuthController.getUser);

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

// HTTP Polling Matchmaking (replaces WebSocket matchmaking)
// Rate limiting applied: matchmakingRateLimiter (20 req/min per user)
app.post('/api/matchmaking/join', authenticate, matchmakingRateLimiter, requestTrackingMiddleware, PollingMatchmakingController.join);
app.get('/api/matchmaking/status/:userId', authenticate, matchmakingRateLimiter, requestTrackingMiddleware, PollingMatchmakingController.getStatus);
app.delete('/api/matchmaking/cancel/:userId', authenticate, matchmakingRateLimiter, requestTrackingMiddleware, PollingMatchmakingController.cancel);

// HTTP Polling Match Flow (replaces WebSocket game flow)
// Rate limiting applied: matchRateLimiter (100 req/min per user)
app.post('/api/match/ready', authenticate, matchRateLimiter, requestTrackingMiddleware, PollingMatchController.ready);
app.get('/api/match/state/:matchId', authenticate, matchRateLimiter, requestTrackingMiddleware, PollingMatchController.getState);
app.get('/api/match/stake-status/:matchId', authenticate, matchRateLimiter, requestTrackingMiddleware, PollingMatchController.getStakeStatus);
app.post('/api/match/tap', authenticate, matchRateLimiter, requestTrackingMiddleware, PollingMatchController.tap);
app.get('/api/match/result/:matchId', authenticate, matchRateLimiter, requestTrackingMiddleware, PollingMatchController.getResult);

// Ping/Latency endpoints
app.post('/api/ping', authenticate, PingController.recordLatency);
app.get('/api/ping/stats', authenticate, PingController.getStats);

// WebSockets - DEPRECATED for gameplay, kept for other features if needed
// TODO: Remove entirely if not used for other features
// new GameSocketHandler(io);
console.log('⚠️  WebSocket gameplay handlers DISABLED - using HTTP polling instead');


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

    // Start cleanup interval for expired queue entries
    const CLEANUP_INTERVAL_MS = 60000; // 1 minute
    setInterval(async () => {
      try {
        const cleaned = await PollingMatchmakingController.cleanupExpired();
        if (cleaned > 0) {
          console.log(`[Cleanup] Cleaned up ${cleaned} expired queue entries`);
        }
      } catch (error) {
        console.error('[Cleanup] Error cleaning expired queue entries:', error);
      }
    }, CLEANUP_INTERVAL_MS);
    console.log(`✅ Queue cleanup job started (interval: ${CLEANUP_INTERVAL_MS}ms)`);

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`HTTP Polling endpoints enabled:`);
      console.log(`  POST /api/matchmaking/join`);
      console.log(`  GET  /api/matchmaking/status/:userId`);
      console.log(`  DELETE /api/matchmaking/cancel/:userId`);
      console.log(`  POST /api/match/ready`);
      console.log(`  GET  /api/match/state/:matchId`);
      console.log(`  POST /api/match/tap`);
      console.log(`  GET  /api/match/result/:matchId`);
      console.log(`  POST /api/ping`);
      console.log(`  GET  /api/ping/stats`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  // Stop request tracking
  const { stopStatsLogging } = await import('./middleware/requestTracking');
  stopStatsLogging();
  
  httpServer.close(() => {
    console.log('HTTP server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();

export { app, io };
