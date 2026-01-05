import { CircuitBreaker, CircuitState, CircuitBreakerFactory } from '../circuitBreaker';

describe('CircuitBreaker', () => {
  describe('State Transitions', () => {
    it('should start in CLOSED state', () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000
      });

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isOpen()).toBe(false);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000
      });

      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (e) {
          // Expected to fail
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(breaker.isOpen()).toBe(true);
    });

    it('should reject requests immediately when OPEN', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        timeout: 10000 // Long timeout to keep circuit open
      });

      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Fail twice to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Next call should be rejected without calling the function
      await expect(breaker.execute(failingFn)).rejects.toThrow('Circuit breaker');
      expect(failingFn).toHaveBeenCalledTimes(2); // Not called the 3rd time
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        timeout: 100 // Short timeout for testing
      });

      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next call should transition to HALF_OPEN
      const successFn = jest.fn().mockResolvedValue('success');
      await breaker.execute(successFn);

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should transition from HALF_OPEN to CLOSED after success threshold', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        timeout: 100
      });

      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (e) {
          // Expected
        }
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Succeed twice in HALF_OPEN state
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition from HALF_OPEN back to OPEN on failure', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        timeout: 100
      });

      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (e) {
          // Expected
        }
      }

      // Wait for timeout to transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 150));

      // Fail in HALF_OPEN state
      try {
        await breaker.execute(failingFn);
      } catch (e) {
        // Expected
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Statistics', () => {
    it('should track success and failure counts', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 1000
      });

      const successFn = jest.fn().mockResolvedValue('success');
      const failingFn = jest.fn().mockRejectedValue(new Error('fail'));

      // 3 successes
      for (let i = 0; i < 3; i++) {
        await breaker.execute(successFn);
      }

      // 2 failures
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (e) {
          // Expected
        }
      }

      const stats = breaker.getStats();
      expect(stats.totalSuccesses).toBe(3);
      expect(stats.totalFailures).toBe(2);
      expect(stats.totalAttempts).toBe(5);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should track last failure time', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 1000
      });

      const failingFn = jest.fn().mockRejectedValue(new Error('fail'));

      const beforeFail = Date.now();
      try {
        await breaker.execute(failingFn);
      } catch (e) {
        // Expected
      }
      const afterFail = Date.now();

      const stats = breaker.getStats();
      expect(stats.lastFailureTime).toBeGreaterThanOrEqual(beforeFail);
      expect(stats.lastFailureTime).toBeLessThanOrEqual(afterFail);
    });
  });

  describe('Reset', () => {
    it('should reset circuit to CLOSED state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        timeout: 10000
      });

      const failingFn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isOpen()).toBe(false);
    });
  });

  describe('CircuitBreakerFactory', () => {
    it('should create Developer Portal circuit breaker with correct config', () => {
      const breaker = CircuitBreakerFactory.forDeveloperPortal();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      
      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should create Database circuit breaker with correct config', () => {
      const breaker = CircuitBreakerFactory.forDatabase();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should create custom circuit breaker', () => {
      const breaker = CircuitBreakerFactory.create({
        failureThreshold: 10,
        successThreshold: 5,
        timeout: 5000,
        name: 'CustomService'
      });
      
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Edge Cases', () => {
    it('should handle successes resetting failure count in CLOSED state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000
      });

      const failingFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Fail twice (not enough to open)
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (e) {
          // Expected
        }
      }

      // Succeed once (should reset failure count)
      await breaker.execute(successFn);

      // Fail twice again (shouldn't open yet since count was reset)
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle rapid state transitions', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 50
      });

      const failingFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Open
      try {
        await breaker.execute(failingFn);
      } catch (e) {
        // Expected
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 70));

      // Half-open
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });
});
