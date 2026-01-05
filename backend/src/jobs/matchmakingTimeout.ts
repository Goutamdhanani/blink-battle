import pool from '../config/database';
import { QueueStatus } from '../models/MatchQueue';

/**
 * Matchmaking Timeout Job - Handles timed-out matchmaking queue entries
 * 
 * REQUIREMENT: If a user searches for an opponent and pays but does not get matched within 1 minute:
 * - Mark the matchmaking history as `Cancelled` in the history log
 * - Show a `Claim Refund` button with a 3% deduction for operational fees
 * 
 * Timeout threshold: 60 seconds (1 minute)
 */

const MATCHMAKING_TIMEOUT_MS = 60 * 1000; // 1 minute
const REFUND_DEADLINE_HOURS = 24; // 24 hours to claim refund

/**
 * Process expired matchmaking queue entries
 * Marks them as 'expired' and creates refund eligibility if payment exists
 */
export async function processExpiredMatchmaking(): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Find all queue entries that are still searching and have expired (>1 minute)
    const expiredEntries = await client.query(`
      SELECT mq.queue_id, mq.user_id, mq.stake, mq.created_at
      FROM match_queue mq
      WHERE mq.status = $1
        AND mq.created_at < NOW() - INTERVAL '1 minute'
        AND mq.expires_at < NOW()
      FOR UPDATE
    `, [QueueStatus.SEARCHING]);

    if (expiredEntries.rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    console.log(`[MatchmakingTimeout] Found ${expiredEntries.rows.length} expired matchmaking entries`);

    for (const entry of expiredEntries.rows) {
      // Mark queue entry as expired (cancelled)
      await client.query(`
        UPDATE match_queue
        SET status = $1, updated_at = NOW()
        WHERE queue_id = $2
      `, [QueueStatus.CANCELLED, entry.queue_id]);

      // If this was a staked match, find the payment and mark for refund
      if (entry.stake > 0) {
        // Find the user's most recent confirmed payment for this stake amount
        // that hasn't been linked to a match yet
        const paymentResult = await client.query(`
          SELECT payment_reference, amount
          FROM payment_intents
          WHERE user_id = $1
            AND amount = $2
            AND normalized_status = 'confirmed'
            AND match_id IS NULL
            AND (refund_status IS NULL OR refund_status = 'none')
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `, [entry.user_id, entry.stake]);

        if (paymentResult.rows.length > 0) {
          const payment = paymentResult.rows[0];
          const refundDeadline = new Date(Date.now() + REFUND_DEADLINE_HOURS * 60 * 60 * 1000);

          // Mark payment as eligible for refund with 3% operational fee
          await client.query(`
            UPDATE payment_intents
            SET refund_status = 'eligible',
                refund_deadline = $1,
                refund_reason = 'matchmaking_timeout',
                updated_at = NOW()
            WHERE payment_reference = $2
          `, [refundDeadline, payment.payment_reference]);

          console.log(
            `[MatchmakingTimeout] Marked payment ${payment.payment_reference} for refund\n` +
            `  User: ${entry.user_id}\n` +
            `  Amount: ${payment.amount} WLD\n` +
            `  Reason: matchmaking_timeout (>1 minute)\n` +
            `  Refund deadline: ${refundDeadline.toISOString()}`
          );
        } else {
          console.warn(
            `[MatchmakingTimeout] No eligible payment found for expired queue entry\n` +
            `  User: ${entry.user_id}, Stake: ${entry.stake}`
          );
        }
      }

      console.log(
        `[MatchmakingTimeout] Cancelled matchmaking for user ${entry.user_id}\n` +
        `  Queue ID: ${entry.queue_id}\n` +
        `  Stake: ${entry.stake} WLD\n` +
        `  Waited: ${Math.floor((Date.now() - new Date(entry.created_at).getTime()) / 1000)}s`
      );
    }

    await client.query('COMMIT');
    console.log(`[MatchmakingTimeout] Successfully processed ${expiredEntries.rows.length} expired entries`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[MatchmakingTimeout] Error processing expired matchmaking:', error.message);
  } finally {
    client.release();
  }
}

/**
 * Start the matchmaking timeout background job
 */
let matchmakingTimeoutInterval: NodeJS.Timeout | null = null;

export function startMatchmakingTimeoutJob(): void {
  // Prevent multiple intervals
  if (matchmakingTimeoutInterval) {
    console.log('[MatchmakingTimeout] Already running');
    return;
  }

  // Run every 30 seconds to catch timeouts quickly
  matchmakingTimeoutInterval = setInterval(() => {
    processExpiredMatchmaking().catch(err => {
      console.error('[MatchmakingTimeout] Error in interval:', err);
    });
  }, 30 * 1000);

  // First run after 10 seconds
  setTimeout(() => {
    processExpiredMatchmaking().catch(err => {
      console.error('[MatchmakingTimeout] Error in initial run:', err);
    });
  }, 10000);

  console.log('[MatchmakingTimeout] Started - checking every 30 seconds for 1-minute timeouts');
}

/**
 * Stop the matchmaking timeout background job
 */
export function stopMatchmakingTimeoutJob(): void {
  if (matchmakingTimeoutInterval) {
    clearInterval(matchmakingTimeoutInterval);
    matchmakingTimeoutInterval = null;
  }
  
  console.log('[MatchmakingTimeout] Stopped');
}
