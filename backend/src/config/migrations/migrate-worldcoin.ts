import pool from '../database';

/**
 * Migration: Add World ID verification support
 * 
 * Creates:
 * - world_id_verifications table for storing verified nullifiers
 * - Adds world_id_* columns to users table
 */

export async function up(): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Create world_id_verifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS world_id_verifications (
        id SERIAL PRIMARY KEY,
        nullifier_hash VARCHAR(255) UNIQUE NOT NULL,
        verification_level VARCHAR(50) NOT NULL,
        verified_at TIMESTAMP NOT NULL DEFAULT NOW(),
        linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    console.log('✅ Created world_id_verifications table');

    // Add indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_world_id_nullifier ON world_id_verifications(nullifier_hash);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_world_id_linked_user ON world_id_verifications(linked_user_id);
    `);

    console.log('✅ Created indexes on world_id_verifications');

    // Add World ID columns to users table if they don't exist
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS world_id_nullifier VARCHAR(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS world_id_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS world_id_verification_level VARCHAR(50);
    `);

    console.log('✅ Added World ID columns to users table');

    // Create index on world_id_nullifier for quick lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_world_id_nullifier 
      ON users(world_id_nullifier) 
      WHERE world_id_nullifier IS NOT NULL;
    `);

    console.log('✅ Created index on users.world_id_nullifier');

    await client.query('COMMIT');
    console.log('✅ World ID migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ World ID migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Remove World ID columns from users table
    await client.query(`
      ALTER TABLE users 
      DROP COLUMN IF EXISTS world_id_nullifier,
      DROP COLUMN IF EXISTS world_id_verified,
      DROP COLUMN IF EXISTS world_id_verification_level;
    `);

    console.log('✅ Removed World ID columns from users table');

    // Drop world_id_verifications table
    await client.query(`
      DROP TABLE IF EXISTS world_id_verifications;
    `);

    console.log('✅ Dropped world_id_verifications table');

    await client.query('COMMIT');
    console.log('✅ World ID migration rollback completed');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ World ID migration rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'up') {
    up()
      .then(() => {
        console.log('Migration completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
      });
  } else if (command === 'down') {
    down()
      .then(() => {
        console.log('Rollback completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Rollback failed:', error);
        process.exit(1);
      });
  } else {
    console.log('Usage: ts-node migrate-worldcoin.ts [up|down]');
    process.exit(1);
  }
}
