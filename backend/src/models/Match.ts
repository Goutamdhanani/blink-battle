import pool from '../config/database';
import { Match, MatchStatus, GameResult, MatchResult } from './types';

export class MatchModel {
  /**
   * Create a new match with idempotency support
   * Stores player wallet addresses at match creation time
   */
  static async create(
    player1Id: string,
    player2Id: string,
    stake: number,
    idempotencyKey?: string
  ): Promise<Match> {
    // If idempotency key provided, check for existing match
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        console.log(`[Match] Idempotent match creation - returning existing match ${existing.match_id}`);
        return existing;
      }
    }

    // Fetch player wallet addresses
    const player1 = await pool.query('SELECT wallet_address FROM users WHERE user_id = $1', [player1Id]);
    const player2 = await pool.query('SELECT wallet_address FROM users WHERE user_id = $1', [player2Id]);

    const player1Wallet = player1.rows[0]?.wallet_address;
    const player2Wallet = player2.rows[0]?.wallet_address;

    if (!player1Wallet || !player2Wallet) {
      throw new Error('Player wallet addresses not found');
    }

    const result = await pool.query(
      `INSERT INTO matches 
        (player1_id, player2_id, stake, status, player1_wallet, player2_wallet, idempotency_key,
         player1_payout_state, player2_payout_state) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [player1Id, player2Id, stake, MatchStatus.PENDING, player1Wallet, player2Wallet, idempotencyKey || null,
       'NOT_PAID', 'NOT_PAID']
    );
    return result.rows[0];
  }

  /**
   * Find match by idempotency key
   */
  static async findByIdempotencyKey(key: string): Promise<Match | null> {
    const result = await pool.query(
      'SELECT * FROM matches WHERE idempotency_key = $1',
      [key]
    );
    return result.rows[0] || null;
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

    // Validate winner if specified
    if (result.winnerId) {
      const isPlayer1 = match.player1_id === result.winnerId;
      const isPlayer2 = match.player2_id === result.winnerId;
      
      if (!isPlayer1 && !isPlayer2) {
        throw new Error(`Winner ID ${result.winnerId} is not a participant in match ${result.matchId}`);
      }

      // Validate winner wallet is available
      const winnerWallet = isPlayer1 ? match.player1_wallet : match.player2_wallet;
      if (!winnerWallet) {
        throw new Error(`Winner wallet not found for winner ${result.winnerId} in match ${result.matchId}`);
      }
      
      console.log(`[Match] Completing match ${result.matchId} - winner: ${result.winnerId}, wallet: ${winnerWallet}`);
    }

    const totalPot = match.stake * 2;
    const fee = totalPot * (platformFeePercent / 100);

    // Determine match results for each player
    let player1MatchResult: MatchResult;
    let player2MatchResult: MatchResult;
    
    if (result.winnerId === match.player1_id) {
      player1MatchResult = MatchResult.WIN;
      player2MatchResult = MatchResult.LOSS;
    } else if (result.winnerId === match.player2_id) {
      player1MatchResult = MatchResult.LOSS;
      player2MatchResult = MatchResult.WIN;
    } else {
      // No winner - either draw or no match
      player1MatchResult = result.reason === 'tie' ? MatchResult.DRAW : MatchResult.NO_MATCH;
      player2MatchResult = result.reason === 'tie' ? MatchResult.DRAW : MatchResult.NO_MATCH;
    }

    // CRITICAL: Always set result_type to ensure match decisions are saved
    // This prevents "orphan matches" with missing result data
    // Also set match_result and payout_state for proper claim validation
    await pool.query(
      `UPDATE matches 
       SET winner_id = $1, 
           player1_reaction_ms = $2, 
           player2_reaction_ms = $3,
           status = $4,
           fee = $5,
           result_type = $6,
           player1_match_result = $7,
           player2_match_result = $8,
           player1_payout_state = 'NOT_PAID',
           player2_payout_state = 'NOT_PAID',
           completed_at = CURRENT_TIMESTAMP
       WHERE match_id = $9`,
      [
        result.winnerId,
        result.player1ReactionMs,
        result.player2ReactionMs,
        MatchStatus.COMPLETED,
        fee,
        result.reason,  // result_type
        player1MatchResult,
        player2MatchResult,
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

  /**
   * Find active match for a user (pending, countdown, or in_progress)
   */
  static async findActiveMatch(userId: string): Promise<Match | null> {
    const result = await pool.query(
      `SELECT * FROM matches 
       WHERE (player1_id = $1 OR player2_id = $1) 
         AND status IN ($2, $3, $4)
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId, MatchStatus.PENDING, MatchStatus.COUNTDOWN, MatchStatus.IN_PROGRESS]
    );
    return result.rows[0] || null;
  }

  // HTTP Polling Methods

  /**
   * Set green light time (server-picked random delay) as milliseconds since epoch
   */
  static async setGreenLightTime(matchId: string, greenLightTime: number): Promise<void> {
    await pool.query(
      `UPDATE matches 
       SET green_light_time = $1::bigint, updated_at = NOW()
       WHERE match_id = $2`,
      [greenLightTime, matchId]
    );
  }

  /**
   * Mark player as ready
   */
  static async setPlayerReady(matchId: string, playerId: string): Promise<void> {
    const match = await this.findById(matchId);
    if (!match) throw new Error('Match not found');

    const isPlayer1 = match.player1_id === playerId;
    const readyColumn = isPlayer1 ? 'player1_ready' : 'player2_ready';
    const readyAtColumn = isPlayer1 ? 'player1_ready_at' : 'player2_ready_at';

    await pool.query(
      `UPDATE matches 
       SET ${readyColumn} = true, ${readyAtColumn} = NOW(), updated_at = NOW()
       WHERE match_id = $1`,
      [matchId]
    );
  }

  /**
   * Check if both players are ready
   */
  static async areBothPlayersReady(matchId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT player1_ready, player2_ready 
       FROM matches 
       WHERE match_id = $1`,
      [matchId]
    );
    
    if (!result.rows[0]) return false;
    return result.rows[0].player1_ready && result.rows[0].player2_ready;
  }

  /**
   * Get match state for polling
   */
  static async getMatchState(matchId: string): Promise<Match | null> {
    const result = await pool.query(
      `SELECT m.*, 
        u1.wallet_address as player1_wallet,
        u2.wallet_address as player2_wallet
       FROM matches m
       LEFT JOIN users u1 ON m.player1_id = u1.user_id
       LEFT JOIN users u2 ON m.player2_id = u2.user_id
       WHERE m.match_id = $1`,
      [matchId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Mark player stake as deposited
   */
  static async setPlayerStaked(matchId: string, playerId: string, txHash?: string): Promise<void> {
    const match = await this.findById(matchId);
    if (!match) throw new Error('Match not found');

    const isPlayer1 = match.player1_id === playerId;
    
    // Use safe column mapping to prevent SQL injection
    if (isPlayer1) {
      await pool.query(
        `UPDATE matches 
         SET player1_staked = true, player1_stake_tx = $1, updated_at = NOW()
         WHERE match_id = $2`,
        [txHash || null, matchId]
      );
    } else {
      await pool.query(
        `UPDATE matches 
         SET player2_staked = true, player2_stake_tx = $1, updated_at = NOW()
         WHERE match_id = $2`,
        [txHash || null, matchId]
      );
    }
  }

  /**
   * Check if both players have staked
   */
  static async areBothPlayersStaked(matchId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT player1_staked, player2_staked 
       FROM matches 
       WHERE match_id = $1`,
      [matchId]
    );
    
    if (!result.rows[0]) return false;
    return result.rows[0].player1_staked && result.rows[0].player2_staked;
  }
}
