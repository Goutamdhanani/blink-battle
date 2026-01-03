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
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_name='matches' AND column_name='green_light_time'
    `);
    
    if (greenLightExists.rows.length === 0) {
      console.log('Adding green_light_time column as BIGINT...');
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN green_light_time BIGINT
      `);
      console.log('✅ Added green_light_time column');
    } else {
      const currentType = greenLightExists.rows[0].data_type;
      console.log(`✅ green_light_time column already exists with type: ${currentType}`);
      
      // If it's not BIGINT, we need to convert it
      if (currentType !== 'bigint') {
        console.log(`⚠️  Converting green_light_time from ${currentType} to BIGINT...`);
        await client.query(`
          ALTER TABLE matches 
          ALTER COLUMN green_light_time TYPE BIGINT USING CASE 
            WHEN green_light_time IS NULL THEN NULL
            ELSE EXTRACT(EPOCH FROM green_light_time) * 1000
          END
        `);
        console.log('✅ Converted green_light_time to BIGINT');
      }
    }
    
    // Check and add player1_ready_at column if missing
    const player1ReadyAtExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='matches' AND column_name='player1_ready_at'
    `);
    
    if (player1ReadyAtExists.rows.length === 0) {
      console.log('Adding player1_ready_at column...');
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN player1_ready_at TIMESTAMPTZ
      `);
      console.log('✅ Added player1_ready_at column');
    } else {
      console.log('✅ player1_ready_at column already exists');
    }
    
    // Check and add player2_ready_at column if missing
    const player2ReadyAtExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='matches' AND column_name='player2_ready_at'
    `);
    
    if (player2ReadyAtExists.rows.length === 0) {
      console.log('Adding player2_ready_at column...');
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN player2_ready_at TIMESTAMPTZ
      `);
      console.log('✅ Added player2_ready_at column');
    } else {
      console.log('✅ player2_ready_at column already exists');
    }
    
    // Ensure player1_ready and player2_ready are NOT NULL with default false
    console.log('Ensuring player ready columns have proper constraints...');
    
    // First backfill any NULL values to false
    await client.query(`
      UPDATE matches 
      SET player1_ready = false 
      WHERE player1_ready IS NULL
    `);
    
    await client.query(`
      UPDATE matches 
      SET player2_ready = false 
      WHERE player2_ready IS NULL
    `);
    
    // Then add NOT NULL constraint if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN
        BEGIN
          ALTER TABLE matches 
          ALTER COLUMN player1_ready SET DEFAULT false,
          ALTER COLUMN player1_ready SET NOT NULL;
        EXCEPTION
          WHEN others THEN NULL;
        END;
        
        BEGIN
          ALTER TABLE matches 
          ALTER COLUMN player2_ready SET DEFAULT false,
          ALTER COLUMN player2_ready SET NOT NULL;
        EXCEPTION
          WHEN others THEN NULL;
        END;
      END $$;
    `);
    
    console.log('✅ Player ready columns have proper constraints');
    
    // Check and add player1_staked column if missing
    const player1StakedExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='matches' AND column_name='player1_staked'
    `);
    
    if (player1StakedExists.rows.length === 0) {
      console.log('Adding player1_staked column...');
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN player1_staked BOOLEAN DEFAULT false
      `);
      console.log('✅ Added player1_staked column');
    } else {
      console.log('✅ player1_staked column already exists');
    }
    
    // Check and add player2_staked column if missing
    const player2StakedExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='matches' AND column_name='player2_staked'
    `);
    
    if (player2StakedExists.rows.length === 0) {
      console.log('Adding player2_staked column...');
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN player2_staked BOOLEAN DEFAULT false
      `);
      console.log('✅ Added player2_staked column');
    } else {
      console.log('✅ player2_staked column already exists');
    }
    
    // Check and add player1_stake_tx column if missing
    const player1StakeTxExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='matches' AND column_name='player1_stake_tx'
    `);
    
    if (player1StakeTxExists.rows.length === 0) {
      console.log('Adding player1_stake_tx column...');
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN player1_stake_tx TEXT
      `);
      console.log('✅ Added player1_stake_tx column');
    } else {
      console.log('✅ player1_stake_tx column already exists');
    }
    
    // Check and add player2_stake_tx column if missing
    const player2StakeTxExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='matches' AND column_name='player2_stake_tx'
    `);
    
    if (player2StakeTxExists.rows.length === 0) {
      console.log('Adding player2_stake_tx column...');
      await client.query(`
        ALTER TABLE matches 
        ADD COLUMN player2_stake_tx TEXT
      `);
      console.log('✅ Added player2_stake_tx column');
    } else {
      console.log('✅ player2_stake_tx column already exists');
    }
    
    console.log('✅ Staking columns verified/added');
    
    // Check and add tx_hash column to transactions table if missing
    const txHashExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='transactions' AND column_name='tx_hash'
    `);
    
    if (txHashExists.rows.length === 0) {
      console.log('Adding tx_hash column to transactions table...');
      await client.query(`
        ALTER TABLE transactions 
        ADD COLUMN tx_hash TEXT
      `);
      console.log('✅ Added tx_hash column to transactions table');
    } else {
      console.log('✅ tx_hash column already exists in transactions table');
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
