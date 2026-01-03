import { NormalizedPaymentStatus } from '../models/PaymentIntent';

/**
 * Normalize MiniKit transaction statuses to canonical payment status
 * 
 * MiniKit can return various statuses from Developer Portal:
 * - Pending states: initiated, authorized, broadcast, pending, pending_confirmation, submitted
 * - Confirmed states: mined, confirmed, success
 * - Failed states: failed, error, rejected
 * - Cancelled states: expired, cancelled, canceled, declined
 * 
 * Any unknown status defaults to PENDING (not confirmed) for safety
 */
export function normalizeMiniKitStatus(rawStatus: string | undefined | null): NormalizedPaymentStatus {
  if (!rawStatus) {
    // Missing status = pending (not confirmed)
    return NormalizedPaymentStatus.PENDING;
  }

  const status = rawStatus.toLowerCase().trim();

  // Confirmed states (only these should mark payment as confirmed)
  if (status === 'mined' || status === 'confirmed' || status === 'success') {
    return NormalizedPaymentStatus.CONFIRMED;
  }

  // Failed states
  if (status === 'failed' || status === 'error' || status === 'rejected') {
    return NormalizedPaymentStatus.FAILED;
  }

  // Cancelled states
  if (status === 'expired' || status === 'cancelled' || status === 'canceled' || status === 'declined') {
    return NormalizedPaymentStatus.CANCELLED;
  }

  // Pending states (explicit)
  if (
    status === 'initiated' ||
    status === 'authorized' ||
    status === 'broadcast' ||
    status === 'pending' ||
    status === 'pending_confirmation' ||
    status === 'submitted'
  ) {
    return NormalizedPaymentStatus.PENDING;
  }

  // Unknown status defaults to PENDING for safety (not confirmed)
  console.warn(`[StatusNormalization] Unknown MiniKit status: "${rawStatus}", defaulting to PENDING`);
  return NormalizedPaymentStatus.PENDING;
}

/**
 * Extract transaction hash from Developer Portal response
 * Handles both transactionHash and transaction_hash field names
 */
export function extractTransactionHash(transaction: any): string | null {
  return transaction?.transactionHash || transaction?.transaction_hash || null;
}
