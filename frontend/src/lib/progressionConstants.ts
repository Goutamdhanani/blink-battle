/**
 * Shared progression constants for XP, levels, and ranks
 * Single source of truth for the entire application
 */

// Level thresholds based on total XP (exponential curve)
export const LEVEL_THRESHOLDS: { [key: number]: number } = {
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
export const RANK_THRESHOLDS = [
  { minXP: 500000, rank: 'Legend' },      // Top 1% - 10,000+ games
  { minXP: 150000, rank: 'Master' },      // Top 5% - 4,000+ games
  { minXP: 50000, rank: 'Diamond' },      // Skilled - 1,500+ games
  { minXP: 15000, rank: 'Platinum' },     // Dedicated - 500+ games
  { minXP: 5000, rank: 'Gold' },          // Regular - 200+ games
  { minXP: 1000, rank: 'Silver' },        // Casual - 50+ games
  { minXP: 0, rank: 'Bronze' },           // New players
];

/**
 * Calculate level from total XP using exponential thresholds
 */
export function calculateLevelFromXP(xp: number): number {
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
export function calculateRankFromXP(xp: number): string {
  for (const { minXP, rank } of RANK_THRESHOLDS) {
    if (xp >= minXP) {
      return rank;
    }
  }
  return 'Bronze';
}

/**
 * Get unlocked themes based on level (realistic progression)
 */
export function getUnlockedThemes(level: number): string[] {
  const themes = ['Bronze'];
  if (level >= 10) themes.push('Silver');
  if (level >= 25) themes.push('Gold');
  if (level >= 50) themes.push('Platinum');
  if (level >= 75) themes.push('Diamond');
  if (level >= 100) themes.push('Legend');
  return themes;
}
