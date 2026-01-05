/**
 * Phase 2 Migration Script
 * Applies Phase 2 schema enhancements for brain training expansion
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_SSL = process.env.DATABASE_SSL === 'true';

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting Phase 2 Migration...\n');
    
    // Read the SQL schema file
    const schemaPath = path.join(__dirname, 'phase2-schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    
    // Execute the schema
    console.log('📝 Applying Phase 2 schema...');
    await client.query(schemaSql);
    console.log('✅ Phase 2 schema applied successfully\n');
    
    // Verify critical tables were created
    const verifyQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'xp_levels', 'achievements', 'user_achievements',
          'daily_stats', 'streak_history', 'cached_stats', 'reaction_trends'
        )
      ORDER BY table_name;
    `;
    
    const result = await client.query(verifyQuery);
    console.log('📊 Verified tables:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });
    
    // Check if columns were added to users table
    const columnsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
        AND column_name IN (
          'username', 'avatar_url', 'xp', 'level', 'rank_badge',
          'current_streak', 'longest_streak', 'last_play_date',
          'total_play_time_ms', 'cognitive_index', 'current_theme'
        )
      ORDER BY column_name;
    `;
    
    const columnsResult = await client.query(columnsQuery);
    console.log('\n📊 Verified user columns:');
    columnsResult.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name}`);
    });
    
    // Count achievements
    const achievementsCountQuery = 'SELECT COUNT(*) as count FROM achievements';
    const achievementsCount = await client.query(achievementsCountQuery);
    console.log(`\n🏆 Achievements loaded: ${achievementsCount.rows[0].count}`);
    
    // Count XP levels
    const xpLevelsCountQuery = 'SELECT COUNT(*) as count FROM xp_levels';
    const xpLevelsCount = await client.query(xpLevelsCountQuery);
    console.log(`📈 XP levels configured: ${xpLevelsCount.rows[0].count}`);
    
    console.log('\n✨ Phase 2 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration error:', error);
    process.exit(1);
  });
