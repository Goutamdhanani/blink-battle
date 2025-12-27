#!/bin/bash

# Verification script for Practice Mode implementation
# This script checks that practice mode doesn't use socket connections

echo "🔍 Verifying Practice Mode Implementation..."
echo ""

# Check 1: Verify PracticeMode component doesn't import useWebSocket
echo "✓ Check 1: PracticeMode component should not import useWebSocket"
if grep -q "useWebSocket" frontend/src/components/PracticeMode.tsx; then
    echo "❌ FAIL: PracticeMode imports useWebSocket"
    exit 1
else
    echo "✅ PASS: PracticeMode does not import useWebSocket"
fi
echo ""

# Check 2: Verify PracticeMode component doesn't use socket
echo "✓ Check 2: PracticeMode component should not use socket"
if grep -q "socket\|joinMatchmaking\|emit" frontend/src/components/PracticeMode.tsx; then
    echo "❌ FAIL: PracticeMode uses socket operations"
    exit 1
else
    echo "✅ PASS: PracticeMode does not use socket operations"
fi
echo ""

# Check 3: Verify Dashboard navigates to /practice for Play Free
echo "✓ Check 3: Dashboard should navigate to /practice for Play Free"
if grep -q "navigate('/practice')" frontend/src/components/Dashboard.tsx; then
    echo "✅ PASS: Dashboard navigates to /practice"
else
    echo "❌ FAIL: Dashboard does not navigate to /practice"
    exit 1
fi
echo ""

# Check 4: Verify /practice route exists in App.tsx
echo "✓ Check 4: /practice route should exist in App.tsx"
if grep -q 'path="/practice"' frontend/src/App.tsx; then
    echo "✅ PASS: /practice route exists in App.tsx"
else
    echo "❌ FAIL: /practice route not found in App.tsx"
    exit 1
fi
echo ""

# Check 5: Verify PracticeMode component exists
echo "✓ Check 5: PracticeMode component files should exist"
if [ -f "frontend/src/components/PracticeMode.tsx" ] && [ -f "frontend/src/components/PracticeMode.css" ]; then
    echo "✅ PASS: PracticeMode component files exist"
else
    echo "❌ FAIL: PracticeMode component files not found"
    exit 1
fi
echo ""

# Check 6: Verify backend logging improvements
echo "✓ Check 6: Backend should have improved logging for multiplayer"
if grep -q "Multiplayer matchmaking:" backend/src/websocket/gameHandler.ts; then
    echo "✅ PASS: Backend has improved logging"
else
    echo "❌ FAIL: Backend logging not improved"
    exit 1
fi
echo ""

# Check 7: Verify builds succeed
echo "✓ Check 7: Frontend should build successfully"
cd frontend
if npm run build > /dev/null 2>&1; then
    echo "✅ PASS: Frontend builds successfully"
else
    echo "❌ FAIL: Frontend build failed"
    exit 1
fi
cd ..
echo ""

echo "✓ Check 8: Backend should build successfully"
cd backend
if npm run build > /dev/null 2>&1; then
    echo "✅ PASS: Backend builds successfully"
else
    echo "❌ FAIL: Backend build failed"
    exit 1
fi
cd ..
echo ""

echo "🎉 All verification checks passed!"
echo ""
echo "Summary of changes:"
echo "- Practice mode is now fully client-side (no socket connections)"
echo "- Dashboard navigates to /practice for single-player mode"
echo "- Backend logging enhanced to distinguish multiplayer from practice"
echo "- Multiplayer flow remains unchanged"
echo ""
echo "Next steps for manual testing:"
echo "1. Start backend: cd backend && npm run dev"
echo "2. Start frontend: cd frontend && npm run dev"
echo "3. Test Practice mode: Click 'Play Free' on Dashboard"
echo "4. Verify no socket logs appear in backend console"
echo "5. Test Multiplayer: Click 'Play for Stakes' on Dashboard"
echo "6. Verify multiplayer socket logs appear correctly"
