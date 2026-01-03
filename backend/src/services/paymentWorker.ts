import axios from 'axios';
import pool from '../config/database';
import { PaymentIntentModel, NormalizedPaymentStatus } from '../models/PaymentIntent';
import { normalizeMiniKitStatus, extractTransactionHash, extractRawStatus } from './statusNormalization';
import { isTerminalStatus } from './paymentUtils';

/**
 * Payment Worker Service
 * 
 * Processes pending payment intents with:
 * - Row-level locking (FOR UPDATE SKIP LOCKED)
 * - Exponential backoff retry
 * - Idempotent processing
 * - Worker crash safety
 * 
 * CRITICAL GUARANTEES:
 * 1. One worker processes one payment at a time
 * 2. Worker crash → payment stays retriable (no open transaction during RPC)
 * 3. No duplicate payments (idempotent via payment_reference)
 * 4. No silent failures (all errors logged and tracked)
 */

export class PaymentWorker {
  private workerId: string;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(workerId?: string) {
    this.workerId = workerId || `worker-${process.pid}-${Date.now()}`;
  }

  /**
   * Start payment worker loop
   * Processes payments every intervalMs
   */
  start(intervalMs: number = 10000): void {
    if (this.isRunning) {
      console.log(`[PaymentWorker:${this.workerId}] Already running`);
      return;
    }

    this.isRunning = true;
    console.log(`[PaymentWorker:${this.workerId}] Starting with ${intervalMs}ms interval`);

    // Process immediately, then on interval
    this.processPayments();
    this.intervalId = setInterval(() => this.processPayments(), intervalMs);
  }

