import { PoolClient } from 'pg';

/**
 * Migration: Fix claims table numeric overflow
 * 
 * PROBLEM: Claims table stores amounts in wei (18 decimals) but columns are NUMERIC(18,8)
 * - Max value for NUMERIC(18,8): ~10^10 (10 billion)
 * - Typical wei amount: 180000000000000000 (180 quadrillion)
 * - This causes "numeric field overflow" error
 * 
 * SOLUTION: Change columns to VARCHAR(78) to store wei amounts as strings
 * - VARCHAR(78) can store up to 2^256 in decimal (max uint256)
 * - No precision loss, supports arbitrary large amounts
 */
export async function up(client: PoolClient): Promise<void> {
  console.log('Running migration: 007_fix_claims_numeric_overflow');

  // Check if claims table exists
  const tableExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'claims'
    );
  `);

  if (!tableExists.rows[0].exists) {
    console.log('⚠️ Claims table does not exist, skipping migration');
    return;
  }

  // Alter column types from NUMERIC to VARCHAR
  // This is safe because we're widening the type (no data loss)
  const columnsToFix = ['amount', 'platform_fee', 'net_payout'];

  for (const column of columnsToFix) {
    // Check current column type
    const columnInfo = await client.query(`
      SELECT data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'claims' AND column_name = $1
    `, [column]);

    if (columnInfo.rows.length === 0) {
      console.log(`⚠️ Column ${column} does not exist in claims table, skipping`);
      continue;
    }

    const currentType = columnInfo.rows[0].data_type;
    
    if (currentType === 'character varying' || currentType === 'varchar') {
      console.log(`✅ Column ${column} already VARCHAR, skipping`);
      continue;
    }

    // Convert existing numeric values to strings, then change type
    await client.query(`
      ALTER TABLE claims 
      ALTER COLUMN ${column} TYPE VARCHAR(78) 
      USING ${column}::text;
    `);

    console.log(`✅ Changed claims.${column} from ${currentType} to VARCHAR(78)`);
  }

  console.log('✅ Migration 007_fix_claims_numeric_overflow completed');
}

export async function down(client: PoolClient): Promise<void> {
  console.log('Rolling back migration: 007_fix_claims_numeric_overflow');
  
  // Rollback: Convert back to NUMERIC(18,8)
  // WARNING: This may fail if values exceed NUMERIC(18,8) capacity
  const columnsToRevert = ['amount', 'platform_fee', 'net_payout'];

  for (const column of columnsToRevert) {
    try {
      await client.query(`
        ALTER TABLE claims 
        ALTER COLUMN ${column} TYPE NUMERIC(18,8) 
        USING ${column}::numeric;
      `);
      console.log(`✅ Reverted claims.${column} to NUMERIC(18,8)`);
    } catch (error: any) {
      console.error(`⚠️ Failed to revert claims.${column}:`, error.message);
      console.error('   This is expected if table contains wei amounts that exceed NUMERIC(18,8)');
    }
  }
  
  console.log('✅ Rolled back migration 007_fix_claims_numeric_overflow');
}
