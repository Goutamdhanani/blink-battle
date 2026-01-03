import { PoolClient } from 'pg';

/**
 * Migration: Add idempotency_key and wallet columns to matches table
 * 
 * This migration adds:
 * - idempotency_key for deterministic match creation
 * - player1_wallet and player2_wallet for storing wallet addresses at match creation
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 002_matches_idempotency');

  // Check if idempotency_key column exists
  const idempotencyKeyExists = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name='matches' AND column_name='idempotency_key'
  `);

  if (idempotencyKeyExists.rows.length === 0) {
    console.log('Adding idempotency_key column to matches table...');
    await client.query(`
      ALTER TABLE matches 
      ADD COLUMN idempotency_key VARCHAR(255) UNIQUE
    `);
    
    // Create index for efficient lookups
    await client.query(`
      CREATE INDEX idx_matches_idempotency_key ON matches(idempotency_key);
    `);
    
    console.log('✅ Added idempotency_key column and index');
  } else {
    console.log('✅ idempotency_key column already exists');
  }

  // Check if player1_wallet column exists
  const player1WalletExists = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name='matches' AND column_name='player1_wallet'
  `);

  if (player1WalletExists.rows.length === 0) {
    console.log('Adding player1_wallet column to matches table...');
    await client.query(`
      ALTER TABLE matches 
      ADD COLUMN player1_wallet VARCHAR(255)
    `);
    
    // Backfill existing matches with wallet addresses from users table
    await client.query(`
      UPDATE matches m
      SET player1_wallet = u.wallet_address
      FROM users u
      WHERE m.player1_id = u.user_id AND m.player1_wallet IS NULL
    `);
    
    console.log('✅ Added player1_wallet column and backfilled data');
  } else {
    console.log('✅ player1_wallet column already exists');
  }

  // Check if player2_wallet column exists
  const player2WalletExists = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name='matches' AND column_name='player2_wallet'
  `);

  if (player2WalletExists.rows.length === 0) {
    console.log('Adding player2_wallet column to matches table...');
    await client.query(`
      ALTER TABLE matches 
      ADD COLUMN player2_wallet VARCHAR(255)
    `);
    
    // Backfill existing matches with wallet addresses from users table
    await client.query(`
      UPDATE matches m
      SET player2_wallet = u.wallet_address
      FROM users u
      WHERE m.player2_id = u.user_id AND m.player2_wallet IS NULL
    `);
    
    console.log('✅ Added player2_wallet column and backfilled data');
  } else {
    console.log('✅ player2_wallet column already exists');
  }

  console.log('✅ Migration 002_matches_idempotency completed');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 002_matches_idempotency');
  
  await client.query('ALTER TABLE matches DROP COLUMN IF EXISTS idempotency_key CASCADE;');
  await client.query('ALTER TABLE matches DROP COLUMN IF EXISTS player1_wallet CASCADE;');
  await client.query('ALTER TABLE matches DROP COLUMN IF EXISTS player2_wallet CASCADE;');
  
  console.log('✅ Rolled back matches idempotency and wallet columns');
}
