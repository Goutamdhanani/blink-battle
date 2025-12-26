import crypto from 'crypto';

/**
 * Generates a cryptographically secure random delay for the game signal
 * @param minMs Minimum delay in milliseconds
 * @param maxMs Maximum delay in milliseconds
 * @returns Random delay in milliseconds
 */
export function generateRandomDelay(minMs: number, maxMs: number): number {
  const range = maxMs - minMs;
  const randomBytes = crypto.randomBytes(4);
  const randomValue = randomBytes.readUInt32BE(0) / 0xffffffff; // Normalize to 0-1
  return Math.floor(minMs + randomValue * range);
}

/**
 * Generates a unique match ID using crypto
 */
export function generateMatchId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Validates reaction time is within acceptable bounds
 */
export function isValidReactionTime(reactionMs: number): boolean {
  const minReaction = parseInt(process.env.MIN_REACTION_MS || '80', 10);
  const maxReaction = parseInt(process.env.MAX_REACTION_MS || '3000', 10);
  return reactionMs >= minReaction && reactionMs <= maxReaction;
}
