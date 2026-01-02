import pool from '../config/database';

/**
 * Verify database schema has all required columns for HTTP polling
 */
export const verifyPollingSchema = async (): Promise<{
  valid: boolean;
  missingColumns: string[];
  details: string;
}> => {
  try {
    const requiredColumns = [
      { table: 'matches', column: 'player1_ready' },
      { table: 'matches', column: 'player2_ready' },
      { table: 'matches', column: 'green_light_time' },
    ];

    const missingColumns: string[] = [];

    for (const { table, column } of requiredColumns) {
      const result = await pool.query(
        `SELECT column_name 
         FROM information_schema.columns 
         WHERE table_name=$1 AND column_name=$2`,
        [table, column]
      );

      if (result.rows.length === 0) {
        missingColumns.push(`${table}.${column}`);
      }
    }

    if (missingColumns.length > 0) {
      return {
        valid: false,
        missingColumns,
        details: `Missing columns: ${missingColumns.join(', ')}. Run 'npm run migrate:columns' to add them.`,
      };
    }

    return {
      valid: true,
      missingColumns: [],
      details: 'All required columns exist',
    };
  } catch (error: any) {
    return {
      valid: false,
      missingColumns: [],
      details: `Database check failed: ${error.message}`,
    };
  }
};
