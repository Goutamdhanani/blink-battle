/**
 * Core types for brain-training games
 */

export interface GameScore {
  gameType: 'memory' | 'attention' | 'reflex';
  score: number;
  accuracy: number;
  timeMs: number;
  level: number;
  timestamp: number;
}

export interface GameStats {
  gameType: 'memory' | 'attention' | 'reflex';
  gamesPlayed: number;
  bestScore: number;
  averageScore: number;
  averageAccuracy: number;
  averageTimeMs: number;
  highestLevel: number;
  lastPlayed?: number;
}

export interface PlayerProfile {
  totalGamesPlayed: number;
  memoryStats: GameStats;
  attentionStats: GameStats;
  reflexStats: GameStats;
  achievements: string[];
  createdAt: number;
  lastActive: number;
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
