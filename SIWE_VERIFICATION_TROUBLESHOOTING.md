# SIWE Verification Troubleshooting Guide

This guide helps diagnose and fix issues where the SIWE (Sign-In with Ethereum) authentication flow fails, particularly when the `POST /api/auth/verify-siwe` request is not being sent.

## Problem Overview

**Symptoms:**
- `GET /api/auth/nonce` succeeds (preflight OPTIONS 204, GET 200)
- Preflight OPTIONS for `/api/auth/verify-siwe` appears in logs
- But the actual `POST /api/auth/verify-siwe` never follows
- User sees "Network error" or gets stuck on authentication screen
- Backend never receives the POST request (visible in Heroku logs)

## Diagnostic Steps

### 1. Check Browser Console Logs

Open DevTools (F12) → Console tab and look for authentication flow logs:

**Expected flow:**
```
[API] Using API URL: https://your-backend.herokuapp.com
[Auth] Calling MiniKit.walletAuth with nonce: AB12CD...XY78
[Auth] MiniKit.walletAuth completed, finalPayload: present
[Auth] finalPayload.status: success
[Auth] Wallet auth successful, proceeding to verify SIWE signature
[API] Outgoing request: {method: 'POST', url: '/api/auth/verify-siwe', hasAuth: false, hasData: true}
[API] Response received: {status: 200, url: '/api/auth/verify-siwe', method: 'POST'}
[Auth] Received response from /api/auth/verify-siwe {status: 200, hasData: true}
[Auth] Verification successful, storing token and user
```

**If you see:**
- `finalPayload: undefined` → MiniKit wallet auth failed silently
- `finalPayload.status: error` → User rejected or MiniKit error
- `finalPayload.status: [anything other than 'success']` → Unexpected MiniKit response
- No `[API] Outgoing request` log → Code threw an exception before POST
- `Network error - no response received` → Backend not reachable or CORS issue

### 2. Check MiniKit Installation

**Verify you're running inside World App:**
```javascript
// In browser console
MiniKit.isInstalled()  // Should return true
```

**If false:**
- The app must be opened inside World App
- Browser testing will not work for wallet auth
- Use World App simulator or actual device

### 3. Check API URL Configuration

**In browser console:**
```javascript
console.log(import.meta.env.VITE_API_URL)
```

**Should show:**
- Production: `https://your-backend.herokuapp.com` (NOT localhost)
- Development: `http://localhost:3001`

**If showing wrong URL:**
1. Set environment variable in deployment platform:
   - Vercel: Settings → Environment Variables → `VITE_API_URL`
   - Netlify: Site settings → Build & deploy → Environment → `VITE_API_URL`
2. Rebuild and redeploy frontend

### 4. Check Backend CORS Configuration

**Test CORS with curl:**
```bash
# Test OPTIONS preflight
curl -i -X OPTIONS \
  -H "Origin: https://your-frontend.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,X-Request-Id" \
  https://your-backend.herokuapp.com/api/auth/verify-siwe

# Should return:
# HTTP/1.1 204 No Content
# Access-Control-Allow-Origin: https://your-frontend.vercel.app
# Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
```

**If CORS fails:**
```bash
# Set allowed origins
heroku config:set ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://www.your-frontend.vercel.app

# Restart backend
heroku restart
```

### 5. Check Backend Logs

```bash
# Stream logs in real-time
heroku logs --tail

# Filter for auth-related logs
heroku logs --tail | grep -E "Auth|CORS"
```

**Look for:**
- `[Auth:getNonce]` - Nonce generation (should appear first)
- `[Auth:verifySiwe]` - SIWE verification (should appear after wallet auth)
- `[CORS] Blocked request` - CORS misconfiguration
- Request IDs to correlate frontend and backend logs

## Common Issues and Fixes

### Issue 1: MiniKit Returns Undefined Payload

**Cause:** User closed the wallet auth prompt or MiniKit not properly initialized

