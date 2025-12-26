/**
 * Anti-cheat service for detecting suspicious gameplay patterns
 */
export class AntiCheatService {
  private static readonly MIN_HUMAN_REACTION_MS = parseInt(
    process.env.MIN_REACTION_MS || '80',
    10
  );
  private static readonly MAX_REACTION_MS = parseInt(
    process.env.MAX_REACTION_MS || '3000',
    10
  );
  private static readonly SUSPICIOUS_PATTERN_THRESHOLD = 3;

  /**
   * Validate if reaction time is humanly possible
   */
  static isHumanReaction(reactionMs: number): boolean {
    return (
      reactionMs >= this.MIN_HUMAN_REACTION_MS &&
      reactionMs <= this.MAX_REACTION_MS
    );
  }

  /**
   * Check if reaction occurred before signal (false start)
   */
  static isFalseStart(tapTimestamp: number, signalTimestamp: number): boolean {
    return tapTimestamp < signalTimestamp;
  }

  /**
   * Validate tap timestamp against server-side signal timestamp
   */
  static validateReaction(
    _clientTapTimestamp: number, // Kept for API compatibility but not used
    serverTapTimestamp: number,
    signalTimestamp: number
  ): {
    valid: boolean;
    reactionMs: number;
    reason?: string;
  } {
    // Use server timestamp as the source of truth
    const reactionMs = serverTapTimestamp - signalTimestamp;

    // Check for false start
    if (this.isFalseStart(serverTapTimestamp, signalTimestamp)) {
      return {
        valid: false,
        reactionMs,
        reason: 'false_start',
      };
    }

    // Check if reaction is humanly possible
    if (!this.isHumanReaction(reactionMs)) {
      return {
        valid: false,
        reactionMs,
        reason: reactionMs < this.MIN_HUMAN_REACTION_MS ? 'too_fast' : 'timeout',
      };
    }

    return {
      valid: true,
      reactionMs,
    };
  }

  /**
   * Check for suspicious patterns in user's match history
   * Returns true if patterns are suspicious
   */
  static async checkSuspiciousPatterns(
    userId: string,
    recentReactionTimes: number[]
  ): Promise<boolean> {
    if (recentReactionTimes.length < this.SUSPICIOUS_PATTERN_THRESHOLD) {
      return false;
    }

    // Check for impossible consistency (all reactions within 5ms)
    const variance = this.calculateVariance(recentReactionTimes);
    if (variance < 5) {
      console.warn(`Suspicious pattern detected for user ${userId}: too consistent`);
      return true;
    }

    // Check for too many sub-100ms reactions
    const fastReactions = recentReactionTimes.filter(
      (time) => time < 100
    ).length;
    if (fastReactions / recentReactionTimes.length > 0.5) {
      console.warn(`Suspicious pattern detected for user ${userId}: too many fast reactions`);
      return true;
    }

    return false;
  }

  private static calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Log match audit information for review
   */
  static logMatchAudit(matchId: string, data: {
    player1Id: string;
    player2Id: string;
    player1ReactionMs: number;
    player2ReactionMs: number;
    signalTimestamp: number;
    winnerId?: string;
  }): void {
    // In production, this would write to a secure audit log
    console.log('[AUDIT]', {
      matchId,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
}
