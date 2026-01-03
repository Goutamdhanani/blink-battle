import { PoolClient } from 'pg';

/**
 * Migration: Add unique constraint on tap_events(match_id, user_id)
 * 
 * This enforces first-write-wins semantics for tap recording.
 * Only the first tap from each user in a match is recorded.
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 003_tap_events_unique');

  // Check if constraint already exists
  const constraintExists = await client.query(`
    SELECT constraint_name 
    FROM information_schema.table_constraints 
    WHERE table_name='tap_events' 
      AND constraint_name='tap_events_match_user_unique'
  `);

  if (constraintExists.rows.length > 0) {
    console.log('✅ Unique constraint already exists on tap_events(match_id, user_id)');
    return;
  }

  // Remove any duplicate tap events before adding constraint
  // Keep only the earliest tap for each (match_id, user_id) pair
  console.log('Removing duplicate tap events (keeping earliest)...');
  await client.query(`
    DELETE FROM tap_events
    WHERE tap_id NOT IN (
      SELECT DISTINCT ON (match_id, user_id) tap_id
      FROM tap_events
      ORDER BY match_id, user_id, server_timestamp ASC
    )
  `);

  // Add unique constraint
  console.log('Adding unique constraint on tap_events(match_id, user_id)...');
  await client.query(`
    ALTER TABLE tap_events
    ADD CONSTRAINT tap_events_match_user_unique UNIQUE (match_id, user_id)
  `);

  console.log('✅ Added unique constraint on tap_events(match_id, user_id)');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 003_tap_events_unique');
  
  await client.query(`
    ALTER TABLE tap_events 
    DROP CONSTRAINT IF EXISTS tap_events_match_user_unique
  `);
  
  console.log('✅ Dropped unique constraint on tap_events(match_id, user_id)');
}
