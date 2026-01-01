import pool from '../config/database';

export enum PaymentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  EXPIRED = 'expired'
}

export interface Payment {
  payment_id: string;
  reference: string;
  user_id: string;
  amount: number;
  status: PaymentStatus;
  transaction_id?: string;
  match_id?: string;
  created_at: Date;
  updated_at: Date;
  confirmed_at?: Date;
}

export class PaymentModel {
  /**
   * Create a new payment record
   * Idempotent: If reference already exists, returns existing payment
   */
  static async create(
    reference: string,
    userId: string,
    amount: number
  ): Promise<Payment> {
    // Check if payment with this reference already exists (idempotency)
    const existing = await this.findByReference(reference);
    if (existing) {
      return existing;
    }

    const result = await pool.query(
      `INSERT INTO payments (reference, user_id, amount, status) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [reference, userId, amount, PaymentStatus.PENDING]
    );
    return result.rows[0];
  }

  /**
   * Find payment by reference ID
   */
  static async findByReference(reference: string): Promise<Payment | null> {
    const result = await pool.query(
      'SELECT * FROM payments WHERE reference = $1',
      [reference]
    );
    return result.rows[0] || null;
  }

  /**
   * Update payment status
   * Idempotent: Safe to call multiple times with same status
   */
  static async updateStatus(
    reference: string,
    status: PaymentStatus,
    transactionId?: string,
    matchId?: string
  ): Promise<Payment | null> {
    const updates: string[] = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [reference, status];
    let paramIndex = 3;

    if (transactionId !== undefined) {
      updates.push(`transaction_id = $${paramIndex}`);
      values.push(transactionId);
      paramIndex++;
    }

    if (matchId !== undefined) {
      updates.push(`match_id = $${paramIndex}`);
      values.push(matchId);
      paramIndex++;
    }

    if (status === PaymentStatus.CONFIRMED) {
      updates.push('confirmed_at = CURRENT_TIMESTAMP');
    }

    const result = await pool.query(
      `UPDATE payments 
       SET ${updates.join(', ')}
       WHERE reference = $1
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Find payments by user ID
   */
  static async findByUserId(userId: string): Promise<Payment[]> {
    const result = await pool.query(
      'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  /**
   * Find payments by match ID
   */
  static async findByMatchId(matchId: string): Promise<Payment[]> {
    const result = await pool.query(
      'SELECT * FROM payments WHERE match_id = $1',
      [matchId]
    );
    return result.rows;
  }

  /**
   * Find confirmed payment for user and match
   */
  static async findConfirmedPaymentForMatch(
    userId: string,
    matchId: string
  ): Promise<Payment | null> {
    const result = await pool.query(
      `SELECT * FROM payments 
       WHERE user_id = $1 
       AND match_id = $2 
       AND status = $3
       ORDER BY confirmed_at DESC
       LIMIT 1`,
      [userId, matchId, PaymentStatus.CONFIRMED]
    );
    return result.rows[0] || null;
  }

  /**
   * Link a payment to a match
   */
  static async linkToMatch(reference: string, matchId: string): Promise<Payment | null> {
    const result = await pool.query(
      `UPDATE payments 
       SET match_id = $2, updated_at = CURRENT_TIMESTAMP
       WHERE reference = $1
       RETURNING *`,
      [reference, matchId]
    );
    return result.rows[0] || null;
  }

  /**
   * Clean up expired pending payments (older than 30 minutes)
   */
  static async cleanupExpired(): Promise<number> {
    const result = await pool.query(
      `UPDATE payments 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE status = $2 
       AND created_at < NOW() - INTERVAL '30 minutes'
       RETURNING payment_id`,
      [PaymentStatus.EXPIRED, PaymentStatus.PENDING]
    );
    return result.rowCount || 0;
  }
}
