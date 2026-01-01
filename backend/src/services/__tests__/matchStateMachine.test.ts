import {
  MatchState,
  MatchStateMachine,
  isValidTransition,
  isTerminalState,
  MatchStateGuards,
  InvalidStateTransitionError,
  stateToStatus,
} from '../matchStateMachine';
import { MatchStatus } from '../../models/types';

describe('MatchStateMachine', () => {
  describe('State Transitions', () => {
    it('should allow MATCHED → FUNDING transition', () => {
      expect(isValidTransition(MatchState.MATCHED, MatchState.FUNDING)).toBe(true);
    });

    it('should allow MATCHED → CANCELLED transition', () => {
      expect(isValidTransition(MatchState.MATCHED, MatchState.CANCELLED)).toBe(true);
    });

    it('should allow FUNDING → READY transition', () => {
      expect(isValidTransition(MatchState.FUNDING, MatchState.READY)).toBe(true);
    });

    it('should allow FUNDING → CANCELLED transition', () => {
      expect(isValidTransition(MatchState.FUNDING, MatchState.CANCELLED)).toBe(true);
    });

    it('should allow FUNDING → REFUNDED transition', () => {
      expect(isValidTransition(MatchState.FUNDING, MatchState.REFUNDED)).toBe(true);
    });

    it('should allow READY → STARTED transition', () => {
      expect(isValidTransition(MatchState.READY, MatchState.STARTED)).toBe(true);
    });

    it('should allow READY → CANCELLED transition', () => {
      expect(isValidTransition(MatchState.READY, MatchState.CANCELLED)).toBe(true);
    });

    it('should allow STARTED → COMPLETED transition', () => {
      expect(isValidTransition(MatchState.STARTED, MatchState.COMPLETED)).toBe(true);
    });

    it('should allow STARTED → REFUNDED transition', () => {
      expect(isValidTransition(MatchState.STARTED, MatchState.REFUNDED)).toBe(true);
    });

    it('should not allow MATCHED → STARTED transition', () => {
      expect(isValidTransition(MatchState.MATCHED, MatchState.STARTED)).toBe(false);
    });

    it('should not allow COMPLETED → any transition', () => {
      expect(isValidTransition(MatchState.COMPLETED, MatchState.STARTED)).toBe(false);
      expect(isValidTransition(MatchState.COMPLETED, MatchState.CANCELLED)).toBe(false);
    });

    it('should not allow reverse transitions', () => {
      expect(isValidTransition(MatchState.READY, MatchState.FUNDING)).toBe(false);
      expect(isValidTransition(MatchState.STARTED, MatchState.READY)).toBe(false);
    });
  });

  describe('Terminal States', () => {
    it('should identify terminal states correctly', () => {
      expect(isTerminalState(MatchState.COMPLETED)).toBe(true);
      expect(isTerminalState(MatchState.CANCELLED)).toBe(true);
      expect(isTerminalState(MatchState.REFUNDED)).toBe(true);
    });

    it('should identify non-terminal states correctly', () => {
      expect(isTerminalState(MatchState.MATCHED)).toBe(false);
      expect(isTerminalState(MatchState.FUNDING)).toBe(false);
      expect(isTerminalState(MatchState.READY)).toBe(false);
      expect(isTerminalState(MatchState.STARTED)).toBe(false);
    });
  });

  describe('State to Status Mapping', () => {
    it('should map MATCHED to PENDING', () => {
      expect(stateToStatus(MatchState.MATCHED)).toBe(MatchStatus.PENDING);
    });

    it('should map FUNDING to PENDING', () => {
      expect(stateToStatus(MatchState.FUNDING)).toBe(MatchStatus.PENDING);
    });

    it('should map READY to PENDING', () => {
      expect(stateToStatus(MatchState.READY)).toBe(MatchStatus.PENDING);
    });

    it('should map STARTED to IN_PROGRESS', () => {
      expect(stateToStatus(MatchState.STARTED)).toBe(MatchStatus.IN_PROGRESS);
    });

    it('should map COMPLETED to COMPLETED', () => {
      expect(stateToStatus(MatchState.COMPLETED)).toBe(MatchStatus.COMPLETED);
    });

    it('should map CANCELLED to CANCELLED', () => {
      expect(stateToStatus(MatchState.CANCELLED)).toBe(MatchStatus.CANCELLED);
    });

    it('should map REFUNDED to REFUNDED', () => {
      expect(stateToStatus(MatchState.REFUNDED)).toBe(MatchStatus.REFUNDED);
    });
  });

  describe('MatchStateMachine Instance', () => {
    let stateMachine: MatchStateMachine;

    beforeEach(() => {
      stateMachine = new MatchStateMachine('test-match-123', MatchState.MATCHED);
    });

    it('should initialize with correct state', () => {
      expect(stateMachine.getState()).toBe(MatchState.MATCHED);
    });

    it('should generate correlation ID', () => {
      const correlationId = stateMachine.getCorrelationId();
      expect(correlationId).toMatch(/^match_test-match-123_\d+$/);
    });

    it('should allow valid state transition', () => {
      const result = stateMachine.transition(MatchState.FUNDING);
      expect(result.success).toBe(true);
      expect(stateMachine.getState()).toBe(MatchState.FUNDING);
    });

    it('should reject invalid state transition', () => {
      const result = stateMachine.transition(MatchState.STARTED);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(stateMachine.getState()).toBe(MatchState.MATCHED); // State unchanged
    });

    it('should support chained transitions', () => {
      expect(stateMachine.transition(MatchState.FUNDING).success).toBe(true);
      expect(stateMachine.transition(MatchState.READY).success).toBe(true);
      expect(stateMachine.transition(MatchState.STARTED).success).toBe(true);
      expect(stateMachine.transition(MatchState.COMPLETED).success).toBe(true);
      expect(stateMachine.getState()).toBe(MatchState.COMPLETED);
    });

    it('should check if transition is possible without executing it', () => {
      expect(stateMachine.canTransition(MatchState.FUNDING)).toBe(true);
      expect(stateMachine.canTransition(MatchState.STARTED)).toBe(false);
      expect(stateMachine.getState()).toBe(MatchState.MATCHED); // State unchanged
    });

    it('should support force transition', () => {
      stateMachine.forceTransition(MatchState.COMPLETED, 'Test force transition');
      expect(stateMachine.getState()).toBe(MatchState.COMPLETED);
    });

    it('should include context in transitions', () => {
      const result = stateMachine.transition(MatchState.FUNDING, {
        reason: 'Both players initiated payment',
        triggeredBy: 'player',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('MatchStateGuards', () => {
    describe('canTransitionToFunding', () => {
      it('should allow transition for paid matches', () => {
        const result = MatchStateGuards.canTransitionToFunding({ isFreeMatch: false });
        expect(result.allowed).toBe(true);
      });

      it('should block transition for free matches', () => {
        const result = MatchStateGuards.canTransitionToFunding({ isFreeMatch: true });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Free matches skip funding');
      });
    });

    describe('canTransitionToReady', () => {
      it('should allow transition when both players staked and escrow verified', () => {
        const result = MatchStateGuards.canTransitionToReady({
          player1Staked: true,
          player2Staked: true,
          escrowVerified: true,
        });
        expect(result.allowed).toBe(true);
      });

      it('should block transition when player1 not staked', () => {
        const result = MatchStateGuards.canTransitionToReady({
          player1Staked: false,
          player2Staked: true,
          escrowVerified: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Not all players have staked');
      });

      it('should block transition when escrow not verified', () => {
        const result = MatchStateGuards.canTransitionToReady({
          player1Staked: true,
          player2Staked: true,
          escrowVerified: false,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Escrow not verified');
      });
    });

    describe('canTransitionToStarted', () => {
      it('should allow transition when both players ready and connected', () => {
        const result = MatchStateGuards.canTransitionToStarted({
          player1Ready: true,
          player2Ready: true,
          player1Connected: true,
          player2Connected: true,
        });
        expect(result.allowed).toBe(true);
      });

      it('should block transition when player not ready', () => {
        const result = MatchStateGuards.canTransitionToStarted({
          player1Ready: true,
          player2Ready: false,
          player1Connected: true,
          player2Connected: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Not all players are ready');
      });

      it('should block transition when player not connected', () => {
        const result = MatchStateGuards.canTransitionToStarted({
          player1Ready: true,
          player2Ready: true,
          player1Connected: false,
          player2Connected: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Not all players are connected');
      });
    });

    describe('canCancel', () => {
      it('should allow cancel in non-terminal states', () => {
        expect(MatchStateGuards.canCancel({
          currentState: MatchState.MATCHED,
          hasSignalSent: false,
        }).allowed).toBe(true);

        expect(MatchStateGuards.canCancel({
          currentState: MatchState.FUNDING,
          hasSignalSent: false,
        }).allowed).toBe(true);
      });

      it('should block cancel in terminal states', () => {
        expect(MatchStateGuards.canCancel({
          currentState: MatchState.COMPLETED,
          hasSignalSent: true,
        }).allowed).toBe(false);

        expect(MatchStateGuards.canCancel({
          currentState: MatchState.CANCELLED,
          hasSignalSent: false,
        }).allowed).toBe(false);
      });
    });

    describe('canRefund', () => {
      it('should allow refund when escrow exists', () => {
        const result = MatchStateGuards.canRefund({
          currentState: MatchState.STARTED,
          escrowExists: true,
        });
        expect(result.allowed).toBe(true);
      });

      it('should block refund when no escrow', () => {
        const result = MatchStateGuards.canRefund({
          currentState: MatchState.FUNDING,
          escrowExists: false,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('No escrow to refund');
      });

      it('should block refund in terminal states', () => {
        const result = MatchStateGuards.canRefund({
          currentState: MatchState.COMPLETED,
          escrowExists: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('already in terminal state');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid state changes correctly', () => {
      const sm = new MatchStateMachine('rapid-test', MatchState.MATCHED);
      
      // Valid sequence
      expect(sm.transition(MatchState.FUNDING).success).toBe(true);
      expect(sm.transition(MatchState.READY).success).toBe(true);
      
      // Try invalid backwards transition
      expect(sm.transition(MatchState.FUNDING).success).toBe(false);
      expect(sm.getState()).toBe(MatchState.READY); // State preserved
    });

    it('should prevent transitions from terminal states', () => {
      const sm = new MatchStateMachine('terminal-test', MatchState.COMPLETED);
      
      expect(sm.canTransition(MatchState.STARTED)).toBe(false);
      expect(sm.canTransition(MatchState.CANCELLED)).toBe(false);
      expect(sm.canTransition(MatchState.REFUNDED)).toBe(false);
    });
  });
});
