import pool from './database';

export const createTables = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(255) UNIQUE NOT NULL,
        region VARCHAR(50),
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        avg_reaction_time DECIMAL(10, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Matches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS matches (
        match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        player1_id UUID REFERENCES users(user_id),
        player2_id UUID REFERENCES users(user_id),
        stake DECIMAL(10, 4) NOT NULL,
        player1_reaction_ms INTEGER,
        player2_reaction_ms INTEGER,
        winner_id UUID REFERENCES users(user_id),
        status VARCHAR(50) NOT NULL,
        fee DECIMAL(10, 4),
        signal_timestamp BIGINT,
        false_start_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);

    // Transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id UUID REFERENCES matches(match_id),
        type VARCHAR(50) NOT NULL,
        amount DECIMAL(10, 4) NOT NULL,
        from_wallet VARCHAR(255),
        to_wallet VARCHAR(255),
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(player1_id, player2_id);
      CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_match ON transactions(match_id);
    `);

    await client.query('COMMIT');
    console.log('Database tables created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const migrate = async () => {
  try {
    await createTables();
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  migrate();
}
