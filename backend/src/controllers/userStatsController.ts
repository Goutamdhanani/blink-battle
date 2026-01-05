import { Request, Response } from 'express';
import pool from '../config/database';
import { AuthenticatedRequest } from '../types/AuthenticatedRequest';

export class UserStatsController {
  /**
   * Get user's performance percentile across all brain training games
   */
  static async getUserPercentile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId;

      // Get user's total score
      const userScoreResult = await pool.query(
        `SELECT 
          COALESCE(SUM(score), 0) as total_score,
          COALESCE(AVG(accuracy)::integer, 0) as avg_accuracy
         FROM game_scores
         WHERE user_id = $1`,
        [userId]
      );

      const userTotalScore = parseInt(userScoreResult.rows[0].total_score);
      const userAvgAccuracy = parseInt(userScoreResult.rows[0].avg_accuracy);

      // Calculate percentile based on total score
      const percentileResult = await pool.query(
        `WITH user_scores AS (
          SELECT 
            user_id,
            SUM(score) as total_score
          FROM game_scores
          GROUP BY user_id
        )
        SELECT 
          COUNT(*) FILTER (WHERE total_score < $1) as users_below,
          COUNT(*) as total_users
        FROM user_scores
        WHERE total_score > 0`,
        [userTotalScore]
      );

      const usersBelow = parseInt(percentileResult.rows[0].users_below);
      const totalUsers = parseInt(percentileResult.rows[0].total_users);
      
      const percentile = totalUsers > 0 
        ? Math.round((usersBelow / totalUsers) * 100)
        : 0;

      // Calculate which bracket they're in
      let performanceLabel = '';
      if (percentile >= 95) {
        performanceLabel = 'Top 5%';
      } else if (percentile >= 90) {
        performanceLabel = 'Top 10%';
      } else if (percentile >= 75) {
        performanceLabel = 'Top 25%';
      } else if (percentile >= 50) {
        performanceLabel = 'Above Average';
      } else {
        performanceLabel = 'Keep Training';
      }

