import { Request, Response, NextFunction } from 'express';

/**
 * Simple in-memory rate limiter for HTTP polling endpoints
 * Prevents abuse by limiting requests per user per time window
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore: Map<string, RateLimitEntry> = new Map();

// Rate limit configuration
const RATE_LIMITS = {
  // Matchmaking endpoints (less frequent)
  matchmaking: {
    windowMs: 60000, // 1 minute
    maxRequests: 20, // 20 requests per minute max
  },
  // Match state endpoints (more frequent during gameplay)
  match: {
    windowMs: 60000, // 1 minute
    maxRequests: 100, // 100 requests per minute max (allows ~1.6 req/sec)
  },
};

/**
 * Create rate limiter middleware
 */
export const createRateLimiter = (
  type: 'matchmaking' | 'match'
) => {
  const config = RATE_LIMITS[type];
  
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).userId;
    
    if (!userId) {
      // No user ID means auth middleware hasn't run or user is not authenticated
      // Let the auth middleware handle this
      next();
      return;
    }
    
    const key = `${type}:${userId}`;
    const now = Date.now();
    
    let entry = rateLimitStore.get(key);
    
    // Reset if window has passed
    if (!entry || now > entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + config.windowMs,
      };
      rateLimitStore.set(key, entry);
    }
    
    entry.count++;
    
    // Check if rate limit exceeded
    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      
      res.set('Retry-After', retryAfter.toString());
      res.set('X-RateLimit-Limit', config.maxRequests.toString());
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', entry.resetAt.toString());
      
      console.warn(`[Rate Limit] User ${userId} exceeded ${type} rate limit (${entry.count}/${config.maxRequests})`);
      
      res.status(429).json({
        error: 'Too many requests',
        retryAfter,
        limit: config.maxRequests,
        windowMs: config.windowMs,
      });
      return;
    }
    
    // Add rate limit headers
    res.set('X-RateLimit-Limit', config.maxRequests.toString());
    res.set('X-RateLimit-Remaining', (config.maxRequests - entry.count).toString());
    res.set('X-RateLimit-Reset', entry.resetAt.toString());
    
    next();
  };
};

/**
 * Cleanup old rate limit entries periodically
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt + 60000) { // 1 minute past reset
      rateLimitStore.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[Rate Limit] Cleaned up ${cleaned} expired entries`);
  }
}, 300000); // Clean up every 5 minutes

// Export rate limiters for different endpoint types
export const matchmakingRateLimiter = createRateLimiter('matchmaking');
export const matchRateLimiter = createRateLimiter('match');
