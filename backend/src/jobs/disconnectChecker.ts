import pool from '../config/database';

/**
 * DisconnectChecker - Background job to detect player disconnects
 * Runs every 10 seconds to check for missing heartbeats
 */

// Constants
const DISCONNECT_TIMEOUT_MS = 30000; // 30 seconds

let columnsVerified = false;
let columnsExist = false;

async function verifyColumns(): Promise<boolean> {
  if (columnsVerified) return columnsExist;
  
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.columns 
      WHERE table_name = 'matches' 
      AND column_name IN ('player1_last_ping', 'player2_last_ping')
    `);
    columnsExist = parseInt(result.rows[0].count) >= 2;
    columnsVerified = true;
    return columnsExist;
  } catch {
    return false;
  }
}

/**
 * Check for player disconnects and resolve matches
 */
export async function checkPlayerDisconnects(): Promise<void> {
  // Check columns once, cache result
  if (!await verifyColumns()) {
    // Only log once per minute to avoid spam
    if (Math.floor(Date.now() / 60000) % 1 === 0) {
      console.log('[DisconnectChecker] Waiting for migration...');
    }
    return;
  }

  try {
    const matches = await pool.query(`
      SELECT m.match_id, m.player1_id, m.player2_id, 
             m.player1_wallet, m.player2_wallet,
             m.player1_last_ping, m.player2_last_ping,
             m.status, m.stake
      FROM matches m
      WHERE m.status IN ('waiting', 'ready', 'countdown', 'signal')
        AND m.created_at < NOW() - INTERVAL '30 seconds'
    `);

    for (const match of matches.rows) {
      await handleDisconnectedMatch(match);
    }
  } catch (error: any) {
    if (error.code !== '42703') { // Ignore missing column errors
      console.error('[DisconnectChecker] Error:', error.message);
    }
  }
}

async function handleDisconnectedMatch(match: any): Promise<void> {
  const now = Date.now();
  
  const p1Ping = match.player1_last_ping ? new Date(match.player1_last_ping).getTime() : 0;
  const p2Ping = match.player2_last_ping ? new Date(match.player2_last_ping).getTime() : 0;
  
  // Only check if at least one player has pinged (game started)
  if (p1Ping === 0 && p2Ping === 0) {
    return; // Neither player has started yet
  }
  
  const p1Timeout = p1Ping > 0 && (now - p1Ping) > DISCONNECT_TIMEOUT_MS;
  const p2Timeout = p2Ping > 0 && (now - p2Ping) > DISCONNECT_TIMEOUT_MS;

  if (p1Timeout && p2Timeout) {
    // Both disconnected
    await cancelMatch(match.match_id, 'both_players_disconnect');
  } else if (p1Timeout && p2Ping > 0) {
    // Player 1 disconnected, Player 2 active
    await awardWinByDisconnect(match, match.player2_id, match.player2_wallet);
  } else if (p2Timeout && p1Ping > 0) {
    // Player 2 disconnected, Player 1 active
    await awardWinByDisconnect(match, match.player1_id, match.player1_wallet);
  }
}

async function cancelMatch(matchId: string, reason: string): Promise<void> {
  await pool.query(`
    UPDATE matches 
    SET status = 'cancelled',
        cancelled = true,
        cancellation_reason = $1,
        refund_processed = false
    WHERE match_id = $2
  `, [reason, matchId]);
  
  // Mark payments for refund
  const refundDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);
  await pool.query(`
    UPDATE payment_intents 
    SET refund_status = 'eligible',
        refund_deadline = $1,
        refund_reason = $2
    WHERE match_id = $3 
    AND normalized_status = 'confirmed'
    AND (refund_status IS NULL OR refund_status = 'none')
  `, [refundDeadline, reason, matchId]);
  
  console.log(`[DisconnectChecker] Match ${matchId} cancelled: ${reason}`);
}

async function awardWinByDisconnect(match: any, winnerId: string, winnerWallet: string): Promise<void> {
  await pool.query(`
    UPDATE matches 
    SET status = 'completed',
        winner_id = $1,
        winner_wallet = $2,
        claim_deadline = NOW() + INTERVAL '1 hour',
        claim_status = 'unclaimed'
    WHERE match_id = $3 AND status != 'completed'
  `, [winnerId, winnerWallet, match.match_id]);
  
  console.log(`[DisconnectChecker] Match ${match.match_id}: ${winnerId} wins (opponent disconnect)`);
}

/**
 * Start the disconnect checker background job
 */
let disconnectCheckerInterval: NodeJS.Timeout | null = null;

export function startDisconnectChecker(): void {
  // Reset column cache so it rechecks after migrations
  columnsVerified = false;
  
  // Prevent multiple intervals
  if (disconnectCheckerInterval) {
    console.log('[DisconnectChecker] Already running');
    return;
  }

  // Run every 10 seconds
  disconnectCheckerInterval = setInterval(() => {
    checkPlayerDisconnects().catch(() => {});
  }, 10 * 1000);

  console.log('[DisconnectChecker] Started');
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
