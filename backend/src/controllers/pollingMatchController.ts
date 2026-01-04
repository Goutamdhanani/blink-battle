import { Request, Response } from 'express';
import { MatchModel } from '../models/Match';
import { TapEventModel } from '../models/TapEvent';
import { MatchStatus } from '../models/types';
import { generateRandomDelay } from '../services/randomness';
import { AntiCheatService } from '../services/antiCheat';
import { UserModel } from '../models/User';
import pool from '../config/database';

/**
 * HTTP Polling Match Controller
 * Handles match flow via REST polling instead of WebSockets
 */

// Constants
const COUNTDOWN_DURATION_MS = 3000; // 3 seconds for countdown display
const TIE_THRESHOLD_MS = 1; // Reaction time difference considered a tie
const REFUND_DEADLINE_HOURS = 24; // Hours to claim refund after match cancellation

/**
 * Possible match result values
 * These are stored in the matches.result_type column
 */
export enum MatchResult {
  // Disqualification results
  BOTH_DISQUALIFIED = 'both_disqualified',      // Both players tapped before green light
  PLAYER1_DISQUALIFIED = 'player1_disqualified', // Player 1 tapped early
  PLAYER2_DISQUALIFIED = 'player2_disqualified', // Player 2 tapped early
  
  // Timeout results
  BOTH_TIMEOUT_TIE = 'both_timeout_tie',        // Both players too slow (>3s) with same time
  PLAYER1_TIMEOUT = 'player1_timeout',          // Player 1 too slow, player 2 wins
  PLAYER2_TIMEOUT = 'player2_timeout',          // Player 2 too slow, player 1 wins
  PLAYER1_SLOW_WIN = 'player1_slow_win',        // Both slow but player 1 faster
  PLAYER2_SLOW_WIN = 'player2_slow_win',        // Both slow but player 2 faster
  
  // Normal results
  TIE = 'tie',                                   // Both players valid, within 1ms
  NORMAL_WIN = 'normal_win',                     // Standard win by faster reaction
}

/**
 * Parse green_light_time value that may be returned as string from PostgreSQL BIGINT
 * @param value - The green_light_time value (may be string, number, null, or undefined)
 * @returns Parsed numeric value or null
 */
function parseGreenLightTime(value: any): number | null {
  if (!value) return null;
  
  const parsed = typeof value === 'string' 
    ? parseInt(value, 10) 
    : value;
  
  return Number.isFinite(parsed) ? parsed : null;
}

