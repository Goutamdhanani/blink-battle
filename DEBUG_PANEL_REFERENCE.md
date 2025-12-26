# Debug Panel Visual Reference

## Location
The debug panel appears in the bottom-right corner of the screen as a dark overlay with green borders.

## Layout

```
┌─────────────────────────────────────────────────┐
│ 🔍 Auth Debug Panel ▼                    🔄    │
├─────────────────────────────────────────────────┤
│                                                 │
│ ENVIRONMENT                                     │
│ ├─ API URL: https://api.blumea.me              │
│ └─ Mode: Development                            │
│                                                 │
│ MINIKIT STATUS                                  │
│ ├─ MiniKit Installed: ✅ Yes                    │
│ ├─ MiniKit Ready: ✅ Yes                        │
│ ├─ World App Version: 1.2.3                    │
│ └─ Supported Commands:                          │
│    [walletAuth] [pay] [sendTransaction]        │
│                                                 │
│ LAST NONCE REQUEST                              │
│ ├─ Request ID: abc123de... 📋                   │
│ ├─ Timestamp: 10:45:23.456                     │
│ └─ Nonce: AB12CD...XY78                        │
│                                                 │
│ LAST WALLET AUTH                                │
│ ├─ Timestamp: 10:45:25.123                     │
│ ├─ Nonce Used: AB12CD...XY78                   │
│ ├─ Status: success                             │
│ ├─ Address (redacted): 0x1234...5678           │
│ └─ Signature (redacted): 0xabcd...ef01         │
│                                                 │
│ LAST VERIFY SIWE REQUEST                        │
│ ├─ Request ID: def456gh... 📋                   │
│ ├─ Timestamp: 10:45:26.789                     │
│ ├─ HTTP Status: 401                            │
│ └─ Response: (click to copy)                    │
│    {                                            │
│      "error": "Invalid or expired nonce",      │
│      "requestId": "def456gh-...",              │
│      "hint": "Nonce may have expired..."       │
│    }                                            │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Color Coding

- **Green (#00ff88)**: Success indicators, borders, titles
- **Red (#ff4444)**: Error states, failed statuses
- **White (#fff)**: Normal text
- **Gray (#888)**: Labels and secondary text
- **Black/Transparent**: Background with high opacity

## Interactive Features

1. **Header**: Click to expand/collapse the panel
2. **Refresh Button (🔄)**: Manually refresh diagnostics
3. **Request IDs**: Click to copy to clipboard (shows 📋 icon)
4. **JSON Responses**: Click to copy full JSON to clipboard
5. **Auto-refresh**: Panel updates every 2 seconds automatically

## States

### Collapsed State
```
┌─────────────────────────────────────────────────┐
│ 🔍 Auth Debug Panel ▶                    🔄    │
└─────────────────────────────────────────────────┘
```

### Error State Example
```
LAST VERIFY SIWE REQUEST
├─ Request ID: xyz789... 📋
├─ Timestamp: 10:45:30.123
├─ HTTP Status: 500 (red)
└─ Response:
   {
     "error": "Authentication failed - internal server error",
     "requestId": "xyz789...",
     "details": "Database connection failed"
   }
```

### Success State Example
```
LAST VERIFY SIWE REQUEST
├─ Request ID: abc123... 📋
├─ Timestamp: 10:45:35.456
├─ HTTP Status: 200 (green)
└─ Response:
   {
     "success": true,
     "token": "eyJ...",
     "user": {
       "userId": 123,
       "walletAddress": "0x1234...5678",
       ...
     }
   }
```

## Responsive Behavior

### Desktop (> 480px)
- Fixed position: bottom-right
- Max-width: 450px
- Max-height: 80vh
- Scrollable if content exceeds height

### Mobile (≤ 480px)
- Full width (with 10px margins)
- Fixed position: bottom
- Scrollable vertically

## Usage Examples

### Example 1: Debugging Nonce Expiration
When you see:
```
LAST VERIFY SIWE REQUEST
├─ HTTP Status: 401
└─ Response:
   {
     "error": "Invalid or expired nonce - nonce not found in store",
     "hint": "Nonce may have expired or backend restarted..."
   }
```

You can:
1. Note the time difference between NONCE REQUEST and VERIFY SIWE
2. Check if it exceeds 5 minutes (nonce expiration)
3. Look for backend restarts (causing nonce store loss)

### Example 2: Debugging Multi-Instance Issues
When backend logs show (with DEBUG_AUTH=true):
```
[Auth:getNonce] requestId=abc123... nonceStoreSize=15
[Auth:verifySiwe] requestId=def456... nonce not found, nonceStoreSize=8
```

The changing `nonceStoreSize` indicates requests hitting different instances.

### Example 3: Request Correlation
Frontend debug panel shows:
```
Request ID: abc123de-4567-8901-2345-678901234567 📋
```

Search backend logs:
```bash
grep "requestId=abc123de" backend.log
```

See full flow:
```
[Auth:getNonce] requestId=abc123de-... nonce=XYZ...789 nonceStoreSize=3
[Auth:verifySiwe] requestId=abc123de-... nonce validated, age=2s
[Auth:verifySiwe] requestId=abc123de-... SIWE verification successful
```

## Tips

1. **Always enable with ?debug=1** in production for troubleshooting
2. **Screenshot the panel** when reporting issues
3. **Copy request IDs** to correlate with backend logs
4. **Check timestamps** to identify timeout issues
5. **Look for HTTP status codes** to understand failure type:
   - 400: Invalid request (bad payload)
   - 401: Authentication failed (nonce/signature issues)
   - 500: Backend error (database, config, etc.)

## Privacy Note

All sensitive data is automatically redacted in the debug panel:
- Wallet addresses: `0x1234...5678` (first/last 6 chars)
- Signatures: `0xabcd...ef01` (first/last 8 chars)
- Messages: `Lorem ipsum...dolor sit` (first/last 20 chars)
- Nonces: `AB12CD...XY78` (first/last 12 chars)

Full values are NEVER displayed or logged.
