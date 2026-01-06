/**
 * useCognitiveProfile Hook
 * 
 * React hook for accessing and managing cognitive profile data.
 */

import { useState, useCallback } from 'react';
import { CognitiveProfile, GameScore } from '../games/types';
import { cognitiveProfileService } from '../services/cognitiveProfileService';

export function useCognitiveProfile() {
  const [profile, setProfile] = useState<CognitiveProfile | null>(
    () => cognitiveProfileService.getProfile()
  );
  
  const [gamesUntilProfile, setGamesUntilProfile] = useState(
    () => cognitiveProfileService.getGamesUntilProfile()
  );

  /**
   * Record a game score
   */
  const recordGameScore = useCallback((score: GameScore) => {
    cognitiveProfileService.recordGameScore(score);
    refresh();
  }, []);

  /**
   * Get best time of day
   */
  const getBestTimeOfDay = useCallback(() => {
    return cognitiveProfileService.getBestTimeOfDay();
  }, []);

  /**
   * Reset profile
   */
  const resetProfile = useCallback(() => {
    cognitiveProfileService.reset();
    refresh();
  }, []);

  /**
   * Refresh profile from service
   */
  const refresh = useCallback(() => {
    setProfile(cognitiveProfileService.getProfile());
    setGamesUntilProfile(cognitiveProfileService.getGamesUntilProfile());
  }, []);

  /**
   * Check if profile is ready
   */
  const isProfileReady = profile !== null;

  /**
   * Get minimum games needed
   */
  const minimumGamesNeeded = cognitiveProfileService.getMinimumGamesNeeded();

  return {
    profile,
    isProfileReady,
    gamesUntilProfile,
    minimumGamesNeeded,
    recordGameScore,
    getBestTimeOfDay,
    resetProfile,
    refresh,
  };
}
