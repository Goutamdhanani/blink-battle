import { Request, Response } from 'express';
import { MatchModel } from '../models/Match';
import { TapEventModel } from '../models/TapEvent';
import { MatchStatus } from '../models/types';
import { generateRandomDelay } from '../services/randomness';
import { AntiCheatService } from '../services/antiCheat';
import { EscrowService } from '../services/escrow';
import { UserModel } from '../models/User';

/**
 * HTTP Polling Match Controller
 * Handles match flow via REST polling instead of WebSockets
 */
export class PollingMatchController {
  /**
   * POST /api/match/ready
   * Mark player as ready
   */
  static async ready(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { matchId } = req.body;

      const match = await MatchModel.findById(matchId);
      if (!match) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }

      // Verify user is in this match
      if (match.player1_id !== userId && match.player2_id !== userId) {
        res.status(403).json({ error: 'Not a participant in this match' });
        return;
      }

      // Mark player as ready (sets ready flag and ready_at timestamp)
      await MatchModel.setPlayerReady(matchId, userId);

      console.log(`[Polling Match] Player ${userId} marked ready in match ${matchId}`);

      // Check if both players are ready
      const bothReady = await MatchModel.areBothPlayersReady(matchId);

      if (bothReady) {
        // Both ready! Schedule green light time
        const minDelay = parseInt(process.env.SIGNAL_DELAY_MIN_MS || '2000', 10);
        const maxDelay = parseInt(process.env.SIGNAL_DELAY_MAX_MS || '5000', 10);
        const randomDelay = generateRandomDelay(minDelay, maxDelay);
        
        const greenLightTime = Date.now() + randomDelay + 3000; // 3s countdown + random delay
        
        await MatchModel.setGreenLightTime(matchId, greenLightTime);
        // Transition to COUNTDOWN status (not IN_PROGRESS)
        await MatchModel.updateStatus(matchId, MatchStatus.COUNTDOWN);

        console.log(`[Polling Match] 🚦 Both players ready! Match ${matchId} transitioning to COUNTDOWN. Green light scheduled for ${new Date(greenLightTime).toISOString()} (${randomDelay}ms delay after countdown)`);

        res.json({
          success: true,
          bothReady: true,
          greenLightTime,
          status: MatchStatus.COUNTDOWN
        });
        return;
      }

