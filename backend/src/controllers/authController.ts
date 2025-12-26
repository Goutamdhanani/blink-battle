import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { verifySiweMessage } from '@worldcoin/minikit-js';

// Store nonces temporarily (in production, use Redis)
const nonceStore = new Map<string, { nonce: string; timestamp: number }>();

// Clean up old nonces every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [key, value] of nonceStore.entries()) {
    if (value.timestamp < fiveMinutesAgo) {
      nonceStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export class AuthController {
  /**
   * Generate a nonce for SIWE authentication
   */
  static async getNonce(_req: Request, res: Response) {
    try {
      const nonce = crypto.randomBytes(16).toString('base64');
      
      // Store nonce with timestamp
      nonceStore.set(nonce, {
        nonce,
        timestamp: Date.now(),
      });

      res.json({ nonce });
    } catch (error) {
      console.error('Error generating nonce:', error);
      res.status(500).json({ error: 'Failed to generate nonce' });
    }
  }

  /**
   * Verify SIWE message from MiniKit
   */
  static async verifySiwe(req: Request, res: Response) {
    try {
      const { payload } = req.body;

      if (!payload || payload.status === 'error') {
        return res.status(400).json({ error: 'Invalid payload' });
      }

      // Verify the SIWE message
      const validMessage = await verifySiweMessage(
        payload,
        payload.nonce
      );

      if (!validMessage.isValid) {
        return res.status(401).json({ error: 'Invalid SIWE message' });
      }

      // Extract wallet address from the verified SIWE message
      const walletAddress = validMessage.siweMessageData.address;

      if (!walletAddress) {
        return res.status(401).json({ error: 'No wallet address in SIWE message' });
      }

      // Check if nonce exists and is valid
      const storedNonce = nonceStore.get(payload.nonce);
      if (!storedNonce) {
        return res.status(401).json({ error: 'Invalid or expired nonce' });
      }

      // Delete used nonce
      nonceStore.delete(payload.nonce);

      // Find or create user
      let user = await UserModel.findByWallet(walletAddress);
      
      if (!user) {
        user = await UserModel.create(walletAddress, undefined);
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
      console.error('SIWE verification error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
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
