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
  private static readonly BOT_REACTION_THRESHOLD_MS = 100; // Reactions under 100ms flagged as suspicious

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
   * Check if reaction is suspiciously fast (possible bot)
   */
  static isSuspiciouslyFast(reactionMs: number): boolean {
    return reactionMs < this.BOT_REACTION_THRESHOLD_MS;
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
    suspicious?: boolean;
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

    // Check if suspiciously fast (possible bot)
    const suspicious = this.isSuspiciouslyFast(reactionMs);

    // Check if reaction is humanly possible
    if (!this.isHumanReaction(reactionMs)) {
      return {
        valid: false,
        reactionMs,
        reason: reactionMs < this.MIN_HUMAN_REACTION_MS ? 'too_fast' : 'timeout',
        suspicious,
      };
    }

    return {
      valid: true,
      reactionMs,
      suspicious,
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
      console.warn(`[AntiCheat] Suspicious pattern detected for user ${userId}: too consistent (variance: ${variance}ms)`);
      return true;
    }

    // Check for too many sub-100ms reactions
    const fastReactions = recentReactionTimes.filter(
      (time) => time < 100
    ).length;
    if (fastReactions / recentReactionTimes.length > 0.5) {
      console.warn(`[AntiCheat] Suspicious pattern detected for user ${userId}: too many fast reactions (${fastReactions}/${recentReactionTimes.length})`);
      return true;
    }

    // Check for bot-like consistency (std dev < 10ms with avg < 150ms)
    const mean = recentReactionTimes.reduce((sum, val) => sum + val, 0) / recentReactionTimes.length;
    if (mean < 150 && variance < 10) {
      console.warn(`[AntiCheat] Bot-like pattern detected for user ${userId}: mean ${mean}ms, variance ${variance}ms`);
      return true;
    }

    return false;
  }

  /**
   * Check for spam tapping pattern (multiple rapid taps)
   * This is detected server-side by only accepting first tap
   */
  static detectSpamTapping(tapCount: number, timeWindowMs: number): boolean {
    // If more than 3 taps in 500ms window, likely spam
    if (tapCount > 3 && timeWindowMs < 500) {
      console.warn(`[AntiCheat] Spam tapping detected: ${tapCount} taps in ${timeWindowMs}ms`);
      return true;
    }
    return false;
  }

  /**
   * Hook for VPN/Proxy detection
   * Returns true if IP address is suspicious
   */
  static async checkVPN(ipAddress: string): Promise<boolean> {
    // Placeholder for VPN/proxy detection
    // In production, this would integrate with a VPN detection service
    console.log(`[AntiCheat] VPN check for IP: ${ipAddress} (not implemented)`);
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
    suspicious?: boolean;
  }): void {
    // In production, this would write to a secure audit log
    const auditLevel = data.suspicious ? '[AUDIT-SUSPICIOUS]' : '[AUDIT]';
    console.log(auditLevel, {
      matchId,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
}
