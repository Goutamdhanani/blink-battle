/**
 * Adaptive Difficulty Service
 * 
 * Manages dynamic difficulty adjustment across all brain training games.
 * Uses performance history to calibrate challenge level for optimal engagement.
 */

import { GameType, AdaptiveDifficultyState, PerformanceSnapshot } from '../games/types';

const STORAGE_KEY = 'blink_battle_adaptive_difficulty';

// Difficulty adjustment thresholds
const DIFFICULTY_CONFIG = {
  SUCCESS_THRESHOLD: 0.85, // 85% accuracy to increase difficulty
  FAILURE_THRESHOLD: 0.65, // Below 65% accuracy to decrease difficulty
  CONSECUTIVE_FOR_ADJUSTMENT: 3,
  MAX_DIFFICULTY: 10,
  MIN_DIFFICULTY: 1,
  ADJUSTMENT_COOLDOWN_MS: 60000, // 1 minute between adjustments
};

class AdaptiveDifficultyService {
  private difficultyStates: Map<GameType, AdaptiveDifficultyState> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Initialize or get adaptive difficulty state for a game
   */
  getDifficultyState(gameType: GameType): AdaptiveDifficultyState {
    if (!this.difficultyStates.has(gameType)) {
      const initialState: AdaptiveDifficultyState = {
        gameType,
        currentDifficulty: 3, // Start at moderate difficulty
        baseLevel: 1,
        performanceHistory: [],
        lastAdjustment: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        adaptiveParams: {
          speedMultiplier: 1.0,
          complexityLevel: 1,
          timeWindow: 3000,
          distractorCount: 0,
        },
      };
      this.difficultyStates.set(gameType, initialState);
      this.saveToStorage();
    }
    return this.difficultyStates.get(gameType)!;
  }

  /**
   * Record performance and adjust difficulty
   */
  recordPerformance(
    gameType: GameType,
    accuracy: number,
    score: number,
    level: number,
    reactionTimeMs?: number
  ): AdaptiveDifficultyState {
    const state = this.getDifficultyState(gameType);

    // Add performance snapshot
    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      accuracy,
      score,
      level,
      reactionTimeMs,
    };

    state.performanceHistory.push(snapshot);

    // Keep only last 20 performances
    if (state.performanceHistory.length > 20) {
      state.performanceHistory = state.performanceHistory.slice(-20);
    }

    // Update consecutive counters
    if (accuracy >= DIFFICULTY_CONFIG.SUCCESS_THRESHOLD) {
      state.consecutiveSuccesses++;
      state.consecutiveFailures = 0;
    } else if (accuracy < DIFFICULTY_CONFIG.FAILURE_THRESHOLD) {
      state.consecutiveFailures++;
      state.consecutiveSuccesses = 0;
    } else {
      // Performance in middle range - reset counters
      state.consecutiveSuccesses = 0;
      state.consecutiveFailures = 0;
    }

    // Adjust difficulty if needed
    this.adjustDifficulty(state);

    this.difficultyStates.set(gameType, state);
    this.saveToStorage();

