# Troubleshooting SIWE Login Issues in Blink Battle

This guide helps you diagnose and fix issues where the SIWE (Sign-In with Ethereum) authentication flow fails in World App.

## Quick Checklist

Before diving into detailed troubleshooting, verify these critical requirements:

- [ ] **Running in World App**: The app MUST be opened inside World App (not a regular browser)
- [ ] **Backend is accessible**: Your backend API is reachable from your frontend domain
- [ ] **VITE_API_URL is set**: Environment variable configured in production deployment
- [ ] **CORS is configured**: Backend allows requests from your frontend origin
- [ ] **Worldcoin Dev Portal**: Your app's origin is added to "Allowed Origins" in MiniKit settings

## Common Problems & Solutions

### Problem 1: "POST /api/auth/verify-siwe" Never Sent

**Symptoms:**
- `GET /api/auth/nonce` succeeds (200 OK)
- Preflight OPTIONS for `/api/auth/verify-siwe` appears in logs
- The actual POST request never reaches backend
- User sees "Authentication failed" or gets stuck

**Root Causes & Solutions:**

#### A. MiniKit Returns Undefined Payload

**Why it happens:**
- Origin not allowed in Worldcoin Dev Portal
- MiniKit API version incompatibility
- Not running in World App

**How to fix:**
1. Enable debug mode by adding `?debug=1` to URL
2. Check debug panel for "Configuration Issues" section
3. Look for error: "MiniKit walletAuth returned undefined payload"
4. If present, verify:
   - You're in World App (not browser)
   - Origin is added in Dev Portal
   - World App is up to date

**Add origin to Dev Portal:**
1. Go to https://developer.worldcoin.org
2. Select your app
3. Navigate to MiniKit settings
4. Add your origin(s) to "Allowed Origins":
   - Production: `https://your-app.vercel.app`
   - Staging: `https://staging-your-app.vercel.app`
   - Local: `http://localhost:5173` (for testing)
5. Save changes
6. Wait 1-2 minutes for propagation
7. Try login again

#### B. VITE_API_URL Not Configured

**Why it happens:**
- Environment variable not set in deployment platform
- Frontend defaults to `window.location.origin`
- Backend is on different domain (e.g., Heroku)

**How to fix:**
1. Check browser console for:
   ```
   ⚠️ CRITICAL CONFIGURATION ERROR ⚠️
   [API] VITE_API_URL is not set in production!
   ```
2. Go to your deployment platform:
   - **Vercel**: Settings → Environment Variables
   - **Netlify**: Site settings → Build & deploy → Environment
   - **Render**: Environment → Environment Variables
3. Add variable:
   - Name: `VITE_API_URL`
   - Value: `https://your-backend.herokuapp.com` (your backend URL)
4. Redeploy frontend
5. Verify in debug panel: API URL should show your backend

#### C. MiniKit Error Code Returned

**Common error codes:**

| Error Code | Cause | Solution |
|------------|-------|----------|
| `user_rejected` | User cancelled sign-in | Ask user to try again |
| `origin_not_allowed` | Domain not in Dev Portal | Add origin to Allowed Origins |
| `unsupported_command` | World App outdated | Update World App |
| `network_error` | Connection issue | Check internet connection |
| `invalid_request` | Configuration issue | Check app configuration in Dev Portal |

**How to diagnose:**
1. Enable debug panel (`?debug=1`)
2. Try to login
3. Check "Last Wallet Auth" section
4. Look for error code
5. Follow solution for that specific error

### Problem 2: Backend Returns 401 After Login

**Symptoms:**
- Login appears successful
- `/api/auth/me` returns 401 Unauthorized
- User immediately logged out

**Root Causes & Solutions:**

#### JWT Token Not Stored

**Check:**
1. Open browser DevTools → Application → Local Storage
2. Look for `token` key
3. If missing, check console for errors during verify-siwe

**Fix:**
- Issue is likely in backend verification
- Check backend logs for verify-siwe errors
- Verify JWT_SECRET is set in backend

#### JWT Token Not Attached to Requests

**Check:**
1. Open DevTools → Network tab
2. Click on any API request (e.g., `/api/auth/me`)
3. Look for `Authorization` header
4. Should be: `Bearer <token>`

**If missing:**
- This indicates frontend axios interceptor issue
- Check browser console for errors
- File a bug report with console logs

### Problem 3: CORS Errors

**Symptoms:**
- Browser console shows CORS error
- Preflight OPTIONS succeeds but POST fails
- Error: "Access to fetch blocked by CORS policy"

**How to fix:**

1. **Verify backend CORS config:**
   ```bash
   # Test OPTIONS preflight
   curl -i -X OPTIONS \
     -H "Origin: https://your-frontend.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type,X-Request-Id,Authorization" \
     https://your-backend.herokuapp.com/api/auth/verify-siwe
   ```
   
   Expected response:
   ```
   HTTP/2 204
   access-control-allow-origin: https://your-frontend.vercel.app
   access-control-allow-methods: GET,POST,PUT,DELETE,OPTIONS
   access-control-allow-headers: Content-Type,X-Request-Id,Authorization
   access-control-allow-credentials: true
   ```

2. **Update backend CORS config:**
   - Ensure your frontend origin is in allowed origins list
   - Allow credentials: `true`
   - Allow headers: `Content-Type, X-Request-Id, Authorization`

## Using the Debug Panel

The debug panel is your primary tool for diagnosing auth issues.

