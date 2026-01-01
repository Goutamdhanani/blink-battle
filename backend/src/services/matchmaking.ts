import redisClient from '../config/redis';
import { MatchmakingRequest } from '../models/types';

export class MatchmakingService {
  private static readonly QUEUE_PREFIX = 'matchmaking:';
  private static readonly ACTIVE_MATCH_PREFIX = 'active_match:';
  private static readonly PLAYER_SOCKET_PREFIX = 'player_socket:';
  private static readonly QUEUE_DISCONNECT_PREFIX = 'queue_disconnect:'; // Track disconnected queue entries
  private static readonly TIMEOUT_MS = parseInt(
    process.env.MATCHMAKING_TIMEOUT_MS || '30000',
    10
  );
  private static readonly QUEUE_GRACE_PERIOD_MS = 30000; // 30 second grace period for queue disconnect/reconnect
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
   * Now marks queue entries as disconnected with grace period instead of immediate removal
   */
  static async removeFromAllQueues(userId: string): Promise<number> {
    let removedCount = 0;

    for (const stake of this.STAKE_LEVELS) {
      const queueKey = this.getQueueKey(stake);
      const queue = await redisClient.lRange(queueKey, 0, -1);

      for (const item of queue) {
        const request: MatchmakingRequest = JSON.parse(item);
        if (request.userId === userId) {
          // Mark as disconnected instead of removing immediately
          await this.markQueueEntryDisconnected(userId, stake);
          console.log(`[Matchmaking] Marked player ${userId} as disconnected in queue for stake ${stake} WLD (grace period: ${this.QUEUE_GRACE_PERIOD_MS}ms)`);
          removedCount++;
          break;
        }
      }
    }

    if (removedCount > 0) {
      console.log(`[Matchmaking] Marked ${removedCount} queue entries as disconnected for player ${userId}`);
    }

    return removedCount;
  }

  /**
   * Mark a queue entry as disconnected with a grace period
   * Entry will be auto-removed after grace period if player doesn't reconnect
   */
  static async markQueueEntryDisconnected(userId: string, stake: number): Promise<void> {
    const disconnectKey = `${this.QUEUE_DISCONNECT_PREFIX}${userId}:${stake}`;
    const disconnectData = JSON.stringify({
      userId,
      stake,
      disconnectTimestamp: Date.now(),
    });
    
    // Set with TTL equal to grace period (auto-cleanup)
    const gracePeriodSeconds = Math.ceil(this.QUEUE_GRACE_PERIOD_MS / 1000);
    await redisClient.setEx(disconnectKey, gracePeriodSeconds, disconnectData);
    
    console.log(
      `[QueueGrace] Marked ${userId} as disconnected from queue (stake: ${stake})\n` +
      `  Grace period: ${this.QUEUE_GRACE_PERIOD_MS}ms\n` +
      `  Will auto-remove at: ${new Date(Date.now() + this.QUEUE_GRACE_PERIOD_MS).toISOString()}`
    );
  }

  /**
   * Check if a queue entry is marked as disconnected
   */
  static async isQueueEntryDisconnected(userId: string, stake: number): Promise<boolean> {
    const disconnectKey = `${this.QUEUE_DISCONNECT_PREFIX}${userId}:${stake}`;
    const data = await redisClient.get(disconnectKey);
    return data !== null;
  }

  /**
   * Restore a queue entry after reconnection (clear disconnect marker)
   * Returns true if the entry was within grace period and successfully restored
   */
  static async restoreQueueEntry(userId: string, stake: number): Promise<boolean> {
    const disconnectKey = `${this.QUEUE_DISCONNECT_PREFIX}${userId}:${stake}`;
    const data = await redisClient.get(disconnectKey);
    
    if (!data) {
      console.log(`[QueueGrace] No disconnect marker for ${userId} (stake: ${stake}) - may have expired`);
      return false;
    }
    
    const disconnectData = JSON.parse(data);
    const disconnectDuration = Date.now() - disconnectData.disconnectTimestamp;
    
    if (disconnectDuration > this.QUEUE_GRACE_PERIOD_MS) {
      console.log(
        `[QueueGrace] Grace period expired for ${userId} (stake: ${stake})\n` +
        `  Disconnect duration: ${disconnectDuration}ms\n` +
        `  Grace period: ${this.QUEUE_GRACE_PERIOD_MS}ms`
      );
      await redisClient.del(disconnectKey);
      return false;
    }
    
    // Clear disconnect marker - player is back
    await redisClient.del(disconnectKey);
    
    console.log(
      `[QueueGrace] Restored queue entry for ${userId} (stake: ${stake})\n` +
      `  Disconnect duration: ${disconnectDuration}ms\n` +
      `  Within grace period: ${this.QUEUE_GRACE_PERIOD_MS}ms`
    );
    
    return true;
  }

  /**
   * Cleanup expired queue entries (called after grace period)
   * Removes entries from queue if disconnect marker expired
   */
  static async cleanupExpiredQueueEntry(userId: string, stake: number): Promise<void> {
    const queueKey = this.getQueueKey(stake);
    const queue = await redisClient.lRange(queueKey, 0, -1);
    
    for (const item of queue) {
      const request: MatchmakingRequest = JSON.parse(item);
      if (request.userId === userId) {
        await redisClient.lRem(queueKey, 1, item);
        console.log(`[QueueGrace] Removed expired queue entry for ${userId} (stake: ${stake})`);
        break;
      }
    }
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
