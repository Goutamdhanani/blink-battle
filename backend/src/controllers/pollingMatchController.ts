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

// Constants
const COUNTDOWN_DURATION_MS = 3000; // 3 seconds for countdown display

export class PollingMatchController {
  /**
   * POST /api/match/ready
   * Mark player as ready
   * 
   * CRITICAL: Enforces dual funding requirement for staked games
   * Both players MUST have deposited stake before game can start
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

      // CRITICAL: Enforce dual funding for staked games
      // Game MUST NOT start until BOTH players have deposited stake
      if (match.stake > 0) {
        const bothStaked = await MatchModel.areBothPlayersStaked(matchId);
        if (!bothStaked) {
          res.status(400).json({ 
            error: 'Both players must deposit stake before game can start',
            requiresStake: true,
            player1Staked: match.player1_staked || false,
            player2Staked: match.player2_staked || false,
          });
          return;
        }

        // Validate wallets are stored
        if (!match.player1_wallet || !match.player2_wallet) {
          res.status(500).json({ 
            error: 'Player wallets not found - cannot start match',
          });
          return;
        }

        console.log(`[Polling Match] Match ${matchId} - Both players staked and wallets validated`);
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
        
        const greenLightTime = Date.now() + randomDelay + COUNTDOWN_DURATION_MS;
        
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
        
        // The greenLightTime includes both countdown (3s) and random delay (2-5s)
        // Total time: 5-8 seconds
        // We want to show:
        // - Countdown "3, 2, 1" during the LAST 3 seconds before green light
        // - "Wait for it..." during any time before the last 3 seconds
        
        if (timeUntilGo <= 0) {
          // Green light is active!
          state = 'go';
          greenLightActive = true;
          
          // Transition status to IN_PROGRESS when go signal is active (only once)
          if (matchState.status === MatchStatus.COUNTDOWN) {
            await MatchModel.updateStatus(matchId, MatchStatus.IN_PROGRESS);
            console.log(`[Polling Match] 🟢 Green light active! Match ${matchId} transitioning to IN_PROGRESS (go signal). Green light time: ${new Date(matchState.green_light_time).toISOString()}`);
          }
        } else if (timeUntilGo <= COUNTDOWN_DURATION_MS) {
          // Last 3 seconds - show countdown: 3, 2, 1
          state = 'countdown';
          countdown = Math.ceil(timeUntilGo / 1000); // Will be 3, 2, or 1
        } else {
          // More than 3 seconds remaining - in the random delay phase
          state = 'waiting_for_go';
          countdown = 0;
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

      // Safe serialization of green_light_time: return raw ms and ISO string only if numeric
      let greenLightTimeMs = matchState.green_light_time ?? null;
      let greenLightTimeISO: string | null = null;
      
      if (typeof greenLightTimeMs === 'number' && !isNaN(greenLightTimeMs) && Number.isFinite(greenLightTimeMs)) {
        try {
          greenLightTimeISO = new Date(greenLightTimeMs).toISOString();
        } catch (err) {
          console.error(`[Polling Match] Invalid green_light_time for match ${matchId}: ${greenLightTimeMs}`, err);
          greenLightTimeMs = null;
          greenLightTimeISO = null;
        }
      } else if (greenLightTimeMs !== null) {
        console.error(`[Polling Match] green_light_time is not a valid number for match ${matchId}: ${greenLightTimeMs}`);
        greenLightTimeMs = null;
      }

      res.json({
        matchId: matchState.match_id,
        state,
        status: matchState.status,
        stake: matchState.stake,
        player1Ready: matchState.player1_ready,
        player2Ready: matchState.player2_ready,
        greenLightTime: greenLightTimeMs,
        greenLightTimeISO,
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
    } catch (error: any) {
      console.error('[Polling Match] Error in getState:', error);
      // Return more detailed error information for debugging
      const errorMessage = error.message || 'Failed to get match state';
      const errorDetails = {
        error: errorMessage,
        matchId: req.params.matchId,
        timestamp: new Date().toISOString()
      };
      console.error('[Polling Match] Error details:', JSON.stringify(errorDetails));
      res.status(500).json(errorDetails);
    }
  }

  /**
   * POST /api/match/tap
   * Record tap (server-time authoritative, client time optional for audit)
   * 
   * CRITICAL: Validates timestamps to prevent "Invalid time value" errors
   * Uses first-write-wins semantics via UNIQUE constraint
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

      // CRITICAL: Validate green_light_time to prevent "Invalid time value"
      if (!match.green_light_time || !Number.isFinite(match.green_light_time)) {
        console.error(`[Polling Match] Invalid green_light_time for match ${matchId}: ${match.green_light_time}`);
        res.status(400).json({ 
          error: 'Green light time is invalid',
          details: 'Match data corrupted - green light time not set properly'
        });
        return;
      }

      // Validate green_light_time is reasonable (not too far in past or future)
      const greenLightTime = match.green_light_time;
      const now = Date.now();
      const timeSinceGreenLight = now - greenLightTime;
      
      // Allow taps up to 10 seconds after green light (generous for network latency)
      // Reject taps more than 1 minute before green light (clock skew/invalid state)
      if (timeSinceGreenLight < -60000 || timeSinceGreenLight > 10000) {
        console.warn(`[Polling Match] Tap rejected - green light time out of range. Match: ${matchId}, Green light: ${greenLightTime}, Now: ${now}, Delta: ${timeSinceGreenLight}ms`);
        res.status(400).json({ 
          error: 'Tap window expired or not yet active',
          details: {
            greenLightTime,
            serverTime: now,
            deltaMs: timeSinceGreenLight
          }
        });
        return;
      }

      // Record tap with server timestamp (authoritative)
      // This will return existing tap if duplicate (ON CONFLICT DO NOTHING)
      const serverTimestamp = Date.now();
      const validatedClientTimestamp = clientTimestamp && Number.isFinite(clientTimestamp) 
        ? clientTimestamp 
        : serverTimestamp;

      const tap = await TapEventModel.create(
        matchId,
        userId,
        validatedClientTimestamp,
        serverTimestamp,
        greenLightTime
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
   * GET /api/match/stake-status/:matchId
   * Get stake status for both players in a match
   */
  static async getStakeStatus(req: Request, res: Response): Promise<void> {
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

      // Return stake status for both players
      const player1Staked = match.player1_staked || false;
      const player2Staked = match.player2_staked || false;
      const canStart = player1Staked && player2Staked;

      res.json({
        player1Staked,
        player2Staked,
        canStart,
        stake: match.stake
      });
    } catch (error) {
      console.error('[Polling Match] Error in getStakeStatus:', error);
      res.status(500).json({ error: 'Failed to get stake status' });
    }
  }

  /**
   * Determine winner based on tap events
   * CRITICAL: Compute winner BEFORE calling escrow/payment to avoid undefined winner
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
    let paymentAction: 'refund' | 'distribute' | 'split' | 'none' = 'none';
    let winnerWallet: string | undefined;

    // STEP 1: Determine winner and result FIRST (before any payment calls)
    // Check disqualifications (early taps)
    if (player1Tap.disqualified && player2Tap.disqualified) {
      // Both disqualified - refund with fee
      winnerId = undefined;
      result = 'both_disqualified';
      paymentAction = 'refund';
    } else if (player1Tap.disqualified) {
      // Player 1 disqualified, player 2 wins
      winnerId = match.player2_id;
      winnerWallet = match.player2_wallet;
      result = 'player1_disqualified';
      paymentAction = 'distribute';
    } else if (player2Tap.disqualified) {
      // Player 2 disqualified, player 1 wins
      winnerId = match.player1_id;
      winnerWallet = match.player1_wallet;
      result = 'player2_disqualified';
      paymentAction = 'distribute';
    } else if (!player1Tap.is_valid && !player2Tap.is_valid) {
      // Both invalid (too slow) - refund
      winnerId = undefined;
      result = 'both_timeout';
      paymentAction = 'refund';
    } else if (!player1Tap.is_valid) {
      // Player 1 too slow, player 2 wins
      winnerId = match.player2_id;
      winnerWallet = match.player2_wallet;
      result = 'player1_timeout';
      paymentAction = 'distribute';
    } else if (!player2Tap.is_valid) {
      // Player 2 too slow, player 1 wins
      winnerId = match.player1_id;
      winnerWallet = match.player1_wallet;
      result = 'player2_timeout';
      paymentAction = 'distribute';
    } else {
      // Both valid, compare reaction times
      const diff = Math.abs(player1Tap.reaction_ms - player2Tap.reaction_ms);
      
      if (diff <= 1) {
        // Tie (within 1ms) - split pot
        winnerId = undefined;
        result = 'tie';
        paymentAction = 'split';
      } else {
        // Normal win
        winnerId = player1Tap.reaction_ms < player2Tap.reaction_ms 
          ? match.player1_id 
          : match.player2_id;
        winnerWallet = winnerId === match.player1_id 
          ? match.player1_wallet 
          : match.player2_wallet;
        result = 'normal_win';
        paymentAction = 'distribute';
      }
    }

    console.log(`[Polling Match] Winner determined: ${winnerId || 'none'}, Result: ${result}, Payment: ${paymentAction}`);

    // STEP 2: Execute payment action with proper guards
    let paymentSuccess = false;
    let paymentError: string | null = null;

    try {
      if (match.stake > 0) {
        // Only attempt payment if stake > 0
        switch (paymentAction) {
          case 'refund':
            if (match.player1_wallet && match.player2_wallet) {
              const refundResult = await EscrowService.refundWithFee(
                match.match_id,
                match.player1_wallet,
                match.player2_wallet,
                match.stake,
                3
              );
              paymentSuccess = refundResult.success;
              paymentError = refundResult.error || null;
              if (!paymentSuccess) {
                console.error(`[Polling Match] Refund failed for match ${match.match_id}: ${paymentError}`);
              }
            } else {
              console.error(`[Polling Match] Cannot refund - missing wallet addresses`);
              paymentError = 'Missing wallet addresses for refund';
            }
            break;
            
          case 'distribute':
            // Validate winner wallet and ID before attempting distribution
            if (!winnerWallet || typeof winnerWallet !== 'string' || winnerWallet.trim() === '') {
              console.error(`[Polling Match] Cannot distribute - winner wallet is invalid: wallet="${winnerWallet}", winnerId="${winnerId}"`);
              paymentError = 'Invalid winner wallet address';
              paymentSuccess = false;
            } else if (!winnerId || typeof winnerId !== 'string') {
              console.error(`[Polling Match] Cannot distribute - winner ID is invalid: winnerId="${winnerId}"`);
              paymentError = 'Invalid winner ID';
              paymentSuccess = false;
            } else {
              const distributeResult = await EscrowService.distributeWinnings(
                match.match_id,
                winnerWallet,
                match.stake
              );
              paymentSuccess = distributeResult.success;
              paymentError = distributeResult.error || null;
              if (!paymentSuccess) {
                console.error(`[Polling Match] Distribution failed for match ${match.match_id}: ${paymentError}`);
              }
            }
            break;
            
          case 'split':
            if (match.player1_wallet && match.player2_wallet) {
              const splitResult = await EscrowService.splitPot(
                match.match_id,
                match.player1_wallet,
                match.player2_wallet,
                match.stake
              );
              paymentSuccess = splitResult.success;
              paymentError = splitResult.error || null;
              if (!paymentSuccess) {
                console.error(`[Polling Match] Split pot failed for match ${match.match_id}: ${paymentError}`);
              }
            } else {
              console.error(`[Polling Match] Cannot split pot - missing wallet addresses`);
              paymentError = 'Missing wallet addresses for split';
            }
            break;
            
          default:
            // No payment needed (free match or other reason)
            paymentSuccess = true;
            console.log(`[Polling Match] No payment action required for match ${match.match_id}`);
        }
      } else {
        // Free match, no payment needed
        paymentSuccess = true;
        console.log(`[Polling Match] Free match ${match.match_id}, no payment required`);
      }
    } catch (error: any) {
      console.error(`[Polling Match] Payment error for match ${match.match_id}:`, error);
      paymentError = error.message || 'Payment processing failed';
      paymentSuccess = false;
    }

    // STEP 3: Complete match in DB regardless of payment success (avoid black screen)
    try {
      // Update status if refund scenario
      if (paymentAction === 'refund') {
        await MatchModel.updateStatus(match.match_id, MatchStatus.CANCELLED);
      }

      // Complete match with winner information
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

      console.log(`[Polling Match] Match completed in DB: ${match.match_id}, Winner: ${winnerId || 'none'}, Payment: ${paymentSuccess ? 'success' : 'failed'}`);
      
      if (!paymentSuccess && paymentError) {
        console.error(`[Polling Match] ⚠️ Match completed but payment failed: ${match.match_id}. Error: ${paymentError}. Manual review may be required.`);
      }
    } catch (dbError: any) {
      console.error(`[Polling Match] Failed to complete match in DB: ${match.match_id}`, dbError);
      throw dbError; // Rethrow DB errors as these are critical
    }
  }
}
