# Implementation Summary: Auth Flow Debugging Features

## Overview
This PR implements comprehensive debugging and error reporting for the SIWE (Sign-In with Ethereum) authentication flow to help diagnose backend verification failures.

## Changes Implemented

### 1. Backend Request ID Correlation System
**Files Modified:**
- `backend/src/middleware/requestId.ts` (NEW)
- `backend/src/index.ts`

**Features:**
- Middleware generates UUID v4 for each request
- Accepts client-provided `X-Request-Id` header
- Returns request ID in response headers
- Attaches request ID to request object for use in controllers

### 2. Backend Enhanced Error Reporting
**Files Modified:**
- `backend/src/controllers/authController.ts`

**Features:**
- All error responses include:
  - Descriptive error messages
  - HTTP status codes (400, 401, 500)
  - Request ID for correlation
  - Helpful hints for common issues
  - Optional details when DEBUG_AUTH=true
- Specific error handling for:
  - Invalid/missing payload
  - Nonce not found or expired
  - Nonce age validation
  - SIWE signature verification failures
  - Database/internal errors

### 3. Backend Debug Logging
**Files Modified:**
- `backend/src/controllers/authController.ts`
- `backend/.env.example`

**Features:**
- Controlled by `DEBUG_AUTH` environment variable
- Logs include:
  - Request ID for correlation
  - Operation name (getNonce, verifySiwe)
  - Nonce store size monitoring
  - Redacted sensitive values (signatures, addresses)
  - Timing information (nonce age)
  - Validation failure reasons
- Helper function `redactSensitive()` ensures partial display only

### 4. Frontend Enhanced Error Display
**Files Modified:**
- `frontend/src/components/AuthWrapper.tsx`

**Features:**
- Parses JSON and text error responses from backend
- Displays HTTP status code with error message
- Shows helpful hints from backend
- Includes request ID in error display
- Better error messages instead of generic "Backend verification failed"
- Generates UUID v4 for request correlation using `crypto.randomUUID()`

### 5. Frontend Auth Flow Tracking
**Files Modified:**
- `frontend/src/components/AuthWrapper.tsx`

**Features:**
- Tracks all auth flow stages:
  1. Nonce request (with request ID and timestamp)
  2. WalletAuth call (with nonce and payload)
  3. SIWE verification request (with request ID and response)
- Stores data in `window.__authDebugData` for debug panel access
- Redacts sensitive fields:
  - Addresses (show first/last 6 chars)
  - Signatures (show first/last 8 chars)
  - Messages (show first/last 20 chars)

### 6. Frontend Enhanced Debug Panel
**Files Modified:**
- `frontend/src/components/DebugPanel.tsx`
- `frontend/src/components/DebugPanel.css`

**Features:**
- Enabled via `?debug=1` query param or development mode
- Collapsible UI (click header to expand/collapse)
- Sections:
  - **Environment**: API URL, development/production mode
  - **MiniKit Status**: Installation, readiness, version, supported commands
  - **Last Nonce Request**: Request ID, timestamp, nonce (redacted), errors
  - **Last Wallet Auth**: Timestamp, nonce, status, address (redacted), signature (redacted), errors
  - **Last Verify SIWE**: Request ID, timestamp, HTTP status, full response, errors
- Click-to-copy feature for request IDs and JSON responses
- Auto-refreshes every 2 seconds
- Manual refresh button

### 7. Documentation
**Files Created:**
- `AUTH_DEBUGGING.md` - Comprehensive debugging guide
- `test-auth-debug.sh` - Manual test script for backend endpoints

**Documentation Covers:**
- How to enable debug features (frontend & backend)
- Debug panel features explained
- Backend log format and examples
- Request correlation workflow
- Common issues and troubleshooting steps
- Production considerations
- Security notes about data redaction
- Support information collection

## Requirements Met

### ✅ Goal 1: Full Debugging Experience
- Complete visibility into auth flow from nonce → walletAuth → verify-siwe
- Request correlation between frontend and backend
- Detailed logging with DEBUG_AUTH flag

### ✅ Goal 2: Improved Error Visibility
- HTTP status codes displayed (400, 401, 500)
- Backend error messages surfaced to frontend
- JSON and text error responses parsed
- Helpful hints included

### ✅ Goal 3: Client-Side Debug Panel
- Enabled via `?debug=1` query param
- Also enabled in development mode (`import.meta.env.DEV`)
- Shows:
  - VITE_API_URL
  - MiniKit.isInstalled() and readiness
  - window.WorldApp?.supported_commands
  - Last nonce response
  - Last walletAuth finalPayload (redacted)
  - Last verify-siwe request/response

### ✅ Goal 4: Backend-Side Debug Logging
- Guarded by DEBUG_AUTH=true env flag
- Logs for `/api/auth/nonce`:
  - Nonce issuance
  - Nonce store size
- Logs for `/api/auth/verify-siwe`:
  - Nonce validation (exists, age)
  - SIWE verification attempts and results
  - Failure reasons with context
  - User creation/lookup
