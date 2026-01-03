import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';

/**
 * Custom hook for server time synchronization
 * Ensures accurate timing for countdown and game events
 */
export const useTimeSync = () => {
  const [timeOffset, setTimeOffset] = useState<number>(0);
  const [isSynced, setIsSynced] = useState<boolean>(false);

  /**
   * Sync time with server once on mount
   * Uses round-trip time (RTT) to estimate network delay
   */
  const syncServerTime = useCallback(async () => {
    try {
      const t0 = Date.now();
      
      const response = await apiClient.get('/api/time');
      const serverTime = response.data.server_time;
      
      const t1 = Date.now();
      const rtt = t1 - t0;
      
      // Estimate server time accounting for round-trip delay
      const estimatedServerTime = serverTime + (rtt / 2);
      const offset = estimatedServerTime - t1;
      
      setTimeOffset(offset);
      setIsSynced(true);
      
      console.log(`[TimeSync] Server offset: ${offset}ms, RTT: ${rtt}ms`);
      
      return offset;
    } catch (error) {
      console.error('[TimeSync] Failed to sync with server:', error);
      // Fallback to no offset if sync fails
      setTimeOffset(0);
      setIsSynced(true);
      return 0;
    }
  }, []);

  /**
   * Get current server time
   */
  const getServerTime = useCallback((): number => {
    return Date.now() + timeOffset;
  }, [timeOffset]);

  /**
   * Convert server timestamp to local timestamp
   */
  const serverToLocalTime = useCallback((serverTime: number): number => {
    return serverTime - timeOffset;
  }, [timeOffset]);

  /**
   * Schedule a callback at exact server time
   */
  const scheduleAtServerTime = useCallback((
    serverTime: number, 
    callback: () => void
  ): NodeJS.Timeout => {
    const localTime = serverToLocalTime(serverTime);
    const delay = Math.max(0, localTime - Date.now());
    
    return setTimeout(callback, delay);
  }, [serverToLocalTime]);

  // Sync on mount
  useEffect(() => {
    syncServerTime();
  }, [syncServerTime]);

  return {
    timeOffset,
    isSynced,
    syncServerTime,
    getServerTime,
    serverToLocalTime,
    scheduleAtServerTime
  };
};
