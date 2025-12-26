import { Request, Response } from 'express';
import { MatchModel } from '../models/Match';
import { UserModel } from '../models/User';
import { TransactionModel } from '../models/Transaction';

export class MatchController {
  /**
   * Get match history for a user
   */
  static async getMatchHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).userId;
      const limit = parseInt(req.query.limit as string) || 10;

      const matches = await MatchModel.getMatchHistory(userId, limit);

      // Enhance match data with opponent info
      const enhancedMatches = await Promise.all(
        matches.map(async (match) => {
          const opponentId = match.player1_id === userId ? match.player2_id : match.player1_id;
          const opponent = await UserModel.findById(opponentId);
          
          return {
            matchId: match.match_id,
            stake: match.stake,
            yourReaction: match.player1_id === userId ? match.player1_reaction_ms : match.player2_reaction_ms,
            opponentReaction: match.player1_id === userId ? match.player2_reaction_ms : match.player1_reaction_ms,
            won: match.winner_id === userId,
            opponent: opponent ? {
              wallet: opponent.wallet_address,
              avgReaction: opponent.avg_reaction_time,
            } : null,
            completedAt: match.completed_at,
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
   * Get specific match details
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
      });
    } catch (error) {
      console.error('Error fetching match:', error);
      return res.status(500).json({ error: 'Failed to fetch match' });
    }
  }
}
