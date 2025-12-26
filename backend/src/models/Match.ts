import pool from '../config/database';
import { Match, MatchStatus, GameResult } from './types';

export class MatchModel {
  static async create(
    player1Id: string,
    player2Id: string,
    stake: number
  ): Promise<Match> {
    const result = await pool.query(
      `INSERT INTO matches (player1_id, player2_id, stake, status) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [player1Id, player2Id, stake, MatchStatus.PENDING]
    );
    return result.rows[0];
  }

  static async findById(matchId: string): Promise<Match | null> {
    const result = await pool.query(
      'SELECT * FROM matches WHERE match_id = $1',
      [matchId]
    );
    return result.rows[0] || null;
  }

  static async updateStatus(
    matchId: string,
    status: MatchStatus
  ): Promise<void> {
    await pool.query(
      'UPDATE matches SET status = $1 WHERE match_id = $2',
      [status, matchId]
    );
  }

  static async recordSignalTime(
    matchId: string,
    signalTimestamp: number
  ): Promise<void> {
    await pool.query(
      'UPDATE matches SET signal_timestamp = $1, status = $2 WHERE match_id = $3',
      [signalTimestamp, MatchStatus.IN_PROGRESS, matchId]
    );
  }

  static async recordReaction(
    matchId: string,
    playerId: string,
    reactionMs: number
  ): Promise<void> {
    const match = await this.findById(matchId);
    if (!match) throw new Error('Match not found');

    const isPlayer1 = match.player1_id === playerId;
    const column = isPlayer1 ? 'player1_reaction_ms' : 'player2_reaction_ms';

    await pool.query(
      `UPDATE matches SET ${column} = $1 WHERE match_id = $2`,
      [reactionMs, matchId]
    );
  }

  static async completeMatch(result: GameResult): Promise<void> {
    const platformFeePercent = parseFloat(process.env.PLATFORM_FEE_PERCENT || '3');
    const match = await this.findById(result.matchId);
    if (!match) throw new Error('Match not found');

    const totalPot = match.stake * 2;
    const fee = totalPot * (platformFeePercent / 100);

    await pool.query(
      `UPDATE matches 
       SET winner_id = $1, 
           player1_reaction_ms = $2, 
           player2_reaction_ms = $3,
           status = $4,
           fee = $5,
           completed_at = CURRENT_TIMESTAMP
       WHERE match_id = $6`,
      [
        result.winnerId,
        result.player1ReactionMs,
        result.player2ReactionMs,
        MatchStatus.COMPLETED,
        fee,
        result.matchId,
      ]
    );
  }

  static async incrementFalseStartCount(matchId: string): Promise<number> {
    const result = await pool.query(
      `UPDATE matches 
       SET false_start_count = false_start_count + 1 
       WHERE match_id = $1 
       RETURNING false_start_count`,
      [matchId]
    );
    return result.rows[0].false_start_count;
  }

  static async getMatchHistory(
    userId: string,
    limit: number = 10
  ): Promise<Match[]> {
    const result = await pool.query(
      `SELECT * FROM matches 
       WHERE (player1_id = $1 OR player2_id = $1) 
         AND status = $2
       ORDER BY completed_at DESC 
       LIMIT $3`,
      [userId, MatchStatus.COMPLETED, limit]
    );
    return result.rows;
  }
}
