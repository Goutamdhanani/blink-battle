import pool from '../config/database';

export enum ClaimStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface Claim {
  id: string;
  match_id: string;
  winner_wallet: string;
  amount: string; // BigInt as string
  platform_fee: string; // BigInt as string
  net_payout: string; // BigInt as string
  tx_hash?: string;
  status: ClaimStatus;
  idempotency_key: string;
  created_at: Date;
  processed_at?: Date;
  error_message?: string;
}

export class ClaimModel {
  /**
   * Create a new claim record
   */
  static async create(
    matchId: string,
    winnerWallet: string,
    amount: string,
    platformFee: string,
    netPayout: string,
    idempotencyKey: string,
    status: ClaimStatus = ClaimStatus.PENDING
  ): Promise<Claim> {
    const result = await pool.query(
      `INSERT INTO claims 
        (match_id, winner_wallet, amount, platform_fee, net_payout, idempotency_key, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [matchId, winnerWallet, amount, platformFee, netPayout, idempotencyKey, status]
    );
    return result.rows[0];
  }

  /**
   * Find claim by idempotency key
   */
  static async findByIdempotencyKey(key: string): Promise<Claim | null> {
    const result = await pool.query(
      'SELECT * FROM claims WHERE idempotency_key = $1',
      [key]
    );
    return result.rows[0] || null;
  }

  /**
   * Find claim by match ID
   */
  static async findByMatchId(matchId: string): Promise<Claim | null> {
    const result = await pool.query(
      'SELECT * FROM claims WHERE match_id = $1',
      [matchId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find claims by winner wallet
   */
  static async findByWallet(wallet: string): Promise<Claim[]> {
    const result = await pool.query(
      'SELECT * FROM claims WHERE winner_wallet = $1 ORDER BY created_at DESC',
      [wallet]
    );
    return result.rows;
  }

  /**
   * Update claim with transaction hash and mark as completed
   */
  static async complete(
    idempotencyKey: string,
    txHash: string
  ): Promise<void> {
    await pool.query(
      `UPDATE claims 
       SET tx_hash = $1, status = $2, processed_at = NOW() 
       WHERE idempotency_key = $3`,
      [txHash, ClaimStatus.COMPLETED, idempotencyKey]
    );
  }

  /**
   * Mark claim as failed with error message
   */
  static async markFailed(
    idempotencyKey: string,
    errorMessage: string
  ): Promise<void> {
    await pool.query(
      `UPDATE claims 
       SET status = $1, error_message = $2, processed_at = NOW() 
       WHERE idempotency_key = $3`,
      [ClaimStatus.FAILED, errorMessage, idempotencyKey]
    );
  }

  /**
   * Update claim status
   */
  static async updateStatus(
    idempotencyKey: string,
    status: ClaimStatus
  ): Promise<void> {
    await pool.query(
      'UPDATE claims SET status = $1 WHERE idempotency_key = $2',
      [status, idempotencyKey]
    );
  }

  /**
   * Get pending claims (for retry processing)
   */
  static async getPendingClaims(limit: number = 100): Promise<Claim[]> {
    const result = await pool.query(
      `SELECT * FROM claims 
       WHERE status IN ($1, $2) 
       ORDER BY created_at ASC 
       LIMIT $3`,
      [ClaimStatus.PENDING, ClaimStatus.PROCESSING, limit]
    );
    return result.rows;
  }
}
