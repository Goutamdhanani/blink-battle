# Production Test Acceptance Criteria

## ✅ MUST-PASS TEST CASES

### 🔐 MiniKit Payment Flow

#### Payment Approval
- [ ] approve → confirmed → game starts
  - User initiates payment
  - Payment is approved in World App
  - Status normalizes to `confirmed`
  - Both players confirmed → game countdown begins
  - No errors or blue screens

#### Payment Decline
- [ ] decline → error state & restart allowed
  - User declines payment
  - Status normalizes to `cancelled`
  - Clear error message displayed
  - User can retry payment flow
  - No stuck states

#### Payment Pending
- [ ] pending → spinner + no start
  - Payment initiated but not confirmed
  - Status shows as `pending`
  - Loading spinner displayed
  - Game does NOT start
  - Clear "waiting for confirmation" message

#### Network Issues
- [ ] loss of network mid-payment
  - Payment initiated
  - Network drops during processing
  - Worker retries with exponential backoff
  - Payment eventually confirms or times out
  - User sees appropriate status

#### Payment Retries
- [ ] payment retries
  - Payment fails temporarily (API error)
  - Worker schedules retry with backoff
  - Retry succeeds without duplicate charge
  - Status updates correctly

#### Idempotency
- [ ] same match → no double charge
  - User pays for match
  - User tries to pay again (refresh/retry)
  - Second payment uses same reference
  - Only one charge occurs
  - Idempotency key prevents duplicate

---

### 🎮 Gameplay Flow

#### Normal Game
- [ ] both tap → winner correct
  - Both players ready
  - Green light shows
  - Both players tap
  - Faster tap wins
  - Winner determined by server timestamp
  - Reaction times displayed correctly (clamped to 0-5000ms)

#### False Start
- [ ] one false-starts → auto loss
  - Countdown in progress
  - Player1 taps early (before green light)
  - Player1 disqualified immediately
  - Player2 wins automatically
  - Clear "false start" message

#### Both False Start
- [ ] both false-start → rematch
  - Both players tap early
  - Both disqualified
  - Match state = rematch or refund
  - Stakes refunded
  - Can play again

#### Tie Game
- [ ] tie ±1ms → split payout
  - Both tap within 1ms of each other
  - Server declares tie
  - Stakes refunded minus platform fee
  - Both players see "tie" message

#### Timeout
- [ ] both timeout → refund
  - Green light shown
  - Neither player taps within 5 seconds
  - Match times out
  - Stakes refunded
  - Clear timeout message

#### Player Disconnect
- [ ] player disconnects mid-match
  - Player1 disconnects after green light
  - Player2 taps
  - Match completes normally
  - Player1 forfeits by timeout
  - Player2 wins

#### Refresh Mid-Match
- [ ] refresh mid-match
  - Player refreshes browser during match
  - Error boundary catches any errors
  - User sees "match in progress" or redirect to dashboard
  - No crash or blank screen

#### Server Restart
- [ ] dyno restart mid-match
  - Match in progress
  - Heroku dyno restarts
  - Payment worker stops gracefully
  - No locked payments stuck forever
  - Payments retry after restart

---

### 💸 Payments & Transactions

#### Worker Crash Recovery
- [ ] worker restart during tx
  - Payment worker processing transaction
  - Worker crashes (kill -9)
  - Transaction lock expires (60s timeout)
  - New worker picks up payment
  - Payment processed successfully
  - No duplicate charges

#### RPC Failures
- [ ] RPC 500s
  - Developer Portal API returns 500
  - Worker logs error
  - Worker schedules retry with backoff
  - Eventually succeeds or marks failed
  - No silent failures

#### Payment Replay
- [ ] repeated payment replay attempt
  - Client sends confirmPayment multiple times
  - Server uses idempotency key
  - Only one update occurs
  - All requests return same result
  - No race conditions

#### Reference Reuse
- [ ] same payment reference reused
  - Same matchId + userId + amount
  - Generates same deterministic reference
  - Second payment returns existing
  - No duplicate intents created

#### Reference Mismatch
- [ ] payment reference mismatch
  - Client sends reference A
  - Server expects reference B
  - 404 error returned
  - Clear error message
  - No crash

#### Transaction Hash
- [ ] tx hash stored exactly once
  - Payment confirmed
  - Transaction hash stored in payment_intents
  - Hash never overwritten
  - Available for payout verification

---

### 🧯 Stability & Error Handling

#### React Error Boundary
- [ ] no unhandled React crashes
  - Any component error caught
  - Error boundary displays message
  - User can reload app
  - No blue/blank screens

#### Invalid Time Value
- [ ] no "Invalid time value"
  - Green light time validated
  - Server timestamp validated
  - Client timestamp validated
  - Negative/invalid times rejected gracefully
  - Clear error messages (not 500s)

#### Polling Stops
- [ ] polling stops on resolved
  - Match completes
  - Polling interval cleared IMMEDIATELY
  - No further API calls
  - CPU/battery saved
  - Verified in browser DevTools Network tab

#### Leaderboard Nulls
- [ ] leaderboard handles null
  - avgReactionTime = null
  - formatReactionTime returns "--"
  - No crashes
  - No NaN displayed
  
- [ ] leaderboard handles string
  - avgReactionTime = "123.45" (Postgres NUMERIC)
  - formatReactionTime converts to number
  - Displays "123ms"
  - No crashes

- [ ] leaderboard handles undefined
  - avgReactionTime = undefined
  - formatReactionTime returns "--"
  - No crashes

---

## 🔬 Test Execution Notes

### How to Test

1. **Manual Testing**
   - Follow each scenario step-by-step
   - Check browser console for errors
   - Check Network tab for API calls
   - Check Application tab for localStorage
   - Verify no unhandled promises

2. **Load Testing**
   - Test with 2+ concurrent users
   - Test worker with multiple pending payments
   - Verify no race conditions

3. **Failure Injection**
   - Use browser DevTools to throttle network
   - Use `kill -9` to crash worker process
   - Modify database to inject invalid data
   - Verify graceful handling

### Success Criteria

- **Zero** crashes (blank/blue screens)
- **Zero** 500 errors for valid requests
- **Zero** silent failures (logged errors OK)
- **Zero** race conditions or duplicate charges
- **Zero** stuck states (always recoverable)

### Failure is NOT Acceptable

- Seeing "Invalid time value" in logs
- Seeing "undefined wallet" in logs
- Seeing "NaN" in UI
- App stuck with spinner forever
- Payment charged twice
- Winner receives $0 payout
- Polling continues after match ends

---

## 📊 Metrics to Monitor

After deployment, monitor these metrics:

- Payment success rate (target: >99%)
- Worker retry rate (target: <5%)
- Average match completion time
- P99 latency for polling endpoints
- Error rate on /api/match/tap endpoint
- Number of false starts (anti-cheat)

---

## 🚨 Rollback Triggers

Rollback immediately if:

1. Payment success rate drops below 95%
2. More than 1% of matches stuck in pending
3. Any "double charge" reports
4. More than 5% error rate on critical endpoints
5. Worker crashes more than 3 times in 1 hour
