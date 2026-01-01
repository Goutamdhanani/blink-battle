import { Server, Socket } from 'socket.io';
import { MatchModel } from '../models/Match';
import { UserModel } from '../models/User';
import { PaymentModel, PaymentStatus } from '../models/Payment';
import { MatchmakingService } from '../services/matchmaking';
import { EscrowService } from '../services/escrow';
import { AntiCheatService } from '../services/antiCheat';
import { generateRandomDelay } from '../services/randomness';
import { MatchStatus, MatchmakingRequest, MatchEventType, EscrowStatus } from '../models/types';
import { MatchState, MatchStateMachine, MatchStateGuards } from '../services/matchStateMachine';

interface PlayerData {
  userId: string;
  socketId: string;
  walletAddress: string;
}

interface ActiveMatch {
  matchId: string;
  player1: PlayerData;
  player2: PlayerData;
  stake: number;

  // State machine
  stateMachine: MatchStateMachine;
  escrowStatus: EscrowStatus;

  // ESCROW TRACKING - Option B: Full Escrow
  player1Staked: boolean;
  player2Staked: boolean;
  escrowCreated: boolean;
  escrowVerified: boolean;
  waitingForStakes: boolean;

  // readiness
  player1Ready: boolean;
  player2Ready: boolean;

  // game state
  hasStarted: boolean;
  signalTimestamp?: number;

  // gameplay
  player1Reaction?: number;
  player2Reaction?: number;
  player1TapTime?: number;
  player2TapTime?: number;

  // RECONNECTION SUPPORT
  disconnectedUsers?: Set<string>;
  disconnectTimestamps?: Map<string, number>;
  reconnectAttempts?: Map<string, number>;
  cancelTimeout?: NodeJS.Timeout;
  matchStartTimeout?: NodeJS.Timeout;
}

export class GameSocketHandler {
  private io: Server;
  private activeMatches: Map<string, ActiveMatch> = new Map();
  private playerToMatch: Map<string, string> = new Map(); // socketId -> matchId
  private userToMatch: Map<string, string> = new Map(); // userId -> matchId
  
  // Track socket connection times for early disconnect guard
  private socketConnectionTimes: Map<string, number> = new Map(); // socketId -> connection timestamp

  private readonly RECONNECT_GRACE_PERIOD_MS = 30000; // 30 seconds
  private readonly RECONNECT_DEBOUNCE_MS = 1000; // Minimum time between reconnects
  private readonly MAX_RECONNECT_ATTEMPTS = 5; // Max reconnect attempts before force disconnect
  private readonly MATCH_START_TIMEOUT_MS = parseInt(process.env.MATCH_START_TIMEOUT_MS || '60000', 10);
  private readonly STAKE_DEPOSIT_TIMEOUT_MS = parseInt(process.env.STAKE_DEPOSIT_TIMEOUT_MS || '120000', 10); // 2 minutes for deposits
  private readonly MIN_STABLE_CONNECTION_MS = 5000; // Guard against early disconnects (e.g., React remounts)

  constructor(io: Server) {
    this.io = io;
    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      // Track connection time for early disconnect guard
      this.socketConnectionTimes.set(socket.id, Date.now());

      socket.on('join_matchmaking', (data) => this.handleJoinMatchmaking(socket, data));
      socket.on('cancel_matchmaking', (data) => this.handleCancelMatchmaking(socket, data));
      socket.on('payment_confirmed', (data) => this.handlePaymentConfirmed(socket, data));
      socket.on('player_ready', (data) => this.handlePlayerReady(socket, data));
      socket.on('player_tap', (data) => this.handlePlayerTap(socket, data));
      socket.on('rejoin_match', (data) => this.handleRejoinMatch(socket, data));
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  private async handleJoinMatchmaking(
    socket: Socket,
    data: { userId: string; stake: number; walletAddress: string }
  ) {
    try {
      const { userId, stake, walletAddress } = data;

      console.log(`[Matchmaking] Player ${userId} joining queue for stake ${stake} WLD`);

      // Check if user already has an active match - first check in-memory
      const existingMatchId = this.userToMatch.get(userId);
      if (existingMatchId) {
        const existingMatch = this.activeMatches.get(existingMatchId);
        if (existingMatch) {
          console.log(`[Matchmaking] Player ${userId} already in match ${existingMatchId}, reconnecting...`);
          await this.reconnectPlayerToMatch(socket, userId, existingMatch);
          return;
        }
      }

      // Also check Redis for active match (in case server restarted)
      const activeMatchId = await MatchmakingService.getPlayerActiveMatch(userId);
      if (activeMatchId) {
        console.warn(`[Matchmaking] Player ${userId} has active match ${activeMatchId} in Redis but not in memory`);
        socket.emit('error', { 
          message: 'You have an active match. Please refresh the page or contact support.',
          code: 'ACTIVE_MATCH_EXISTS'
        });
        return;
      }

      // Check if there's an existing socket for this user (enforce single socket per player)
      const existingSocket = await MatchmakingService.registerPlayerSocket(userId, socket.id);
      if (existingSocket && existingSocket !== socket.id) {
        console.log(`[Matchmaking] Replaced stale socket ${existingSocket} with ${socket.id} for user ${userId}`);
        // Force disconnect old socket if still connected
        const oldSocket = this.io.sockets.sockets.get(existingSocket);
        if (oldSocket) {
          oldSocket.emit('force_disconnect', { reason: 'New connection established' });
          oldSocket.disconnect(true);
        }
      }

      const user = await UserModel.findById(userId);
      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }

      const request: MatchmakingRequest = {
        userId,
        stake,
        socketId: socket.id,
      };

      const matchedPlayer = await MatchmakingService.findMatch(request);

      if (matchedPlayer) {
        await this.createMatch(socket, request, matchedPlayer, walletAddress);
      } else {
        const addResult = await MatchmakingService.addToQueue(request);
        
        if (!addResult.success) {
          socket.emit('error', { 
            message: addResult.error || 'Failed to join matchmaking',
            code: 'MATCHMAKING_FAILED'
          });
          return;
        }

        socket.emit('matchmaking_queued', { stake });

        setTimeout(async () => {
          await MatchmakingService.removeFromQueue(userId, stake);
          const availableStakes = await MatchmakingService.getAvailableStakes();
          socket.emit('matchmaking_timeout', { 
            message: 'No opponent found',
            suggestedStakes: availableStakes 
          });
        }, parseInt(process.env.MATCHMAKING_TIMEOUT_MS || '30000', 10));
      }
    } catch (error) {
      console.error('[Matchmaking] Error in join_matchmaking:', error);
      socket.emit('error', { message: 'Failed to join matchmaking' });
    }
  }

