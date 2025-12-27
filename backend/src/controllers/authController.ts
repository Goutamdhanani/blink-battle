import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { verifySiweMessage } from '@worldcoin/minikit-js';
import { UserModel } from '../models/User';
import redisClient from '../config/redis';

// Debug logging flag (enable with DEBUG_AUTH=true environment variable)
const DEBUG_AUTH = process.env.DEBUG_AUTH === 'true';

// Helper function to redact sensitive data for logging
const redactSensitive = (value: string, showChars = 6): string => {
  if (!value || value.length <= showChars * 2) {
    return '***';
  }
  return `${value.substring(0, showChars)}...${value.substring(value.length - showChars)}`;
};

// Nonce configuration
const NONCE_MAX_AGE = 5 * 60 * 1000; // 5 minutes
const NONCE_TTL_SECONDS = 300; // 5 minutes for Redis

// In-memory fallback store for nonces (used when Redis is unavailable)
const nonceStore = new Map<string, { nonce: string; timestamp: number }>();

// Clean up old nonces every 5 minutes to prevent memory leaks (in-memory only)
const NONCE_CLEANUP_INTERVAL = 5 * 60 * 1000;
const nonceCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of nonceStore.entries()) {
    if (now - value.timestamp > NONCE_MAX_AGE) {
      nonceStore.delete(key);
    }
  }
}, NONCE_CLEANUP_INTERVAL);

// Ensure interval is cleaned up on process exit
process.on('beforeExit', () => {
  clearInterval(nonceCleanupInterval);
});

// Helper: Check if Redis is available
const isRedisAvailable = (): boolean => {
  return redisClient.isOpen;
};

// Helper: Store nonce (Redis or in-memory fallback)
const storeNonce = async (nonce: string): Promise<void> => {
  if (isRedisAvailable()) {
    // Use Redis with TTL
    await redisClient.setEx(`nonce:${nonce}`, NONCE_TTL_SECONDS, Date.now().toString());
  } else {
    // Fallback to in-memory store
    nonceStore.set(nonce, {
      nonce,
      timestamp: Date.now(),
    });
  }
};

// Helper: Get nonce (Redis or in-memory fallback)
const getNonce = async (nonce: string): Promise<{ timestamp: number } | null> => {
  if (isRedisAvailable()) {
    // Get from Redis
    const timestamp = await redisClient.get(`nonce:${nonce}`);
    if (timestamp) {
      return { timestamp: parseInt(timestamp, 10) };
    }
    return null;
  } else {
    // Fallback to in-memory store
    const stored = nonceStore.get(nonce);
    return stored ? { timestamp: stored.timestamp } : null;
  }
};

// Helper: Delete nonce (Redis or in-memory fallback)
const deleteNonce = async (nonce: string): Promise<void> => {
  if (isRedisAvailable()) {
    // Delete from Redis
    await redisClient.del(`nonce:${nonce}`);
  } else {
    // Delete from in-memory store
    nonceStore.delete(nonce);
  }
};

// Helper: Validate nonce format (must be alphanumeric and >= 8 chars)
const isValidNonceFormat = (nonce: string): boolean => {
  return typeof nonce === 'string' && 
         nonce.length >= 8 && 
         /^[a-zA-Z0-9]+$/.test(nonce);
};

export class AuthController {
  /**
   * Generate a nonce for SIWE authentication
   */
  static async getNonce(req: Request, res: Response) {
    const requestId = (req as any).requestId || 'unknown';
    
    try {
      // Generate alphanumeric nonce (>= 8 chars) - compliant with World App requirements
      // Using UUID without dashes = 32 alphanumeric characters
      const nonce = crypto.randomUUID().replace(/-/g, '');
      
      // Store nonce with timestamp
      await storeNonce(nonce);

      if (DEBUG_AUTH) {
        console.log(`[Auth:getNonce] requestId=${requestId} nonce=${redactSensitive(nonce, 8)} storage=${isRedisAvailable() ? 'Redis' : 'in-memory'}`);
      }

      res.json({ nonce, requestId });
    } catch (error) {
      console.error(`[Auth:getNonce] requestId=${requestId} error:`, error);
      res.status(500).json({ 
        error: 'Failed to generate nonce',
        requestId,
      });
    }
  }

  /**
   * Verify SIWE message from MiniKit
   */
  static async verifySiwe(req: Request, res: Response) {
    const requestId = (req as any).requestId || 'unknown';
    
    try {
      const { payload, nonce } = req.body;

      if (DEBUG_AUTH) {
        console.log(`[Auth:verifySiwe] requestId=${requestId} payloadStatus=${payload?.status} storage=${isRedisAvailable() ? 'Redis' : 'in-memory'}`);
      }

      if (!payload || payload.status === 'error') {
        const errorMsg = 'Authentication failed';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: ${errorMsg} errorCode=${payload?.error_code}`);
        }
        return res.status(400).json({ 
          error: errorMsg,
          errorCode: payload?.error_code,
          requestId,
        });
      }

      // Validate nonce is provided
      if (!nonce) {
        const errorMsg = 'Authentication failed';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: nonce not provided`);
        }
        return res.status(400).json({ 
          error: errorMsg,
          requestId,
        });
      }

