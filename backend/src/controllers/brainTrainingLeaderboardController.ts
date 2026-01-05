import { Request, Response } from 'express';
import pool from '../config/database';
import { AuthenticatedRequest } from '../types/AuthenticatedRequest';

export class BrainTrainingLeaderboardController {
  /**
   * Get global leaderboard across all brain training games
   */
  static async getGlobalLeaderboard(req: Request, res: Response) {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const result = await pool.query(
        `SELECT 
          user_id,
          wallet_address,
          games_completed,
          total_score,
          total_games_played,
          overall_accuracy,
          highest_level_reached,
          last_played,
          ROW_NUMBER() OVER (ORDER BY total_score DESC, overall_accuracy DESC) as rank
         FROM brain_training_leaderboard
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      res.json({
        success: true,
        leaderboard: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      console.error('Error fetching global leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  }

  /**
   * Get leaderboard for a specific game type
   */
  static async getGameTypeLeaderboard(req: Request, res: Response) {
    try {
      const { gameType } = req.params;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      if (!['memory', 'attention', 'reflex'].includes(gameType)) {
        return res.status(400).json({ error: 'Invalid game type' });
      }

      const result = await pool.query(
        `SELECT 
          user_id,
          wallet_address,
          game_type,
          best_score,
          average_score,
          average_accuracy,
          highest_level,
          games_played,
          rank
         FROM game_type_leaderboard
         WHERE game_type = $1
         ORDER BY rank
         LIMIT $2 OFFSET $3`,
        [gameType, limit, offset]
      );

      res.json({
        success: true,
        gameType,
        leaderboard: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      console.error('Error fetching game type leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch game type leaderboard' });
    }
  }

  /**
   * Get user's ranking in global leaderboard
   */
  static async getUserGlobalRank(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).userId;

      const result = await pool.query(
        `SELECT 
          user_id,
          wallet_address,
          games_completed,
          total_score,
          total_games_played,
          overall_accuracy,
          highest_level_reached,
          last_played,
          rank
         FROM (
           SELECT 
             *,
             ROW_NUMBER() OVER (ORDER BY total_score DESC, overall_accuracy DESC) as rank
           FROM brain_training_leaderboard
         ) ranked
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          rank: null,
          message: 'User has not played any games yet',
        });
      }

      res.json({
        success: true,
        rank: parseInt(result.rows[0].rank),
        stats: result.rows[0],
      });
    } catch (error) {
      console.error('Error fetching user global rank:', error);
      res.status(500).json({ error: 'Failed to fetch user rank' });
    }
  }

  /**
   * Get user's ranking for a specific game type
   */
  static async getUserGameTypeRank(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).userId;
      const { gameType } = req.params;

      if (!['memory', 'attention', 'reflex'].includes(gameType)) {
        return res.status(400).json({ error: 'Invalid game type' });
      }

      const result = await pool.query(
        `SELECT 
          user_id,
          wallet_address,
          game_type,
          best_score,
          average_score,
          average_accuracy,
          highest_level,
          games_played,
          rank
         FROM game_type_leaderboard
         WHERE user_id = $1 AND game_type = $2`,
        [userId, gameType]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          rank: null,
          message: `User has not played ${gameType} game yet`,
        });
      }

      res.json({
        success: true,
        gameType,
        rank: parseInt(result.rows[0].rank),
        stats: result.rows[0],
      });
    } catch (error) {
      console.error('Error fetching user game type rank:', error);
      res.status(500).json({ error: 'Failed to fetch user game type rank' });
    }
  }
}
