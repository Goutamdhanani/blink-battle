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
  signalTimestamp?: number;
  player1Reaction?: number;
  player2Reaction?: number;
  player1TapTime?: number;
  player2TapTime?: number;
}

export class GameSocketHandler {
  private io: Server;
  private activeMatches: Map<string, ActiveMatch> = new Map();
  private playerToMatch: Map<string, string> = new Map(); // socketId -> matchId

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
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  private async handleJoinMatchmaking(
    socket: Socket,
    data: { userId: string; stake: number; walletAddress: string }
  ) {
    try {
      const { userId, stake, walletAddress } = data;

      // Validate user
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

      // Try to find a match immediately
      const matchedPlayer = await MatchmakingService.findMatch(request);

      if (matchedPlayer) {
        // Found a match! Create the game
        await this.createMatch(socket, request, matchedPlayer, walletAddress);
      } else {
        // Add to queue and wait
        await MatchmakingService.addToQueue(request);
        socket.emit('matchmaking_queued', { stake });

        // Set timeout for matchmaking
        setTimeout(async () => {
          // Check if still in queue
          await MatchmakingService.removeFromQueue(userId, stake);
          
          // Suggest alternative stakes
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
    player1Wallet: string
  ) {
    try {
      // Get player data
      const player1 = await UserModel.findById(player1Request.userId);
      const player2 = await UserModel.findById(player2Request.userId);

      if (!player1 || !player2) {
        socket.emit('error', { message: 'Player data not found' });
        return;
      }

      // Create match in database
      const match = await MatchModel.create(
        player1.user_id,
        player2.user_id,
        player1Request.stake
      );

      // Store active match data
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
      };

      this.activeMatches.set(match.match_id, activeMatch);
      this.playerToMatch.set(player1Request.socketId, match.match_id);
      this.playerToMatch.set(player2Request.socketId, match.match_id);

      // Notify both players
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

      console.log(`Match created: ${match.match_id}`);
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

      // Mark player as ready
      const isPlayer1 = activeMatch.player1.socketId === socket.id;
      
      if (isPlayer1) {
        activeMatch.player1Reaction = -1; // Mark as ready
      } else {
        activeMatch.player2Reaction = -1; // Mark as ready
      }

      // Check if both players are ready
      if (activeMatch.player1Reaction === -1 && activeMatch.player2Reaction === -1) {
        // Both ready, lock funds and start game
        await this.startGame(activeMatch);
      }
    } catch (error) {
      console.error('Error in player_ready:', error);
      socket.emit('error', { message: 'Failed to mark ready' });
    }
  }

  private async startGame(activeMatch: ActiveMatch) {
    try {
      // Lock funds
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

      // Send countdown to both players
      this.io.to(activeMatch.player1.socketId).emit('game_start', { countdown: true });
      this.io.to(activeMatch.player2.socketId).emit('game_start', { countdown: true });

      // Countdown: 3, 2, 1
      await this.sleep(1000);
      this.io.to(activeMatch.player1.socketId).emit('countdown', { count: 3 });
      this.io.to(activeMatch.player2.socketId).emit('countdown', { count: 3 });

      await this.sleep(1000);
      this.io.to(activeMatch.player1.socketId).emit('countdown', { count: 2 });
      this.io.to(activeMatch.player2.socketId).emit('countdown', { count: 2 });

      await this.sleep(1000);
      this.io.to(activeMatch.player1.socketId).emit('countdown', { count: 1 });
      this.io.to(activeMatch.player2.socketId).emit('countdown', { count: 1 });

      // Generate random delay
      const minDelay = parseInt(process.env.SIGNAL_DELAY_MIN_MS || '2000', 10);
      const maxDelay = parseInt(process.env.SIGNAL_DELAY_MAX_MS || '5000', 10);
      const randomDelay = generateRandomDelay(minDelay, maxDelay);

      await this.sleep(randomDelay);

      // Send signal
      const signalTimestamp = Date.now();
      activeMatch.signalTimestamp = signalTimestamp;

      await MatchModel.recordSignalTime(activeMatch.matchId, signalTimestamp);

      this.io.to(activeMatch.player1.socketId).emit('signal', { timestamp: signalTimestamp });
      this.io.to(activeMatch.player2.socketId).emit('signal', { timestamp: signalTimestamp });

      // Set timeout for taps
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
      if (!activeMatch || !activeMatch.signalTimestamp) {
        return;
      }

      const serverTapTimestamp = Date.now();
      const isPlayer1 = activeMatch.player1.socketId === socket.id;

      // Validate reaction
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

      // Record in database
      await MatchModel.recordReaction(
        activeMatch.matchId,
        isPlayer1 ? activeMatch.player1.userId : activeMatch.player2.userId,
        validation.reactionMs
      );

      // Check if both players have tapped
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

      // Check for false starts
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
        // Both false started
        const falseStartCount = await MatchModel.incrementFalseStartCount(activeMatch.matchId);
        
        if (falseStartCount === 1) {
          // First time - rematch
          result = 'both_false_start_rematch';
          this.io.to(activeMatch.player1.socketId).emit('match_result', { result, rematch: true });
          this.io.to(activeMatch.player2.socketId).emit('match_result', { result, rematch: true });
          
          // Restart the game
          activeMatch.player1Reaction = undefined;
          activeMatch.player2Reaction = undefined;
          activeMatch.signalTimestamp = undefined;
          await this.startGame(activeMatch);
          return;
        } else {
          // Second time - refund with fee
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
        // Player 1 false started, Player 2 wins
        winnerId = activeMatch.player2.userId;
        result = 'player1_false_start';
        await EscrowService.distributeWinnings(
          activeMatch.matchId,
          activeMatch.player2.walletAddress,
          activeMatch.stake
        );
      } else if (p2FalseStart) {
        // Player 2 false started, Player 1 wins
        winnerId = activeMatch.player1.userId;
        result = 'player2_false_start';
        await EscrowService.distributeWinnings(
          activeMatch.matchId,
          activeMatch.player1.walletAddress,
          activeMatch.stake
        );
      } else if (Math.abs(p1Reaction - p2Reaction) <= 1) {
        // Tie - split pot
        result = 'tie';
        await EscrowService.splitPot(
          activeMatch.matchId,
          activeMatch.player1.walletAddress,
          activeMatch.player2.walletAddress,
          activeMatch.stake
        );
      } else {
        // Normal win
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

      // Update match in database
      await MatchModel.completeMatch({
        matchId: activeMatch.matchId,
        winnerId,
        player1ReactionMs: p1Reaction,
        player2ReactionMs: p2Reaction,
        reason: result,
      });

      // Update user stats
      if (winnerId) {
        await UserModel.updateStats(winnerId, true, winnerId === activeMatch.player1.userId ? p1Reaction : p2Reaction);
        const loserId = winnerId === activeMatch.player1.userId ? activeMatch.player2.userId : activeMatch.player1.userId;
        const loserReaction = winnerId === activeMatch.player1.userId ? p2Reaction : p1Reaction;
        await UserModel.updateStats(loserId, false, loserReaction);
      }

      // Notify both players
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

      // Log audit
      AntiCheatService.logMatchAudit(activeMatch.matchId, {
        player1Id: activeMatch.player1.userId,
        player2Id: activeMatch.player2.userId,
        player1ReactionMs: p1Reaction,
        player2ReactionMs: p2Reaction,
        signalTimestamp: signalTime,
        winnerId,
      });

      // Cleanup
      this.cleanupMatch(activeMatch.matchId);
    } catch (error) {
      console.error('Error determining winner:', error);
    }
  }

  private async handleMatchTimeout(activeMatch: ActiveMatch) {
    // Check if match is still active
    if (!this.activeMatches.has(activeMatch.matchId)) {
      return;
    }

    const p1Tapped = activeMatch.player1Reaction !== undefined;
    const p2Tapped = activeMatch.player2Reaction !== undefined;

    if (p1Tapped && p2Tapped) {
      // Both tapped, winner already determined
      return;
    }

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
      // Neither tapped - refund
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

    // Notify players
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
    console.log(`Client disconnected: ${socket.id}`);

    const matchId = this.playerToMatch.get(socket.id);
    if (!matchId) {
      return;
    }

    const activeMatch = this.activeMatches.get(matchId);
    if (!activeMatch) {
      return;
    }

    // Determine which player disconnected
    const isPlayer1 = activeMatch.player1.socketId === socket.id;
    const disconnectedPlayer = isPlayer1 ? activeMatch.player1 : activeMatch.player2;
    const otherPlayer = isPlayer1 ? activeMatch.player2 : activeMatch.player1;

    if (!activeMatch.signalTimestamp) {
      // Disconnected before signal - refund both
      await EscrowService.refundBothPlayers(
        activeMatch.matchId,
        activeMatch.player1.walletAddress,
        activeMatch.player2.walletAddress,
        activeMatch.stake
      );
      await MatchModel.updateStatus(activeMatch.matchId, MatchStatus.CANCELLED);

      this.io.to(otherPlayer.socketId).emit('opponent_disconnected', {
        refund: true,
        reason: 'before_signal',
      });
    } else {
      // Disconnected after signal - other player wins
      await EscrowService.distributeWinnings(
        activeMatch.matchId,
        otherPlayer.walletAddress,
        activeMatch.stake
      );

      await MatchModel.completeMatch({
        matchId: activeMatch.matchId,
        winnerId: otherPlayer.userId,
        player1ReactionMs: activeMatch.player1Reaction,
        player2ReactionMs: activeMatch.player2Reaction,
        reason: 'disconnect',
      });

      this.io.to(otherPlayer.socketId).emit('opponent_disconnected', {
        win: true,
        reason: 'after_signal',
      });
    }

    this.cleanupMatch(matchId);
  }

  private cleanupMatch(matchId: string) {
    const activeMatch = this.activeMatches.get(matchId);
    if (activeMatch) {
      this.playerToMatch.delete(activeMatch.player1.socketId);
      this.playerToMatch.delete(activeMatch.player2.socketId);
      this.activeMatches.delete(matchId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
