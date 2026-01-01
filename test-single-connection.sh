#!/bin/bash

# Test script to verify single WebSocket connection implementation
# Run this after starting both frontend and backend servers

echo "=========================================="
echo "WebSocket Single Connection Test Script"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if servers are running
echo "1. Checking if servers are running..."
echo ""

# Check backend
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend server is running on http://localhost:3001"
else
    echo -e "${RED}✗${NC} Backend server is NOT running on http://localhost:3001"
    echo "   Please start it with: cd backend && npm start"
    exit 1
fi

# Check frontend
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Frontend server is running on http://localhost:3000"
else
    echo -e "${RED}✗${NC} Frontend server is NOT running on http://localhost:3000"
    echo "   Please start it with: cd frontend && npm run dev"
    exit 1
fi

echo ""
echo "=========================================="
echo "2. Manual Testing Instructions"
echo "=========================================="
echo ""

echo "Please follow these steps to verify single connection:"
echo ""

echo -e "${YELLOW}Step 1: Open Developer Tools${NC}"
echo "  - Open http://localhost:3000 in your browser"
echo "  - Press F12 to open Developer Tools"
echo "  - Go to the Network tab"
echo "  - Filter for 'WS' (WebSocket) connections"
echo ""

echo -e "${YELLOW}Step 2: Log In${NC}"
echo "  - Complete the authentication flow"
echo "  - You should see ONE WebSocket connection established"
echo ""

echo -e "${YELLOW}Step 3: Navigate Between Pages${NC}"
echo "  - Go to Dashboard → Matchmaking → Game Arena → Dashboard"
echo "  - Check Network tab: Should still be ONE connection"
echo "  - No new connections should appear"
echo ""

echo -e "${YELLOW}Step 4: Check Console Logs${NC}"
echo "  - Go to Console tab in DevTools"
echo "  - Join matchmaking"
echo "  - Look for logs with '[SocketProvider]' prefix"
echo "  - Should NOT see '[WebSocket]' prefix (old implementation)"
echo "  - Each event should appear only ONCE (no duplicates)"
echo ""

echo -e "${YELLOW}Step 5: Test Early Disconnect Guard${NC}"
echo "  - Start or join a match"
echo "  - Quickly refresh the page (Cmd+R or Ctrl+R)"
echo "  - Check console for: 'Early disconnect ignored'"
echo "  - Match should continue normally after reload"
echo ""

echo -e "${YELLOW}Step 6: Test Reconnection${NC}"
echo "  - Join a match"
echo "  - Open DevTools → Network tab → Set throttling to 'Offline'"
echo "  - Wait 3 seconds"
echo "  - Set throttling back to 'Online'"
echo "  - Socket should reconnect automatically"
echo "  - Match state should be restored"
echo ""

echo "=========================================="
echo "3. Expected Results"
echo "=========================================="
echo ""

echo -e "${GREEN}✓ Exactly ONE WebSocket connection in Network tab${NC}"
echo -e "${GREEN}✓ Connection persists across page navigation${NC}"
echo -e "${GREEN}✓ No duplicate events in Console${NC}"
echo -e "${GREEN}✓ Logs show '[SocketProvider]' prefix${NC}"
echo -e "${GREEN}✓ Early disconnects are ignored (< 5 seconds)${NC}"
echo -e "${GREEN}✓ Automatic reconnection works${NC}"
echo -e "${GREEN}✓ Match state restored after reconnect${NC}"
echo ""

echo "=========================================="
echo "4. Backend Verification"
echo "=========================================="
echo ""

echo "Check backend logs for:"
echo -e "${GREEN}✓ '[Disconnect] Early disconnect ignored'${NC} - for quick reconnects"
echo -e "${GREEN}✓ '[SocketProvider] Connected'${NC} - single connection logs"
echo -e "${GREEN}✓ No duplicate '[Matchmaking] Player X joining'${NC} messages"
echo ""

echo "=========================================="
echo "5. Automated Checks"
echo "=========================================="
echo ""

# Check if old useWebSocket is still being imported in components
echo "Checking for deprecated useWebSocket usage..."
if grep -r "import.*useWebSocket.*from.*hooks/useWebSocket" frontend/src/components/ 2>/dev/null | grep -v "\.tsx:.*//"; then
    echo -e "${RED}✗${NC} Found components still importing useWebSocket!"
    echo "   These should be updated to use 'useSocket' from SocketContext"
else
    echo -e "${GREEN}✓${NC} No components are importing deprecated useWebSocket"
fi
echo ""

# Check if SocketProvider is in App.tsx
echo "Checking if SocketProvider is configured in App.tsx..."
if grep -q "SocketProvider" frontend/src/App.tsx 2>/dev/null; then
    echo -e "${GREEN}✓${NC} SocketProvider is configured in App.tsx"
else
    echo -e "${RED}✗${NC} SocketProvider is NOT in App.tsx"
    echo "   Please wrap your app with <SocketProvider>"
fi
echo ""

# Check if useSocket is being used
echo "Checking if components use useSocket..."
if grep -r "useSocket" frontend/src/components/ 2>/dev/null | grep -q "from.*SocketContext"; then
    echo -e "${GREEN}✓${NC} Components are using useSocket from SocketContext"
else
    echo -e "${YELLOW}⚠${NC}  No components found using useSocket"
    echo "   Make sure Matchmaking and GameArena use the shared socket"
fi
echo ""

echo "=========================================="
echo "Test script completed!"
echo "=========================================="
echo ""
echo "For detailed documentation, see: WEBSOCKET_SINGLE_CONNECTION.md"
echo ""
