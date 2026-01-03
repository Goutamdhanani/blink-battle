import pool from '../config/database';

/**
 * RefundProcessor - Background job to auto-process timeout refunds
 * Runs every minute to find matches stuck in waiting state
 */

/**
 * Process timeout refunds for matches stuck in waiting
 */
export async function processTimeoutRefunds(): Promise<void> {
  console.log('[RefundProcessor] Checking for timeout matches...');

  try {
    // Find matches stuck in waiting for >10 minutes
    const timeoutMatches = await pool.query(`
      SELECT DISTINCT m.match_id, m.stake
      FROM matches m
      WHERE m.status = 'waiting'
        AND m.created_at < NOW() - INTERVAL '10 minutes'
        AND m.refund_processed = false
    `);

    if (timeoutMatches.rows.length === 0) {
      return;
    }

    console.log(`[RefundProcessor] Found ${timeoutMatches.rows.length} timeout matches`);

    for (const match of timeoutMatches.rows) {
      try {
        // SECURITY: Set refund_processed first to prevent race condition
        // Use UPDATE with WHERE condition to only process if not already processed
        const lockResult = await pool.query(
          `UPDATE matches 
           SET refund_processed = true 
           WHERE match_id = $1 AND refund_processed = false
           RETURNING match_id`,
          [match.match_id]
        );

        // If no rows were updated, another process already handled this match
        if (lockResult.rows.length === 0) {
          console.log(`[RefundProcessor] Match ${match.match_id} already processed by another worker`);
          continue;
        }

        // Mark as cancelled
        await pool.query(
          `UPDATE matches 
           SET cancelled = true, 
               cancellation_reason = 'matchmaking_timeout',
               status = 'cancelled'
           WHERE match_id = $1`,
          [match.match_id]
        );

        // Set refund deadline (4 hours from now)
        const refundDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);

        // Mark associated payments as refund eligible
        await pool.query(
          `UPDATE payment_intents 
           SET refund_status = 'eligible',
               refund_deadline = $1,
               refund_reason = 'matchmaking_timeout'
           WHERE match_id = $2 AND refund_status = 'none'`,
          [refundDeadline, match.match_id]
        );

        console.log(`[RefundProcessor] Processed timeout for match ${match.match_id}`);
      } catch (error) {
        console.error(`[RefundProcessor] Error processing match ${match.match_id}:`, error);
      }
    }
  } catch (error) {
    console.error('[RefundProcessor] Error in processTimeoutRefunds:', error);
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
  }, 60 * 1000);

  // Run once on startup
  processTimeoutRefunds().catch(console.error);

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
