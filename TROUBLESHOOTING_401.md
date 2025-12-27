# 401 Error Troubleshooting Checklist

Quick reference guide for diagnosing and fixing "Request failed with status code 401" errors in PvP paid battles.

## Quick Diagnosis

### Step 1: Check Browser Console

Open browser DevTools (F12) → Console tab

**Look for:**
- `[API] Using API URL: ...` - Should show your backend URL, not localhost
- `[MiniKit] Initiating payment: ...` - Should appear when clicking "Find Opponent"
- Red error messages with "401" or "Unauthorized"

### Step 2: Check localStorage

Open DevTools → Application → Local Storage → your domain

**Verify:**
- [ ] `token` exists and has a value (long string starting with "eyJ...")
- [ ] `user` exists and has user data

**If missing:** User needs to sign in again

### Step 3: Check Backend Logs

```bash
# Heroku
heroku logs --tail | grep -E "Auth|Payment|CORS"

# Look for:
# ✅ [Auth] Request authenticated for user: ...
# ❌ [Auth] No token provided in request to /api/initiate-payment
# ❌ [Auth] Token verification failed
# ❌ [CORS] Blocked request from origin: ...
```

## Common Causes & Fixes

### Cause 1: CORS Not Configured

**Symptoms:**
- Browser console shows CORS error
- Backend logs show: `[CORS] Blocked request from origin: ...`

**Fix:**
```bash
# Set frontend URL in backend
heroku config:set FRONTEND_URL=https://your-frontend.vercel.app

# Restart backend
heroku restart
```

### Cause 2: Wrong API URL

**Symptoms:**
- Console shows: `[API] Using API URL: http://localhost:3001`
- In production, not localhost

**Fix:**
1. In Vercel/Netlify dashboard
2. Go to Settings → Environment Variables
3. Set `VITE_API_URL=https://your-backend.herokuapp.com`
4. Redeploy frontend

### Cause 3: Token Expired/Missing

**Symptoms:**
- localStorage has no `token` key
- Or token exists but still getting 401

**Fix:**
1. Clear localStorage
2. Refresh page
3. Sign in again with World App
4. Try payment again

### Cause 4: JWT Secret Mismatch

**Symptoms:**
- Token exists in localStorage
- Backend logs show: `[Auth] Token verification failed`

**Fix:**
```bash
# Check if JWT_SECRET is set
heroku config:get JWT_SECRET

# If not set or needs reset:
heroku config:set JWT_SECRET=$(openssl rand -base64 32)

# All users will need to sign in again
```

### Cause 5: Wrong Backend Environment

**Symptoms:**
- Frontend deployed to production
- But pointing to local/staging backend

**Fix:**
```bash
# Verify VITE_API_URL in production
# Should match your production backend URL

# Update in Vercel:
vercel env add VITE_API_URL production
# Enter: https://your-production-backend.herokuapp.com

# Redeploy
vercel --prod
```

## Step-by-Step Debugging

### Debug Step 1: Verify Auth Works

1. Open app in World App
2. Click "Sign In"
3. Complete authentication
4. Check console for:
   ```
   [API] Using API URL: https://...
   ```
5. Check localStorage for `token` and `user`
6. Navigate to Dashboard (should work without 401)

**If this fails:** Fix authentication first before testing payments

### Debug Step 2: Test Protected Endpoint

1. In browser console, run:
   ```javascript
   // Check if token exists
   localStorage.getItem('token')
   
   // Should return a long string starting with "eyJ..."
   ```

2. Try accessing a protected endpoint:
   ```javascript
   fetch('https://your-backend.herokuapp.com/api/auth/me', {
     headers: {
       'Authorization': `Bearer ${localStorage.getItem('token')}`
     }
   }).then(r => r.json()).then(console.log)
   ```

3. Should return user data, not 401

**If this fails:** Token or backend auth is broken

### Debug Step 3: Test Payment Initiation

1. Open DevTools → Network tab
2. Navigate to PvP mode
3. Click "Find Opponent"
4. Watch Network tab for `/api/initiate-payment` request
5. Check request headers - should include `Authorization: Bearer ...`
6. Check response - should be 200 with `{"success":true,"id":"..."}`

**If this fails:** Problem is in payment initiation

### Debug Step 4: Enable Debug Mode

Add `?debug=1` to URL:
```
https://your-frontend.vercel.app/?debug=1
```

Debug panel shows:
- ✅ API URL being used
- ✅ MiniKit installation status
- ✅ Auth flow steps
- ✅ Request IDs for correlation

Cross-reference Request IDs with backend logs:
```bash
heroku logs --tail | grep "request-id"
```

## Production Configuration Checklist

Before deploying to production, verify:

### Backend (Heroku)

```bash
# Check all required env vars are set
heroku config | grep -E "APP_ID|JWT_SECRET|FRONTEND_URL|PLATFORM_WALLET"

# Required:
# ✅ APP_ID=app_staging_xxxxx
# ✅ DEV_PORTAL_API_KEY=key_xxxxx
# ✅ PLATFORM_WALLET_ADDRESS=0x...
# ✅ JWT_SECRET=long_random_string
# ✅ FRONTEND_URL=https://your-frontend.vercel.app
# ✅ DATABASE_SSL=true
```

### Frontend (Vercel)

```bash
# Check in Vercel dashboard:
# Settings → Environment Variables

# Required:
# ✅ VITE_API_URL=https://your-backend.herokuapp.com
# ✅ VITE_APP_ID=app_staging_xxxxx (must match backend APP_ID)
# ✅ VITE_PLATFORM_WALLET_ADDRESS=0x... (must match backend)
```

### Developer Portal

1. Go to developer.worldcoin.org
2. Check your app settings:
   - ✅ Redirect URLs include production frontend URL
   - ✅ Allowed origins include production frontend URL
   - ✅ API key is valid and has transaction verification permission

## Emergency Fixes

### Quick Fix 1: Reset Everything

```bash
# Backend
heroku config:set JWT_SECRET=$(openssl rand -base64 32)
heroku restart

# Frontend - clear all user sessions
# Users will need to sign in again
```

### Quick Fix 2: Enable Debug Logging

```bash
# Backend
heroku config:set DEBUG_AUTH=true
heroku logs --tail

# Try payment flow again
# Watch logs for detailed error messages
```

### Quick Fix 3: Verify CORS Live

```bash
# Test CORS from command line
curl -H "Origin: https://your-frontend.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Authorization" \
     -X OPTIONS \
     https://your-backend.herokuapp.com/api/initiate-payment \
     -v

# Should return:
# Access-Control-Allow-Origin: https://your-frontend.vercel.app
# Access-Control-Allow-Credentials: true
```

## Still Having Issues?

1. **Check Recent Changes:**
   - Did you redeploy recently?
   - Did environment variables change?
   - Did backend or frontend URLs change?

2. **Compare Working vs Broken:**
   - Does it work in development but not production?
   - Does it work in staging but not production?
   - Did it work before? What changed?

3. **Ask for Help:**
   - Include browser console output
   - Include backend logs (with sensitive data redacted)
   - Include environment variable names (not values)
   - Describe exact steps to reproduce

## Related Documentation

- [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) - Full deployment guide
- [AUTH_DEBUGGING.md](./AUTH_DEBUGGING.md) - Authentication debugging
- [README.md](./README.md) - General troubleshooting section

---

**Quick Reference:**

```bash
# View backend logs
heroku logs --tail

# Check backend config
heroku config

# Restart backend
heroku restart

# Check frontend env (Vercel)
vercel env ls

# Enable frontend debug mode
# Add ?debug=1 to URL
```
