import { Server, Socket } from 'socket.io';
import { MatchModel } from '../models/Match';
import { UserModel } from '../models/User';
import { MatchmakingService } from '../services/matchmaking';
import { EscrowService } from '../services/escrow';
import { AntiCheatService } from '../services/antiCheat';
import { generateRandomDelay } from '../services/randomness';
import { MatchStatus, MatchmakingRequest } from '../models/types';

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
  cancelTimeout?: NodeJS.Timeout;
}

export class GameSocketHandler {
  private io: Server;
  private activeMatches: Map<string, ActiveMatch> = new Map();
  private playerToMatch: Map<string, string> = new Map(); // socketId -> matchId
  private userToMatch: Map<string, string> = new Map(); // userId -> matchId

  private readonly RECONNECT_GRACE_PERIOD_MS = 30000; // 30 seconds

  constructor(io: Server) {
    this.io = io;
    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on('join_matchmaking', (data) => this.handleJoinMatchmaking(socket, data));
      socket.on('cancel_matchmaking', (data) => this.handleCancelMatchmaking(socket, data));
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

      console.log(`Multiplayer matchmaking: Player ${userId} joining queue for stake ${stake} WLD`);

      // Check if user already has an active match
      const existingMatchId = this.userToMatch.get(userId);
      if (existingMatchId) {
        const existingMatch = this.activeMatches.get(existingMatchId);
        if (existingMatch) {
          console.log(`Player ${userId} already in match ${existingMatchId}, reconnecting...`);
          await this.reconnectPlayerToMatch(socket, userId, existingMatch);
          return;
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
        await MatchmakingService.addToQueue(request);
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
      console.error('Error in join_matchmaking:', error);
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
    const isPlayer1 = activeMatch.player1.userId === userId;
    const playerData = isPlayer1 ? activeMatch.player1 : activeMatch.player2;
    const opponent = isPlayer1 ? activeMatch.player2 : activeMatch.player1;

    // Update socket ID
    playerData.socketId = socket.id;
    this.playerToMatch.set(socket.id, activeMatch.matchId);

    // Remove from disconnected users
    if (activeMatch.disconnectedUsers?.has(userId)) {
      activeMatch.disconnectedUsers.delete(userId);
      console.log(`Player ${userId} reconnected to match ${activeMatch.matchId}`);

      // Cancel the timeout if both players are now connected
      if (activeMatch.disconnectedUsers.size === 0 && activeMatch.cancelTimeout) {
        clearTimeout(activeMatch.cancelTimeout);
        activeMatch.cancelTimeout = undefined;
        console.log(`Cancelled match timeout for ${activeMatch.matchId}`);
      }
    }

    // Send current match state
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

    console.log(`Successfully reconnected player ${userId} to match ${activeMatch.matchId}`);
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

      const match = await MatchModel.create(
        player1.user_id,
        player2.user_id,
        player1Request.stake
      );

      console.log(`Multiplayer match created: ${match.match_id} between ${player1.user_id} and ${player2.user_id}, stake: ${player1Request.stake} WLD`);

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

        player1Ready: false,
        player2Ready: false,
        hasStarted: false,

        // Initialize reconnection tracking
        disconnectedUsers: new Set(),
        disconnectTimestamps: new Map(),
      };

      this.activeMatches.set(match.match_id, activeMatch);
      this.playerToMatch.set(player1Request.socketId, match.match_id);
      this.playerToMatch.set(player2Request.socketId, match.match_id);
      this.userToMatch.set(player1.user_id, match.match_id);
      this.userToMatch.set(player2.user_id, match.match_id);

      this.io.to(player1Request.socketId).emit('match_found', {
        matchId: match.match_id,
        opponent: { userId: player2.user_id, wallet: player2.wallet_address },
        stake: player1Request.stake,
      });

      this.io.to(player2Request.socketId).emit('match_found', {
        matchId: match.match_id,
        opponent: { userId: player1.user_id, wallet: player1.wallet_address },
        stake: player1Request.stake,
      });
    } catch (error) {
      console.error('Error creating match:', error);
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

      console.log(`Player ready: ${isPlayer1 ? 'Player1' : 'Player2'} in match ${data.matchId}`);

      if (activeMatch.hasStarted) return;

      if (activeMatch.player1Ready && activeMatch.player2Ready) {
        activeMatch.hasStarted = true;
        console.log(`Both players ready, starting match ${data.matchId}`);

        await this.startGame(activeMatch);

        setTimeout(() => {
          const stillActive = this.activeMatches.get(activeMatch.matchId);

          if (stillActive && !stillActive.signalTimestamp) {
            console.error(`Watchdog: Match ${activeMatch.matchId} failed to start. Refunding.`);

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
      console.error('Error in player_ready:', error);
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
    console.log(`[Disconnect] Client disconnected: ${socket.id} at ${new Date(disconnectTime).toISOString()}`);

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
    });

    // Mark player as disconnected
    activeMatch.disconnectedUsers = activeMatch.disconnectedUsers || new Set();
    activeMatch.disconnectedUsers.add(disconnectedUserId);
    
    activeMatch.disconnectTimestamps = activeMatch.disconnectTimestamps || new Map();
    activeMatch.disconnectTimestamps.set(disconnectedUserId, disconnectTime);

    console.log(`[Disconnect] Player ${disconnectedUserId} marked as disconnected, grace period: ${this.RECONNECT_GRACE_PERIOD_MS}ms`);

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

      // Remove from all tracking maps
      this.playerToMatch.delete(activeMatch.player1.socketId);
      this.playerToMatch.delete(activeMatch.player2.socketId);
      this.userToMatch.delete(activeMatch.player1.userId);
      this.userToMatch.delete(activeMatch.player2.userId);
      this.activeMatches.delete(matchId);
      
      console.log(`Cleaned up match ${matchId}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}