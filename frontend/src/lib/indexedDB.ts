/**
 * IndexedDB wrapper for offline game data storage
 */

import { GameScore, PlayerProfile, GameStats, GameType, Achievement } from '../games/types';

const DB_NAME = 'BlinkBattleBrainTraining';
const DB_VERSION = 1;
const SCORES_STORE = 'gameScores';
const PROFILE_STORE = 'playerProfile';

// XP and leveling constants
const XP_BASE_MULTIPLIER = 100;

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
  
  // Calculate XP based on total scores
  const xp = allScores.reduce((sum, s) => sum + s.score, 0);
  const level = Math.floor(Math.sqrt(xp / XP_BASE_MULTIPLIER)) + 1;
  
  // Calculate cognitive index (0-100 scale)
  const avgAccuracy = allScores.length > 0 
    ? allScores.reduce((sum, s) => sum + s.accuracy, 0) / allScores.length 
    : 0;
  const cognitiveIndex = Math.round(avgAccuracy);
  
  // Calculate rank badge based on level
  let rankBadge = 'Rookie';
  if (level >= 10) rankBadge = 'Legend';
  else if (level >= 7) rankBadge = 'Elite';
  else if (level >= 4) rankBadge = 'Experienced';
  
  // Generate achievements
  const achievements = calculateAchievements(gameStats, totalGamesPlayed, cognitiveIndex);
  
  return {
    xp,
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
    currentTheme: 'Rookie',
    createdAt: Date.now(),
    lastActive,
    joinDate: Date.now(),
  };
}

/**
 * Get unlocked themes based on level
 */
function getUnlockedThemes(level: number): string[] {
  const themes = ['Rookie'];
  if (level >= 4) themes.push('Experienced');
  if (level >= 7) themes.push('Elite');
  if (level >= 10) themes.push('Hacker Mode');
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
