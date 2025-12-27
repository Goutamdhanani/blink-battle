import { Request, Response } from 'express';
import { AuthController } from '../authController';
import * as redisClient from '../../config/redis';

// Mock Redis client
jest.mock('../../config/redis', () => ({
  __esModule: true,
  default: {
    isReady: true,
    setEx: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

// Mock UserModel
jest.mock('../../models/User', () => ({
  UserModel: {
    findByWallet: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
  },
}));

// Mock SIWE verification
jest.mock('@worldcoin/minikit-js', () => ({
  verifySiweMessage: jest.fn(),
}));

import { UserModel } from '../../models/User';
import { verifySiweMessage } from '@worldcoin/minikit-js';

describe('AuthController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    // Reset all mocks
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

    // Reset Redis mock to default state
    const redis = (redisClient as any).default;
    redis.isReady = true;
  });

  describe('getNonce', () => {
    it('should generate and return a nonce', async () => {
      const redis = (redisClient as any).default;
      redis.setEx.mockResolvedValue('OK');

      await AuthController.getNonce(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: expect.any(String),
          requestId: expect.any(String),
        })
      );
      expect(redis.setEx).toHaveBeenCalled();
    });

    it('should use in-memory fallback when Redis is unavailable', async () => {
      const redis = (redisClient as any).default;
      redis.isReady = false; // Redis not ready

      await AuthController.getNonce(
        mockRequest as Request,
        mockResponse as Response
      );

      // Should still succeed using in-memory fallback
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: expect.any(String),
          requestId: expect.any(String),
        })
      );
    });
  });

  describe('verifySiwe', () => {
    const mockPayload = {
      status: 'success',
      address: '0x1234567890123456789012345678901234567890',
      message: 'Sign in to Blink Battle',
      signature: '0xabcdef...',
    };

    it('should return 400 error when nonce is not provided', async () => {
      mockRequest.body = {
        payload: mockPayload,
        // nonce is missing
      };

      await AuthController.verifySiwe(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication failed: nonce is required',
          code: 'NONCE_REQUIRED',
          hint: 'The nonce parameter must be included in the request body',
        })
      );
    });

    it('should return 400 error when nonce format is invalid', async () => {
      mockRequest.body = {
        payload: mockPayload,
        nonce: 'abc', // Too short
      };

      await AuthController.verifySiwe(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication failed: invalid nonce format',
          code: 'INVALID_NONCE_FORMAT',
          hint: 'Nonce must be alphanumeric and at least 8 characters',
        })
      );
    });

    it('should return 401 error when nonce is not found in store', async () => {
      const redis = (redisClient as any).default;
      redis.get.mockResolvedValue(null); // Nonce not found

      mockRequest.body = {
        payload: mockPayload,
        nonce: 'validnonce12345678',
      };

      await AuthController.verifySiwe(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication failed: invalid or expired nonce',
          code: 'NONCE_NOT_FOUND',
          hint: 'Nonce may have expired or been used already. Please request a new nonce.',
        })
      );
    });

    it('should return 401 error when nonce is expired', async () => {
      const redis = (redisClient as any).default;
      // Nonce from 10 minutes ago (expired, max age is 5 minutes)
      const expiredTimestamp = Date.now() - 10 * 60 * 1000;
      redis.get.mockResolvedValue(expiredTimestamp.toString());

      mockRequest.body = {
        payload: mockPayload,
        nonce: 'validnonce12345678',
      };

      await AuthController.verifySiwe(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication failed: nonce expired',
          code: 'NONCE_EXPIRED',
          hint: 'Nonce is valid for 5 minutes. Please request a new nonce.',
        })
      );
    });

    it('should successfully verify SIWE and return user data with token', async () => {
      const redis = (redisClient as any).default;
      const currentTimestamp = Date.now();
      redis.get.mockResolvedValue(currentTimestamp.toString());
      redis.del.mockResolvedValue(1);

      const mockUser = {
        user_id: 'test-user-id',
        wallet_address: '0x1234567890123456789012345678901234567890',
        wins: 5,
        losses: 3,
        avg_reaction_time: 250,
      };

      (verifySiweMessage as jest.Mock).mockResolvedValue({
        isValid: true,
        siweMessageData: {
          address: '0x1234567890123456789012345678901234567890',
        },
      });

      (UserModel.findByWallet as jest.Mock).mockResolvedValue(mockUser);

      mockRequest.body = {
        payload: mockPayload,
        nonce: 'validnonce12345678',
      };

      await AuthController.verifySiwe(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(verifySiweMessage).toHaveBeenCalledWith(
        mockPayload,
        'validnonce12345678'
      );
      expect(redis.del).toHaveBeenCalled(); // Nonce should be deleted after use
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          token: expect.any(String),
          user: expect.objectContaining({
            userId: mockUser.user_id,
            walletAddress: mockUser.wallet_address,
          }),
        })
      );
    });

    it('should return 400 error when payload is invalid', async () => {
      mockRequest.body = {
        payload: { status: 'error', error_code: 'user_rejected' },
        nonce: 'validnonce12345678',
      };

      await AuthController.verifySiwe(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication failed: invalid payload',
          code: 'INVALID_PAYLOAD',
          errorCode: 'user_rejected',
        })
      );
    });

    it('should return 401 error when SIWE verification fails', async () => {
      const redis = (redisClient as any).default;
      const currentTimestamp = Date.now();
      redis.get.mockResolvedValue(currentTimestamp.toString());
      redis.del.mockResolvedValue(1);

      (verifySiweMessage as jest.Mock).mockRejectedValue(
        new Error('Signature verification failed')
      );

      mockRequest.body = {
        payload: mockPayload,
        nonce: 'validnonce12345678',
      };

      await AuthController.verifySiwe(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication failed: SIWE verification error',
          code: 'SIWE_VERIFICATION_FAILED',
        })
      );
      expect(redis.del).toHaveBeenCalled(); // Nonce should be deleted on failure
    });

    it('should create new user if wallet address not found', async () => {
      const redis = (redisClient as any).default;
      const currentTimestamp = Date.now();
      redis.get.mockResolvedValue(currentTimestamp.toString());
      redis.del.mockResolvedValue(1);

      const newUser = {
        user_id: 'new-user-id',
        wallet_address: '0x1234567890123456789012345678901234567890',
        wins: 0,
        losses: 0,
        avg_reaction_time: null,
      };

      (verifySiweMessage as jest.Mock).mockResolvedValue({
        isValid: true,
        siweMessageData: {
          address: '0x1234567890123456789012345678901234567890',
        },
      });

      (UserModel.findByWallet as jest.Mock).mockResolvedValue(null);
      (UserModel.create as jest.Mock).mockResolvedValue(newUser);

      mockRequest.body = {
        payload: mockPayload,
        nonce: 'validnonce12345678',
      };

      await AuthController.verifySiwe(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(UserModel.create).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
        undefined
      );
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          token: expect.any(String),
          user: expect.objectContaining({
            userId: newUser.user_id,
          }),
        })
      );
    });
  });
});
