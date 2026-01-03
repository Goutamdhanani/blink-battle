import pool from '../config/database';
import { MatchStatus } from '../models/types';

/**
 * Match Timeout Job - Handles abandoned matches
 * 
 * Issue #17: Add match abandonment timeout
 * 
 * Scenarios handled:
 * 1. Matches stuck in 'pending' status (never progressed to ready/countdown)
 * 2. Matches stuck in 'matched' status (players never called ready)
 * 3. Matches stuck in 'countdown' status (players disconnected during countdown)
 * 
 * Timeout thresholds:
 * - pending/matched: 30 minutes (players have time to pay and join)
 * - countdown: 5 minutes (countdown should only last seconds, but allow buffer)
 * - in_progress: 10 minutes (tap window + result processing)
 */

const TIMEOUT_THRESHOLDS = {
  [MatchStatus.PENDING]: 30 * 60 * 1000,      // 30 minutes
  [MatchStatus.MATCHED]: 30 * 60 * 1000,      // 30 minutes
  [MatchStatus.COUNTDOWN]: 5 * 60 * 1000,     // 5 minutes
  [MatchStatus.IN_PROGRESS]: 10 * 60 * 1000,  // 10 minutes
};

/**
 * Check and cancel abandoned matches
 */
export async function processAbandonedMatches(): Promise<void> {
  try {
    // Check if cancellation columns exist
    const columnsExist = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'matches' AND column_name IN ('cancelled', 'cancellation_reason')
    `);
    
    if (columnsExist.rows.length < 2) {
      // Migration not run yet, skip
      return;
    }

    let totalCancelled = 0;

    // Process each status type with its own timeout
    for (const [status, timeoutMs] of Object.entries(TIMEOUT_THRESHOLDS)) {
      const cancelled = await cancelAbandonedMatchesWithStatus(status, timeoutMs);
      totalCancelled += cancelled;
    }

    if (totalCancelled > 0) {
      console.log(`[MatchTimeout] Cancelled ${totalCancelled} abandoned matches`);
    }
  } catch (error: any) {
    // Silently handle column not found errors (migration not run yet)
    if (error.code !== '42703' && error.code !== '42P01') {
      console.error('[MatchTimeout] Error processing abandoned matches:', error.message);
    }
  }
}

/**
 * Cancel matches with a specific status that have exceeded their timeout
 */
async function cancelAbandonedMatchesWithStatus(status: string, timeoutMs: number): Promise<number> {
  const timeoutInterval = `${Math.floor(timeoutMs / 60000)} minutes`;
  
  // Find matches that have been in this status for too long
  // SECURITY: Using parameterized query to prevent SQL injection
  const result = await pool.query(`
    UPDATE matches 
    SET cancelled = true,
        cancellation_reason = $1,
        status = $2,
        updated_at = NOW()
    WHERE status = $3
      AND created_at < NOW() - $4::INTERVAL
      AND (cancelled IS NULL OR cancelled = false)
    RETURNING match_id, player1_id, player2_id, stake
  `, [
    `${status}_timeout`,
    MatchStatus.CANCELLED,
    status,
    timeoutInterval
  ]);

  const matches = result.rows;

  if (matches.length === 0) {
    return 0;
  }

  // For each cancelled match, mark payments for refund if staked
  for (const match of matches) {
    if (match.stake > 0) {
      await markPaymentsForRefund(match.match_id, `${status}_timeout`);
    }
    
    console.log(`[MatchTimeout] Cancelled match ${match.match_id} - stuck in ${status} for >${timeoutInterval}`);
  }

  return matches.length;
}

/**
 * Mark payment intents for refund when match is cancelled
 */
async function markPaymentsForRefund(matchId: string, reason: string): Promise<void> {
  try {
    // Check if refund columns exist
    const refundColumnsExist = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'payment_intents' AND column_name = 'refund_status'
    `);
    
    if (refundColumnsExist.rows.length === 0) {
      return; // Migration not run yet
    }

    const refundDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours to claim refund

    await pool.query(`
      UPDATE payment_intents 
      SET refund_status = 'eligible',
          refund_deadline = $1,
          refund_reason = $2,
          updated_at = NOW()
      WHERE match_id = $3
        AND normalized_status = 'confirmed'
        AND (refund_status IS NULL OR refund_status = 'none')
    `, [refundDeadline, reason, matchId]);
  } catch (error: any) {
    // Silently handle column not found errors
    if (error.code !== '42703') {
      console.error(`[MatchTimeout] Error marking refunds for match ${matchId}:`, error.message);
    }
  }
}

/**
 * Clean up old cancelled matches (keep for 7 days for audit)
 */
export async function cleanupOldCancelledMatches(): Promise<void> {
  try {
    const result = await pool.query(`
      DELETE FROM matches
      WHERE status = $1
        AND updated_at < NOW() - INTERVAL '7 days'
      RETURNING match_id
    `, [MatchStatus.CANCELLED]);

    if (result.rows.length > 0) {
      console.log(`[MatchTimeout] Cleaned up ${result.rows.length} old cancelled matches`);
    }
  } catch (error: any) {
    console.error('[MatchTimeout] Error cleaning up old matches:', error.message);
  }
}

/**
 * Start the match timeout background job
 */
let matchTimeoutInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;

export function startMatchTimeoutJob(): void {
  // Prevent multiple intervals
  if (matchTimeoutInterval) {
    console.log('[MatchTimeout] Already running');
    return;
  }

  // Run every 2 minutes (more frequent than refund processor)
  matchTimeoutInterval = setInterval(() => {
    processAbandonedMatches().catch(err => {
      console.error('[MatchTimeout] Error in interval:', err);
    });
  }, 2 * 60 * 1000);

  // Also run cleanup once per hour
  cleanupInterval = setInterval(() => {
    cleanupOldCancelledMatches().catch(err => {
      console.error('[MatchTimeout] Error in cleanup:', err);
    });
  }, 60 * 60 * 1000);

  // First run after 30 seconds (give migrations time)
  setTimeout(() => {
    processAbandonedMatches().catch(err => {
      console.error('[MatchTimeout] Error in initial run:', err);
    });
  }, 30000);

  console.log('[MatchTimeout] Started - checking every 2 minutes');
}

/**
 * Stop the match timeout background job
 */
export function stopMatchTimeoutJob(): void {
  if (matchTimeoutInterval) {
    clearInterval(matchTimeoutInterval);
    matchTimeoutInterval = null;
  }
  
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  
  console.log('[MatchTimeout] Stopped');
}