      res.json({
        success: true,
        bothReady: false
      });
    } catch (error) {
      console.error('[Polling Match] Error in ready:', error);
      res.status(500).json({ error: 'Failed to mark ready' });
    }
  }

  /**
   * GET /api/match/state/:matchId
   * Poll match state (state machine: searching → matched → ready_wait → countdown → go → resolved)
   */
  static async getState(req: Request, res: Response): Promise<void> {
    try {
      const { matchId } = req.params;
      const userId = (req as any).userId;

      const matchState = await MatchModel.getMatchState(matchId);
      if (!matchState) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }

      // Verify user is in this match
      if (matchState.player1_id !== userId && matchState.player2_id !== userId) {
        res.status(403).json({ error: 'Not a participant in this match' });
        return;
      }

      const now = Date.now();
      const isPlayer1 = matchState.player1_id === userId;
      const opponentId = isPlayer1 ? matchState.player2_id : matchState.player1_id;

      // Determine state for client
      let state = 'matched';
      let greenLightActive = false;
      let countdown = 0;

      if (matchState.status === MatchStatus.COMPLETED || matchState.status === MatchStatus.CANCELLED) {
        state = 'resolved';
      } else if (matchState.green_light_time) {
        const timeUntilGo = matchState.green_light_time - now;
        
        if (timeUntilGo > 3000) {
          // Still in countdown phase
          state = 'countdown';
          countdown = Math.ceil(timeUntilGo / 1000);
        } else if (timeUntilGo > 0) {
          // In the random delay phase before green light
          state = 'waiting_for_go';
        } else {
          // Green light is active!
          state = 'go';
          greenLightActive = true;
          
          // Transition status to IN_PROGRESS when go signal is active (only once)
          if (matchState.status === MatchStatus.COUNTDOWN) {
            await MatchModel.updateStatus(matchId, MatchStatus.IN_PROGRESS);
            console.log(`[Polling Match] 🟢 Green light active! Match ${matchId} transitioning to IN_PROGRESS (go signal). Green light time: ${new Date(matchState.green_light_time).toISOString()}`);
          }
        }
      } else if (matchState.player1_ready && matchState.player2_ready) {
        // Both ready but green light not set yet (edge case)
        state = 'ready_wait';
      } else {
        state = 'ready_wait';
      }

      // Get tap events
      const taps = await TapEventModel.findByMatchId(matchId);
      const playerTap = taps.find(t => t.user_id === userId);
      const opponentTap = taps.find(t => t.user_id === opponentId);

      res.json({
        matchId: matchState.match_id,
        state,
        status: matchState.status,
        stake: matchState.stake,
        player1Ready: matchState.player1_ready,
        player2Ready: matchState.player2_ready,
        greenLightTime: matchState.green_light_time,
        greenLightActive,
        countdown,
        playerTapped: !!playerTap,
        opponentTapped: !!opponentTap,
        winnerId: matchState.winner_id,
        player1ReactionMs: matchState.player1_reaction_ms,
        player2ReactionMs: matchState.player2_reaction_ms,
        completedAt: matchState.completed_at,
        opponent: {
          userId: opponentId,
          wallet: isPlayer1 ? matchState.player2_wallet : matchState.player1_wallet
        }
      });
    } catch (error) {
      console.error('[Polling Match] Error in getState:', error);
      res.status(500).json({ error: 'Failed to get match state' });
    }
  }

  /**
   * POST /api/match/tap
   * Record tap (server-time authoritative, client time optional for audit)
   */
  static async tap(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { matchId, clientTimestamp } = req.body;

      const match = await MatchModel.findById(matchId);
      if (!match) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }

      // Verify user is in this match
      if (match.player1_id !== userId && match.player2_id !== userId) {
        res.status(403).json({ error: 'Not a participant in this match' });
        return;
      }

      // Check if green light time is set
      if (!match.green_light_time) {
        res.status(400).json({ error: 'Green light not yet scheduled' });
        return;
      }

      // Check if player already tapped
      const existingTap = await TapEventModel.findByMatchAndUser(matchId, userId);
      if (existingTap) {
        res.status(400).json({ 
          error: 'Already tapped',
          tap: existingTap
        });
        return;
      }

      // Record tap with server timestamp (authoritative)
      const serverTimestamp = Date.now();
      const tap = await TapEventModel.create(
        matchId,
        userId,
        clientTimestamp || serverTimestamp,
        serverTimestamp,
        match.green_light_time
      );

      console.log(`[Polling Match] Tap recorded - User: ${userId}, Match: ${matchId}, Reaction: ${tap.reaction_ms}ms, Valid: ${tap.is_valid}, Disqualified: ${tap.disqualified}`);

      // Record reaction in match
      await MatchModel.recordReaction(matchId, userId, tap.reaction_ms);

      // Check if we can determine winner
      const allTaps = await TapEventModel.findByMatchId(matchId);
      const isPlayer1 = match.player1_id === userId;
      const opponentId = isPlayer1 ? match.player2_id : match.player1_id;
      const opponentTap = allTaps.find(t => t.user_id === opponentId);

      if (opponentTap) {
        // Both players have tapped, determine winner
        await PollingMatchController.determineWinner(match, allTaps);
      }

      res.json({
        success: true,
        tap: {
          reactionMs: tap.reaction_ms,
          isValid: tap.is_valid,
          disqualified: tap.disqualified,
          disqualificationReason: tap.disqualification_reason
        },
        waitingForOpponent: !opponentTap
      });
    } catch (error) {
      console.error('[Polling Match] Error in tap:', error);
      res.status(500).json({ error: 'Failed to record tap' });
    }
  }

  /**
   * GET /api/match/result/:matchId
   * Get final match result
   */
  static async getResult(req: Request, res: Response): Promise<void> {
    try {
      const { matchId } = req.params;
      const userId = (req as any).userId;

      const match = await MatchModel.findById(matchId);
      if (!match) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }

      // Verify user is in this match
      if (match.player1_id !== userId && match.player2_id !== userId) {
        res.status(403).json({ error: 'Not a participant in this match' });
        return;
      }

      if (match.status !== MatchStatus.COMPLETED) {
        res.status(400).json({ error: 'Match not yet completed' });
        return;
      }

      const taps = await TapEventModel.findByMatchId(matchId);
      const isPlayer1 = match.player1_id === userId;

      res.json({
        matchId: match.match_id,
        winnerId: match.winner_id,
        player1ReactionMs: match.player1_reaction_ms,
        player2ReactionMs: match.player2_reaction_ms,
        stake: match.stake,
        fee: match.fee,
        completedAt: match.completed_at,
        taps: taps.map(t => ({
          userId: t.user_id,
          reactionMs: t.reaction_ms,
          isValid: t.is_valid,
          disqualified: t.disqualified
        })),
        isWinner: match.winner_id === userId
      });
    } catch (error) {
      console.error('[Polling Match] Error in getResult:', error);
      res.status(500).json({ error: 'Failed to get match result' });
    }
  }

  /**
   * Determine winner based on tap events
   */
  private static async determineWinner(match: any, taps: any[]): Promise<void> {
    const player1Tap = taps.find(t => t.user_id === match.player1_id);
    const player2Tap = taps.find(t => t.user_id === match.player2_id);

    if (!player1Tap || !player2Tap) {
      console.log(`[Polling Match] Cannot determine winner - missing taps`);
      return;
    }

    let winnerId: string | undefined;
    let result: string;

    // Check disqualifications (early taps)
    if (player1Tap.disqualified && player2Tap.disqualified) {
      // Both disqualified - refund with fee
      result = 'both_disqualified';
      await EscrowService.refundWithFee(
        match.match_id,
        match.player1_wallet,
        match.player2_wallet,
        match.stake,
        3
      );
      await MatchModel.updateStatus(match.match_id, MatchStatus.CANCELLED);
    } else if (player1Tap.disqualified) {
      // Player 1 disqualified, player 2 wins
      winnerId = match.player2_id;
      result = 'player1_disqualified';
      await EscrowService.distributeWinnings(
        match.match_id,
        match.player2_wallet,
        match.stake
      );
    } else if (player2Tap.disqualified) {
      // Player 2 disqualified, player 1 wins
      winnerId = match.player1_id;
      result = 'player2_disqualified';
      await EscrowService.distributeWinnings(
        match.match_id,
        match.player1_wallet,
        match.stake
      );
    } else if (!player1Tap.is_valid && !player2Tap.is_valid) {
      // Both invalid (too slow) - refund
      result = 'both_timeout';
      await EscrowService.refundBothPlayers(
        match.match_id,
        match.player1_wallet,
        match.player2_wallet,
        match.stake
      );
      await MatchModel.updateStatus(match.match_id, MatchStatus.CANCELLED);
    } else if (!player1Tap.is_valid) {
      // Player 1 too slow
      winnerId = match.player2_id;
      result = 'player1_timeout';
      await EscrowService.distributeWinnings(
        match.match_id,
        match.player2_wallet,
        match.stake
      );
    } else if (!player2Tap.is_valid) {
      // Player 2 too slow
      winnerId = match.player1_id;
      result = 'player2_timeout';
      await EscrowService.distributeWinnings(
        match.match_id,
        match.player1_wallet,
        match.stake
      );
    } else {
      // Both valid, compare reaction times
      const diff = Math.abs(player1Tap.reaction_ms - player2Tap.reaction_ms);
      
      if (diff <= 1) {
        // Tie (within 1ms)
        result = 'tie';
        await EscrowService.splitPot(
          match.match_id,
          match.player1_wallet,
          match.player2_wallet,
          match.stake
        );
      } else {
        // Normal win
        winnerId = player1Tap.reaction_ms < player2Tap.reaction_ms 
          ? match.player1_id 
          : match.player2_id;
        result = 'normal_win';
        
        const winnerWallet = winnerId === match.player1_id 
          ? match.player1_wallet 
          : match.player2_wallet;
        
        await EscrowService.distributeWinnings(
          match.match_id,
          winnerWallet,
          match.stake
        );
      }
    }

    // Complete match
    await MatchModel.completeMatch({
      matchId: match.match_id,
      winnerId,
      player1ReactionMs: player1Tap.reaction_ms,
      player2ReactionMs: player2Tap.reaction_ms,
      reason: result,
    });

    // Update user stats
    if (winnerId) {
      const winnerReaction = winnerId === match.player1_id 
        ? player1Tap.reaction_ms 
        : player2Tap.reaction_ms;
      const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
      const loserReaction = winnerId === match.player1_id 
        ? player2Tap.reaction_ms 
        : player1Tap.reaction_ms;

      await UserModel.updateStats(winnerId, true, winnerReaction);
      await UserModel.updateStats(loserId, false, loserReaction);
    }

    console.log(`[Polling Match] Winner determined: ${winnerId || 'none'}, Result: ${result}`);
  }
}