### Enabling Debug Panel

**Method 1: Development Mode**
- Automatically shown when running `npm run dev`

**Method 2: Query Parameter**
- Add `?debug=1` to any URL
- Example: `https://your-app.vercel.app?debug=1`
- Works in production

### Reading Debug Panel

#### Configuration Issues (Red/Yellow Box)

**Appears at top if critical issues detected:**
- **Errors** (Red 🚫): Must fix before auth will work
- **Warnings** (Yellow ⚠️): May cause issues

**Common errors:**
- `VITE_API_URL not configured`: See Problem 1.B above
- `walletAuth command not supported`: Update World App

#### Environment Section

Shows:
- **API URL**: Where frontend sends requests (⚠️ if misconfigured)
- **Mode**: Development or Production
- **Current Origin**: Your app's origin (must be in Dev Portal)

#### MiniKit Status Section

Shows:
- **MiniKit Installed**: Must be ✅ Yes
- **MiniKit Ready**: Must be ✅ Yes
- **MiniKit Version**: Version number (helps diagnose compatibility)
- **World App Version**: Version number
- **Supported Commands**: Must include `walletAuth`

If `walletAuth` is missing from supported commands:
→ World App is outdated, user must update

#### Authentication Flow Sections

**Last Nonce Request:**
- Shows if `GET /api/auth/nonce` succeeded
- If error shown: Backend not reachable or CORS issue

**Last Wallet Auth:**
- Shows MiniKit walletAuth result
- **Status**: Must be `success`
- If `error`: Shows error code (see Problem 1.C)
- If missing: walletAuth never called (MiniKit issue)

**Last Verify SIWE Request:**
- Shows if `POST /api/auth/verify-siwe` was sent
- **HTTP Status**: Should be 200
- If missing: POST never sent (see Problem 1)
- If 401/403: Backend verification failed
- If 500: Backend error (check backend logs)

## Step-by-Step Debugging Process

Follow these steps to diagnose any auth issue:

### Step 1: Enable Debug Panel
```
Add ?debug=1 to URL or run in dev mode
```

### Step 2: Check Configuration Issues Section
```
Look for red errors at top of debug panel
Fix any critical errors before proceeding
```

### Step 3: Verify Environment
```
✓ API URL points to your backend
✓ Mode matches deployment (dev/prod)
✓ Current origin is added to Dev Portal
```

### Step 4: Verify MiniKit Status
```
✓ MiniKit Installed = Yes
✓ MiniKit Ready = Yes
✓ Supported Commands includes walletAuth
```

### Step 5: Attempt Login
```
Click "Connect Wallet" or retry authentication
```

### Step 6: Check Auth Flow Sections
```
1. Last Nonce Request → Should show success
2. Last Wallet Auth → Should show status: success
3. Last Verify SIWE Request → Should show HTTP 200
```

### Step 7: Identify Where Flow Stops
```
If stops at:
- Nonce: Backend not reachable (check API URL)
- Wallet Auth: See Problem 1.A or 1.C
- Verify SIWE: See Problem 1.B or Problem 2
```

## Backend Troubleshooting

If frontend debug panel shows requests are being sent correctly but backend fails:

### Check Heroku Logs
```bash
heroku logs --tail --app your-app-name
```

Look for:
- Incoming POST /api/auth/verify-siwe
- SIWE verification errors
- JWT generation errors

### Common Backend Issues

**1. Invalid SIWE Signature**
- Message format mismatch
- Nonce mismatch
- Expired timestamp

**2. Missing Environment Variables**
- JWT_SECRET not set
- Other required vars missing

**3. Database Connection Issues**
- User creation fails
- Can't store user info

See backend logs for specific errors.

## Still Having Issues?

If you've followed all steps above and still can't login:

### Gather Information

1. **Enable debug panel** (`?debug=1`)
2. **Take screenshot** of debug panel after failed login attempt
3. **Copy browser console logs**:
   - Open DevTools → Console
   - Right-click → Save as...
   - Or copy all text
4. **Copy backend logs** (if accessible):
   ```bash
   heroku logs --tail --app your-app-name > logs.txt
   ```

### Report Issue

Include in your report:
- Screenshot of debug panel
- Browser console logs
- Backend logs (if accessible)
- Steps to reproduce
- Environment (World App version, device, etc.)

## Prevention Checklist

Before deploying to production, verify:

- [ ] **VITE_API_URL** environment variable set in deployment platform
- [ ] **Backend URL** accessible from frontend domain
- [ ] **CORS configured** on backend for frontend origin
- [ ] **Origin added** to Worldcoin Dev Portal "Allowed Origins"
- [ ] **Test in World App** (not browser) before going live
- [ ] **Monitor logs** after deployment to catch issues early
- [ ] **Enable debug panel** with `?debug=1` for first few users

## Additional Resources

- [Worldcoin Dev Portal](https://developer.worldcoin.org)
- [MiniKit Documentation](https://docs.worldcoin.org/mini-apps)
- [SIWE Specification](https://eips.ethereum.org/EIPS/eip-4361)
- Project Docs:
  - [AUTH_DEBUGGING.md](./AUTH_DEBUGGING.md) - Debug panel features
  - [SIWE_VERIFICATION_TROUBLESHOOTING.md](./SIWE_VERIFICATION_TROUBLESHOOTING.md) - Backend verification
  - [CORS_CONFIGURATION.md](./CORS_CONFIGURATION.md) - CORS setup guide
