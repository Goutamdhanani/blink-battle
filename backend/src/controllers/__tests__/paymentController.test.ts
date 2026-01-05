import { Request, Response } from 'express';
import { PaymentController } from '../paymentController';
import { PaymentModel, PaymentStatus } from '../../models/Payment';
import { PaymentIntentModel, NormalizedPaymentStatus } from '../../models/PaymentIntent';
import { normalizeMiniKitStatus, extractTransactionHash, extractRawStatus } from '../../services/statusNormalization';
import axios from 'axios';

// Mock PaymentModel
jest.mock('../../models/Payment', () => ({
  PaymentStatus: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    FAILED: 'failed',
    EXPIRED: 'expired',
  },
  PaymentModel: {
    create: jest.fn(),
    findByReference: jest.fn(),
    updateStatus: jest.fn(),
  },
}));

// Mock PaymentIntentModel
jest.mock('../../models/PaymentIntent', () => ({
  NormalizedPaymentStatus: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
  },
  PaymentIntentModel: {
    create: jest.fn(),
    findByReference: jest.fn(),
    updateStatus: jest.fn(),
    findRecentByUserId: jest.fn(),
    releaseLock: jest.fn(),
  },
}));

// Mock statusNormalization
jest.mock('../../services/statusNormalization', () => ({
  normalizeMiniKitStatus: jest.fn(),
  extractTransactionHash: jest.fn(),
  extractRawStatus: jest.fn(),
}));

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PaymentController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    
    mockRequest = {
      body: {},
    };
    
    mockResponse = {
      json: jsonMock,
      status: statusMock,
    };

    // Set required environment variables
    process.env.APP_ID = 'app_test_123';
    process.env.DEV_PORTAL_API_KEY = 'test_api_key';
  });

  describe('initiatePayment', () => {
    it('should create a payment and return reference ID', async () => {
      const userId = 'user-123';
      const amount = 0.5;
      
      mockRequest.body = { amount };
      (mockRequest as any).userId = userId;

      // Mock no recent payments (spam prevention check)
      (PaymentIntentModel.findRecentByUserId as jest.Mock).mockResolvedValue([]);

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference: 'test-reference-123',
        user_id: userId,
        amount,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (PaymentModel.create as jest.Mock).mockResolvedValue(mockPayment);
      (PaymentIntentModel.create as jest.Mock).mockResolvedValue({
        intent_id: 'intent-uuid',
        payment_reference: mockPayment.reference,
        user_id: userId,
        amount,
        normalized_status: NormalizedPaymentStatus.PENDING,
        retry_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await PaymentController.initiatePayment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(PaymentModel.create).toHaveBeenCalled();
      expect(PaymentIntentModel.create).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        id: mockPayment.reference,
      });
    });

    it('should return error for invalid amount', async () => {
      mockRequest.body = { amount: -1 };
      (mockRequest as any).userId = 'user-123';

      await PaymentController.initiatePayment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid amount' });
    });

    it('should be idempotent and return existing payment', async () => {
      const userId = 'user-123';
      const amount = 0.5;
      
      mockRequest.body = { amount };
      (mockRequest as any).userId = userId;

      // Mock no recent payments (spam prevention check)
      (PaymentIntentModel.findRecentByUserId as jest.Mock).mockResolvedValue([]);

      const existingPayment = {
        payment_id: 'existing-payment',
        reference: 'existing-ref',
        user_id: userId,
        amount,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (PaymentModel.create as jest.Mock).mockResolvedValue(existingPayment);
      (PaymentIntentModel.create as jest.Mock).mockResolvedValue({
        intent_id: 'intent-uuid',
        payment_reference: existingPayment.reference,
        user_id: userId,
        amount,
        normalized_status: NormalizedPaymentStatus.PENDING,
        retry_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await PaymentController.initiatePayment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        id: existingPayment.reference,
      });
    });
  });

  describe('confirmPayment', () => {
    it('should confirm payment with valid transaction', async () => {
      const userId = 'user-123';
      const reference = 'test-ref-123';
      const transactionId = 'tx-123';

      mockRequest.body = {
        payload: {
          status: 'success',
          reference,
          transaction_id: transactionId,
        },
      };
      (mockRequest as any).userId = userId;

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockTransaction = {
        status: 'mined',
        transaction_id: transactionId,
        transactionHash: '0xabc123',
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);
      (PaymentModel.updateStatus as jest.Mock).mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.CONFIRMED,
        transaction_id: transactionId,
      });
      (PaymentIntentModel.updateStatus as jest.Mock).mockResolvedValue({
        intent_id: 'intent-uuid',
        payment_reference: reference,
        user_id: userId,
        amount: 0.5,
        normalized_status: NormalizedPaymentStatus.CONFIRMED,
        raw_status: 'mined',
        transaction_hash: '0xabc123',
        minikit_transaction_id: transactionId,
        retry_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
      (normalizeMiniKitStatus as jest.Mock).mockReturnValue(NormalizedPaymentStatus.CONFIRMED);
      (extractTransactionHash as jest.Mock).mockReturnValue('0xabc123');
      (extractRawStatus as jest.Mock).mockReturnValue('mined');
      mockedAxios.get.mockResolvedValue({ data: mockTransaction });

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(PaymentModel.findByReference).toHaveBeenCalledWith(reference);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(transactionId),
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${process.env.DEV_PORTAL_API_KEY}`,
          },
        })
      );
      expect(PaymentModel.updateStatus).toHaveBeenCalledWith(
        reference,
        PaymentStatus.CONFIRMED,
        transactionId
      );
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          transaction: mockTransaction,
        })
      );
    });

    it('should return error if reference not found', async () => {
      mockRequest.body = {
        payload: {
          status: 'success',
          reference: 'nonexistent',
          transaction_id: 'tx-123',
        },
      };
      (mockRequest as any).userId = 'user-123';

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(null);

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Payment reference not found' });
    });

    it('should return error if user mismatch', async () => {
      const reference = 'test-ref';
      mockRequest.body = {
        payload: {
          status: 'success',
          reference,
          transaction_id: 'tx-123',
        },
      };
      (mockRequest as any).userId = 'user-123';

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: 'different-user',
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({ 
        error: 'Payment does not belong to this user' 
      });
    });

    it('should be idempotent for already confirmed payment', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';
      const transactionId = 'tx-123';

      mockRequest.body = {
        payload: {
          status: 'success',
          reference,
          transaction_id: transactionId,
        },
      };
      (mockRequest as any).userId = userId;

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.CONFIRMED,
        transaction_id: transactionId,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      // Should not call Developer Portal API again
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          transaction: { status: 'confirmed' },
        })
      );
    });

    it('should handle pending transaction status', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';
      const transactionId = 'tx-123';

      mockRequest.body = {
        payload: {
          status: 'success',
          reference,
          transaction_id: transactionId,
        },
      };
      (mockRequest as any).userId = userId;

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockTransaction = {
        status: 'pending',
        transaction_id: transactionId,
        transactionHash: null,
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);
      (PaymentIntentModel.updateStatus as jest.Mock).mockResolvedValue({
        intent_id: 'intent-uuid',
        payment_reference: reference,
        user_id: userId,
        amount: 0.5,
        normalized_status: NormalizedPaymentStatus.PENDING,
        raw_status: 'pending',
        minikit_transaction_id: transactionId,
        retry_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
      (normalizeMiniKitStatus as jest.Mock).mockReturnValue(NormalizedPaymentStatus.PENDING);
      (extractTransactionHash as jest.Mock).mockReturnValue(null);
      (extractRawStatus as jest.Mock).mockReturnValue('pending');
      mockedAxios.get.mockResolvedValue({ data: mockTransaction });

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          pending: true,
          transaction: mockTransaction,
        })
      );
      // Should update payment intent status even when pending
      expect(PaymentIntentModel.updateStatus).toHaveBeenCalledWith(
        reference,
        NormalizedPaymentStatus.PENDING,
        'pending',
        transactionId,
        undefined,
        undefined
      );
      // Should not update payment status to confirmed yet
      expect(PaymentModel.updateStatus).not.toHaveBeenCalled();
    });

    it('should handle failed transaction status', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';
      const transactionId = 'tx-123';

      mockRequest.body = {
        payload: {
          status: 'success',
          reference,
          transaction_id: transactionId,
        },
      };
      (mockRequest as any).userId = userId;

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockTransaction = {
        status: 'failed',
        transaction_id: transactionId,
        transactionHash: '0xfailed123',
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);
      (PaymentIntentModel.updateStatus as jest.Mock).mockResolvedValue({
        intent_id: 'intent-uuid',
        payment_reference: reference,
        user_id: userId,
        amount: 0.5,
        normalized_status: NormalizedPaymentStatus.FAILED,
        raw_status: 'failed',
        transaction_hash: '0xfailed123',
        minikit_transaction_id: transactionId,
        retry_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
      (normalizeMiniKitStatus as jest.Mock).mockReturnValue(NormalizedPaymentStatus.FAILED);
      (extractTransactionHash as jest.Mock).mockReturnValue('0xfailed123');
      (extractRawStatus as jest.Mock).mockReturnValue('failed');
      mockedAxios.get.mockResolvedValue({ data: mockTransaction });

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(PaymentModel.updateStatus).toHaveBeenCalledWith(
        reference,
        PaymentStatus.FAILED,
        transactionId
      );
      expect(PaymentIntentModel.updateStatus).toHaveBeenCalledWith(
        reference,
        NormalizedPaymentStatus.FAILED,
        'failed',
        transactionId,
        '0xfailed123',
        undefined
      );
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Transaction failed',
          transaction: mockTransaction,
        })
      );
    });

    it('should NOT mark payment as confirmed when status is pending', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';
      const transactionId = 'tx-123';

      mockRequest.body = {
        payload: {
          status: 'success',
          reference,
          transaction_id: transactionId,
        },
      };
      (mockRequest as any).userId = userId;

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockTransaction = {
        status: 'pending',
        transaction_id: transactionId,
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);
      (PaymentIntentModel.updateStatus as jest.Mock).mockResolvedValue({});
      (normalizeMiniKitStatus as jest.Mock).mockReturnValue(NormalizedPaymentStatus.PENDING);
      (extractTransactionHash as jest.Mock).mockReturnValue(null);
      (extractRawStatus as jest.Mock).mockReturnValue('pending');
      mockedAxios.get.mockResolvedValue({ data: mockTransaction });

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      // Should NOT update PaymentModel to confirmed
      expect(PaymentModel.updateStatus).not.toHaveBeenCalledWith(
        reference,
        PaymentStatus.CONFIRMED,
        expect.anything()
      );
      
      // Should update PaymentIntentModel with pending status
      expect(PaymentIntentModel.updateStatus).toHaveBeenCalledWith(
        reference,
        NormalizedPaymentStatus.PENDING,
        'pending',
        transactionId,
        undefined,
        undefined
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          pending: true,
        })
      );
    });

    it('should mark payment as confirmed ONLY when status is mined', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';
      const transactionId = 'tx-123';

      mockRequest.body = {
        payload: {
          status: 'success',
          reference,
          transaction_id: transactionId,
        },
      };
      (mockRequest as any).userId = userId;

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockTransaction = {
        status: 'mined',
        transaction_id: transactionId,
        transactionHash: '0xconfirmed123',
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);
      (PaymentModel.updateStatus as jest.Mock).mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.CONFIRMED,
      });
      (PaymentIntentModel.updateStatus as jest.Mock).mockResolvedValue({});
      (normalizeMiniKitStatus as jest.Mock).mockReturnValue(NormalizedPaymentStatus.CONFIRMED);
      (extractTransactionHash as jest.Mock).mockReturnValue('0xconfirmed123');
      (extractRawStatus as jest.Mock).mockReturnValue('mined');
      mockedAxios.get.mockResolvedValue({ data: mockTransaction });

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      // Should update PaymentModel to confirmed
      expect(PaymentModel.updateStatus).toHaveBeenCalledWith(
        reference,
        PaymentStatus.CONFIRMED,
        transactionId
      );
      
      // Should update PaymentIntentModel with confirmed status and hash
      expect(PaymentIntentModel.updateStatus).toHaveBeenCalledWith(
        reference,
        NormalizedPaymentStatus.CONFIRMED,
        'mined',
        transactionId,
        '0xconfirmed123',
        undefined
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          transaction: mockTransaction,
        })
      );
    });

    it('should default unknown status to pending (not confirmed)', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';
      const transactionId = 'tx-123';

      mockRequest.body = {
        payload: {
          status: 'success',
          reference,
          transaction_id: transactionId,
        },
      };
      (mockRequest as any).userId = userId;

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockTransaction = {
        status: 'unknown_status',
        transaction_id: transactionId,
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);
      (PaymentIntentModel.updateStatus as jest.Mock).mockResolvedValue({});
      (normalizeMiniKitStatus as jest.Mock).mockReturnValue(NormalizedPaymentStatus.PENDING);
      (extractTransactionHash as jest.Mock).mockReturnValue(null);
      (extractRawStatus as jest.Mock).mockReturnValue('unknown_status');
      mockedAxios.get.mockResolvedValue({ data: mockTransaction });

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      // Should NOT mark as confirmed
      expect(PaymentModel.updateStatus).not.toHaveBeenCalledWith(
        reference,
        PaymentStatus.CONFIRMED,
        expect.anything()
      );
      
      // Should normalize unknown status to PENDING
      expect(normalizeMiniKitStatus).toHaveBeenCalledWith('unknown_status');
      expect(PaymentIntentModel.updateStatus).toHaveBeenCalledWith(
        reference,
        NormalizedPaymentStatus.PENDING,
        'unknown_status',
        transactionId,
        undefined,
        undefined
      );
    });

    it('should extract status from transactionStatus field when status is missing', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';
      const transactionId = 'tx-123';

      mockRequest.body = {
        payload: {
          status: 'success',
          reference,
          transaction_id: transactionId,
        },
      };
      (mockRequest as any).userId = userId;

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Developer Portal returns transactionStatus but not status
      const mockTransaction = {
        transactionStatus: 'pending',
        transaction_id: transactionId,
        transactionHash: null,
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);
      (PaymentIntentModel.updateStatus as jest.Mock).mockResolvedValue({});
      (normalizeMiniKitStatus as jest.Mock).mockReturnValue(NormalizedPaymentStatus.PENDING);
      (extractTransactionHash as jest.Mock).mockReturnValue(null);
      (extractRawStatus as jest.Mock).mockReturnValue('pending');
      mockedAxios.get.mockResolvedValue({ data: mockTransaction });

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      // Should call normalizeMiniKitStatus with transactionStatus value
      expect(normalizeMiniKitStatus).toHaveBeenCalledWith('pending');
      
      // Should handle as pending without crashing
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          pending: true,
        })
      );
    });

    it('should prefer transactionStatus over status when both present', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';
      const transactionId = 'tx-123';

      mockRequest.body = {
        payload: {
          status: 'success',
          reference,
          transaction_id: transactionId,
        },
      };
      (mockRequest as any).userId = userId;

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Developer Portal returns both fields with different values
      const mockTransaction = {
        transactionStatus: 'mined',
        status: 'pending', // Should be ignored in favor of transactionStatus
        transaction_id: transactionId,
        transactionHash: '0xabc123',
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);
      (PaymentModel.updateStatus as jest.Mock).mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.CONFIRMED,
      });
      (PaymentIntentModel.updateStatus as jest.Mock).mockResolvedValue({});
      (normalizeMiniKitStatus as jest.Mock).mockReturnValue(NormalizedPaymentStatus.CONFIRMED);
      (extractTransactionHash as jest.Mock).mockReturnValue('0xabc123');
      (extractRawStatus as jest.Mock).mockReturnValue('mined');
      mockedAxios.get.mockResolvedValue({ data: mockTransaction });

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      // Should call normalizeMiniKitStatus with transactionStatus value, not status
      expect(normalizeMiniKitStatus).toHaveBeenCalledWith('mined');
      
      // Should confirm payment based on transactionStatus
      expect(PaymentModel.updateStatus).toHaveBeenCalledWith(
        reference,
        PaymentStatus.CONFIRMED,
        transactionId
      );
    });

    it('should handle missing transactionStatus and status gracefully', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';
      const transactionId = 'tx-123';

      mockRequest.body = {
        payload: {
          status: 'success',
          reference,
          transaction_id: transactionId,
        },
      };
      (mockRequest as any).userId = userId;

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Developer Portal returns neither transactionStatus nor status
      const mockTransaction = {
        transaction_id: transactionId,
        transactionHash: null,
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);
      (PaymentIntentModel.updateStatus as jest.Mock).mockResolvedValue({});
      (normalizeMiniKitStatus as jest.Mock).mockReturnValue(NormalizedPaymentStatus.PENDING);
      (extractTransactionHash as jest.Mock).mockReturnValue(null);
      (extractRawStatus as jest.Mock).mockReturnValue(undefined);
      mockedAxios.get.mockResolvedValue({ data: mockTransaction });

      await PaymentController.confirmPayment(
        mockRequest as Request,
        mockResponse as Response
      );

      // Should call normalizeMiniKitStatus with undefined (safely handled)
      expect(normalizeMiniKitStatus).toHaveBeenCalledWith(undefined);
      
      // Should default to pending and not crash
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          pending: true,
        })
      );
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status for valid reference', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';

      mockRequest.params = { reference };
      (mockRequest as any).userId = userId;

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.CONFIRMED,
        transaction_id: 'tx-123',
        created_at: new Date(),
        updated_at: new Date(),
        confirmed_at: new Date(),
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);

      await PaymentController.getPaymentStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          payment: expect.objectContaining({
            id: reference,
            amount: 0.5,
            status: PaymentStatus.CONFIRMED,
          }),
        })
      );
    });

    it('should return error if payment not found', async () => {
      mockRequest.params = { reference: 'nonexistent' };
      (mockRequest as any).userId = 'user-123';

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(null);

      await PaymentController.getPaymentStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Payment not found' });
    });

    it('should return error if user mismatch', async () => {
      const reference = 'test-ref';
      mockRequest.params = { reference };
      (mockRequest as any).userId = 'user-123';

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: 'different-user',
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);

      await PaymentController.getPaymentStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({ 
        error: 'Payment does not belong to this user' 
      });
    });
  });

  describe('getPaymentStatusPolling', () => {
    it('should return normalized payment status from payment_intents', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';

      mockRequest.params = { reference };
      (mockRequest as any).userId = userId;

      const mockPaymentIntent = {
        intent_id: 'intent-uuid',
        payment_reference: reference,
        user_id: userId,
        amount: 0.5,
        normalized_status: NormalizedPaymentStatus.CONFIRMED,
        minikit_transaction_id: 'tx-123',
        transaction_hash: '0xabc123',
        raw_status: 'mined',
        created_at: new Date(),
        updated_at: new Date(),
        confirmed_at: new Date(),
        last_error: null,
        retry_count: 0,
      };

      const mockPayment = {
        payment_id: 'payment-uuid',
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.CONFIRMED,
        transaction_id: 'tx-123',
        created_at: new Date(),
        updated_at: new Date(),
        confirmed_at: new Date(),
      };

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue(mockPaymentIntent);
      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);

      await PaymentController.getPaymentStatusPolling(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          payment: expect.objectContaining({
            id: reference,
            amount: 0.5,
            status: PaymentStatus.CONFIRMED,
            normalizedStatus: NormalizedPaymentStatus.CONFIRMED,
            transactionId: 'tx-123',
            transactionHash: '0xabc123',
            rawStatus: 'mined',
          }),
        })
      );
    });

    it('should return pending status for pending payment', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';

      mockRequest.params = { reference };
      (mockRequest as any).userId = userId;

      const mockPaymentIntent = {
        payment_reference: reference,
        user_id: userId,
        amount: 0.5,
        normalized_status: NormalizedPaymentStatus.PENDING,
        minikit_transaction_id: 'tx-123',
        raw_status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockPayment = {
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.PENDING,
        created_at: new Date(),
      };

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue(mockPaymentIntent);
      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);

      await PaymentController.getPaymentStatusPolling(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          payment: expect.objectContaining({
            normalizedStatus: NormalizedPaymentStatus.PENDING,
            status: PaymentStatus.PENDING,
          }),
        })
      );
    });

    it('should return failed status with error message', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';

      mockRequest.params = { reference };
      (mockRequest as any).userId = userId;

      const mockPaymentIntent = {
        payment_reference: reference,
        user_id: userId,
        amount: 0.5,
        normalized_status: NormalizedPaymentStatus.FAILED,
        raw_status: 'expired',
        last_error: 'Payment expired - no transaction ID received within timeout',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockPayment = {
        reference,
        user_id: userId,
        amount: 0.5,
        status: PaymentStatus.FAILED,
        created_at: new Date(),
      };

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue(mockPaymentIntent);
      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(mockPayment);

      await PaymentController.getPaymentStatusPolling(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          payment: expect.objectContaining({
            normalizedStatus: NormalizedPaymentStatus.FAILED,
            lastError: 'Payment expired - no transaction ID received within timeout',
          }),
        })
      );
    });

    it('should return 404 if payment intent not found', async () => {
      mockRequest.params = { reference: 'nonexistent' };
      (mockRequest as any).userId = 'user-123';

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue(null);

      await PaymentController.getPaymentStatusPolling(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Payment not found' });
    });

    it('should return 403 if user mismatch', async () => {
      const reference = 'test-ref';
      mockRequest.params = { reference };
      (mockRequest as any).userId = 'user-123';

      const mockPaymentIntent = {
        payment_reference: reference,
        user_id: 'different-user',
        amount: 0.5,
        normalized_status: NormalizedPaymentStatus.PENDING,
        created_at: new Date(),
      };

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue(mockPaymentIntent);

      await PaymentController.getPaymentStatusPolling(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({ 
        error: 'Payment does not belong to this user' 
      });
    });

    it('should handle missing payment gracefully', async () => {
      const userId = 'user-123';
      const reference = 'test-ref';

      mockRequest.params = { reference };
      (mockRequest as any).userId = userId;

      const mockPaymentIntent = {
        payment_reference: reference,
        user_id: userId,
        amount: 0.5,
        normalized_status: NormalizedPaymentStatus.PENDING,
        created_at: new Date(),
      };

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue(mockPaymentIntent);
      (PaymentModel.findByReference as jest.Mock).mockResolvedValue(null);

      await PaymentController.getPaymentStatusPolling(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          payment: expect.objectContaining({
            status: 'pending', // Default fallback
            normalizedStatus: NormalizedPaymentStatus.PENDING,
          }),
        })
      );
    });
  });
});
