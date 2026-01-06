import { Request, Response } from 'express';
import { WorldcoinController } from '../worldcoinController';
import { verifyCloudProof } from '@worldcoin/minikit-js';
import pool from '../../config/database';

// Mock the database pool
jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));

// Mock verifyCloudProof from @worldcoin/minikit-js
jest.mock('@worldcoin/minikit-js', () => ({
  verifyCloudProof: jest.fn(),
}));

// Extended Request interface with authenticated user
interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    walletAddress?: string;
  };
}

describe('WorldcoinController', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  // Store original env vars
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Reset environment variables
    process.env = { ...originalEnv };
    process.env.APP_ID = 'app_39ba2bf031c9925d1ba3521a305568d8';
    process.env.WORLD_ID_ACTION = 'blink-battle';

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockRequest = {
      body: {},
      user: undefined,
    };

    mockResponse = {
      json: jsonMock,
      status: statusMock,
    };
  });

  afterEach(() => {
    // Restore original env vars
    process.env = originalEnv;
  });

  describe('verifyWorldId', () => {
    const validRequestBody = {
      proof: 'valid_proof_string',
      merkle_root: 'valid_merkle_root',
      nullifier_hash: 'valid_nullifier_hash',
      verification_level: 'orb',
      signal: 'user_123',
    };

    it('should return 400 when proof is missing', async () => {
      mockRequest.body = {
        merkle_root: 'valid_merkle_root',
        nullifier_hash: 'valid_nullifier_hash',
        signal: 'user_123',
      };

      await WorldcoinController.verifyWorldId(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Missing required fields: proof, merkle_root, nullifier_hash',
        })
      );
    });

    it('should return 400 when signal is missing', async () => {
      mockRequest.body = {
        proof: 'valid_proof_string',
        merkle_root: 'valid_merkle_root',
        nullifier_hash: 'valid_nullifier_hash',
        verification_level: 'orb',
      };

      await WorldcoinController.verifyWorldId(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Missing required field: signal',
        })
      );
    });

    it('should return 500 when APP_ID is not configured', async () => {
      delete process.env.APP_ID;
      mockRequest.body = validRequestBody;

      await WorldcoinController.verifyWorldId(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Server configuration error: APP_ID not set or invalid format',
        })
      );
    });

    it('should use WORLD_ID_ACTION from environment', async () => {
      mockRequest.body = validRequestBody;
      (verifyCloudProof as jest.Mock).mockResolvedValue({ success: true });
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await WorldcoinController.verifyWorldId(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(verifyCloudProof).toHaveBeenCalledWith(
        'valid_proof_string',
        'app_39ba2bf031c9925d1ba3521a305568d8',
        'blink-battle',
        'user_123'
      );
    });

    it('should fallback to WORLDCOIN_ACTION when WORLD_ID_ACTION is not set', async () => {
      delete process.env.WORLD_ID_ACTION;
      process.env.WORLDCOIN_ACTION = 'fallback-action';
      mockRequest.body = validRequestBody;
      (verifyCloudProof as jest.Mock).mockResolvedValue({ success: true });
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await WorldcoinController.verifyWorldId(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(verifyCloudProof).toHaveBeenCalledWith(
        'valid_proof_string',
        'app_39ba2bf031c9925d1ba3521a305568d8',
        'fallback-action',
        'user_123'
      );
    });

    it('should call verifyCloudProof with signal parameter', async () => {
      mockRequest.body = validRequestBody;
      (verifyCloudProof as jest.Mock).mockResolvedValue({ success: true });
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await WorldcoinController.verifyWorldId(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      // Verify that verifyCloudProof was called with signal as 4th parameter
      expect(verifyCloudProof).toHaveBeenCalledWith(
        'valid_proof_string',
        'app_39ba2bf031c9925d1ba3521a305568d8',
        'blink-battle',
        'user_123' // This is the signal from request body
      );
    });

    it('should return 400 when verification fails', async () => {
      mockRequest.body = validRequestBody;
      (verifyCloudProof as jest.Mock).mockResolvedValue({
        success: false,
        detail: 'Invalid proof',
        code: 'invalid_proof',
      });

      await WorldcoinController.verifyWorldId(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'World ID verification failed',
          detail: 'Invalid proof',
          code: 'invalid_proof',
        })
      );
    });

    it('should return 409 when nullifier is already used', async () => {
      mockRequest.body = validRequestBody;
      (verifyCloudProof as jest.Mock).mockResolvedValue({ success: true });
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{ id: 1, wallet_address: '0x123' }],
      });

      await WorldcoinController.verifyWorldId(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'This World ID has already been used',
          code: 'DUPLICATE_NULLIFIER',
        })
      );
    });

    it('should successfully verify and store nullifier for authenticated user', async () => {
      mockRequest.body = validRequestBody;
      mockRequest.user = { userId: 123, walletAddress: '0xabc' };
      
      (verifyCloudProof as jest.Mock).mockResolvedValue({ success: true });
      // First query: check for existing nullifier (none found)
      // Second query: update user
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await WorldcoinController.verifyWorldId(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          nullifier_hash: 'valid_nullifier_hash',
          verification_level: 'orb',
          message: 'World ID verified successfully',
        })
      );

      // Verify that update query was called
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        expect.arrayContaining(['valid_nullifier_hash', 'orb', 123])
      );
    });

    it('should successfully verify and store verification for unauthenticated user', async () => {
      mockRequest.body = validRequestBody;
      // No user attached to request
      
      (verifyCloudProof as jest.Mock).mockResolvedValue({ success: true });
      // First query: check for existing nullifier (none found)
      // Second query: insert verification
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await WorldcoinController.verifyWorldId(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          nullifier_hash: 'valid_nullifier_hash',
          verification_level: 'orb',
          message: 'World ID verified successfully',
        })
      );

      // Verify that insert query was called
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO world_id_verifications'),
        expect.arrayContaining(['valid_nullifier_hash', 'orb'])
      );
    });

    it('should handle errors gracefully', async () => {
      mockRequest.body = validRequestBody;
      (verifyCloudProof as jest.Mock).mockRejectedValue(new Error('Network error'));

      await WorldcoinController.verifyWorldId(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Internal server error during verification',
          detail: 'Network error',
        })
      );
    });
  });

  describe('checkNullifier', () => {
    it('should return true when nullifier exists', async () => {
      mockRequest.params = { nullifier: 'existing_nullifier' };
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{ exists: true }],
      });

      await WorldcoinController.checkNullifier(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith({ exists: true });
    });

    it('should return false when nullifier does not exist', async () => {
      mockRequest.params = { nullifier: 'non_existing_nullifier' };
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{ exists: false }],
      });

      await WorldcoinController.checkNullifier(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith({ exists: false });
    });

    it('should handle database errors', async () => {
      mockRequest.params = { nullifier: 'test_nullifier' };
      (pool.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      await WorldcoinController.checkNullifier(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to check nullifier',
        })
      );
    });
  });
});
