/**
 * Cognitive Profile Service
 * 
 * Builds and tracks comprehensive cognitive profiles based on game performance.
 * Generates insights into user strengths, weaknesses, and cognitive patterns.
 */

import { CognitiveProfile, GameScore } from '../games/types';

const STORAGE_KEY = 'blink_battle_cognitive_profile';
const MIN_GAMES_FOR_PROFILE = 10;

// Game type to cognitive domain mapping
const COGNITIVE_DOMAINS = {
  memory: ['visualMemory', 'spatialMemory'],
  word_flash: ['verbalMemory'],
  word_pair_match: ['verbalMemory'],
  reflex: ['reactionSpeed'],
  attention: ['selectiveAttention', 'sustainedAttention'],
  focus_filter: ['selectiveAttention'],
  shape_shadow: ['visualMemory', 'decisionSpeed'],
  sequence_builder: ['visualMemory', 'spatialMemory'],
  path_memory: ['spatialMemory'],
  missing_number: ['decisionSpeed'],
  color_swap: ['selectiveAttention', 'decisionSpeed'],
  reverse_recall: ['verbalMemory', 'spatialMemory'],
  blink_count: ['sustainedAttention'],
} as const;

class CognitiveProfileService {
  private profile: CognitiveProfile | null = null;
  private gameHistory: GameScore[] = [];

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Record a game score and update cognitive profile
   */
  recordGameScore(score: GameScore): void {
    this.gameHistory.push(score);

    // Keep last 100 games
    if (this.gameHistory.length > 100) {
      this.gameHistory = this.gameHistory.slice(-100);
    }

    // Update profile if we have enough data
    if (this.gameHistory.length >= MIN_GAMES_FOR_PROFILE) {
      this.updateProfile();
    }

    this.saveToStorage();
  }

  /**
   * Get current cognitive profile
   */
  getProfile(): CognitiveProfile | null {
    if (!this.profile || this.gameHistory.length < MIN_GAMES_FOR_PROFILE) {
      return null;
    }
    return { ...this.profile };
  }

  /**
   * Update cognitive profile based on game history
   */
  private updateProfile(): void {
    if (this.gameHistory.length < MIN_GAMES_FOR_PROFILE) {
      return;
    }

    const userId = localStorage.getItem('user_id') || 'local_user';

    // Calculate detailed indices
    const indices = this.calculateIndices();

    // Calculate core composite indices
    const processingSpeedIndex = this.calculateProcessingSpeedIndex(indices);
    const memoryIndex = this.calculateMemoryIndex(indices);
    const attentionIndex = this.calculateAttentionIndex(indices);
    const consistencyScore = this.calculateConsistencyScore();

    // Identify strengths and weaknesses
    const { topStrengths, areasForImprovement } = this.identifyStrengthsAndWeaknesses(indices);

    // Calculate time-of-day performance
    const timeOfDayPerformance = this.calculateTimeOfDayPerformance();

    this.profile = {
      userId,
      lastUpdated: Date.now(),
      gamesAnalyzed: this.gameHistory.length,
      processingSpeedIndex,
      memoryIndex,
      attentionIndex,
      consistencyScore,
      indices,
      topStrengths,
      areasForImprovement,
      timeOfDayPerformance,
    };
  }

  /**
   * Calculate individual cognitive indices
   */
  private calculateIndices() {
    const scores = {
      visualMemory: [] as number[],
      verbalMemory: [] as number[],
      spatialMemory: [] as number[],
      selectiveAttention: [] as number[],
      sustainedAttention: [] as number[],
      reactionSpeed: [] as number[],
      decisionSpeed: [] as number[],
    };

    // Map game scores to cognitive domains
    this.gameHistory.forEach((game) => {
      const domains = COGNITIVE_DOMAINS[game.gameType] || [];
      const normalizedScore = this.normalizeScore(game);

      domains.forEach((domain) => {
        if (domain in scores) {
          scores[domain as keyof typeof scores].push(normalizedScore);
        }
      });
    });

    // Calculate average for each domain
    return {
      visualMemory: this.average(scores.visualMemory) || 50,
      verbalMemory: this.average(scores.verbalMemory) || 50,
      spatialMemory: this.average(scores.spatialMemory) || 50,
      selectiveAttention: this.average(scores.selectiveAttention) || 50,
      sustainedAttention: this.average(scores.sustainedAttention) || 50,
      reactionSpeed: this.average(scores.reactionSpeed) || 50,
      decisionSpeed: this.average(scores.decisionSpeed) || 50,
    };
  }

  /**
   * Normalize game score to 0-100 scale
   */
  private normalizeScore(game: GameScore): number {
    // Combine accuracy, level, and performance into normalized score
    const accuracyScore = game.accuracy * 0.6; // 60% weight
    const levelScore = Math.min(game.level * 8, 40); // Up to 40 points for level
    
    return Math.min(100, accuracyScore + levelScore);
  }

  /**
   * Calculate processing speed index (reaction + decision speed)
   */
  private calculateProcessingSpeedIndex(indices: CognitiveProfile['indices']): number {
    return Math.round((indices.reactionSpeed + indices.decisionSpeed) / 2);
  }

