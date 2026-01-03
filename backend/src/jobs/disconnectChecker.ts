import pool from '../config/database';

/**
 * DisconnectChecker - Background job to detect player disconnects
 * Runs every 10 seconds to check for missing heartbeats
 */

// Constants
const DISCONNECT_TIMEOUT_MS = 30000; // 30 seconds
const DISCONNECT_TIMEOUT_SECONDS = DISCONNECT_TIMEOUT_MS / 1000;

/**
 * Check for player disconnects and resolve matches
 */
export async function checkPlayerDisconnects(): Promise<void> {
  try {
    // First check if required columns exist
    const columnsExist = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'matches' 
      AND column_name IN ('player1_last_ping', 'player2_last_ping')
    `);

    if (columnsExist.rows.length < 2) {
      // Columns don't exist yet - skip this check (migration pending)
      console.log('[DisconnectChecker] Skipping - ping columns not yet migrated');
      return;
    }

    // Find active matches where one player stopped pinging (30 second timeout)
    // Using parameterized query to prevent SQL injection
    const matches = await pool.query(`
      SELECT m.*
      FROM matches m
      WHERE m.status IN ('waiting', 'ready', 'countdown', 'signal')
        AND m.created_at < NOW() - INTERVAL '30 seconds'
        AND (
          (m.player1_last_ping IS NULL OR m.player1_last_ping < NOW() - INTERVAL '1 second' * $1)
          OR
          (m.player2_last_ping IS NULL OR m.player2_last_ping < NOW() - INTERVAL '1 second' * $1)
        )
    `, [DISCONNECT_TIMEOUT_SECONDS]);

    if (matches.rows.length === 0) {
      return;
    }

    console.log(`[DisconnectChecker] Found ${matches.rows.length} matches with potential disconnects`);

    for (const match of matches.rows) {
      await handleDisconnectedMatch(match);
    }
  } catch (error: any) {
    // Only log if it's NOT a missing column error (we expect that during migration)
    if (error.code !== '42703') {
      console.error('[DisconnectChecker] Error:', error.message);
    }
  }
}

async function handleDisconnectedMatch(match: any): Promise<void> {
  const now = Date.now();
  const p1Ping = match.player1_last_ping ? new Date(match.player1_last_ping).getTime() : 0;
  const p2Ping = match.player2_last_ping ? new Date(match.player2_last_ping).getTime() : 0;
  
  const p1Timeout = (now - p1Ping) > DISCONNECT_TIMEOUT_MS;
  const p2Timeout = (now - p2Ping) > DISCONNECT_TIMEOUT_MS;

  if (p1Timeout && p2Timeout) {
    // Both disconnected - cancel match and enable refunds
    await pool.query(`
      UPDATE matches 
      SET status = 'cancelled',
          cancelled = true,
          cancellation_reason = 'both_players_disconnect',
          refund_processed = false
      WHERE match_id = $1
    `, [match.match_id]);
    
    // Mark payments as refund eligible
    await markPaymentsForRefund(match.match_id, 'both_players_disconnect');
    
    console.log(`[DisconnectChecker] Match ${match.match_id} cancelled - both disconnected`);
  } else if (p1Timeout && !p2Timeout) {
    // Player 1 disconnected - Player 2 wins
    await awardWinByDisconnect(match, match.player2_id, match.player2_wallet);
  } else if (p2Timeout && !p1Timeout) {
    // Player 2 disconnected - Player 1 wins
    await awardWinByDisconnect(match, match.player1_id, match.player1_wallet);
  }
}

async function awardWinByDisconnect(match: any, winnerId: string, winnerWallet: string): Promise<void> {
  await pool.query(`
    UPDATE matches 
    SET status = 'completed',
        winner_id = $1,
        winner_wallet = $2,
        claim_deadline = NOW() + INTERVAL '1 hour',
        claim_status = 'unclaimed',
        cancellation_reason = 'opponent_disconnect'
    WHERE match_id = $3
  `, [winnerId, winnerWallet, match.match_id]);
  
  console.log(`[DisconnectChecker] Match ${match.match_id} - ${winnerId} wins (opponent disconnect)`);
}

async function markPaymentsForRefund(matchId: string, reason: string): Promise<void> {
  const refundDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours
  
  await pool.query(`
    UPDATE payment_intents 
    SET refund_status = 'eligible',
        refund_deadline = $1,
        refund_reason = $2
    WHERE match_id = $3 
    AND normalized_status = 'confirmed'
    AND (refund_status IS NULL OR refund_status = 'none')
  `, [refundDeadline, reason, matchId]);
}

/**
 * Start the disconnect checker background job
 */
let disconnectCheckerInterval: NodeJS.Timeout | null = null;

export function startDisconnectChecker(): void {
  // Prevent multiple intervals
  if (disconnectCheckerInterval) {
    console.log('[DisconnectChecker] Already running');
    return;
  }

  // Run every 10 seconds
  disconnectCheckerInterval = setInterval(() => {
    checkPlayerDisconnects().catch(err => {
      if (err.code !== '42703') console.error('[DisconnectChecker]', err.message);
    });
  }, 10 * 1000);

  console.log('[DisconnectChecker] Started (runs every 10 seconds)');
}

/**
 * Stop the disconnect checker background job
 */
export function stopDisconnectChecker(): void {
  if (disconnectCheckerInterval) {
    clearInterval(disconnectCheckerInterval);
    disconnectCheckerInterval = null;
    console.log('[DisconnectChecker] Stopped');
  }
}
