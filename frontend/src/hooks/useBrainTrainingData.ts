import { useState, useEffect } from 'react';
import { getPlayerProfile } from '../lib/indexedDB';
import { PlayerProfile, GameStats } from '../games/types';
import { brainTrainingService } from '../services/brainTrainingService';

interface UseBrainTrainingDataResult {
  profile: PlayerProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch brain training data from backend or IndexedDB
 * - Uses backend API when token is available (authenticated)
 * - Falls back to IndexedDB for offline/unauthenticated usage
 */
export function useBrainTrainingData(token?: string | null): UseBrainTrainingDataResult {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);

    try {
      // If authenticated, try to fetch from backend
      if (token) {
        try {
          console.log('[useBrainTrainingData] Fetching from backend (authenticated)');
          const backendProfile = await brainTrainingService.getProfile(token);
          const streaks = await brainTrainingService.getStreaks(token);
          const cognitive = await brainTrainingService.getCognitiveComparison(token);
          
          // Calculate realistic XP: estimate 30 XP average per game
          const totalGames = backendProfile.totalGames;
          const estimatedXP = totalGames * 30;
          
          // Calculate level from XP using realistic system
          const level = calculateLevelFromXP(estimatedXP);
          
          // Calculate rank from XP (not level)
          const rankBadge = calculateRankBadge(estimatedXP);
          
          // Transform backend data to PlayerProfile format
          const transformedProfile: PlayerProfile = {
            xp: estimatedXP,
            level,
            rankBadge,
            totalGamesPlayed: backendProfile.totalGames,
            totalSessions: backendProfile.totalGames,
            currentStreak: streaks.currentStreak,
            longestStreak: streaks.longestStreak,
            averageDailyPlayTime: 0, // Not available from backend yet
            cognitiveIndex: cognitive.userCognitiveIndex,
            overallAccuracy: Math.round((backendProfile.memory.averageAccuracy + backendProfile.attention.averageAccuracy + backendProfile.reflex.averageAccuracy) / 3),
            gameStats: {
              memory: backendProfile.memory as GameStats,
              attention: backendProfile.attention as GameStats,
              reflex: backendProfile.reflex as GameStats,
              word_flash: (backendProfile.word_flash || createEmptyGameStats('word_flash')) as GameStats,
              shape_shadow: (backendProfile.shape_shadow || createEmptyGameStats('shape_shadow')) as GameStats,
              sequence_builder: (backendProfile.sequence_builder || createEmptyGameStats('sequence_builder')) as GameStats,
              focus_filter: (backendProfile.focus_filter || createEmptyGameStats('focus_filter')) as GameStats,
              path_memory: (backendProfile.path_memory || createEmptyGameStats('path_memory')) as GameStats,
              missing_number: (backendProfile.missing_number || createEmptyGameStats('missing_number')) as GameStats,
              color_swap: (backendProfile.color_swap || createEmptyGameStats('color_swap')) as GameStats,
              reverse_recall: (backendProfile.reverse_recall || createEmptyGameStats('reverse_recall')) as GameStats,
              blink_count: (backendProfile.blink_count || createEmptyGameStats('blink_count')) as GameStats,
              word_pair_match: (backendProfile.word_pair_match || createEmptyGameStats('word_pair_match')) as GameStats,
            },
            achievements: [], // TODO: Calculate from backend data
            unlockedThemes: calculateUnlockedThemes(level),
            currentTheme: 'Bronze',
            createdAt: Date.now(),
            lastActive: Date.now(),
            joinDate: Date.now(),
          };

          setProfile(transformedProfile);
          console.log('[useBrainTrainingData] Backend data loaded successfully');
          return;
        } catch (backendError) {
          console.warn('[useBrainTrainingData] Failed to fetch from backend, falling back to IndexedDB:', backendError);
          // Fall through to IndexedDB
        }
      }

      // Fall back to IndexedDB (offline or backend failed)
      console.log('[useBrainTrainingData] Loading from IndexedDB');
      const localProfile = await getPlayerProfile();
      setProfile(localProfile);
      console.log('[useBrainTrainingData] IndexedDB data loaded successfully');
    } catch (err) {
      console.error('[useBrainTrainingData] Error loading profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [token]);

  return {
    profile,
    loading,
    error,
    refresh: loadProfile,
  };
}

function calculateRankBadge(xp: number): string {
  if (xp >= 500000) return 'Legend';      // Top 1%
  if (xp >= 150000) return 'Master';      // Top 5%
  if (xp >= 50000) return 'Diamond';      // Skilled
  if (xp >= 15000) return 'Platinum';     // Dedicated
  if (xp >= 5000) return 'Gold';          // Regular
  if (xp >= 1000) return 'Silver';        // Casual
  return 'Bronze';                        // New
}

function calculateLevelFromXP(xp: number): number {
  const thresholds: { [key: number]: number } = {
    1: 0, 2: 100, 3: 250, 4: 500, 5: 1000, 6: 1500, 7: 2250, 8: 3000,
    9: 4000, 10: 5000, 15: 12500, 20: 25000, 30: 62500, 40: 100000,
    50: 150000, 75: 300000, 100: 500000,
  };
  
  let level = 1;
  const sortedLevels = Object.keys(thresholds).map(Number).sort((a, b) => b - a);
  
  for (const lvl of sortedLevels) {
    if (xp >= thresholds[lvl]) {
      level = lvl;
      break;
    }
  }
  
  if (xp >= thresholds[100]) {
    level = 100 + Math.floor((xp - thresholds[100]) / 10000);
  }
  
  return level;
}

function calculateUnlockedThemes(level: number): string[] {
  const themes = ['Bronze'];
  if (level >= 10) themes.push('Silver');
  if (level >= 25) themes.push('Gold');
  if (level >= 50) themes.push('Platinum');
  if (level >= 75) themes.push('Diamond');
  if (level >= 100) themes.push('Legend');
  return themes;
}

function createEmptyGameStats(gameType: string): GameStats {
  return {
    gameType: gameType as any,
    gamesPlayed: 0,
    bestScore: 0,
    averageScore: 0,
    averageAccuracy: 0,
    averageTimeMs: 0,
    highestLevel: 0,
  } as GameStats;
}
