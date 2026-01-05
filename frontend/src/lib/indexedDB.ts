/**
 * IndexedDB wrapper for offline game data storage
 */

import { GameScore, PlayerProfile, GameStats } from '../games/types';

const DB_NAME = 'BlinkBattleBrainTraining';
const DB_VERSION = 1;
const SCORES_STORE = 'gameScores';
const PROFILE_STORE = 'playerProfile';

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
export async function calculateGameStats(gameType: string): Promise<GameStats> {
  const scores = await getGameScores(gameType);
  
  if (scores.length === 0) {
    return {
      gameType: gameType as 'memory' | 'attention' | 'reflex',
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
    gameType: gameType as 'memory' | 'attention' | 'reflex',
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
  const memoryStats = await calculateGameStats('memory');
  const attentionStats = await calculateGameStats('attention');
  const reflexStats = await calculateGameStats('reflex');
  
  const totalGamesPlayed = memoryStats.gamesPlayed + attentionStats.gamesPlayed + reflexStats.gamesPlayed;
  
  const allScores = await getAllScores();
  const lastActive = allScores.length > 0 ? Math.max(...allScores.map(s => s.timestamp)) : Date.now();
  
  return {
    totalGamesPlayed,
    memoryStats,
    attentionStats,
    reflexStats,
    achievements: calculateAchievements(memoryStats, attentionStats, reflexStats),
    createdAt: Date.now(),
    lastActive,
  };
}

/**
 * Calculate achievements based on stats
 */
function calculateAchievements(
  memory: GameStats, 
  attention: GameStats, 
  reflex: GameStats
): string[] {
  const achievements: string[] = [];
  
  // First game achievements
  if (memory.gamesPlayed > 0) achievements.push('memory_novice');
  if (attention.gamesPlayed > 0) achievements.push('attention_novice');
  if (reflex.gamesPlayed > 0) achievements.push('reflex_novice');
  
  // Level achievements
  if (memory.highestLevel >= 5) achievements.push('memory_master');
  if (attention.highestLevel >= 5) achievements.push('attention_master');
  if (reflex.highestLevel >= 5) achievements.push('reflex_master');
  
  // Accuracy achievements
  if (memory.averageAccuracy >= 90) achievements.push('memory_perfectionist');
  if (attention.averageAccuracy >= 90) achievements.push('attention_sharpshooter');
  
  // Speed achievements
  if (reflex.averageTimeMs > 0 && reflex.averageTimeMs < 300) achievements.push('lightning_fast');
  
  // Dedication achievements
  const totalGames = memory.gamesPlayed + attention.gamesPlayed + reflex.gamesPlayed;
  if (totalGames >= 10) achievements.push('dedicated_trainer');
  if (totalGames >= 50) achievements.push('brain_athlete');
  if (totalGames >= 100) achievements.push('cognitive_champion');
  
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
