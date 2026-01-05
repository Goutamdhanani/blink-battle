import axios from 'axios';

// Normalize API URL to ensure no trailing slash
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

export interface GameScore {
  gameType: string;
  score: number;
  accuracy: number;
  timeMs: number;
  level: number;
}

export interface GameStats {
  gameType: string;
  gamesPlayed: number;
  bestScore: number;
  averageScore: number;
  averageAccuracy: number;
  averageTimeMs: number;
  highestLevel: number;
  lastPlayed?: number;
}

export interface BrainTrainingProfile {
  totalGames: number;
  memory: GameStats;
  attention: GameStats;
  reflex: GameStats;
  word_flash?: GameStats;
  shape_shadow?: GameStats;
  sequence_builder?: GameStats;
  focus_filter?: GameStats;
  path_memory?: GameStats;
  missing_number?: GameStats;
  color_swap?: GameStats;
  reverse_recall?: GameStats;
  blink_count?: GameStats;
  word_pair_match?: GameStats;
}

export interface UserPercentile {
  percentile: number;
  performanceLabel: string;
  totalScore: number;
  avgAccuracy: number;
  totalUsers: number;
}

export interface Streaks {
  currentStreak: number;
  longestStreak: number;
  totalPlayDays: number;
}

export interface CognitiveComparison {
  userCognitiveIndex: number;
  globalAverage: number;
  top10Threshold: number;
}

class BrainTrainingService {
  /**
   * Save a game score to the backend
   */
  async saveGameScore(token: string, score: GameScore): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/api/games/score`,
        score,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      console.error('[BrainTrainingService] Error saving game score:', error);
      throw error;
    }
  }

  /**
   * Get user's brain training profile
   */
  async getProfile(token: string): Promise<BrainTrainingProfile> {
    try {
      const response = await axios.get(`${API_URL}/api/games/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data.profile;
    } catch (error) {
      console.error('[BrainTrainingService] Error fetching profile:', error);
      throw error;
    }
  }

  /**
   * Get stats for a specific game type
   */
  async getGameStats(token: string, gameType: string): Promise<GameStats> {
    try {
      const response = await axios.get(`${API_URL}/api/games/stats/${gameType}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data.stats;
    } catch (error) {
      console.error('[BrainTrainingService] Error fetching game stats:', error);
      throw error;
    }
  }

  /**
   * Get user's percentile ranking
   */
  async getUserPercentile(token: string): Promise<UserPercentile> {
    try {
      const response = await axios.get(`${API_URL}/api/stats/percentile`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    } catch (error) {
      console.error('[BrainTrainingService] Error fetching percentile:', error);
      throw error;
    }
  }

  /**
   * Get user's streak information
   */
  async getStreaks(token: string): Promise<Streaks> {
    try {
      const response = await axios.get(`${API_URL}/api/stats/streaks`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    } catch (error) {
      console.error('[BrainTrainingService] Error fetching streaks:', error);
      throw error;
    }
  }

  /**
   * Get cognitive comparison
   */
  async getCognitiveComparison(token: string): Promise<CognitiveComparison> {
    try {
      const response = await axios.get(`${API_URL}/api/stats/cognitive-comparison`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    } catch (error) {
      console.error('[BrainTrainingService] Error fetching cognitive comparison:', error);
      throw error;
    }
  }
}

export const brainTrainingService = new BrainTrainingService();
