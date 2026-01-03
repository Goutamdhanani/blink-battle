import { PoolClient } from 'pg';

/**
 * Migration: Add columns for game randomness and player disqualification
 * 
 * CHANGES:
 * 1. random_delay_ms - stores the random delay (2-5s) used for green light
 * 2. player1_disqualified - tracks if player 1 tapped before green light
 * 3. player2_disqualified - tracks if player 2 tapped before green light  
 * 4. result_type - describes how match ended (normal_win, tie, both_disqualified, etc.)
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 008_add_game_randomness_columns');

  // Check if matches table exists
  const tableExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'matches'
    );
  `);

  if (!tableExists.rows[0].exists) {
    console.log('⚠️ Matches table does not exist, skipping migration');
    return;
  }

  // Add columns if they don't exist
  const columnsToAdd = [
    { name: 'random_delay_ms', type: 'INTEGER', description: 'Random delay in ms (2000-5000) added after countdown' },
    { name: 'player1_disqualified', type: 'BOOLEAN DEFAULT FALSE', description: 'Player 1 tapped before green light' },
    { name: 'player2_disqualified', type: 'BOOLEAN DEFAULT FALSE', description: 'Player 2 tapped before green light' },
    { name: 'result_type', type: 'VARCHAR(50)', description: 'How match ended (normal_win, tie, early_tap, etc.)' }
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
      console.log(`✅ Added column ${col.name} to matches table - ${col.description}`);
    } else {
      console.log(`✅ Column ${col.name} already exists in matches table`);
    }
  }

  console.log('✅ Migration 008_add_game_randomness_columns completed');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 008_add_game_randomness_columns');
  
  // Remove columns in reverse order
  const columnsToRemove = [
    'result_type',
    'player2_disqualified',
    'player1_disqualified',
    'random_delay_ms'
  ];

  for (const col of columnsToRemove) {
    await client.query(`ALTER TABLE matches DROP COLUMN IF EXISTS ${col} CASCADE;`);
    console.log(`✅ Removed column ${col} from matches table`);
  }
  
  console.log('✅ Rolled back migration 008_add_game_randomness_columns');
}
