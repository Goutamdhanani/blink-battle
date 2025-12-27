# Production Deployment Guide

This guide covers deploying Blink Battle to production with proper CORS, authentication, and payment configuration.

## Prerequisites

Before deploying, ensure you have:

1. ✅ **Worldcoin Developer Account** - Sign up at [developer.worldcoin.org](https://developer.worldcoin.org)
2. ✅ **App ID and API Key** - Create a new app in the Developer Portal
3. ✅ **Platform Wallet** - An Ethereum wallet address for receiving payments
4. ✅ **Heroku Account** - For backend deployment (or similar platform)
5. ✅ **Vercel/Netlify Account** - For frontend deployment

## Step 1: Backend Deployment (Heroku)

### 1.1 Create Heroku App

```bash
# Create new Heroku app
heroku create your-backend-name

# Add PostgreSQL
heroku addons:create heroku-postgresql:mini

# Add Redis
heroku addons:create heroku-redis:mini
```

### 1.2 Configure Environment Variables

**Critical: Set all required variables**

```bash
# Worldcoin Configuration
heroku config:set APP_ID=app_staging_xxxxx
heroku config:set DEV_PORTAL_API_KEY=your_dev_portal_api_key
heroku config:set PLATFORM_WALLET_ADDRESS=0xYourWalletAddress

# JWT Secret (generate a secure random string)
heroku config:set JWT_SECRET=$(openssl rand -base64 32)

# Database SSL (required for Heroku Postgres)
heroku config:set DATABASE_SSL=true

# CORS Configuration - CRITICAL FOR PRODUCTION
# Set to your frontend URL (you can update this after frontend deployment)
heroku config:set FRONTEND_URL=https://your-frontend.vercel.app

# Optional: Multiple frontend URLs
heroku config:set FRONTEND_URL_PRODUCTION=https://your-prod-frontend.vercel.app

# Node Environment
heroku config:set NODE_ENV=production
```

### 1.3 Deploy Backend

```bash
# Deploy from main branch
git push heroku main

# Or if you're on a different branch:
git push heroku your-branch:main

# Run database migrations
heroku run npm run migrate

# Check logs to verify deployment
heroku logs --tail
```

### 1.4 Verify Backend

```bash
# Test health endpoint
curl https://your-backend-name.herokuapp.com/health

# Should return: {"status":"ok","timestamp":"..."}
```

## Step 2: Frontend Deployment (Vercel)

### 2.1 Configure Environment Variables

Create a `.env.production` file or set environment variables in Vercel dashboard:

```env
# Backend API URL (use your Heroku backend URL)
VITE_API_URL=https://your-backend-name.herokuapp.com

# Worldcoin Configuration (must match backend)
VITE_APP_ID=app_staging_xxxxx
VITE_PLATFORM_WALLET_ADDRESS=0xYourWalletAddress
```

### 2.2 Deploy to Vercel

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Navigate to frontend directory
cd frontend

# Deploy
vercel deploy --prod
```

### 2.3 Set Environment Variables in Vercel Dashboard

1. Go to your project in Vercel dashboard
2. Navigate to Settings → Environment Variables
3. Add the following:
   - `VITE_API_URL` = `https://your-backend-name.herokuapp.com`
   - `VITE_APP_ID` = `app_staging_xxxxx`
   - `VITE_PLATFORM_WALLET_ADDRESS` = `0xYourWalletAddress`
4. Redeploy to apply changes

### 2.4 Update Backend CORS

Now that you have your frontend URL, update the backend:

```bash
# Update FRONTEND_URL with your deployed frontend URL
heroku config:set FRONTEND_URL=https://your-frontend.vercel.app
```

## Step 3: Worldcoin Developer Portal Configuration

### 3.1 Update App Settings

1. Go to [developer.worldcoin.org](https://developer.worldcoin.org)
2. Select your app
3. Navigate to Settings
4. Update the following:

**Redirect URLs:**
- Add: `https://your-frontend.vercel.app`
- Add: `https://your-frontend.vercel.app/dashboard`

**Allowed Origins:**
- Add: `https://your-frontend.vercel.app`

**App URL:**
- Set to: `https://your-frontend.vercel.app`

### 3.2 Verify API Key Permissions

Ensure your API key has the following permissions:
- ✅ Transaction verification
- ✅ Payment verification

## Step 4: Testing Production Deployment

### 4.1 Test in World App

1. Open World App on your mobile device
2. Enable Developer Mode (if using staging app)
3. Add your app URL: `https://your-frontend.vercel.app`
4. Open the app in World App

### 4.2 Test Authentication Flow

1. Open the app in World App
2. Should see "Sign In with World App" button
3. Click to sign in
4. Verify successful authentication
5. Check browser console for:
   - `[API] Using API URL: https://your-backend-name.herokuapp.com`
   - `[Auth] Request authenticated for user: ...`

### 4.3 Test Payment Flow

1. Navigate to PvP mode
2. Select a stake amount
3. Click "Find Opponent"
4. Verify MiniKit Pay drawer opens
5. Complete payment
6. Verify matchmaking starts
7. Check backend logs:
   ```bash
   heroku logs --tail
   ```
   - Should see: `[Payment] Initiated payment reference=...`
   - Should see: `[Payment] Payment confirmed reference=...`

### 4.4 Check for Common Errors

**If you see CORS errors in browser console:**
```
Access to XMLHttpRequest at 'https://your-backend...' from origin 'https://your-frontend...' 
has been blocked by CORS policy
```

**Solution:**
```bash
# Verify FRONTEND_URL is set correctly
heroku config:get FRONTEND_URL

# If not set or wrong, update it:
heroku config:set FRONTEND_URL=https://your-frontend.vercel.app
```

**If you see 401 errors:**

1. Check browser console for API URL being used
2. Verify token is stored in localStorage
3. Check backend logs for authentication errors:
   ```bash
   heroku logs --tail | grep Auth
   ```

**If WebSocket won't connect:**
```
WebSocket connection failed
```

**Solution:**
- Verify CORS configuration includes your frontend URL
- Check that backend is running and accessible
- Verify token is valid

## Step 5: Monitoring and Debugging

### 5.1 Backend Logs

```bash
# View real-time logs
heroku logs --tail

# View recent logs
heroku logs -n 200

# Filter for authentication logs
heroku logs --tail | grep Auth

# Filter for payment logs
heroku logs --tail | grep Payment
```

### 5.2 Enable Debug Mode

For production debugging:

```bash
# Enable detailed auth logging
heroku config:set DEBUG_AUTH=true

# View logs
heroku logs --tail
```

**Remember to disable after debugging:**
```bash
heroku config:set DEBUG_AUTH=false
```

### 5.3 Frontend Debugging

Open the app in World App and add `?debug=1` to URL:
```
https://your-frontend.vercel.app/?debug=1
```

This shows the debug panel with:
- API endpoint being used
- MiniKit status
- Auth flow tracking
- Request IDs for correlation with backend logs

## Common Production Issues

### Issue 1: Payment Returns 401

**Symptoms:**
- Payment button clicked
- Loading forever
- 401 error in console

**Diagnosis:**
```bash
# 1. Check if FRONTEND_URL is set
heroku config:get FRONTEND_URL

# 2. Check backend logs during payment attempt
heroku logs --tail

# Look for:
# - [CORS] Blocked request from origin: ...
# - [Auth] No token provided in request to /api/initiate-payment
# - [Auth] Token verification failed
```

**Solution:**
```bash
# Set FRONTEND_URL to your deployed frontend
heroku config:set FRONTEND_URL=https://your-frontend.vercel.app

# Verify in Vercel that VITE_API_URL points to your backend
# Settings → Environment Variables → VITE_API_URL
```

### Issue 2: WebSocket Connection Fails

**Symptoms:**
- "Connecting..." message forever
- Can't join matchmaking
- No real-time updates

**Diagnosis:**
Check browser console for WebSocket errors

**Solution:**
1. Verify backend CORS includes frontend URL
2. Check that WebSocket endpoint is accessible
3. Verify token is valid

### Issue 3: MiniKit Pay Not Opening

**Symptoms:**
- Button clicked but nothing happens
- No payment drawer appears

**Diagnosis:**
```bash
# Check browser console for errors
# Look for:
# - MiniKit not installed
# - Invalid VITE_PLATFORM_WALLET_ADDRESS
```

**Solution:**
1. Ensure app is opened in World App (not regular browser)
2. Verify `VITE_PLATFORM_WALLET_ADDRESS` is set correctly
3. Check Developer Portal configuration

### Issue 4: Payment Verification Fails

**Symptoms:**
- Payment approved in World App
- But confirmation fails
- Transaction shows as pending forever

**Diagnosis:**
```bash
heroku logs --tail | grep Payment

# Look for:
# - [Payment] Developer Portal API error
# - Failed to verify transaction
```

**Solution:**
1. Verify `DEV_PORTAL_API_KEY` is set and valid
2. Check API key permissions in Developer Portal
3. Ensure `APP_ID` matches between frontend and backend

## Security Checklist

Before going live:

- [ ] JWT_SECRET is a strong random string (not the default)
- [ ] DEV_PORTAL_API_KEY is kept secret (never committed to git)
- [ ] FRONTEND_URL is set to only your trusted domains
- [ ] DATABASE_SSL is enabled for production database
- [ ] DEBUG_AUTH is disabled in production
- [ ] All sensitive data is in environment variables, not hardcoded
- [ ] PLATFORM_WALLET_ADDRESS is under your control

## Scaling Considerations

### Database

Monitor database usage:
```bash
heroku pg:info
```

Upgrade if needed:
```bash
heroku addons:upgrade heroku-postgresql:standard-0
```

### Redis

Monitor Redis usage:
```bash
heroku redis:info
```

### Backend Dynos

Scale backend for more traffic:
```bash
# View current dyno usage
heroku ps

# Scale to 2 dynos
heroku ps:scale web=2
```

## Rollback

If deployment has issues:

```bash
# View recent releases
heroku releases

# Rollback to previous version
heroku rollback v123
```

## Support

For issues:
1. Check [README.md](./README.md) troubleshooting section
2. Check [AUTH_DEBUGGING.md](./AUTH_DEBUGGING.md) for auth issues
3. Open an issue on GitHub
4. Check Worldcoin Discord for MiniKit support

## Next Steps

After successful deployment:

1. ✅ Test all features thoroughly in World App
2. ✅ Monitor logs for errors
3. ✅ Set up error tracking (Sentry, etc.)
4. ✅ Enable staging environment for testing updates
5. ✅ Document any custom configuration
6. ✅ Set up automated backups for database

---

**Last Updated:** 2024-12-27
