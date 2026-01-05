import { Request, Response } from 'express';
import { MatchModel } from '../models/Match';
import { UserModel } from '../models/User';
import { TransactionModel } from '../models/Transaction';
import { EscrowService } from '../services/escrow';
import { EscrowStatus } from '../models/types';
import pool from '../config/database';

// Constants
const GAS_FEE_PERCENT = 3; // Gas fee deducted from refunds (3%)

/**
 * Determine match outcome for a specific user
 * Priority: result_type > winner_id > status
 * 
 * @param match - Match data from database
 * @param userId - User ID to determine outcome for
 * @returns Outcome type: 'win' | 'loss' | 'draw' | 'cancelled' | 'active' | 'pending' | 'unknown'
 */
function getMatchOutcome(match: any, userId: string): 'win' | 'loss' | 'draw' | 'cancelled' | 'active' | 'pending' | 'unknown' {
  // Active/incomplete matches
  if (match.status === 'in_progress' || match.status === 'countdown' || match.status === 'signal') {
    return 'active';
  }
  
  if (match.status === 'pending' || match.status === 'waiting' || match.status === 'ready' || match.status === 'matched') {
    return 'pending';
  }
  
  // Priority 1: result_type (most specific)
  if (match.result_type === 'tie' || 
      match.result_type === 'both_disqualified' || 
      match.result_type === 'both_timeout_tie') {
    return 'draw';
  }
  
  // Priority 2: cancelled status
  if (match.status === 'cancelled' || match.cancelled === true) {
    return 'cancelled';
  }
  
  // Priority 3: winner_id (for completed matches)
  if (match.status === 'completed') {
    if (!match.winner_id) {
      // No winner but completed - treat as draw
      return 'draw';
    }
    
    return match.winner_id === userId ? 'win' : 'loss';
  }
  
  return 'unknown';
}

/**
 * Check if user can claim refund for this match
 * Requires database check for completed refunds
 * 
 * @param match - Match data from database  
 * @param userId - User ID to check refund eligibility for
 * @returns true if user can claim refund, false otherwise
 */
async function canClaimRefund(match: any, userId: string): Promise<boolean> {
  const outcome = getMatchOutcome(match, userId);
  
  // Only draw or cancelled matches are eligible
  if (outcome !== 'draw' && outcome !== 'cancelled') {
    return false;
  }
  
  // Check if refund columns exist
  if (!match.refund_status) {
    return false; // No refund system available
  }
  
  // Check if refund already completed
  const result = await pool.query(
    `SELECT refund_status FROM payment_intents 
     WHERE match_id = $1 AND user_id = $2 AND refund_status = 'completed'
     LIMIT 1`,
    [match.match_id, userId]
  );
  
  if (result.rows.length > 0) {
    return false; // Already claimed
  }
  
  // Check if eligible and not expired
  if (match.refund_status !== 'eligible') {
    return false;
  }
  
  if (match.refund_deadline && new Date() > new Date(match.refund_deadline)) {
    return false; // Expired
  }
  
  return true;
}

/**
 * Check if user can claim winnings for this match
 * User must be the winner and no completed payout/claim exists
 * 
 * @param match - Match data from database
 * @param userId - User ID to check claim eligibility for
 * @returns true if user can claim winnings, false otherwise
 */
async function canClaimWinnings(match: any, userId: string): Promise<boolean> {
  const outcome = getMatchOutcome(match, userId);
  
  // Only winners can claim
  if (outcome !== 'win') {
    return false;
  }
  
  // Match must be completed
  if (match.status !== 'completed') {
    return false;
  }
  
  // Check if already claimed
  if (match.claim_status === 'claimed') {
    return false;
  }
  
  // Check claim deadline
  if (match.claim_deadline && new Date() > new Date(match.claim_deadline)) {
    return false; // Expired
  }
  
  return true;
}

