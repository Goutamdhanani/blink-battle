import pool from '../config/database';
import { User } from './types';

export class UserModel {
  static async create(walletAddress: string, region?: string): Promise<User> {
    const result = await pool.query(
      `INSERT INTO users (wallet_address, region) 
       VALUES ($1, $2) 
       ON CONFLICT (wallet_address) 
       DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [walletAddress, region]
    );
    return result.rows[0];
  }

  static async findByWallet(walletAddress: string): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [walletAddress]
    );
    return result.rows[0] || null;
  }

  static async findById(userId: string): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM users WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  static async updateStats(
    userId: string,
    win: boolean,
    reactionTime: number
  ): Promise<void> {
    await pool.query(
      `UPDATE users 
       SET wins = wins + $1, 
           losses = losses + $2,
           avg_reaction_time = CASE 
             WHEN avg_reaction_time IS NULL THEN $3
             ELSE (avg_reaction_time * (wins + losses) + $3) / (wins + losses + 1)
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $4`,
      [win ? 1 : 0, win ? 0 : 1, reactionTime, userId]
    );
  }

  static async getLeaderboard(limit: number = 10): Promise<User[]> {
    const result = await pool.query(
      `SELECT * FROM users 
       WHERE wins > 0 
       ORDER BY wins DESC, avg_reaction_time ASC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}
