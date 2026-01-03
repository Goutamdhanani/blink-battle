import pool from '../config/database';

export enum DepositStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  USED = 'used',
  REFUNDED = 'refunded'
}

export interface Deposit {
  id: string;
  user_id: string;
  wallet_address: string;
  amount: number;
  tx_hash: string;
  payment_reference: string;
  status: DepositStatus;
  match_id?: string;
  created_at: Date;
  confirmed_at?: Date;
  used_at?: Date;
}

export class DepositModel {
  /**
   * Create a new deposit record
   */
  static async create(
    userId: string,
    walletAddress: string,
    amount: number,
    txHash: string,
    paymentReference: string
  ): Promise<Deposit> {
    const result = await pool.query(
      `INSERT INTO deposits 
        (user_id, wallet_address, amount, tx_hash, payment_reference, status) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [userId, walletAddress, amount, txHash, paymentReference, DepositStatus.PENDING]
    );
    return result.rows[0];
  }

  /**
   * Find deposit by payment reference
   */
  static async findByReference(paymentReference: string): Promise<Deposit | null> {
    const result = await pool.query(
      'SELECT * FROM deposits WHERE payment_reference = $1',
      [paymentReference]
    );
    return result.rows[0] || null;
  }

  /**
   * Find deposits by user ID
   */
  static async findByUserId(userId: string): Promise<Deposit[]> {
    const result = await pool.query(
      'SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  /**
   * Update deposit status
   */
  static async updateStatus(
    depositId: string,
    status: DepositStatus,
    matchId?: string
  ): Promise<void> {
    const now = new Date();
    
    if (status === DepositStatus.CONFIRMED) {
      await pool.query(
        'UPDATE deposits SET status = $1, confirmed_at = $2 WHERE id = $3',
        [status, now, depositId]
      );
    } else if (status === DepositStatus.USED && matchId) {
      await pool.query(
        'UPDATE deposits SET status = $1, match_id = $2, used_at = $3 WHERE id = $4',
        [status, matchId, now, depositId]
      );
    } else {
      await pool.query(
        'UPDATE deposits SET status = $1 WHERE id = $2',
        [status, depositId]
      );
    }
  }

  /**
   * Link deposit to match
   */
  static async linkToMatch(paymentReference: string, matchId: string): Promise<void> {
    await pool.query(
      'UPDATE deposits SET match_id = $1, status = $2, used_at = NOW() WHERE payment_reference = $3',
      [matchId, DepositStatus.USED, paymentReference]
    );
  }

  /**
   * Get available deposits for user (confirmed but not used)
   */
  static async getAvailableForUser(userId: string): Promise<Deposit[]> {
    const result = await pool.query(
      `SELECT * FROM deposits 
       WHERE user_id = $1 AND status = $2 
       ORDER BY created_at DESC`,
      [userId, DepositStatus.CONFIRMED]
    );
    return result.rows;
  }
}
