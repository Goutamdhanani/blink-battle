import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

/**
 * Determines SSL configuration for Postgres connection
 * Priority order:
 * 1. DATABASE_SSL environment variable (true/false/require)
 * 2. NODE_ENV === 'production' (defaults to SSL enabled)
 * 3. false (development default)
 */
function getSSLConfig(): PoolConfig['ssl'] {
  const databaseSSL = process.env.DATABASE_SSL?.toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Explicit DATABASE_SSL setting takes precedence
  if (databaseSSL !== undefined) {
    if (databaseSSL === 'false' || databaseSSL === '0') {
      return false;
    }
    
    if (databaseSSL === 'true' || databaseSSL === '1' || databaseSSL === 'require') {
      const sslConfig: any = { rejectUnauthorized: false };
      
      // Support custom CA certificate if provided
      const caCertPath = process.env.DATABASE_SSL_CA;
      if (caCertPath) {
        try {
          sslConfig.ca = fs.readFileSync(caCertPath, 'utf8');
          sslConfig.rejectUnauthorized = true;
        } catch (error) {
          console.warn(`Warning: Failed to read DATABASE_SSL_CA file at ${caCertPath}:`, error);
        }
      }
      
      return sslConfig;
    }
  }
  
  // Default behavior: enable SSL in production
  if (isProduction) {
    return { rejectUnauthorized: false };
  }
  
  return false;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getSSLConfig(),
});

export default pool;
