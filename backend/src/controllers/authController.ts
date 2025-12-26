import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { verifySiweMessage } from '@worldcoin/minikit-js';
import { UserModel } from '../models/User';

// Debug logging flag (enable with DEBUG_AUTH=true environment variable)
const DEBUG_AUTH = process.env.DEBUG_AUTH === 'true';

// Helper function to redact sensitive data for logging
const redactSensitive = (value: string, showChars = 6): string => {
  if (!value || value.length <= showChars * 2) {
    return '***';
  }
  return `${value.substring(0, showChars)}...${value.substring(value.length - showChars)}`;
};

// Store nonces temporarily (in production, use Redis with TTL)
const nonceStore = new Map<string, { nonce: string; timestamp: number }>();

// Clean up old nonces every 5 minutes to prevent memory leaks
const NONCE_CLEANUP_INTERVAL = 5 * 60 * 1000;
const NONCE_MAX_AGE = 5 * 60 * 1000;

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

export class AuthController {
  /**
   * Generate a nonce for SIWE authentication
   */
  static async getNonce(req: Request, res: Response) {
    const requestId = (req as any).requestId || 'unknown';
    
    try {
      const nonce = crypto.randomBytes(16).toString('base64');
      
      // Store nonce with timestamp
      nonceStore.set(nonce, {
        nonce,
        timestamp: Date.now(),
      });

      if (DEBUG_AUTH) {
        console.log(`[Auth:getNonce] requestId=${requestId} nonce=${redactSensitive(nonce, 8)} nonceStoreSize=${nonceStore.size}`);
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
      const { payload } = req.body;

      if (DEBUG_AUTH) {
        console.log(`[Auth:verifySiwe] requestId=${requestId} payloadStatus=${payload?.status} nonceStoreSize=${nonceStore.size}`);
      }

      if (!payload || payload.status === 'error') {
        const errorMsg = 'Invalid payload or user rejected authentication';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: ${errorMsg} errorCode=${payload?.error_code}`);
        }
        return res.status(400).json({ 
          error: errorMsg,
          errorCode: payload?.error_code,
          requestId,
        });
      }

      // Check if nonce exists and is valid BEFORE verifying signature
      const storedNonce = nonceStore.get(payload.nonce);
      if (!storedNonce) {
        const errorMsg = 'Invalid or expired nonce - nonce not found in store';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: ${errorMsg} nonce=${redactSensitive(payload.nonce || 'missing', 8)} nonceStoreSize=${nonceStore.size}`);
        }
        return res.status(401).json({ 
          error: errorMsg,
          requestId,
          hint: 'Nonce may have expired or backend restarted. Multi-instance backends need shared nonce storage (Redis).',
        });
      }

      // Check nonce age
      const nonceAge = Date.now() - storedNonce.timestamp;
      if (nonceAge > NONCE_MAX_AGE) {
        nonceStore.delete(payload.nonce);
        const errorMsg = `Nonce expired (age: ${Math.floor(nonceAge / 1000)}s, max: ${NONCE_MAX_AGE / 1000}s)`;
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: ${errorMsg}`);
        }
        return res.status(401).json({ 
          error: errorMsg,
          requestId,
        });
      }

      if (DEBUG_AUTH) {
        console.log(`[Auth:verifySiwe] requestId=${requestId} nonce validated, age=${Math.floor(nonceAge / 1000)}s, attempting SIWE verification`);
      }

      // Verify the SIWE message
      let validMessage;
      try {
        validMessage = await verifySiweMessage(
          payload,
          payload.nonce
        );
      } catch (siweError: any) {
        const errorMsg = 'SIWE message verification failed';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: ${errorMsg} siweError=${siweError.message || siweError}`);
        }
        // Delete nonce on verification failure
        nonceStore.delete(payload.nonce);
        return res.status(401).json({ 
          error: errorMsg,
          requestId,
          details: siweError.message || 'Unknown SIWE verification error',
        });
      }

      if (!validMessage.isValid) {
        const errorMsg = 'Invalid SIWE message signature or format';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: ${errorMsg}`);
        }
        // Delete nonce on verification failure
        nonceStore.delete(payload.nonce);
        return res.status(401).json({ 
          error: errorMsg,
          requestId,
        });
      }

      // Extract wallet address from the verified SIWE message
      const walletAddress = validMessage.siweMessageData.address;

      if (!walletAddress) {
        const errorMsg = 'No wallet address in SIWE message';
        if (DEBUG_AUTH) {
          console.log(`[Auth:verifySiwe] requestId=${requestId} error: ${errorMsg}`);
        }
        nonceStore.delete(payload.nonce);
        return res.status(401).json({ 
          error: errorMsg,
          requestId,
        });
      }

      // Delete used nonce (one-time use)
      nonceStore.delete(payload.nonce);

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
      const errorMsg = 'Authentication failed - internal server error';
      console.error(`[Auth:verifySiwe] requestId=${requestId} error:`, error);
      if (DEBUG_AUTH) {
        console.log(`[Auth:verifySiwe] requestId=${requestId} error details: ${error.message || error}`);
      }
      return res.status(500).json({ 
        error: errorMsg,
        requestId,
        details: DEBUG_AUTH ? error.message : undefined,
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
