import pool from './database';
import * as migration001 from './migrations/001_payment_intents';
import * as migration002 from './migrations/002_matches_idempotency';
import * as migration003 from './migrations/003_tap_events_unique';
import * as migration004 from './migrations/004_schema_validation';
import * as migration005 from './migrations/005_payment_intent_transaction_id_index';
import * as migration006 from './migrations/006_treasury_tables';
import * as migration007 from './migrations/007_fix_claims_numeric_overflow';
import * as migration008 from './migrations/008_add_game_randomness_columns';
import * as migration009 from './migrations/009_refund_and_disconnect_system';
import * as migration010 from './migrations/010_state_versioning_and_security';

interface Migration {
  name: string;
  up: (client: any) => Promise<void>;
  down: (client: any) => Promise<void>;
}

const migrations: Migration[] = [
  { name: '001_payment_intents', ...migration001 },
  { name: '002_matches_idempotency', ...migration002 },
  { name: '003_tap_events_unique', ...migration003 },
  { name: '004_schema_validation', ...migration004 },
  { name: '005_payment_intent_transaction_id_index', ...migration005 },
  { name: '006_treasury_tables', ...migration006 },
  { name: '007_fix_claims_numeric_overflow', ...migration007 },
  { name: '008_add_game_randomness_columns', ...migration008 },
  { name: '009_refund_and_disconnect_system', ...migration009 },
  { name: '010_state_versioning_and_security', ...migration010 },
];

/**
 * Run all pending migrations in sequence
 */
export async function runProductionMigrations(): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting production migrations...\n');
    
    await client.query('BEGIN');
    
    for (const migration of migrations) {
      console.log(`\n📦 Running migration: ${migration.name}`);
      await migration.up(client);
    }
    
    await client.query('COMMIT');
    console.log('\n✅ All migrations completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Rollback all migrations (for testing/development)
 */
export async function rollbackProductionMigrations(): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Rolling back production migrations...\n');
    
    await client.query('BEGIN');
    
    // Run rollbacks in reverse order
    for (const migration of migrations.slice().reverse()) {
      console.log(`\n📦 Rolling back migration: ${migration.name}`);
      await migration.down(client);
    }
    
    await client.query('COMMIT');
    console.log('\n✅ All migrations rolled back successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// CLI execution
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'up') {
    runProductionMigrations()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
      });
  } else if (command === 'down') {
    rollbackProductionMigrations()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Rollback failed:', error);
        process.exit(1);
      });
  } else {
    console.log('Usage: ts-node productionMigrations.ts [up|down]');
    console.log('  up   - Run all pending migrations');
    console.log('  down - Rollback all migrations');
    process.exit(1);
  }
}
