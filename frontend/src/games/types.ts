/**
 * Core types for brain-training games
 */

export type GameType = 
  | 'memory' 
  | 'attention' 
  | 'reflex'
  | 'word_flash'
  | 'shape_shadow'
  | 'sequence_builder'
  | 'focus_filter'
  | 'path_memory'
  | 'missing_number'
  | 'color_swap'
  | 'reverse_recall'
  | 'blink_count'
  | 'word_pair_match';

export interface GameScore {
  gameType: GameType;
  score: number;
  accuracy: number;
  timeMs: number;
  level: number;
  timestamp: number;
}

export interface GameStats {
  gameType: GameType;
  gamesPlayed: number;
  bestScore: number;
  averageScore: number;
  averageAccuracy: number;
  averageTimeMs: number;
  highestLevel: number;
  lastPlayed?: number;
  percentile?: number;
}

export interface PlayerProfile {
  // Basic info
  username?: string;
  avatarUrl?: string;
  joinDate: number;
  
  // XP & Leveling
  xp: number;
  level: number;
  rankBadge: string;
  
  // Engagement metrics
  totalGamesPlayed: number;
  totalSessions: number;
  currentStreak: number;
  longestStreak: number;
  averageDailyPlayTime: number;
  
  // Cognitive metrics
  cognitiveIndex: number;
  overallAccuracy: number;
  
  // Game-specific stats
  gameStats: Record<GameType, GameStats>;
  
  // Achievements & Themes
  achievements: Achievement[];
  unlockedThemes: string[];
  currentTheme: string;
  
  // Timestamps
  createdAt: number;
  lastActive: number;
  lastPlayDate?: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earnedAt?: number;
  progress?: number;
  isUnlocked: boolean;
}

export interface DailyTrend {
  date: string;
  gamesPlayed: number;
  averageScore: number;
  averageAccuracy: number;
  cognitiveIndex: number;
}

export interface ImprovementCurve {
  gameType: GameType;
  dataPoints: {
    week: string;
    averageScore: number;
    improvement: number;
  }[];
}

export interface MemoryGameState {
  cards: MemoryCard[];
  flippedIndices: number[];
  matchedIndices: number[];
  moves: number;
  startTime: number;
  level: number;
  isComplete: boolean;
}

export interface MemoryCard {
  id: number;
  symbol: string;
  isFlipped: boolean;
  isMatched: boolean;
}

export interface AttentionGameState {
  targets: AttentionTarget[];
  score: number;
  missed: number;
  startTime: number;
  level: number;
  isComplete: boolean;
  timeRemaining: number;
}

export interface AttentionTarget {
  id: number;
  x: number;
  y: number;
  isTarget: boolean;
  isClicked: boolean;
  appearTime: number;
}

export interface ReflexGameState {
  trials: ReflexTrial[];
  currentTrial: number;
  averageReactionMs: number;
  bestReactionMs: number;
  startTime: number;
  isComplete: boolean;
}

export interface ReflexTrial {
  trialNumber: number;
  delayMs: number;
  reactionMs?: number;
  isFalseStart: boolean;
  timestamp: number;
}

// Premium Features - Adaptive Difficulty
export interface AdaptiveDifficultyState {
  gameType: GameType;
  currentDifficulty: number;
  baseLevel: number;
  performanceHistory: PerformanceSnapshot[];
  lastAdjustment: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  adaptiveParams: {
    speedMultiplier: number;
    complexityLevel: number;
    timeWindow: number;
    distractorCount: number;
  };
}

export interface PerformanceSnapshot {
  timestamp: number;
  accuracy: number;
  reactionTimeMs?: number;
  score: number;
  level: number;
}

// Enhanced Game Score with detailed metrics
export interface EnhancedGameScore extends GameScore {
  enhancedMetrics?: {
    consistency?: number; // Standard deviation across trials
    anticipationRate?: number; // False starts / total trials
    fatigueIndex?: number; // Performance decay over time
    percentileRank?: number;
    improvement?: number; // vs previous session
    speedAccuracyTradeoff?: number;
    reactionTimeDistribution?: number[];
    firstHalfPerformance?: number;
    secondHalfPerformance?: number;
  };
}

// Cognitive Profile
export interface CognitiveProfile {
  userId: string;
  lastUpdated: number;
  gamesAnalyzed: number;
  
  // Core Indices (0-100 scale)
  processingSpeedIndex: number;
  memoryIndex: number;
  attentionIndex: number;
  consistencyScore: number;
  
  // Detailed breakdown
  indices: {
    visualMemory: number;
    verbalMemory: number;
    spatialMemory: number;
    selectiveAttention: number;
    sustainedAttention: number;
    reactionSpeed: number;
    decisionSpeed: number;
  };
  
  // Strengths and weaknesses
  topStrengths: string[];
  areasForImprovement: string[];
  
  // Time-of-day performance
  timeOfDayPerformance: {
    morning: number;   // 6am-12pm
    afternoon: number; // 12pm-6pm
    evening: number;   // 6pm-12am
    night: number;     // 12am-6am
  };
}

// Session Intelligence
export interface SessionMetrics {
  sessionId: string;
  startTime: number;
  endTime?: number;
  gamesPlayed: number;
  isWarmUp: boolean;
  fatigueDetected: boolean;
  performanceTrend: 'improving' | 'stable' | 'declining';
  averagePerformance: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
}

// Performance Insights
export interface PerformanceInsight {
  id: string;
  type: 'strength' | 'weakness' | 'recommendation' | 'achievement';
  category: 'speed' | 'memory' | 'attention' | 'consistency' | 'general';
  title: string;
  message: string;
  confidence: number; // 0-1
  actionable: boolean;
  suggestedGames?: GameType[];
  timestamp: number;
}

// Weekly Report
export interface WeeklyReport {
  weekStart: string; // ISO date
  weekEnd: string;
  totalGames: number;
  totalDaysPlayed: number;
  averageDailyGames: number;
  
  performance: {
    strongest: {
      area: string;
      score: number;
      percentile: number;
    };
    mostImproved: {
      area: string;
      improvement: number;
    };
    needsWork: {
      area: string;
      score: number;
    };
  };
  
  insights: PerformanceInsight[];
  streakInfo: {
    current: number;
    longest: number;
  };
}

// Percentile Data
export interface PercentileData {
  gameType: GameType;
  metric: 'score' | 'accuracy' | 'speed' | 'level';
  value: number;
  percentile: number;
  rank: number;
  totalUsers: number;
  ageGroup?: string;
  label: string; // e.g., "Faster than 82% of users"
}
