# Database Migration & Rollback Plans

## Overview
This document provides comprehensive migration and rollback plans for the Blink Battle database updates required to fix critical issues.

## Required Migrations

### Migration 011: Claim Security Enhancements
**File**: `backend/src/config/migrations/011_claim_security_enhancements.ts`

**Purpose**: 
- Add security columns to prevent double-claim exploits
- Add claim tracking columns for audit and security

**Changes**:
- Adds `claim_transaction_hash` to matches table
- Adds `claim_timestamp` to claims table
- Adds security constraints

**Status**: ✅ Included in production migrations

### Migration 012: Add Matches Total Claimed Amount
**File**: `backend/src/config/migrations/012_add_matches_total_claimed_amount.ts`

**Purpose**:
- Track total claimed amount per match to prevent over-claiming
- Ensure users cannot claim more than 2x their original stake

**Changes**:
- Adds `total_claimed_amount BIGINT` column to matches table (stores wei amounts)
- Adds index for efficient lookups
- Backfills NULL values to 0

**Status**: ✅ Included in production migrations

## Migration Execution Plan

### Pre-Migration Checklist
- [ ] Backup database before migration
- [ ] Verify all application servers are running the latest code
- [ ] Check database connection and credentials
- [ ] Review current schema state
- [ ] Ensure sufficient disk space for new columns/indexes

### Execution Steps

#### 1. Production Migration (Recommended)
Run all migrations using the production migration runner:

```bash
cd backend
npm run migrate:production
```

This will:
- Run migrations 011 and 012 (if not already applied)
- Use transactions for atomic updates
- Log detailed progress
- Automatically handle rollback on error

#### 2. Individual Migration (Advanced)
If you need to run migrations individually:

```bash
cd backend
ts-node src/config/productionMigrations.ts up
```

#### 3. Verify Migration Success
After running migrations, verify with:

```bash
# Check if columns exist
psql $DATABASE_URL -c "
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'matches' 
    AND column_name IN ('total_claimed_amount', 'claim_transaction_hash');
"
```

Expected output should show both columns exist.

### Post-Migration Verification

1. **Check Application Logs**: Ensure no errors during startup
2. **Test Claim Flow**: Try claiming winnings on a test match
3. **Verify Rate Limits**: Test API endpoints are properly rate-limited
4. **Monitor Performance**: Watch for any slow queries or issues

## Rollback Plan

### When to Rollback
- Migration fails with unrecoverable error
- Critical application bug discovered after migration
- Data corruption detected
- Unexpected performance degradation

### Rollback Steps

#### Automatic Rollback
The migration runner uses transactions and will automatically rollback on failure.

#### Manual Rollback
If you need to manually rollback all migrations:

```bash
cd backend
npm run migrate:rollback
```

Or using ts-node directly:
```bash
ts-node src/config/productionMigrations.ts down
```

#### Selective Rollback (Migration 012 only)
If you only need to rollback migration 012:

```sql
-- Connect to database
psql $DATABASE_URL

BEGIN;

-- Drop index
DROP INDEX IF EXISTS idx_matches_total_claimed_amount;

-- Drop column
ALTER TABLE matches DROP COLUMN IF EXISTS total_claimed_amount CASCADE;

COMMIT;
```

#### Selective Rollback (Migration 011 only)
If you only need to rollback migration 011:

```sql
-- Connect to database
psql $DATABASE_URL

BEGIN;

-- Drop columns added in migration 011
ALTER TABLE matches DROP COLUMN IF EXISTS claim_transaction_hash CASCADE;
ALTER TABLE claims DROP COLUMN IF EXISTS claim_timestamp CASCADE;

COMMIT;
```

### Post-Rollback Steps

1. **Restore Application**: Deploy previous application version if needed
2. **Clear Caches**: Clear Redis cache if applicable
3. **Verify Functionality**: Test critical flows (claims, refunds, matchmaking)
4. **Monitor Logs**: Watch for errors or issues
5. **Notify Team**: Communicate rollback to stakeholders

## Testing Plan

### Pre-Production Testing

1. **Test in Staging Environment**:
   ```bash
   # Set staging DATABASE_URL
   export DATABASE_URL="postgresql://staging_db_url"
   npm run migrate:production
   ```

2. **Run Application Tests**:
   ```bash
   npm test
   ```

3. **Manual Testing Checklist**:
   - [ ] User can claim winnings successfully
   - [ ] Idempotency works (retry claim returns same result)
   - [ ] Cannot claim more than 2x stake
   - [ ] Matchmaking timeout works (1 minute)
   - [ ] Refund with 3% deduction works
   - [ ] Rate limiting works
   - [ ] Reaction time logic (2-5s after 2s wait) works

### Load Testing
Test with realistic load to ensure performance:
- 100 concurrent users
- 1000 requests/minute
- Multiple stake tiers

## Recovery Procedures

### Data Corruption
If migration causes data corruption:

1. **Stop All Services**: Prevent further corruption
2. **Restore from Backup**: Use most recent backup before migration
3. **Verify Backup Integrity**: Check restored data
4. **Investigate Root Cause**: Analyze migration failure
5. **Fix and Re-test**: Update migration, test in staging
6. **Re-apply Migration**: Run corrected migration

### Performance Issues
If migration causes performance degradation:

1. **Identify Slow Queries**: Check PostgreSQL slow query log
2. **Add Missing Indexes**: Create indexes on frequently queried columns
3. **Optimize Queries**: Update queries to use new indexes
4. **Monitor**: Continue monitoring after fixes

## Monitoring Checklist

After migration, monitor these metrics for 24 hours:

- [ ] Database CPU usage
- [ ] Query response times
- [ ] API endpoint latencies
- [ ] Error rates in application logs
- [ ] Claim success rate
- [ ] Refund success rate
- [ ] Matchmaking timeout rate

## Support Contacts

- **Database Issues**: DBA team
- **Application Issues**: Backend team
- **Critical Failures**: On-call engineer

## Appendix A: Migration Files

### Migration 011 Summary
```typescript
// Adds security columns for claim tracking
- matches.claim_transaction_hash (VARCHAR)
- claims.claim_timestamp (TIMESTAMP)
```

### Migration 012 Summary
```typescript
// Adds total claimed amount tracking
- matches.total_claimed_amount (BIGINT)
- Index on total_claimed_amount
```

## Appendix B: Database Schema Changes

### Before Migration
```sql
-- matches table (relevant columns)
CREATE TABLE matches (
  match_id UUID PRIMARY KEY,
  claim_status VARCHAR(50),
  -- ... other columns
);
```

### After Migration
```sql
-- matches table (relevant columns)
CREATE TABLE matches (
  match_id UUID PRIMARY KEY,
  claim_status VARCHAR(50),
  claim_transaction_hash VARCHAR(66),  -- NEW (migration 011)
  total_claimed_amount BIGINT DEFAULT 0, -- NEW (migration 012)
  -- ... other columns
);

CREATE INDEX idx_matches_total_claimed_amount 
ON matches(total_claimed_amount) 
WHERE total_claimed_amount > 0;
```

## Version History

- **v1.0** (2026-01-05): Initial migration plan
- Migrations 011, 012 added to production runner
- Matchmaking timeout job implemented
- Comprehensive rollback procedures documented
