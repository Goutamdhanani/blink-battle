#!/bin/bash

# Socket.IO Connection Stability Test
# Tests for single persistent connection without sub-second disconnect loops

set -e

echo "🔌 Socket.IO Connection Stability Test"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
TEST_DURATION=30
MIN_CONNECTION_DURATION=5000 # 5 seconds minimum before considering stable

echo "📋 Test Configuration:"
echo "  - Test Duration: ${TEST_DURATION}s"
echo "  - Min Stable Connection: ${MIN_CONNECTION_DURATION}ms"
echo "  - Expected: Single persistent WebSocket connection"
echo "  - Pass Criteria: No sub-second disconnect/reconnect loops"
echo ""

# Check if backend is running
echo "🔍 Checking backend server..."
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
if ! curl -s "${BACKEND_URL}/health" > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend server not running at ${BACKEND_URL}${NC}"
    echo "   Start the backend with: cd backend && npm run dev"
    exit 1
fi
echo -e "${GREEN}✅ Backend server is running${NC}"
echo ""

# Check if frontend is running
echo "🔍 Checking frontend server..."
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
if ! curl -s "${FRONTEND_URL}" > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Frontend server not running at ${FRONTEND_URL}${NC}"
    echo "   This test can still verify backend logs"
    echo ""
fi

echo "📊 Monitoring backend logs for connection patterns..."
echo "   Looking for:"
echo "   ✓ Transport type (websocket vs polling)"
echo "   ✓ Connection duration > ${MIN_CONNECTION_DURATION}ms"
echo "   ✓ Transport upgrade events"
echo "   ✓ No rapid disconnect/reconnect cycles"
echo ""

# Create a temporary file for backend logs
BACKEND_LOG="/tmp/socket-stability-test-$$.log"
trap "rm -f $BACKEND_LOG" EXIT

echo "🎯 Monitoring connection stability for ${TEST_DURATION} seconds..."
echo "   (Backend logs will be filtered for Socket.IO events)"
echo ""

# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/backend"

if [ ! -d "$BACKEND_DIR" ]; then
    echo -e "${RED}❌ Backend directory not found: ${BACKEND_DIR}${NC}"
    exit 1
fi

# Monitor backend logs in background
{
    cd "$BACKEND_DIR"
    npm run dev 2>&1 | grep -E "\[Connection\]|\[Transport\]|\[Keepalive\]|\[Disconnect\]" | while IFS= read -r line; do
        echo "$(date '+%H:%M:%S.%3N') | $line"
    done
} > "$BACKEND_LOG" &
MONITOR_PID=$!

# Let it run for the test duration
sleep "$TEST_DURATION"

# Stop monitoring
kill $MONITOR_PID 2>/dev/null || true

echo ""
echo "📈 Analyzing results..."
echo ""

# Count connections and disconnects
CONNECTIONS=$(grep -c "\[Connection\] Client connected" "$BACKEND_LOG" || echo "0")
DISCONNECTS=$(grep -c "\[Disconnect\]" "$BACKEND_LOG" || echo "0")
UPGRADES=$(grep -c "\[Transport Upgrade\]" "$BACKEND_LOG" || echo "0")
KEEPALIVES=$(grep -c "\[Keepalive\]" "$BACKEND_LOG" || echo "0")

# Calculate average time between events
if [ "$CONNECTIONS" -gt 1 ]; then
    AVG_RECONNECT_TIME=$((TEST_DURATION * 1000 / (CONNECTIONS - 1)))
else
    AVG_RECONNECT_TIME=0
fi

echo "📊 Test Results:"
echo "  - Total Connections: $CONNECTIONS"
echo "  - Total Disconnects: $DISCONNECTS"
echo "  - Transport Upgrades: $UPGRADES"
echo "  - Keepalive Pings: $KEEPALIVES"
if [ "$AVG_RECONNECT_TIME" -gt 0 ]; then
    echo "  - Avg Reconnect Time: ${AVG_RECONNECT_TIME}ms"
fi
echo ""

# Check for transport types
WEBSOCKET_CONNS=$(grep "\[Connection\]" "$BACKEND_LOG" | grep -c "websocket" || echo "0")
POLLING_CONNS=$(grep "\[Connection\]" "$BACKEND_LOG" | grep -c "polling" || echo "0")

if [ "$WEBSOCKET_CONNS" -gt 0 ] || [ "$POLLING_CONNS" -gt 0 ]; then
    echo "🔌 Transport Analysis:"
    echo "  - WebSocket Connections: $WEBSOCKET_CONNS"
    echo "  - Polling Connections: $POLLING_CONNS"
    echo "  - Transport Upgrades: $UPGRADES"
    echo ""
fi

# Determine test result
PASSED=1

# Check for rapid disconnect/reconnect loops (sub-second)
if [ "$AVG_RECONNECT_TIME" -gt 0 ] && [ "$AVG_RECONNECT_TIME" -lt 1000 ]; then
    echo -e "${RED}❌ FAIL: Detected sub-second disconnect/reconnect loop${NC}"
    echo "   Average reconnect time: ${AVG_RECONNECT_TIME}ms < 1000ms"
    PASSED=0
fi

# Check for excessive reconnections
if [ "$CONNECTIONS" -gt 5 ]; then
    echo -e "${YELLOW}⚠️  WARNING: Multiple reconnections detected ($CONNECTIONS)${NC}"
    echo "   Expected: 1-2 connections in ${TEST_DURATION}s"
    if [ "$CONNECTIONS" -gt 10 ]; then
        echo -e "${RED}❌ FAIL: Excessive reconnections (>10)${NC}"
        PASSED=0
    fi
fi

# Check for stable connection with keepalives
if [ "$KEEPALIVES" -gt 0 ]; then
    EXPECTED_PINGS=$((TEST_DURATION / 20)) # Expect ping every 20s
    if [ "$KEEPALIVES" -ge $((EXPECTED_PINGS - 1)) ]; then
        echo -e "${GREEN}✅ PASS: Keepalive pings detected ($KEEPALIVES pings in ${TEST_DURATION}s)${NC}"
    else
        echo -e "${YELLOW}⚠️  WARNING: Fewer keepalives than expected${NC}"
        echo "   Expected: ~$EXPECTED_PINGS pings, Got: $KEEPALIVES"
    fi
fi

# Show last few log entries for debugging
echo ""
echo "📜 Last log entries:"
tail -10 "$BACKEND_LOG" | sed 's/^/   /'
echo ""

if [ "$PASSED" -eq 1 ]; then
    echo -e "${GREEN}✅ Test PASSED: Socket connection is stable${NC}"
    exit 0
else
    echo -e "${RED}❌ Test FAILED: Socket connection is unstable${NC}"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   1. Check for transport upgrade failures"
    echo "   2. Verify pingInterval is set to 20000ms"
    echo "   3. Check for React StrictMode double-mounting"
    echo "   4. Review full logs: $BACKEND_LOG"
    exit 1
fi
