# Production Deployment Checklist

Use this checklist to verify your production deployment is working correctly after implementing the CORS and authentication fixes.

## Pre-Deployment Configuration

### Backend Environment Variables

- [ ] `APP_ID` is set to your Worldcoin app ID
- [ ] `DEV_PORTAL_API_KEY` is set with valid API key
- [ ] `PLATFORM_WALLET_ADDRESS` is set to valid Ethereum address (0x...)
- [ ] `JWT_SECRET` is set to a strong random string (not default)
- [ ] `DATABASE_URL` is set (automatically set by Heroku Postgres)
- [ ] `DATABASE_SSL` is set to `true` for production
- [ ] `NODE_ENV` is set to `production`
- [ ] **CORS Configuration** - Choose one approach:
  - [ ] Option A: `ALLOWED_ORIGINS` set to comma-separated list (e.g., `https://www.blumea.me,https://blumea.me`)
  - [ ] Option B: `FRONTEND_URL` and optionally `FRONTEND_URL_PRODUCTION` set

### Frontend Environment Variables

- [ ] `VITE_API_URL` is set to backend URL (e.g., `https://your-backend.herokuapp.com`)
- [ ] `VITE_APP_ID` matches backend `APP_ID`
- [ ] `VITE_PLATFORM_WALLET_ADDRESS` matches backend `PLATFORM_WALLET_ADDRESS`

## Post-Deployment Verification

### 1. CORS Verification

#### Test from production frontend:

- [ ] Open browser DevTools Console
- [ ] Navigate to your production frontend (e.g., `https://www.blumea.me`)
- [ ] Check console for successful API connection
- [ ] Verify no CORS errors in console

#### Expected Console Output:
```
[API] Using API URL: https://your-backend.herokuapp.com
```

#### Check Backend Logs:
```bash
heroku logs --tail
```

Expected output on startup:
```
✅ CORS allowed origins: [ 'https://www.blumea.me', ... ]
```

#### If CORS errors appear:

Check backend logs for:
```
[CORS] Blocked request from origin: https://www.blumea.me
[CORS] Allowed origins are: ...
```

**Fix:** Add the blocked origin to `ALLOWED_ORIGINS`:
```bash
heroku config:set ALLOWED_ORIGINS=https://www.blumea.me,https://blumea.me
```

### 2. Authentication Flow

Test the complete authentication flow:

- [ ] Click "Sign In with World App" button
- [ ] Verify SIWE wallet authentication works
- [ ] Check localStorage has `token` and `user` items
- [ ] Verify no 401 errors in console
- [ ] Dashboard loads successfully

#### Check Backend Logs:
```bash
heroku logs --tail | grep Auth
```

Expected:
```
[Auth] Request authenticated for user: ... to /api/auth/me
```

### 3. API Endpoints

Test each protected endpoint:

- [ ] `/api/auth/nonce` - GET (no auth required)
  ```bash
  curl -H "Origin: https://www.blumea.me" https://your-backend.herokuapp.com/api/auth/nonce
  ```
  Expected: `{"nonce":"..."}`

- [ ] `/api/auth/me` - GET (requires auth)
  - Navigate to Dashboard
  - Check browser Network tab
  - Verify 200 response with user data
  - Check Authorization header is present

- [ ] `/api/leaderboard` - GET (no auth required)
  - Navigate to Leaderboard
  - Verify leaderboard loads
  - Check Network tab for 200 response

- [ ] `/api/matches/history` - GET (requires auth)
  - Navigate to Match History
  - Verify match history loads
  - Check for Authorization header

### 4. Payment Flow (PvP Mode)

This is the most critical test for the 401 fix:

- [ ] Navigate to PvP mode from Dashboard
- [ ] Select a stake amount (e.g., 0.1 WLD)
- [ ] Click "Find Opponent"
- [ ] Verify payment initiation succeeds (no 401)
- [ ] World App pay drawer opens
- [ ] Complete or cancel payment
- [ ] No errors in console

#### Expected Flow:

1. Frontend calls `/api/initiate-payment` with Authorization header
2. Backend creates payment reference and returns ID
3. Frontend opens MiniKit Pay command
4. User approves in World App
5. Frontend calls `/api/confirm-payment` with Authorization header
6. Backend verifies with Developer Portal
7. Payment confirmed

#### Check Backend Logs:
```bash
heroku logs --tail | grep Payment
```

