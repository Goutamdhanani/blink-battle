import crypto from 'crypto';

/**
 * MiniKit Status Normalization Utilities
 * 
 * Maps various MiniKit transaction statuses to normalized internal states:
 * - pending: Transaction initiated but not confirmed
 * - confirmed: Transaction successfully confirmed on-chain
 * - failed: Transaction failed or rejected
 * - cancelled: Transaction cancelled by user
 */

export enum MiniKitStatus {
  INITIATED = 'initiated',
  AUTHORIZED = 'authorized',
  BROADCAST = 'broadcast',
  PENDING_CONFIRMATION = 'pending_confirmation',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  // Legacy statuses
  PENDING = 'pending',
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum NormalizedStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Normalize MiniKit status to internal status
 * This is the SINGLE SOURCE OF TRUTH for status mapping
 */
export function normalizeMiniKitStatus(rawStatus: string): NormalizedStatus {
  const normalized = rawStatus.toLowerCase();
  
  switch (normalized) {
    // Confirmed states
    case MiniKitStatus.CONFIRMED:
    case MiniKitStatus.SUCCESS:
      return NormalizedStatus.CONFIRMED;
    
    // Pending states - transaction in progress
    case MiniKitStatus.INITIATED:
    case MiniKitStatus.AUTHORIZED:
    case MiniKitStatus.BROADCAST:
    case MiniKitStatus.PENDING_CONFIRMATION:
    case MiniKitStatus.PENDING:
      return NormalizedStatus.PENDING;
    
    // Failed states
    case MiniKitStatus.FAILED:
    case MiniKitStatus.ERROR:
    case MiniKitStatus.EXPIRED:
      return NormalizedStatus.FAILED;
    
    // Cancelled states
    case MiniKitStatus.CANCELLED:
      return NormalizedStatus.CANCELLED;
    
    default:
      console.warn(`[MiniKit] Unknown status: ${rawStatus}, treating as pending`);
      return NormalizedStatus.PENDING;
  }
}

/**
 * Check if status is terminal (no more retries needed)
 */
export function isTerminalStatus(status: NormalizedStatus): boolean {
  return status === NormalizedStatus.CONFIRMED || 
         status === NormalizedStatus.FAILED || 
         status === NormalizedStatus.CANCELLED;
}

/**
 * Generate deterministic payment reference for a match
 * 
 * CRITICAL: This MUST be stable - same inputs MUST produce same output
 * Format: matchId_userId_amount (hashed for uniqueness and privacy)
 * 
 * This prevents double-charging the same player for the same match
 */
export function generatePaymentReference(
  matchId: string,
  userId: string,
  amount: number
): string {
  // Create deterministic input string (order matters!)
  const input = `match:${matchId}|user:${userId}|amount:${amount.toFixed(4)}`;
  
  // Hash for uniqueness and privacy (SHA256 is deterministic)
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  
  // Take first 32 chars (no dashes, as per MiniKit requirements)
  return hash.substring(0, 32);
}

/**
 * Generate deterministic idempotency key for match creation
 * 
 * CRITICAL: Same player pair + stake MUST always produce same key
 * This prevents duplicate match creation
 */
export function generateMatchIdempotencyKey(
  player1Id: string,
  player2Id: string,
  stake: number,
  timestamp?: number
): string {
  // Sort player IDs to ensure deterministic order (p1, p2) = (p2, p1)
  const sortedPlayers = [player1Id, player2Id].sort();
  
  // If timestamp provided, include it for time-based uniqueness
  // Otherwise, use just player IDs + stake for true idempotency
  const input = timestamp 
    ? `match:${sortedPlayers[0]}:${sortedPlayers[1]}:${stake.toFixed(4)}:${timestamp}`
    : `match:${sortedPlayers[0]}:${sortedPlayers[1]}:${stake.toFixed(4)}`;
  
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return hash.substring(0, 32);
}

/**
 * Validate timestamp to prevent "Invalid time value" errors
 * Returns validated timestamp or null if invalid
 */
export function validateTimestamp(value: any, fieldName: string = 'timestamp'): number | null {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return null;
  }

  // Convert to number
  const num = typeof value === 'number' ? value : Number(value);

  // Validate it's a finite number
  if (!Number.isFinite(num)) {
    console.warn(`[Validation] Invalid ${fieldName}: not a finite number (${value})`);
    return null;
  }

  // Validate it's not negative
  if (num < 0) {
    console.warn(`[Validation] Invalid ${fieldName}: negative value (${num})`);
    return null;
  }

  // Validate it's a reasonable timestamp (not too far in past or future)
  // Unix epoch in milliseconds: Jan 1, 2020 to Jan 1, 2050
  const MIN_TIMESTAMP = 1577836800000; // 2020-01-01
  const MAX_TIMESTAMP = 2524608000000; // 2050-01-01

  if (num < MIN_TIMESTAMP || num > MAX_TIMESTAMP) {
    console.warn(`[Validation] Invalid ${fieldName}: out of reasonable range (${num})`);
    return null;
  }

  return num;
}

/**
 * Clamp reaction time to valid range
 * Prevents negative or unreasonably large reaction times
 */
export function clampReactionTime(reactionMs: number): number {
  const MIN_REACTION_MS = parseInt(process.env.MIN_REACTION_MS || '0', 10);
  const MAX_REACTION_MS = parseInt(process.env.MAX_REACTION_MS || '5000', 10);
  
  return Math.max(MIN_REACTION_MS, Math.min(MAX_REACTION_MS, reactionMs));
}
