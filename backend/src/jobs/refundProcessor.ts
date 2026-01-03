import pool from '../config/database';

/**
 * RefundProcessor - Background job to auto-process timeout refunds
 * Runs every minute to find matches stuck in waiting state
 */

/**
 * Process timeout refunds for matches stuck in waiting
 */
export async function processTimeoutRefunds(): Promise<void> {
  try {
    // Check if required column exists
    const columnExists = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'matches' AND column_name = 'refund_processed'
    `);

    if (columnExists.rows.length === 0) {
      console.log('[RefundProcessor] Skipping - refund_processed column not yet migrated');
      return;
    }

    console.log('[RefundProcessor] Checking for timeout matches...');

    // Find matches stuck in waiting for >10 minutes
    const timeoutMatches = await pool.query(`
      SELECT DISTINCT m.match_id, m.stake
      FROM matches m
      WHERE m.status = 'waiting'
        AND m.created_at < NOW() - INTERVAL '10 minutes'
        AND (m.refund_processed = false OR m.refund_processed IS NULL)
    `);

    if (timeoutMatches.rows.length === 0) {
      return;
    }

    console.log(`[RefundProcessor] Found ${timeoutMatches.rows.length} timeout matches`);

    for (const match of timeoutMatches.rows) {
      try {
        await processMatchTimeout(match.match_id);
      } catch (error) {
        console.error(`[RefundProcessor] Error processing match ${match.match_id}:`, error);
      }
    }
  } catch (error: any) {
    if (error.code !== '42703') {
      console.error('[RefundProcessor] Error:', error.message);
    }
  }
}

async function processMatchTimeout(matchId: string): Promise<void> {
  // SECURITY: Set refund_processed first to prevent race condition
  // Use UPDATE with WHERE condition to only process if not already processed
  const lockResult = await pool.query(
    `UPDATE matches 
     SET refund_processed = true 
     WHERE match_id = $1 AND refund_processed = false
     RETURNING match_id`,
    [matchId]
  );

  // If no rows were updated, another process already handled this match
  if (lockResult.rows.length === 0) {
    console.log(`[RefundProcessor] Match ${matchId} already processed by another worker`);
    return;
  }

  // Mark as cancelled
  await pool.query(
    `UPDATE matches 
     SET cancelled = true, 
         cancellation_reason = 'matchmaking_timeout',
         status = 'cancelled'
     WHERE match_id = $1`,
    [matchId]
  );

  // Set refund deadline (4 hours from now)
  const refundDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);

  // Mark associated payments as refund eligible
  await pool.query(
    `UPDATE payment_intents 
     SET refund_status = 'eligible',
         refund_deadline = $1,
         refund_reason = 'matchmaking_timeout'
     WHERE match_id = $2 
     AND normalized_status = 'confirmed'
     AND (refund_status IS NULL OR refund_status = 'none')`,
    [refundDeadline, matchId]
  );

  console.log(`[RefundProcessor] Processed timeout for match ${matchId}`);
}

// Also handle payments that never got matched
export async function processOrphanedPayments(): Promise<void> {
  try {
    // Find confirmed payments that are >15 minutes old with no match
    const orphanedPayments = await pool.query(`
      SELECT pi.payment_reference, pi.user_id, pi.amount
      FROM payment_intents pi
      WHERE pi.normalized_status = 'confirmed'
        AND pi.match_id IS NULL
        AND pi.created_at < NOW() - INTERVAL '15 minutes'
        AND (pi.refund_status IS NULL OR pi.refund_status = 'none')
    `);

    if (orphanedPayments.rows.length === 0) {
      return;
    }

    console.log(`[RefundProcessor] Found ${orphanedPayments.rows.length} orphaned payments`);

    const refundDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);

    for (const payment of orphanedPayments.rows) {
      await pool.query(`
        UPDATE payment_intents 
        SET refund_status = 'eligible',
            refund_deadline = $1,
            refund_reason = 'no_match_found'
        WHERE payment_reference = $2
      `, [refundDeadline, payment.payment_reference]);

      console.log(`[RefundProcessor] Marked orphaned payment ${payment.payment_reference} for refund`);
    }
  } catch (error: any) {
    if (error.code !== '42703') {
      console.error('[RefundProcessor] Error processing orphaned payments:', error.message);
    }
  }
}

/**
 * Start the refund processor background job
 */
let refundProcessorInterval: NodeJS.Timeout | null = null;

export function startRefundProcessor(): void {
  // Prevent multiple intervals
  if (refundProcessorInterval) {
    console.log('[RefundProcessor] Already running');
    return;
  }

  // Run every minute
  refundProcessorInterval = setInterval(() => {
    processTimeoutRefunds().catch(console.error);
    processOrphanedPayments().catch(console.error);
  }, 60 * 1000);

  // Run once on startup after 5 seconds (give migrations time to run)
  setTimeout(() => {
    processTimeoutRefunds().catch(console.error);
    processOrphanedPayments().catch(console.error);
  }, 5000);

  console.log('[RefundProcessor] Started (runs every 60 seconds)');
}

/**
 * Stop the refund processor background job
 */
export function stopRefundProcessor(): void {
  if (refundProcessorInterval) {
    clearInterval(refundProcessorInterval);
    refundProcessorInterval = null;
    console.log('[RefundProcessor] Stopped');
  }
}
