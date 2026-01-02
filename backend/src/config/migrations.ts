import pool from './database';

/**
 * Migration helper for adding missing columns to existing tables
 * Run this if columns are missing from production database
 */
export const addMissingColumns = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Checking for missing columns...');
    
    // Check and add player1_ready column if missing
    const player1ReadyExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='matches' AND column_name='player1_ready'
    `);
    
    if (player1ReadyExists.rows.length === 0) {
      console.log('Adding player1_ready column...');
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN player1_ready BOOLEAN DEFAULT false
      `);
      console.log('✅ Added player1_ready column');
    } else {
      console.log('✅ player1_ready column already exists');
    }
    
    // Check and add player2_ready column if missing
    const player2ReadyExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='matches' AND column_name='player2_ready'
    `);
    
    if (player2ReadyExists.rows.length === 0) {
      console.log('Adding player2_ready column...');
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN player2_ready BOOLEAN DEFAULT false
      `);
      console.log('✅ Added player2_ready column');
    } else {
      console.log('✅ player2_ready column already exists');
    }
    
    // Check and add green_light_time column if missing
    const greenLightExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='matches' AND column_name='green_light_time'
    `);
    
    if (greenLightExists.rows.length === 0) {
      console.log('Adding green_light_time column...');
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN green_light_time BIGINT
      `);
      console.log('✅ Added green_light_time column');
    } else {
      console.log('✅ green_light_time column already exists');
    }
    
    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const runMigrations = async () => {
  try {
    await addMissingColumns();
    console.log('All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migrations failed:', error);
    process.exit(1);
  }
};

// Only run if executed directly (not imported)
// This checks if the module is the main entry point
const isMainModule = require.main === module || 
  (typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('migrations'));

if (isMainModule) {
  runMigrations();
}
