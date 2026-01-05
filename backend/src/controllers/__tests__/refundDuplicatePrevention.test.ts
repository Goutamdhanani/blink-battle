import { RefundController } from '../refundController';
import pool from '../../config/database';
import { TreasuryService } from '../../services/treasuryService';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../services/treasuryService');

describe('RefundController - Duplicate Claim Prevention', () => {
  let mockClient: any;
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database client with transaction support
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    (pool as any).connect = jest.fn().mockResolvedValue(mockClient);

    // Mock request and response
    mockRequest = {
      userId: 'user-123',
      body: {
        paymentReference: 'ref-123',
      },
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('should prevent duplicate refund claims with completed status', async () => {
    // Mock payment already refunded
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          payment_reference: 'ref-123',
          user_id: 'user-123',
          amount: 10,
          refund_status: 'completed', // Already refunded
          refund_deadline: new Date(Date.now() + 3600000).toISOString(),
        }],
      });

    await RefundController.claimRefund(mockRequest as any, mockResponse as any);

    // Should rollback and return error
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Refund already claimed',
      message: 'Refund already claimed',
      alreadyClaimed: true,
      refundStatus: 'completed',
    });
  });

  it('should prevent duplicate refund claims with processing status', async () => {
    // Mock payment currently being processed
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          payment_reference: 'ref-123',
          user_id: 'user-123',
          amount: 10,
          refund_status: 'processing', // Currently processing
          refund_deadline: new Date(Date.now() + 3600000).toISOString(),
        }],
      });

    await RefundController.claimRefund(mockRequest as any, mockResponse as any);

    // Should rollback and return error
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Refund already in progress',
      message: 'Refund already claimed',
      alreadyClaimed: true,
      refundStatus: 'processing',
    });
  });

  it('should allow refund claim for eligible status', async () => {
    const mockTxHash = '0xabcd1234';
    
    // Mock successful refund flow
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          payment_reference: 'ref-123',
          user_id: 'user-123',
          amount: 10,
          refund_status: 'eligible',
          refund_deadline: new Date(Date.now() + 3600000).toISOString(),
        }],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE to processing
      .mockResolvedValueOnce({
        rows: [{ wallet_address: '0x123' }],
      }) // SELECT wallet
      .mockResolvedValueOnce({ rows: [] }) // UPDATE to completed
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    (TreasuryService.sendPayout as jest.Mock).mockResolvedValue(mockTxHash);

    await RefundController.claimRefund(mockRequest as any, mockResponse as any);

    // Should complete successfully
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        transactionHash: mockTxHash,
      })
    );
  });

  it('should prevent duplicate claim-deposit with completed status', async () => {
    // Mock payment already refunded
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          payment_reference: 'ref-123',
          user_id: 'user-123',
          amount: 10,
          match_id: null, // Orphaned
          normalized_status: 'confirmed',
          refund_status: 'completed', // Already refunded
        }],
      });

    await RefundController.claimDeposit(mockRequest as any, mockResponse as any);

    // Should rollback and return error
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Already refunded',
      alreadyClaimed: true,
      refundStatus: 'completed',
    });
  });

  it('should prevent duplicate claim-deposit with processing status', async () => {
    // Mock payment currently being processed
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          payment_reference: 'ref-123',
          user_id: 'user-123',
          amount: 10,
          match_id: null, // Orphaned
          normalized_status: 'confirmed',
          refund_status: 'processing', // Currently processing
        }],
      });

    await RefundController.claimDeposit(mockRequest as any, mockResponse as any);

    // Should rollback and return error
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Refund already in progress',
      alreadyClaimed: true,
      refundStatus: 'processing',
    });
  });
});
