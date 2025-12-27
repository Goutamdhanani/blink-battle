# CORS Configuration Quick Reference

This guide provides quick commands to fix CORS issues in production.

## Problem

You're seeing errors like:
- `[CORS] Blocked request from origin: https://www.blumea.me`
- `Access to XMLHttpRequest has been blocked by CORS policy`
- `Error: Not allowed by CORS` in backend logs
- 500 responses for preflight OPTIONS requests

## Solution

The backend now supports flexible CORS configuration through environment variables.

## Configuration Options

### Option 1: Multiple Origins (Recommended)

Use `ALLOWED_ORIGINS` for comma-separated list of allowed origins:

```bash
# Set multiple origins at once
heroku config:set ALLOWED_ORIGINS=https://www.blumea.me,https://blumea.me,https://app.blumea.me

# Or for other deployments
export ALLOWED_ORIGINS=https://www.blumea.me,https://blumea.me,https://app.blumea.me
```

### Option 2: Single Origins (Legacy)

Use individual environment variables:

```bash
# Primary frontend URL
heroku config:set FRONTEND_URL=https://www.blumea.me

# Additional production URL
heroku config:set FRONTEND_URL_PRODUCTION=https://blumea.me
```

### Option 3: Combined Approach

You can use both - all will be combined:

```bash
heroku config:set FRONTEND_URL=https://www.blumea.me
heroku config:set FRONTEND_URL_PRODUCTION=https://blumea.me
heroku config:set ALLOWED_ORIGINS=https://app.blumea.me,https://miniapp.blumea.me
```

## Common Production Domains to Allow

For World App MiniApps, you typically need:

```bash
# Your production domains
ALLOWED_ORIGINS=https://www.blumea.me,https://blumea.me

# If using World App embedded browser (check logs for specific origin)
# World App may use specific origins - add them if you see them blocked in logs
```

## Verification

### 1. Check Current Configuration

```bash
# View allowed origins configuration
heroku config:get ALLOWED_ORIGINS
heroku config:get FRONTEND_URL
heroku config:get FRONTEND_URL_PRODUCTION
```

### 2. Check Backend Logs

After deployment, check that origins are loaded correctly:

```bash
heroku logs --tail
```

Look for:
```
✅ CORS allowed origins: [ 'https://www.blumea.me', 'https://blumea.me' ]
```

### 3. Test with curl

Test OPTIONS preflight request:

```bash
curl -X OPTIONS \
  -H "Origin: https://www.blumea.me" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization" \
  -i \
  https://your-backend.herokuapp.com/api/auth/nonce
```

Expected response:
```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://www.blumea.me
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

Test GET request:

```bash
curl -X GET \
  -H "Origin: https://www.blumea.me" \
  -i \
  https://your-backend.herokuapp.com/api/auth/nonce
```

Expected response:
```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://www.blumea.me
Access-Control-Allow-Credentials: true
Content-Type: application/json

{"nonce":"..."}
```

## Troubleshooting

### Still seeing CORS errors?

1. **Check exact origin in error**

   Look at browser console or backend logs for the exact origin being blocked:
   ```
   [CORS] Blocked request from origin: https://www.blumea.me
   ```

2. **Add blocked origin**

   ```bash
   # Get current value
   current=$(heroku config:get ALLOWED_ORIGINS)
   
   # Add new origin (replace with blocked origin from logs)
   heroku config:set ALLOWED_ORIGINS="$current,https://www.blumea.me"
   ```

3. **Check for typos**

   Common mistakes:
   - Missing `https://`
   - Extra `/` at the end
   - Wrong subdomain (www vs non-www)
   - Mixed protocols (http vs https)

4. **Verify deployment**

   ```bash
   # Check when config was last updated
   heroku releases | head -5
   
   # If config change didn't trigger restart
   heroku restart
   ```

5. **Clear cache**

   Clear browser cache and try again. CORS headers can be cached.

### 401 Errors After Fixing CORS

If CORS is fixed but you get 401 errors:

1. **Verify token is being sent**

   Check browser DevTools → Network → Request Headers:
   ```
   Authorization: Bearer eyJhbGc...
   ```

2. **Check token expiration**

   User may need to sign in again if token expired.

3. **Verify JWT_SECRET**

   Make sure JWT_SECRET matches between token generation and verification:
   ```bash
   heroku config:get JWT_SECRET
   ```

## Local Development

For local development:

```bash
# Backend .env
FRONTEND_URL=http://localhost:3000
NODE_ENV=development

# Frontend .env
VITE_API_URL=http://localhost:3001
```

Localhost is automatically allowed in development mode (NODE_ENV !== production).

## Production .env Example

```bash
# Backend (Heroku)
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://www.blumea.me
ALLOWED_ORIGINS=https://www.blumea.me,https://blumea.me
APP_ID=app_staging_xxxxx
DEV_PORTAL_API_KEY=your_api_key
PLATFORM_WALLET_ADDRESS=0x...
JWT_SECRET=your-secure-random-secret
DATABASE_SSL=true
```

```bash
# Frontend (Vercel)
VITE_API_URL=https://your-backend.herokuapp.com
VITE_APP_ID=app_staging_xxxxx
VITE_PLATFORM_WALLET_ADDRESS=0x...
```

## Quick Fix Commands

```bash
# Emergency fix: Allow your production domain
heroku config:set ALLOWED_ORIGINS=https://www.blumea.me

# Check if it worked
heroku logs --tail | grep CORS

# Test from browser
# Open https://www.blumea.me and check console
```

## Implementation Details

The backend now:
1. ✅ Accepts `ALLOWED_ORIGINS` as comma-separated list
2. ✅ Combines all CORS environment variables
3. ✅ Removes duplicates automatically
4. ✅ Logs allowed origins on startup
5. ✅ Provides detailed error messages when blocking
6. ✅ Handles OPTIONS preflight with 204 status
7. ✅ Applies same CORS config to WebSocket connections

## Need Help?

If you're still having issues:

1. Check [PRODUCTION_DEPLOYMENT_CHECKLIST.md](./PRODUCTION_DEPLOYMENT_CHECKLIST.md)
2. Check [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md)
3. Check backend logs: `heroku logs --tail | grep -E "(CORS|Auth)"`
4. Open an issue with:
   - Exact error message
   - Origin being blocked (from logs)
   - Current ALLOWED_ORIGINS value
   - Screenshot of Network tab

---

**Last Updated:** 2024-12-27
