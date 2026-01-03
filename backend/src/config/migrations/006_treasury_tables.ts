import { PoolClient } from 'pg';

/**
 * Migration: Create treasury-based payment tables (deposits and claims)
 * 
 * This migration implements the treasury architecture to avoid gas issues:
 * - deposits: Track player deposits before matches
 * - claims: Track winner claims and payouts after matches
 * - Add claim-related columns to matches table
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 006_treasury_tables');

  // Create deposits table
  const depositsExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'deposits'
    );
  `);

  if (!depositsExists.rows[0].exists) {
    await client.query(`
      CREATE TABLE deposits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(user_id),
        wallet_address VARCHAR(42) NOT NULL,
        amount DECIMAL(18,8) NOT NULL,
        tx_hash VARCHAR(66) UNIQUE NOT NULL,
        payment_reference VARCHAR(64) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        match_id UUID REFERENCES matches(match_id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        confirmed_at TIMESTAMPTZ,
        used_at TIMESTAMPTZ,
        
        CONSTRAINT deposits_status_check 
          CHECK (status IN ('pending', 'confirmed', 'used', 'refunded'))
      );
    `);

    await client.query(`
      CREATE INDEX idx_deposits_user ON deposits(user_id);
      CREATE INDEX idx_deposits_wallet ON deposits(wallet_address);
      CREATE INDEX idx_deposits_status ON deposits(status);
      CREATE INDEX idx_deposits_payment_ref ON deposits(payment_reference);
    `);

    console.log('✅ Created deposits table with indexes');
  } else {
    console.log('✅ deposits table already exists, skipping creation');
  }

  // Create claims table
  const claimsExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'claims'
    );
  `);

  if (!claimsExists.rows[0].exists) {
    await client.query(`
      CREATE TABLE claims (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id UUID NOT NULL REFERENCES matches(match_id),
        winner_wallet VARCHAR(42) NOT NULL,
        amount DECIMAL(18,8) NOT NULL,
        platform_fee DECIMAL(18,8) NOT NULL,
        net_payout DECIMAL(18,8) NOT NULL,
        tx_hash VARCHAR(66),
        status VARCHAR(20) DEFAULT 'pending',
        idempotency_key VARCHAR(128) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        error_message TEXT,
        
        CONSTRAINT unique_match_claim UNIQUE (match_id),
        CONSTRAINT claims_status_check 
          CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
      );
    `);

    await client.query(`
      CREATE INDEX idx_claims_wallet ON claims(winner_wallet);
      CREATE INDEX idx_claims_status ON claims(status);
      CREATE INDEX idx_claims_idempotency ON claims(idempotency_key);
      CREATE INDEX idx_claims_match ON claims(match_id);
    `);

    console.log('✅ Created claims table with indexes');
  } else {
    console.log('✅ claims table already exists, skipping creation');
  }

  // Add claim-related columns to matches table
  const columnsToAdd = [
    { name: 'winner_wallet', type: 'VARCHAR(42)' },
    { name: 'loser_wallet', type: 'VARCHAR(42)' },
    { name: 'claim_deadline', type: 'TIMESTAMPTZ' },
    { name: 'claim_status', type: 'VARCHAR(20) DEFAULT \'unclaimed\'' },
    { name: 'result_finalized_at', type: 'TIMESTAMPTZ' }
  ];

  for (const col of columnsToAdd) {
    const colExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = $1
      );
    `, [col.name]);

    if (!colExists.rows[0].exists) {
      await client.query(`ALTER TABLE matches ADD COLUMN ${col.name} ${col.type};`);
      console.log(`✅ Added column ${col.name} to matches table`);
    } else {
      console.log(`✅ Column ${col.name} already exists in matches table`);
    }
  }

  // Add constraint for claim_status if it doesn't exist
  const constraintExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.table_constraints 
      WHERE table_name = 'matches' AND constraint_name = 'matches_claim_status_check'
    );
  `);

  if (!constraintExists.rows[0].exists) {
    await client.query(`
      ALTER TABLE matches 
      ADD CONSTRAINT matches_claim_status_check 
      CHECK (claim_status IN ('unclaimed', 'claimed', 'expired'));
    `);
    console.log('✅ Added claim_status constraint to matches table');
  }

  console.log('✅ Migration 006_treasury_tables completed');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 006_treasury_tables');
  
  // Drop tables in reverse order
  await client.query('DROP TABLE IF EXISTS claims CASCADE;');
  await client.query('DROP TABLE IF EXISTS deposits CASCADE;');
  
  // Remove columns from matches
  const columnsToRemove = [
    'winner_wallet',
    'loser_wallet', 
    'claim_deadline',
    'claim_status',
    'result_finalized_at'
  ];

  for (const col of columnsToRemove) {
    await client.query(`ALTER TABLE matches DROP COLUMN IF EXISTS ${col} CASCADE;`);
  }
  
  console.log('✅ Rolled back migration 006_treasury_tables');
}
