import { normalizeMiniKitStatus, extractTransactionHash, extractRawStatus } from '../statusNormalization';
import { NormalizedPaymentStatus } from '../../models/PaymentIntent';

describe('statusNormalization', () => {
  describe('normalizeMiniKitStatus', () => {
    it('should normalize confirmed statuses', () => {
      expect(normalizeMiniKitStatus('mined')).toBe(NormalizedPaymentStatus.CONFIRMED);
      expect(normalizeMiniKitStatus('confirmed')).toBe(NormalizedPaymentStatus.CONFIRMED);
      expect(normalizeMiniKitStatus('success')).toBe(NormalizedPaymentStatus.CONFIRMED);
      expect(normalizeMiniKitStatus('MINED')).toBe(NormalizedPaymentStatus.CONFIRMED);
      expect(normalizeMiniKitStatus('Confirmed')).toBe(NormalizedPaymentStatus.CONFIRMED);
    });

    it('should normalize pending statuses', () => {
      expect(normalizeMiniKitStatus('pending')).toBe(NormalizedPaymentStatus.PENDING);
      expect(normalizeMiniKitStatus('initiated')).toBe(NormalizedPaymentStatus.PENDING);
      expect(normalizeMiniKitStatus('authorized')).toBe(NormalizedPaymentStatus.PENDING);
      expect(normalizeMiniKitStatus('broadcast')).toBe(NormalizedPaymentStatus.PENDING);
      expect(normalizeMiniKitStatus('pending_confirmation')).toBe(NormalizedPaymentStatus.PENDING);
      expect(normalizeMiniKitStatus('submitted')).toBe(NormalizedPaymentStatus.PENDING);
      expect(normalizeMiniKitStatus('PENDING')).toBe(NormalizedPaymentStatus.PENDING);
    });

    it('should normalize failed statuses', () => {
      expect(normalizeMiniKitStatus('failed')).toBe(NormalizedPaymentStatus.FAILED);
      expect(normalizeMiniKitStatus('error')).toBe(NormalizedPaymentStatus.FAILED);
      expect(normalizeMiniKitStatus('rejected')).toBe(NormalizedPaymentStatus.FAILED);
      expect(normalizeMiniKitStatus('FAILED')).toBe(NormalizedPaymentStatus.FAILED);
    });

    it('should normalize cancelled statuses', () => {
      expect(normalizeMiniKitStatus('cancelled')).toBe(NormalizedPaymentStatus.CANCELLED);
      expect(normalizeMiniKitStatus('canceled')).toBe(NormalizedPaymentStatus.CANCELLED);
      expect(normalizeMiniKitStatus('expired')).toBe(NormalizedPaymentStatus.CANCELLED);
      expect(normalizeMiniKitStatus('declined')).toBe(NormalizedPaymentStatus.CANCELLED);
      expect(normalizeMiniKitStatus('CANCELLED')).toBe(NormalizedPaymentStatus.CANCELLED);
    });

    it('should default unknown statuses to PENDING', () => {
      expect(normalizeMiniKitStatus('unknown')).toBe(NormalizedPaymentStatus.PENDING);
      expect(normalizeMiniKitStatus('random_status')).toBe(NormalizedPaymentStatus.PENDING);
      expect(normalizeMiniKitStatus('processing')).toBe(NormalizedPaymentStatus.PENDING);
    });

    it('should handle null/undefined as PENDING', () => {
      expect(normalizeMiniKitStatus(null)).toBe(NormalizedPaymentStatus.PENDING);
      expect(normalizeMiniKitStatus(undefined)).toBe(NormalizedPaymentStatus.PENDING);
      expect(normalizeMiniKitStatus('')).toBe(NormalizedPaymentStatus.PENDING);
    });

    it('should trim whitespace', () => {
      expect(normalizeMiniKitStatus(' mined ')).toBe(NormalizedPaymentStatus.CONFIRMED);
      expect(normalizeMiniKitStatus(' pending ')).toBe(NormalizedPaymentStatus.PENDING);
    });
  });

  describe('extractTransactionHash', () => {
    it('should extract transactionHash field', () => {
      const tx = { transactionHash: '0xabc123' };
      expect(extractTransactionHash(tx)).toBe('0xabc123');
    });

    it('should extract transaction_hash field', () => {
      const tx = { transaction_hash: '0xdef456' };
      expect(extractTransactionHash(tx)).toBe('0xdef456');
    });

    it('should prefer transactionHash over transaction_hash', () => {
      const tx = { 
        transactionHash: '0xabc123',
        transaction_hash: '0xdef456'
      };
      expect(extractTransactionHash(tx)).toBe('0xabc123');
    });

    it('should return null for missing hash', () => {
      expect(extractTransactionHash({})).toBe(null);
      expect(extractTransactionHash(null)).toBe(null);
      expect(extractTransactionHash(undefined)).toBe(null);
    });

    it('should return null for null hash value', () => {
      expect(extractTransactionHash({ transactionHash: null })).toBe(null);
      expect(extractTransactionHash({ transaction_hash: null })).toBe(null);
    });
  });

  describe('extractRawStatus', () => {
    it('should extract transactionStatus field', () => {
      const tx = { transactionStatus: 'pending' };
      expect(extractRawStatus(tx)).toBe('pending');
    });

    it('should extract status field as fallback', () => {
      const tx = { status: 'mined' };
      expect(extractRawStatus(tx)).toBe('mined');
    });

    it('should prefer transactionStatus over status', () => {
      const tx = { 
        transactionStatus: 'mined',
        status: 'pending'
      };
      expect(extractRawStatus(tx)).toBe('mined');
    });

    it('should return undefined for missing status fields', () => {
      expect(extractRawStatus({})).toBe(undefined);
      expect(extractRawStatus(null)).toBe(undefined);
      expect(extractRawStatus(undefined)).toBe(undefined);
    });

    it('should return undefined for null/undefined status values', () => {
      expect(extractRawStatus({ transactionStatus: null })).toBe(undefined);
      expect(extractRawStatus({ status: null })).toBe(undefined);
      expect(extractRawStatus({ transactionStatus: undefined })).toBe(undefined);
      expect(extractRawStatus({ status: undefined })).toBe(undefined);
    });
  });
});
