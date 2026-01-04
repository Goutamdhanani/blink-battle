import crypto from 'crypto';
import { NormalizedPaymentStatus } from '../models/PaymentIntent';

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

// Re-export NormalizedPaymentStatus as NormalizedStatus for backwards compatibility
// @deprecated Use NormalizedPaymentStatus directly. This alias will be removed in v2.0.0
export { NormalizedPaymentStatus as NormalizedStatus };

/**
 * Normalize MiniKit status to internal status
 * This is the SINGLE SOURCE OF TRUTH for status mapping
 */
export function normalizeMiniKitStatus(rawStatus: string): NormalizedPaymentStatus {
  const normalized = rawStatus.toLowerCase();
  
  switch (normalized) {
    // Confirmed states
    case MiniKitStatus.CONFIRMED:
    case MiniKitStatus.SUCCESS:
      return NormalizedPaymentStatus.CONFIRMED;
    
    // Pending states - transaction in progress
    case MiniKitStatus.INITIATED:
    case MiniKitStatus.AUTHORIZED:
    case MiniKitStatus.BROADCAST:
    case MiniKitStatus.PENDING_CONFIRMATION:
    case MiniKitStatus.PENDING:
      return NormalizedPaymentStatus.PENDING;
    
    // Failed states
    case MiniKitStatus.FAILED:
    case MiniKitStatus.ERROR:
    case MiniKitStatus.EXPIRED:
      return NormalizedPaymentStatus.FAILED;
    
    // Cancelled states
    case MiniKitStatus.CANCELLED:
      return NormalizedPaymentStatus.CANCELLED;
    
    default:
      console.warn(`[MiniKit] Unknown status: ${rawStatus}, treating as pending`);
      return NormalizedPaymentStatus.PENDING;
  }
}

/**
 * Check if status is terminal (no more retries needed)
 */
export function isTerminalStatus(status: NormalizedPaymentStatus): boolean {
  return status === NormalizedPaymentStatus.CONFIRMED || 
         status === NormalizedPaymentStatus.FAILED || 
         status === NormalizedPaymentStatus.CANCELLED;
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

/**
 * Calculate platform fee and net payout for a match
 * Uses PLATFORM_FEE_PERCENT from environment (default 3%)
 * 
 * @param stake - Stake amount in WLD (floating point)
 * @returns Object with totalPool, platformFee, and netPayout (all in wei as BigInt)
 */
export function calculatePlatformFee(stake: number): {
  totalPool: bigint;
  platformFee: bigint;
  netPayout: bigint;
} {
  // Convert stake to wei using Math.round for better precision
  const stakeWei = BigInt(Math.round(stake * 1e18));
  const totalPool = stakeWei * 2n; // Both players' stakes
  
  // Use PLATFORM_FEE_PERCENT from environment (default 3%)
  const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '3');
  const platformFeeBps = BigInt(Math.round(PLATFORM_FEE_PERCENT * 100)); // Convert % to basis points
  
  const platformFee = (totalPool * platformFeeBps) / 10000n;
  const netPayout = totalPool - platformFee;
  
  return {
    totalPool,
    platformFee,
    netPayout
  };
}

/**
 * Calculate refund amount after gas fee deduction
 * Uses GAS_FEE_PERCENT (default 3%) for refunds
 * 
 * @param amount - Original payment amount in WLD (floating point)
 * @param gasFeePercent - Gas fee percentage (default 3%)
 * @returns Object with amountWei, gasFeeWei, refundWei, and refundWLD
 */
export function calculateRefundAmount(amount: number, gasFeePercent: number = 3): {
  amountWei: bigint;
  gasFeeWei: bigint;
  refundWei: bigint;
  refundWLD: number;
} {
  const amountWei = BigInt(Math.floor(amount * 1e18));
  const gasFeeWei = (amountWei * BigInt(gasFeePercent)) / 100n;
  const refundWei = amountWei - gasFeeWei;
  const refundWLD = parseFloat((Number(refundWei) / 1e18).toFixed(8));
  
  return {
    amountWei,
    gasFeeWei,
    refundWei,
    refundWLD
  };
}

