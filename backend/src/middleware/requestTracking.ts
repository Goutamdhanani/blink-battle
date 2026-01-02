import { Request, Response, NextFunction } from 'express';

/**
 * Simple request tracking middleware to monitor polling frequency
 * Logs aggregated stats every minute
 */

interface RequestStats {
  count: number;
  lastReset: number;
  endpoints: Map<string, number>;
}

const stats: Map<string, RequestStats> = new Map();
const STATS_WINDOW_MS = 60000; // 1 minute
let statsInterval: NodeJS.Timeout | null = null;

export const requestTrackingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).userId;
  const endpoint = `${req.method} ${req.path}`;
  
  if (userId) {
    let userStats = stats.get(userId);
    const now = Date.now();
    
    if (!userStats || (now - userStats.lastReset) > STATS_WINDOW_MS) {
      // Reset stats every minute
      userStats = {
        count: 0,
        lastReset: now,
        endpoints: new Map()
      };
      stats.set(userId, userStats);
    }
    
    userStats.count++;
    userStats.endpoints.set(endpoint, (userStats.endpoints.get(endpoint) || 0) + 1);
    
    // Start stats logging if not already running
    if (!statsInterval) {
      startStatsLogging();
    }
  }
  
  next();
};

// Start logging aggregated stats every minute
function startStatsLogging() {
  if (statsInterval) return;
  
  statsInterval = setInterval(() => {
    if (stats.size === 0) return;
    
    const now = Date.now();
    let totalRequests = 0;
    const endpointTotals = new Map<string, number>();
    
    for (const [userId, userStats] of stats.entries()) {
      if ((now - userStats.lastReset) > STATS_WINDOW_MS) {
        // Only count recent stats
        continue;
      }
      
      totalRequests += userStats.count;
      
      for (const [endpoint, count] of userStats.endpoints.entries()) {
        endpointTotals.set(endpoint, (endpointTotals.get(endpoint) || 0) + count);
      }
    }
    
    if (totalRequests > 0) {
      console.log(`[Request Stats] Last minute: ${totalRequests} requests from ${stats.size} users`);
      
      // Log top endpoints
      const sorted = Array.from(endpointTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      for (const [endpoint, count] of sorted) {
        console.log(`  ${endpoint}: ${count} requests`);
      }
    }
  }, 60000);
}

/**
 * Stop stats logging (useful for testing or graceful shutdown)
 */
export const stopStatsLogging = () => {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
};

/**
 * Get current request rate for a user
 */
export const getUserRequestRate = (userId: string): number => {
  const userStats = stats.get(userId);
  if (!userStats) return 0;
  
  const now = Date.now();
  const elapsed = now - userStats.lastReset;
  
  if (elapsed > STATS_WINDOW_MS) return 0;
  
  // Return requests per second
  return userStats.count / (elapsed / 1000);
};