  private async handleRejoinMatch(
    socket: Socket,
    data: { userId: string; matchId?: string }
  ) {
    try {
      const { userId, matchId } = data;
      
      // Try to find match by matchId or userId
      let activeMatch: ActiveMatch | undefined;
      
      if (matchId) {
        activeMatch = this.activeMatches.get(matchId);
      } else {
        const foundMatchId = this.userToMatch.get(userId);
        if (foundMatchId) {
          activeMatch = this.activeMatches.get(foundMatchId);
        }
      }

      if (!activeMatch) {
        socket.emit('rejoin_failed', { reason: 'match_not_found' });
        return;
      }

      await this.reconnectPlayerToMatch(socket, userId, activeMatch);
    } catch (error) {
      console.error('Error in rejoin_match:', error);
      socket.emit('error', { message: 'Failed to rejoin match' });
    }
  }

  private async reconnectPlayerToMatch(
    socket: Socket,
    userId: string,
    activeMatch: ActiveMatch
  ) {
    // Track reconnection attempts
    if (!activeMatch.reconnectAttempts) {
      activeMatch.reconnectAttempts = new Map();
    }
    const attempts = (activeMatch.reconnectAttempts.get(userId) || 0) + 1;
    activeMatch.reconnectAttempts.set(userId, attempts);

    if (attempts > this.MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Reconnect] Player ${userId} exceeded max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS})`);
      socket.emit('error', { 
        message: 'Too many reconnection attempts. Match will be cancelled.',
        code: 'MAX_RECONNECTS_EXCEEDED'
      });
      // Cancel match and refund
      await this.cancelMatchAndRefund(activeMatch, 'max_reconnects_exceeded');
      return;
    }

    console.log(`[Reconnect] Player ${userId} reconnection attempt ${attempts}/${this.MAX_RECONNECT_ATTEMPTS}`);

    // Debounce rapid reconnections
    const lastDisconnect = activeMatch.disconnectTimestamps?.get(userId);
    const now = Date.now();
    
    if (lastDisconnect && (now - lastDisconnect) < this.RECONNECT_DEBOUNCE_MS) {
      console.log(`[Debounce] Rapid reconnect detected for ${userId}, waiting...`);
      await this.sleep(this.RECONNECT_DEBOUNCE_MS);
    }
    
    const isPlayer1 = activeMatch.player1.userId === userId;
    const playerData = isPlayer1 ? activeMatch.player1 : activeMatch.player2;
    const opponent = isPlayer1 ? activeMatch.player2 : activeMatch.player1;

    // Update socket ID
    playerData.socketId = socket.id;
    this.playerToMatch.set(socket.id, activeMatch.matchId);

    // Update socket registration in Redis
    try {
      await MatchmakingService.registerPlayerSocket(userId, socket.id);
    } catch (error) {
      console.error(`[Reconnect] Failed to register socket in Redis for ${userId}:`, error);
      // Continue with reconnection even if Redis fails - in-memory state is primary
    }

    // Remove from disconnected users
    if (activeMatch.disconnectedUsers?.has(userId)) {
      activeMatch.disconnectedUsers.delete(userId);
      console.log(`[Reconnect] Player ${userId} reconnected to match ${activeMatch.matchId}`);

      // Cancel the timeout if both players are now connected - CLEAR ANY EXISTING TIMEOUT
      if (activeMatch.disconnectedUsers.size === 0 && activeMatch.cancelTimeout) {
        clearTimeout(activeMatch.cancelTimeout);
        activeMatch.cancelTimeout = undefined;
        console.log(`[Reconnect] Cancelled match timeout for ${activeMatch.matchId}`);
      }
    }

    // Wait for connection to stabilize before sending match state
    await this.sleep(500);
    
    // Verify socket is still connected
    if (!socket.connected) {
      console.log(`[Reconnect] Socket disconnected during stabilization for ${userId}`);
      return;
    }

    // Send current match state including ready states
    socket.emit('match_found', {
      matchId: activeMatch.matchId,
      opponent: { 
        userId: opponent.userId, 
        wallet: opponent.walletAddress 
      },
      stake: activeMatch.stake,
      reconnected: true,
      hasStarted: activeMatch.hasStarted,
      signalSent: !!activeMatch.signalTimestamp,
      state: activeMatch.stateMachine.getState(),
      escrowStatus: activeMatch.escrowStatus,
      // Include payment/ready states for Option B
      player1Staked: activeMatch.player1Staked,
      player2Staked: activeMatch.player2Staked,
      bothPlayersStaked: activeMatch.player1Staked && activeMatch.player2Staked,
      player1Ready: activeMatch.player1Ready,
      player2Ready: activeMatch.player2Ready,
    });

    // If game has started, resync state
    if (activeMatch.hasStarted && !activeMatch.signalTimestamp) {
      socket.emit('game_start', { countdown: true, reconnected: true });
    } else if (activeMatch.signalTimestamp) {
      socket.emit('signal', { 
        timestamp: activeMatch.signalTimestamp,
        reconnected: true 
      });
    }

    // If this player was ready before disconnect, auto-send player_ready again
    const wasReady = isPlayer1 ? activeMatch.player1Ready : activeMatch.player2Ready;
    if (wasReady && !activeMatch.hasStarted) {
      console.log(`[Reconnect] Player ${userId} was ready before disconnect, re-sending player_ready`);
      // Give client time to process match_found before sending player_ready
      setTimeout(() => {
        socket.emit('player_ready_restored', { matchId: activeMatch.matchId });
      }, 1000);
    }

    this.emitLifecycleEvent(activeMatch.matchId, MatchEventType.PLAYER_RECONNECTED, { userId, attempts });
    console.log(`[Reconnect] Successfully reconnected player ${userId} to match ${activeMatch.matchId}`);
  }

  private async handleCancelMatchmaking(
    socket: Socket,
    data: { userId: string; stake: number }
  ) {
    try {
      await MatchmakingService.removeFromQueue(data.userId, data.stake);
      socket.emit('matchmaking_cancelled');
    } catch (error) {
      console.error('Error cancelling matchmaking:', error);
    }
  }

  private async handlePaymentConfirmed(
    socket: Socket,
    data: { matchId: string; userId: string; paymentReference: string }
  ) {
    try {
      const { matchId, userId, paymentReference } = data;
      
      console.log(`[Payment] Player ${userId} confirmed payment for match ${matchId}, ref: ${paymentReference}`);

      const activeMatch = this.activeMatches.get(matchId);
      if (!activeMatch) {
        socket.emit('error', { message: 'Match not found' });
        return;
      }

      // Verify the payment exists and is confirmed
      const payment = await PaymentModel.findByReference(paymentReference);
      if (!payment || payment.status !== PaymentStatus.CONFIRMED) {
        console.error(`[Payment] Invalid or unconfirmed payment: ${paymentReference}`);
        socket.emit('error', { message: 'Payment not confirmed' });
        return;
      }

      // Link payment to match if not already linked
      if (!payment.match_id) {
        await PaymentModel.linkToMatch(paymentReference, matchId);
      }

      // Update stake tracking
      const isPlayer1 = activeMatch.player1.userId === userId;
      if (isPlayer1) {
        activeMatch.player1Staked = true;
        console.log(`[Payment] Player1 staked for match ${matchId}`);
      } else {
        activeMatch.player2Staked = true;
        console.log(`[Payment] Player2 staked for match ${matchId}`);
      }

      // Notify the other player
      const otherPlayerSocketId = isPlayer1 ? activeMatch.player2.socketId : activeMatch.player1.socketId;
      this.io.to(otherPlayerSocketId).emit('opponent_paid', { 
        matchId,
        waitingForBoth: !(activeMatch.player1Staked && activeMatch.player2Staked)
      });

      // If both players have paid, proceed to escrow verification
      if (activeMatch.player1Staked && activeMatch.player2Staked) {
        console.log(`[Payment] Both players paid for match ${matchId}, verifying escrow`);
        
        activeMatch.waitingForStakes = false;
        activeMatch.escrowStatus = EscrowStatus.FUNDED;
        
        // Clear the stake deposit timeout
        if (activeMatch.matchStartTimeout) {
          clearTimeout(activeMatch.matchStartTimeout);
          activeMatch.matchStartTimeout = undefined;
        }

        // Emit lifecycle event
        this.emitLifecycleEvent(matchId, MatchEventType.PAYMENT_RECEIVED, {
          player1Staked: true,
          player2Staked: true,
        });

        // Verify escrow on-chain before transitioning to READY
        console.log(`[Escrow] Verifying escrow on-chain for match ${matchId}`);
        const verification = await EscrowService.verifyEscrowOnChain(matchId, activeMatch.stake);
        
        if (verification.verified) {
          console.log(`[Escrow] Escrow verified for match ${matchId}`);
          activeMatch.escrowVerified = true;
          activeMatch.escrowStatus = EscrowStatus.VERIFIED;
          
          // Transition to READY state
          const transition = activeMatch.stateMachine.transition(MatchState.READY, {
            reason: 'Both players paid and escrow verified',
            triggeredBy: 'system',
          });

          if (!transition.success) {
            console.error(`[State] Failed to transition to READY: ${transition.error}`);
          }

          this.emitLifecycleEvent(matchId, MatchEventType.ESCROW_VERIFIED, {
            stakeAmount: activeMatch.stake,
          });

          // Notify both players they can proceed to ready screen
          this.io.to(activeMatch.player1.socketId).emit('both_players_paid', { 
            matchId,
            canProceed: true,
            escrowVerified: true,
            state: activeMatch.stateMachine.getState(),
          });
          this.io.to(activeMatch.player2.socketId).emit('both_players_paid', { 
            matchId,
            canProceed: true,
            escrowVerified: true,
            state: activeMatch.stateMachine.getState(),
          });
        } else {
          console.error(`[Escrow] Escrow verification failed for match ${matchId}: ${verification.error}`);
          activeMatch.escrowStatus = EscrowStatus.FAILED;
          
          // Cancel match and refund
          await this.cancelMatchAndRefund(activeMatch, 'escrow_verification_failed');
        }
      } else {
        // Notify the player who paid that we're waiting for opponent
        socket.emit('payment_confirmed_waiting', { 
          matchId,
          waitingForOpponent: true,
          state: activeMatch.stateMachine.getState(),
        });
      }
    } catch (error) {
      console.error('Error in handlePaymentConfirmed:', error);
      socket.emit('error', { message: 'Failed to process payment confirmation' });
    }
  }

  private async createMatch(
    socket: Socket,
    player1Request: MatchmakingRequest,
    player2Request: MatchmakingRequest,
    _player1Wallet: string
  ) {
    try {
      const player1 = await UserModel.findById(player1Request.userId);
      const player2 = await UserModel.findById(player2Request.userId);

      if (!player1 || !player2) {
        socket.emit('error', { message: 'Player data not found' });
        return;
      }

      // Skip payment/escrow for free matches (stake = 0)
      const isFreeMatch = player1Request.stake === 0;

      const match = await MatchModel.create(
        player1.user_id,
        player2.user_id,
        player1Request.stake
      );

      console.log(`[Match] Created match ${match.match_id} between ${player1.user_id} and ${player2.user_id}, stake: ${player1Request.stake} WLD`);

      // Initialize state machine
      const stateMachine = new MatchStateMachine(match.match_id, MatchState.MATCHED);
      const correlationId = stateMachine.getCorrelationId();

      // Determine initial state and escrow status
      let initialState = MatchState.MATCHED;
      let escrowStatus = isFreeMatch ? EscrowStatus.NOT_REQUIRED : EscrowStatus.PENDING;

      // For paid matches, transition to FUNDING state
      if (!isFreeMatch) {
        const transitionResult = stateMachine.transition(MatchState.FUNDING, {
          reason: 'Paid match requires funding',
          triggeredBy: 'system',
        });
        if (transitionResult.success) {
          initialState = MatchState.FUNDING;
        }
      }

      const activeMatch: ActiveMatch = {
        matchId: match.match_id,
        player1: {
          userId: player1.user_id,
          socketId: player1Request.socketId,
          walletAddress: player1.wallet_address,
        },
        player2: {
          userId: player2.user_id,
          socketId: player2Request.socketId,
          walletAddress: player2.wallet_address,
        },
        stake: player1Request.stake,

        // State machine
        stateMachine,
        escrowStatus,

        // OPTION B: Full Escrow - Track stake deposits
        player1Staked: isFreeMatch, // Free matches don't need stakes
        player2Staked: isFreeMatch,
        escrowCreated: false,
        escrowVerified: false,
        waitingForStakes: !isFreeMatch,

        player1Ready: false,
        player2Ready: false,
        hasStarted: false,

        // Initialize reconnection tracking
        disconnectedUsers: new Set(),
        disconnectTimestamps: new Map(),
        reconnectAttempts: new Map(),
      };

      this.activeMatches.set(match.match_id, activeMatch);
      this.playerToMatch.set(player1Request.socketId, match.match_id);
      this.playerToMatch.set(player2Request.socketId, match.match_id);
      this.userToMatch.set(player1.user_id, match.match_id);
      this.userToMatch.set(player2.user_id, match.match_id);

      // Mark players as in active match in Redis
      await MatchmakingService.markPlayerInMatch(player1.user_id, match.match_id);
      await MatchmakingService.markPlayerInMatch(player2.user_id, match.match_id);

      // Emit lifecycle event
      this.emitLifecycleEvent(match.match_id, MatchEventType.MATCH_CREATED, {
        correlationId,
        player1: player1.user_id,
        player2: player2.user_id,
        stake: player1Request.stake,
        isFreeMatch,
        state: stateMachine.getState(),
      });

      // Notify both players match is found - they need to pay
      const matchFoundPayload = {
        matchId: match.match_id,
        stake: player1Request.stake,
        needsPayment: !isFreeMatch,
        platformWallet: process.env.PLATFORM_WALLET_ADDRESS,
        state: stateMachine.getState(),
        escrowStatus,
        correlationId,
      };

      this.io.to(player1Request.socketId).emit('match_found', {
        ...matchFoundPayload,
        opponent: { userId: player2.user_id, wallet: player2.wallet_address },
      });

      this.io.to(player2Request.socketId).emit('match_found', {
        ...matchFoundPayload,
        opponent: { userId: player1.user_id, wallet: player1.wallet_address },
      });
      
      // Set timeout to cancel match if payments not completed in time
      if (!isFreeMatch) {
        activeMatch.matchStartTimeout = setTimeout(async () => {
          const matchCheck = this.activeMatches.get(activeMatch.matchId);
          if (matchCheck && matchCheck.waitingForStakes) {
            console.error(`[Payment Timeout] Match ${activeMatch.matchId} - payments not completed after ${this.STAKE_DEPOSIT_TIMEOUT_MS}ms`);
            
            await this.cancelMatchAndRefund(matchCheck, 'payment_timeout');
          }
        }, this.STAKE_DEPOSIT_TIMEOUT_MS);
      }
    } catch (error) {
      console.error('[Match] Error creating match:', error);
      socket.emit('error', { message: 'Failed to create match' });
    }
  }

  private async handlePlayerReady(socket: Socket, data: { matchId: string }) {
    try {
      const activeMatch = this.activeMatches.get(data.matchId);
      if (!activeMatch) {
        socket.emit('error', { message: 'Match not found' });
        return;
      }

      const isPlayer1 = activeMatch.player1.socketId === socket.id;

      if (isPlayer1) activeMatch.player1Ready = true;
      else activeMatch.player2Ready = true;

      console.log(`[Ready] Player ${isPlayer1 ? 'Player1' : 'Player2'} ready in match ${data.matchId}`);

      this.emitLifecycleEvent(data.matchId, MatchEventType.PLAYER_READY, {
        player: isPlayer1 ? 'player1' : 'player2',
        userId: isPlayer1 ? activeMatch.player1.userId : activeMatch.player2.userId,
      });

      if (activeMatch.hasStarted) return;

      if (activeMatch.player1Ready && activeMatch.player2Ready) {
        // Check state machine guards before starting
        const p1Connected = this.io.sockets.sockets.has(activeMatch.player1.socketId);
        const p2Connected = this.io.sockets.sockets.has(activeMatch.player2.socketId);
        
        const canStart = MatchStateGuards.canTransitionToStarted({
          player1Ready: activeMatch.player1Ready,
          player2Ready: activeMatch.player2Ready,
          player1Connected: p1Connected,
          player2Connected: p2Connected,
        });

        if (!canStart.allowed) {
          console.warn(`[GameStart] Cannot start match ${data.matchId}: ${canStart.reason}`);
          return;
        }

        // Transition to STARTED state
        const transition = activeMatch.stateMachine.transition(MatchState.STARTED, {
          reason: 'Both players ready and connected',
          triggeredBy: 'player',
        });

        if (!transition.success) {
          console.error(`[State] Failed to transition to STARTED: ${transition.error}`);
          socket.emit('error', { message: 'Cannot start game in current state' });
          return;
        }
        
        activeMatch.hasStarted = true;
        console.log(`[GameStart] Both players ready, starting match ${data.matchId}`);

        await this.startGame(activeMatch);

        // Watchdog timer to detect start failures
        setTimeout(() => {
          const stillActive = this.activeMatches.get(activeMatch.matchId);

          if (stillActive && !stillActive.signalTimestamp) {
            console.error(`[Watchdog] Match ${activeMatch.matchId} failed to start. Refunding.`);

            EscrowService.refundBothPlayers(
              activeMatch.matchId,
              activeMatch.player1.walletAddress,
              activeMatch.player2.walletAddress,
              activeMatch.stake
            ).catch(console.error);

            MatchModel.updateStatus(activeMatch.matchId, MatchStatus.CANCELLED)
              .catch(console.error);

            this.io.to(activeMatch.player1.socketId).emit('error', { message: 'Match cancelled due to an error' });
            this.io.to(activeMatch.player2.socketId).emit('error', { message: 'Match cancelled due to an error' });

            this.cleanupMatch(activeMatch.matchId);
          }
        }, 7000);
      }

    } catch (error) {
      console.error('[Ready] Error in player_ready:', error);
      socket.emit('error', { message: 'Failed to mark ready' });
    }
  }

  private async startGame(activeMatch: ActiveMatch) {
    try {
      const escrowResult = await EscrowService.lockFunds(
        activeMatch.matchId,
        activeMatch.player1.walletAddress,
        activeMatch.player2.walletAddress,
        activeMatch.stake
      );

      if (!escrowResult.success) {
        this.io.to(activeMatch.player1.socketId).emit('error', { message: 'Failed to lock funds' });
        this.io.to(activeMatch.player2.socketId).emit('error', { message: 'Failed to lock funds' });
        return;
      }

      this.io.to(activeMatch.player1.socketId).emit('game_start', { countdown: true });
      this.io.to(activeMatch.player2.socketId).emit('game_start', { countdown: true });

      await this.sleep(1000);
      this.io.to(activeMatch.player1.socketId).emit('countdown', { count: 3 });
      this.io.to(activeMatch.player2.socketId).emit('countdown', { count: 3 });

      await this.sleep(1000);
      this.io.to(activeMatch.player1.socketId).emit('countdown', { count: 2 });
      this.io.to(activeMatch.player2.socketId).emit('countdown', { count: 2 });

      await this.sleep(1000);
      this.io.to(activeMatch.player1.socketId).emit('countdown', { count: 1 });
      this.io.to(activeMatch.player2.socketId).emit('countdown', { count: 1 });

      const minDelay = parseInt(process.env.SIGNAL_DELAY_MIN_MS || '2000', 10);
      const maxDelay = parseInt(process.env.SIGNAL_DELAY_MAX_MS || '5000', 10);
      const randomDelay = generateRandomDelay(minDelay, maxDelay);

      await this.sleep(randomDelay);

      const signalTimestamp = Date.now();
      activeMatch.signalTimestamp = signalTimestamp;

      await MatchModel.recordSignalTime(activeMatch.matchId, signalTimestamp);

      this.io.to(activeMatch.player1.socketId).emit('signal', { timestamp: signalTimestamp });
      this.io.to(activeMatch.player2.socketId).emit('signal', { timestamp: signalTimestamp });

      setTimeout(() => {
        this.handleMatchTimeout(activeMatch);
      }, parseInt(process.env.MAX_REACTION_MS || '3000', 10) + 1000);

    } catch (error) {
      console.error('Error starting game:', error);
    }
  }

  private async handlePlayerTap(
    socket: Socket,
    data: { matchId: string; clientTimestamp: number }
  ) {
    try {
      const activeMatch = this.activeMatches.get(data.matchId);
      if (!activeMatch || !activeMatch.signalTimestamp) return;

      const serverTapTimestamp = Date.now();
      const isPlayer1 = activeMatch.player1.socketId === socket.id;

      const validation = AntiCheatService.validateReaction(
        data.clientTimestamp,
        serverTapTimestamp,
        activeMatch.signalTimestamp
      );

      if (isPlayer1) {
        activeMatch.player1Reaction = validation.reactionMs;
        activeMatch.player1TapTime = serverTapTimestamp;
      } else {
        activeMatch.player2Reaction = validation.reactionMs;
        activeMatch.player2TapTime = serverTapTimestamp;
      }

      await MatchModel.recordReaction(
        activeMatch.matchId,
        isPlayer1 ? activeMatch.player1.userId : activeMatch.player2.userId,
        validation.reactionMs
      );

      if (
        activeMatch.player1Reaction !== undefined &&
        activeMatch.player2Reaction !== undefined
      ) {
        await this.determineWinner(activeMatch);
      }
    } catch (error) {
      console.error('Error handling player tap:', error);
    }
  }

  private async determineWinner(activeMatch: ActiveMatch) {
    try {
      const p1Reaction = activeMatch.player1Reaction!;
      const p2Reaction = activeMatch.player2Reaction!;
      const signalTime = activeMatch.signalTimestamp!;

      const p1FalseStart = AntiCheatService.isFalseStart(
        activeMatch.player1TapTime!,
        signalTime
      );
      const p2FalseStart = AntiCheatService.isFalseStart(
        activeMatch.player2TapTime!,
        signalTime
      );

      let winnerId: string | undefined;
      let result: string;

      if (p1FalseStart && p2FalseStart) {
        const falseStartCount = await MatchModel.incrementFalseStartCount(activeMatch.matchId);
        
        if (falseStartCount === 1) {
          result = 'both_false_start_rematch';
          this.io.to(activeMatch.player1.socketId).emit('match_result', { result, rematch: true });
          this.io.to(activeMatch.player2.socketId).emit('match_result', { result, rematch: true });

          activeMatch.player1Reaction = undefined;
          activeMatch.player2Reaction = undefined;
          activeMatch.signalTimestamp = undefined;

          await this.startGame(activeMatch);
          return;
        } else {
          result = 'both_false_start_cancelled';
          await EscrowService.refundWithFee(
            activeMatch.matchId,
            activeMatch.player1.walletAddress,
            activeMatch.player2.walletAddress,
            activeMatch.stake,
            3
          );
          await MatchModel.updateStatus(activeMatch.matchId, MatchStatus.CANCELLED);
        }
      } else if (p1FalseStart) {
        winnerId = activeMatch.player2.userId;
        result = 'player1_false_start';
        await EscrowService.distributeWinnings(
          activeMatch.matchId,
          activeMatch.player2.walletAddress,
          activeMatch.stake
        );
      } else if (p2FalseStart) {
        winnerId = activeMatch.player1.userId;
        result = 'player2_false_start';
        await EscrowService.distributeWinnings(
          activeMatch.matchId,
          activeMatch.player1.walletAddress,
          activeMatch.stake
        );
      } else if (Math.abs(p1Reaction - p2Reaction) <= 1) {
        result = 'tie';
        await EscrowService.splitPot(
          activeMatch.matchId,
          activeMatch.player1.walletAddress,
          activeMatch.player2.walletAddress,
          activeMatch.stake
        );
      } else {
        winnerId = p1Reaction < p2Reaction ? activeMatch.player1.userId : activeMatch.player2.userId;
        result = 'normal_win';

        const winnerWallet = winnerId === activeMatch.player1.userId 
          ? activeMatch.player1.walletAddress 
          : activeMatch.player2.walletAddress;
        
        await EscrowService.distributeWinnings(
          activeMatch.matchId,
          winnerWallet,
          activeMatch.stake
        );
      }

      await MatchModel.completeMatch({
        matchId: activeMatch.matchId,
        winnerId,
        player1ReactionMs: p1Reaction,
        player2ReactionMs: p2Reaction,
        reason: result,
      });

      if (winnerId) {
        await UserModel.updateStats(winnerId, true, winnerId === activeMatch.player1.userId ? p1Reaction : p2Reaction);

        const loserId = winnerId === activeMatch.player1.userId ? activeMatch.player2.userId : activeMatch.player1.userId;
        const loserReaction = winnerId === activeMatch.player1.userId ? p2Reaction : p1Reaction;

        await UserModel.updateStats(loserId, false, loserReaction);
      }

      this.io.to(activeMatch.player1.socketId).emit('match_result', {
        result,
        winnerId,
        player1Reaction: p1Reaction,
        player2Reaction: p2Reaction,
      });

      this.io.to(activeMatch.player2.socketId).emit('match_result', {
        result,
        winnerId,
        player1Reaction: p1Reaction,
        player2Reaction: p2Reaction,
      });

      AntiCheatService.logMatchAudit(activeMatch.matchId, {
        player1Id: activeMatch.player1.userId,
        player2Id: activeMatch.player2.userId,
        player1ReactionMs: p1Reaction,
        player2ReactionMs: p2Reaction,
        signalTimestamp: signalTime,
        winnerId,
      });

      this.cleanupMatch(activeMatch.matchId);
    } catch (error) {
      console.error('Error determining winner:', error);
    }
  }

  private async handleMatchTimeout(activeMatch: ActiveMatch) {
    if (!this.activeMatches.has(activeMatch.matchId)) return;

    const p1Tapped = activeMatch.player1Reaction !== undefined;
    const p2Tapped = activeMatch.player2Reaction !== undefined;

    if (p1Tapped && p2Tapped) return;

    let winnerId: string | undefined;

    if (p1Tapped && !p2Tapped) {
      winnerId = activeMatch.player1.userId;
      await EscrowService.distributeWinnings(
        activeMatch.matchId,
        activeMatch.player1.walletAddress,
        activeMatch.stake
      );
    } else if (!p1Tapped && p2Tapped) {
      winnerId = activeMatch.player2.userId;
      await EscrowService.distributeWinnings(
        activeMatch.matchId,
        activeMatch.player2.walletAddress,
        activeMatch.stake
      );
    } else {
      await EscrowService.refundBothPlayers(
        activeMatch.matchId,
        activeMatch.player1.walletAddress,
        activeMatch.player2.walletAddress,
        activeMatch.stake
      );
      await MatchModel.updateStatus(activeMatch.matchId, MatchStatus.CANCELLED);
    }

    if (winnerId) {
      await MatchModel.completeMatch({
        matchId: activeMatch.matchId,
        winnerId,
        player1ReactionMs: activeMatch.player1Reaction,
        player2ReactionMs: activeMatch.player2Reaction,
        reason: 'timeout',
      });
    }

    this.io.to(activeMatch.player1.socketId).emit('match_result', {
      result: 'timeout',
      winnerId,
      player1Reaction: activeMatch.player1Reaction,
      player2Reaction: activeMatch.player2Reaction,
    });

    this.io.to(activeMatch.player2.socketId).emit('match_result', {
      result: 'timeout',
      winnerId,
      player1Reaction: activeMatch.player1Reaction,
      player2Reaction: activeMatch.player2Reaction,
    });

    this.cleanupMatch(activeMatch.matchId);
  }

  private async handleDisconnect(socket: Socket) {
    const disconnectTime = Date.now();
    const connectionStartTime = this.socketConnectionTimes.get(socket.id);
    const connectionDuration = connectionStartTime ? disconnectTime - connectionStartTime : 0;
    
    console.log(`[Disconnect] Client disconnected: ${socket.id} at ${new Date(disconnectTime).toISOString()} (connection duration: ${connectionDuration}ms)`);

    // Clean up connection time tracking
    this.socketConnectionTimes.delete(socket.id);

    const matchId = this.playerToMatch.get(socket.id);
    if (!matchId) {
      console.log(`[Disconnect] No active match for socket ${socket.id}`);
      return;
    }

    const activeMatch = this.activeMatches.get(matchId);
    if (!activeMatch) {
      console.log(`[Disconnect] Match ${matchId} not found in active matches`);
      return;
    }

    const isPlayer1 = activeMatch.player1.socketId === socket.id;
    const disconnectedUserId = isPlayer1 ? activeMatch.player1.userId : activeMatch.player2.userId;
    const otherPlayer = isPlayer1 ? activeMatch.player2 : activeMatch.player1;

    console.log(`[Disconnect] Match ${matchId} state:`, {
      hasStarted: activeMatch.hasStarted,
      signalSent: !!activeMatch.signalTimestamp,
      player1Ready: activeMatch.player1Ready,
      player2Ready: activeMatch.player2Ready,
      disconnectedPlayer: isPlayer1 ? 'player1' : 'player2',
      connectionDuration: `${connectionDuration}ms`,
    });

    // Early disconnect guard: if connection was very short-lived (e.g., React remount),
    // don't count it toward reconnect attempts or trigger match cancellation logic
    if (connectionDuration < this.MIN_STABLE_CONNECTION_MS) {
      console.log(`[Disconnect] Early disconnect ignored (connection duration ${connectionDuration}ms < ${this.MIN_STABLE_CONNECTION_MS}ms). Likely a React remount or transient connection.`);
      // Clean up the socket mapping but don't trigger disconnection penalties
      this.playerToMatch.delete(socket.id);
      // NOTE: We intentionally don't clean up userToMatch here because the user
      // will likely reconnect immediately with a new socket ID. The userToMatch
      // mapping allows the reconnection to find the existing match.
      return;
    }

    // Mark player as disconnected
    activeMatch.disconnectedUsers = activeMatch.disconnectedUsers || new Set();
    activeMatch.disconnectedUsers.add(disconnectedUserId);
    
    activeMatch.disconnectTimestamps = activeMatch.disconnectTimestamps || new Map();
    activeMatch.disconnectTimestamps.set(disconnectedUserId, disconnectTime);

    console.log(`[Disconnect] Player ${disconnectedUserId} marked as disconnected, grace period: ${this.RECONNECT_GRACE_PERIOD_MS}ms`);

    // Emit lifecycle event
    this.emitLifecycleEvent(matchId, MatchEventType.PLAYER_DISCONNECTED, {
      userId: disconnectedUserId,
      state: activeMatch.stateMachine.getState(),
    });

    // Notify other player
    this.io.to(otherPlayer.socketId).emit('opponent_disconnected', {
      temporary: true,
      gracePeriodMs: this.RECONNECT_GRACE_PERIOD_MS,
    });

    // Clear any existing timeout before setting a new one to prevent conflicts
    if (activeMatch.cancelTimeout) {
      console.log(`[Disconnect] Clearing existing timeout for match ${matchId}`);
      clearTimeout(activeMatch.cancelTimeout);
      activeMatch.cancelTimeout = undefined;
    }

    // Set timeout to cancel match if player doesn't reconnect
    activeMatch.cancelTimeout = setTimeout(async () => {
      const match = this.activeMatches.get(matchId);
      if (!match || !match.disconnectedUsers?.has(disconnectedUserId)) {
        console.log(`[Disconnect Timeout] Player ${disconnectedUserId} reconnected or match cleaned up`);
        return; // Player reconnected or match already cleaned up
      }

      console.log(`[Disconnect Timeout] Player ${disconnectedUserId} did not reconnect within grace period`);

      // Handle based on game state
      if (!match.signalTimestamp) {
        // Disconnected before signal - refund both
        console.log(`[Refund] Both players for match ${matchId} (disconnect before signal)`);
        await EscrowService.refundBothPlayers(
          match.matchId,
          match.player1.walletAddress,
          match.player2.walletAddress,
          match.stake
        );
        await MatchModel.updateStatus(match.matchId, MatchStatus.CANCELLED);

        this.io.to(otherPlayer.socketId).emit('opponent_disconnected', {
          refund: true,
          reason: 'before_signal',
        });
      } else {
        // Disconnected after signal - other player wins
        console.log(`[Win by Disconnect] ${otherPlayer.userId} wins match ${matchId}`);
        await EscrowService.distributeWinnings(
          match.matchId,
          otherPlayer.walletAddress,
          match.stake
        );

        await MatchModel.completeMatch({
          matchId: match.matchId,
          winnerId: otherPlayer.userId,
          player1ReactionMs: match.player1Reaction,
          player2ReactionMs: match.player2Reaction,
          reason: 'disconnect',
        });

        this.io.to(otherPlayer.socketId).emit('opponent_disconnected', {
          win: true,
          reason: 'after_signal',
        });
      }

      this.cleanupMatch(matchId);
    }, this.RECONNECT_GRACE_PERIOD_MS);
  }

  private cleanupMatch(matchId: string) {
    const activeMatch = this.activeMatches.get(matchId);
    if (activeMatch) {
      // Clear any pending timeouts
      if (activeMatch.cancelTimeout) {
        clearTimeout(activeMatch.cancelTimeout);
      }
      if (activeMatch.matchStartTimeout) {
        clearTimeout(activeMatch.matchStartTimeout);
      }

      // Clear Redis tracking
      MatchmakingService.clearPlayerMatch(activeMatch.player1.userId).catch(console.error);
      MatchmakingService.clearPlayerMatch(activeMatch.player2.userId).catch(console.error);
      MatchmakingService.clearPlayerSocket(activeMatch.player1.userId).catch(console.error);
      MatchmakingService.clearPlayerSocket(activeMatch.player2.userId).catch(console.error);

      // Remove from all tracking maps
      this.playerToMatch.delete(activeMatch.player1.socketId);
      this.playerToMatch.delete(activeMatch.player2.socketId);
      this.userToMatch.delete(activeMatch.player1.userId);
      this.userToMatch.delete(activeMatch.player2.userId);
      
      // Clean up connection time tracking for both players
      this.socketConnectionTimes.delete(activeMatch.player1.socketId);
      this.socketConnectionTimes.delete(activeMatch.player2.socketId);
      
      this.activeMatches.delete(matchId);
      
      this.emitLifecycleEvent(matchId, MatchEventType.MATCH_CANCELLED, {
        finalState: activeMatch.stateMachine.getState(),
      });
      
      console.log(`[Cleanup] Cleaned up match ${matchId}`);
    }
  }

  /**
   * Cancel match and attempt refund
   */
  private async cancelMatchAndRefund(activeMatch: ActiveMatch, reason: string) {
    console.log(`[Cancel] Cancelling match ${activeMatch.matchId}, reason: ${reason}`);
    
    // Check if any payments were made and refund them
    const payments = await PaymentModel.findByMatchId(activeMatch.matchId);
    const confirmedPayments = payments.filter(p => p.status === PaymentStatus.CONFIRMED);
    
    if (confirmedPayments.length > 0) {
      console.log(`[Cancel] ${confirmedPayments.length} payment(s) found, initiating refunds`);
      // TODO: Implement refund logic for World Pay payments
      // For now, just log and mark for manual review
    }
    
    // Transition state machine to CANCELLED
    activeMatch.stateMachine.transition(MatchState.CANCELLED, {
      reason,
      triggeredBy: 'system',
    });
    
    // Notify both players
    this.io.to(activeMatch.player1.socketId).emit('match_cancelled', {
      reason,
      message: `Match cancelled - ${reason.replace(/_/g, ' ')}`
    });
    this.io.to(activeMatch.player2.socketId).emit('match_cancelled', {
      reason,
      message: `Match cancelled - ${reason.replace(/_/g, ' ')}`
    });
    
    await MatchModel.updateStatus(activeMatch.matchId, MatchStatus.CANCELLED);
    this.cleanupMatch(activeMatch.matchId);
  }

  /**
   * Emit structured lifecycle event for observability
   */
  private emitLifecycleEvent(matchId: string, eventType: MatchEventType, data?: any) {
    const event = {
      matchId,
      correlationId: this.activeMatches.get(matchId)?.stateMachine.getCorrelationId() || 'unknown',
      eventType,
      timestamp: Date.now(),
      data,
    };
    
    // Log structured event
    console.log(`[LifecycleEvent] ${eventType}:`, JSON.stringify(event));
    
    // Could also emit to monitoring system, metrics, etc.
    // this.metricsService.recordEvent(event);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}