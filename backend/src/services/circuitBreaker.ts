/**
 * Circuit Breaker Pattern Implementation
 * 
 * Issue #15: Network Partition Resilience
 * 
 * Protects against cascading failures when external APIs (Developer Portal) are down.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, reject requests immediately
 * - HALF_OPEN: Testing if service recovered, allow limited requests
 * 
 * Configuration:
 * - failureThreshold: Number of failures before opening circuit
 * - successThreshold: Number of successes in half-open before closing
 * - timeout: Time before transitioning from open → half-open
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Custom error for circuit breaker rejections
 * Allows type-safe error detection instead of string matching
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly circuitName: string,
    public readonly state: CircuitState
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
    Object.setPrototypeOf(this, CircuitBreakerError.prototype);
  }
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number; // ms
  name?: string;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastStateChange: number;
  totalAttempts: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime?: number;
  private circuitOpenedAt?: number; // Track when circuit opened for accurate timeout
  private lastStateChange: number = Date.now();
  private totalAttempts: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  
  constructor(private config: CircuitBreakerConfig) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has elapsed
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitBreakerError(
          `Circuit breaker is OPEN - service unavailable`,
          this.config.name || 'default',
          this.state
        );
      }
    }

    this.totalAttempts++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.totalSuccesses++;
    this.failures = 0; // Reset failure count on success

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      
      if (this.successes >= this.config.successThreshold) {
        // Service recovered, close circuit
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(): void {
    this.totalFailures++;
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0; // Reset success count on failure

    if (this.state === CircuitState.HALF_OPEN) {
      // Still failing in half-open state, reopen circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failures >= this.config.failureThreshold) {
      // Too many failures, open circuit
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Check if we should attempt to reset from OPEN → HALF_OPEN
   * Uses circuitOpenedAt instead of lastFailureTime for accurate timeout
   */
  private shouldAttemptReset(): boolean {
    if (!this.circuitOpenedAt) return false;
    return Date.now() - this.circuitOpenedAt >= this.config.timeout;
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    // Track when circuit opens for accurate timeout calculation
    if (newState === CircuitState.OPEN) {
      this.circuitOpenedAt = Date.now();
    }

    // Reset counters on state change
    if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
      this.circuitOpenedAt = undefined;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successes = 0;
    }

    // Log state changes
    const name = this.config.name || 'default';
    console.log(`[CircuitBreaker:${name}] State transition: ${oldState} → ${newState}`);
  }

  /**
   * Get current circuit breaker stats
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalAttempts: this.totalAttempts,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses
    };
  }

  /**
   * Manually reset circuit breaker to CLOSED state
   * Use with caution - for admin/debugging purposes only
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }
}

/**
 * Circuit breaker factory with default configs for common use cases
 */
export class CircuitBreakerFactory {
  /**
   * Create circuit breaker for Developer Portal API calls
   * - 5 failures → open circuit
   * - 2 successes in half-open → close circuit
   * - 30 seconds timeout before retry
   */
  static forDeveloperPortal(): CircuitBreaker {
    return new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000, // 30 seconds
      name: 'DeveloperPortal'
    });
  }

  /**
   * Create circuit breaker for database queries
   * - 10 failures → open circuit (databases should be more resilient)
   * - 3 successes in half-open → close circuit
   * - 60 seconds timeout before retry
   */
  static forDatabase(): CircuitBreaker {
    return new CircuitBreaker({
      failureThreshold: 10,
      successThreshold: 3,
      timeout: 60000, // 60 seconds
      name: 'Database'
    });
  }

  /**
   * Create custom circuit breaker
   */
  static create(config: CircuitBreakerConfig): CircuitBreaker {
    return new CircuitBreaker(config);
  }
}
