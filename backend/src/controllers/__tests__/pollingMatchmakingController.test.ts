import { Request, Response } from 'express';
import { PollingMatchmakingController } from '../pollingMatchmakingController';
import { PaymentIntentModel, NormalizedPaymentStatus } from '../../models/PaymentIntent';
import { MatchQueueModel, QueueStatus } from '../../models/MatchQueue';
import { MatchModel } from '../../models/Match';
import { UserModel } from '../../models/User';

// Mock models
jest.mock('../../models/PaymentIntent');
jest.mock('../../models/MatchQueue');
jest.mock('../../models/Match');
jest.mock('../../models/User');
jest.mock('../../services/escrow');

describe('PollingMatchmakingController - Payment Gating', () => {
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
  });

  describe('join - Payment Gating', () => {
    it('should allow free matches (stake = 0) without payment', async () => {
      const userId = 'user-123';
      
      mockRequest.body = { stake: 0 };
      (mockRequest as any).userId = userId;

      (MatchQueueModel.findByUserId as jest.Mock).mockResolvedValue(null);
      (MatchModel.findById as jest.Mock).mockResolvedValue(null);
      (MatchQueueModel.findMatch as jest.Mock).mockResolvedValue(null);
      (MatchQueueModel.enqueue as jest.Mock).mockResolvedValue({
        queue_id: 'queue-123',
        user_id: userId,
        stake: 0,
        status: QueueStatus.SEARCHING,
        expires_at: new Date(),
      });

      await PollingMatchmakingController.join(
        mockRequest as Request,
        mockResponse as Response
      );

      // Should not check for payment
      expect(PaymentIntentModel.findByReference).not.toHaveBeenCalled();
      
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'searching',
          stake: 0,
        })
      );
    });

    it('should require paymentReference for staked matches', async () => {
      const userId = 'user-123';
      
      mockRequest.body = { stake: 0.1 };
      (mockRequest as any).userId = userId;

      await PollingMatchmakingController.join(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Payment required for staked matches',
          requiresPayment: true,
          stake: 0.1,
        })
      );
    });

    it('should reject join when payment not found', async () => {
      const userId = 'user-123';
      const paymentReference = 'payment-ref-123';
      
      mockRequest.body = { stake: 0.1, paymentReference };
      (mockRequest as any).userId = userId;

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue(null);

      await PollingMatchmakingController.join(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Payment not found',
          paymentReference,
        })
      );
    });

    it('should reject join when payment belongs to different user', async () => {
      const userId = 'user-123';
      const paymentReference = 'payment-ref-123';
      
      mockRequest.body = { stake: 0.1, paymentReference };
      (mockRequest as any).userId = userId;

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue({
        intent_id: 'intent-123',
        payment_reference: paymentReference,
        user_id: 'different-user',
        amount: 0.1,
        normalized_status: NormalizedPaymentStatus.CONFIRMED,
      });

      await PollingMatchmakingController.join(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Payment does not belong to this user',
        })
      );
    });

    it('should reject join when payment is pending (403 with clear message)', async () => {
      const userId = 'user-123';
      const paymentReference = 'payment-ref-123';
      
      mockRequest.body = { stake: 0.1, paymentReference };
      (mockRequest as any).userId = userId;

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue({
        intent_id: 'intent-123',
        payment_reference: paymentReference,
        user_id: userId,
        amount: 0.1,
        normalized_status: NormalizedPaymentStatus.PENDING,
      });

      await PollingMatchmakingController.join(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Payment not confirmed'),
          status: NormalizedPaymentStatus.PENDING,
          requiresPayment: true,
        })
      );
    });

    it('should reject join when payment is failed', async () => {
      const userId = 'user-123';
      const paymentReference = 'payment-ref-123';
      
      mockRequest.body = { stake: 0.1, paymentReference };
      (mockRequest as any).userId = userId;

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue({
        intent_id: 'intent-123',
        payment_reference: paymentReference,
        user_id: userId,
        amount: 0.1,
        normalized_status: NormalizedPaymentStatus.FAILED,
      });

      await PollingMatchmakingController.join(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Payment not confirmed'),
          status: NormalizedPaymentStatus.FAILED,
        })
      );
    });

    it('should reject join when payment is cancelled', async () => {
      const userId = 'user-123';
      const paymentReference = 'payment-ref-123';
      
      mockRequest.body = { stake: 0.1, paymentReference };
      (mockRequest as any).userId = userId;

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue({
        intent_id: 'intent-123',
        payment_reference: paymentReference,
        user_id: userId,
        amount: 0.1,
        normalized_status: NormalizedPaymentStatus.CANCELLED,
      });

      await PollingMatchmakingController.join(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Payment not confirmed'),
          status: NormalizedPaymentStatus.CANCELLED,
        })
      );
    });

    it('should allow join when payment is confirmed', async () => {
      const userId = 'user-123';
      const paymentReference = 'payment-ref-123';
      
      mockRequest.body = { stake: 0.1, paymentReference };
      (mockRequest as any).userId = userId;

      (PaymentIntentModel.findByReference as jest.Mock).mockResolvedValue({
        intent_id: 'intent-123',
        payment_reference: paymentReference,
        user_id: userId,
        amount: 0.1,
        normalized_status: NormalizedPaymentStatus.CONFIRMED,
        confirmed_at: new Date(),
      });

      (MatchQueueModel.findByUserId as jest.Mock).mockResolvedValue(null);
      (MatchModel.findById as jest.Mock).mockResolvedValue(null);
      (MatchQueueModel.findMatch as jest.Mock).mockResolvedValue(null);
      (MatchQueueModel.enqueue as jest.Mock).mockResolvedValue({
        queue_id: 'queue-123',
        user_id: userId,
        stake: 0.1,
        status: QueueStatus.SEARCHING,
        expires_at: new Date(),
      });

      await PollingMatchmakingController.join(
        mockRequest as Request,
        mockResponse as Response
      );

      // Should successfully join queue
      expect(PaymentIntentModel.findByReference).toHaveBeenCalledWith(paymentReference);
      expect(MatchQueueModel.enqueue).toHaveBeenCalledWith(userId, 0.1);
      
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'searching',
          stake: 0.1,
        })
      );
    });
  });
});