    return state;
  }

  /**
   * Adjust difficulty based on performance
   */
  private adjustDifficulty(state: AdaptiveDifficultyState): void {
    const now = Date.now();
    const timeSinceLastAdjustment = now - state.lastAdjustment;

    // Check cooldown
    if (timeSinceLastAdjustment < DIFFICULTY_CONFIG.ADJUSTMENT_COOLDOWN_MS) {
      return;
    }

    // Increase difficulty if consistently successful
    if (state.consecutiveSuccesses >= DIFFICULTY_CONFIG.CONSECUTIVE_FOR_ADJUSTMENT) {
      if (state.currentDifficulty < DIFFICULTY_CONFIG.MAX_DIFFICULTY) {
        state.currentDifficulty++;
        state.lastAdjustment = now;
        state.consecutiveSuccesses = 0;
        this.updateAdaptiveParams(state);
      }
    }

    // Decrease difficulty if consistently failing
    if (state.consecutiveFailures >= DIFFICULTY_CONFIG.CONSECUTIVE_FOR_ADJUSTMENT) {
      if (state.currentDifficulty > DIFFICULTY_CONFIG.MIN_DIFFICULTY) {
        state.currentDifficulty--;
        state.lastAdjustment = now;
        state.consecutiveFailures = 0;
        this.updateAdaptiveParams(state);
      }
    }
  }

  /**
   * Update adaptive parameters based on difficulty level
   */
  private updateAdaptiveParams(state: AdaptiveDifficultyState): void {
    const difficulty = state.currentDifficulty;

    // Game-specific parameter adjustments
    switch (state.gameType) {
      case 'reflex':
        // Reflex game: tighten timing windows, reduce delays
        state.adaptiveParams.timeWindow = Math.max(1500, 4000 - difficulty * 250);
        state.adaptiveParams.speedMultiplier = 1 + (difficulty * 0.1);
        break;

      case 'memory':
        // Memory game: increase complexity, reduce time
        state.adaptiveParams.complexityLevel = Math.min(8, 4 + difficulty);
        state.adaptiveParams.timeWindow = Math.max(2000, 5000 - difficulty * 300);
        break;

      case 'attention':
        // Attention game: more distractors, faster spawns
        state.adaptiveParams.speedMultiplier = 1 + (difficulty * 0.15);
        state.adaptiveParams.distractorCount = Math.floor(difficulty * 0.4);
        break;

      case 'word_flash':
        // Word flash: longer words, shorter display time
        state.adaptiveParams.complexityLevel = Math.min(10, 4 + difficulty);
        state.adaptiveParams.timeWindow = Math.max(1000, 3000 - difficulty * 200);
        break;

      case 'shape_shadow':
        // Shape shadow: more complex shapes, less time
        state.adaptiveParams.complexityLevel = Math.min(5, 1 + Math.floor(difficulty / 2));
        state.adaptiveParams.timeWindow = Math.max(3000, 8000 - difficulty * 500);
        break;

      default:
        // Generic difficulty scaling
        state.adaptiveParams.speedMultiplier = 1 + (difficulty * 0.1);
        state.adaptiveParams.complexityLevel = Math.min(10, difficulty);
        state.adaptiveParams.timeWindow = Math.max(2000, 5000 - difficulty * 300);
        state.adaptiveParams.distractorCount = Math.floor(difficulty * 0.3);
    }
  }

  /**
   * Get recommended starting level for a game
   */
  getRecommendedLevel(gameType: GameType): number {
    const state = this.getDifficultyState(gameType);
    
    if (state.performanceHistory.length < 3) {
      return 1; // Start at level 1 for new players
    }

    // Use difficulty level as base, adjust based on recent performance
    const recentPerformance = state.performanceHistory.slice(-5);
    const avgAccuracy = recentPerformance.reduce((sum, p) => sum + p.accuracy, 0) / recentPerformance.length;

    if (avgAccuracy > 0.9) {
      return Math.min(state.currentDifficulty + 1, DIFFICULTY_CONFIG.MAX_DIFFICULTY);
    } else if (avgAccuracy < 0.7) {
      return Math.max(state.currentDifficulty - 1, DIFFICULTY_CONFIG.MIN_DIFFICULTY);
    }

    return state.currentDifficulty;
  }

  /**
   * Calculate performance trend
   */
  getPerformanceTrend(gameType: GameType): 'improving' | 'stable' | 'declining' {
    const state = this.getDifficultyState(gameType);
    
    if (state.performanceHistory.length < 5) {
      return 'stable';
    }

    const recent = state.performanceHistory.slice(-5);
    const older = state.performanceHistory.slice(-10, -5);

    if (older.length < 5) {
      return 'stable';
    }

    const recentAvg = recent.reduce((sum, p) => sum + p.accuracy, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p.accuracy, 0) / older.length;

    const diff = recentAvg - olderAvg;

    if (diff > 0.05) return 'improving';
    if (diff < -0.05) return 'declining';
    return 'stable';
  }

  /**
   * Reset difficulty for a specific game
   */
  resetDifficulty(gameType: GameType): void {
    this.difficultyStates.delete(gameType);
    this.saveToStorage();
  }

  /**
   * Save states to localStorage
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.difficultyStates.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save adaptive difficulty state:', error);
    }
  }

  /**
   * Load states from localStorage
   */
  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const entries = JSON.parse(data) as [GameType, AdaptiveDifficultyState][];
        this.difficultyStates = new Map(entries);
      }
    } catch (error) {
      console.error('Failed to load adaptive difficulty state:', error);
    }
  }

  /**
   * Get all difficulty states for analytics
   */
  getAllStates(): Map<GameType, AdaptiveDifficultyState> {
    return new Map(this.difficultyStates);
  }
}

// Export singleton instance
export const adaptiveDifficultyService = new AdaptiveDifficultyService();
