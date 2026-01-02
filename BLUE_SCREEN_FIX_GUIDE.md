# Blue Screen Fix - Testing & Configuration Guide

## Overview

This document provides instructions for testing the blue screen fix and ensuring the app properly displays errors and logs during runtime.

## What Was Fixed

### Root Causes Identified
1. **No Error Boundary** - React errors caused silent failures showing only the background
2. **Silent Environment Variable Failures** - Missing env vars didn't prevent the app from trying to render
3. **Insufficient Error Logging** - Runtime errors weren't being surfaced to console
4. **No Startup Validation** - Critical configuration wasn't validated at app startup

### Changes Applied

#### 1. Added Error Boundary Component
- **File**: `frontend/src/components/ErrorBoundary.tsx`
- **Purpose**: Catches React errors and displays user-friendly error UI instead of crashing silently
- **Features**:
  - Shows error message and name
  - Provides "Reload" and "Clear & Reload" buttons
  - Shows technical details in development mode or with `?debug=1`
  - Logs errors to console and stores in `window.__appError` for debugging

#### 2. Enhanced Main Entry Point
- **File**: `frontend/src/main.tsx`
- **Changes**:
  - Wrapped app in ErrorBoundary
  - Added startup logging (environment, API URL, App ID status)
  - Added global error handlers for uncaught errors and unhandled promise rejections
  - Added environment variable validation at startup

#### 3. Improved MiniKitProvider
- **File**: `frontend/src/providers/MiniKitProvider.tsx`
- **Changes**:
  - Added comprehensive logging during MiniKit initialization
  - Shows configuration error UI if VITE_APP_ID is missing
  - Better error messages for initialization failures
  - Logs MiniKit installation status

#### 4. Enhanced AuthWrapper Logging
- **File**: `frontend/src/components/AuthWrapper.tsx`
- **Changes**:
  - Added state change logging for debugging
  - Logs current auth state (isReady, isInstalled, hasToken, etc.)

#### 5. Enhanced GameProvider Logging
- **File**: `frontend/src/context/GameContext.tsx`
- **Changes**:
  - Added initialization logging
  - Logs when user/token/match are restored from localStorage
  - Better error handling for corrupt localStorage data

## Testing Steps

### 1. Test Normal Operation (Not in World App)

**Expected Behavior**: App should show "Open in World App" message with instructions.

```bash
# Start the frontend dev server
cd frontend
npm run dev
```

Open http://localhost:3000 in a browser. You should see:
- ✅ Clear "Open in World App" message
- ✅ Instructions for opening in World App
- ✅ Auth Debug Panel showing MiniKit status
- ✅ Console logs showing initialization steps

**Console Output Should Include**:
```
🚀 [App] Starting Blink Battle Mini-App
📍 [App] Environment: development
🌐 [App] API URL: http://localhost:3001
🆔 [App] App ID: Configured
🎮 [GameProvider] Initializing state...
🔧 [MiniKitProvider] Initializing MiniKit...
📦 [MiniKitProvider] Installing MiniKit with App ID: app_staging_your_app_id
✅ [MiniKitProvider] Installation complete
🔐 [AuthWrapper] State: {isReady: true, isInstalled: false, ...}
```

### 2. Test Missing Environment Variables

**Test Case**: App should show configuration error if VITE_APP_ID is missing.

```bash
# Temporarily remove VITE_APP_ID from .env
cd frontend
mv .env .env.backup
echo "VITE_API_URL=http://localhost:3001" > .env

# Restart dev server
npm run dev
```

**Expected Behavior**:
- ✅ App shows "Configuration Error" screen
- ✅ Error message mentions VITE_APP_ID is not configured
- ✅ Console shows warning about missing VITE_APP_ID

```bash
# Restore .env
mv .env.backup .env
```

### 3. Test React Error Boundary

**Test Case**: Simulate a component error to test error boundary.

**Method 1**: Temporarily break a component:
```tsx
// Temporarily add to any component file to test
throw new Error('Test error for error boundary');
```

**Expected Behavior**:
- ✅ App shows "Something went wrong" error screen
- ✅ Error message is displayed
- ✅ "Reload App" and "Clear & Reload" buttons are shown
- ✅ Technical details are shown in development mode
- ✅ Error is logged to console with full stack trace

**Method 2**: Test with invalid data in localStorage:
```javascript
// In browser console
localStorage.setItem('user', 'invalid json{');
location.reload();
```

