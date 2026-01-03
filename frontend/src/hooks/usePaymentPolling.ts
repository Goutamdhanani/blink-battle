import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../lib/api';

export interface PaymentStatus {
  id: string;
  amount: number;
  status: string;
  normalizedStatus: 'pending' | 'confirmed' | 'failed' | 'cancelled';
  transactionId?: string;
  transactionHash?: string;
  rawStatus?: string;
  createdAt: string;
  confirmedAt?: string;
  lastError?: string;
}

export interface UsePaymentPollingOptions {
  reference: string;
  enabled?: boolean;
  onSuccess?: (payment: PaymentStatus) => void;
  onError?: (error: Error) => void;
  onTimeout?: () => void;
  maxAttempts?: number; // Max number of polling attempts (default: 60 = 2 minutes with 2s interval)
  initialDelay?: number; // Initial delay in ms (default: 1000)
  maxDelay?: number; // Max delay in ms (default: 30000)
  useExponentialBackoff?: boolean; // Use exponential backoff (default: true)
}

export interface UsePaymentPollingResult {
  payment: PaymentStatus | null;
  isLoading: boolean;
  error: Error | null;
  isConfirmed: boolean;
  isFailed: boolean;
  isPending: boolean;
  cancel: () => void;
}

/**
 * Hook for polling payment status until confirmed or failed
 * Uses exponential backoff by default: 1s, 2s, 4s, 8s, 16s, 30s (max)
 * Timeout after maxAttempts (default: 60 attempts = ~2 minutes)
 */
export const usePaymentPolling = (
  options: UsePaymentPollingOptions
): UsePaymentPollingResult => {
  const {
    reference,
    enabled = true,
    onSuccess,
    onError,
    onTimeout,
    maxAttempts = 60,
    initialDelay = 1000,
    maxDelay = 30000,
    useExponentialBackoff = true,
  } = options;

  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const attemptRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCancelledRef = useRef(false);

  const cancel = useCallback(() => {
    isCancelledRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled || !reference) {
      return;
    }

    isCancelledRef.current = false;
    attemptRef.current = 0;
    setIsLoading(true);
    setError(null);

    // Iterative polling approach to avoid stack overflow and memory leaks
    const poll = async () => {
      if (isCancelledRef.current) {
        return;
      }

      try {
        const response = await apiClient.get(`/api/payment-status/${reference}`);
        const paymentData = response.data.payment;

        setPayment(paymentData);

        // Check if payment is in a terminal state
        if (paymentData.normalizedStatus === 'confirmed') {
          setIsLoading(false);
          onSuccess?.(paymentData);
          return;
        }

        if (
          paymentData.normalizedStatus === 'failed' ||
          paymentData.normalizedStatus === 'cancelled'
        ) {
          setIsLoading(false);
          const err = new Error(
            paymentData.lastError || `Payment ${paymentData.normalizedStatus}`
          );
          setError(err);
          onError?.(err);
          return;
        }

        // Payment is still pending, schedule next poll
        attemptRef.current += 1;

        if (attemptRef.current >= maxAttempts) {
          setIsLoading(false);
          const timeoutError = new Error('Payment confirmation timeout');
          setError(timeoutError);
          onTimeout?.();
          onError?.(timeoutError);
          return;
        }

        // Calculate next delay with exponential backoff
        let nextDelay = initialDelay;
        if (useExponentialBackoff) {
          // Exponential backoff: initialDelay * 2^attempt
          nextDelay = Math.min(
            initialDelay * Math.pow(2, attemptRef.current - 1),
            maxDelay
          );
        }

        console.log(
          `[PaymentPolling] Attempt ${attemptRef.current}/${maxAttempts}, next poll in ${nextDelay}ms`
        );

        // Schedule next poll
        timeoutRef.current = setTimeout(() => {
          poll(); // Recursively call but via setTimeout to avoid deep call stack
        }, nextDelay);
      } catch (err) {
        const error = err as Error;
        console.error('[PaymentPolling] Error polling payment status:', error);
        setIsLoading(false);
        setError(error);
        onError?.(error);
      }
    };

    // Start polling immediately
    poll();

    // Cleanup on unmount
    return () => {
      cancel();
    };
  }, [enabled, reference, maxAttempts, initialDelay, maxDelay, useExponentialBackoff, onSuccess, onError, onTimeout, cancel]); // Added all dependencies

  const isConfirmed = payment?.normalizedStatus === 'confirmed';
  const isFailed =
    payment?.normalizedStatus === 'failed' ||
    payment?.normalizedStatus === 'cancelled';
  const isPending = payment?.normalizedStatus === 'pending';

  return {
    payment,
    isLoading,
    error,
    isConfirmed,
    isFailed,
    isPending,
    cancel,
  };
};
