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
          
          // Transform backend data to PlayerProfile format
          const transformedProfile: PlayerProfile = {
            xp: backendProfile.memory.averageScore + backendProfile.attention.averageScore + backendProfile.reflex.averageScore,
            level: Math.floor(Math.sqrt((backendProfile.memory.averageScore + backendProfile.attention.averageScore + backendProfile.reflex.averageScore) / 100)) + 1,
            rankBadge: calculateRankBadge(Math.floor(Math.sqrt((backendProfile.memory.averageScore + backendProfile.attention.averageScore + backendProfile.reflex.averageScore) / 100)) + 1),
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
              word_flash: (backendProfile.word_flash || { gameType: 'word_flash' as const, gamesPlayed: 0, bestScore: 0, averageScore: 0, averageAccuracy: 0, averageTimeMs: 0, highestLevel: 0 }) as GameStats,
              shape_shadow: (backendProfile.shape_shadow || { gameType: 'shape_shadow' as const, gamesPlayed: 0, bestScore: 0, averageScore: 0, averageAccuracy: 0, averageTimeMs: 0, highestLevel: 0 }) as GameStats,
              sequence_builder: (backendProfile.sequence_builder || { gameType: 'sequence_builder' as const, gamesPlayed: 0, bestScore: 0, averageScore: 0, averageAccuracy: 0, averageTimeMs: 0, highestLevel: 0 }) as GameStats,
              focus_filter: (backendProfile.focus_filter || { gameType: 'focus_filter' as const, gamesPlayed: 0, bestScore: 0, averageScore: 0, averageAccuracy: 0, averageTimeMs: 0, highestLevel: 0 }) as GameStats,
              path_memory: (backendProfile.path_memory || { gameType: 'path_memory' as const, gamesPlayed: 0, bestScore: 0, averageScore: 0, averageAccuracy: 0, averageTimeMs: 0, highestLevel: 0 }) as GameStats,
              missing_number: (backendProfile.missing_number || { gameType: 'missing_number' as const, gamesPlayed: 0, bestScore: 0, averageScore: 0, averageAccuracy: 0, averageTimeMs: 0, highestLevel: 0 }) as GameStats,
              color_swap: (backendProfile.color_swap || { gameType: 'color_swap' as const, gamesPlayed: 0, bestScore: 0, averageScore: 0, averageAccuracy: 0, averageTimeMs: 0, highestLevel: 0 }) as GameStats,
              reverse_recall: (backendProfile.reverse_recall || { gameType: 'reverse_recall' as const, gamesPlayed: 0, bestScore: 0, averageScore: 0, averageAccuracy: 0, averageTimeMs: 0, highestLevel: 0 }) as GameStats,
              blink_count: (backendProfile.blink_count || { gameType: 'blink_count' as const, gamesPlayed: 0, bestScore: 0, averageScore: 0, averageAccuracy: 0, averageTimeMs: 0, highestLevel: 0 }) as GameStats,
              word_pair_match: (backendProfile.word_pair_match || { gameType: 'word_pair_match' as const, gamesPlayed: 0, bestScore: 0, averageScore: 0, averageAccuracy: 0, averageTimeMs: 0, highestLevel: 0 }) as GameStats,
            },
            achievements: [], // TODO: Calculate from backend data
            unlockedThemes: calculateUnlockedThemes(Math.floor(Math.sqrt((backendProfile.memory.averageScore + backendProfile.attention.averageScore + backendProfile.reflex.averageScore) / 100)) + 1),
            currentTheme: 'Rookie',
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

function calculateRankBadge(level: number): string {
  if (level >= 10) return 'Legend';
  if (level >= 7) return 'Elite';
  if (level >= 4) return 'Experienced';
  return 'Rookie';
}

function calculateUnlockedThemes(level: number): string[] {
  const themes = ['Rookie'];
  if (level >= 4) themes.push('Experienced');
  if (level >= 7) themes.push('Elite');
  if (level >= 10) themes.push('Hacker Mode');
  return themes;
}
