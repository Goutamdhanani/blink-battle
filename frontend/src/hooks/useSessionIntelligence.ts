/**
 * useSessionIntelligence Hook
 * 
 * React hook for tracking session metrics and detecting patterns.
 */

import { useState, useEffect, useCallback } from 'react';
import { SessionMetrics, GameScore } from '../games/types';
import { sessionIntelligenceService } from '../services/sessionIntelligenceService';

export function useSessionIntelligence() {
  const [currentSession, setCurrentSession] = useState<SessionMetrics | null>(
    () => sessionIntelligenceService.getCurrentSession()
  );

  const [isWarmUp, setIsWarmUp] = useState(
    () => sessionIntelligenceService.isInWarmUp()
  );

  const [isFatigued, setIsFatigued] = useState(
    () => sessionIntelligenceService.isFatigued()
  );

  /**
   * Record a game
   */
  const recordGame = useCallback((score: GameScore) => {
    const session = sessionIntelligenceService.recordGame(score);
    setCurrentSession(session);
    setIsWarmUp(sessionIntelligenceService.isInWarmUp());
    setIsFatigued(sessionIntelligenceService.isFatigued());
    return session;
  }, []);

  /**
   * Get session statistics
   */
  const getSessionStats = useCallback(() => {
    return sessionIntelligenceService.getSessionStats();
  }, []);

  /**
   * Get warm-up adjustment factor
   */
  const getWarmUpAdjustment = useCallback(() => {
    return sessionIntelligenceService.getWarmUpAdjustment();
  }, []);

  /**
   * Get fatigue message
   */
  const getFatigueMessage = useCallback(() => {
    return sessionIntelligenceService.getFatigueMessage();
  }, []);

  /**
   * Reset session data
   */
  const resetSession = useCallback(() => {
    sessionIntelligenceService.reset();
    refresh();
  }, []);

  /**
   * Refresh data from service
   */
  const refresh = useCallback(() => {
    setCurrentSession(sessionIntelligenceService.getCurrentSession());
    setIsWarmUp(sessionIntelligenceService.isInWarmUp());
    setIsFatigued(sessionIntelligenceService.isFatigued());
  }, []);

  return {
    currentSession,
    isWarmUp,
    isFatigued,
    recordGame,
    getSessionStats,
    getWarmUpAdjustment,
    getFatigueMessage,
    resetSession,
    refresh,
  };
}