      // Validate nonce format (alphanumeric, >= 8 chars)
      if (!isValidNonceFormat(nonce)) {
        const errorMsg = 'Authentication failed';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: invalid nonce format nonce=${redactSensitive(nonce, 8)}`);
        }
        return res.status(400).json({ 
          error: errorMsg,
          requestId,
        });
      }

      // Check if nonce exists and is valid BEFORE verifying signature
      // This prevents DoS attacks from invalid signatures and is the recommended order
      // because signature verification is computationally expensive
      const storedNonce = await getNonce(nonce);
      if (!storedNonce) {
        const errorMsg = 'Authentication failed';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: nonce not found or expired nonce=${redactSensitive(nonce, 8)}`);
        }
        return res.status(401).json({ 
          error: errorMsg,
          requestId,
        });
      }

      // Check nonce age
      const nonceAge = Date.now() - storedNonce.timestamp;
      if (nonceAge > NONCE_MAX_AGE) {
        await deleteNonce(nonce);
        const errorMsg = 'Authentication failed';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: nonce expired age=${Math.floor(nonceAge / 1000)}s`);
        }
        return res.status(401).json({ 
          error: errorMsg,
          requestId,
        });
      }

      if (DEBUG_AUTH) {
        console.log(`[Auth:verifySiwe] requestId=${requestId} nonce validated, age=${Math.floor(nonceAge / 1000)}s, attempting SIWE verification`);
      }

      // Verify the SIWE message with the original nonce issued by the server
      let validMessage;
      try {
        validMessage = await verifySiweMessage(
          payload,
          nonce
        );
      } catch (siweError: any) {
        const errorMsg = 'Authentication failed';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: SIWE verification failed siweError=${siweError.message || siweError}`);
        }
        // Delete nonce on verification failure (one-time use)
        await deleteNonce(nonce);
        return res.status(401).json({ 
          error: errorMsg,
          requestId,
        });
      }

      if (!validMessage.isValid) {
        const errorMsg = 'Authentication failed';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: invalid SIWE message signature`);
        }
        // Delete nonce on verification failure (one-time use)
        await deleteNonce(nonce);
        return res.status(401).json({ 
          error: errorMsg,
          requestId,
        });
      }

      // Extract wallet address from the verified SIWE message
      const walletAddress = validMessage.siweMessageData.address;

      if (!walletAddress) {
        const errorMsg = 'Authentication failed';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: no wallet address in SIWE message`);
        }
        await deleteNonce(nonce);
        return res.status(401).json({ 
          error: errorMsg,
          requestId,
        });
      }

      // Delete used nonce (one-time use - prevent replay attacks)
      await deleteNonce(nonce);

      if (DEBUG_AUTH) {
        console.log(`[Auth:verifySiwe] requestId=${requestId} SIWE verification successful, wallet=${redactSensitive(walletAddress, 6)}`);
      }

      // Find or create user
      let user = await UserModel.findByWallet(walletAddress);
      
      if (!user) {
        user = await UserModel.create(walletAddress, undefined);
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} created new user userId=${user.user_id}`);
        }
      } else {
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} existing user userId=${user.user_id}`);
        }
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.user_id, walletAddress: user.wallet_address },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        token,
        user: {
          userId: user.user_id,
          walletAddress: user.wallet_address,
          wins: user.wins,
          losses: user.losses,
          avgReactionTime: user.avg_reaction_time,
        },
        requestId,
      });
    } catch (error: any) {
      const errorMsg = 'Authentication failed';
      console.error(`[Auth:verifySiwe] requestId=${requestId} error:`, error);
      if (DEBUG_AUTH) {
        console.log(`[Auth:verifySiwe] requestId=${requestId} error details: ${error.message || error}`);
      }
      return res.status(500).json({ 
        error: errorMsg,
        requestId,
      });
    }
  }

  /**
   * Authenticate user with wallet address (legacy method for demo/testing)
   * In production, this would verify Worldcoin proof
   */
  static async authenticate(req: Request, res: Response) {
    try {
      const { walletAddress, region } = req.body;

      if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address is required' });
      }

      // Find or create user
      let user = await UserModel.findByWallet(walletAddress);
      
      if (!user) {
        user = await UserModel.create(walletAddress, region);
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.user_id, walletAddress: user.wallet_address },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        token,
        user: {
          userId: user.user_id,
          walletAddress: user.wallet_address,
          wins: user.wins,
          losses: user.losses,
          avgReactionTime: user.avg_reaction_time,
        },
      });
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  }

  /**
   * Get current user info
   */
  static async getUser(req: Request, res: Response) {
    try {
      const userId = (req as any).userId; // Set by auth middleware

      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({
        success: true,
        user: {
          userId: user.user_id,
          walletAddress: user.wallet_address,
          wins: user.wins,
          losses: user.losses,
          avgReactionTime: user.avg_reaction_time,
        },
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      return res.status(500).json({ error: 'Failed to fetch user' });
    }
  }
}
