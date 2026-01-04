import { PoolClient } from 'pg';

/**
 * Migration: Enhanced Claim Security and Payment Tracking
 * 
 * This migration adds:
 * - Additional claim tracking columns for security (claimed, claim_timestamp, claim_transaction_hash)
 * - Total claimed amount tracking to prevent double claims exceeding 2x stake
 * - Payment-to-match linking for single-use enforcement
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 011_claim_security_enhancements');

  // Add enhanced claim tracking to claims table
  const claimsColumns = [
    { name: 'claimed', type: 'BOOLEAN DEFAULT false' },
    { name: 'claim_timestamp', type: 'TIMESTAMPTZ' },
    { name: 'claim_transaction_hash', type: 'VARCHAR(66)' },
  ];

  for (const col of claimsColumns) {
    const colExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'claims' AND column_name = $1
      );
    `, [col.name]);

    if (!colExists.rows[0].exists) {
      await client.query(`ALTER TABLE claims ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`);
      console.log(`✅ Added column ${col.name} to claims table`);
    } else {
      console.log(`✅ Column ${col.name} already exists in claims table`);
    }
  }

  // Add total_claimed_amount tracking to payment_intents
  // This prevents users from claiming more than 2x their original stake
  // NUMERIC(18, 8) precision: supports up to 9,999,999,999.99999999 WLD
  // This is sufficient as max stake is typically < 1000 WLD and max claim is 2x stake
  const paymentColumns = [
    { name: 'total_claimed_amount', type: 'NUMERIC(18, 8) DEFAULT 0' },
    { name: 'used_for_match', type: 'BOOLEAN DEFAULT false' },
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

  // Update existing claims to set claimed = true where status = 'completed'
  await client.query(`
    UPDATE claims 
    SET claimed = true, 
        claim_timestamp = processed_at,
        claim_transaction_hash = tx_hash
    WHERE status = 'completed' AND claimed = false;
  `);
  console.log('✅ Updated existing completed claims');

  // Mark existing payment_intents linked to matches as used
  await client.query(`
    UPDATE payment_intents 
    SET used_for_match = true
    WHERE match_id IS NOT NULL AND used_for_match = false;
  `);
  console.log('✅ Updated existing payment intents linked to matches');

  // Create index for efficient claim lookups
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_claims_claimed ON claims(claimed) 
    WHERE claimed = false;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_intents_used ON payment_intents(used_for_match) 
    WHERE used_for_match = true;
  `);

  console.log('✅ Created performance indexes');
  console.log('✅ Migration 011_claim_security_enhancements completed');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 011_claim_security_enhancements');
  
  // Remove columns from claims table
  const claimsColumns = [
    'claimed',
    'claim_timestamp',
    'claim_transaction_hash',
  ];

  for (const col of claimsColumns) {
    await client.query(`ALTER TABLE claims DROP COLUMN IF EXISTS ${col} CASCADE;`);
  }

  // Remove columns from payment_intents table
  const paymentColumns = [
    'total_claimed_amount',
    'used_for_match',
  ];

  for (const col of paymentColumns) {
    await client.query(`ALTER TABLE payment_intents DROP COLUMN IF EXISTS ${col} CASCADE;`);
  }
  
  console.log('✅ Rolled back migration 011_claim_security_enhancements');
}
