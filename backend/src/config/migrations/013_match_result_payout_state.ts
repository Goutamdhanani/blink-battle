/**
 * Migration 013: Add match_result and payout_state columns
 * 
 * This migration adds proper state tracking for match outcomes and payouts:
 * - match_result: Tracks the outcome (WIN, LOSS, DRAW, NO_MATCH)
 * - payout_state: Tracks payment status (NOT_PAID, PAID)
 * 
 * These fields enable:
 * 1. Better idempotent claim logic
 * 2. Clear separation between match outcome and payout status
 * 3. Proper validation of winner eligibility
 */

import pool from '../database';

export async function up(): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log('[Migration 013] Adding match_result and payout_state columns...');
    
    await client.query('BEGIN');
    
    // Add match_result column for player-specific match outcomes
    // Each player has their own perspective: WIN, LOSS, DRAW, or NO_MATCH
    const matchResultExists = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'matches' AND column_name = 'player1_match_result'
    `);
    
    if (matchResultExists.rows.length === 0) {
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN player1_match_result VARCHAR(20) DEFAULT 'NO_MATCH',
        ADD COLUMN player2_match_result VARCHAR(20) DEFAULT 'NO_MATCH',
        ADD CONSTRAINT player1_match_result_check 
          CHECK (player1_match_result IS NULL OR player1_match_result IN ('WIN', 'LOSS', 'DRAW', 'NO_MATCH')),
        ADD CONSTRAINT player2_match_result_check 
          CHECK (player2_match_result IS NULL OR player2_match_result IN ('WIN', 'LOSS', 'DRAW', 'NO_MATCH'))
      `);
      console.log('✅ Added player1_match_result and player2_match_result columns with constraints');
    } else {
      console.log('✅ match_result columns already exist, skipping');
    }
    
    // Add payout_state column for payment tracking
    const payoutStateExists = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'matches' AND column_name = 'player1_payout_state'
    `);
    
    if (payoutStateExists.rows.length === 0) {
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN player1_payout_state VARCHAR(20) DEFAULT 'NOT_PAID',
        ADD COLUMN player2_payout_state VARCHAR(20) DEFAULT 'NOT_PAID',
        ADD CONSTRAINT player1_payout_state_check 
          CHECK (player1_payout_state IS NULL OR player1_payout_state IN ('NOT_PAID', 'PAID')),
        ADD CONSTRAINT player2_payout_state_check 
          CHECK (player2_payout_state IS NULL OR player2_payout_state IN ('NOT_PAID', 'PAID'))
      `);
      console.log('✅ Added player1_payout_state and player2_payout_state columns with constraints');
    } else {
      console.log('✅ payout_state columns already exist, skipping');
    }
    
    // Backfill existing data based on current state
    // For completed matches with a winner:
    // - Winner gets WIN result
    // - Loser gets LOSS result
    // - If claimed, winner gets PAID payout state
    // Handle all match statuses to ensure no NULL values
    await client.query(`
      UPDATE matches
      SET 
        player1_match_result = CASE
          WHEN status IN ('completed') AND winner_id = player1_id THEN 'WIN'
          WHEN status IN ('completed') AND winner_id = player2_id THEN 'LOSS'
          WHEN status IN ('completed') AND winner_id IS NULL THEN 'DRAW'
          WHEN status IN ('cancelled', 'refunded') THEN 'NO_MATCH'
          ELSE COALESCE(player1_match_result, 'NO_MATCH')
        END,
        player2_match_result = CASE
          WHEN status IN ('completed') AND winner_id = player2_id THEN 'WIN'
          WHEN status IN ('completed') AND winner_id = player1_id THEN 'LOSS'
          WHEN status IN ('completed') AND winner_id IS NULL THEN 'DRAW'
          WHEN status IN ('cancelled', 'refunded') THEN 'NO_MATCH'
          ELSE COALESCE(player2_match_result, 'NO_MATCH')
        END,
        player1_payout_state = CASE
          WHEN winner_id = player1_id AND claim_status = 'claimed' THEN 'PAID'
          ELSE COALESCE(player1_payout_state, 'NOT_PAID')
        END,
        player2_payout_state = CASE
          WHEN winner_id = player2_id AND claim_status = 'claimed' THEN 'PAID'
          ELSE COALESCE(player2_payout_state, 'NOT_PAID')
        END
      WHERE player1_match_result IS NULL OR player2_match_result IS NULL
         OR player1_payout_state IS NULL OR player2_payout_state IS NULL
    `);
    console.log('✅ Backfilled existing match results and payout states');
    
    await client.query('COMMIT');
    console.log('[Migration 013] Successfully completed');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Migration 013] Error:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log('[Migration 013] Rolling back match_result and payout_state columns...');
    
    await client.query('BEGIN');
    
    await client.query(`
      ALTER TABLE matches 
      DROP COLUMN IF EXISTS player1_match_result,
      DROP COLUMN IF EXISTS player2_match_result,
      DROP COLUMN IF EXISTS player1_payout_state,
      DROP COLUMN IF EXISTS player2_payout_state
    `);
    
    await client.query('COMMIT');
    console.log('[Migration 013] Rollback completed');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Migration 013] Rollback error:', error);
    throw error;
  } finally {
    client.release();
  }
}
