#!/bin/bash
# Manual test script for auth debugging features
# This script tests the backend endpoints with debug logging enabled

set -e

echo "🧪 Testing Auth Debugging Features"
echo "=================================="
echo ""

# Check if backend is running
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
echo "Backend URL: $BACKEND_URL"
echo ""

# Generate a test request ID
REQUEST_ID=$(cat /proc/sys/kernel/random/uuid)

echo "📋 Test 1: GET /api/auth/nonce"
echo "Request ID: $REQUEST_ID"
echo ""

NONCE_RESPONSE=$(curl -s -X GET "$BACKEND_URL/api/auth/nonce" \
  -H "X-Request-Id: $REQUEST_ID" \
  -w "\nHTTP_STATUS:%{http_code}\n")

echo "Response:"
echo "$NONCE_RESPONSE" | grep -v "HTTP_STATUS"
HTTP_STATUS=$(echo "$NONCE_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
echo ""
echo "HTTP Status: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" != "200" ]; then
  echo "❌ Nonce request failed!"
  exit 1
fi

NONCE=$(echo "$NONCE_RESPONSE" | grep -v "HTTP_STATUS" | jq -r '.nonce')
RETURNED_REQUEST_ID=$(echo "$NONCE_RESPONSE" | grep -v "HTTP_STATUS" | jq -r '.requestId')

echo "✅ Nonce received: ${NONCE:0:12}..."
echo "✅ Request ID returned: $RETURNED_REQUEST_ID"
echo ""

# Test 2: Invalid payload to trigger error
REQUEST_ID_2=$(cat /proc/sys/kernel/random/uuid)
echo "📋 Test 2: POST /api/auth/verify-siwe (invalid payload - should fail)"
echo "Request ID: $REQUEST_ID_2"
echo ""

VERIFY_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/auth/verify-siwe" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $REQUEST_ID_2" \
  -d '{"payload": {"status": "error", "error_code": "user_rejected"}}' \
  -w "\nHTTP_STATUS:%{http_code}\n")

echo "Response:"
echo "$VERIFY_RESPONSE" | grep -v "HTTP_STATUS" | jq '.' 2>/dev/null || echo "$VERIFY_RESPONSE" | grep -v "HTTP_STATUS"
HTTP_STATUS_2=$(echo "$VERIFY_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
echo ""
echo "HTTP Status: $HTTP_STATUS_2"
echo ""

if [ "$HTTP_STATUS_2" != "400" ]; then
  echo "⚠️  Expected HTTP 400, got $HTTP_STATUS_2"
else
  echo "✅ Correctly returned HTTP 400 for invalid payload"
fi

ERROR_MESSAGE=$(echo "$VERIFY_RESPONSE" | grep -v "HTTP_STATUS" | jq -r '.error' 2>/dev/null || echo "")
RETURNED_REQUEST_ID_2=$(echo "$VERIFY_RESPONSE" | grep -v "HTTP_STATUS" | jq -r '.requestId' 2>/dev/null || echo "")

if [ -n "$ERROR_MESSAGE" ]; then
  echo "✅ Error message included: $ERROR_MESSAGE"
fi

if [ -n "$RETURNED_REQUEST_ID_2" ]; then
  echo "✅ Request ID returned in error: $RETURNED_REQUEST_ID_2"
fi
echo ""

# Test 3: Invalid nonce to trigger nonce validation error
REQUEST_ID_3=$(cat /proc/sys/kernel/random/uuid)
echo "📋 Test 3: POST /api/auth/verify-siwe (invalid nonce - should fail)"
echo "Request ID: $REQUEST_ID_3"
echo ""

VERIFY_RESPONSE_3=$(curl -s -X POST "$BACKEND_URL/api/auth/verify-siwe" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $REQUEST_ID_3" \
  -d "{\"payload\": {\"status\": \"success\", \"nonce\": \"invalid_nonce_12345\"}}" \
  -w "\nHTTP_STATUS:%{http_code}\n")

echo "Response:"
echo "$VERIFY_RESPONSE_3" | grep -v "HTTP_STATUS" | jq '.' 2>/dev/null || echo "$VERIFY_RESPONSE_3" | grep -v "HTTP_STATUS"
HTTP_STATUS_3=$(echo "$VERIFY_RESPONSE_3" | grep "HTTP_STATUS" | cut -d: -f2)
echo ""
echo "HTTP Status: $HTTP_STATUS_3"
echo ""

if [ "$HTTP_STATUS_3" != "401" ]; then
  echo "⚠️  Expected HTTP 401, got $HTTP_STATUS_3"
else
  echo "✅ Correctly returned HTTP 401 for invalid nonce"
fi

ERROR_MESSAGE_3=$(echo "$VERIFY_RESPONSE_3" | grep -v "HTTP_STATUS" | jq -r '.error' 2>/dev/null || echo "")
HINT_3=$(echo "$VERIFY_RESPONSE_3" | grep -v "HTTP_STATUS" | jq -r '.hint' 2>/dev/null || echo "")

if [ -n "$ERROR_MESSAGE_3" ] && [ "$ERROR_MESSAGE_3" != "null" ]; then
  echo "✅ Error message included: $ERROR_MESSAGE_3"
fi

if [ -n "$HINT_3" ] && [ "$HINT_3" != "null" ]; then
  echo "✅ Helpful hint included: $HINT_3"
fi
echo ""

echo "=================================="
echo "✅ All tests completed!"
echo ""
echo "👀 Check backend logs for debug output (if DEBUG_AUTH=true):"
echo "   - Look for requestIds: $REQUEST_ID, $REQUEST_ID_2, $REQUEST_ID_3"
echo "   - Verify redacted values are shown (e.g., nonce=ABC...XYZ)"
echo "   - Verify nonceStoreSize is logged"
echo ""
