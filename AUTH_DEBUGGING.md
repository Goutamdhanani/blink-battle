# Authentication Debugging Guide

This guide explains how to use the debugging features added to help diagnose SIWE (Sign-In with Ethereum) authentication issues in Blink Battle.

## Overview

The debugging system provides comprehensive visibility into the authentication flow, including:
- Request/response tracking with correlation IDs
- Detailed error messages from backend
- Real-time diagnostics panel showing MiniKit state
- Complete auth flow tracking (nonce → walletAuth → verify-siwe)

## Frontend Debugging

### Enabling the Debug Panel

The debug panel can be enabled in two ways:

1. **Development Mode**: Automatically shown when running `npm run dev`
2. **Query Parameter**: Add `?debug=1` to any URL (e.g., `https://app.example.com?debug=1`)

### Debug Panel Features

The debug panel displays:

#### Environment Section
- **API URL**: The backend API endpoint being used (`VITE_API_URL`)
- **Mode**: Development or Production

#### MiniKit Status Section
- **MiniKit Installed**: Whether MiniKit is available
- **MiniKit Ready**: Whether MiniKit is initialized and ready
- **World App Version**: The version of World App
- **Supported Commands**: List of available MiniKit commands

#### Authentication Flow Tracking

**Last Nonce Request**:
- Request ID (click to copy)
- Timestamp
- Nonce received (redacted)
- Any errors

**Last Wallet Auth**:
- Timestamp
- Nonce used
- Status (success/error)
- Address (redacted to first/last 6 chars)
- Signature (redacted to first/last 8 chars)
- Any errors

**Last Verify SIWE Request**:
- Request ID (click to copy)
- Timestamp
- HTTP Status Code
- Full response body (click to copy as JSON)
- Any errors

### Improved Error Messages

When authentication fails, the UI now displays:
- HTTP status code
- Detailed error message from backend
- Helpful hints (e.g., about multi-instance nonce issues)
- Request ID for correlation with backend logs

Example error:
```
Backend verification failed (HTTP 401)
Invalid or expired nonce - nonce not found in store

Hint: Nonce may have expired or backend restarted. Multi-instance backends need shared nonce storage (Redis).

Request ID: abc123de-...
```

## Backend Debugging

### Enabling Debug Logging

Set the `DEBUG_AUTH` environment variable to `true`:

```bash
# .env file
DEBUG_AUTH=true
```

### Debug Log Format

Debug logs include:
- **Request ID**: Correlation ID from `X-Request-Id` header
- **Operation**: The auth operation being performed
- **Redacted Values**: Sensitive data shown partially (first/last N chars)
- **Context**: Additional context like nonce store size, timing, etc.

#### Example Logs

**Nonce Generation**:
```
[Auth:getNonce] requestId=abc123de-... nonce=AB12CD...XY78 nonceStoreSize=5
```

**Nonce Validation Failure**:
```
[Auth:verifySiwe] requestId=def456gh-... error: Invalid or expired nonce - nonce not found in store nonce=EF34GH...IJ90 nonceStoreSize=3
```

**Successful SIWE Verification**:
```
[Auth:verifySiwe] requestId=ghi789jk-... nonce validated, age=2s, attempting SIWE verification
[Auth:verifySiwe] requestId=ghi789jk-... SIWE verification successful, wallet=0x1234...5678
[Auth:verifySiwe] requestId=ghi789jk-... existing user userId=42
```

**SIWE Verification Error**:
```
[Auth:verifySiwe] requestId=jkl012mn-... error: SIWE message verification failed siweError=Invalid signature
```

### Enhanced Error Responses

All error responses now include:
- **error**: Human-readable error message
- **requestId**: Correlation ID for tracing
- **hint** (optional): Helpful suggestion for resolution
- **details** (optional): Additional technical details when DEBUG_AUTH=true

Example error response:
```json
{
  "error": "Invalid or expired nonce - nonce not found in store",
  "requestId": "abc123de-4567-8901-2345-678901234567",
  "hint": "Nonce may have expired or backend restarted. Multi-instance backends need shared nonce storage (Redis)."
}
```

## Request Correlation

### Request ID Flow

1. **Frontend** generates a UUID v4 for each auth request
2. **Frontend** sends `X-Request-Id` header with the UUID
3. **Backend** middleware attaches the request ID to the request object
4. **Backend** includes request ID in all logs and error responses
5. **Backend** returns `X-Request-Id` in response headers
6. **Frontend** tracks request ID in debug panel for correlation

### Finding Related Logs

To trace a specific authentication attempt:

1. Open the debug panel and note the Request ID
2. Search backend logs for that Request ID
3. All operations for that request will have the same ID

Example:
```bash
# Find all logs for a specific request
grep "requestId=abc123de" backend.log

# Or using journalctl
journalctl -u blink-battle-backend | grep "requestId=abc123de"
```

## Common Issues and What to Look For

### Issue: "Invalid or expired nonce"

**Debug Steps**:
1. Check `nonceStoreSize` in logs - is it growing or staying small?
2. Check request timing - is there a large gap between nonce request and verify?
3. Check if multiple backend instances are running (nonces are in-memory)

**Likely Causes**:
- Multi-instance backend without shared nonce storage
- User took too long to approve (> 5 minutes)
- Backend restarted between nonce generation and verification

**Solution**:
- Implement Redis-based nonce storage for multi-instance deployments
- Increase nonce expiration time if users need more time
- Ensure backend stability

### Issue: "SIWE message verification failed"

**Debug Steps**:
1. Check the SIWE error details in logs
2. Verify `domain` and `uri` match expectations
3. Check for clock skew issues

**Likely Causes**:
- Incorrect domain/uri in SIWE message
- Clock skew causing `notBefore`/`expirationTime` validation failures
- Invalid signature (tampering or MiniKit bug)

**Solution**:
- Verify backend and frontend URLs match expected domain
- Check server time synchronization (NTP)
- Report to Worldcoin if MiniKit issue suspected

### Issue: "Backend verification failed (HTTP 500)"

**Debug Steps**:
1. Check backend error logs for the request ID
2. Look for stack traces or database errors
3. Verify all required environment variables are set

**Likely Causes**:
- Database connection issues
- Missing JWT_SECRET environment variable
- Unhandled exception in verification logic

**Solution**:
- Check database connectivity
- Ensure all environment variables are configured
- Review backend error logs for specific error

## Production Considerations

### Disabling Debug Features

**Frontend**:
- Debug panel automatically hidden in production (unless `?debug=1` is used)
- Remove `?debug=1` from URLs in production use

**Backend**:
- Set `DEBUG_AUTH=false` (or don't set it) in production
- Debug logs will not be written, reducing log volume
- Error responses still include request IDs for support cases

### Security Notes

- Signatures are redacted (first/last chars only) in logs and UI
- Full wallet addresses are redacted in debug panel
- SIWE messages are not logged in full
- JWT secrets are never logged
- Request IDs are safe to share for support purposes

### Performance Impact

- Frontend: Minimal impact, debug panel only renders when visible
- Backend: Debug logging adds ~5-10ms per request when enabled
- No impact when DEBUG_AUTH is disabled

## Support

When reporting authentication issues, please provide:
1. Request ID from the debug panel or error message
2. Screenshot of debug panel (if frontend issue)
3. Relevant backend logs for the request ID
4. Steps to reproduce
5. Timestamp of the issue

This information will help quickly diagnose and resolve authentication problems.
