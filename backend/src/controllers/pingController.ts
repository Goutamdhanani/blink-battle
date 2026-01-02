import { Request, Response } from 'express';
import { LatencySampleModel } from '../models/LatencySample';

/**
 * Ping controller for latency sampling
 */
export class PingController {
  /**
   * POST /api/ping
   * Record latency sample for network compensation
   */
  static async recordLatency(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { clientTimestamp } = req.body;

      if (!clientTimestamp || typeof clientTimestamp !== 'number') {
        res.status(400).json({ error: 'Invalid clientTimestamp' });
        return;
      }

      const serverTimestamp = Date.now();
      const roundTripMs = serverTimestamp - clientTimestamp;

      // Store the latency sample
      await LatencySampleModel.create(userId, roundTripMs);

      // Calculate average latency for this user
      const avgLatency = await LatencySampleModel.getAverageLatency(userId, 5);

      res.json({
        success: true,
        serverTimestamp,
        roundTripMs,
        avgLatency,
      });
    } catch (error) {
      console.error('[Ping] Error recording latency:', error);
      res.status(500).json({ error: 'Failed to record latency' });
    }
  }

  /**
   * GET /api/ping/stats
   * Get latency statistics for current user
   */
  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;

      const recentSamples = await LatencySampleModel.getRecentSamples(userId, 10);
      const avgLatency = await LatencySampleModel.getAverageLatency(userId, 5);

      res.json({
        success: true,
        avgLatency,
        recentSamples: recentSamples.map(s => ({
          latencyMs: s.latency_ms,
          timestamp: s.created_at,
        })),
      });
    } catch (error) {
      console.error('[Ping] Error getting stats:', error);
      res.status(500).json({ error: 'Failed to get latency stats' });
    }
  }
}
