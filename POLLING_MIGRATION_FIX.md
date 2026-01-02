# HTTP Polling Migration - Column Addition Fix

## Overview
This migration adds missing database columns (`player1_ready`, `player2_ready`, `green_light_time`) required for HTTP polling matchmaking to work correctly.

## Problem
The production database may be missing these columns if it was created before the HTTP polling feature was added. This causes the `/api/match/ready` endpoint to fail with:
```
column "player2_ready" of relation "matches" does not exist
```

## Solution
Run the column migration script to safely add missing columns with proper defaults.

## Running the Migration

### Prerequisites
- Node.js 18+ installed
- DATABASE_URL environment variable configured
- Appropriate database permissions

### Steps

1. **Check if migration is needed:**
   ```bash
   psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='matches' AND column_name IN ('player1_ready', 'player2_ready', 'green_light_time');"
   ```
   
   If any columns are missing, proceed with the migration.

2. **Run the migration:**
   ```bash
   cd backend
   npm run migrate:columns
   ```

3. **Verify columns were added:**
   ```bash
   psql $DATABASE_URL -c "\d matches"
   ```
   
   You should see:
   - `player1_ready boolean DEFAULT false`
   - `player2_ready boolean DEFAULT false`
   - `green_light_time bigint`

## Alternative: Manual Migration
If you prefer to run the migration manually:

```sql
-- Add player1_ready column if missing
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player1_ready BOOLEAN DEFAULT false;

-- Add player2_ready column if missing
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player2_ready BOOLEAN DEFAULT false;

-- Add green_light_time column if missing
ALTER TABLE matches ADD COLUMN IF NOT EXISTS green_light_time BIGINT;
```

## Verification
After running the migration, test the `/api/match/ready` endpoint:

```bash
curl -X POST https://your-api.com/api/match/ready \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"matchId": "YOUR_MATCH_ID"}'
```

The response should be successful (200 OK) instead of a 500 error.

## Rollback
If you need to rollback:

```sql
ALTER TABLE matches DROP COLUMN IF EXISTS player1_ready;
ALTER TABLE matches DROP COLUMN IF EXISTS player2_ready;
ALTER TABLE matches DROP COLUMN IF EXISTS green_light_time;
```

**Note:** Only rollback if you're reverting to WebSocket-based matchmaking.

## Polling Frequency Changes

The migration also includes frontend changes to reduce polling frequency:

- **Matchmaking status polling**: Reduced from 1s to 5s
- **Match state polling**: Reduced from 500ms to 2s during waiting phase
- **Active gameplay polling**: Remains at 100ms for smooth UI during countdown/signal

These changes significantly reduce server load while maintaining a responsive user experience.

## Monitoring

After deploying, monitor:
1. Request rate logs (printed every minute)
2. `/api/matchmaking/status/:userId` request frequency
3. Both players successfully reaching "get ready" state
4. No 500 errors on `/api/match/ready`

Example log output:
```
[Request Stats] Last minute: 245 requests from 12 users
  GET /api/matchmaking/status/:userId: 120 requests
  GET /api/match/state/:matchId: 89 requests
  POST /api/match/ready: 24 requests
```
