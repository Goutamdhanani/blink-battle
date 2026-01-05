import { AntiCheatService } from '../../services/antiCheat';

describe('Anti-Cheat Tap Tolerance', () => {
  describe('checkTimingDiscrepancy', () => {
    it('should not throw error for legitimate timing discrepancies', () => {
      const userId = 'user-123';
      
      // Test cases within reasonable bounds (< 500ms)
      const testCases = [
        { client: 1000, server: 1046, expected: false }, // 46ms diff - legitimate
        { client: 500, server: 550, expected: false },   // 50ms diff - clock skew
        { client: 800, server: 1000, expected: false },  // 200ms diff - network latency
        { client: 1500, server: 1989, expected: false }, // 489ms diff - within tolerance
      ];

      testCases.forEach(({ client, server, expected }) => {
        const result = AntiCheatService.checkTimingDiscrepancy(client, server, userId);
        expect(result).toBe(expected);
      });
    });

    it('should flag but not throw for large timing discrepancies', () => {
      const userId = 'user-123';
      
      // Large discrepancy (> 500ms) should return true (suspicious) but not throw
      const result = AntiCheatService.checkTimingDiscrepancy(1000, 2000, userId);
      expect(result).toBe(true); // Suspicious detected
    });

    it('should handle negative client reaction times', () => {
      const userId = 'user-123';
      
      // Client timestamp before green light (negative reaction)
      const clientReaction = -515;
      const serverReaction = 0; // Server clamped to 0
      
      const result = AntiCheatService.checkTimingDiscrepancy(clientReaction, serverReaction, userId);
      // Large discrepancy due to client clock issues
      expect(result).toBe(true); // Should flag as suspicious but not throw
    });
  });
});
