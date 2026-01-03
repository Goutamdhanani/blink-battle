import { PaymentIntentModel, NormalizedPaymentStatus } from '../../models/PaymentIntent';
import pool from '../../config/database';

// Mock database pool
jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));

describe('PaymentIntent - Expiration Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('expireStalePayments', () => {
    it('should expire payments without transaction IDs older than timeout', async () => {
      const mockResult = {
        rows: [
          { payment_reference: 'ref-1' },
          { payment_reference: 'ref-2' },
        ],
        rowCount: 2,
      };

      (pool.query as jest.Mock).mockResolvedValue(mockResult);

      const count = await PaymentIntentModel.expireStalePayments(5);

      expect(count).toBe(2);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payment_intents'),
        [NormalizedPaymentStatus.FAILED, NormalizedPaymentStatus.PENDING]
      );
    });

    it('should use default timeout of 5 minutes', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });

      await PaymentIntentModel.expireStalePayments();

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('5 minutes'),
        expect.any(Array)
      );
    });

    it('should accept custom timeout', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });

      await PaymentIntentModel.expireStalePayments(10);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('10 minutes'),
        expect.any(Array)
      );
    });

    it('should return 0 when no payments to expire', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });

      const count = await PaymentIntentModel.expireStalePayments(5);

      expect(count).toBe(0);
    });
  });

  describe('expire', () => {
    it('should mark a specific payment as expired with reason', async () => {
      const mockIntent = {
        payment_reference: 'ref-123',
        normalized_status: NormalizedPaymentStatus.FAILED,
        raw_status: 'expired',
        last_error: 'Payment timeout',
      };

      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockIntent] });

      const result = await PaymentIntentModel.expire('ref-123', 'Payment timeout');

      expect(result).toEqual(mockIntent);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payment_intents'),
        ['ref-123', NormalizedPaymentStatus.FAILED, 'Payment timeout']
      );
    });

    it('should use default reason if not provided', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await PaymentIntentModel.expire('ref-123');

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['ref-123', NormalizedPaymentStatus.FAILED, 'Payment expired']
      );
    });

    it('should return null if payment not found', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await PaymentIntentModel.expire('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByTransactionId', () => {
    it('should find payment by transaction ID', async () => {
      const mockIntent = {
        payment_reference: 'ref-123',
        minikit_transaction_id: 'tx-123',
        normalized_status: NormalizedPaymentStatus.CONFIRMED,
      };

      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockIntent] });

      const result = await PaymentIntentModel.findByTransactionId('tx-123');

      expect(result).toEqual(mockIntent);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM payment_intents WHERE minikit_transaction_id = $1',
        ['tx-123']
      );
    });

    it('should return null if not found', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await PaymentIntentModel.findByTransactionId('non-existent');

      expect(result).toBeNull();
    });
  });
});
