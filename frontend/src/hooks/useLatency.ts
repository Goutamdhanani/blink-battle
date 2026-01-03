import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../lib/api';

export interface LatencyMeasurement {
  latencyMs: number;
  timestamp: number;
}

export interface LatencyStats {
  current: number;
  average: number;
  min: number;
  max: number;
  samples: number;
}

/**
 * Hook for measuring and tracking network latency
 * 
 * Sends ping requests to server and calculates round-trip time
 * Provides statistics for display in UI
 */
export const useLatency = () => {
  const [latencyStats, setLatencyStats] = useState<LatencyStats>({
    current: 0,
    average: 0,
    min: 0,
    max: 0,
    samples: 0,
  });
  const [measuring, setMeasuring] = useState(false);
  const measurementsRef = useRef<LatencyMeasurement[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Send a single ping and measure latency
   */
  const measureOnce = useCallback(async (): Promise<number> => {
    const startTime = Date.now();
    
    try {
      await apiClient.post('/api/ping', { clientTimestamp: startTime });
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      // Store measurement
      const measurement: LatencyMeasurement = {
        latencyMs: latency,
        timestamp: endTime,
      };
      
      measurementsRef.current.push(measurement);
      
      // Keep only last 20 measurements (1 minute if measuring every 3 seconds)
      if (measurementsRef.current.length > 20) {
        measurementsRef.current.shift();
      }
      
      // Calculate stats
      const latencies = measurementsRef.current.map(m => m.latencyMs);
      const stats: LatencyStats = {
        current: latency,
        average: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        min: Math.min(...latencies),
        max: Math.max(...latencies),
        samples: latencies.length,
      };
      
      setLatencyStats(stats);
      
      return latency;
    } catch (error) {
      console.error('[Latency] Failed to measure:', error);
      return -1;
    }
  }, []);

  /**
   * Start continuous latency measurement
   */
  const startMeasuring = useCallback((intervalMs: number = 5000) => {
    if (measuring) return;
    
    setMeasuring(true);
    
    // Measure immediately
    measureOnce();
    
    // Then measure on interval
    intervalRef.current = setInterval(() => {
      measureOnce();
    }, intervalMs);
    
    console.log(`[Latency] Started measuring (interval: ${intervalMs}ms)`);
  }, [measuring, measureOnce]);

  /**
   * Stop continuous latency measurement
   */
  const stopMeasuring = useCallback(() => {
    if (!measuring) return;
    
    setMeasuring(false);
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    console.log('[Latency] Stopped measuring');
  }, [measuring]);

  /**
   * Clear all measurements
   */
  const clearMeasurements = useCallback(() => {
    measurementsRef.current = [];
    setLatencyStats({
      current: 0,
      average: 0,
      min: 0,
      max: 0,
      samples: 0,
    });
  }, []);

  /**
   * Get latency range string (e.g., "120-150ms")
   */
  const getLatencyRange = useCallback((): string => {
    if (latencyStats.samples === 0) return '--';
    if (latencyStats.samples === 1) return `${Math.round(latencyStats.current)}ms`;
    return `${Math.round(latencyStats.min)}-${Math.round(latencyStats.max)}ms`;
  }, [latencyStats]);

  /**
   * Get estimated latency compensation (half of round-trip time)
   */
  const getEstimatedOneWayLatency = useCallback((): number => {
    return Math.round(latencyStats.average / 2);
  }, [latencyStats]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    latencyStats,
    measuring,
    measureOnce,
    startMeasuring,
    stopMeasuring,
    clearMeasurements,
    getLatencyRange,
    getEstimatedOneWayLatency,
  };
};
