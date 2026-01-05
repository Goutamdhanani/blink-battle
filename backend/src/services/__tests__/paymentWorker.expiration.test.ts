import { PaymentWorker } from '../paymentWorker';
import { PaymentIntentModel, NormalizedPaymentStatus } from '../../models/PaymentIntent';
import pool from '../../config/database';
import axios from 'axios';

// Mock dependencies
jest.mock('../../models/PaymentIntent');
jest.mock('../../config/database', () => ({
  connect: jest.fn(),
}));
jest.mock('axios');

describe('PaymentWorker - Expiration Logic', () => {
  let worker: PaymentWorker;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    (pool.connect as jest.Mock).mockResolvedValue(mockClient);
    
    worker = new PaymentWorker('test-worker');
    
    // Set required env vars
    process.env.APP_ID = 'app_test_123';
    process.env.DEV_PORTAL_API_KEY = 'test_api_key';
  });

  afterEach(() => {
    worker.stop();
  });

  describe('processPayments - expiration', () => {
    it('should call expireStalePayments before processing', async () => {
      // Mock empty result - no payments to process
      mockClient.query.mockResolvedValue({ rows: [] });
      
      (PaymentIntentModel.expireStalePayments as jest.Mock).mockResolvedValue(0);

      // Start worker and give it time to process once
      worker.start(100);
      await new Promise(resolve => setTimeout(resolve, 150));
      worker.stop();

      expect(PaymentIntentModel.expireStalePayments).toHaveBeenCalledWith(5);
    });

    it('should log when payments are expired', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      mockClient.query.mockResolvedValue({ rows: [] });
      (PaymentIntentModel.expireStalePayments as jest.Mock).mockResolvedValue(3);

      worker.start(100);
      // Wait for at least 6 polls (6 * 100ms = 600ms) to trigger logging
      await new Promise(resolve => setTimeout(resolve, 700));
      worker.stop();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Expired 3 stale payments without transaction IDs (>5 min old)')
      );

      consoleSpy.mockRestore();
    });

    it('should not log if no payments expired', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      mockClient.query.mockResolvedValue({ rows: [] });
      (PaymentIntentModel.expireStalePayments as jest.Mock).mockResolvedValue(0);

      worker.start(100);
      await new Promise(resolve => setTimeout(resolve, 150));
      worker.stop();

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Expired')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('processPaymentIntent - skipping vs expiring', () => {
    it('should log clearly when skipping payment without transaction ID', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockIntent = {
        payment_reference: 'ref-123',
        minikit_transaction_id: null,
      };

      (PaymentIntentModel.releaseLock as jest.Mock).mockResolvedValue(undefined);

      // Call processPaymentIntent directly via reflection
      // @ts-ignore - accessing private method for testing
      await worker['processPaymentIntent'](mockIntent);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('has no transaction ID yet')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('waiting for user to complete MiniKit flow')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('worker lifecycle', () => {
    it('should start and stop cleanly', () => {
      worker.start(1000);
      expect(worker['isRunning']).toBe(true);
      
      worker.stop();
      expect(worker['isRunning']).toBe(false);
    });

    it('should not start twice', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      worker.start(1000);
      worker.start(1000);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Already running')
      );
      
      worker.stop();
      consoleSpy.mockRestore();
    });

    it('should handle stop when not running', () => {
      expect(() => worker.stop()).not.toThrow();
    });
  });
});