      res.json({
        success: true,
        percentile,
        performanceLabel,
        totalScore: userTotalScore,
        avgAccuracy: userAvgAccuracy,
        totalUsers,
      });
    } catch (error) {
      console.error('Error fetching user percentile:', error);
      res.status(500).json({ error: 'Failed to fetch user percentile' });
    }
  }

  /**
   * Get user's play style based on when they typically play
   */
  static async getPlayStyle(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId;

      const result = await pool.query(
        `SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as count
         FROM game_scores
         WHERE user_id = $1
         GROUP BY EXTRACT(HOUR FROM created_at)
         ORDER BY count DESC
         LIMIT 1`,
        [userId]
      );

      let playStyle = 'Not Enough Data';
      
      if (result.rows.length > 0) {
        const mostActiveHour = parseInt(result.rows[0].hour);
        
        if (mostActiveHour >= 5 && mostActiveHour < 12) {
          playStyle = 'Early Bird';
        } else if (mostActiveHour >= 12 && mostActiveHour < 17) {
          playStyle = 'Afternoon Player';
        } else if (mostActiveHour >= 17 && mostActiveHour < 22) {
          playStyle = 'Evening Gamer';
        } else {
          playStyle = 'Night Owl';
        }
      }

      res.json({
        success: true,
        playStyle,
        mostActiveHour: result.rows.length > 0 ? parseInt(result.rows[0].hour) : null,
      });
    } catch (error) {
      console.error('Error fetching play style:', error);
      res.status(500).json({ error: 'Failed to fetch play style' });
    }
  }

  /**
   * Get global statistics (averages, benchmarks)
   */
  static async getGlobalStats(req: Request, res: Response): Promise<void> {
    try {
      // Get global averages
      const globalResult = await pool.query(
        `WITH user_totals AS (
          SELECT 
            user_id,
            SUM(score) as total_score,
            AVG(accuracy) as avg_accuracy
          FROM game_scores
          GROUP BY user_id
          HAVING COUNT(*) > 0
        )
        SELECT 
          COALESCE(AVG(total_score)::integer, 0) as avg_score,
          COALESCE(AVG(avg_accuracy)::integer, 0) as avg_accuracy,
          COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY total_score)::integer, 0) as top_10_threshold,
          COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_score)::integer, 0) as top_5_threshold
        FROM user_totals`
      );

      const stats = globalResult.rows[0];

      res.json({
        success: true,
        globalAverage: parseInt(stats.avg_score),
        globalAvgAccuracy: parseInt(stats.avg_accuracy),
        top10Threshold: parseInt(stats.top_10_threshold),
        top5Threshold: parseInt(stats.top_5_threshold),
      });
    } catch (error) {
      console.error('Error fetching global stats:', error);
      res.status(500).json({ error: 'Failed to fetch global stats' });
    }
  }

  /**
   * Get user's streak information
   */
  static async getStreaks(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId;

      // Get distinct play dates
      const datesResult = await pool.query(
        `SELECT DISTINCT DATE(created_at) as play_date
         FROM game_scores
         WHERE user_id = $1
         ORDER BY play_date DESC`,
        [userId]
      );

      const playDates = datesResult.rows.map(row => new Date(row.play_date));
      
      // Calculate current streak
      let currentStreak = 0;
      let longestStreak = 0;
      let tempStreak = 0;
      
      if (playDates.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Check if played today or yesterday
        const lastPlayDate = new Date(playDates[0]);
        lastPlayDate.setHours(0, 0, 0, 0);
        
        const daysDiff = Math.floor((today.getTime() - lastPlayDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 1) {
          currentStreak = 1;
          
          // Calculate full current streak
          for (let i = 1; i < playDates.length; i++) {
            const prevDate = new Date(playDates[i - 1]);
            const currDate = new Date(playDates[i]);
            prevDate.setHours(0, 0, 0, 0);
            currDate.setHours(0, 0, 0, 0);
            
            const diff = Math.floor((prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (diff === 1) {
              currentStreak++;
            } else {
              break;
            }
          }
        }
        
        // Calculate longest streak
        tempStreak = 1;
        longestStreak = 1;
        
        for (let i = 1; i < playDates.length; i++) {
          const prevDate = new Date(playDates[i - 1]);
          const currDate = new Date(playDates[i]);
          prevDate.setHours(0, 0, 0, 0);
          currDate.setHours(0, 0, 0, 0);
          
          const diff = Math.floor((prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diff === 1) {
            tempStreak++;
            longestStreak = Math.max(longestStreak, tempStreak);
          } else {
            tempStreak = 1;
          }
        }
      }

      res.json({
        success: true,
        currentStreak,
        longestStreak,
        totalPlayDays: playDates.length,
      });
    } catch (error) {
      console.error('Error fetching streaks:', error);
      res.status(500).json({ error: 'Failed to fetch streaks' });
    }
  }

  /**
   * Get historical performance data for trend graph
   */
  static async getPerformanceTrend(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await pool.query(
        `SELECT 
          DATE(created_at) as date,
          AVG(score)::integer as avg_score,
          AVG(accuracy)::integer as avg_accuracy,
          COUNT(*) as games_played
         FROM game_scores
         WHERE user_id = $1
         GROUP BY DATE(created_at)
         ORDER BY date DESC
         LIMIT $2`,
        [userId, limit]
      );

      const trendData = result.rows.reverse().map(row => ({
        date: row.date,
        avgScore: parseInt(row.avg_score),
        avgAccuracy: parseInt(row.avg_accuracy),
        gamesPlayed: parseInt(row.games_played),
      }));

      res.json({
        success: true,
        trendData,
      });
    } catch (error) {
      console.error('Error fetching performance trend:', error);
      res.status(500).json({ error: 'Failed to fetch performance trend' });
    }
  }

  /**
   * Get user's cognitive index percentile comparison
   */
  static async getCognitiveComparison(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).userId;

      // Get user's cognitive index (calculated from game scores)
      const userResult = await pool.query(
        `SELECT 
          COALESCE(AVG(accuracy)::integer, 0) as avg_accuracy,
          COALESCE(AVG(score)::integer, 0) as avg_score
         FROM game_scores
         WHERE user_id = $1`,
        [userId]
      );

      const userCognitiveIndex = Math.min(100, parseInt(userResult.rows[0].avg_accuracy));

      // Get global percentiles
      const globalResult = await pool.query(
        `WITH user_cognitive AS (
          SELECT 
            user_id,
            AVG(accuracy)::integer as cognitive_index
          FROM game_scores
          GROUP BY user_id
          HAVING COUNT(*) > 0
        )
        SELECT 
          COALESCE(AVG(cognitive_index)::integer, 65) as global_average,
          COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY cognitive_index)::integer, 85) as top_10_threshold
        FROM user_cognitive`
      );

      const globalAverage = parseInt(globalResult.rows[0].global_average);
      const top10Threshold = parseInt(globalResult.rows[0].top_10_threshold);

      res.json({
        success: true,
        userCognitiveIndex,
        globalAverage,
        top10Threshold,
      });
    } catch (error) {
      console.error('Error fetching cognitive comparison:', error);
      res.status(500).json({ error: 'Failed to fetch cognitive comparison' });
    }
  }
}
