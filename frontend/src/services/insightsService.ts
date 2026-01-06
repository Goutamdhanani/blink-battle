/**
 * Insights Service
 * 
 * Generates personalized insights and recommendations based on cognitive profile
 * and performance patterns.
 */

import { PerformanceInsight, CognitiveProfile, GameType } from '../games/types';
import { cognitiveProfileService } from './cognitiveProfileService';
import { adaptiveDifficultyService } from './adaptiveDifficultyService';

class InsightsService {
  /**
   * Generate insights for current user
   */
  generateInsights(): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];
    const profile = cognitiveProfileService.getProfile();

    if (!profile) {
      return this.getBeginnerInsights();
    }

    // Analyze strengths
    insights.push(...this.analyzeStrengths(profile));

    // Analyze weaknesses
    insights.push(...this.analyzeWeaknesses(profile));

    // Time of day recommendations
    insights.push(...this.getTimeOfDayInsights(profile));

    // Performance trends
    insights.push(...this.getPerformanceTrends());

    // Consistency insights
    insights.push(...this.getConsistencyInsights(profile));

    // Sort by confidence and limit to top 5
    return insights
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  /**
   * Get insights for beginners (less than 10 games)
   */
  private getBeginnerInsights(): PerformanceInsight[] {
    const gamesLeft = cognitiveProfileService.getGamesUntilProfile();
    
    return [
      {
        id: 'beginner_welcome',
        type: 'recommendation',
        category: 'general',
        title: 'Welcome to Brain Training!',
        message: `Play ${gamesLeft} more games to unlock your personalized cognitive profile and detailed insights.`,
        confidence: 1.0,
        actionable: true,
        timestamp: Date.now(),
      },
      {
        id: 'beginner_variety',
        type: 'recommendation',
        category: 'general',
        title: 'Try Different Games',
        message: 'Playing a variety of games helps us understand your cognitive strengths better.',
        confidence: 0.9,
        actionable: true,
        timestamp: Date.now(),
      },
    ];
  }

  /**
   * Analyze strengths and generate positive insights
   */
  private analyzeStrengths(profile: CognitiveProfile): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    if (profile.topStrengths.length > 0) {
      const topStrength = profile.topStrengths[0];
      insights.push({
        id: 'strength_' + topStrength.toLowerCase().replace(/\s+/g, '_'),
        type: 'strength',
        category: this.mapDomainToCategory(topStrength),
        title: `Strong ${topStrength}`,
        message: `Your ${topStrength.toLowerCase()} is excellent! This is a core cognitive strength.`,
        confidence: 0.85,
        actionable: false,
        timestamp: Date.now(),
      });
    }

    // Memory insights
    if (profile.memoryIndex >= 75) {
      insights.push({
        id: 'memory_strength',
        type: 'strength',
        category: 'memory',
        title: 'Exceptional Memory',
        message: `Your memory index is ${profile.memoryIndex}/100. You excel at retaining and recalling information.`,
        confidence: 0.9,
        actionable: false,
        timestamp: Date.now(),
      });
    }

    // Processing speed insights
    if (profile.processingSpeedIndex >= 75) {
      insights.push({
        id: 'speed_strength',
        type: 'strength',
        category: 'speed',
        title: 'Lightning Fast',
        message: `Your processing speed is ${profile.processingSpeedIndex}/100. You make quick, accurate decisions.`,
        confidence: 0.9,
        actionable: false,
        timestamp: Date.now(),
      });
    }

    // Attention insights
    if (profile.attentionIndex >= 75) {
      insights.push({
        id: 'attention_strength',
        type: 'strength',
        category: 'attention',
        title: 'Laser Focus',
        message: `Your attention index is ${profile.attentionIndex}/100. You maintain excellent concentration.`,
        confidence: 0.9,
        actionable: false,
        timestamp: Date.now(),
      });
    }

    return insights;
  }

  /**
   * Analyze weaknesses and provide recommendations
   */
  private analyzeWeaknesses(profile: CognitiveProfile): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    if (profile.areasForImprovement.length > 0) {
      const primaryWeakness = profile.areasForImprovement[0];
      const suggestedGames = this.getRecommendedGamesForDomain(primaryWeakness);

      insights.push({
        id: 'improvement_' + primaryWeakness.toLowerCase().replace(/\s+/g, '_'),
        type: 'recommendation',
        category: this.mapDomainToCategory(primaryWeakness),
        title: `Improve ${primaryWeakness}`,
        message: `Focus on ${primaryWeakness.toLowerCase()} to build a well-rounded cognitive profile.`,
        confidence: 0.85,
        actionable: true,
        suggestedGames,
        timestamp: Date.now(),
      });
    }

    // Memory-specific recommendations
    if (profile.memoryIndex < 60) {
      insights.push({
        id: 'memory_improvement',
        type: 'recommendation',
        category: 'memory',
        title: 'Strengthen Memory',
        message: 'Try memory-focused games to improve recall and retention.',
        confidence: 0.8,
        actionable: true,
        suggestedGames: ['memory', 'word_flash', 'sequence_builder'],
        timestamp: Date.now(),
      });
    }

    // Speed-specific recommendations
    if (profile.processingSpeedIndex < 60) {
      insights.push({
        id: 'speed_improvement',
        type: 'recommendation',
        category: 'speed',
        title: 'Boost Processing Speed',
        message: 'Practice timed challenges to improve your reaction and decision speed.',
        confidence: 0.8,
        actionable: true,
        suggestedGames: ['reflex', 'color_swap', 'missing_number'],
        timestamp: Date.now(),
      });
    }

    // Attention-specific recommendations
    if (profile.attentionIndex < 60) {
      insights.push({
        id: 'attention_improvement',
        type: 'recommendation',
        category: 'attention',
        title: 'Enhance Focus',
        message: 'Work on attention games to build concentration and reduce distractions.',
        confidence: 0.8,
        actionable: true,
        suggestedGames: ['attention', 'focus_filter', 'blink_count'],
        timestamp: Date.now(),
      });
    }

    return insights;
  }

  /**
   * Get time of day insights
   */
  private getTimeOfDayInsights(profile: CognitiveProfile): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];
    const bestTime = cognitiveProfileService.getBestTimeOfDay();

    if (bestTime !== 'Your performance is consistent throughout the day') {
      insights.push({
        id: 'time_of_day',
        type: 'recommendation',
        category: 'general',
        title: 'Optimal Play Time',
        message: bestTime,
        confidence: 0.75,
        actionable: true,
        timestamp: Date.now(),
      });
    }

    return insights;
  }

  /**
   * Get performance trend insights
   */
  private getPerformanceTrends(): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    // Check trends for each game type
    const gameTypes: GameType[] = ['reflex', 'memory', 'attention'];
    
    gameTypes.forEach((gameType) => {
      const trend = adaptiveDifficultyService.getPerformanceTrend(gameType);
      
      if (trend === 'improving') {
        insights.push({
          id: `trend_${gameType}_improving`,
          type: 'achievement',
          category: this.mapGameTypeToCategory(gameType),
          title: `${this.formatGameType(gameType)} Improving!`,
          message: `Your ${this.formatGameType(gameType).toLowerCase()} performance is trending upward. Keep it up!`,
          confidence: 0.8,
          actionable: false,
          timestamp: Date.now(),
        });
      } else if (trend === 'declining') {
        insights.push({
          id: `trend_${gameType}_declining`,
          type: 'weakness',
          category: this.mapGameTypeToCategory(gameType),
          title: `${this.formatGameType(gameType)} Needs Attention`,
          message: `Your ${this.formatGameType(gameType).toLowerCase()} performance has dipped. Consider taking a break or adjusting difficulty.`,
          confidence: 0.7,
          actionable: true,
          suggestedGames: [gameType],
          timestamp: Date.now(),
        });
      }
    });

    return insights;
  }

  /**
   * Get consistency insights
   */
  private getConsistencyInsights(profile: CognitiveProfile): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    if (profile.consistencyScore >= 80) {
      insights.push({
        id: 'consistency_high',
        type: 'strength',
        category: 'consistency',
        title: 'Remarkably Consistent',
        message: `Your consistency score is ${profile.consistencyScore}/100. Your performance is reliably strong.`,
        confidence: 0.85,
        actionable: false,
        timestamp: Date.now(),
      });
    } else if (profile.consistencyScore < 50) {
      insights.push({
        id: 'consistency_low',
        type: 'recommendation',
        category: 'consistency',
        title: 'Improve Consistency',
        message: 'Your performance varies significantly. Try playing at the same time each day to build consistency.',
        confidence: 0.7,
        actionable: true,
        timestamp: Date.now(),
      });
    }

    return insights;
  }

  /**
   * Map cognitive domain to category
   */
  private mapDomainToCategory(domain: string): PerformanceInsight['category'] {
    const lowerDomain = domain.toLowerCase();
    
    if (lowerDomain.includes('memory')) return 'memory';
    if (lowerDomain.includes('attention') || lowerDomain.includes('focus')) return 'attention';
    if (lowerDomain.includes('speed') || lowerDomain.includes('reaction')) return 'speed';
    if (lowerDomain.includes('consistency')) return 'consistency';
    
    return 'general';
  }

  /**
   * Map game type to category
   */
  private mapGameTypeToCategory(gameType: GameType): PerformanceInsight['category'] {
    if (gameType === 'reflex') return 'speed';
    if (gameType === 'memory' || gameType.includes('word')) return 'memory';
    if (gameType === 'attention' || gameType.includes('focus')) return 'attention';
    return 'general';
  }

  /**
   * Format game type for display
   */
  private formatGameType(gameType: GameType): string {
    const names: Record<GameType, string> = {
      reflex: 'Reflex Rush',
      memory: 'Memory Match',
      attention: 'Focus Test',
      word_flash: 'Word Flash',
      shape_shadow: 'Shape Shadow',
      sequence_builder: 'Sequence Builder',
      focus_filter: 'Focus Filter',
      path_memory: 'Path Memory',
      missing_number: 'Missing Number',
      color_swap: 'Color Swap',
      reverse_recall: 'Reverse Recall',
      blink_count: 'Blink Count',
      word_pair_match: 'Word Pair Match',
    };
    return names[gameType] || gameType;
  }

  /**
   * Get recommended games for improving a specific cognitive domain
   */
  private getRecommendedGamesForDomain(domain: string): GameType[] {
    const lowerDomain = domain.toLowerCase();

    if (lowerDomain.includes('visual memory')) {
      return ['memory', 'shape_shadow', 'sequence_builder'];
    }
    if (lowerDomain.includes('verbal memory')) {
      return ['word_flash', 'word_pair_match', 'reverse_recall'];
    }
    if (lowerDomain.includes('spatial memory')) {
      return ['path_memory', 'sequence_builder'];
    }
    if (lowerDomain.includes('selective attention')) {
      return ['attention', 'focus_filter', 'color_swap'];
    }
    if (lowerDomain.includes('sustained attention')) {
      return ['attention', 'blink_count'];
    }
    if (lowerDomain.includes('reaction')) {
      return ['reflex', 'color_swap'];
    }
    if (lowerDomain.includes('decision')) {
      return ['missing_number', 'shape_shadow'];
    }

    return ['memory', 'attention', 'reflex'];
  }
}

// Export singleton instance
export const insightsService = new InsightsService();