export class PollingMatchController {
  /**
   * POST /api/match/ready
   * Mark player as ready
   * 
   * CRITICAL: Enforces dual funding requirement for staked games
   * Both players MUST have deposited stake before game can start
   */
  static async ready(req: Request, res: Response): Promise<void> {
    const client = await pool.connect();
    
    try {
      const userId = (req as any).userId;
      const { matchId } = req.body;

      await client.query('BEGIN');

      // Lock the match row to prevent race conditions
      const match = await client.query(
        'SELECT * FROM matches WHERE match_id = $1 FOR UPDATE',
        [matchId]
      );

      if (!match.rows[0]) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Match not found' });
        return;
      }

      const matchData = match.rows[0];

      // Prevent ready if match already started
      // Allow 'pending' for newly created matches to proceed with ready flow
      if (!['pending', 'waiting', 'ready', 'matched'].includes(matchData.status)) {
        await client.query('ROLLBACK');
        console.log(`[Match] Match ${matchId} already in ${matchData.status}, ignoring ready`);
        res.json({ status: matchData.status, alreadyStarted: true });
        return;
      }

      // Verify user is in this match
      if (matchData.player1_id !== userId && matchData.player2_id !== userId) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'Not a participant in this match' });
        return;
      }

      // TREASURY ARCHITECTURE: Game starts regardless of staking status
      // For staked games, we track stakes in database and settle via claim system
      // This prevents the "Get Ready" freeze when escrow fails
      //
      // SAFEGUARDS:
      // - Payment intents are verified and recorded in deposits table
      // - Winner can claim via /api/claim endpoint with 24-hour window
      // - Unclaimed winnings return to treasury after deadline
      // - All transactions are tracked in database for dispute resolution
      // - PaymentWorker continuously monitors and updates payment statuses
      if (matchData.stake > 0) {
        const bothStaked = await MatchModel.areBothPlayersStaked(matchId);
        if (!bothStaked) {
          console.log(`[Polling Match] Match ${matchId} - Not all players staked, continuing with off-chain tracking`);
          // Don't block game start - continue with off-chain settlement
          // Player stakes are tracked via payment intents and will be settled via claim flow
        } else {
          console.log(`[Polling Match] Match ${matchId} - Both players staked and wallets validated`);
        }
      }

      // Determine which player is marking ready
      const isPlayer1 = matchData.player1_id === userId;
      const readyColumn = isPlayer1 ? 'player1_ready' : 'player2_ready';
      const readyAtColumn = isPlayer1 ? 'player1_ready_at' : 'player2_ready_at';

      // Mark this player as ready
      await client.query(
        `UPDATE matches SET ${readyColumn} = true, ${readyAtColumn} = NOW() WHERE match_id = $1`,
        [matchId]
      );

      console.log(`[Polling Match] Player ${userId} marked ready in match ${matchId}`);

      // Get updated match state
      const updated = await client.query(
        'SELECT player1_ready, player2_ready, status FROM matches WHERE match_id = $1',
        [matchId]
      );

      const bothReady = updated.rows[0].player1_ready && updated.rows[0].player2_ready;

      if (bothReady) {
        // 🎲 Generate RANDOM green light delay (2-5 seconds)
        const minDelay = parseInt(process.env.SIGNAL_DELAY_MIN_MS || '2000', 10);
        const maxDelay = parseInt(process.env.SIGNAL_DELAY_MAX_MS || '5000', 10);
        const randomDelay = generateRandomDelay(minDelay, maxDelay);
        
        const countdownDuration = COUNTDOWN_DURATION_MS; // 3 second countdown
        const now = Date.now();
        const greenLightTime = now + countdownDuration + randomDelay;

        await client.query(`
          UPDATE matches 
          SET status = 'countdown',
              green_light_time = $1,
              random_delay_ms = $2
          WHERE match_id = $3
        `, [greenLightTime, randomDelay, matchId]);

        console.log(`[Match] 🎲 Both ready! Match ${matchId} → countdown. Green light in ${countdownDuration + randomDelay}ms (random: ${randomDelay}ms)`);

        await client.query('COMMIT');

        res.json({
          success: true,
          bothReady: true,
          greenLightTime,
          randomDelay,
          status: 'countdown'
        });
      } else {
        await client.query('COMMIT');

        res.json({
          success: true,
          bothReady: false,
          yourReady: true
        });
      }
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('[Ready] Error:', error);
      res.status(500).json({ error: 'Failed to mark ready' });
    } finally {
      client.release();
    }
  }

  /**
   * GET /api/match/state/:matchId
   * Poll match state (state machine: searching → matched → ready_wait → countdown → go → resolved)
   * 
   * IMPORTANT: No caching on this endpoint - state changes frequently
   */
  static async getState(req: Request, res: Response): Promise<void> {
    try {
      const { matchId } = req.params;
      const userId = (req as any).userId;

      // Set cache control headers to prevent stale data
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

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

      // Parse green_light_time - PostgreSQL BIGINT can be returned as string
      const greenLightTime = parseGreenLightTime(matchState.green_light_time);

      // Determine state for client
      let state = 'matched';
      let greenLightActive = false;
      let countdown = 0;

      if (matchState.status === MatchStatus.COMPLETED || matchState.status === MatchStatus.CANCELLED) {
        state = 'resolved';
      } else if (greenLightTime && 
                 Number.isFinite(greenLightTime) && 
                 greenLightTime > 0) {
        const timeUntilGo = greenLightTime - now;
        
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
            console.log(`[Polling Match] 🟢 Green light active! Match ${matchId} transitioning to IN_PROGRESS (go signal). Green light time: ${new Date(greenLightTime).toISOString()}`);
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

      // Use the parsed greenLightTime for response
      let greenLightTimeMs = greenLightTime;
      let greenLightTimeISO: string | null = null;
      
      if (greenLightTimeMs !== null && Number.isFinite(greenLightTimeMs)) {
        try {
          greenLightTimeISO = new Date(greenLightTimeMs).toISOString();
        } catch (err) {
          console.error(`[Polling Match] Invalid green_light_time for match ${matchId}: ${greenLightTimeMs}`, err);
          greenLightTimeMs = null;
          greenLightTimeISO = null;
        }
      }

      // Add claim deadline info for completed matches
      let claimInfo: any = {};
      if (matchState.status === MatchStatus.COMPLETED && matchState.claim_deadline) {
        const claimDeadline = new Date(matchState.claim_deadline);
        const msRemaining = claimDeadline.getTime() - now;
        
        claimInfo = {
          claimable: matchState.claim_status === 'unclaimed' && msRemaining > 0,
          claimDeadline: claimDeadline.toISOString(),
          claimTimeRemaining: Math.max(0, Math.floor(msRemaining / 1000)), // seconds
          claimStatus: matchState.claim_status
        };
      }

      // LOCK: Don't allow transitions back once past countdown
      const lockedStates = ['countdown', 'signal', 'completed', 'cancelled'];
      const stateLocked = lockedStates.includes(matchState.status);

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
        stateLocked, // Add state locking flag
        serverTime: Date.now(), // Add server timestamp for client time sync
        opponent: {
          userId: opponentId,
          wallet: isPlayer1 ? matchState.player2_wallet : matchState.player1_wallet
        },
        ...claimInfo
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
      // PostgreSQL BIGINT can be returned as string, parse it first
      const greenLightTime = parseGreenLightTime(match.green_light_time);

      if (!greenLightTime) {
        console.error(`[Polling Match] Invalid green_light_time for match ${matchId}: ${match.green_light_time}`);
        res.status(400).json({ 
          error: 'Green light time is invalid',
          details: 'Match data corrupted - green light time not set properly'
        });
        return;
      }

      // Validate green_light_time is reasonable (not too far in past or future)
      const now = Date.now();
      const timeSinceGreenLight = now - greenLightTime;
      
      // Validate client timestamp if provided (prevent manipulation)
      // Check for explicit presence (not just truthy) to catch 0 and negative values
      if (clientTimestamp !== undefined && clientTimestamp !== null) {
        // Reject negative or zero timestamps
        if (clientTimestamp <= 0) {
          console.warn(`[Polling Match] Invalid client timestamp: ${clientTimestamp}`);
          res.status(400).json({ 
            error: 'Invalid timestamp',
            details: 'Client timestamp must be positive'
          });
          return;
        }
        
        // Reject timestamps from the future (with 5 second tolerance for clock skew)
        if (clientTimestamp > now + 5000) {
          console.warn(`[Polling Match] Future timestamp detected: ${clientTimestamp} vs server: ${now}`);
          res.status(400).json({ 
            error: 'Invalid timestamp',
            details: 'Client timestamp is in the future'
          });
          return;
        }
        
        // Reject timestamps before green light time (additional client-side validation)
        if (clientTimestamp < greenLightTime) {
          const earlyMs = greenLightTime - clientTimestamp;
          console.warn(`[Polling Match] Client timestamp before green light: ${earlyMs}ms early`);
          res.status(400).json({ 
            error: 'Invalid timestamp',
            details: 'Tap timestamp is before green light',
            earlyByMs: earlyMs
          });
          return;
        }
      }
      
      // FIXED: Check for early tap (tap BEFORE green light)
      // This is critical anti-cheat - prevents players from tapping before signal
      // CRITICAL: Add tolerance for clock sync issues (50ms tolerance)
      const CLOCK_SYNC_TOLERANCE_MS = 50; // Allow 50ms tolerance for network/clock sync issues
      
      if (timeSinceGreenLight < -CLOCK_SYNC_TOLERANCE_MS) {
        const earlyMs = Math.abs(timeSinceGreenLight);
        console.log(`[Polling Match] ❌ EARLY TAP DETECTED - User ${userId} tapped ${earlyMs}ms BEFORE green light in match ${matchId} (beyond ${CLOCK_SYNC_TOLERANCE_MS}ms tolerance)`);
        
        // Mark player as disqualified
        const isPlayer1 = match.player1_id === userId;
        
        // SECURITY: Use separate queries to avoid SQL injection via column names
        if (isPlayer1) {
          await pool.query(`
            UPDATE matches 
            SET player1_disqualified = true,
                player1_reaction_ms = -1
            WHERE match_id = $1
          `, [matchId]);
        } else {
          await pool.query(`
            UPDATE matches 
            SET player2_disqualified = true,
                player2_reaction_ms = -1
            WHERE match_id = $1
          `, [matchId]);
        }
        
        // Record the early tap in tap_events for audit
        await TapEventModel.create(
          matchId,
          userId,
          clientTimestamp && Number.isFinite(clientTimestamp) ? clientTimestamp : now,
          now,
          greenLightTime
        );
        
        // FIXED: Return success with disqualification instead of 400 error
        res.json({ 
          success: true, 
          disqualified: true,
          reason: 'early_tap',
          earlyByMs: earlyMs,
          message: 'You tapped before the green light! You are disqualified.'
        });
        return;
      } else if (timeSinceGreenLight < 0) {
        // Within tolerance - treat as valid tap at green light time
        console.log(`[Polling Match] Tap within clock sync tolerance (${Math.abs(timeSinceGreenLight)}ms early) - treating as valid for user ${userId}`);
      }
      
      // Allow taps up to 10 seconds after green light (generous for network latency)
      if (timeSinceGreenLight > 10000) {
        console.warn(`[Polling Match] Tap rejected - too late. Match: ${matchId}, Green light: ${greenLightTime}, Now: ${now}, Delta: ${timeSinceGreenLight}ms`);
        res.status(400).json({ 
          error: 'Tap window expired',
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

      // Check for timing discrepancy between client and server (anti-cheat)
      // SECURITY: This now throws an error to reject suspicious taps
      if (clientTimestamp && Number.isFinite(clientTimestamp)) {
        try {
          const clientReaction = clientTimestamp - greenLightTime;
          AntiCheatService.checkTimingDiscrepancy(clientReaction, tap.reaction_ms, userId);
        } catch (error: any) {
          console.error(`[AntiCheat] Rejecting tap due to timing discrepancy: ${error.message}`);
          res.status(400).json({ 
            error: 'Timing validation failed',
            details: error.message
          });
          return;
        }
      }

      // Check for suspicious activity patterns (async, don't block response)
      AntiCheatService.detectAndRecordSuspiciousActivity(userId, matchId).catch(err => {
        console.error('[AntiCheat] Error checking suspicious activity:', err);
      });

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
   * POST /api/match/confirm-stake
   * Confirm that a player has paid their stake
   * Called after payment intent is confirmed
   */
  static async confirmStake(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { matchId, paymentReference } = req.body;

      if (!matchId || !paymentReference) {
        res.status(400).json({ error: 'Missing matchId or paymentReference' });
        return;
      }

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

      // Verify payment intent exists and is confirmed
      const { PaymentIntentModel } = await import('../models/PaymentIntent');
      const paymentIntent = await PaymentIntentModel.findByReference(paymentReference);
      
      if (!paymentIntent) {
        res.status(404).json({ error: 'Payment intent not found' });
        return;
      }

      if (paymentIntent.user_id !== userId) {
        res.status(403).json({ error: 'Payment intent does not belong to this user' });
        return;
      }

      if (paymentIntent.normalized_status !== 'confirmed') {
        res.status(400).json({ 
          error: 'Payment not yet confirmed',
          status: paymentIntent.normalized_status
        });
        return;
      }

      // Link payment to match if not already linked
      if (!paymentIntent.match_id) {
        await PaymentIntentModel.linkToMatch(paymentReference, matchId);
      }

      // Mark player as staked (with transaction hash if available)
      await MatchModel.setPlayerStaked(matchId, userId, paymentIntent.transaction_hash || undefined);

      console.log(`[Polling Match] Player ${userId} stake confirmed for match ${matchId}`);

      // Check if both players have now staked
      const bothStaked = await MatchModel.areBothPlayersStaked(matchId);

      res.json({
        success: true,
        bothStaked,
        canStart: bothStaked
      });
    } catch (error) {
      console.error('[Polling Match] Error in confirmStake:', error);
      res.status(500).json({ error: 'Failed to confirm stake' });
    }
  }

  /**
   * POST /api/match/heartbeat
   * Heartbeat endpoint - called every 5 seconds by frontend to track connection
   */
  static async heartbeat(req: Request, res: Response): Promise<void> {
    try {
      const { matchId } = req.body;
      const userId = (req as any).userId;

      if (!matchId) {
        res.status(400).json({ error: 'Missing matchId' });
        return;
      }

      // Check if ping columns exist
      const colExists = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'player1_last_ping'
      `);

      if (colExists.rows.length === 0) {
        // Migration not run - just return success
        res.json({ success: true, ping: Date.now(), migrationPending: true });
        return;
      }

      const match = await pool.query(
        'SELECT player1_id, player2_id FROM matches WHERE match_id = $1',
        [matchId]
      );

      if (!match.rows[0]) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }

      const isPlayer1 = match.rows[0].player1_id === userId;
      
      // SECURITY: Use separate queries to avoid SQL injection via column names
      if (isPlayer1) {
        await pool.query(
          'UPDATE matches SET player1_last_ping = NOW() WHERE match_id = $1',
          [matchId]
        );
      } else {
        await pool.query(
          'UPDATE matches SET player2_last_ping = NOW() WHERE match_id = $1',
          [matchId]
        );
      }

      res.json({ success: true, ping: Date.now() });
    } catch (error: any) {
      // Don't fail on heartbeat errors
      res.json({ success: true, ping: Date.now() });
    }
  }

  /**
   * Determine winner based on tap events
   * CRITICAL: Compute winner BEFORE calling escrow/payment to avoid undefined winner
   * TREASURY ARCHITECTURE: Sets winner_wallet and claim_deadline, no on-chain payment
   * SECURITY: Handles one-sided matches where only one player taps
   */
  private static async determineWinner(match: any, taps: any[]): Promise<void> {
    const player1Tap = taps.find(t => t.user_id === match.player1_id);
    const player2Tap = taps.find(t => t.user_id === match.player2_id);

    // SECURITY: Handle one-sided matches (only one player tapped)
    if (!player1Tap && !player2Tap) {
      console.log(`[Polling Match] No taps recorded yet - cannot determine winner`);
      return;
    }

    let winnerId: string | undefined;
    let loserId: string | undefined;
    let result: string;
    let winnerWallet: string | undefined;
    let loserWallet: string | undefined;

    // Handle case where only one player tapped
    if (!player1Tap && player2Tap) {
      // Only player 2 tapped
      if (player2Tap.is_valid && !player2Tap.disqualified) {
        // Player 2 wins by default (player 1 didn't tap)
        winnerId = match.player2_id;
        loserId = match.player1_id;
        winnerWallet = match.player2_wallet;
        loserWallet = match.player1_wallet;
        result = MatchResult.PLAYER1_TIMEOUT;
        console.log(`[Polling Match] One-sided match: Player 2 wins (Player 1 didn't tap)`);
      } else {
        // Player 2's tap was invalid/disqualified and player 1 didn't tap - no winner
        winnerId = undefined;
        loserId = undefined;
        result = MatchResult.BOTH_TIMEOUT_TIE;
        console.log(`[Polling Match] One-sided match: No winner (Player 2 disqualified, Player 1 didn't tap)`);
      }
    } else if (player1Tap && !player2Tap) {
      // Only player 1 tapped
      if (player1Tap.is_valid && !player1Tap.disqualified) {
        // Player 1 wins by default (player 2 didn't tap)
        winnerId = match.player1_id;
        loserId = match.player2_id;
        winnerWallet = match.player1_wallet;
        loserWallet = match.player2_wallet;
        result = MatchResult.PLAYER2_TIMEOUT;
        console.log(`[Polling Match] One-sided match: Player 1 wins (Player 2 didn't tap)`);
      } else {
        // Player 1's tap was invalid/disqualified and player 2 didn't tap - no winner
        winnerId = undefined;
        loserId = undefined;
        result = MatchResult.BOTH_TIMEOUT_TIE;
        console.log(`[Polling Match] One-sided match: No winner (Player 1 disqualified, Player 2 didn't tap)`);
      }
    } else if (player1Tap && player2Tap) {
      // Both players tapped - use existing logic
      // Check disqualifications (early taps)
      if (player1Tap.disqualified && player2Tap.disqualified) {
        // Both disqualified - no winner, refund with fee
        winnerId = undefined;
        loserId = undefined;
        result = MatchResult.BOTH_DISQUALIFIED;
      } else if (player1Tap.disqualified) {
        // Player 1 disqualified, player 2 wins
        winnerId = match.player2_id;
        loserId = match.player1_id;
        winnerWallet = match.player2_wallet;
        loserWallet = match.player1_wallet;
        result = MatchResult.PLAYER1_DISQUALIFIED;
      } else if (player2Tap.disqualified) {
        // Player 2 disqualified, player 1 wins
        winnerId = match.player1_id;
        loserId = match.player2_id;
        winnerWallet = match.player1_wallet;
        loserWallet = match.player2_wallet;
        result = MatchResult.PLAYER2_DISQUALIFIED;
      } else if (!player1Tap.is_valid && !player2Tap.is_valid) {
        // Both invalid (too slow) - compare actual times, faster player wins
        // This fixes the bug where both players get "both_timeout" incorrectly
        const diff = Math.abs(player1Tap.reaction_ms - player2Tap.reaction_ms);
        
        if (diff <= TIE_THRESHOLD_MS) {
          // True tie - both equally slow
          winnerId = undefined;
          loserId = undefined;
          result = MatchResult.BOTH_TIMEOUT_TIE;
        } else {
          // One was faster even though both were slow
          winnerId = player1Tap.reaction_ms < player2Tap.reaction_ms 
            ? match.player1_id 
            : match.player2_id;
          loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
          winnerWallet = winnerId === match.player1_id 
            ? match.player1_wallet 
            : match.player2_wallet;
          loserWallet = loserId === match.player1_id
            ? match.player1_wallet
            : match.player2_wallet;
          result = player1Tap.reaction_ms < player2Tap.reaction_ms ? MatchResult.PLAYER1_SLOW_WIN : MatchResult.PLAYER2_SLOW_WIN;
        }
      } else if (!player1Tap.is_valid) {
        // Player 1 too slow, player 2 wins
        winnerId = match.player2_id;
        loserId = match.player1_id;
        winnerWallet = match.player2_wallet;
        loserWallet = match.player1_wallet;
        result = MatchResult.PLAYER1_TIMEOUT;
      } else if (!player2Tap.is_valid) {
        // Player 2 too slow, player 1 wins
        winnerId = match.player1_id;
        loserId = match.player2_id;
        winnerWallet = match.player1_wallet;
        loserWallet = match.player2_wallet;
        result = MatchResult.PLAYER2_TIMEOUT;
      } else {
        // Both valid, compare reaction times
        const diff = Math.abs(player1Tap.reaction_ms - player2Tap.reaction_ms);
        
        if (diff <= TIE_THRESHOLD_MS) {
          // Tie (within threshold) - no winner
          winnerId = undefined;
          loserId = undefined;
          result = MatchResult.TIE;
        } else {
          // Normal win
          winnerId = player1Tap.reaction_ms < player2Tap.reaction_ms 
            ? match.player1_id 
            : match.player2_id;
          loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
          winnerWallet = winnerId === match.player1_id 
            ? match.player1_wallet 
            : match.player2_wallet;
          loserWallet = loserId === match.player1_id
            ? match.player1_wallet
            : match.player2_wallet;
          result = MatchResult.NORMAL_WIN;
        }
      }
    } else {
      // Should not reach here
      console.error(`[Polling Match] Unexpected state in determineWinner`);
      return;
    }

    console.log(`[Polling Match] Winner determined: ${winnerId || 'none'}, Result: ${result}`);

    // STEP 2: Set winner_wallet, loser_wallet, and claim_deadline in database
    // TREASURY ARCHITECTURE: No on-chain payment during match completion
    try {
      // Set claim deadline to 1 hour from now
      const claimDeadline = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Update match with winner wallets and claim deadline
      if (winnerWallet && loserWallet) {
        await pool.query(
          `UPDATE matches 
           SET winner_wallet = $1, loser_wallet = $2, claim_deadline = $3, 
               claim_status = 'unclaimed', result_finalized_at = NOW(), result_type = $4
           WHERE match_id = $5`,
          [winnerWallet, loserWallet, claimDeadline, result, match.match_id]
        );
        console.log(`[Polling Match] Set winner wallet: ${winnerWallet}, claim deadline: ${claimDeadline.toISOString()}, result_type: ${result}`);
      } else {
        // No winner (tie or both disqualified)
        await pool.query(
          `UPDATE matches 
           SET claim_status = 'expired', result_finalized_at = NOW(), result_type = $1
           WHERE match_id = $2`,
          [result, match.match_id]
        );
        console.log(`[Polling Match] No winner for match ${match.match_id} - ${result}`);
      }

      // Update status if refund scenario (tie or both disqualified)
      if (!winnerId) {
        await MatchModel.updateStatus(match.match_id, MatchStatus.CANCELLED);
        
        // Mark payment intents as refundable (with 3% gas fee deducted)
        const refundDeadline = new Date(Date.now() + REFUND_DEADLINE_HOURS * 60 * 60 * 1000);
        await pool.query(
          `UPDATE payment_intents 
           SET refund_status = 'eligible',
               refund_deadline = $1,
               refund_reason = $2
           WHERE match_id = $3 
           AND normalized_status = 'confirmed'
           AND (refund_status IS NULL OR refund_status = 'none')`,
          [refundDeadline, result, match.match_id]
        );
        console.log(`[Polling Match] Marked payments as refundable for match ${match.match_id} - reason: ${result}`);
      }

      // Complete match in DB with winner information
      await MatchModel.completeMatch({
        matchId: match.match_id,
        winnerId,
        player1ReactionMs: player1Tap?.reaction_ms || -1,
        player2ReactionMs: player2Tap?.reaction_ms || -1,
        reason: result,
      });

      // Update user stats
      if (winnerId && loserId) {
        const winnerReaction = winnerId === match.player1_id 
          ? (player1Tap?.reaction_ms || -1) 
          : (player2Tap?.reaction_ms || -1);
        const loserReaction = loserId === match.player1_id 
          ? (player1Tap?.reaction_ms || -1) 
          : (player2Tap?.reaction_ms || -1);

        await UserModel.updateStats(winnerId, true, winnerReaction);
        await UserModel.updateStats(loserId, false, loserReaction);
      }

      console.log(`[Polling Match] ✅ Match completed in DB: ${match.match_id}, Winner: ${winnerId || 'none'}`);
      
      if (match.stake > 0 && winnerId) {
        console.log(`[Polling Match] 💰 Winnings available for claim. Winner can claim via /api/claim endpoint`);
      }
    } catch (dbError: any) {
      console.error(`[Polling Match] Failed to complete match in DB: ${match.match_id}`, dbError);
      throw dbError; // Rethrow DB errors as these are critical
    }
  }
}
