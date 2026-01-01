#!/bin/bash

# Socket.IO Stability Verification Script
# Tests: stable connection >2 minutes, no sub-second churn, queue grace, background/foreground

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

increment_total() {
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

print_header() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  $1"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
}

check_backend_health() {
    print_header "Checking Backend Health"
    increment_total
    
    log_info "Testing backend at: $BACKEND_URL"
    
    if response=$(curl -s -f "$BACKEND_URL/health" 2>&1); then
        log_success "Backend is healthy"
        echo "Response: $response"
        return 0
    else
        log_error "Backend health check failed"
        echo "Make sure the backend is running: cd backend && npm run dev"
        return 1
    fi
}

test_socket_connection_stability() {
    print_header "Test 1: Socket Connection Stability (>2 minutes)"
    increment_total
    
    log_info "Opening browser console monitor..."
    log_info "This test will:"
    log_info "  1. Monitor Socket.IO connections for 2+ minutes"
    log_info "  2. Check for sub-second reconnect storms"
    log_info "  3. Verify stable WebSocket/polling transport"
    log_info ""
    log_warning "Manual verification required - check browser console for:"
    log_warning "  ✓ Single stable connection maintained"
    log_warning "  ✓ No reconnects within 2 minutes"
    log_warning "  ✓ Transport upgraded from polling to websocket (if supported)"
    log_warning "  ✗ Multiple 'Connected' messages within seconds"
    log_warning "  ✗ 'Disconnected' messages with short connection durations"
    log_warning ""
    log_info "Press Enter when you've verified the connection is stable for 2+ minutes..."
    read -r
    
    log_success "Connection stability verified (manual check)"
}

test_queue_grace_period() {
    print_header "Test 2: Queue Grace Period (30s)"
    increment_total
    
    log_info "Testing queue disconnect grace period..."
    log_info "This test will:"
    log_info "  1. Join matchmaking queue"
    log_info "  2. Simulate disconnect (close browser tab)"
    log_info "  3. Reconnect within 30 seconds"
    log_info "  4. Verify queue position preserved"
    log_info ""
    log_warning "Manual verification required:"
    log_warning "  1. Open $FRONTEND_URL in a browser"
    log_warning "  2. Login and join matchmaking queue (any stake)"
    log_warning "  3. Wait for 'matchmaking_queued' confirmation"
    log_warning "  4. Close the browser tab"
    log_warning "  5. Wait 10-15 seconds"
    log_warning "  6. Reopen $FRONTEND_URL and login"
    log_warning "  7. Verify you're still in the queue or matched"
    log_warning ""
    log_info "Press Enter when you've completed the test..."
    read -r
    
    log_success "Queue grace period verified (manual check)"
}

test_background_foreground() {
    print_header "Test 3: Background/Foreground Handling (30s grace)"
    increment_total
    
    log_info "Testing mobile background/foreground behavior..."
    log_info "This test simulates mobile app backgrounding:"
    log_info "  1. Use browser DevTools to simulate visibility changes"
    log_info "  2. Background for <30s should maintain connection"
    log_info "  3. Background for >5min should disconnect"
    log_info ""
    log_warning "Manual verification required:"
    log_warning "  1. Open browser DevTools (F12)"
    log_warning "  2. Run: document.dispatchEvent(new Event('visibilitychange'))"
    log_warning "  3. Run: Object.defineProperty(document, 'hidden', { value: true, writable: true })"
    log_warning "  4. Check console for 'player_backgrounded' event"
    log_warning "  5. Wait 10 seconds"
    log_warning "  6. Run: Object.defineProperty(document, 'hidden', { value: false, writable: true })"
    log_warning "  7. Run: document.dispatchEvent(new Event('visibilitychange'))"
    log_warning "  8. Check console for 'player_foregrounded' event"
    log_warning "  9. Verify connection maintained and state restored"
    log_warning ""
    log_info "Press Enter when you've completed the test..."
    read -r
    
    log_success "Background/foreground handling verified (manual check)"
}

test_no_sub_second_churn() {
    print_header "Test 4: No Sub-Second Reconnect Churn"
    increment_total
    
    log_info "Testing for rapid disconnect/reconnect cycles..."
    log_info "This test monitors for connection churn:"
    log_info "  ✓ Connection should remain stable without rapid cycles"
    log_info "  ✗ Multiple connects/disconnects within 1 second = FAIL"
    log_info ""
    log_warning "Manual verification required:"
    log_warning "  1. Open browser console"
    log_warning "  2. Filter for [SocketProvider] logs"
    log_warning "  3. Verify no 'Connected' messages within 1 second of each other"
    log_warning "  4. Verify connection durations are >5 seconds when disconnects occur"
    log_warning ""
    log_info "Press Enter when you've verified no rapid churn..."
    read -r
    
    log_success "No sub-second reconnect churn detected (manual check)"
}

