import { Request, Response } from 'express';
import { MatchModel } from '../models/Match';
import { UserModel } from '../models/User';
import { TransactionModel } from '../models/Transaction';
import { EscrowService } from '../services/escrow';
import { EscrowStatus } from '../models/types';
import pool from '../config/database';

export class MatchController {
  /**
   * Get match history for a user
   */
  static async getMatchHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;
      const limit = parseInt(req.query.limit as string) || 20;

      // Check if refund columns exist before using them
      const refundColumnsExist = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'payment_intents' AND column_name = 'refund_status'
      `);

      let query: string;
      let params: any[];

      if (refundColumnsExist.rows.length > 0) {
        // Use full query with refund columns
        query = `
          SELECT 
            m.*,
            pi.payment_reference,
            pi.refund_status,
            pi.refund_deadline,
            pi.refund_amount,
            pi.refund_reason,
            u1.wallet_address as player1_wallet_addr,
            u2.wallet_address as player2_wallet_addr
          FROM matches m
          LEFT JOIN payment_intents pi ON pi.match_id = m.match_id AND pi.user_id = $1
          LEFT JOIN users u1 ON u1.user_id = m.player1_id
          LEFT JOIN users u2 ON u2.user_id = m.player2_id
          WHERE m.player1_id = $1 OR m.player2_id = $1
          ORDER BY m.created_at DESC
          LIMIT $2
        `;
      } else {
        // Fallback query without refund columns (migration not run yet)
        query = `
          SELECT 
            m.*,
            pi.payment_reference,
            u1.wallet_address as player1_wallet_addr,
            u2.wallet_address as player2_wallet_addr
          FROM matches m
          LEFT JOIN payment_intents pi ON pi.match_id = m.match_id AND pi.user_id = $1
          LEFT JOIN users u1 ON u1.user_id = m.player1_id
          LEFT JOIN users u2 ON u2.user_id = m.player2_id
          WHERE m.player1_id = $1 OR m.player2_id = $1
          ORDER BY m.created_at DESC
          LIMIT $2
        `;
      }

      params = [userId, limit];
      const matches = await pool.query(query, params);

      // Also get orphaned payments (paid but never matched) - only if refund columns exist
      let orphanedPayments: any = { rows: [] };
      if (refundColumnsExist.rows.length > 0) {
        orphanedPayments = await pool.query(`
          SELECT 
            pi.payment_reference,
            pi.amount,
            pi.created_at,
            pi.refund_status,
            pi.refund_deadline,
            pi.refund_reason
          FROM payment_intents pi
          WHERE pi.user_id = $1 
            AND pi.match_id IS NULL
            AND pi.normalized_status = 'confirmed'
          ORDER BY pi.created_at DESC
          LIMIT 10
        `, [userId]);
      }

      res.json({
        matches: matches.rows.map((m: any) => ({
          matchId: m.match_id,
          stake: m.stake,
          status: m.status,
          isWinner: m.winner_id === userId,
          canClaim: m.winner_id === userId && 
                    m.claim_status === 'unclaimed' && 
                    m.claim_deadline &&
                    new Date() < new Date(m.claim_deadline),
          // Only include refund fields if they exist
          canRefund: m.refund_status === 'eligible' && 
                     m.refund_deadline && 
                     new Date() < new Date(m.refund_deadline),
          refundExpired: m.refund_status === 'eligible' && 
                         m.refund_deadline && 
                         new Date() > new Date(m.refund_deadline),
          refundStatus: m.refund_status,
          refundReason: m.refund_reason,
          paymentReference: m.payment_reference,
          yourReaction: m.player1_id === userId ? m.player1_reaction_ms : m.player2_reaction_ms,
          opponentReaction: m.player1_id === userId ? m.player2_reaction_ms : m.player1_reaction_ms,
          completedAt: m.completed_at,
          createdAt: m.created_at,
          cancelled: m.cancelled,
          cancellationReason: m.cancellation_reason
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
      res.status(500).json({ error: 'Failed to get history', details: error.message });
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
