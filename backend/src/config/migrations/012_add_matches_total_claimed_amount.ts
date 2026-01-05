import { PoolClient } from 'pg';

/**
 * Migration: Add total_claimed_amount to matches table
 * 
 * This migration adds the total_claimed_amount column to the matches table
 * to prevent double-claim exploits where winners could claim multiple times
 * or claim both winnings and refunds.
 * 
 * Uses BIGINT to store amounts in wei (not WLD) for precision.
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 012_add_matches_total_claimed_amount');

  // Check if column already exists
  const columnExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'matches' AND column_name = 'total_claimed_amount'
    );
  `);

  if (!columnExists.rows[0].exists) {
    // Add total_claimed_amount column to matches table
    // BIGINT can store up to 9,223,372,036,854,775,807 (2^63-1)
    // This is sufficient for wei amounts (1 WLD = 10^18 wei)
    await client.query(`
      ALTER TABLE matches 
      ADD COLUMN total_claimed_amount BIGINT NOT NULL DEFAULT 0;
    `);
    console.log('✅ Added column total_claimed_amount to matches table');
    
    // Create index for efficient lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matches_total_claimed_amount 
      ON matches(total_claimed_amount) 
      WHERE total_claimed_amount > 0;
    `);
    console.log('✅ Created index on total_claimed_amount');
  } else {
    console.log('✅ Column total_claimed_amount already exists in matches table');
  }

  // Backfill any NULL values to 0 (should not exist with DEFAULT, but be safe)
  await client.query(`
    UPDATE matches 
    SET total_claimed_amount = 0 
    WHERE total_claimed_amount IS NULL;
  `);
  console.log('✅ Backfilled NULL values in total_claimed_amount');

  console.log('✅ Migration 012_add_matches_total_claimed_amount completed');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 012_add_matches_total_claimed_amount');
  
  // Drop index first
  await client.query(`
    DROP INDEX IF EXISTS idx_matches_total_claimed_amount;
  `);
  
  // Drop column
  await client.query(`
    ALTER TABLE matches DROP COLUMN IF EXISTS total_claimed_amount CASCADE;
  `);
  
  console.log('✅ Rolled back migration 012_add_matches_total_claimed_amount');
}
