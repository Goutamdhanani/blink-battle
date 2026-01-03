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
    // Find active matches where one player stopped pinging (30 second timeout)
    const matches = await pool.query(`
      SELECT m.*
      FROM matches m
      WHERE m.status IN ('waiting', 'ready', 'countdown', 'signal')
        AND (
          (m.player1_last_ping IS NOT NULL AND m.player1_last_ping < NOW() - INTERVAL '${DISCONNECT_TIMEOUT_SECONDS} seconds')
          OR
          (m.player2_last_ping IS NOT NULL AND m.player2_last_ping < NOW() - INTERVAL '${DISCONNECT_TIMEOUT_SECONDS} seconds')
          OR
          (m.player1_last_ping IS NULL AND m.created_at < NOW() - INTERVAL '${DISCONNECT_TIMEOUT_SECONDS} seconds')
          OR
          (m.player2_last_ping IS NULL AND m.created_at < NOW() - INTERVAL '${DISCONNECT_TIMEOUT_SECONDS} seconds')
        )
    `);

    if (matches.rows.length === 0) {
      return;
    }

    console.log(`[DisconnectChecker] Found ${matches.rows.length} matches with potential disconnects`);

    for (const match of matches.rows) {
      const p1Timeout = !match.player1_last_ping || 
        (Date.now() - new Date(match.player1_last_ping).getTime() > DISCONNECT_TIMEOUT_MS);
      const p2Timeout = !match.player2_last_ping || 
        (Date.now() - new Date(match.player2_last_ping).getTime() > DISCONNECT_TIMEOUT_MS);

      if (p1Timeout && p2Timeout) {
        // Both disconnected - cancel match
        await pool.query(`
          UPDATE matches 
          SET status = 'cancelled',
              cancelled = true,
              cancellation_reason = 'both_players_disconnect'
          WHERE match_id = $1
        `, [match.match_id]);
        
        console.log(`[DisconnectChecker] Match ${match.match_id} cancelled - both players disconnected`);
      } else if (p1Timeout) {
        // Player 1 disconnected - Player 2 wins
        await pool.query(`
          UPDATE matches 
          SET status = 'completed',
              winner_id = $1,
              winner_wallet = (SELECT wallet_address FROM users WHERE user_id = $1),
              claim_deadline = NOW() + INTERVAL '1 hour',
              claim_status = 'unclaimed'
          WHERE match_id = $2
        `, [match.player2_id, match.match_id]);
        
        console.log(`[DisconnectChecker] Match ${match.match_id} - Player 2 wins (opponent disconnect)`);
      } else if (p2Timeout) {
        // Player 2 disconnected - Player 1 wins
        await pool.query(`
          UPDATE matches 
          SET status = 'completed',
              winner_id = $1,
              winner_wallet = (SELECT wallet_address FROM users WHERE user_id = $1),
              claim_deadline = NOW() + INTERVAL '1 hour',
              claim_status = 'unclaimed'
          WHERE match_id = $2
        `, [match.player1_id, match.match_id]);
        
        console.log(`[DisconnectChecker] Match ${match.match_id} - Player 1 wins (opponent disconnect)`);
      }
    }
  } catch (error) {
    console.error('[DisconnectChecker] Error checking disconnects:', error);
  }
}

/**
 * Start the disconnect checker background job
 */
export function startDisconnectChecker(): void {
  // Run every 10 seconds
  setInterval(() => {
    checkPlayerDisconnects().catch(console.error);
  }, 10 * 1000);

  console.log('[DisconnectChecker] Started (runs every 10 seconds)');
}