export class MatchController {
  /**
   * Get match history for a user
   */
  static async getMatchHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;
      const limit = parseInt(req.query.limit as string) || 20;

      // Calculate 7 days ago timestamp for filtering recent matches
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Check if refund columns exist before using them
      const refundColumnsExist = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'payment_intents' AND column_name = 'refund_status'
      `);

      let query: string;
      let params: any[];

      if (refundColumnsExist.rows.length > 0) {
        // Use full query with refund columns and tap_events join
        query = `
          SELECT 
            m.*,
            pi.payment_reference,
            pi.refund_status,
            pi.refund_deadline,
            pi.refund_amount,
            pi.refund_reason,
            u1.wallet_address as player1_wallet_addr,
            u1.avg_reaction_time as player1_avg_reaction,
            u2.wallet_address as player2_wallet_addr,
            u2.avg_reaction_time as player2_avg_reaction,
            te1.reaction_ms as player1_tap_reaction_ms,
            te1.is_valid as player1_tap_is_valid,
            te2.reaction_ms as player2_tap_reaction_ms,
            te2.is_valid as player2_tap_is_valid
          FROM matches m
          LEFT JOIN payment_intents pi ON pi.match_id = m.match_id AND pi.user_id = $1
          LEFT JOIN users u1 ON u1.user_id = m.player1_id
          LEFT JOIN users u2 ON u2.user_id = m.player2_id
          LEFT JOIN tap_events te1 ON te1.match_id = m.match_id AND te1.user_id = m.player1_id
          LEFT JOIN tap_events te2 ON te2.match_id = m.match_id AND te2.user_id = m.player2_id
          WHERE (m.player1_id = $1 OR m.player2_id = $1)
            AND m.status = 'completed'
            AND m.completed_at IS NOT NULL
            AND m.completed_at >= $3
          ORDER BY m.completed_at DESC
          LIMIT $2
        `;
        params = [userId, limit, sevenDaysAgo];
      } else {
        // Fallback query without refund columns (migration not run yet)
        query = `
          SELECT 
            m.*,
            pi.payment_reference,
            u1.wallet_address as player1_wallet_addr,
            u1.avg_reaction_time as player1_avg_reaction,
            u2.wallet_address as player2_wallet_addr,
            u2.avg_reaction_time as player2_avg_reaction,
            te1.reaction_ms as player1_tap_reaction_ms,
            te1.is_valid as player1_tap_is_valid,
            te2.reaction_ms as player2_tap_reaction_ms,
            te2.is_valid as player2_tap_is_valid
          FROM matches m
          LEFT JOIN payment_intents pi ON pi.match_id = m.match_id AND pi.user_id = $1
          LEFT JOIN users u1 ON u1.user_id = m.player1_id
          LEFT JOIN users u2 ON u2.user_id = m.player2_id
          LEFT JOIN tap_events te1 ON te1.match_id = m.match_id AND te1.user_id = m.player1_id
          LEFT JOIN tap_events te2 ON te2.match_id = m.match_id AND te2.user_id = m.player2_id
          WHERE (m.player1_id = $1 OR m.player2_id = $1)
            AND m.status = 'completed'
            AND m.completed_at IS NOT NULL
            AND m.completed_at >= $3
          ORDER BY m.completed_at DESC
          LIMIT $2
        `;
        params = [userId, limit, sevenDaysAgo];
      }

      const matches = await pool.query(query, params);

      // Also get orphaned payments (paid but never matched) or draw/cancelled matches - only if refund columns exist
      // Exclude completed matches (win/loss) and in-progress matches
      let orphanedPayments: any = { rows: [] };
      if (refundColumnsExist.rows.length > 0) {
        orphanedPayments = await pool.query(`
          SELECT 
            pi.payment_reference,
            pi.amount,
            pi.created_at,
            pi.refund_status,
            pi.refund_deadline,
            pi.refund_reason,
            m.status as match_status,
            m.result_type,
            m.cancelled
          FROM payment_intents pi
          LEFT JOIN matches m ON m.match_id = pi.match_id
          WHERE pi.user_id = $1 
            AND pi.normalized_status = 'confirmed'
            AND pi.refund_status != 'completed'
            AND (
              -- Orphaned deposits (no match)
              pi.match_id IS NULL
              OR
              -- Draw or cancelled matches only
              m.status = 'cancelled'
              OR m.cancelled = true
              OR m.result_type IN ('tie', 'both_disqualified', 'both_timeout_tie')
            )
          ORDER BY pi.created_at DESC
          LIMIT 10
        `, [userId]);
      }

      // Map matches to frontend format with server-authoritative data
      const mappedMatches = await Promise.all(matches.rows.map(async (m: any) => {
        const isPlayer1 = m.player1_id === userId;
        const opponentWallet = isPlayer1 ? m.player2_wallet_addr : m.player1_wallet_addr;
        const opponentAvgReaction = isPlayer1 ? m.player2_avg_reaction : m.player1_avg_reaction;
        
        // SERVER AUTHORITY: Use reaction_ms from tap_events table (trusted source)
        // Prefer tap_events data over matches.player*_reaction_ms
        const yourReaction = isPlayer1 
          ? (m.player1_tap_reaction_ms !== null ? m.player1_tap_reaction_ms : m.player1_reaction_ms)
          : (m.player2_tap_reaction_ms !== null ? m.player2_tap_reaction_ms : m.player2_reaction_ms);
        
        const opponentReaction = isPlayer1 
          ? (m.player2_tap_reaction_ms !== null ? m.player2_tap_reaction_ms : m.player2_reaction_ms)
          : (m.player1_tap_reaction_ms !== null ? m.player1_tap_reaction_ms : m.player1_reaction_ms);
        
        // Get tap validity flags
        const yourTapValid = isPlayer1 ? m.player1_tap_is_valid : m.player2_tap_is_valid;
        const opponentTapValid = isPlayer1 ? m.player2_tap_is_valid : m.player1_tap_is_valid;

        // Calculate claim deadline time remaining
        let claimTimeRemaining: number | undefined;
        if (m.claim_deadline) {
          const deadline = new Date(m.claim_deadline).getTime();
          const now = Date.now();
          claimTimeRemaining = Math.max(0, Math.floor((deadline - now) / 1000));
        }

        // SERVER AUTHORITY: Use helper functions to determine eligibility
        const outcome = getMatchOutcome(m, userId);
        const canRefund = await canClaimRefund(m, userId);
        const canClaim = await canClaimWinnings(m, userId);
        
        // Check if winnings have been claimed
        const claimed = m.claim_status === 'claimed';

        return {
          matchId: m.match_id,
          stake: m.stake,
          // SERVER AUTHORITY: reaction_ms from tap_events table (trusted source)
          reaction_ms: yourReaction, // Field name per spec
          yourReaction, // Keep for backward compatibility
          opponentReaction,
          tapValid: yourTapValid, // Tap validity flag
          opponentTapValid, // Opponent tap validity flag
          won: outcome === 'win',
          outcome, // SERVER AUTHORITY: computed server-side
          resultType: m.result_type,
          opponent: opponentWallet ? {
            wallet: opponentWallet,
            avgReaction: opponentAvgReaction || 0
          } : null,
          completedAt: m.completed_at,
          // Claim fields for frontend (only for wins) - SERVER AUTHORITY
          claimDeadline: m.claim_deadline || undefined,
          claimStatus: m.claim_status || undefined,
          claimTimeRemaining,
          claimed, // Explicit claimed flag
          // SERVER AUTHORITY: canClaimWinnings from helper function
          canClaimWinnings: canClaim,
          claimable: canClaim, // Keep for backward compatibility
          // Keep legacy fields for backward compatibility
          status: m.status,
          isWinner: outcome === 'win',
          canClaim: canClaim,
          // Refund fields (only for draw/cancelled) - SERVER AUTHORITY
          canClaimRefund: canRefund,
          canRefund: canRefund, // Keep for backward compatibility
          refundExpired: m.refund_status === 'eligible' && 
                         m.refund_deadline && 
                         new Date() > new Date(m.refund_deadline),
          refundStatus: m.refund_status,
          refundReason: m.refund_reason,
          refundAmount: m.refund_amount,
          paymentReference: m.payment_reference,
          createdAt: m.created_at,
          cancelled: m.cancelled,
          cancellationReason: m.cancellation_reason
        };
      }));

      res.json({
        success: true, // Add success flag for frontend
        matches: mappedMatches,
        pendingRefunds: orphanedPayments.rows.map((p: any) => ({
          paymentReference: p.payment_reference,
          amount: p.amount,
          createdAt: p.created_at,
          type: 'matchmaking_cancelled',
          canClaimDeposit: true, // Flag to show claim button
          refundAmount: p.amount * (1 - GAS_FEE_PERCENT / 100), // 3% protocol fee
          protocolFeePercent: GAS_FEE_PERCENT
        })),
        cancelledPayments: orphanedPayments.rows.map((p: any) => ({
          paymentReference: p.payment_reference,
          amount: p.amount,
          createdAt: p.created_at,
          type: 'matchmaking_cancelled',
          canRefund: p.refund_status === 'eligible' && p.refund_deadline && new Date() < new Date(p.refund_deadline),
          refundExpired: p.refund_status === 'eligible' && p.refund_deadline && new Date() > new Date(p.refund_deadline),
          refundStatus: p.refund_status,
          refundReason: p.refund_reason
        })),
        migrationPending: refundColumnsExist.rows.length === 0
      });
    } catch (error: any) {
      console.error('[History] Error:', error.message);
      res.status(500).json({ success: false, error: 'Failed to get history', details: error.message });
    }
  }

  /**
   * Get specific match details with transactions and escrow status
   */
  static async getMatch(req: Request, res: Response) {
    try {
      const { matchId } = req.params;
      const userId = (req as any).userId;

      const match = await MatchModel.findById(matchId);
      if (!match) {
        return res.status(404).json({ error: 'Match not found' });
      }

      // Verify user is part of this match
      if (match.player1_id !== userId && match.player2_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Get transactions for this match
      const transactions = await TransactionModel.getByMatchId(matchId);

      // Get escrow status from on-chain if match has stake
      let escrowStatus: EscrowStatus = EscrowStatus.NOT_REQUIRED;
      let escrowVerification: any = null;

      if (match.stake > 0) {
        const verification = await EscrowService.verifyEscrowOnChain(matchId, match.stake);
        escrowVerification = verification;
        
        if (verification.verified) {
          escrowStatus = EscrowStatus.VERIFIED;
        } else if (verification.error) {
          escrowStatus = EscrowStatus.FAILED;
        } else {
          escrowStatus = EscrowStatus.PENDING;
        }
      }

      return res.json({
        success: true,
        match: {
          matchId: match.match_id,
          stake: match.stake,
          status: match.status,
          player1Reaction: match.player1_reaction_ms,
          player2Reaction: match.player2_reaction_ms,
          winnerId: match.winner_id,
          fee: match.fee,
          createdAt: match.created_at,
          completedAt: match.completed_at,
        },
        transactions,
        escrow: {
          status: escrowStatus,
          verification: escrowVerification,
        },
      });
    } catch (error) {
      console.error('Error fetching match:', error);
      return res.status(500).json({ error: 'Failed to fetch match' });
    }
  }

  /**
   * Get match status for active/pending matches
   * Provides real-time status including escrow verification
   */
  static async getMatchStatus(req: Request, res: Response) {
    try {
      const { matchId } = req.params;
      const userId = (req as any).userId;

      const match = await MatchModel.findById(matchId);
      if (!match) {
        return res.status(404).json({ 
          success: false,
          error: 'Match not found',
          code: 'MATCH_NOT_FOUND'
        });
      }

      // Verify user is part of this match
      if (match.player1_id !== userId && match.player2_id !== userId) {
        return res.status(403).json({ 
          success: false,
          error: 'Unauthorized',
          code: 'UNAUTHORIZED'
        });
      }

      // Get transactions to determine payment status
      const transactions = await TransactionModel.getByMatchId(matchId);
      const confirmedStakes = transactions.filter(t => 
        t.type === 'stake' && t.status === 'completed'
      );
      const hasRefunds = transactions.some(t => t.type === 'refund');
      const hasPayouts = transactions.some(t => t.type === 'payout');

      // Determine escrow status
      let escrowStatus: EscrowStatus = EscrowStatus.NOT_REQUIRED;
      let escrowData: any = null;

      if (match.stake > 0) {
        const verification = await EscrowService.verifyEscrowOnChain(matchId, match.stake);
        
        if (verification.verified) {
          escrowStatus = EscrowStatus.VERIFIED;
          escrowData = verification.matchData;
        } else if (hasRefunds) {
          escrowStatus = EscrowStatus.REFUNDED;
        } else if (hasPayouts) {
          escrowStatus = EscrowStatus.DISTRIBUTED;
        } else if (confirmedStakes.length === 2) {
          escrowStatus = EscrowStatus.FUNDED;
        } else if (confirmedStakes.length === 1) {
          escrowStatus = EscrowStatus.PARTIAL;
        } else if (verification.error) {
          escrowStatus = EscrowStatus.FAILED;
        } else {
          escrowStatus = EscrowStatus.PENDING;
        }
      }

      return res.json({
        success: true,
        matchId: match.match_id,
        status: match.status,
        stake: match.stake,
        escrowStatus,
        escrowData,
        isPlayer1: match.player1_id === userId,
        isPlayer2: match.player2_id === userId,
        player1Staked: confirmedStakes.some(t => {
          const p1User = match.player1_id;
          return t.from_wallet && p1User === match.player1_id;
        }),
        player2Staked: confirmedStakes.some(t => {
          const p2User = match.player2_id;
          return t.from_wallet && p2User === match.player2_id;
        }),
        hasStarted: match.signal_timestamp !== null,
        hasCompleted: match.status === 'completed' || match.status === 'cancelled' || match.status === 'refunded',
        winnerId: match.winner_id,
        canProceed: escrowStatus === EscrowStatus.VERIFIED || escrowStatus === EscrowStatus.NOT_REQUIRED,
        message: this.getStatusMessage(match.status, escrowStatus),
      });
    } catch (error) {
      console.error('Error fetching match status:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to fetch match status',
        code: 'SERVER_ERROR'
      });
    }
  }

  /**
   * Get human-readable status message
   */
  private static getStatusMessage(matchStatus: string, escrowStatus: EscrowStatus): string {
    if (matchStatus === 'cancelled') {
      return 'Match was cancelled';
    }
    if (matchStatus === 'refunded') {
      return 'Match was cancelled and funds refunded';
    }
    if (matchStatus === 'completed') {
      return 'Match completed';
    }

    switch (escrowStatus) {
      case EscrowStatus.NOT_REQUIRED:
        return 'Free match - ready to play';
      case EscrowStatus.PENDING:
        return 'Waiting for both players to deposit stakes';
      case EscrowStatus.PARTIAL:
        return 'Waiting for opponent to deposit stake';
      case EscrowStatus.FUNDED:
        return 'Both players funded - verifying escrow';
      case EscrowStatus.VERIFIED:
        return 'Escrow verified - ready to play';
      case EscrowStatus.LOCKED:
        return 'Game in progress';
      case EscrowStatus.FAILED:
        return 'Escrow verification failed - match will be cancelled';
      default:
        return 'Match pending';
    }
  }
}