  /**
   * Stop payment worker loop
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log(`[PaymentWorker:${this.workerId}] Stopped`);
  }

  /**
   * Process batch of pending payments
   * 
   * PATTERN:
   * 1. SELECT ... FOR UPDATE SKIP LOCKED (acquire lock in transaction)
   * 2. COMMIT transaction (release DB connection)
   * 3. Process each payment (external RPC calls)
   * 4. Update status in new transaction
   * 
   * This ensures:
   * - No long-running transactions during RPC
   * - Worker crash → payment stays in pending/locked state → will be retried
   * - No deadlocks between workers
   */
  private async processPayments(): Promise<void> {
    const client = await pool.connect();
    let paymentIntents: any[] = [];

    try {
      // Step 1: Acquire locks on payments ready for processing
      await client.query('BEGIN');
      
      const result = await client.query(`
        UPDATE payment_intents
        SET locked_at = CURRENT_TIMESTAMP,
            locked_by = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE intent_id IN (
          SELECT intent_id
          FROM payment_intents
          WHERE normalized_status = $2
            AND (locked_at IS NULL OR locked_at < CURRENT_TIMESTAMP - INTERVAL '60 seconds')
            AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
          ORDER BY next_retry_at NULLS FIRST, created_at ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `, [this.workerId, NormalizedPaymentStatus.PENDING]);

      paymentIntents = result.rows;
      
      await client.query('COMMIT');

      if (paymentIntents.length === 0) {
        return; // No payments to process
      }

      console.log(`[PaymentWorker:${this.workerId}] Processing ${paymentIntents.length} payments`);

      // Step 2: Process each payment (OUTSIDE of transaction)
      for (const intent of paymentIntents) {
        await this.processPaymentIntent(intent);
      }
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[PaymentWorker:${this.workerId}] Error in processPayments:`, error);
    } finally {
      client.release();
    }
  }

  /**
   * Process a single payment intent
   * Checks status with MiniKit Developer Portal and updates accordingly
   */
  private async processPaymentIntent(intent: any): Promise<void> {
    const startTime = Date.now();
    console.log(`[PaymentWorker:${this.workerId}] Processing payment ${intent.payment_reference}`);

    try {
      // If no MiniKit transaction ID yet, skip (needs confirmation from client first)
      if (!intent.minikit_transaction_id) {
        console.log(`[PaymentWorker:${this.workerId}] Payment ${intent.payment_reference} has no transaction ID yet, skipping`);
        await PaymentIntentModel.releaseLock(intent.payment_reference);
        return;
      }

      // Verify transaction with Developer Portal
      const APP_ID = process.env.APP_ID;
      const DEV_PORTAL_API_KEY = process.env.DEV_PORTAL_API_KEY;

      if (!APP_ID || !DEV_PORTAL_API_KEY) {
        throw new Error('Missing APP_ID or DEV_PORTAL_API_KEY');
      }

      const apiUrl = `https://developer.worldcoin.org/api/v2/minikit/transaction/${intent.minikit_transaction_id}?app_id=${APP_ID}`;

      let transaction;
      try {
        const response = await axios.get(apiUrl, {
          headers: { Authorization: `Bearer ${DEV_PORTAL_API_KEY}` },
          timeout: 10000, // 10 second timeout
        });
        transaction = response.data;
      } catch (apiError: any) {
        // Handle API errors
        const errorMsg = apiError.message || 'Unknown API error';
        const statusCode = apiError.response?.status;

        console.error(`[PaymentWorker:${this.workerId}] API error for ${intent.payment_reference}:`, {
          status: statusCode,
          message: errorMsg,
        });

        // If 404, transaction not found - mark as failed
        if (statusCode === 404) {
          await PaymentIntentModel.updateStatus(
            intent.payment_reference,
            NormalizedPaymentStatus.FAILED,
            'not_found',
            intent.minikit_transaction_id,
            undefined,
            'Transaction not found in Developer Portal'
          );
          await PaymentIntentModel.releaseLock(intent.payment_reference);
          return;
        }

        // For other errors, schedule retry with exponential backoff
        await PaymentIntentModel.scheduleRetry(intent.payment_reference);
        await PaymentIntentModel.releaseLock(intent.payment_reference);
        return;
      }

      // Extract status from transactionStatus field with fallback to status field
      // Developer Portal can return transactionStatus or status depending on API version
      const rawStatus = extractRawStatus(transaction);
      const normalizedStatus = normalizeMiniKitStatus(rawStatus);
      const transactionHash = extractTransactionHash(transaction);

      console.log(`[PaymentWorker:${this.workerId}] Payment ${intent.payment_reference} raw status: "${rawStatus}" (transactionStatus: ${transaction.transactionStatus}, status: ${transaction.status}) → normalized: ${normalizedStatus}`);

      // Update payment status
      await PaymentIntentModel.updateStatus(
        intent.payment_reference,
        normalizedStatus,
        rawStatus ?? undefined,
        intent.minikit_transaction_id,
        transactionHash ?? undefined
      );

      // Release lock
      await PaymentIntentModel.releaseLock(intent.payment_reference);

      const duration = Date.now() - startTime;
      console.log(`[PaymentWorker:${this.workerId}] Processed payment ${intent.payment_reference} in ${duration}ms - status: ${normalizedStatus}`);
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      console.error(`[PaymentWorker:${this.workerId}] Error processing payment ${intent.payment_reference}:`, errorMsg);

      // Update error and schedule retry
      try {
        await PaymentIntentModel.updateStatus(
          intent.payment_reference,
          NormalizedPaymentStatus.PENDING,
          undefined,
          undefined,
          undefined,
          errorMsg
        );
        await PaymentIntentModel.scheduleRetry(intent.payment_reference);
        await PaymentIntentModel.releaseLock(intent.payment_reference);
      } catch (updateError) {
        console.error(`[PaymentWorker:${this.workerId}] Failed to update error state:`, updateError);
      }
    }
  }
}

// Singleton instance
let workerInstance: PaymentWorker | null = null;

/**
 * Get or create payment worker singleton
 */
export function getPaymentWorker(): PaymentWorker {
  if (!workerInstance) {
    workerInstance = new PaymentWorker();
  }
  return workerInstance;
}

/**
 * Start payment worker (for use in server startup)
 */
export function startPaymentWorker(intervalMs: number = 10000): void {
  const worker = getPaymentWorker();
  worker.start(intervalMs);
}

/**
 * Stop payment worker (for graceful shutdown)
 */
export function stopPaymentWorker(): void {
  if (workerInstance) {
    workerInstance.stop();
  }
}
