import redisClient from '../config/redis';
import { MatchmakingRequest } from '../models/types';

export class MatchmakingService {
  private static readonly QUEUE_PREFIX = 'matchmaking:';
  private static readonly ACTIVE_MATCH_PREFIX = 'active_match:';
  private static readonly PLAYER_SOCKET_PREFIX = 'player_socket:';
  private static readonly TIMEOUT_MS = parseInt(
    process.env.MATCHMAKING_TIMEOUT_MS || '30000',
    10
  );
  // Standard stake levels supported by the system
  private static readonly STAKE_LEVELS = [0, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0];

  /**
   * Check if player is already in an active match
   */
  static async isPlayerInActiveMatch(userId: string): Promise<boolean> {
    const matchKey = `${this.ACTIVE_MATCH_PREFIX}${userId}`;
    const matchId = await redisClient.get(matchKey);
    return matchId !== null;
  }

  /**
   * Mark player as being in an active match
   */
  static async markPlayerInMatch(userId: string, matchId: string): Promise<void> {
    const matchKey = `${this.ACTIVE_MATCH_PREFIX}${userId}`;
    // Set with 2 hour expiration as safety net
    await redisClient.setEx(matchKey, 7200, matchId);
    console.log(`[Matchmaking] Marked player ${userId} as in match ${matchId}`);
  }

  /**
   * Remove player from active match tracking
   */
  static async clearPlayerMatch(userId: string): Promise<void> {
    const matchKey = `${this.ACTIVE_MATCH_PREFIX}${userId}`;
    await redisClient.del(matchKey);
    console.log(`[Matchmaking] Cleared active match for player ${userId}`);
  }

  /**
   * Get player's active match ID if any
   */
  static async getPlayerActiveMatch(userId: string): Promise<string | null> {
    const matchKey = `${this.ACTIVE_MATCH_PREFIX}${userId}`;
    return await redisClient.get(matchKey);
  }

  /**
   * Register or update player's active socket
   * Enforces single active socket per player
   */
  static async registerPlayerSocket(userId: string, socketId: string): Promise<string | null> {
    const socketKey = `${this.PLAYER_SOCKET_PREFIX}${userId}`;
    const existingSocketId = await redisClient.get(socketKey);
    
    if (existingSocketId && existingSocketId !== socketId) {
      console.log(`[Matchmaking] Player ${userId} has existing socket ${existingSocketId}, replacing with ${socketId}`);
    }
    
    // Set with 1 hour expiration
    await redisClient.setEx(socketKey, 3600, socketId);
    return existingSocketId;
  }

  /**
   * Get player's active socket ID
   */
  static async getPlayerSocket(userId: string): Promise<string | null> {
    const socketKey = `${this.PLAYER_SOCKET_PREFIX}${userId}`;
    return await redisClient.get(socketKey);
  }

  /**
   * Clear player's socket registration
   */
  static async clearPlayerSocket(userId: string): Promise<void> {
    const socketKey = `${this.PLAYER_SOCKET_PREFIX}${userId}`;
    await redisClient.del(socketKey);
  }

  /**
   * Add a player to the matchmaking queue
   * Returns error if player already in active match
   */
  static async addToQueue(request: MatchmakingRequest): Promise<{ success: boolean; error?: string }> {
    // Check if player already in active match
    const existingMatch = await this.isPlayerInActiveMatch(request.userId);
    if (existingMatch) {
      const matchId = await this.getPlayerActiveMatch(request.userId);
      console.warn(`[Matchmaking] Player ${request.userId} attempted to queue while in active match ${matchId}`);
      return { 
        success: false, 
        error: `Already in active match. Please complete or cancel current match first.` 
      };
    }

    const queueKey = this.getQueueKey(request.stake);
    const requestData = JSON.stringify({
      ...request,
      timestamp: Date.now(),
    });

    await redisClient.rPush(queueKey, requestData);
    console.log(`[Matchmaking] Added player ${request.userId} to queue for stake ${request.stake} WLD`);
    return { success: true };
  }

  /**
   * Find a match for the player
   * Returns the matched player request or null if no match found
   */
  static async findMatch(
    request: MatchmakingRequest
  ): Promise<MatchmakingRequest | null> {
    const queueKey = this.getQueueKey(request.stake);
    
    // Try to find another player in the same stake queue
    const waitingPlayer = await redisClient.lPop(queueKey);
    
    if (!waitingPlayer) {
      return null;
    }

    const parsedPlayer: MatchmakingRequest & { timestamp: number } = JSON.parse(waitingPlayer);
    
    // Check if the waiting player request is not stale
    if (Date.now() - parsedPlayer.timestamp > this.TIMEOUT_MS) {
      console.log(`[Matchmaking] Stale request from ${parsedPlayer.userId}, discarding`);
      // Request is stale, try finding another
      return this.findMatch(request);
    }

    // Make sure we don't match the same player with themselves
    if (parsedPlayer.userId === request.userId) {
      console.warn(`[Matchmaking] Attempted to match player ${request.userId} with themselves`);
      // Put them back and try again
      await redisClient.lPush(queueKey, waitingPlayer);
      return null;
    }

    console.log(`[Matchmaking] Matched ${request.userId} with ${parsedPlayer.userId}`);
    return parsedPlayer;
  }

  /**
   * Remove a player from the matchmaking queue
   */
  static async removeFromQueue(userId: string, stake: number): Promise<void> {
    const queueKey = this.getQueueKey(stake);
    const queue = await redisClient.lRange(queueKey, 0, -1);

    for (const item of queue) {
      const request: MatchmakingRequest = JSON.parse(item);
      if (request.userId === userId) {
        await redisClient.lRem(queueKey, 1, item);
        console.log(`[Matchmaking] Removed player ${userId} from queue for stake ${stake} WLD`);
        break;
      }
    }
  }

  /**
   * Remove a player from all matchmaking queues (used on disconnect)
   */
  static async removeFromAllQueues(userId: string): Promise<number> {
    let removedCount = 0;

    for (const stake of this.STAKE_LEVELS) {
      const queueKey = this.getQueueKey(stake);
      const queue = await redisClient.lRange(queueKey, 0, -1);

      for (const item of queue) {
        const request: MatchmakingRequest = JSON.parse(item);
        if (request.userId === userId) {
          await redisClient.lRem(queueKey, 1, item);
          console.log(`[Matchmaking] Removed player ${userId} from queue for stake ${stake} WLD (disconnect cleanup)`);
          removedCount++;
          break;
        }
      }
    }

    if (removedCount > 0) {
      console.log(`[Matchmaking] Cleaned up ${removedCount} queue entries for disconnected player ${userId}`);
    }

    return removedCount;
  }

  /**
   * Get available stake levels with waiting players
   */
  static async getAvailableStakes(): Promise<number[]> {
    const stakes = [0.1, 0.25, 0.5, 1.0];
    const availableStakes: number[] = [];

    for (const stake of stakes) {
      const queueKey = this.getQueueKey(stake);
      const queueLength = await redisClient.lLen(queueKey);
      if (queueLength > 0) {
        availableStakes.push(stake);
      }
    }

    return availableStakes;
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats(stake: number): Promise<number> {
    const queueKey = this.getQueueKey(stake);
    return await redisClient.lLen(queueKey);
  }

  private static getQueueKey(stake: number): string {
    return `${this.QUEUE_PREFIX}${stake}`;
  }
}
