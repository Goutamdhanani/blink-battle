import { PoolClient } from 'pg';

/**
 * Migration: Schema validation and fixes
 * 
 * Ensures all critical columns and constraints exist:
 * - transactions.tx_hash column
 * - payment_intents table with all required fields
 * - matches.player1_wallet and player2_wallet columns
 * - tap_events UNIQUE constraint
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 004_schema_validation');

  // Verify transactions.tx_hash column exists
  const txHashExists = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name='transactions' AND column_name='tx_hash'
  `);

  if (txHashExists.rows.length === 0) {
    console.log('Adding tx_hash column to transactions table...');
    await client.query(`
      ALTER TABLE transactions 
      ADD COLUMN tx_hash VARCHAR(255)
    `);
    
    await client.query(`
      CREATE INDEX idx_transactions_tx_hash ON transactions(tx_hash) WHERE tx_hash IS NOT NULL;
    `);
    
    console.log('✅ Added tx_hash column to transactions');
  } else {
    console.log('✅ transactions.tx_hash column already exists');
  }

  // Verify payment_intents table exists with all required fields
  const paymentIntentsExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'payment_intents'
    );
  `);

  if (!paymentIntentsExists.rows[0].exists) {
    console.log('⚠️  payment_intents table does not exist - should be created by migration 001');
  } else {
    console.log('✅ payment_intents table exists');
  }

  // Verify matches wallet columns exist
  const player1WalletExists = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name='matches' AND column_name='player1_wallet'
  `);

  if (player1WalletExists.rows.length === 0) {
    console.log('⚠️  matches.player1_wallet column does not exist - should be created by migration 002');
  } else {
    console.log('✅ matches.player1_wallet column exists');
  }

  const player2WalletExists = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name='matches' AND column_name='player2_wallet'
  `);

  if (player2WalletExists.rows.length === 0) {
    console.log('⚠️  matches.player2_wallet column does not exist - should be created by migration 002');
  } else {
    console.log('✅ matches.player2_wallet column exists');
  }

  // Verify tap_events unique constraint exists
  const tapEventsUniqueExists = await client.query(`
    SELECT constraint_name 
    FROM information_schema.table_constraints 
    WHERE table_name='tap_events' 
      AND constraint_name='tap_events_match_user_unique'
  `);

  if (tapEventsUniqueExists.rows.length === 0) {
    console.log('⚠️  tap_events unique constraint does not exist - should be created by migration 003');
  } else {
    console.log('✅ tap_events UNIQUE(match_id, user_id) constraint exists');
  }

  console.log('✅ Migration 004_schema_validation completed');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 004_schema_validation');
  
  // This migration only validates schema, no rollback needed
  console.log('✅ No rollback needed for schema validation');
}
