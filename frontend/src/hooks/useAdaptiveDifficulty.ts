/**
 * useAdaptiveDifficulty Hook
 * 
 * React hook for managing adaptive difficulty in games.
 */

import { useState, useEffect, useCallback } from 'react';
import { GameType, AdaptiveDifficultyState } from '../games/types';
import { adaptiveDifficultyService } from '../services/adaptiveDifficultyService';

export function useAdaptiveDifficulty(gameType: GameType) {
  const [difficultyState, setDifficultyState] = useState<AdaptiveDifficultyState>(
    () => adaptiveDifficultyService.getDifficultyState(gameType)
  );

  /**
   * Record game performance and update difficulty
   */
  const recordPerformance = useCallback(
    (accuracy: number, score: number, level: number, reactionTimeMs?: number) => {
      const updatedState = adaptiveDifficultyService.recordPerformance(
        gameType,
        accuracy,
        score,
        level,
        reactionTimeMs
      );
      setDifficultyState(updatedState);
      return updatedState;
    },
    [gameType]
  );

  /**
   * Get recommended starting level
   */
  const getRecommendedLevel = useCallback(() => {
    return adaptiveDifficultyService.getRecommendedLevel(gameType);
  }, [gameType]);

  /**
   * Get performance trend
   */
  const getPerformanceTrend = useCallback(() => {
    return adaptiveDifficultyService.getPerformanceTrend(gameType);
  }, [gameType]);

  /**
   * Reset difficulty for this game
   */
  const resetDifficulty = useCallback(() => {
    adaptiveDifficultyService.resetDifficulty(gameType);
    setDifficultyState(adaptiveDifficultyService.getDifficultyState(gameType));
  }, [gameType]);

  /**
   * Refresh state from service
   */
  const refresh = useCallback(() => {
    setDifficultyState(adaptiveDifficultyService.getDifficultyState(gameType));
  }, [gameType]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    difficultyState,
    recordPerformance,
    getRecommendedLevel,
    getPerformanceTrend,
    resetDifficulty,
    refresh,
  };
}
