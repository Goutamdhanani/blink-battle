/**
 * usePercentile Hook
 * 
 * React hook for calculating and displaying percentile rankings.
 */

import { useCallback } from 'react';
import { GameType, PercentileData, GameScore } from '../games/types';
import { percentileService } from '../services/percentileService';

export function usePercentile() {
  /**
   * Calculate percentile for a specific metric
   */
  const calculatePercentile = useCallback(
    (
      gameType: GameType,
      metric: 'score' | 'accuracy' | 'speed' | 'level',
      value: number
    ): PercentileData => {
      return percentileService.calculatePercentile(gameType, metric, value);
    },
    []
  );

  /**
   * Calculate multiple percentiles for a game score
   */
  const calculateMultiplePercentiles = useCallback(
    (score: GameScore): PercentileData[] => {
      return percentileService.calculateMultiplePercentiles(score);
    },
    []
  );

  /**
   * Get performance tier
   */
  const getPerformanceTier = useCallback(
    (percentile: number) => {
      return percentileService.getPerformanceTier(percentile);
    },
    []
  );

  /**
   * Calculate overall percentile across multiple games
   */
  const calculateOverallPercentile = useCallback(
    (scores: GameScore[]): number => {
      return percentileService.calculateOverallPercentile(scores);
    },
    []
  );

  /**
   * Generate percentile insight message
   */
  const generatePercentileInsight = useCallback(
    (percentile: number): string => {
      return percentileService.generatePercentileInsight(percentile);
    },
    []
  );

  return {
    calculatePercentile,
    calculateMultiplePercentiles,
    getPerformanceTier,
    calculateOverallPercentile,
    generatePercentileInsight,
  };
}
