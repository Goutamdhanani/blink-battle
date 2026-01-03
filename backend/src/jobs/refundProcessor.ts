import pool from '../config/database';

/**
 * RefundProcessor - Background job to auto-process timeout refunds
 * Runs every minute to find matches stuck in waiting state
 */

let columnsVerified = false;
let columnsExist = false;
let verificationPromise: Promise<boolean> | null = null;

async function verifyColumns(): Promise<boolean> {
  if (columnsVerified) return columnsExist;
  
  // Prevent concurrent verification - reuse existing promise
  if (verificationPromise) return verificationPromise;
  
  verificationPromise = (async () => {
    try {
      const result = await pool.query(`
        SELECT COUNT(*) as count FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'refund_processed'
      `);
      columnsExist = parseInt(result.rows[0].count) >= 1;
      columnsVerified = true;
      return columnsExist;
    } catch {
      return false;
    } finally {
      verificationPromise = null;
    }
  })();
  
  return verificationPromise;
}

/**
 * Process timeout refunds for matches stuck in waiting
 */
export async function processTimeoutRefunds(): Promise<void> {
  if (!await verifyColumns()) {
    return; // Silently skip until migration runs
  }

  try {
    // Find matches stuck in waiting for >10 minutes
    const timeoutMatches = await pool.query(`
      SELECT m.match_id, m.stake
      FROM matches m
      WHERE m.status = 'waiting'
        AND m.created_at < NOW() - INTERVAL '10 minutes'
        AND (m.refund_processed = false OR m.refund_processed IS NULL)
    `);

    for (const match of timeoutMatches.rows) {
      await processMatchTimeout(match.match_id);
    }
  } catch (error: any) {
    if (error.code !== '42703') {
      console.error('[RefundProcessor] Error:', error.message);
    }
  }
}

async function processMatchTimeout(matchId: string): Promise<void> {
  const refundDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);

  // Use atomic UPDATE to prevent race condition - only process if not already processed
  const result = await pool.query(`
    UPDATE matches 
    SET cancelled = true, 
        cancellation_reason = 'matchmaking_timeout',
        status = 'cancelled',
        refund_processed = true
    WHERE match_id = $1 AND (refund_processed = false OR refund_processed IS NULL)
    RETURNING match_id
  `, [matchId]);

  // If no rows were updated, another process already handled this match
  if (result.rows.length === 0) {
    return;
  }

  await pool.query(`
    UPDATE payment_intents 
    SET refund_status = 'eligible',
        refund_deadline = $1,
        refund_reason = 'matchmaking_timeout'
    WHERE match_id = $2 
    AND normalized_status = 'confirmed'
    AND (refund_status IS NULL OR refund_status = 'none')
  `, [refundDeadline, matchId]);

  console.log(`[RefundProcessor] Timeout processed: ${matchId}`);
}

export async function processOrphanedPayments(): Promise<void> {
  try {
    // Check if refund_status column exists
    const colExists = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'payment_intents' AND column_name = 'refund_status'
    `);
    
    if (colExists.rows.length === 0) return;

    const refundDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);

    // Find confirmed payments >15 min old with no match
    const result = await pool.query(`
      UPDATE payment_intents 
      SET refund_status = 'eligible',
          refund_deadline = $1,
          refund_reason = 'no_match_found'
      WHERE normalized_status = 'confirmed'
        AND match_id IS NULL
        AND created_at < NOW() - INTERVAL '15 minutes'
        AND (refund_status IS NULL OR refund_status = 'none')
      RETURNING payment_reference
    `, [refundDeadline]);

    if (result.rows.length > 0) {
      console.log(`[RefundProcessor] Marked ${result.rows.length} orphaned payments for refund`);
    }
  } catch (error: any) {
    if (error.code !== '42703') {
      console.error('[RefundProcessor] Orphan error:', error.message);
    }
  }
}

/**
 * Start the refund processor background job
 */
let refundProcessorInterval: NodeJS.Timeout | null = null;

export function startRefundProcessor(): void {
  columnsVerified = false;
  
  // Prevent multiple intervals
  if (refundProcessorInterval) {
    console.log('[RefundProcessor] Already running');
    return;
  }

  // Run every minute
  refundProcessorInterval = setInterval(() => {
    processTimeoutRefunds().catch(() => {});
    processOrphanedPayments().catch(() => {});
  }, 60 * 1000);

  // First run after 10 seconds (give migrations time)
  setTimeout(() => {
    processTimeoutRefunds().catch(() => {});
    processOrphanedPayments().catch(() => {});
  }, 10000);

  console.log('[RefundProcessor] Started');
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
