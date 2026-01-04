/**
 * Anti-cheat service for detecting suspicious gameplay patterns
 */
import pool from '../config/database';

// Anti-cheat thresholds (configurable via environment variables)
const INHUMAN_REACTION_THRESHOLD_MS = parseInt(process.env.INHUMAN_REACTION_THRESHOLD_MS || '100', 10);
const BOT_CONSISTENCY_REACTION_MS = parseInt(process.env.BOT_CONSISTENCY_REACTION_MS || '150', 10);
const BOT_CONSISTENCY_VARIANCE_MS = parseInt(process.env.BOT_CONSISTENCY_VARIANCE_MS || '10', 10);
const HIGH_WIN_RATE_THRESHOLD = parseFloat(process.env.HIGH_WIN_RATE_THRESHOLD || '90');
const MIN_MATCHES_FOR_WIN_RATE = parseInt(process.env.MIN_MATCHES_FOR_WIN_RATE || '20', 10);

// PostgreSQL error codes
const PG_ERROR_UNDEFINED_TABLE = '42P01';

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

  /**
   * Detect and record suspicious activity to database
   * Flags users with:
   * - Reaction times consistently < 100ms
   * - Win rate > 90% over 20+ matches
   * - Inhuman reaction patterns
   * 
   * @returns true if suspicious activity was detected and recorded
   */
  static async detectAndRecordSuspiciousActivity(userId: string, matchId?: string): Promise<boolean> {
    try {
      // Get recent taps for this user (last 20 valid taps)
      const recentTaps = await pool.query(`
        SELECT reaction_ms FROM tap_events
        WHERE user_id = $1 AND is_valid = true AND disqualified = false
        ORDER BY created_at DESC LIMIT 20
      `, [userId]);

      if (!recentTaps.rowCount || recentTaps.rowCount < 5) {
        // Not enough data to assess
        return false;
      }

      const reactions = recentTaps.rows.map(r => r.reaction_ms);
      const avgReaction = reactions.reduce((sum, t) => sum + t, 0) / reactions.length;

      // Flag if average reaction < INHUMAN_REACTION_THRESHOLD_MS (humanly impossible)
      if (avgReaction < INHUMAN_REACTION_THRESHOLD_MS) {
        await pool.query(`
          INSERT INTO suspicious_activity (user_id, reason, avg_reaction_ms, match_id, details)
          VALUES ($1, 'inhuman_reaction_time', $2, $3, $4)
        `, [
          userId, 
          avgReaction, 
          matchId || null,
          `Average reaction time of ${avgReaction.toFixed(2)}ms over ${reactions.length} matches is inhuman (< ${INHUMAN_REACTION_THRESHOLD_MS}ms)`
        ]);
        console.warn(`[AntiCheat] Flagged user ${userId} for inhuman reaction time: ${avgReaction.toFixed(2)}ms`);
        return true;
      }

      // Check for bot-like consistency
      const variance = AntiCheatService.calculateVariance(reactions);
      if (avgReaction < BOT_CONSISTENCY_REACTION_MS && variance < BOT_CONSISTENCY_VARIANCE_MS && reactions.length >= 10) {
        await pool.query(`
          INSERT INTO suspicious_activity (user_id, reason, avg_reaction_ms, match_id, details)
          VALUES ($1, 'bot_like_consistency', $2, $3, $4)
        `, [
          userId,
          avgReaction,
          matchId || null,
          `Bot-like consistency detected: avg ${avgReaction.toFixed(2)}ms, variance ${variance.toFixed(2)}ms over ${reactions.length} matches`
        ]);
        console.warn(`[AntiCheat] Flagged user ${userId} for bot-like consistency`);
        return true;
      }

      // Check win rate (if enough matches)
      const matchStats = await pool.query(`
        SELECT 
          COUNT(*) as total_matches,
          SUM(CASE WHEN winner_id = $1 THEN 1 ELSE 0 END) as wins
        FROM matches
        WHERE (player1_id = $1 OR player2_id = $1)
          AND status = 'completed'
          AND completed_at > NOW() - INTERVAL '7 days'
      `, [userId]);

      const { total_matches, wins } = matchStats.rows[0] || { total_matches: 0, wins: 0 };
      if (total_matches >= MIN_MATCHES_FOR_WIN_RATE) {
        const winRate = (wins / total_matches) * 100;
        if (winRate > HIGH_WIN_RATE_THRESHOLD) {
          await pool.query(`
            INSERT INTO suspicious_activity (user_id, reason, avg_reaction_ms, match_id, details)
            VALUES ($1, 'high_win_rate', $2, $3, $4)
          `, [
            userId,
            avgReaction,
            matchId || null,
            `Suspiciously high win rate: ${winRate.toFixed(1)}% over ${total_matches} matches in last 7 days`
          ]);
          console.warn(`[AntiCheat] Flagged user ${userId} for high win rate: ${winRate.toFixed(1)}%`);
          return true;
        }
      }

      return false;
    } catch (error: any) {
      // Don't fail the match if anti-cheat check fails
      // Handle table not existing gracefully
      if (error.code === PG_ERROR_UNDEFINED_TABLE) {
        // Table doesn't exist yet
        console.log('[AntiCheat] suspicious_activity table not yet created, skipping check');
        return false;
      }
      console.error('[AntiCheat] Error checking suspicious activity:', error.message);
      return false;
    }
  }

  /**
   * Check for timing discrepancy between client and server
   * Large discrepancies may indicate tampering
   * SECURITY: Now throws error to reject taps with >500ms discrepancy
   */
  static checkTimingDiscrepancy(
    clientReactionMs: number,
    serverReactionMs: number,
    userId: string
  ): boolean {
    const discrepancy = Math.abs(clientReactionMs - serverReactionMs);
    const MAX_DISCREPANCY_MS = 500;
    
    if (discrepancy > MAX_DISCREPANCY_MS) {
      console.warn(
        `[AntiCheat] Large timing discrepancy for user ${userId}: ` +
        `client=${clientReactionMs}ms, server=${serverReactionMs}ms, diff=${discrepancy}ms`
      );
      
      // SECURITY: Reject taps with suspicious timing discrepancies
      throw new Error(
        `Timing discrepancy too large (${discrepancy}ms). ` +
        `This may indicate clock manipulation or network issues.`
      );
    }
    
    return false;
  }
}