- Minimal safe info logged (redacted)
- Request ID correlation in all logs and responses

### ✅ Goal 5: Frontend Request ID Headers
- X-Request-Id header sent with all auth requests
- UUID v4 generated using crypto.randomUUID() with fallback
- Visible in debug panel for correlation

## Security Measures

### Data Redaction
- **Signatures**: Only first/last 8 characters shown
- **Addresses**: Only first/last 6 characters shown
- **Messages**: Only first/last 20 characters shown
- **Nonces**: Only first/last 8 characters shown in logs
- **JWT Secrets**: Never logged or displayed
- **Full Tokens**: Never logged or displayed

### Production Safety
- Debug panel hidden by default in production (unless explicitly enabled)
- DEBUG_AUTH=false by default (no debug logs in production)
- Request IDs safe to share for support purposes
- No performance impact when debugging disabled

## Testing

### Build Verification
- ✅ Backend builds successfully with TypeScript
- ✅ Frontend builds successfully with Vite
- ✅ No TypeScript errors
- ✅ Code review feedback addressed

### Security Scan
- ✅ CodeQL analysis completed
- ✅ No new security vulnerabilities introduced
- ✅ Pre-existing rate-limiting alert (unrelated to changes)

### Manual Testing Available
- Test script provided: `test-auth-debug.sh`
- Tests nonce endpoint
- Tests error handling with invalid payloads
- Tests nonce validation errors
- Verifies request IDs in responses

## Likely Root Causes Now Detectable

Based on the problem statement, the following issues can now be easily diagnosed:

### 1. Nonce Mismatch (Multi-Instance Backend)
**Detection:**
- Debug logs show `nonceStoreSize` changing erratically
- Nonce "not found" errors despite recent issuance
- Different request IDs showing different store sizes

**Error Message:**
```
Invalid or expired nonce - nonce not found in store
Hint: Nonce may have expired or backend restarted. Multi-instance backends need shared nonce storage (Redis).
```

### 2. Domain/URI Mismatch
**Detection:**
- Debug logs show SIWE verification error details
- Error includes domain/uri validation failures

**Error Message:**
```
SIWE message verification failed
Details: Domain mismatch: expected 'app.example.com', got 'localhost'
```

### 3. Clock Skew Issues
**Detection:**
- Nonce age logged in debug output
- SIWE errors mention notBefore/expirationTime

**Error Message:**
```
Nonce expired (age: 320s, max: 300s)
```

### 4. CORS/Network Issues
**Detection:**
- Frontend debug panel shows failed requests
- No response data or network errors visible
- Request IDs present but no backend logs

### 5. Configuration Issues
**Detection:**
- Backend logs show missing/incorrect env vars
- JWT generation/verification failures
- Database connection errors

## Files Changed

### Backend (4 files, 1 new)
- `backend/src/middleware/requestId.ts` (NEW)
- `backend/src/controllers/authController.ts`
- `backend/src/index.ts`
- `backend/.env.example`

### Frontend (3 files)
- `frontend/src/components/AuthWrapper.tsx`
- `frontend/src/components/DebugPanel.tsx`
- `frontend/src/components/DebugPanel.css`

### Documentation (2 new files)
- `AUTH_DEBUGGING.md`
- `test-auth-debug.sh`

## Usage Instructions

### For Developers
1. Start backend with `DEBUG_AUTH=true npm run dev`
2. Start frontend with `npm run dev`
3. Open app with `?debug=1` query parameter
4. Attempt authentication
5. Check debug panel for request flow
6. Check backend console for detailed logs
7. Use request IDs to correlate frontend and backend events

### For Production Debugging
1. Keep `DEBUG_AUTH=false` in production
2. When user reports auth issue, ask them to add `?debug=1`
3. Have user screenshot debug panel
4. Use request ID to search backend logs
5. Request IDs always included in responses (even without DEBUG_AUTH)

## Next Steps (Out of Scope)

The following are recommended but out of scope for this PR:

1. **Migrate Nonce Storage to Redis**
   - If debug output confirms multi-instance nonce problems
   - Follow-up PR recommended

2. **Rate Limiting**
   - Pre-existing issue on `/api/auth/me` endpoint
   - Should be addressed in separate PR

3. **Persistent Debug State**
   - Currently clears on page refresh
   - Could be enhanced with localStorage

4. **Backend Structured Logging**
   - Consider Winston or similar for production
   - JSON-formatted logs for better parsing

## Conclusion

This PR successfully implements comprehensive debugging for the SIWE authentication flow. All requirements from the problem statement have been met:

- ✅ Full debugging experience for auth flow
- ✅ HTTP status + backend error body surfaced to frontend
- ✅ Client-side debug panel with all requested features
- ✅ Backend debug logging with request correlation
- ✅ Frontend sends X-Request-Id headers
- ✅ All sensitive data properly redacted
- ✅ No secrets logged or displayed
- ✅ Comprehensive documentation provided

The implementation follows security best practices, includes proper error handling, and provides actionable debugging information for diagnosing authentication failures.
