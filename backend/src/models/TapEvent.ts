import pool from '../config/database';

export interface TapEvent {
  tap_id: string;
  match_id: string;
  user_id: string;
  client_timestamp: number;
  server_timestamp: number;
  reaction_ms: number;
  is_valid: boolean;
  disqualified: boolean;
  disqualification_reason?: string;
  created_at: Date;
}

/**
 * Server-authoritative tap events
 * Records all tap attempts with server timestamps for anti-cheat
 */
export class TapEventModel {
  /**
   * Record a tap event
   */
  static async create(
    matchId: string,
    userId: string,
    clientTimestamp: number,
    serverTimestamp: number,
    greenLightTime: number
  ): Promise<TapEvent> {
    const reactionMs = serverTimestamp - greenLightTime;
    const isValid = reactionMs >= 0 && reactionMs <= 5000; // 5 second max window
    const disqualified = reactionMs < 0;
    const disqualificationReason = disqualified ? 'early_tap' : undefined;
    
    const result = await pool.query(
      `INSERT INTO tap_events (
        match_id, user_id, client_timestamp, server_timestamp, 
        reaction_ms, is_valid, disqualified, disqualification_reason
      ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [
        matchId, userId, clientTimestamp, serverTimestamp, 
        reactionMs, isValid, disqualified, disqualificationReason
      ]
    );
    
    return result.rows[0];
  }

  /**
   * Get all taps for a match
   */
  static async findByMatchId(matchId: string): Promise<TapEvent[]> {
    const result = await pool.query(
      `SELECT * FROM tap_events 
       WHERE match_id = $1 
       ORDER BY server_timestamp ASC`,
      [matchId]
    );
    
    return result.rows;
  }

  /**
   * Get user's tap for a match
   */
  static async findByMatchAndUser(matchId: string, userId: string): Promise<TapEvent | null> {
    const result = await pool.query(
      `SELECT * FROM tap_events 
       WHERE match_id = $1 AND user_id = $2
       ORDER BY server_timestamp ASC
       LIMIT 1`,
      [matchId, userId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get first valid tap for a match
   */
  static async getFirstValidTap(matchId: string): Promise<TapEvent | null> {
    const result = await pool.query(
      `SELECT * FROM tap_events 
       WHERE match_id = $1 
         AND is_valid = true 
         AND disqualified = false
       ORDER BY server_timestamp ASC
       LIMIT 1`,
      [matchId]
    );
    
    return result.rows[0] || null;
  }
}
