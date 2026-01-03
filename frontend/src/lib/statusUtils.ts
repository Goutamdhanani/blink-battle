/**
 * MiniKit Status Normalization for Frontend
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
 * This is the SINGLE SOURCE OF TRUTH for status mapping on frontend
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
 * Check if status is terminal (no more polling needed)
 */
export function isTerminalStatus(status: NormalizedStatus): boolean {
  return status === NormalizedStatus.CONFIRMED || 
         status === NormalizedStatus.FAILED || 
         status === NormalizedStatus.CANCELLED;
}

/**
 * Get user-friendly status message
 */
export function getStatusMessage(status: NormalizedStatus): string {
  switch (status) {
    case NormalizedStatus.PENDING:
      return 'Transaction pending...';
    case NormalizedStatus.CONFIRMED:
      return 'Transaction confirmed!';
    case NormalizedStatus.FAILED:
      return 'Transaction failed';
    case NormalizedStatus.CANCELLED:
      return 'Transaction cancelled';
    default:
      return 'Unknown status';
  }
}

/**
 * Clamp reaction time to valid range
 * Prevents display of negative or unreasonably large reaction times
 */
export function clampReactionTime(reactionMs: number | null | undefined): number | null {
  if (reactionMs === null || reactionMs === undefined) return null;
  if (!Number.isFinite(reactionMs)) return null;
  
  const MIN_REACTION_MS = 0;
  const MAX_REACTION_MS = 5000; // 5 seconds max
  
  return Math.max(MIN_REACTION_MS, Math.min(MAX_REACTION_MS, reactionMs));
}

/**
 * Validate and format reaction time for display
 * Always clamps to valid range before displaying
 */
export function formatReactionTime(reactionMs: number | null | undefined): string {
  const clamped = clampReactionTime(reactionMs);
  if (clamped === null) return '--';
  return `${Math.round(clamped)}ms`;
}
