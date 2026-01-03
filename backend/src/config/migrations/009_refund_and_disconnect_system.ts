import { PoolClient } from 'pg';

/**
 * Migration: Add refund and disconnect tracking
 * 
 * This migration adds:
 * - Refund tracking to payment_intents table
 * - Match cancellation tracking to matches table
 * - Heartbeat tracking for disconnect detection
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 009_refund_and_disconnect_system');

  // Add refund columns to payment_intents table
  const refundColumns = [
    { name: 'refund_status', type: 'VARCHAR(50) DEFAULT \'none\'' },
    { name: 'refund_amount', type: 'NUMERIC(18, 8)' },
    { name: 'refund_reason', type: 'VARCHAR(255)' },
    { name: 'refund_claimed_at', type: 'TIMESTAMPTZ' },
    { name: 'refund_deadline', type: 'TIMESTAMPTZ' },
    { name: 'refund_tx_hash', type: 'VARCHAR(66)' },
  ];

  for (const col of refundColumns) {
    const colExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'payment_intents' AND column_name = $1
      );
    `, [col.name]);

    if (!colExists.rows[0].exists) {
      await client.query(`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`);
      console.log(`✅ Added column ${col.name} to payment_intents table`);
    } else {
      console.log(`✅ Column ${col.name} already exists in payment_intents table`);
    }
  }

  // Add match cancellation columns to matches table
  const matchColumns = [
    { name: 'cancelled', type: 'BOOLEAN DEFAULT false' },
    { name: 'cancellation_reason', type: 'VARCHAR(255)' },
    { name: 'refund_processed', type: 'BOOLEAN DEFAULT false' },
    { name: 'player1_last_ping', type: 'TIMESTAMPTZ' },
    { name: 'player2_last_ping', type: 'TIMESTAMPTZ' },
  ];

  for (const col of matchColumns) {
    const colExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = $1
      );
    `, [col.name]);

    if (!colExists.rows[0].exists) {
      await client.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`);
      console.log(`✅ Added column ${col.name} to matches table`);
    } else {
      console.log(`✅ Column ${col.name} already exists in matches table`);
    }
  }

  // Add constraint for refund_status if it doesn't exist
  const refundStatusConstraintExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.table_constraints 
      WHERE table_name = 'payment_intents' AND constraint_name = 'payment_intents_refund_status_check'
    );
  `);

  if (!refundStatusConstraintExists.rows[0].exists) {
    await client.query(`
      ALTER TABLE payment_intents 
      ADD CONSTRAINT payment_intents_refund_status_check 
      CHECK (refund_status IN ('none', 'eligible', 'processing', 'completed', 'failed'));
    `);
    console.log('✅ Added refund_status constraint to payment_intents table');
  }

  // Create indexes for efficient queries
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_matches_ping ON matches(player1_last_ping, player2_last_ping) 
    WHERE status IN ('waiting', 'ready', 'countdown', 'signal');
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_refund_status ON payment_intents(refund_status) 
    WHERE refund_status != 'none';
  `);

  console.log('✅ Created performance indexes');
  console.log('✅ Migration 009_refund_and_disconnect_system completed');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 009_refund_and_disconnect_system');
  
  // Remove refund columns from payment_intents
  const refundColumns = [
    'refund_status',
    'refund_amount',
    'refund_reason',
    'refund_claimed_at',
    'refund_deadline',
    'refund_tx_hash',
  ];

  for (const col of refundColumns) {
    await client.query(`ALTER TABLE payment_intents DROP COLUMN IF EXISTS ${col} CASCADE;`);
  }

  // Remove match cancellation columns from matches
  const matchColumns = [
    'cancelled',
    'cancellation_reason',
    'refund_processed',
    'player1_last_ping',
    'player2_last_ping',
  ];

  for (const col of matchColumns) {
    await client.query(`ALTER TABLE matches DROP COLUMN IF EXISTS ${col} CASCADE;`);
  }
  
  console.log('✅ Rolled back migration 009_refund_and_disconnect_system');
}
