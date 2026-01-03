import { PoolClient } from 'pg';

/**
 * Migration: Add index for minikit_transaction_id
 * 
 * This index improves query performance when looking up payments by transaction ID
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 005_payment_intent_transaction_id_index');

  // Check if index already exists
  const indexExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM pg_indexes
      WHERE tablename = 'payment_intents'
      AND indexname = 'idx_payment_intents_transaction_id'
    );
  `);

  if (indexExists.rows[0].exists) {
    console.log('✅ Index idx_payment_intents_transaction_id already exists, skipping creation');
    return;
  }

  await client.query(`
    CREATE INDEX idx_payment_intents_transaction_id 
    ON payment_intents(minikit_transaction_id) 
    WHERE minikit_transaction_id IS NOT NULL;
  `);

  console.log('✅ Created index idx_payment_intents_transaction_id');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 005_payment_intent_transaction_id_index');
  
  await client.query('DROP INDEX IF EXISTS idx_payment_intents_transaction_id;');
  
  console.log('✅ Dropped index idx_payment_intents_transaction_id');
}
