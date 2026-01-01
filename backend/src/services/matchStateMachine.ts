/**
 * Deterministic state machine for match lifecycle
 * Defines valid states and transitions with guards
 */

import { MatchStatus } from '../models/types';

/**
 * Extended match states for deterministic lifecycle
 * Maps to existing MatchStatus where possible for backward compatibility
 */
export enum MatchState {
  // Initial state - players matched, waiting for payment
  MATCHED = 'matched',
  
  // Waiting for both players to deposit stakes
  FUNDING = 'funding',
  
  // Both players funded, waiting for ready confirmation
  READY = 'ready',
  
  // Game in progress (maps to IN_PROGRESS)
  STARTED = 'started',
  
  // Terminal states
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

/**
 * Maps MatchState to MatchStatus for database compatibility
 */
export const stateToStatus = (state: MatchState): MatchStatus => {
  switch (state) {
    case MatchState.MATCHED:
    case MatchState.FUNDING:
    case MatchState.READY:
      return MatchStatus.PENDING;
    case MatchState.STARTED:
      return MatchStatus.IN_PROGRESS;
    case MatchState.COMPLETED:
      return MatchStatus.COMPLETED;
    case MatchState.CANCELLED:
      return MatchStatus.CANCELLED;
    case MatchState.REFUNDED:
      return MatchStatus.REFUNDED;
  }
};

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Map<MatchState, Set<MatchState>> = new Map([
  [MatchState.MATCHED, new Set([
    MatchState.FUNDING,
    MatchState.CANCELLED,  // Cancel before payment
  ])],
  [MatchState.FUNDING, new Set([
    MatchState.READY,      // Both players funded
    MatchState.CANCELLED,  // Payment timeout
    MatchState.REFUNDED,   // Partial funding refund
  ])],
  [MatchState.READY, new Set([
    MatchState.STARTED,    // Game starts
    MatchState.CANCELLED,  // Disconnect before start
    MatchState.REFUNDED,   // Cancel and refund
  ])],
  [MatchState.STARTED, new Set([
    MatchState.COMPLETED,  // Normal completion
    MatchState.CANCELLED,  // Both timeout
    MatchState.REFUNDED,   // Both false start
  ])],
  // Terminal states have no outbound transitions
  [MatchState.COMPLETED, new Set()],
  [MatchState.CANCELLED, new Set()],
  [MatchState.REFUNDED, new Set()],
]);

/**
 * Validates if a state transition is allowed
 */
export const isValidTransition = (from: MatchState, to: MatchState): boolean => {
  const allowedTransitions = VALID_TRANSITIONS.get(from);
  if (!allowedTransitions) {
    return false;
  }
  return allowedTransitions.has(to);
};

/**
 * Returns terminal states (no further transitions)
 */
export const isTerminalState = (state: MatchState): boolean => {
  return [
    MatchState.COMPLETED,
    MatchState.CANCELLED,
    MatchState.REFUNDED,
  ].includes(state);
};

/**
 * Error thrown when invalid state transition is attempted
 */
export class InvalidStateTransitionError extends Error {
  constructor(
    public matchId: string,
    public currentState: MatchState,
    public targetState: MatchState,
    public reason?: string
  ) {
    super(
      `Invalid state transition for match ${matchId}: ${currentState} → ${targetState}` +
      (reason ? `. Reason: ${reason}` : '')
    );
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Guard functions for state transitions
 */
export class MatchStateGuards {
  /**
   * Check if match can transition to FUNDING
   */
  static canTransitionToFunding(context: {
    isFreeMatch: boolean;
  }): { allowed: boolean; reason?: string } {
    if (context.isFreeMatch) {
      return { allowed: false, reason: 'Free matches skip funding' };
    }
    return { allowed: true };
  }

  /**
   * Check if match can transition to READY
   */
  static canTransitionToReady(context: {
    player1Staked: boolean;
    player2Staked: boolean;
    escrowVerified: boolean;
  }): { allowed: boolean; reason?: string } {
    if (!context.player1Staked || !context.player2Staked) {
      return { allowed: false, reason: 'Not all players have staked' };
    }
    if (!context.escrowVerified) {
      return { allowed: false, reason: 'Escrow not verified on-chain' };
    }
    return { allowed: true };
  }

  /**
   * Check if match can transition to STARTED
   */
  static canTransitionToStarted(context: {
    player1Ready: boolean;
    player2Ready: boolean;
    player1Connected: boolean;
    player2Connected: boolean;
  }): { allowed: boolean; reason?: string } {
    if (!context.player1Ready || !context.player2Ready) {
      return { allowed: false, reason: 'Not all players are ready' };
    }
    if (!context.player1Connected || !context.player2Connected) {
      return { allowed: false, reason: 'Not all players are connected' };
    }
    return { allowed: true };
  }

  /**
   * Check if match can be cancelled
   */
  static canCancel(context: {
    currentState: MatchState;
    hasSignalSent: boolean;
  }): { allowed: boolean; reason?: string } {
    if (isTerminalState(context.currentState)) {
      return { allowed: false, reason: 'Match already in terminal state' };
    }
    // Can cancel anytime before signal is sent
    return { allowed: true };
  }

  /**
   * Check if match can be refunded
   */
  static canRefund(context: {
    currentState: MatchState;
    escrowExists: boolean;
  }): { allowed: boolean; reason?: string } {
    if (isTerminalState(context.currentState)) {
      return { allowed: false, reason: 'Match already in terminal state' };
    }
    if (!context.escrowExists) {
      return { allowed: false, reason: 'No escrow to refund' };
    }
    return { allowed: true };
  }
}

/**
 * Transition context for logging and validation
 */
export interface TransitionContext {
  matchId: string;
  correlationId?: string;
  timestamp: number;
  reason?: string;
  triggeredBy?: 'player' | 'timeout' | 'system' | 'disconnect';
}

/**
 * State machine for managing match lifecycle
 */
export class MatchStateMachine {
  private currentState: MatchState;
  private matchId: string;
  private correlationId: string;
  
  constructor(matchId: string, initialState: MatchState = MatchState.MATCHED, correlationId?: string) {
    this.matchId = matchId;
    this.currentState = initialState;
    this.correlationId = correlationId || this.generateCorrelationId();
  }

  /**
   * Generate correlation ID for tracing
   */
  private generateCorrelationId(): string {
    return `match_${this.matchId}_${Date.now()}`;
  }

  /**
   * Get current state
   */
  getState(): MatchState {
    return this.currentState;
  }

  /**
   * Get correlation ID for logging
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Attempt to transition to new state with validation
   */
  transition(
    targetState: MatchState,
    context?: Partial<TransitionContext>
  ): { success: boolean; error?: string } {
    // Validate transition
    if (!isValidTransition(this.currentState, targetState)) {
      const error = `Invalid transition: ${this.currentState} → ${targetState}`;
      this.logTransition(targetState, false, context, error);
      return { success: false, error };
    }

    // Log successful transition
    this.logTransition(targetState, true, context);
    
    const previousState = this.currentState;
    this.currentState = targetState;

    return { success: true };
  }

  /**
   * Force transition without validation (use with caution)
   */
  forceTransition(targetState: MatchState, reason: string): void {
    console.warn(`[StateMachine] Force transition for ${this.matchId}: ${this.currentState} → ${targetState}. Reason: ${reason}`);
    this.currentState = targetState;
  }

  /**
   * Check if transition is valid without executing it
   */
  canTransition(targetState: MatchState): boolean {
    return isValidTransition(this.currentState, targetState);
  }

  /**
   * Log state transition with structured data
   */
  private logTransition(
    targetState: MatchState,
    success: boolean,
    context?: Partial<TransitionContext>,
    error?: string
  ): void {
    const logEntry = {
      correlationId: this.correlationId,
      matchId: this.matchId,
      transition: `${this.currentState} → ${targetState}`,
      success,
      timestamp: new Date().toISOString(),
      triggeredBy: context?.triggeredBy || 'system',
      reason: context?.reason,
      error,
    };

    if (success) {
      console.log(`[StateMachine] ✓ State transition:`, JSON.stringify(logEntry));
    } else {
      console.error(`[StateMachine] ✗ Invalid transition:`, JSON.stringify(logEntry));
    }
  }
}
