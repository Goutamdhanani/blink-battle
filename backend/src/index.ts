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
  
  // Add FRONTEND_URL (single URL)
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL);
  }
  
  // Add FRONTEND_URL_PRODUCTION (single URL for backwards compatibility)
  if (process.env.FRONTEND_URL_PRODUCTION) {
    origins.push(process.env.FRONTEND_URL_PRODUCTION);
  }
  
  // Add ALLOWED_ORIGINS (comma-separated list for flexibility)
  if (process.env.ALLOWED_ORIGINS) {
    const additionalOrigins = process.env.ALLOWED_ORIGINS
      .split(',')
      .map(origin => origin.trim())
      .filter(origin => origin.length > 0);
    origins.push(...additionalOrigins);
  }
  
  // Production hardcoded origins (Worldcoin allowed domains and Vercel deployments)
  // These are always allowed in addition to environment variables
  const productionOrigins = [
    'https://www.blumea.me',
    'https://blumea.me',
    'https://api.blumea.me',
    'https://blink-battle.vercel.app',
    'https://blink-battle-git-main-blumeame.vercel.app',
    'https://blink-battle-61ey1k4bm-blumeame.vercel.app',
  ];
  
  origins.push(...productionOrigins);
  
  // Always allow localhost in development (avoid duplicates)
  if (process.env.NODE_ENV !== 'production') {
    if (!origins.includes(LOCALHOST_URL)) {
      origins.push(LOCALHOST_URL);
    }
  }
  
  // Remove duplicates
  return [...new Set(origins)];
};

const allowedOrigins = buildAllowedOrigins();

// Log allowed origins on startup for debugging
console.log('✅ CORS allowed origins:', allowedOrigins);

// Create Socket.IO server with same CORS configuration as REST API
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin in development only
      if (!origin) {
        if (process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        } else {
          console.warn('[WebSocket CORS] Blocked request with no origin in production');
          return callback(new Error('Not allowed by CORS'));
        }
      }
      
      // Check if origin is in allowed list (reuse same list as REST API)
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error(`[WebSocket CORS] Blocked request from origin: ${origin}`);
        console.error(`[WebSocket CORS] Allowed origins are: ${allowedOrigins.join(', ')}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
});

// WebSocket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
    // Attach userId to socket for use in handlers
    (socket as any).userId = decoded.userId;
    next();
  } catch (error) {
    console.error('[WebSocket] Auth error:', error);
    return next(new Error('Invalid or expired token'));
  }
});

// Middleware
// Configure CORS to allow credentials (JWT tokens) and specify allowed origins
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin in development only (for tools like Postman)
    if (!origin) {
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      } else {
        console.warn('[CORS] Blocked request with no origin in production');
        return callback(new Error('Not allowed by CORS'));
      }
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`[CORS] Blocked request from origin: ${origin}`);
      console.error(`[CORS] Allowed origins are: ${allowedOrigins.join(', ')}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow credentials (cookies, authorization headers)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204, // Standard status for successful OPTIONS with no content
  preflightContinue: false, // Handle CORS preflight response directly without passing to next handler
}));

app.use(express.json());
app.use(requestIdMiddleware); // Add request ID to all requests

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes
app.get('/api/auth/nonce', AuthController.getNonce);
app.post('/api/auth/verify-siwe', AuthController.verifySiwe);
app.post('/api/auth/login', AuthController.authenticate); // Legacy for demo/testing
app.get('/api/auth/me', authenticate, AuthController.getUser);

// Payment routes (MiniKit)
app.post('/api/initiate-payment', authenticate, PaymentController.initiatePayment);
app.post('/api/confirm-payment', authenticate, PaymentController.confirmPayment);
app.get('/api/payment/:reference', authenticate, PaymentController.getPaymentStatus);

// Verification routes (World ID)
app.post('/api/verify-world-id', authenticate, VerificationController.verifyWorldID);

// Match routes
app.get('/api/matches/history', authenticate, MatchController.getMatchHistory);
app.get('/api/matches/:matchId', authenticate, MatchController.getMatch);

// Leaderboard routes
app.get('/api/leaderboard', LeaderboardController.getLeaderboard);
app.get('/api/leaderboard/me', authenticate, LeaderboardController.getUserRank);

// Initialize WebSocket handler
new GameSocketHandler(io);

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
