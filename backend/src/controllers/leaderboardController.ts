import { Request, Response } from 'express';
import { UserModel } from '../models/User';

export class LeaderboardController {
  /**
   * Get global leaderboard
   */
  static async getLeaderboard(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const users = await UserModel.getLeaderboard(limit);

      const leaderboard = users.map((user, index) => {
        // Safely convert avgReactionTime to number or null
        let avgReactionTime: number | null = null;
        if (user.avg_reaction_time !== null && user.avg_reaction_time !== undefined) {
          const parsed = typeof user.avg_reaction_time === 'number' 
            ? user.avg_reaction_time 
            : parseFloat(String(user.avg_reaction_time));
          avgReactionTime = Number.isFinite(parsed) ? parsed : null;
        }
        
        // Safely calculate win rate
        const totalGames = user.wins + user.losses;
        const winRate = totalGames > 0 ? user.wins / totalGames : 0;
        
        return {
          rank: index + 1,
          walletAddress: user.wallet_address,
          wins: user.wins,
          losses: user.losses,
          avgReactionTime,
          winRate,
        };
      });

      res.json({
        success: true,
        leaderboard,
      });
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  }

  /**
   * Get user ranking
   */
  static async getUserRank(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;
      
      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get all users with more wins
      const leaderboard = await UserModel.getLeaderboard(1000);
      const userRank = leaderboard.findIndex(u => u.user_id === userId) + 1;

      // Safely convert avgReactionTime to number or null
      let avgReactionTime: number | null = null;
      if (user.avg_reaction_time !== null && user.avg_reaction_time !== undefined) {
        const parsed = typeof user.avg_reaction_time === 'number' 
          ? user.avg_reaction_time 
          : parseFloat(String(user.avg_reaction_time));
        avgReactionTime = Number.isFinite(parsed) ? parsed : null;
      }
      
      // Safely calculate win rate
      const totalGames = user.wins + user.losses;
      const winRate = totalGames > 0 ? user.wins / totalGames : 0;

      return res.json({
        success: true,
        rank: userRank || null,
        stats: {
          wins: user.wins,
          losses: user.losses,
          avgReactionTime,
          winRate,
        },
      });
    } catch (error) {
      console.error('Error fetching user rank:', error);
      return res.status(500).json({ error: 'Failed to fetch user rank' });
    }
  }
}
