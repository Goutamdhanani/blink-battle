import { describe, it, expect } from 'vitest';
import { formatReactionTime, formatWinRate } from '../formatters';

describe('formatters', () => {
  describe('formatReactionTime', () => {
    it('should format valid number values correctly', () => {
      expect(formatReactionTime(123.456)).toBe('123ms');
      expect(formatReactionTime(250)).toBe('250ms');
      expect(formatReactionTime(1)).toBe('1ms');
    });

    it('should handle string numbers from Postgres NUMERIC', () => {
      expect(formatReactionTime('123.456')).toBe('123ms');
      expect(formatReactionTime('250')).toBe('250ms');
      expect(formatReactionTime('1')).toBe('1ms');
    });

    it('should return fallback for null and undefined', () => {
      expect(formatReactionTime(null)).toBe('-');
      expect(formatReactionTime(undefined)).toBe('-');
    });

    it('should return fallback for invalid values', () => {
      expect(formatReactionTime(NaN)).toBe('-');
      expect(formatReactionTime('invalid')).toBe('-');
      expect(formatReactionTime({})).toBe('-');
      expect(formatReactionTime([])).toBe('-');
    });

    it('should return fallback for zero and negative values', () => {
      expect(formatReactionTime(0)).toBe('-');
      expect(formatReactionTime(-5)).toBe('-');
      expect(formatReactionTime(-123.456)).toBe('-');
    });

    it('should handle Infinity', () => {
      expect(formatReactionTime(Infinity)).toBe('-');
      expect(formatReactionTime(-Infinity)).toBe('-');
    });
  });

  describe('formatWinRate', () => {
    it('should format valid number values correctly as percentage', () => {
      expect(formatWinRate(0.5)).toBe('50.0');
      expect(formatWinRate(0.123)).toBe('12.3');
      expect(formatWinRate(0.999)).toBe('99.9');
      expect(formatWinRate(1)).toBe('100.0');
      expect(formatWinRate(0)).toBe('0.0');
    });

    it('should handle string numbers from Postgres NUMERIC', () => {
      expect(formatWinRate('0.5')).toBe('50.0');
      expect(formatWinRate('0.123')).toBe('12.3');
      expect(formatWinRate('1')).toBe('100.0');
    });

    it('should return fallback for null and undefined', () => {
      expect(formatWinRate(null)).toBe('0.0');
      expect(formatWinRate(undefined)).toBe('0.0');
    });

    it('should return fallback for invalid values', () => {
      expect(formatWinRate(NaN)).toBe('0.0');
      expect(formatWinRate('invalid')).toBe('0.0');
      expect(formatWinRate({})).toBe('0.0');
      expect(formatWinRate([])).toBe('0.0');
    });

    it('should return fallback for negative values', () => {
      expect(formatWinRate(-0.5)).toBe('0.0');
      expect(formatWinRate(-1)).toBe('0.0');
    });

    it('should handle Infinity', () => {
      expect(formatWinRate(Infinity)).toBe('0.0');
      expect(formatWinRate(-Infinity)).toBe('0.0');
    });

    it('should handle edge cases with very small numbers', () => {
      expect(formatWinRate(0.001)).toBe('0.1');
      expect(formatWinRate(0.0001)).toBe('0.0');
    });
  });
});