**Fix:**
- Ensure user approves the sign-in request in World App
- Check that MiniKit is ready before calling walletAuth
- Add retry logic for transient failures

**Code check in AuthWrapper.tsx:**
```typescript
if (!finalPayload) {
  // Should throw clear error message
  throw new Error('Authentication failed: No response from wallet...');
}
```

### Issue 2: Unexpected finalPayload.status

**Cause:** MiniKit returns status other than 'success' or 'error'

**Fix:** Enhanced validation now catches this:
```typescript
if (finalPayload.status !== 'success') {
  throw new Error('Authentication failed: Unexpected response status...');
}
```

**Check console for:** `Unexpected wallet auth status: [status]`

### Issue 3: Network Error Before POST

**Symptoms:**
- Console shows validation errors before POST
- No `[API] Outgoing request` log

**Causes:**
- finalPayload validation failed
- Exception thrown in error handling code
- Timeout triggered before POST

**Fix:**
- Check for error messages before the POST log
- Look at full stack trace in console
- Verify timeout is sufficient (15 seconds default)

### Issue 4: CORS Preflight Succeeds, POST Fails

**Symptoms:**
- OPTIONS request returns 204
- POST request never sent by browser

**Causes:**
- JavaScript exception before fetch/axios call
- Browser security policy blocking request
- Axios interceptor throwing error

**Fix:**
- Check console for JavaScript errors
- Verify axios client is properly configured
- Check interceptor logs: `[API] Request interceptor error`

## Debug Panel Usage

**Enable debug panel:**
1. Add `?debug=1` to URL, OR
2. Use development mode (`npm run dev`)

**Debug panel shows:**
- API URL being used
- MiniKit installation status
- Last nonce request (with request ID)
- Last wallet auth (with status)
- Last verify request (with HTTP status and response)

**Use request IDs to correlate:**
- Copy request ID from debug panel
- Search backend logs for same ID
- Verify backend received and processed request

## Testing Checklist

Before deploying to production:

- [ ] Test auth flow in World App (not browser)
- [ ] Verify console shows all expected logs
- [ ] Check OPTIONS preflight succeeds (204)
- [ ] Check POST request is sent after wallet auth
- [ ] Verify POST returns 200 with token
- [ ] Confirm token stored in localStorage
- [ ] Test /api/auth/me returns 200 with user data
- [ ] Test authenticated endpoints work (e.g., initiate-payment)

## Production Verification

```bash
# 1. Test nonce endpoint
curl -i https://your-backend.herokuapp.com/api/auth/nonce

# 2. Check CORS for verify endpoint
curl -i -X OPTIONS \
  -H "Origin: https://your-frontend.vercel.app" \
  https://your-backend.herokuapp.com/api/auth/verify-siwe

# 3. Monitor logs during test
heroku logs --tail

# 4. In World App, attempt sign-in
# 5. Watch logs for:
#    - [Auth:getNonce] with request ID
#    - [Auth:verifySiwe] with same or related request ID
```

## Enhanced Logging Added

Recent improvements include:

1. **Validation logs:**
   - Check for undefined finalPayload
   - Check for finalPayload.status !== 'success'
   - Log exact status value when unexpected

2. **Request/response logs:**
   - Before MiniKit.walletAuth call
   - After MiniKit.walletAuth returns
   - Before POST to verify-siwe
   - After POST response received

3. **Error categorization:**
   - MiniKit errors (user rejection, etc.)
   - Network errors (no response)
   - HTTP errors (with status code)
   - Timeout errors

4. **Axios interceptor logs:**
   - All outgoing requests
   - All responses (success and error)
   - Request/response correlation

## Need More Help?

If issue persists after following this guide:

1. Collect logs:
   - Full browser console output (export as text)
   - Backend logs around the time of failure
   - Request IDs from debug panel

2. Check backend health:
   ```bash
   heroku ps
   heroku logs --tail | head -50
   ```

3. Verify environment variables:
   ```bash
   heroku config
   ```

4. Review recent changes:
   ```bash
   git log --oneline -10
   ```
