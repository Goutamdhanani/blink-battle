# Production Deployment Guide - Stability Fixes

## 🚀 Pre-Deployment Checklist

### 1. Environment Variables

Ensure all required environment variables are set in production:

**Backend (Heroku/Server)**
```bash
# Required
APP_ID=app_39ba2bf031c9925d1ba3521a305568d8
DEV_PORTAL_API_KEY=<your_dev_portal_api_key>
PLATFORM_WALLET_ADDRESS=0x645eeae14C09F8BE1E3C1062f54f23bF68573415
JWT_SECRET=<your_jwt_secret>
DATABASE_URL=<postgres_connection_string>
REDIS_URL=<redis_connection_string>

# Contracts
ESCROW_CONTRACT_ADDRESS=0x29B33908F05620826585ea5b34aDC4b688dD0930
BACKEND_PRIVATE_KEY=<escrow_admin_private_key>
WORLD_CHAIN_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public

# Token
WLD_TOKEN_ADDRESS=0x2cFc85d8E48F8EAb294be644d9E25C3030863003

# Optional but recommended
PAYMENT_WORKER_INTERVAL_MS=10000
DATABASE_SSL=true
NODE_ENV=production
```

**Frontend (Vercel/Static Host)**
```bash
VITE_API_URL=https://blink-battle-7dcdf0aa361a.herokuapp.com/
VITE_APP_ID=app_39ba2bf031c9925d1ba3521a305568d8
VITE_PLATFORM_WALLET_ADDRESS=0x645eeae14C09F8BE1E3C1062f54f23bF68573415
VITE_ESCROW_CONTRACT_ADDRESS=0x29B33908F05620826585ea5b34aDC4b688dD0930
VITE_WLD_TOKEN_ADDRESS=0x2cFc85d8E48F8EAb294be644d9E25C3030863003
```

### 2. Database Migrations

**CRITICAL: Run migrations in this order**

```bash
# Connect to production database
heroku pg:psql --app blink-battle

# Or locally:
# DATABASE_URL=<prod_url> npm run migrate:production

# Step 1: Run base table migrations (if not already run)
npm run migrate

# Step 2: Run column migrations (if not already run)
npm run migrate:columns

# Step 3: Run production migrations (NEW)
npm run migrate:production

# Or manually with ts-node:
ts-node backend/src/config/productionMigrations.ts up
```

**Verify migrations:**
```sql
-- Check payment_intents table exists
SELECT * FROM payment_intents LIMIT 1;

-- Check matches has new columns
SELECT idempotency_key, player1_wallet, player2_wallet 
FROM matches LIMIT 1;

-- Check tap_events unique constraint
SELECT constraint_name 
FROM information_schema.table_constraints 
WHERE table_name='tap_events' 
  AND constraint_name='tap_events_match_user_unique';
```

### 3. Code Deployment

**Backend**
```bash
git push heroku copilot/fix-gameplay-and-payment-stability:main

# Or if using main branch:
git checkout copilot/fix-gameplay-and-payment-stability
git push origin main
```

**Frontend**
```bash
# Vercel auto-deploys from git
# Ensure environment variables are set in Vercel dashboard
# Deploy from: copilot/fix-gameplay-and-payment-stability branch
```

---

## 📋 Post-Deployment Verification

### 1. Health Checks

```bash
# Backend health
curl https://blink-battle-7dcdf0aa361a.herokuapp.com/health

# Schema verification
curl https://blink-battle-7dcdf0aa361a.herokuapp.com/health/schema

# Expected: {"valid": true, "schema": {...}}
```

### 2. Payment Worker

Check Heroku logs for worker startup:

```bash
heroku logs --tail --app blink-battle | grep "Payment worker"

# Expected output:
# ✅ Payment worker started (interval: 10000ms)
```

### 3. Critical Endpoint Tests

```bash
# Test payment flow (requires auth)
# 1. Sign in to get token
# 2. Create payment intent
curl -X POST https://blink-battle-7dcdf0aa361a.herokuapp.com/api/initiate-payment \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 0.1}'

# 3. Check stake status
curl https://blink-battle-7dcdf0aa361a.herokuapp.com/api/match/stake-status/<matchId> \
  -H "Authorization: Bearer <token>"
```

---

## 🎯 Smoke Test Scenarios

### Scenario 1: Payment Flow
1. Open app in World App
2. Sign in
3. Join matchmaking with 0.1 WLD stake
4. When matched, click "Pay Now"
5. Approve payment in World App
6. **Verify**: Payment confirmed, stake marked
7. **Verify**: Game does NOT start until opponent pays
8. **Verify**: No "undefined wallet" errors in logs

### Scenario 2: Duplicate Tap
1. Start a match
2. Wait for green light
3. Open browser DevTools
4. Send tap request twice in quick succession
5. **Verify**: Only one tap recorded
6. **Verify**: Second request returns existing tap
7. **Verify**: No 500 errors

### Scenario 3: Timestamp Validation
1. Start a match
2. Wait for green light
3. Send tap with invalid clientTimestamp (e.g., -1)
4. **Verify**: Tap recorded with server timestamp
5. **Verify**: No "Invalid time value" error
6. **Verify**: Reaction time clamped to valid range

