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

    // Matches table (with HTTP polling fields)
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
        completed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        green_light_time BIGINT,
        player1_ready BOOLEAN DEFAULT false,
        player2_ready BOOLEAN DEFAULT false
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

    // Payments table for tracking payment references
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reference VARCHAR(255) UNIQUE NOT NULL,
        user_id UUID REFERENCES users(user_id) NOT NULL,
        amount DECIMAL(10, 4) NOT NULL,
        status VARCHAR(50) NOT NULL,
        transaction_id VARCHAR(255),
        match_id UUID REFERENCES matches(match_id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confirmed_at TIMESTAMP
      );
    `);

    // Match Queue table (for HTTP polling matchmaking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS match_queue (
        queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(user_id) NOT NULL,
        stake DECIMAL(10, 4) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      );
    `);

    // Tap Events table (server-authoritative tap recording)
    await client.query(`
      CREATE TABLE IF NOT EXISTS tap_events (
        tap_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id UUID REFERENCES matches(match_id) NOT NULL,
        user_id UUID REFERENCES users(user_id) NOT NULL,
        client_timestamp BIGINT NOT NULL,
        server_timestamp BIGINT NOT NULL,
        reaction_ms INTEGER NOT NULL,
        is_valid BOOLEAN NOT NULL,
        disqualified BOOLEAN NOT NULL DEFAULT false,
        disqualification_reason VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Latency Samples table (for network compensation)
    await client.query(`
      CREATE TABLE IF NOT EXISTS latency_samples (
        sample_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(user_id) NOT NULL,
        latency_ms INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(player1_id, player2_id);
      CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_match ON transactions(match_id);
      CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
      CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_queue_user ON match_queue(user_id);
      CREATE INDEX IF NOT EXISTS idx_queue_status ON match_queue(status, stake);
      CREATE INDEX IF NOT EXISTS idx_queue_expires ON match_queue(expires_at);
      CREATE INDEX IF NOT EXISTS idx_tap_events_match ON tap_events(match_id);
      CREATE INDEX IF NOT EXISTS idx_tap_events_user ON tap_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_latency_samples_user ON latency_samples(user_id);
      CREATE INDEX IF NOT EXISTS idx_latency_samples_created ON latency_samples(created_at);
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
  } catch (error: any) {
    console.error('Migration failed:', error);
    
    // Provide actionable guidance for common connection errors
    if (error.message) {
      const errorMsg = error.message.toLowerCase();
      
      if (errorMsg.includes('no pg_hba.conf entry') || errorMsg.includes('no encryption')) {
        console.error('\n❌ Connection Error: SSL/Encryption Required\n');
        console.error('Your Postgres instance requires SSL connections.');
        console.error('\n📋 Solutions:');
        console.error('  1. Enable SSL in your environment:');
        console.error('     DATABASE_SSL=true npm run migrate');
        console.error('     or add DATABASE_SSL=true to your .env file');
        console.error('');
        console.error('  2. For production (Heroku/managed Postgres):');
        console.error('     heroku config:set DATABASE_SSL=true');
        console.error('');
        console.error('  3. If you have a custom CA certificate:');
        console.error('     DATABASE_SSL=true DATABASE_SSL_CA=/path/to/ca-cert.pem npm run migrate');
        console.error('');
      }
      
      if (errorMsg.includes('connection refused') || errorMsg.includes('econnrefused')) {
        console.error('\n❌ Connection Error: Cannot reach database\n');
        console.error('📋 Check:');
        console.error('  1. Is your DATABASE_URL correct?');
        console.error('  2. Is the database server running?');
        console.error('  3. Is your IP address allowed in the database firewall/security group?');
        console.error('');
      }
      
      if (errorMsg.includes('authentication') || errorMsg.includes('password')) {
        console.error('\n❌ Authentication Error\n');
        console.error('📋 Check:');
        console.error('  1. Verify your DATABASE_URL contains correct username/password');
        console.error('  2. Check if the database user exists and has proper permissions');
        console.error('');
      }
      
      if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
        console.error('\n❌ Connection Timeout\n');
        console.error('📋 Check:');
        console.error('  1. Is your IP address allowed in the database firewall/security group?');
        console.error('  2. Is the database accessible from your network?');
        console.error('  3. Are you behind a firewall or VPN?');
        console.error('');
      }
    }
    
    const repoUrl = process.env.REPO_URL || 'https://github.com/Goutamdhanani/blink-battle';
    console.error(`💡 For more help, see: ${repoUrl}#troubleshooting\n`);
    process.exit(1);
  }
};

if (require.main === module) {
  migrate();
}
