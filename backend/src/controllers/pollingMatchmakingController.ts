import { Request, Response } from 'express';
import { MatchQueueModel, QueueStatus } from '../models/MatchQueue';
import { MatchModel } from '../models/Match';
import { UserModel } from '../models/User';
import { MatchStatus } from '../models/types';
import { generateRandomDelay } from '../services/randomness';
import { PaymentIntentModel, NormalizedPaymentStatus } from '../models/PaymentIntent';

/**
 * HTTP Polling Matchmaking Controller
 * Replaces WebSocket-based matchmaking with REST endpoints
 */
export class PollingMatchmakingController {
  /**
   * POST /api/matchmaking/join
   * Join matchmaking queue by stake amount
   * 
   * CRITICAL: Enforces payment gating for staked matches
   * - Free matches (stake = 0) can proceed without payment
   * - Staked matches require confirmed payment before joining queue
   */
  static async join(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { stake, paymentReference } = req.body;

      if (typeof stake !== 'number' || stake < 0) {
        res.status(400).json({ error: 'Invalid stake amount' });
        return;
      }

      // CRITICAL: Stake cap enforcement (0.1 WLD max for platform safety)
      const MAX_STAKE = parseFloat(process.env.MAX_STAKE_WLD || '0.1');
      if (stake > MAX_STAKE) {
        res.status(400).json({ 
          error: 'Stake amount exceeds maximum',
          maxStake: MAX_STAKE,
          details: `Maximum stake is ${MAX_STAKE} WLD`
        });
        return;
      }

      // CRITICAL: Payment gating for staked matches
      // Require confirmed payment before joining matchmaking queue
      if (stake > 0) {
        if (!paymentReference) {
          res.status(400).json({ 
            error: 'Payment required for staked matches',
            requiresPayment: true,
            stake
          });
          return;
        }

        // Verify payment exists and is confirmed
        const paymentIntent = await PaymentIntentModel.findByReference(paymentReference);

        if (!paymentIntent) {
          res.status(404).json({ 
            error: 'Payment not found',
            paymentReference
          });
          return;
        }

        if (paymentIntent.user_id !== userId) {
          res.status(403).json({ error: 'Payment does not belong to this user' });
          return;
        }

        if (paymentIntent.normalized_status !== NormalizedPaymentStatus.CONFIRMED) {
          res.status(403).json({ 
            error: 'Payment not confirmed. Please ensure your payment is confirmed before joining matchmaking.',
            status: paymentIntent.normalized_status,
            requiresPayment: true
          });
          return;
        }

        console.log(`[HTTP Matchmaking] Payment verified for user ${userId}, reference ${paymentReference}`);
      }

      // Check if user already in queue
      const existingQueue = await MatchQueueModel.findByUserId(userId);
      if (existingQueue) {
        res.status(400).json({ 
          error: 'Already in matchmaking queue',
          queueId: existingQueue.queue_id,
          status: existingQueue.status
        });
        return;
      }

      // Check if user already in active match
      const activeMatch = await MatchModel.findById(userId);
      if (activeMatch && activeMatch.status !== MatchStatus.COMPLETED && activeMatch.status !== MatchStatus.CANCELLED) {
        res.status(400).json({ 
          error: 'Already in active match',
          matchId: activeMatch.match_id
        });
        return;
      }

      // Try to find a match first
      const waitingPlayer = await MatchQueueModel.findMatch(stake, userId);
      
      if (waitingPlayer) {
        // Found a match! Create match immediately
        const player1 = await UserModel.findById(waitingPlayer.user_id);
        const player2 = await UserModel.findById(userId);

        if (!player1 || !player2) {
          res.status(404).json({ error: 'Player not found' });
          return;
        }

        // Mark first player's queue entry as matched
        await MatchQueueModel.updateStatus(waitingPlayer.queue_id, QueueStatus.MATCHED);

        // Create queue entry for second player and mark as matched
        const player2Queue = await MatchQueueModel.enqueue(userId, stake);
        await MatchQueueModel.updateStatus(player2Queue.queue_id, QueueStatus.MATCHED);

        // Create match
        const match = await MatchModel.create(
          player1.user_id,
          player2.user_id,
          stake
        );

        console.log(`[HTTP Matchmaking] Instant match: ${player1.user_id} vs ${player2.user_id}, stake: ${stake}`);

        // TREASURY ARCHITECTURE: No escrow contract calls during match creation
        // Deposits are already recorded in deposits table via payment flow
        // Payouts will be handled via claim flow after match completion
        console.log(`[HTTP Matchmaking] Match created with treasury-based payment (no on-chain escrow)`);


        res.json({
          status: 'matched',
          matchId: match.match_id,
          opponent: {
            userId: player1.user_id,
            wallet: player1.wallet_address
          },
          stake: match.stake
        });
        return;
      }

      // No match found, add to queue
      const queueEntry = await MatchQueueModel.enqueue(userId, stake);

      console.log(`[HTTP Matchmaking] User ${userId} joined queue for stake ${stake}`);

      res.json({
        status: 'searching',
        queueId: queueEntry.queue_id,
        stake,
        expiresAt: queueEntry.expires_at
      });
    } catch (error) {
      console.error('[HTTP Matchmaking] Error in join:', error);
      res.status(500).json({ error: 'Failed to join matchmaking' });
    }
  }

  /**
   * GET /api/matchmaking/status/:userId
   * Poll matchmaking status
   */
  static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const authUserId = (req as any).userId;

      // Verify user is requesting their own status
      if (userId !== authUserId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Check queue
      const queueEntry = await MatchQueueModel.findByUserId(userId);
      
      if (!queueEntry) {
        res.json({ status: 'not_in_queue' });
        return;
      }

      if (queueEntry.status === QueueStatus.SEARCHING) {
        res.json({
          status: 'searching',
          queueId: queueEntry.queue_id,
          stake: queueEntry.stake,
          expiresAt: queueEntry.expires_at
        });
        return;
      }

      if (queueEntry.status === QueueStatus.MATCHED) {
        // Find the active match (pending or in_progress)
        const match = await MatchModel.findActiveMatch(userId);
        
        if (match) {
          const opponentId = match.player1_id === userId ? match.player2_id : match.player1_id;
          const opponent = await UserModel.findById(opponentId);
          
          console.log(`[HTTP Matchmaking] Returning matched status for user ${userId}, match ${match.match_id}`);
          
          res.json({
            status: 'matched',
            matchId: match.match_id,
            opponent: opponent ? {
              userId: opponent.user_id,
              wallet: opponent.wallet_address
            } : null,
            stake: match.stake
          });
          return;
        }
      }

      res.json({ status: queueEntry.status });
    } catch (error) {
      console.error('[HTTP Matchmaking] Error in getStatus:', error);
      res.status(500).json({ error: 'Failed to get matchmaking status' });
    }
  }

  /**
   * DELETE /api/matchmaking/cancel/:userId
   * Cancel matchmaking
   */
  static async cancel(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const authUserId = (req as any).userId;

      // Verify user is cancelling their own queue
      if (userId !== authUserId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      await MatchQueueModel.cancel(userId);

      console.log(`[HTTP Matchmaking] User ${userId} cancelled matchmaking`);

      res.json({ success: true });
    } catch (error) {
      console.error('[HTTP Matchmaking] Error in cancel:', error);
      res.status(500).json({ error: 'Failed to cancel matchmaking' });
    }
  }

  /**
   * Cleanup expired queue entries (called by cron/interval)
   */
  static async cleanupExpired(): Promise<number> {
    return await MatchQueueModel.cleanupExpired();
  }
}