**Expected Behavior**:
- ✅ App handles corrupt localStorage gracefully
- ✅ Console shows error about failed parse
- ✅ App continues to load (doesn't crash)

### 4. Test Production Build

**Test Case**: Ensure error handling works in production build.

```bash
cd frontend
npm run build
npm run preview
```

Open http://localhost:4173 and verify:
- ✅ App loads properly
- ✅ Errors are still caught by error boundary
- ✅ Error logs are still shown in console (except debug logs)

### 5. Test Debug Mode

**Test Case**: Debug panel and additional logging with `?debug=1`.

```bash
# With dev server running
# Open: http://localhost:3000?debug=1
```

**Expected Behavior**:
- ✅ Auth Debug Panel is visible
- ✅ Additional debug logs appear in console
- ✅ Error boundary shows technical details

### 6. Test Global Error Handlers

**Test Case**: Verify uncaught errors are logged.

```javascript
// In browser console, test uncaught error
setTimeout(() => { throw new Error('Uncaught error test'); }, 1000);
```

**Expected Behavior**:
- ✅ Error is logged to console with "❌ [Global] Uncaught error:" prefix
- ✅ Error location is shown

```javascript
// In browser console, test unhandled promise rejection
Promise.reject(new Error('Unhandled rejection test'));
```

**Expected Behavior**:
- ✅ Error is logged to console with "❌ [Global] Unhandled promise rejection:" prefix

## Configuration Requirements

### Required Environment Variables

Create a `.env` file in the `frontend/` directory:

```bash
# Required for MiniKit to work
VITE_APP_ID=app_staging_your_app_id

# Required for API communication
VITE_API_URL=http://localhost:3001

# Required for payments (can be placeholder for testing)
VITE_PLATFORM_WALLET_ADDRESS=0x0000000000000000000000000000000000000000

# Required for smart contract integration
VITE_ESCROW_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
VITE_WLD_TOKEN_ADDRESS=0x2cFc85d8E48F8EAb294be644d9E25C3030863003
```

### For Production Deployment

1. Replace `app_staging_your_app_id` with your actual Worldcoin App ID from the [Developer Portal](https://developer.worldcoin.org)
2. Set `VITE_API_URL` to your production backend URL
3. Configure actual wallet addresses for production

## Verifying Worldcoin MiniKit Integration

### MiniKit Installation Verification

The app now logs MiniKit installation status clearly:

```javascript
// Check in browser console
✅ [MiniKitProvider] Installation complete: {
  appId: "app_staging_your_app_id",
  isInstalled: false,  // true when in World App
  supportedCommands: undefined  // array when in World App
}
```

### MiniKit Commands Verification

When running inside World App, verify these commands work:

1. **Wallet Authentication** (`walletAuth`):
   - Triggered automatically on app load when in World App
   - Logs show SIWE flow progression
   - Check Auth Debug Panel for detailed flow data

2. **Payments** (`pay`):
   - Test by starting a match with stake
   - Check console for payment flow logs
   - Verify payment confirmation

3. **Haptic Feedback** (`sendHapticFeedback`):
   - Triggered on auth success/failure
   - Triggered on game events

### Testing in World App (Simulator)

For actual World App testing, you need to:

1. Set up the app in [Worldcoin Developer Portal](https://developer.worldcoin.org)
2. Add your app to World App simulator or device
3. Configure allowed origins (e.g., `http://localhost:3000` for dev)
4. Open the app inside World App

**Expected logs when in World App**:
```
✅ [MiniKitProvider] Installation complete: {
  appId: "app_staging_xxxxx",
  isInstalled: true,  // ✅ Now true
  supportedCommands: ["walletAuth", "pay", "verify", "sendHapticFeedback"]
}
🔐 [AuthWrapper] State: {isReady: true, isInstalled: true, ...}
```

## Debugging Common Issues

### Issue: App shows only blue/dark background

**Cause**: Component error before error boundary was added (old version)

**Solution**: 
1. Clear browser cache and reload
2. Check console for errors (now visible with new logging)
3. Check if .env file exists and has required variables

### Issue: "Configuration Error" screen

**Cause**: VITE_APP_ID is not set in .env

**Solution**:
```bash
cd frontend
cp .env.example .env
# Edit .env and set VITE_APP_ID
```

### Issue: App says "Open in World App" but I'm in World App

**Cause**: 
- MiniKit installation failed
- App ID not configured in Developer Portal
- Origin not allowed in Developer Portal

**Solution**:
1. Check console logs for MiniKit installation errors
2. Verify App ID matches Developer Portal
3. Add your origin to "Allowed Origins" in Developer Portal
4. Check Auth Debug Panel for detailed status

### Issue: Network errors when authenticating

**Cause**: Backend not running or wrong API URL

**Solution**:
1. Start backend: `cd backend && npm run dev`
2. Verify VITE_API_URL in .env matches backend URL
3. Check console logs for API URL being used

## Console Log Reference

The app now provides structured logging with emojis for easy filtering:

- 🚀 **[App]** - App startup and configuration
- 🔧 **[MiniKitProvider]** - MiniKit initialization
- 🎮 **[GameProvider]** - Game state management
- 🔐 **[AuthWrapper]** - Authentication flow
- 📦 **[API]** - API requests and responses
- ❌ **[Global]** - Uncaught errors
- ✅ - Success events
- ⚠️ - Warnings

### Filtering Logs in Browser Console

```javascript
// Chrome/Firefox DevTools: Filter by prefix
// Type in console filter box:
[MiniKitProvider]   // Show only MiniKit logs
[Auth              // Show all auth-related logs
❌                 // Show only errors
```

## Support

If you encounter issues not covered in this guide:

1. Check console logs for error messages
2. Enable debug mode with `?debug=1`
3. Check Auth Debug Panel for detailed state
4. Review error boundary technical details (dev mode)
5. Check `window.__appError` in console for last error details
6. Review MiniKit documentation: https://docs.worldcoin.org/mini-apps

## Screenshots

### App Running Outside World App
![App Not in World App](https://github.com/user-attachments/assets/52a0ec01-806e-4ce1-a7ae-10dc5fe52782)

The app now shows a clear "Open in World App" message with instructions and a visible debug panel, instead of showing just a blue screen.