### Scenario 4: Polling Stops
1. Complete a match
2. Open DevTools Network tab
3. **Verify**: No more polling requests after match completes
4. **Verify**: Interval cleared immediately

### Scenario 5: Leaderboard
1. Navigate to leaderboard
2. **Verify**: No NaN values displayed
3. **Verify**: Null avgReactionTime shows as "--"
4. **Verify**: String avgReactionTime converts correctly

---

## 🚨 Rollback Plan

If critical issues arise:

### Quick Rollback
```bash
# Backend
git revert 0c6cf9d..HEAD
git push heroku main

# Frontend  
# Revert in Vercel dashboard or:
vercel rollback <previous-deployment-url>
```

### Database Rollback (if migrations cause issues)
```bash
# DANGER: This will drop tables/constraints
npm run migrate:rollback

# Or manually:
ts-node backend/src/config/productionMigrations.ts down
```

**Note**: Rollback payment_intents table will lose payment tracking data!

---

## 📊 Monitoring

### Key Metrics to Watch

1. **Payment Success Rate**
   - Query: `SELECT COUNT(*) FROM payment_intents WHERE normalized_status='confirmed'`
   - Alert if < 95%

2. **Worker Health**
   - Check Heroku logs for worker errors
   - Alert if worker crashes > 3 times/hour

3. **Match Completion Rate**
   - Query: `SELECT COUNT(*) FROM matches WHERE status='completed' AND created_at > NOW() - INTERVAL '1 hour'`
   - Compare to pending matches

4. **Error Rates**
   - Monitor `/api/match/tap` endpoint
   - Monitor `/api/match/ready` endpoint
   - Alert if error rate > 5%

### Log Queries

```bash
# Payment worker activity
heroku logs --tail | grep "PaymentWorker"

# Payment failures
heroku logs --tail | grep "Payment.*failed"

# Timestamp validation
heroku logs --tail | grep "Invalid.*time"

# Duplicate taps
heroku logs --tail | grep "Duplicate tap"

# Wallet validation
heroku logs --tail | grep "wallet not found"
```

---

## 🔧 Troubleshooting

### Issue: Payment worker not starting

**Symptoms**: No payment worker logs, payments stuck in pending

**Fix**:
1. Check `PAYMENT_WORKER_INTERVAL_MS` env var is set
2. Restart dyno: `heroku restart --app blink-battle`
3. Verify worker logs appear

### Issue: "Both players must deposit stake" error

**Symptoms**: Game won't start even though user paid

**Debug**:
```sql
-- Check payment intents
SELECT * FROM payment_intents 
WHERE match_id = '<matchId>' 
ORDER BY created_at DESC;

-- Check match stake status
SELECT player1_staked, player2_staked, player1_wallet, player2_wallet
FROM matches 
WHERE match_id = '<matchId>';
```

**Fix**:
- Ensure `confirmStake` endpoint was called
- Verify payment intent `normalized_status` is 'confirmed'
- Check both players called confirmStake

### Issue: "Invalid time value" errors

**Symptoms**: 500 errors on tap endpoint, crashes

**Debug**:
```sql
-- Check green_light_time values
SELECT match_id, green_light_time, status 
FROM matches 
WHERE green_light_time IS NOT NULL 
ORDER BY created_at DESC LIMIT 10;
```

**Fix**:
- Verify timestamp validation is in place (code deployed)
- Check for NULL or negative green_light_time values
- Run migration to add validation if needed

### Issue: Duplicate payments/charges

**Symptoms**: User charged twice for same match

**Debug**:
```sql
-- Check for duplicate payment intents
SELECT payment_reference, COUNT(*) 
FROM payment_intents 
GROUP BY payment_reference 
HAVING COUNT(*) > 1;

-- Check idempotency keys
SELECT idempotency_key, COUNT(*) 
FROM matches 
WHERE idempotency_key IS NOT NULL
GROUP BY idempotency_key 
HAVING COUNT(*) > 1;
```

**Fix**:
- Should not happen with current implementation
- If it does, investigate payment reference generation
- Check for race conditions in payment creation

---

## ✅ Success Criteria

Deployment is successful when:

- [ ] All health checks pass
- [ ] Payment worker running (logs confirm)
- [ ] Migrations completed without errors
- [ ] All 5 smoke test scenarios pass
- [ ] No critical errors in logs for 1 hour
- [ ] Payment success rate > 95%
- [ ] Match completion rate normal
- [ ] No "Invalid time value" errors
- [ ] No "undefined wallet" errors
- [ ] Polling stops on match completion
- [ ] Leaderboard displays correctly

---

## 📞 Support Contacts

- **Backend Issues**: Check Heroku logs, contact DevOps
- **Frontend Issues**: Check Vercel logs, contact Frontend team
- **Database Issues**: Check Postgres logs, contact DBA
- **Payment Issues**: Check MiniKit Developer Portal, contact Worldcoin support

---

## 📚 Related Documentation

- [TEST_ACCEPTANCE_CRITERIA.md](./TEST_ACCEPTANCE_CRITERIA.md) - Complete test cases
- [PRODUCTION_FIXES_SUMMARY.md](./PRODUCTION_FIXES_SUMMARY.md) - Summary of changes
- [API_REFERENCE.md](./API_REFERENCE.md) - API documentation
- [SECURITY_SUMMARY.md](./SECURITY_SUMMARY.md) - Security considerations