Expected:
```
[Payment] Initiated payment reference=... userId=... amount=0.1 status=pending
[Payment] Verifying transaction reference=... transactionId=...
[Payment] Payment confirmed reference=... transactionId=...
```

#### If 401 errors occur:

Check:
1. **Frontend logs** (Console):
   ```
   [MiniKit] 401 Authentication error - token invalid or expired
   ```

2. **Backend logs**:
   ```bash
   heroku logs --tail | grep -E "(CORS|Auth)"
   ```

3. **Common issues**:
   - CORS blocking Authorization header → Add origin to `ALLOWED_ORIGINS`
   - Expired JWT token → User needs to sign in again
   - Missing Authorization header → Frontend not sending token

### 5. WebSocket Connection

Test real-time functionality:

- [ ] Start matchmaking (Free or PvP mode)
- [ ] Check browser console for WebSocket connection
- [ ] Verify "Connected" status in UI
- [ ] Join queue and wait for match
- [ ] Verify countdown starts when opponent found

#### Expected Console Output:
```
[WebSocket] Connected to server
```

#### Check Backend Logs:
```bash
heroku logs --tail | grep WebSocket
```

Expected:
```
Client connected: ...
Multiplayer matchmaking: Player ... joining queue
```

#### If WebSocket fails:

Check:
1. CORS configuration includes frontend origin
2. Token is valid and being sent
3. Backend is running and accessible

### 6. UI Consistency Check

Verify UI is consistent across modes:

- [ ] Practice Mode uses ReactionTestUI component
- [ ] Battle Mode uses ReactionTestUI component
- [ ] Both modes show F1-style lights
- [ ] Both modes have same visual style
- [ ] Responsive on mobile (World App)

### 7. Security Verification

- [ ] JWT_SECRET is not default value
- [ ] No secrets in frontend code or console logs
- [ ] HTTPS enabled on both frontend and backend
- [ ] Authorization headers sent only over HTTPS
- [ ] Sensitive data not logged in production

## Troubleshooting Commands

### View Backend Logs
```bash
# Real-time logs
heroku logs --tail

# Filter for CORS issues
heroku logs --tail | grep CORS

# Filter for authentication issues
heroku logs --tail | grep Auth

# Filter for payment issues
heroku logs --tail | grep Payment

# View recent errors
heroku logs -n 200 | grep -i error
```

### Check Environment Variables
```bash
# View all config
heroku config

# Check specific variables
heroku config:get ALLOWED_ORIGINS
heroku config:get FRONTEND_URL
heroku config:get APP_ID
```

### Test CORS with curl
```bash
# Test OPTIONS preflight
curl -X OPTIONS \
  -H "Origin: https://www.blumea.me" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization" \
  -v \
  https://your-backend.herokuapp.com/api/auth/nonce

# Expected: 204 No Content with CORS headers

# Test GET request
curl -X GET \
  -H "Origin: https://www.blumea.me" \
  -v \
  https://your-backend.herokuapp.com/api/auth/nonce

# Expected: 200 OK with nonce data
```

### Fix CORS Issues
```bash
# Add missing origin
heroku config:set ALLOWED_ORIGINS=https://www.blumea.me,https://blumea.me

# Restart to apply changes (usually automatic)
heroku restart
```

## Success Criteria

All checks should pass:

✅ **CORS**: No CORS errors in browser console  
✅ **Authentication**: Users can sign in and access protected endpoints  
✅ **Payments**: Payment flow completes without 401 errors  
✅ **WebSocket**: Real-time connection works  
✅ **UI**: Consistent styling across Practice and Battle modes  
✅ **Security**: No sensitive data exposed, HTTPS enforced  

## Rollback Plan

If critical issues are found:

```bash
# View recent releases
heroku releases

# Rollback to previous version
heroku rollback v<previous-version>

# Check logs after rollback
heroku logs --tail
```

## Support Resources

- [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) - Full deployment guide
- [AUTH_DEBUGGING.md](./AUTH_DEBUGGING.md) - Authentication debugging guide
- [API_REFERENCE.md](./API_REFERENCE.md) - API endpoint documentation
- [Worldcoin Developer Portal](https://developer.worldcoin.org) - MiniKit documentation
- [Heroku Dashboard](https://dashboard.heroku.com) - App monitoring and logs

---

**Last Updated:** 2024-12-27
