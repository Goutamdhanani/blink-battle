/**
 * IndexedDB wrapper for offline game data storage
 */

import { GameScore, PlayerProfile, GameStats, GameType, Achievement } from '../games/types';

const DB_NAME = 'BlinkBattleBrainTraining';
const DB_VERSION = 1;
const SCORES_STORE = 'gameScores';
const PROFILE_STORE = 'playerProfile';

// Realistic XP and leveling constants based on real-world progression
const LEVEL_THRESHOLDS: { [key: number]: number } = {
  1: 0,
  2: 100,
  3: 250,
  4: 500,
  5: 1000,
  6: 1500,
  7: 2250,
  8: 3000,
  9: 4000,
  10: 5000,
  15: 12500,
  20: 25000,
  30: 62500,
  40: 100000,
  50: 150000,
  75: 300000,
  100: 500000,
};

// Rank thresholds based on total XP (realistic progression)
const RANK_THRESHOLDS = [
  { minXP: 500000, rank: 'Legend' },      // Top 1% - 10,000+ games
  { minXP: 150000, rank: 'Master' },      // Top 5% - 4,000+ games
  { minXP: 50000, rank: 'Diamond' },      // Skilled - 1,500+ games
  { minXP: 15000, rank: 'Platinum' },     // Dedicated - 500+ games
  { minXP: 5000, rank: 'Gold' },          // Regular - 200+ games
  { minXP: 1000, rank: 'Silver' },        // Casual - 50+ games
  { minXP: 0, rank: 'Bronze' },           // New players
];

// Reaction time constants (in milliseconds) - exported for use in games
export const MIN_VALID_REACTION_TIME = 80;      // Below this is likely cheating
export const AVG_REACTION_TIME = 225;           // Average human reaction
export const GOOD_REACTION_TIME = 175;          // Good reaction
export const EXCELLENT_REACTION_TIME = 125;     // Excellent reaction
export const PROFESSIONAL_REACTION_TIME = 100;  // Professional level

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
export async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create scores store
      if (!db.objectStoreNames.contains(SCORES_STORE)) {
        const scoresStore = db.createObjectStore(SCORES_STORE, { 
          keyPath: 'timestamp',
          autoIncrement: false 
        });
        scoresStore.createIndex('gameType', 'gameType', { unique: false });
        scoresStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Create profile store
      if (!db.objectStoreNames.contains(PROFILE_STORE)) {
        db.createObjectStore(PROFILE_STORE, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Calculate level from total XP using exponential thresholds
 */
function calculateLevelFromXP(xp: number): number {
  let level = 1;
  
  // Find the highest level the player has reached
  const sortedLevels = Object.keys(LEVEL_THRESHOLDS)
    .map(Number)
    .sort((a, b) => b - a); // Sort descending
  
  for (const lvl of sortedLevels) {
    if (xp >= LEVEL_THRESHOLDS[lvl]) {
      level = lvl;
      break;
    }
  }
  
  // For levels beyond our threshold table, use exponential formula
  if (xp >= LEVEL_THRESHOLDS[100]) {
    // Each level beyond 100 requires 10,000 more XP
    level = 100 + Math.floor((xp - LEVEL_THRESHOLDS[100]) / 10000);
  }
  
  return level;
}

/**
 * Calculate rank badge from total XP
 */
function calculateRankFromXP(xp: number): string {
  for (const { minXP, rank } of RANK_THRESHOLDS) {
    if (xp >= minXP) {
      return rank;
    }
  }
  return 'Bronze';
}

/**
 * Calculate XP earned for a game based on performance
 * - Base XP varies by accuracy and level
 * - Bonus for high accuracy (90%+)
 * - Minimum XP ensures progress even on poor performance
 */
function calculateGameXP(score: number, accuracy: number, level: number): number {
  // Base XP: 25-50 for good performance (70%+ accuracy)
  // Lower XP: 5-15 for poor performance
  let xp = 0;
  
  if (accuracy >= 90) {
    xp = 45 + Math.floor(Math.random() * 6); // 45-50 XP
  } else if (accuracy >= 70) {
    xp = 25 + Math.floor(Math.random() * 11); // 25-35 XP
  } else if (accuracy >= 50) {
    xp = 15 + Math.floor(Math.random() * 11); // 15-25 XP
  } else {
    xp = 5 + Math.floor(Math.random() * 11); // 5-15 XP (participation)
  }
  
  // Small level bonus (max +10 XP at high levels)
  const levelBonus = Math.min(10, Math.floor(level / 10));
  xp += levelBonus;
  
  return xp;
}

/**
 * Validate reaction time to prevent cheating
 * Exported for use in reflex games
 */
export function isValidReactionTime(reactionMs: number): boolean {
  return reactionMs >= MIN_VALID_REACTION_TIME && reactionMs < 10000;
}

/**
 * Save game score to IndexedDB
 */
export async function saveGameScore(score: GameScore): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SCORES_STORE], 'readwrite');
    const store = transaction.objectStore(SCORES_STORE);
    const request = store.add(score);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save game score to both IndexedDB and backend (if authenticated)
 * This is the recommended function to use in games
 */
export async function saveGameScoreWithSync(score: GameScore): Promise<void> {
  // Always save to IndexedDB first (offline support)
  await saveGameScore(score);
  
  // Try to sync to backend if authenticated
  try {
    const token = localStorage.getItem('token');
    if (token) {
      const { brainTrainingService } = await import('../services/brainTrainingService');
      // Backend generates its own timestamp, so we don't send the local one
      await brainTrainingService.saveGameScore(token, {
        gameType: score.gameType,
        score: score.score,
        accuracy: score.accuracy,
        timeMs: score.timeMs,
        level: score.level,
      });
      console.log('[IndexedDB] Game score synced to backend');
    }
  } catch (error) {
    // Don't fail if backend sync fails - IndexedDB save was successful
    console.warn('[IndexedDB] Failed to sync score to backend (offline or error):', error);
  }
}

/**
 * Get all scores for a specific game type
 */
export async function getGameScores(gameType: string): Promise<GameScore[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SCORES_STORE], 'readonly');
    const store = transaction.objectStore(SCORES_STORE);
    const index = store.index('gameType');
    const request = index.getAll(gameType);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all scores
 */