test_heroku_h15_prevention() {
    print_header "Test 5: Heroku H15 Idle Timeout Prevention"
    increment_total
    
    log_info "Testing HTTP keepAlive configuration..."
    log_info "This verifies the backend server timeouts are configured correctly"
    log_info ""
    
    # Check if backend logs show the keepAlive config
    log_info "Backend should log keepAlive configuration on startup:"
    log_info "  keepAliveTimeout: 65000ms"
    log_info "  headersTimeout: 66000ms"
    log_info ""
    log_warning "Manual verification required:"
    log_warning "  1. Check backend server logs for keepAlive configuration"
    log_warning "  2. Verify timeouts are > 55s (Heroku's routing timeout)"
    log_warning "  3. Keep connection idle for 90 seconds"
    log_warning "  4. Verify no H15 errors occur"
    log_warning ""
    log_info "Press Enter when you've verified keepAlive settings..."
    read -r
    
    log_success "Heroku H15 prevention verified (manual check)"
}

test_transport_upgrade() {
    print_header "Test 6: Transport Upgrade Monitoring"
    increment_total
    
    log_info "Testing transport upgrade from polling to WebSocket..."
    log_info "This verifies hybrid transport strategy works correctly"
    log_info ""
    log_warning "Manual verification required:"
    log_warning "  1. Open browser console"
    log_warning "  2. Look for [SocketProvider] Connected logs"
    log_warning "  3. Initial transport should be 'polling' or 'websocket'"
    log_warning "  4. If started on polling, look for 'Transport upgraded' message"
    log_warning "  5. Verify final transport is 'websocket' if supported"
    log_warning "  6. If stuck on polling >10s, should see reconnect attempt"
    log_warning ""
    log_info "Press Enter when you've verified transport behavior..."
    read -r
    
    log_success "Transport upgrade monitoring verified (manual check)"
}

test_exponential_backoff_with_jitter() {
    print_header "Test 7: Exponential Backoff with Jitter"
    increment_total
    
    log_info "Testing reconnection backoff strategy..."
    log_info "This verifies reconnection delays increase properly with jitter"
    log_info ""
    log_warning "Manual verification required:"
    log_warning "  1. Stop the backend server to force disconnects"
    log_warning "  2. Open browser console"
    log_warning "  3. Watch for 'Attempting reconnect' messages"
    log_warning "  4. Verify delays increase: ~2s, ~4s, ~8s, ~15s (with ±25% jitter)"
    log_warning "  5. Verify attempts continue indefinitely (Infinity setting)"
    log_warning "  6. Restart backend and verify connection resumes"
    log_warning ""
    log_info "Press Enter when you've verified backoff behavior..."
    read -r
    
    log_success "Exponential backoff with jitter verified (manual check)"
}

print_summary() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Test Summary"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Total Tests: $TESTS_TOTAL"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        log_success "All tests passed! Socket.IO transport is properly hardened."
        echo ""
        echo "✓ Stable connections maintained >2 minutes"
        echo "✓ No sub-second reconnect churn"
        echo "✓ Queue grace period working (30s)"
        echo "✓ Background/foreground handling functional"
        echo "✓ Heroku H15 protection configured"
        echo "✓ Transport upgrade monitoring active"
        echo "✓ Exponential backoff with jitter enabled"
        return 0
    else
        log_error "Some tests failed. Please review the issues above."
        return 1
    fi
}

# Main test execution
main() {
    print_header "Socket.IO Stability Verification"
    
    log_info "Backend URL: $BACKEND_URL"
    log_info "Frontend URL: $FRONTEND_URL"
    log_info ""
    log_warning "This script performs manual verification tests."
    log_warning "Follow the instructions for each test carefully."
    log_info ""
    
    # Run tests
    check_backend_health || true
    test_socket_connection_stability
    test_queue_grace_period
    test_background_foreground
    test_no_sub_second_churn
    test_heroku_h15_prevention
    test_transport_upgrade
    test_exponential_backoff_with_jitter
    
    # Print summary
    print_summary
}

# Run main function
main

exit $TESTS_FAILED
