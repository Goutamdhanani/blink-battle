import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import jwt from 'jsonwebtoken';

export class AuthController {
  /**
   * Authenticate user with wallet address
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

      res.json({
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
      res.status(500).json({ error: 'Authentication failed' });
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

      res.json({
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
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }
}
