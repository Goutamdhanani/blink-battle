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
   * Record a tap event with first-write-wins semantics
   * Uses INSERT ... ON CONFLICT DO NOTHING to prevent duplicate taps
   * Returns existing tap if duplicate detected
   * 
   * CRITICAL: Clamps reaction_ms to valid range to prevent negative/garbage values
   */
  static async create(
    matchId: string,
    userId: string,
    clientTimestamp: number,
    serverTimestamp: number,
    greenLightTime: number
  ): Promise<TapEvent> {
    const reactionMs = serverTimestamp - greenLightTime;
    
    // Validate reaction time WITHOUT clamping
    // Store actual reaction time for audit and display purposes
    // is_valid = true only if reaction is within acceptable range (0-3000ms)
    const isValid = reactionMs >= 0 && reactionMs <= 3000; // 3 second max for valid reaction
    const disqualified = reactionMs < 0; // Tapped before green light
    const disqualificationReason = disqualified ? 'early_tap' : undefined;
    
    // Log if reaction is out of valid range (but still store actual value)
    if (!isValid && !disqualified) {
      console.warn(`[TapEvent] ⚠️  Slow reaction: ${reactionMs}ms for match ${matchId}, user ${userId} (marked as invalid but stored)`);
    }
    
    // First-write-wins: If a tap already exists for this (match_id, user_id), 
    // the ON CONFLICT DO NOTHING will prevent the insert
    const result = await pool.query(
      `INSERT INTO tap_events (
        match_id, user_id, client_timestamp, server_timestamp, 
        reaction_ms, is_valid, disqualified, disqualification_reason
      ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       ON CONFLICT (match_id, user_id) DO NOTHING
       RETURNING *`,
      [
        matchId, userId, clientTimestamp, serverTimestamp, 
        reactionMs, isValid, disqualified, disqualificationReason
      ]
    );
    
    // If no rows returned, conflict occurred - return existing tap
    if (result.rows.length === 0) {
      console.log(`[TapEvent] Duplicate tap detected for match ${matchId}, user ${userId} - returning existing tap`);
      const existing = await this.findByMatchAndUser(matchId, userId);
      if (!existing) {
        throw new Error('Duplicate tap detected but existing tap not found');
      }
      return existing;
    }
    
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
