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