export async function getAllScores(): Promise<GameScore[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SCORES_STORE], 'readonly');
    const store = transaction.objectStore(SCORES_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Calculate stats for a game type
 */
export async function calculateGameStats(gameType: GameType): Promise<GameStats> {
  const scores = await getGameScores(gameType);
  
  if (scores.length === 0) {
    return {
      gameType,
      gamesPlayed: 0,
      bestScore: 0,
      averageScore: 0,
      averageAccuracy: 0,
      averageTimeMs: 0,
      highestLevel: 0,
    };
  }

  const bestScore = Math.max(...scores.map(s => s.score));
  const averageScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  const averageAccuracy = scores.reduce((sum, s) => sum + s.accuracy, 0) / scores.length;
  const averageTimeMs = scores.reduce((sum, s) => sum + s.timeMs, 0) / scores.length;
  const highestLevel = Math.max(...scores.map(s => s.level));
  const lastPlayed = Math.max(...scores.map(s => s.timestamp));

  return {
    gameType,
    gamesPlayed: scores.length,
    bestScore,
    averageScore: Math.round(averageScore),
    averageAccuracy: Math.round(averageAccuracy),
    averageTimeMs: Math.round(averageTimeMs),
    highestLevel,
    lastPlayed,
  };
}

/**
 * Get player profile with all stats
 */
export async function getPlayerProfile(): Promise<PlayerProfile> {
  const allScores = await getAllScores();
  const totalGamesPlayed = allScores.length;
  
  // Calculate stats for all game types
  const gameTypes: GameType[] = [
    'memory', 'attention', 'reflex',
    'word_flash', 'shape_shadow', 'sequence_builder',
    'focus_filter', 'path_memory', 'missing_number',
    'color_swap', 'reverse_recall', 'blink_count', 'word_pair_match'
  ];
  
  const gameStats: Record<GameType, GameStats> = {} as Record<GameType, GameStats>;
  for (const gameType of gameTypes) {
    gameStats[gameType] = await calculateGameStats(gameType);
  }
  
  const lastActive = allScores.length > 0 ? Math.max(...allScores.map(s => s.timestamp)) : Date.now();
  
  // Calculate XP using realistic progression system
  // Each game awards XP based on performance (5-50 XP per game)
  let totalXP = 0;
  for (const gameScore of allScores) {
    const gameXP = calculateGameXP(gameScore.score, gameScore.accuracy, gameScore.level);
    totalXP += gameXP;
  }
  
  // Calculate level from XP using exponential curve
  const level = calculateLevelFromXP(totalXP);
  
  // Calculate rank badge from total XP (not level)
  const rankBadge = calculateRankFromXP(totalXP);
  
  // Calculate cognitive index (0-100 scale)
  const avgAccuracy = allScores.length > 0 
    ? allScores.reduce((sum, s) => sum + s.accuracy, 0) / allScores.length 
    : 0;
  const cognitiveIndex = Math.round(avgAccuracy);
  
  // Generate achievements
  const achievements = calculateAchievements(gameStats, totalGamesPlayed, cognitiveIndex);
  
  return {
    xp: totalXP,
    level,
    rankBadge,
    totalGamesPlayed,
    totalSessions: totalGamesPlayed, // Simplified: each game is a session
    currentStreak: 0, // TODO: Implement streak calculation
    longestStreak: 0,
    averageDailyPlayTime: 0,
    cognitiveIndex,
    overallAccuracy: Math.round(avgAccuracy),
    gameStats,
    achievements,
    unlockedThemes: getUnlockedThemes(level),
    currentTheme: 'Bronze',
    createdAt: Date.now(),
    lastActive,
    joinDate: Date.now(),
  };
}

/**
 * Get unlocked themes based on level (realistic progression)
 */
function getUnlockedThemes(level: number): string[] {
  const themes = ['Bronze'];
  if (level >= 10) themes.push('Silver');
  if (level >= 25) themes.push('Gold');
  if (level >= 50) themes.push('Platinum');
  if (level >= 75) themes.push('Diamond');
  if (level >= 100) themes.push('Legend');
  return themes;
}

/**
 * Calculate achievements based on stats
 */
function calculateAchievements(
  gameStats: Record<GameType, GameStats>,
  totalGames: number,
  cognitiveIndex: number
): Achievement[] {
  const achievements: Achievement[] = [];
  
  // Sharp Mind - 90%+ accuracy in any game
  const hasHighAccuracy = Object.values(gameStats).some(stat => stat.averageAccuracy >= 90);
  achievements.push({
    id: 'sharp_mind',
    name: 'Sharp Mind',
    description: 'Score 90% or higher in any game',
    icon: '🧠',
    category: 'skill',
    isUnlocked: hasHighAccuracy,
  });
  
  // Dedicated Trainer - 50+ total games
  achievements.push({
    id: 'dedicated_trainer',
    name: 'Dedicated Trainer',
    description: 'Play 50 total games',
    icon: '💪',
    category: 'volume',
    progress: totalGames,
    isUnlocked: totalGames >= 50,
  });
  
  // Brain Athlete - 100+ total games
  achievements.push({
    id: 'brain_athlete',
    name: 'Brain Athlete',
    description: 'Play 100 total games',
    icon: '🎯',
    category: 'volume',
    progress: totalGames,
    isUnlocked: totalGames >= 100,
  });
  
  // Cognitive Champion - Cognitive Index 80+
  achievements.push({
    id: 'cognitive_champion',
    name: 'Cognitive Champion',
    description: 'Reach Cognitive Index of 80',
    icon: '👑',
    category: 'skill',
    progress: cognitiveIndex,
    isUnlocked: cognitiveIndex >= 80,
  });
  
  // Completionist - Play all 13 games
  const uniqueGamesPlayed = Object.values(gameStats).filter(stat => stat.gamesPlayed > 0).length;
  achievements.push({
    id: 'completionist',
    name: 'Completionist',
    description: 'Play all 13 brain training games',
    icon: '🏆',
    category: 'variety',
    progress: uniqueGamesPlayed,
    isUnlocked: uniqueGamesPlayed >= 13,
  });
  
  // Memory Master - Level 10 in Memory Match
  achievements.push({
    id: 'memory_master',
    name: 'Memory Master',
    description: 'Reach level 10 in Memory Match',
    icon: '🎮',
    category: 'game',
    progress: gameStats.memory?.highestLevel || 0,
    isUnlocked: (gameStats.memory?.highestLevel || 0) >= 10,
  });
  
  // Reflex Champion - Average reaction under 300ms
  const reflexAvg = gameStats.reflex?.averageTimeMs || 999999;
  achievements.push({
    id: 'reflex_champion',
    name: 'Reflex Champion',
    description: 'Achieve average reaction time under 300ms',
    icon: '⚡',
    category: 'skill',
    isUnlocked: reflexAvg < 300,
  });
  
  return achievements;
}

/**
 * Clear all data (for testing or reset)
 */
export async function clearAllData(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SCORES_STORE], 'readwrite');
    const store = transaction.objectStore(SCORES_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
