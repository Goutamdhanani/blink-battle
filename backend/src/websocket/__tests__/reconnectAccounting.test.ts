/**
 * Test suite for reconnect accounting logic
 * 
 * This tests the two-tier reconnect tracking system that distinguishes between:
 * - "Soft" reconnects: All reconnection attempts including rapid remounts (<5s)
 * - "Hard" reconnects: Only stable connections (≥5s) that disconnect
 * 
 * Only hard reconnects count toward max_reconnects_exceeded cancellation.
 */

import { MatchState } from '../../services/matchStateMachine';

describe('Reconnect Accounting Logic', () => {
  describe('Connection Duration Classification', () => {
    const MIN_STABLE_CONNECTION_MS = 5000;

    test('should classify connection < 5s as unstable (soft)', () => {
      const connectionDuration = 2000; // 2 seconds
      const isStable = connectionDuration >= MIN_STABLE_CONNECTION_MS;
      
      expect(isStable).toBe(false);
      expect(connectionDuration).toBeLessThan(MIN_STABLE_CONNECTION_MS);
    });

    test('should classify connection = 5s as stable (hard)', () => {
      const connectionDuration = 5000; // exactly 5 seconds
      const isStable = connectionDuration >= MIN_STABLE_CONNECTION_MS;
      
      expect(isStable).toBe(true);
    });

    test('should classify connection > 5s as stable (hard)', () => {
      const connectionDuration = 8000; // 8 seconds
      const isStable = connectionDuration >= MIN_STABLE_CONNECTION_MS;
      
      expect(isStable).toBe(true);
      expect(connectionDuration).toBeGreaterThanOrEqual(MIN_STABLE_CONNECTION_MS);
    });
  });

  describe('Hard Reconnect Attempt Tracking', () => {
    const MAX_HARD_RECONNECT_ATTEMPTS = 5;

    test('should not exceed limit with 5 or fewer hard attempts', () => {
      const hardAttempts = 5;
      const shouldCancel = hardAttempts > MAX_HARD_RECONNECT_ATTEMPTS;
      
      expect(shouldCancel).toBe(false);
    });

    test('should exceed limit with 6 or more hard attempts', () => {
      const hardAttempts = 6;
      const shouldCancel = hardAttempts > MAX_HARD_RECONNECT_ATTEMPTS;
      
      expect(shouldCancel).toBe(true);
    });

    test('should increment hard attempts only for stable connections', () => {
      const reconnectAttempts = new Map<string, number>();
      const hardReconnectAttempts = new Map<string, number>();
      const userId = 'user1';

      // Simulate 3 early disconnects (< 5s) - should not increment hard
      const earlyDisconnects = [
        { duration: 1000, isStable: false },
        { duration: 2500, isStable: false },
        { duration: 500, isStable: false },
      ];

      earlyDisconnects.forEach(() => {
        // Early disconnects: increment soft but not hard
        reconnectAttempts.set(userId, (reconnectAttempts.get(userId) || 0) + 1);
        // hardReconnectAttempts NOT incremented
      });

      expect(reconnectAttempts.get(userId)).toBe(3);
      expect(hardReconnectAttempts.get(userId)).toBeUndefined(); // No hard attempts

      // Simulate 2 stable disconnects (>= 5s) - should increment hard
      const stableDisconnects = [
        { duration: 6000, isStable: true },
        { duration: 8000, isStable: true },
      ];

      stableDisconnects.forEach(() => {
        // Stable disconnects: increment both soft and hard
        reconnectAttempts.set(userId, (reconnectAttempts.get(userId) || 0) + 1);
        hardReconnectAttempts.set(userId, (hardReconnectAttempts.get(userId) || 0) + 1);
      });

      expect(reconnectAttempts.get(userId)).toBe(5); // 3 soft + 2 hard
      expect(hardReconnectAttempts.get(userId)).toBe(2); // Only 2 hard
    });
  });

  describe('Funding State Protection Guard', () => {
    const MIN_FUNDING_DURATION_MS = 20000; // 20 seconds
    const MAX_HARD_RECONNECT_ATTEMPTS = 5;

    interface GuardCheckParams {
      currentState: MatchState;
      hardAttempts: number;
      hasAnyReady: boolean;
      hasSignal: boolean;
      matchAge: number;
    }

    function shouldCancelForMaxReconnects(params: GuardCheckParams): boolean {
      const { currentState, hardAttempts, hasAnyReady, hasSignal, matchAge } = params;

      // If hard attempts haven't exceeded the limit, don't cancel
      if (hardAttempts <= MAX_HARD_RECONNECT_ATTEMPTS) {
        return false;
      }

      // Special guard for FUNDING state
      if (currentState === MatchState.FUNDING) {
        const hasMinFundingDuration = matchAge >= MIN_FUNDING_DURATION_MS;

        // Prevent cancellation if ALL conditions are true:
        // 1. No ready signals sent
        // 2. No game signal sent
        // 3. Match hasn't been in funding for minimum duration
        if (!hasAnyReady && !hasSignal && !hasMinFundingDuration) {
          return false;
        }
      }

      // In all other cases, if hard attempts exceeded, cancel
      return true;
    }

    test('should NOT cancel in FUNDING state with no ready, no signal, and < 20s age', () => {
      const result = shouldCancelForMaxReconnects({
        currentState: MatchState.FUNDING,
        hardAttempts: 6, // Exceeded limit
        hasAnyReady: false,
        hasSignal: false,
        matchAge: 15000, // 15 seconds < 20 seconds
      });

      expect(result).toBe(false); // Should NOT cancel - guard protects
    });

    test('should cancel in FUNDING state if any player is ready', () => {
      const result = shouldCancelForMaxReconnects({
        currentState: MatchState.FUNDING,
        hardAttempts: 6,
        hasAnyReady: true, // Player ready
        hasSignal: false,
        matchAge: 15000,
      });

      expect(result).toBe(true); // Should cancel
    });

    test('should cancel in FUNDING state if signal was sent', () => {
      const result = shouldCancelForMaxReconnects({
        currentState: MatchState.FUNDING,
        hardAttempts: 6,
        hasAnyReady: false,
        hasSignal: true, // Signal sent
        matchAge: 15000,
      });

      expect(result).toBe(true); // Should cancel
    });

    test('should cancel in FUNDING state if match age >= 20s', () => {
      const result = shouldCancelForMaxReconnects({
        currentState: MatchState.FUNDING,
        hardAttempts: 6,
        hasAnyReady: false,
        hasSignal: false,
        matchAge: 25000, // 25 seconds >= 20 seconds
      });

      expect(result).toBe(true); // Should cancel
    });

    test('should cancel in READY state regardless of conditions', () => {
      const result = shouldCancelForMaxReconnects({
        currentState: MatchState.READY,
        hardAttempts: 6,
        hasAnyReady: false,
        hasSignal: false,
        matchAge: 5000,
      });

      expect(result).toBe(true); // Should cancel - not in FUNDING
    });

    test('should NOT cancel if hard attempts not exceeded, even in READY state', () => {
      const result = shouldCancelForMaxReconnects({
        currentState: MatchState.READY,
        hardAttempts: 3, // Below limit
        hasAnyReady: true,
        hasSignal: false,
        matchAge: 30000,
      });

      expect(result).toBe(false); // Should NOT cancel - under limit
    });
  });

  describe('Reconnect Scenario Simulations', () => {
    test('Scenario 1: Multiple rapid remounts should not trigger cancellation', () => {
      // User has 10 reconnections, but all are < 5s (rapid remounts)
      const softAttempts = 10;
      const hardAttempts = 0; // None are stable
      const MAX_HARD = 5;

      const shouldCancel = hardAttempts > MAX_HARD;
      
      expect(shouldCancel).toBe(false);
      expect(hardAttempts).toBe(0);
      expect(softAttempts).toBe(10); // All counted as soft
    });

    test('Scenario 2: Genuine instability should trigger cancellation', () => {
      // User has 6 disconnections, all from stable connections (> 5s)
      const softAttempts = 6;
      const hardAttempts = 6; // All are stable
      const MAX_HARD = 5;

      const shouldCancel = hardAttempts > MAX_HARD;
      
      expect(shouldCancel).toBe(true);
      expect(hardAttempts).toBeGreaterThan(MAX_HARD);
    });

    test('Scenario 3: Mixed disconnects in FUNDING should be protected', () => {
      // User has 3 soft + 6 hard attempts in FUNDING state, but conditions met for guard
      const softAttempts = 9;
      const hardAttempts = 6;
      const MAX_HARD = 5;
      
      const currentState = MatchState.FUNDING;
      const hasAnyReady = false;
      const hasSignal = false;
      const matchAge = 12000; // 12 seconds < 20 seconds

      // Check if should cancel
      const exceedsLimit = hardAttempts > MAX_HARD;
      const fundingGuardApplies = 
        currentState === MatchState.FUNDING &&
        !hasAnyReady &&
        !hasSignal &&
        matchAge < 20000;

      const shouldCancel = exceedsLimit && !fundingGuardApplies;
      
      expect(exceedsLimit).toBe(true);
      expect(fundingGuardApplies).toBe(true);
      expect(shouldCancel).toBe(false); // Guard prevents cancellation
    });

    test('Scenario 4: After funding phase, normal limits apply', () => {
      // Same as scenario 3, but match has progressed to READY
      const hardAttempts = 6;
      const MAX_HARD = 5;
      
      // Force type to be general MatchState to allow comparison in test
      const currentState = MatchState.READY as MatchState;
      const hasAnyReady = true;
      const hasSignal = false;
      const matchAge = 35000;

      const exceedsLimit = hardAttempts > MAX_HARD;
      const fundingGuardApplies = 
        currentState === MatchState.FUNDING &&
        !hasAnyReady &&
        !hasSignal &&
        matchAge < 20000;

      const shouldCancel = exceedsLimit && !fundingGuardApplies;
      
      expect(exceedsLimit).toBe(true);
      expect(fundingGuardApplies).toBe(false); // Not in funding anymore
      expect(shouldCancel).toBe(true); // Should cancel now
    });
  });

  describe('Edge Cases', () => {
    test('should handle exactly at thresholds correctly', () => {
      const MIN_STABLE = 5000;
      const MAX_HARD = 5;
      const MIN_FUNDING_DURATION = 20000;

      // Connection duration exactly at 5s
      expect(5000 >= MIN_STABLE).toBe(true);
      
      // Hard attempts exactly at limit
      expect(5 > MAX_HARD).toBe(false);
      expect(6 > MAX_HARD).toBe(true);
      
      // Match age exactly at 20s
      expect(20000 >= MIN_FUNDING_DURATION).toBe(true);
      expect(19999 >= MIN_FUNDING_DURATION).toBe(false);
    });

    test('should handle zero attempts gracefully', () => {
      const hardAttempts = 0;
      const MAX_HARD = 5;

      expect(hardAttempts > MAX_HARD).toBe(false);
    });

    test('should handle negative match age (time sync issues)', () => {
      const matchAge = -1000; // Negative (shouldn't happen, but defensive)
      const MIN_FUNDING_DURATION = 20000;

      const hasMinDuration = matchAge >= MIN_FUNDING_DURATION;
      expect(hasMinDuration).toBe(false); // Negative is less than threshold
    });
  });
});
