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
import { ClaimController } from './controllers/claimController';
import { RefundController } from './controllers/refundController';
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
app.get('/api/payment-status/:reference', authenticate, matchRateLimiter, PaymentController.getPaymentStatusPolling);

// World ID
app.post('/api/verify-world-id', authenticate, VerificationController.verifyWorldID);

// Matches
app.get('/api/matches/history', authenticate, matchRateLimiter, MatchController.getMatchHistory);
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
app.post('/api/match/confirm-stake', authenticate, matchRateLimiter, requestTrackingMiddleware, PollingMatchController.confirmStake);
app.post('/api/match/tap', authenticate, matchRateLimiter, requestTrackingMiddleware, PollingMatchController.tap);
app.get('/api/match/result/:matchId', authenticate, matchRateLimiter, requestTrackingMiddleware, PollingMatchController.getResult);

// Time synchronization endpoint for accurate game timing
app.get('/api/time', (_req, res) => {
  res.json({
    server_time: Date.now(),
    timezone: 'UTC'
  });
});

// Ping/Latency endpoints
app.post('/api/ping', authenticate, PingController.recordLatency);
app.get('/api/ping/stats', authenticate, PingController.getStats);

// Claim endpoints (treasury-based payment architecture)
app.post('/api/claim', authenticate, matchRateLimiter, requestTrackingMiddleware, ClaimController.claimWinnings);
app.get('/api/claim/status/:matchId', authenticate, matchRateLimiter, requestTrackingMiddleware, ClaimController.getClaimStatus);

// Refund endpoints (rate limited to prevent abuse)
app.post('/api/refund/claim', authenticate, matchRateLimiter, requestTrackingMiddleware, RefundController.claimRefund);
app.post('/api/refund/claim-deposit', authenticate, matchRateLimiter, requestTrackingMiddleware, RefundController.claimDeposit);
app.get('/api/refund/status/:paymentReference', authenticate, matchRateLimiter, requestTrackingMiddleware, RefundController.checkRefundStatus);
app.get('/api/refund/eligible', authenticate, matchRateLimiter, requestTrackingMiddleware, RefundController.getEligibleRefunds);

// Heartbeat endpoint for disconnect detection (rate limited)
app.post('/api/match/heartbeat', authenticate, matchRateLimiter, requestTrackingMiddleware, PollingMatchController.heartbeat);

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

// Run critical migrations on startup
async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('[Migration] Running startup migrations...');

    // ============================================
    // MATCHES TABLE - Ping and cancel columns
    // ============================================
    // SECURITY: Column names and types are from a controlled array, not user input
    const matchColumns = [
      { name: 'player1_last_ping', type: 'TIMESTAMPTZ' },
      { name: 'player2_last_ping', type: 'TIMESTAMPTZ' },
      { name: 'refund_processed', type: 'BOOLEAN DEFAULT false' },
      { name: 'cancelled', type: 'BOOLEAN DEFAULT false' },
      { name: 'cancellation_reason', type: 'VARCHAR(255)' },
    ];

    for (const col of matchColumns) {
      const exists = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = $1
      `, [col.name]);

      if (exists.rows.length === 0) {
        // SECURITY: Safe because col.name and col.type come from controlled array above
        await client.query(`ALTER TABLE matches ADD COLUMN ${col.name} ${col.type}`);
        console.log(`[Migration] ✅ Added matches.${col.name}`);
      }
    }

    // ============================================
    // PAYMENT_INTENTS TABLE - Refund columns
    // ============================================
    const paymentColumns = [
      { name: 'refund_status', type: "VARCHAR(50) DEFAULT 'none'" },
      { name: 'refund_amount', type: 'NUMERIC(18, 8)' },
      { name: 'refund_reason', type: 'VARCHAR(255)' },
      { name: 'refund_deadline', type: 'TIMESTAMPTZ' },
      { name: 'refund_tx_hash', type: 'VARCHAR(66)' },
      { name: 'refund_claimed_at', type: 'TIMESTAMPTZ' },
    ];

    for (const col of paymentColumns) {
      const exists = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'payment_intents' AND column_name = $1
      `, [col.name]);

      if (exists.rows.length === 0) {
        await client.query(`ALTER TABLE payment_intents ADD COLUMN ${col.name} ${col.type}`);
        console.log(`[Migration] ✅ Added payment_intents.${col.name}`);
      }
    }

    // ============================================
    // CLAIMS TABLE - Fix numeric overflow
    // ============================================
    // Change payout columns to store WLD not wei
    // WEI_TO_WLD = 1e18 (10^18) - conversion factor from wei to WLD
    // WEI_THRESHOLD = 1000000 - amounts above this are likely stored in wei, not WLD
    await client.query(`
      DO $$ 
      BEGIN
        -- Only alter if column exists and is wrong type
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'claims' AND column_name = 'amount'
        ) THEN
          -- Update any existing claims to convert wei to WLD
          -- Amounts > 1000000 are likely stored in wei (1e18 scale), convert to WLD
          UPDATE claims SET 
            amount = CAST(amount AS NUMERIC) / 1000000000000000000,
            platform_fee = CAST(platform_fee AS NUMERIC) / 1000000000000000000,
            net_payout = CAST(net_payout AS NUMERIC) / 1000000000000000000
          WHERE amount > 1000000;
        END IF;
      END $$;
    `);

    console.log('[Migration] ✅ Startup migrations completed');
  } catch (error: any) {
    console.error('[Migration] Error:', error.message);
    // Don't crash the server - log and continue
  } finally {
    client.release();
  }
}

const startServer = async () => {
  try {
    await connectRedis();
    console.log('Connected to Redis');

    await pool.query('SELECT NOW()');
    console.log('Connected to PostgreSQL');

    // Run startup migrations
    await runStartupMigrations();

    // Start payment worker for processing payment intents
    const { startPaymentWorker } = await import('./services/paymentWorker');
    const PAYMENT_WORKER_INTERVAL_MS = parseInt(process.env.PAYMENT_WORKER_INTERVAL_MS || '10000', 10);
    startPaymentWorker(PAYMENT_WORKER_INTERVAL_MS);
    console.log(`✅ Payment worker started (interval: ${PAYMENT_WORKER_INTERVAL_MS}ms)`);

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

    // Start claim expiry job for unclaimed matches
    const { startClaimExpiryJob } = await import('./jobs/claimExpiry');
    startClaimExpiryJob();
    console.log(`✅ Claim expiry job started`);

    // Start refund processor for timeout matches
    const { startRefundProcessor } = await import('./jobs/refundProcessor');
    startRefundProcessor();
    console.log(`✅ Refund processor job started`);

    // Start disconnect checker for player disconnects
    const { startDisconnectChecker } = await import('./jobs/disconnectChecker');
    startDisconnectChecker();
    console.log(`✅ Disconnect checker job started`);

    // Start match timeout job for abandoned matches (Issue #17)
    const { startMatchTimeoutJob } = await import('./jobs/matchTimeout');
    startMatchTimeoutJob();
    console.log(`✅ Match timeout job started - cancels abandoned matches`);

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
      console.log(`Treasury-based claim endpoints enabled:`);
      console.log(`  POST /api/claim`);
      console.log(`  GET  /api/claim/status/:matchId`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  // Stop payment worker
  const { stopPaymentWorker } = await import('./services/paymentWorker');
  stopPaymentWorker();
  console.log('Payment worker stopped');
  
  // Stop match timeout job
  const { stopMatchTimeoutJob } = await import('./jobs/matchTimeout');
  stopMatchTimeoutJob();
  console.log('Match timeout job stopped');
  
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
