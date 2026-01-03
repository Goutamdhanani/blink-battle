import pool from '../config/database';

/**
 * Expire unclaimed matches after deadline
 * Run every 5 minutes
 */
export async function expireUnclaimedMatches(): Promise<number> {
  const result = await pool.query(`
    UPDATE matches 
    SET claim_status = 'expired'
    WHERE claim_status = 'unclaimed'
      AND claim_deadline IS NOT NULL
      AND claim_deadline < NOW()
    RETURNING match_id
  `);
  
  if (result.rows.length > 0) {
    console.log(`[ClaimExpiry] Expired ${result.rows.length} unclaimed matches`);
  }
  
  return result.rows.length;
}

/**
 * Start background job
 */
export function startClaimExpiryJob(): void {
  // Run every 5 minutes
  setInterval(() => {
    expireUnclaimedMatches().catch(err => {
      console.error('[ClaimExpiry] Error:', err.message);
    });
  }, 5 * 60 * 1000);
  
  // Run once on startup
  expireUnclaimedMatches().catch(err => {
    console.error('[ClaimExpiry] Startup error:', err.message);
  });
  
  console.log('[ClaimExpiry] Background job started (every 5 minutes)');
}
