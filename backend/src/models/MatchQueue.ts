import pool from '../config/database';

export enum QueueStatus {
  SEARCHING = 'searching',
  MATCHED = 'matched',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export interface MatchQueueEntry {
  queue_id: string;
  user_id: string;
  stake: number;
  status: QueueStatus;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}

/**
 * Persistent matchmaking queue for HTTP polling
 * Replaces Redis-based ephemeral queue
 */
export class MatchQueueModel {
  /**
   * Add user to matchmaking queue
   */
  static async enqueue(userId: string, stake: number): Promise<MatchQueueEntry> {
    const expiresAt = new Date(Date.now() + 60000); // 1 minute timeout (as per requirements)
    
    const result = await pool.query(
      `INSERT INTO match_queue (user_id, stake, status, expires_at) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [userId, stake, QueueStatus.SEARCHING, expiresAt]
    );
    
    return result.rows[0];
  }

  /**
   * Find waiting player with matching stake
   */
  static async findMatch(stake: number, excludeUserId: string): Promise<MatchQueueEntry | null> {
    const result = await pool.query(
      `SELECT * FROM match_queue 
       WHERE stake = $1 
         AND status = $2 
         AND user_id != $3
         AND expires_at > NOW()
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [stake, QueueStatus.SEARCHING, excludeUserId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Update queue entry status
   */
  static async updateStatus(queueId: string, status: QueueStatus): Promise<void> {
    await pool.query(
      `UPDATE match_queue 
       SET status = $1, updated_at = NOW() 
       WHERE queue_id = $2`,
      [status, queueId]
    );
  }

  /**
   * Get user's current queue entry
   */
  static async findByUserId(userId: string): Promise<MatchQueueEntry | null> {
    const result = await pool.query(
      `SELECT * FROM match_queue 
       WHERE user_id = $1 
         AND status IN ($2, $3)
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, QueueStatus.SEARCHING, QueueStatus.MATCHED]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Cancel user's queue entry
   */
  static async cancel(userId: string): Promise<void> {
    await pool.query(
      `UPDATE match_queue 
       SET status = $1, updated_at = NOW() 
       WHERE user_id = $2 
         AND status = $3`,
      [QueueStatus.CANCELLED, userId, QueueStatus.SEARCHING]
    );
  }

  /**
   * Clean up expired queue entries
   */
  static async cleanupExpired(): Promise<number> {
    const result = await pool.query(
      `UPDATE match_queue 
       SET status = $1, updated_at = NOW() 
       WHERE expires_at < NOW() 
         AND status = $2
       RETURNING queue_id`,
      [QueueStatus.EXPIRED, QueueStatus.SEARCHING]
    );
    
    return result.rows.length;
  }
}
