/**
 * Percentile Service
 * 
 * Calculates user percentiles across various metrics.
 * Uses local benchmarks and can be enhanced with server-side data.
 */

import { GameType, PercentileData, GameScore } from '../games/types';

// Benchmark data - in production, this would come from server
const BENCHMARKS = {
  reflex: {
    score: { mean: 750, stdDev: 150 },
    accuracy: { mean: 85, stdDev: 10 },
    speed: { mean: 300, stdDev: 80 }, // milliseconds
  },
  memory: {
    score: { mean: 1200, stdDev: 300 },
    accuracy: { mean: 80, stdDev: 12 },
    level: { mean: 5, stdDev: 2 },
  },
  attention: {
    score: { mean: 850, stdDev: 200 },
    accuracy: { mean: 82, stdDev: 11 },
  },
  word_flash: {
    score: { mean: 900, stdDev: 200 },
    accuracy: { mean: 78, stdDev: 13 },
  },
  shape_shadow: {
    score: { mean: 800, stdDev: 180 },
    accuracy: { mean: 75, stdDev: 14 },
  },
  default: {
    score: { mean: 800, stdDev: 200 },
    accuracy: { mean: 80, stdDev: 12 },
  },
};

class PercentileService {
  /**
   * Calculate percentile for a game score
   */
  calculatePercentile(
    gameType: GameType,
    metric: 'score' | 'accuracy' | 'speed' | 'level',
    value: number
  ): PercentileData {
    const benchmark = this.getBenchmark(gameType, metric);
    const percentile = this.valueToPercentile(value, benchmark.mean, benchmark.stdDev);
    
    return {
      gameType,
      metric,
      value,
      percentile: Math.round(percentile),
      rank: this.percentileToRank(percentile),
      totalUsers: 10000, // Placeholder - would come from server
      label: this.generateLabel(percentile),
    };
  }

  /**
   * Calculate percentile for multiple metrics
   */
  calculateMultiplePercentiles(score: GameScore): PercentileData[] {
    const percentiles: PercentileData[] = [];

    // Score percentile
    percentiles.push(
      this.calculatePercentile(score.gameType, 'score', score.score)
    );

    // Accuracy percentile
    percentiles.push(
      this.calculatePercentile(score.gameType, 'accuracy', score.accuracy)
    );

    // Speed percentile (for games with timing component)
    if (score.timeMs && ['reflex', 'attention', 'word_flash'].includes(score.gameType)) {
      percentiles.push(
        this.calculatePercentile(score.gameType, 'speed', score.timeMs)
      );
    }

    // Level percentile
    if (score.level > 1) {
      percentiles.push(
        this.calculatePercentile(score.gameType, 'level', score.level)
      );
    }

    return percentiles;
  }

  /**
   * Get benchmark data for game and metric
   */
  private getBenchmark(
    gameType: GameType,
    metric: string
  ): { mean: number; stdDev: number } {
    const gameBenchmark = BENCHMARKS[gameType as keyof typeof BENCHMARKS] || BENCHMARKS.default;
    
    if (metric in gameBenchmark) {
      return gameBenchmark[metric as keyof typeof gameBenchmark];
    }

    return BENCHMARKS.default.score;
  }

  /**
   * Convert value to percentile using normal distribution
   */
  private valueToPercentile(value: number, mean: number, stdDev: number): number {
    // Calculate z-score
    const zScore = (value - mean) / stdDev;
    
    // Convert z-score to percentile using approximation
    const percentile = this.zScoreToPercentile(zScore);
    
    // Clamp to 0-100
    return Math.max(0, Math.min(100, percentile));
  }

  /**
   * Convert z-score to percentile (approximation)
   */
  private zScoreToPercentile(z: number): number {
    // Using error function approximation
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    
    return z > 0 ? (1 - p) * 100 : p * 100;
  }

  /**
   * Convert percentile to approximate rank
   */
  private percentileToRank(percentile: number): number {
    const totalUsers = 10000; // Placeholder
    return Math.round((100 - percentile) / 100 * totalUsers);
  }

  /**
   * Generate human-readable label
   */
  private generateLabel(percentile: number): string {
    const rounded = Math.round(percentile);

    if (rounded >= 95) {
      return `Top 5%! Better than ${rounded}% of users`;
    } else if (rounded >= 90) {
      return `Excellent! Better than ${rounded}% of users`;
    } else if (rounded >= 75) {
      return `Great! Better than ${rounded}% of users`;
    } else if (rounded >= 50) {
      return `Above average - better than ${rounded}% of users`;
    } else if (rounded >= 25) {
      return `Room to improve - better than ${rounded}% of users`;
    } else {
      return `Keep practicing - better than ${rounded}% of users`;
    }
  }

  /**
   * Get performance tier
   */
  getPerformanceTier(percentile: number): {
    tier: string;
    color: string;
    icon: string;
  } {
    if (percentile >= 95) {
      return { tier: 'Elite', color: '#FFD700', icon: '👑' };
    } else if (percentile >= 90) {
      return { tier: 'Expert', color: '#C0C0C0', icon: '⭐' };
    } else if (percentile >= 75) {
      return { tier: 'Advanced', color: '#CD7F32', icon: '🔥' };
    } else if (percentile >= 50) {
      return { tier: 'Intermediate', color: '#4A90E2', icon: '📈' };
    } else if (percentile >= 25) {
      return { tier: 'Developing', color: '#7ED321', icon: '🌱' };
    } else {
      return { tier: 'Beginner', color: '#9B9B9B', icon: '🎯' };
    }
  }

  /**
   * Compare with age group (placeholder - would use real age data)
   */
  calculateAgeGroupPercentile(
    gameType: GameType,
    metric: string,
    value: number,
    ageGroup: string
  ): PercentileData {
    // For now, just use general percentile
    // In production, this would use age-specific benchmarks
    const percentileData = this.calculatePercentile(
      gameType,
      metric as 'score' | 'accuracy' | 'speed' | 'level',
      value
    );

    percentileData.ageGroup = ageGroup;
    return percentileData;
  }

  /**
   * Get overall cognitive percentile
   */
  calculateOverallPercentile(scores: GameScore[]): number {
    if (scores.length === 0) {
      return 50;
    }

    // Calculate average percentile across all games
    const percentiles = scores.map(score => {
      const data = this.calculatePercentile(score.gameType, 'score', score.score);
      return data.percentile;
    });

    const avgPercentile = percentiles.reduce((sum, p) => sum + p, 0) / percentiles.length;
    return Math.round(avgPercentile);
  }

  /**
   * Generate percentile insights
   */
  generatePercentileInsight(percentile: number): string {
    if (percentile >= 95) {
      return 'You\'re in the top 5%! Your performance is exceptional.';
    } else if (percentile >= 90) {
      return 'Excellent work! You\'re performing better than 90% of users.';
    } else if (percentile >= 75) {
      return 'Great job! You\'re in the top quarter of all players.';
    } else if (percentile >= 60) {
      return 'You\'re above average! Keep up the good work.';
    } else if (percentile >= 40) {
      return 'You\'re in the middle range. Consistent practice will help you improve.';
    } else {
      return 'You have room to grow! Regular practice will boost your performance.';
    }
  }
}

// Export singleton instance
export const percentileService = new PercentileService();