  /**
   * Calculate memory index (visual + verbal + spatial)
   */
  private calculateMemoryIndex(indices: CognitiveProfile['indices']): number {
    return Math.round(
      (indices.visualMemory + indices.verbalMemory + indices.spatialMemory) / 3
    );
  }

  /**
   * Calculate attention index (selective + sustained)
   */
  private calculateAttentionIndex(indices: CognitiveProfile['indices']): number {
    return Math.round((indices.selectiveAttention + indices.sustainedAttention) / 2);
  }

  /**
   * Calculate consistency score (how stable performance is)
   */
  private calculateConsistencyScore(): number {
    if (this.gameHistory.length < 5) {
      return 50;
    }

    const recentGames = this.gameHistory.slice(-20);
    const accuracies = recentGames.map((g) => g.accuracy);
    
    const mean = this.average(accuracies) || 0;
    const variance = accuracies.reduce((sum, acc) => sum + Math.pow(acc - mean, 2), 0) / accuracies.length;
    const stdDev = Math.sqrt(variance);

    // Convert to 0-100 scale (lower std dev = higher consistency)
    // Assuming std dev range of 0-25 for accuracy percentage
    const consistencyScore = Math.max(0, 100 - (stdDev * 4));

    return Math.round(consistencyScore);
  }

  /**
   * Identify top strengths and areas for improvement
   */
  private identifyStrengthsAndWeaknesses(indices: CognitiveProfile['indices']): {
    topStrengths: string[];
    areasForImprovement: string[];
  } {
    const domainNames: Record<keyof typeof indices, string> = {
      visualMemory: 'Visual Memory',
      verbalMemory: 'Verbal Memory',
      spatialMemory: 'Spatial Memory',
      selectiveAttention: 'Selective Attention',
      sustainedAttention: 'Sustained Attention',
      reactionSpeed: 'Reaction Speed',
      decisionSpeed: 'Decision Speed',
    };

    const sortedDomains = Object.entries(indices)
      .sort(([, a], [, b]) => b - a);

    const topStrengths = sortedDomains
      .slice(0, 3)
      .filter(([, score]) => score >= 60)
      .map(([domain]) => domainNames[domain as keyof typeof indices]);

    const areasForImprovement = sortedDomains
      .slice(-3)
      .filter(([, score]) => score < 70)
      .reverse()
      .map(([domain]) => domainNames[domain as keyof typeof indices]);

    return { topStrengths, areasForImprovement };
  }

  /**
   * Calculate performance by time of day
   */
  private calculateTimeOfDayPerformance() {
    const timeSlots = {
      morning: [] as number[],
      afternoon: [] as number[],
      evening: [] as number[],
      night: [] as number[],
    };

    this.gameHistory.forEach((game) => {
      const hour = new Date(game.timestamp).getHours();
      const normalizedScore = this.normalizeScore(game);

      if (hour >= 6 && hour < 12) {
        timeSlots.morning.push(normalizedScore);
      } else if (hour >= 12 && hour < 18) {
        timeSlots.afternoon.push(normalizedScore);
      } else if (hour >= 18 && hour < 24) {
        timeSlots.evening.push(normalizedScore);
      } else {
        timeSlots.night.push(normalizedScore);
      }
    });

    return {
      morning: Math.round(this.average(timeSlots.morning) || 50),
      afternoon: Math.round(this.average(timeSlots.afternoon) || 50),
      evening: Math.round(this.average(timeSlots.evening) || 50),
      night: Math.round(this.average(timeSlots.night) || 50),
    };
  }

  /**
   * Get best time of day for playing
   */
  getBestTimeOfDay(): string {
    if (!this.profile) {
      return 'Not enough data';
    }

    const times = this.profile.timeOfDayPerformance;
    const entries = Object.entries(times);
    const best = entries.reduce((max, curr) => (curr[1] > max[1] ? curr : max));

    const improvement = best[1] - this.average(Object.values(times))!;

    if (improvement > 10) {
      return `You perform ${Math.round(improvement)}% better in the ${best[0]}`;
    }

    return 'Your performance is consistent throughout the day';
  }

  /**
   * Helper: Calculate average
   */
  private average(numbers: number[]): number | null {
    if (numbers.length === 0) return null;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  /**
   * Save to localStorage
   */
  private saveToStorage(): void {
    try {
      const data = {
        profile: this.profile,
        gameHistory: this.gameHistory,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save cognitive profile:', error);
    }
  }

  /**
   * Load from localStorage
   */
  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.profile = parsed.profile;
        this.gameHistory = parsed.gameHistory || [];
      }
    } catch (error) {
      console.error('Failed to load cognitive profile:', error);
    }
  }

  /**
   * Reset profile
   */
  reset(): void {
    this.profile = null;
    this.gameHistory = [];
    this.saveToStorage();
  }

  /**
   * Get minimum games needed
   */
  getMinimumGamesNeeded(): number {
    return MIN_GAMES_FOR_PROFILE;
  }

  /**
   * Get games until profile is ready
   */
  getGamesUntilProfile(): number {
    return Math.max(0, MIN_GAMES_FOR_PROFILE - this.gameHistory.length);
  }
}

// Export singleton instance
export const cognitiveProfileService = new CognitiveProfileService();
