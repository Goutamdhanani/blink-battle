/**
 * Test suite for reaction light timing validation
 * Ensures the game enforces the required 2-5 second random delay after red lights
 */

import { generateRandomDelay, generateF1LightSequence } from '../../services/randomness';

describe('Reaction Light Timing Validation', () => {
  describe('generateRandomDelay', () => {
    it('should generate delay within specified range', () => {
      const minMs = 2000;
      const maxMs = 5000;
      
      // Test multiple times to ensure randomness stays within bounds
      for (let i = 0; i < 100; i++) {
        const delay = generateRandomDelay(minMs, maxMs);
        expect(delay).toBeGreaterThanOrEqual(minMs);
        expect(delay).toBeLessThanOrEqual(maxMs);
      }
    });

    it('should enforce minimum 2-second delay', () => {
      const minMs = 2000;
      const maxMs = 5000;
      
      const delay = generateRandomDelay(minMs, maxMs);
      expect(delay).toBeGreaterThanOrEqual(2000);
    });

    it('should not exceed 5-second maximum delay', () => {
      const minMs = 2000;
      const maxMs = 5000;
      
      const delay = generateRandomDelay(minMs, maxMs);
      expect(delay).toBeLessThanOrEqual(5000);
    });
  });

  describe('generateF1LightSequence', () => {
    it('should generate sequence of 5 light intervals', () => {
      const sequence = generateF1LightSequence();
      expect(sequence).toHaveLength(5);
    });

    it('should have intervals around 500ms with variance', () => {
      const sequence = generateF1LightSequence();
      
      // Each interval should be ~500ms ± 100ms variance
      sequence.forEach(interval => {
        expect(interval).toBeGreaterThanOrEqual(400); // 500 - 100
        expect(interval).toBeLessThanOrEqual(600);    // 500 + 100
      });
    });

    it('should have total lights time around 2.5 seconds', () => {
      const sequence = generateF1LightSequence();
      const totalTime = sequence.reduce((sum, interval) => sum + interval, 0);
      
      // 5 lights × ~500ms = ~2500ms
      // With ±100ms variance per light, total can vary by ±500ms
      expect(totalTime).toBeGreaterThanOrEqual(2000); // 2500 - 500
      expect(totalTime).toBeLessThanOrEqual(3000);    // 2500 + 500
    });
  });

  describe('Combined timing logic', () => {
    it('should enforce total delay of at least 4 seconds (lights + minimum random)', () => {
      const sequence = generateF1LightSequence();
      const totalLightsTime = sequence.reduce((sum, interval) => sum + interval, 0);
      const randomDelay = generateRandomDelay(2000, 5000);
      const totalDelay = totalLightsTime + randomDelay;
      
      // Minimum: ~2000ms (lights min) + 2000ms (random min) = 4000ms
      expect(totalDelay).toBeGreaterThanOrEqual(4000);
    });

    it('should have total delay not exceeding 8 seconds (lights + maximum random)', () => {
      const sequence = generateF1LightSequence();
      const totalLightsTime = sequence.reduce((sum, interval) => sum + interval, 0);
      const randomDelay = generateRandomDelay(2000, 5000);
      const totalDelay = totalLightsTime + randomDelay;
      
      // Maximum: ~3000ms (lights max) + 5000ms (random max) = 8000ms
      expect(totalDelay).toBeLessThanOrEqual(8000);
    });
  });
});
