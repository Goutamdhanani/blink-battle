import pool from '../config/database';

export interface LatencySample {
  sample_id: string;
  user_id: string;
  latency_ms: number;
  created_at: Date;
}

/**
 * Store latency samples for network compensation and anti-cheat
 */
export class LatencySampleModel {
  /**
   * Record a latency sample
   */
  static async create(userId: string, latencyMs: number): Promise<LatencySample> {
    const result = await pool.query(
      `INSERT INTO latency_samples (user_id, latency_ms) 
       VALUES ($1, $2) 
       RETURNING *`,
      [userId, latencyMs]
    );
    
    return result.rows[0];
  }

  /**
   * Get recent latency samples for a user (for analysis)
   */
  static async getRecentSamples(userId: string, limit: number = 10): Promise<LatencySample[]> {
    const result = await pool.query(
      `SELECT * FROM latency_samples 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows;
  }

  /**
   * Calculate average latency for a user
   */
  static async getAverageLatency(userId: string, samples: number = 5): Promise<number | null> {
    const result = await pool.query(
      `SELECT AVG(latency_ms) as avg_latency
       FROM (
         SELECT latency_ms 
         FROM latency_samples 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2
       ) recent`,
      [userId, samples]
    );
    
    const avg = result.rows[0]?.avg_latency;
    return avg ? parseFloat(avg) : null;
  }

  /**
   * Clean up old latency samples (keep only recent 100 per user)
   */
  static async cleanup(userId: string): Promise<number> {
    const result = await pool.query(
      `DELETE FROM latency_samples 
       WHERE user_id = $1 
         AND sample_id NOT IN (
           SELECT sample_id 
           FROM latency_samples 
           WHERE user_id = $1 
           ORDER BY created_at DESC 
           LIMIT 100
         )
       RETURNING sample_id`,
      [userId]
    );
    
    return result.rows.length;
  }
}
