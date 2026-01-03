import pool from '../config/database';

export enum NormalizedPaymentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface PaymentIntent {
  intent_id: string;
  payment_reference: string;
  user_id: string;
  match_id?: string;
  amount: number;
  minikit_transaction_id?: string;
  transaction_hash?: string;
  raw_status?: string;
  normalized_status: NormalizedPaymentStatus;
  locked_at?: Date;
  locked_by?: string;
  retry_count: number;
  last_retry_at?: Date;
  next_retry_at?: Date;
  created_at: Date;
  updated_at: Date;
  confirmed_at?: Date;
  last_error?: string;
}

export class PaymentIntentModel {
  /**
   * Create a new payment intent (idempotent via payment_reference)
   */
  static async create(
    paymentReference: string,
    userId: string,
    amount: number,
    matchId?: string
  ): Promise<PaymentIntent> {
    // Check if intent with this reference already exists (idempotency)
    const existing = await this.findByReference(paymentReference);
    if (existing) {
      return existing;
    }

    const result = await pool.query(
      `INSERT INTO payment_intents 
        (payment_reference, user_id, amount, match_id, normalized_status) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [paymentReference, userId, amount, matchId || null, NormalizedPaymentStatus.PENDING]
    );
    return result.rows[0];
  }

  /**
   * Find payment intent by reference
   */
  static async findByReference(reference: string): Promise<PaymentIntent | null> {
    const result = await pool.query(
      'SELECT * FROM payment_intents WHERE payment_reference = $1',
      [reference]
    );
    return result.rows[0] || null;
  }

  /**
   * Update payment intent status and related fields
   */
  static async updateStatus(
    reference: string,
    normalizedStatus: NormalizedPaymentStatus,
    rawStatus?: string,
    minikitTransactionId?: string,
    transactionHash?: string,
    error?: string
  ): Promise<PaymentIntent | null> {
    const updates: string[] = [
      'normalized_status = $2',
      'updated_at = CURRENT_TIMESTAMP'
    ];
    const values: any[] = [reference, normalizedStatus];
    let paramIndex = 3;

    if (rawStatus !== undefined) {
      updates.push(`raw_status = $${paramIndex}`);
      values.push(rawStatus);
      paramIndex++;
    }

    if (minikitTransactionId !== undefined) {
      updates.push(`minikit_transaction_id = $${paramIndex}`);
      values.push(minikitTransactionId);
      paramIndex++;
    }

    if (transactionHash !== undefined) {
      updates.push(`transaction_hash = $${paramIndex}`);
      values.push(transactionHash);
      paramIndex++;
    }

    if (error !== undefined) {
      updates.push(`last_error = $${paramIndex}`);
      values.push(error);
      paramIndex++;
    }

    if (normalizedStatus === NormalizedPaymentStatus.CONFIRMED) {
      updates.push('confirmed_at = CURRENT_TIMESTAMP');
    }

    const result = await pool.query(
      `UPDATE payment_intents 
       SET ${updates.join(', ')}
       WHERE payment_reference = $1
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Acquire lock on payment intent for processing
   * Returns the intent if lock was acquired, null otherwise
   */
  static async acquireLock(
    reference: string,
    lockOwner: string,
    lockDurationSeconds: number = 30
  ): Promise<PaymentIntent | null> {
    const result = await pool.query(
      `UPDATE payment_intents 
       SET locked_at = CURRENT_TIMESTAMP,
           locked_by = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE payment_reference = $1
         AND (locked_at IS NULL OR locked_at < CURRENT_TIMESTAMP - INTERVAL '${lockDurationSeconds} seconds')
       RETURNING *`,
      [reference, lockOwner]
    );
    return result.rows[0] || null;
  }

  /**
   * Release lock on payment intent
   */
  static async releaseLock(reference: string): Promise<void> {
    await pool.query(
      `UPDATE payment_intents 
       SET locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE payment_reference = $1`,
      [reference]
    );
  }

  /**
   * Get payment intents ready for retry (with exponential backoff)
   * Uses FOR UPDATE SKIP LOCKED to prevent concurrent processing
   */
  static async getPendingForRetry(limit: number = 10): Promise<PaymentIntent[]> {
    const result = await pool.query(
      `SELECT * FROM payment_intents 
       WHERE normalized_status = $1
         AND (locked_at IS NULL OR locked_at < CURRENT_TIMESTAMP - INTERVAL '30 seconds')
         AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
       ORDER BY next_retry_at NULLS FIRST, created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [NormalizedPaymentStatus.PENDING, limit]
    );
    return result.rows;
  }

  /**
   * Schedule retry with exponential backoff
   */
  static async scheduleRetry(
    reference: string,
    baseDelaySeconds: number = 5,
    maxDelaySeconds: number = 300
  ): Promise<void> {
    // Get current retry count
    const intent = await this.findByReference(reference);
    if (!intent) return;

    // Calculate exponential backoff: baseDelay * 2^retryCount
    const delaySeconds = Math.min(
      baseDelaySeconds * Math.pow(2, intent.retry_count),
      maxDelaySeconds
    );

    await pool.query(
      `UPDATE payment_intents 
       SET retry_count = retry_count + 1,
           last_retry_at = CURRENT_TIMESTAMP,
           next_retry_at = CURRENT_TIMESTAMP + INTERVAL '${delaySeconds} seconds',
           updated_at = CURRENT_TIMESTAMP
       WHERE payment_reference = $1`,
      [reference]
    );
  }

  /**
   * Link payment intent to match
   */
  static async linkToMatch(reference: string, matchId: string): Promise<PaymentIntent | null> {
    const result = await pool.query(
      `UPDATE payment_intents 
       SET match_id = $2, updated_at = CURRENT_TIMESTAMP
       WHERE payment_reference = $1
       RETURNING *`,
      [reference, matchId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find confirmed payment intent for user and match
   */
  static async findConfirmedForMatch(
    userId: string,
    matchId: string
  ): Promise<PaymentIntent | null> {
    const result = await pool.query(
      `SELECT * FROM payment_intents 
       WHERE user_id = $1 
         AND match_id = $2 
         AND normalized_status = $3
       ORDER BY confirmed_at DESC
       LIMIT 1`,
      [userId, matchId, NormalizedPaymentStatus.CONFIRMED]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all payment intents for a match
   */
  static async findByMatchId(matchId: string): Promise<PaymentIntent[]> {
    const result = await pool.query(
      'SELECT * FROM payment_intents WHERE match_id = $1 ORDER BY created_at DESC',
      [matchId]
    );
    return result.rows;
  }

  /**
   * Find payment intent by transaction ID
   */
  static async findByTransactionId(transactionId: string): Promise<PaymentIntent | null> {
    const result = await pool.query(
      'SELECT * FROM payment_intents WHERE minikit_transaction_id = $1',
      [transactionId]
    );
    return result.rows[0] || null;
  }

  /**
   * Expire stale payments without transaction IDs
   * Returns the number of payments expired
   */
  static async expireStalePayments(timeoutMinutes: number = 5): Promise<number> {
    const result = await pool.query(
      `UPDATE payment_intents 
       SET normalized_status = $1,
           raw_status = 'expired',
           last_error = 'Payment expired - no transaction ID received within timeout',
           updated_at = CURRENT_TIMESTAMP
       WHERE normalized_status = $2
         AND minikit_transaction_id IS NULL
         AND created_at < CURRENT_TIMESTAMP - ($3 || ' minutes')::INTERVAL
       RETURNING payment_reference`,
      [NormalizedPaymentStatus.FAILED, NormalizedPaymentStatus.PENDING, timeoutMinutes.toString()]
    );
    return result.rowCount || 0;
  }

  /**
   * Mark a specific payment as expired
   */
  static async expire(reference: string, reason?: string): Promise<PaymentIntent | null> {
    const errorMessage = reason || 'Payment expired';
    const result = await pool.query(
      `UPDATE payment_intents 
       SET normalized_status = $2,
           raw_status = 'expired',
           last_error = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE payment_reference = $1
       RETURNING *`,
      [reference, NormalizedPaymentStatus.FAILED, errorMessage]
    );
    return result.rows[0] || null;
  }
}
