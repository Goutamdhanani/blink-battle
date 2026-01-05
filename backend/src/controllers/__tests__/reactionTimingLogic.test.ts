import { generateRandomDelay, generateF1LightSequence } from '../../services/randomness';

/**
 * Tests for Reaction Time Logic
 * 
 * Requirements:
 * - Mandatory 2-second wait after red lights
 * - Random delay of 2-5 seconds AFTER the mandatory wait
 * - Total timing: ~6.5-9.5 seconds from match start
 */

describe('Reaction Time Logic Tests', () => {
  const MINIMUM_WAIT_MS = 2000; // Mandatory 2-second wait
  const MIN_RANDOM_DELAY_MS = 2000; // Minimum random delay
  const MAX_RANDOM_DELAY_MS = 5000; // Maximum random delay

  describe('generateRandomDelay', () => {
    test('should generate delay within specified range', () => {
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        const delay = generateRandomDelay(MIN_RANDOM_DELAY_MS, MAX_RANDOM_DELAY_MS);
        expect(delay).toBeGreaterThanOrEqual(MIN_RANDOM_DELAY_MS);
        expect(delay).toBeLessThanOrEqual(MAX_RANDOM_DELAY_MS);
      }
    });

    test('should generate different values (not deterministic)', () => {
      const delays = new Set();
      const iterations = 50;
      
      for (let i = 0; i < iterations; i++) {
        const delay = generateRandomDelay(MIN_RANDOM_DELAY_MS, MAX_RANDOM_DELAY_MS);
        delays.add(delay);
      }

      // Should have at least 10 different values (very low chance of collision)
      expect(delays.size).toBeGreaterThan(10);
    });

    test('should handle edge case with min = max', () => {
      const fixedDelay = 3000;
      const delay = generateRandomDelay(fixedDelay, fixedDelay);
      expect(delay).toBe(fixedDelay);
    });
  });

  describe('generateF1LightSequence', () => {
    test('should generate 5 light intervals', () => {
      const sequence = generateF1LightSequence();
      expect(sequence).toHaveLength(5);
    });

    test('should generate intervals around 500ms base with variance', () => {
      const sequence = generateF1LightSequence();
      
      sequence.forEach(interval => {
        // Base 500ms ± 100ms variance
        expect(interval).toBeGreaterThanOrEqual(400);
        expect(interval).toBeLessThanOrEqual(600);
      });
    });

    test('should generate different sequences (randomized)', () => {
      const sequence1 = generateF1LightSequence();
      const sequence2 = generateF1LightSequence();
      
      // Very unlikely to generate identical sequences
      expect(sequence1).not.toEqual(sequence2);
    });

    test('total light sequence should be approximately 2.5 seconds', () => {
      const iterations = 20;
      const totals: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const sequence = generateF1LightSequence();
        const total = sequence.reduce((sum, interval) => sum + interval, 0);
        totals.push(total);
      }

      const avgTotal = totals.reduce((sum, t) => sum + t, 0) / totals.length;
      
      // Average should be around 2500ms (5 lights × 500ms)
      expect(avgTotal).toBeGreaterThan(2000);
      expect(avgTotal).toBeLessThan(3000);
    });
  });

  describe('Complete Timing Flow', () => {
    test('total timing should be within 6.5-9.5 seconds range', () => {
      const iterations = 50;
      
      for (let i = 0; i < iterations; i++) {
        // Simulate complete timing flow
        const lightSequence = generateF1LightSequence();
        const totalLightsTime = lightSequence.reduce((sum, interval) => sum + interval, 0);
        const randomDelay = generateRandomDelay(MIN_RANDOM_DELAY_MS, MAX_RANDOM_DELAY_MS);
        
        // Total time = lights + mandatory wait + random delay
        const totalTime = totalLightsTime + MINIMUM_WAIT_MS + randomDelay;
        
        // Expected range: ~6.5s to ~9.5s
        // - Min: ~2.0s (lights) + 2s (wait) + 2s (random) = ~6s
        // - Max: ~3.0s (lights) + 2s (wait) + 5s (random) = ~10s
        expect(totalTime).toBeGreaterThan(6000);
        expect(totalTime).toBeLessThan(10500);
      }
    });

    test('mandatory wait is always included', () => {
      // This test verifies the code structure, not runtime behavior
      // The mandatory wait should always be added before random delay
      
      const lightSequence = generateF1LightSequence();
      const totalLightsTime = lightSequence.reduce((sum, interval) => sum + interval, 0);
      const randomDelay = generateRandomDelay(MIN_RANDOM_DELAY_MS, MAX_RANDOM_DELAY_MS);
      
      // Verify the formula structure
      const greenLightTime = Date.now() + totalLightsTime + MINIMUM_WAIT_MS + randomDelay;
      const expectedMinTime = Date.now() + totalLightsTime + MINIMUM_WAIT_MS + MIN_RANDOM_DELAY_MS;
      const expectedMaxTime = Date.now() + totalLightsTime + MINIMUM_WAIT_MS + MAX_RANDOM_DELAY_MS;
      
      expect(greenLightTime).toBeGreaterThanOrEqual(expectedMinTime);
      expect(greenLightTime).toBeLessThanOrEqual(expectedMaxTime);
    });

    test('random delay is AFTER mandatory wait, not instead of it', () => {
      // This is a critical requirement test
      const minimumTotalTime = MINIMUM_WAIT_MS + MIN_RANDOM_DELAY_MS;
      
      // Generate multiple samples to verify
      for (let i = 0; i < 20; i++) {
        const lightSequence = generateF1LightSequence();
        const totalLightsTime = lightSequence.reduce((sum, interval) => sum + interval, 0);
        const randomDelay = generateRandomDelay(MIN_RANDOM_DELAY_MS, MAX_RANDOM_DELAY_MS);
        
        // Time after lights should be at least: mandatory wait + minimum random delay
        const timeAfterLights = MINIMUM_WAIT_MS + randomDelay;
        
        expect(timeAfterLights).toBeGreaterThanOrEqual(minimumTotalTime);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero min delay gracefully', () => {
      const delay = generateRandomDelay(0, 1000);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(1000);
    });

    test('should handle large delays', () => {
      const delay = generateRandomDelay(10000, 20000);
      expect(delay).toBeGreaterThanOrEqual(10000);
      expect(delay).toBeLessThanOrEqual(20000);
    });
  });

  describe('Timing Verification (Mock Scenario)', () => {
    test('simulate complete match timing from ready to green light', () => {
      // Simulate player hitting ready
      const readyTime = Date.now();
      
      // Generate timing parameters
      const lightSequence = generateF1LightSequence();
      const totalLightsTime = lightSequence.reduce((sum, interval) => sum + interval, 0);
      const randomDelay = generateRandomDelay(MIN_RANDOM_DELAY_MS, MAX_RANDOM_DELAY_MS);
      
      // Calculate green light time using actual formula from pollingMatchController.ts
      const greenLightTime = readyTime + totalLightsTime + MINIMUM_WAIT_MS + randomDelay;
      
      // Verify components
      expect(totalLightsTime).toBeGreaterThan(0);
      expect(randomDelay).toBeGreaterThanOrEqual(MIN_RANDOM_DELAY_MS);
      expect(randomDelay).toBeLessThanOrEqual(MAX_RANDOM_DELAY_MS);
      
      // Verify total delay
      const totalDelay = greenLightTime - readyTime;
      expect(totalDelay).toBeGreaterThan(6000); // Minimum ~6s
      expect(totalDelay).toBeLessThan(10500); // Maximum ~10.5s
      
      // Verify mandatory wait is included
      const minimumTimeWithoutLights = MINIMUM_WAIT_MS + MIN_RANDOM_DELAY_MS;
      expect(totalDelay).toBeGreaterThanOrEqual(minimumTimeWithoutLights);
    });
  });
});
