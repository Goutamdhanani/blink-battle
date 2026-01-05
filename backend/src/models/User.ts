import pool from '../config/database';

export interface User {
  user_id: string;
  wallet_address: string;
  region?: string;
  wins: number;
  losses: number;
  avg_reaction_time?: number;
  created_at: Date;
  updated_at: Date;
}

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
}
