import redisClient from '../config/redis';
import { MatchmakingRequest } from '../models/types';

export class MatchmakingService {
  private static readonly QUEUE_PREFIX = 'matchmaking:';
  private static readonly TIMEOUT_MS = parseInt(
    process.env.MATCHMAKING_TIMEOUT_MS || '30000',
    10
  );

  /**
   * Add a player to the matchmaking queue
   */
  static async addToQueue(request: MatchmakingRequest): Promise<void> {
    const queueKey = this.getQueueKey(request.stake);
    const requestData = JSON.stringify({
      ...request,
      timestamp: Date.now(),
    });

    await redisClient.rPush(queueKey, requestData);
    console.log(`Matchmaking: Added player ${request.userId} to queue for stake ${request.stake} WLD`);
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
      // Request is stale, try finding another
      return this.findMatch(request);
    }

    // Make sure we don't match the same player with themselves
    if (parsedPlayer.userId === request.userId) {
      // Put them back and try again
      await redisClient.lPush(queueKey, waitingPlayer);
      return null;
    }

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
        console.log(`Matchmaking: Removed player ${userId} from queue for stake ${stake} WLD`);
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
