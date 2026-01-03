import { PoolClient } from 'pg';

/**
 * Migration: Create payment_intents table
 * 
 * This table tracks payment processing with idempotency, locking, and retry logic.
 * Key features:
 * - Idempotency via payment_reference (unique)
 * - Row-level locking for concurrent payment processing (locked_at, locked_by)
 * - Retry tracking with exponential backoff (retry_count, last_retry_at, next_retry_at)
 * - Normalized MiniKit status (normalized_status)
 * - Transaction tracking (transaction_hash, minikit_transaction_id)
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 001_payment_intents');

  // Check if table already exists
  const tableExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'payment_intents'
    );
  `);

  if (tableExists.rows[0].exists) {
    console.log('✅ payment_intents table already exists, skipping creation');
    return;
  }

  await client.query(`
    CREATE TABLE payment_intents (
      intent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_reference VARCHAR(255) UNIQUE NOT NULL,
      user_id UUID REFERENCES users(user_id) NOT NULL,
      match_id UUID REFERENCES matches(match_id),
      amount DECIMAL(10, 4) NOT NULL,
      
      -- MiniKit transaction tracking
      minikit_transaction_id VARCHAR(255),
      transaction_hash VARCHAR(255),
      
      -- Status tracking
      raw_status VARCHAR(50),
      normalized_status VARCHAR(50) NOT NULL DEFAULT 'pending',
      
      -- Locking for concurrent processing
      locked_at TIMESTAMPTZ,
      locked_by VARCHAR(255),
      
      -- Retry and backoff tracking
      retry_count INTEGER DEFAULT 0 NOT NULL,
      last_retry_at TIMESTAMPTZ,
      next_retry_at TIMESTAMPTZ,
      
      -- Timestamps
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
      confirmed_at TIMESTAMPTZ,
      
      -- Error tracking
      last_error TEXT,
      
      CONSTRAINT payment_intents_normalized_status_check 
        CHECK (normalized_status IN ('pending', 'confirmed', 'failed', 'cancelled'))
    );
  `);

  // Create indexes for efficient querying
  await client.query(`
    CREATE INDEX idx_payment_intents_reference ON payment_intents(payment_reference);
    CREATE INDEX idx_payment_intents_user ON payment_intents(user_id);
    CREATE INDEX idx_payment_intents_match ON payment_intents(match_id);
    CREATE INDEX idx_payment_intents_status ON payment_intents(normalized_status);
    CREATE INDEX idx_payment_intents_locked ON payment_intents(locked_at) WHERE locked_at IS NOT NULL;
    CREATE INDEX idx_payment_intents_retry ON payment_intents(next_retry_at) WHERE next_retry_at IS NOT NULL;
  `);

  console.log('✅ Created payment_intents table with indexes');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 001_payment_intents');
  
  await client.query('DROP TABLE IF EXISTS payment_intents CASCADE;');
  
  console.log('✅ Dropped payment_intents table');
}
