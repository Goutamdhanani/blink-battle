import { Request, Response } from 'express';
import { MatchModel } from '../models/Match';
import { UserModel } from '../models/User';
import { TransactionModel } from '../models/Transaction';
import { EscrowService } from '../services/escrow';
import { EscrowStatus } from '../models/types';

export class MatchController {
  /**
   * Get match history for a user
   */
  static async getMatchHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;
      const limit = parseInt(req.query.limit as string) || 10;

      const matches = await MatchModel.getMatchHistory(userId, limit);

      // Enhance match data with opponent info and claim status
      const enhancedMatches = await Promise.all(
        matches.map(async (match) => {
          const opponentId = match.player1_id === userId ? match.player2_id : match.player1_id;
          const opponent = await UserModel.findById(opponentId);
          const isWinner = match.winner_id === userId;
          
          // Calculate claim deadline info for winners
          let claimInfo: any = {};
          if (isWinner && match.stake > 0 && match.claim_deadline) {
            const deadline = new Date(match.claim_deadline);
            const now = new Date();
            const msRemaining = deadline.getTime() - now.getTime();
            
            claimInfo = {
              claimDeadline: deadline.toISOString(),
              claimStatus: match.claim_status || 'unclaimed',
              claimTimeRemaining: Math.max(0, Math.floor(msRemaining / 1000)), // seconds
              claimable: match.claim_status === 'unclaimed' && msRemaining > 0
            };
          }
          
          return {
            matchId: match.match_id,
            stake: match.stake,
            yourReaction: match.player1_id === userId ? match.player1_reaction_ms : match.player2_reaction_ms,
            opponentReaction: match.player1_id === userId ? match.player2_reaction_ms : match.player1_reaction_ms,
            won: isWinner,
            opponent: opponent ? {
              wallet: opponent.wallet_address,
              avgReaction: opponent.avg_reaction_time,
            } : null,
            completedAt: match.completed_at,
            ...claimInfo
          };
        })
      );

      res.json({
        success: true,
        matches: enhancedMatches,
      });
    } catch (error) {
      console.error('Error fetching match history:', error);
      res.status(500).json({ error: 'Failed to fetch match history' });
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
