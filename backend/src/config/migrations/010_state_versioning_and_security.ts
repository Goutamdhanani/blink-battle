import { PoolClient } from 'pg';

/**
 * Migration: Add state versioning and security features
 * 
 * This migration adds:
 * - State version for optimistic locking
 * - Tap nonce for anti-cheat
 * - Payment expiry tracking
 * - Suspicious activity tracking
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 010_state_versioning_and_security');

  // Add state version and tap nonce to matches table
  const matchColumns = [
    { name: 'state_version', type: 'INT DEFAULT 1' },
    { name: 'tap_nonce', type: 'VARCHAR(64)' },
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

  // Add payment expiry tracking to payment_intents table
  const paymentColumns = [
    { name: 'expires_at', type: 'TIMESTAMPTZ' },
  ];

  for (const col of paymentColumns) {
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

  // Set default expiry for existing pending payments (15 minutes from creation)
  await client.query(`
    UPDATE payment_intents 
    SET expires_at = created_at + INTERVAL '15 minutes'
    WHERE expires_at IS NULL AND normalized_status = 'pending';
  `);
  console.log('✅ Set default expiry for existing pending payments');

  // Create suspicious_activity table for anti-cheat
  const tableExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'suspicious_activity'
    );
  `);

  if (!tableExists.rows[0].exists) {
    await client.query(`
      CREATE TABLE suspicious_activity (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(user_id),
        reason VARCHAR(100) NOT NULL,
        avg_reaction_ms NUMERIC(10,2),
        match_id UUID,
        details TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Created suspicious_activity table');
  } else {
    console.log('✅ suspicious_activity table already exists');
  }

  // Create index for fast refund queries
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_eligible_refunds 
      ON payment_intents(user_id, refund_status, refund_deadline)
      WHERE refund_status = 'eligible';
  `);
  console.log('✅ Created index for eligible refunds');

  // Create index for expired payments
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_expires_at 
      ON payment_intents(expires_at, normalized_status)
      WHERE normalized_status = 'pending' OR normalized_status = 'confirmed';
  `);
  console.log('✅ Created index for payment expiry');

  // Create index for suspicious activity tracking
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_suspicious_activity_user 
      ON suspicious_activity(user_id, created_at);
  `);
  console.log('✅ Created index for suspicious activity');

  console.log('✅ Migration 010_state_versioning_and_security completed');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 010_state_versioning_and_security');
  
  // Remove columns from matches
  const matchColumns = ['state_version', 'tap_nonce'];
  for (const col of matchColumns) {
    await client.query(`ALTER TABLE matches DROP COLUMN IF EXISTS ${col} CASCADE;`);
  }

  // Remove columns from payment_intents
  const paymentColumns = ['expires_at'];
  for (const col of paymentColumns) {
    await client.query(`ALTER TABLE payment_intents DROP COLUMN IF EXISTS ${col} CASCADE;`);
  }

  // Drop suspicious_activity table
  await client.query(`DROP TABLE IF EXISTS suspicious_activity CASCADE;`);

  // Drop indexes
  await client.query(`DROP INDEX IF EXISTS idx_payment_eligible_refunds;`);
  await client.query(`DROP INDEX IF EXISTS idx_payment_expires_at;`);
  await client.query(`DROP INDEX IF EXISTS idx_suspicious_activity_user;`);
  
  console.log('✅ Rolled back migration 010_state_versioning_and_security');
}
