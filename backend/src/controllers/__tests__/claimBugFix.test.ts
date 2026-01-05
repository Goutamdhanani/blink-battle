/**
 * Test for Issue #1: Buggy Reward Claim Process
 * 
 * This test validates the fix for the claim bug where:
 * - First call results in 400 Bad Request
 * - Second call returns 'Already Claimed'
 * 
 * The fix implements:
 * - match_result field (WIN/LOSS/DRAW/NO_MATCH) for proper state tracking
 * - payout_state field (NOT_PAID/PAID) for idempotent payment tracking
 * - Atomic transactions with row-level locking
 * - Proper validation: only WIN can claim, LOSS gets 403
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ClaimController } from '../claimController';
import pool from '../../config/database';
import { TreasuryService } from '../../services/treasuryService';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../services/treasuryService');

describe('Issue #1: Buggy Reward Claim Process - Fix Validation', () => {
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

    (pool as any).connect = jest.fn<any, any>().mockResolvedValue(mockClient);
    (pool as any).query = jest.fn<any, any>();

    // Mock request and response
    mockRequest = {
      userId: 'winner-user-123',
      body: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('WIN state validation', () => {
    it('should allow claim when match_result is WIN and payout_state is NOT_PAID', async () => {
      mockRequest.body = { matchId: 'match-win-123' };

      const mockTxHash = '0xwinning123';
      (TreasuryService.sendPayout as any) = jest.fn<any, any>().mockResolvedValue(mockTxHash);

      // Mock user lookup
      (pool as any).query.mockResolvedValueOnce({
        rows: [{ wallet_address: '0xwinner' }],
      });

      // Mock match query with WIN result and NOT_PAID state
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            match_id: 'match-win-123',
            player1_id: 'winner-user-123',
            player2_id: 'loser-user-456',
            status: 'completed',
            winner_id: 'winner-user-123',
            winner_wallet: '0xwinner',
            player1_wallet: '0xwinner',
            player2_wallet: '0xloser',
            player1_match_result: 'WIN',
            player2_match_result: 'LOSS',
            player1_payout_state: 'NOT_PAID',
            player2_payout_state: 'NOT_PAID',
            claim_status: 'unclaimed',
            stake: '100000000000000000', // 0.1 WLD in wei
            claim_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // Check existing claims
        .mockResolvedValueOnce({ rows: [] }) // Check idempotency
        .mockResolvedValueOnce({
          // Payment intents
          rows: [{
            payment_reference: 'ref-123',
            amount: 0.1,
            total_claimed_amount: 0,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // Mark payment used
        .mockResolvedValueOnce({ rows: [] }) // Insert claim
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await ClaimController.claimWinnings(mockRequest as any, mockResponse as any);

      // Should commit transaction
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      
      // Should process payout
      expect(TreasuryService.sendPayout).toHaveBeenCalled();
      
      // Should return success
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          txHash: mockTxHash,
        })
      );
    });

    it('should return idempotent response when payout_state is already PAID', async () => {
      mockRequest.body = { matchId: 'match-already-paid' };

      // Mock user lookup
      (pool as any).query.mockResolvedValueOnce({
        rows: [{ wallet_address: '0xwinner' }],
      });

      // Mock match query with WIN result but PAID state
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            match_id: 'match-already-paid',
            player1_id: 'winner-user-123',
            player2_id: 'loser-user-456',
            status: 'completed',
            winner_id: 'winner-user-123',
            winner_wallet: '0xwinner',
            player1_wallet: '0xwinner',
            player2_wallet: '0xloser',
            player1_match_result: 'WIN',
            player2_match_result: 'LOSS',
            player1_payout_state: 'PAID', // Already paid!
            player2_payout_state: 'NOT_PAID',
            claim_status: 'claimed',
            stake: '100000000000000000',
          }],
        })
        .mockResolvedValueOnce({
          // Existing claim
          rows: [{
            claim_transaction_hash: '0xold-tx-hash',
            tx_hash: '0xold-tx-hash',
          }],
        });

      await ClaimController.claimWinnings(mockRequest as any, mockResponse as any);

      // Should rollback (idempotent check)
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      
      // Should NOT process new payout
      expect(TreasuryService.sendPayout).not.toHaveBeenCalled();
      
      // Should return error indicating already claimed
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Winnings already claimed',
          alreadyClaimed: true,
          txHash: '0xold-tx-hash',
        })
      );
    });
  });

  describe('LOSS state validation', () => {
    it('should reject claim with 403 when match_result is LOSS', async () => {
      mockRequest.body = { matchId: 'match-loss-123' };
      mockRequest.userId = 'loser-user-456'; // This user lost

      // Mock user lookup
      (pool as any).query.mockResolvedValueOnce({
        rows: [{ wallet_address: '0xloser' }],
      });

      // Mock match query with LOSS result
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            match_id: 'match-loss-123',
            player1_id: 'winner-user-123',
            player2_id: 'loser-user-456',
            status: 'completed',
            winner_id: 'winner-user-123',
            winner_wallet: '0xwinner',
            player1_wallet: '0xwinner',
            player2_wallet: '0xloser',
            player1_match_result: 'WIN',
            player2_match_result: 'LOSS', // Loser tries to claim
            player1_payout_state: 'NOT_PAID',
            player2_payout_state: 'NOT_PAID',
            claim_status: 'unclaimed',
            stake: '100000000000000000',
          }],
        });

      await ClaimController.claimWinnings(mockRequest as any, mockResponse as any);

      // Should rollback
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      
      // Should reject with 403 Forbidden
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Not the winner of this match',
          matchResult: 'LOSS',
        })
      );
      
      // Should NOT process payout
      expect(TreasuryService.sendPayout).not.toHaveBeenCalled();
    });
  });

  describe('DRAW state validation', () => {
    it('should reject claim with 403 when match_result is DRAW', async () => {
      mockRequest.body = { matchId: 'match-draw-123' };

      // Mock user lookup
      (pool as any).query.mockResolvedValueOnce({
        rows: [{ wallet_address: '0xplayer1' }],
      });

      // Mock match query with DRAW result
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            match_id: 'match-draw-123',
            player1_id: 'winner-user-123',
            player2_id: 'player2-456',
            status: 'completed',
            winner_id: null, // No winner
            player1_wallet: '0xplayer1',
            player2_wallet: '0xplayer2',
            player1_match_result: 'DRAW',
            player2_match_result: 'DRAW',
            player1_payout_state: 'NOT_PAID',
            player2_payout_state: 'NOT_PAID',
            claim_status: 'unclaimed',
            stake: '100000000000000000',
          }],
        });

      await ClaimController.claimWinnings(mockRequest as any, mockResponse as any);

      // Should rollback
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      
      // Should reject with 403 and suggest refund
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Cannot claim - match ended in a draw',
          details: expect.stringContaining('refund'),
          matchResult: 'DRAW',
        })
      );
      
      // Should NOT process payout
      expect(TreasuryService.sendPayout).not.toHaveBeenCalled();
    });
  });

  describe('Race condition protection', () => {
    it('should handle concurrent claim attempts with row-level locking', async () => {
      mockRequest.body = { matchId: 'match-race-123' };

      const mockTxHash = '0xrace123';
      (TreasuryService.sendPayout as any) = jest.fn<any, any>().mockResolvedValue(mockTxHash);

      // Mock user lookup
      (pool as any).query.mockResolvedValueOnce({
        rows: [{ wallet_address: '0xwinner' }],
      });

      // First request locks the row with FOR UPDATE
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            match_id: 'match-race-123',
            player1_id: 'winner-user-123',
            player2_id: 'loser-user-456',
            status: 'completed',
            winner_id: 'winner-user-123',
            winner_wallet: '0xwinner',
            player1_wallet: '0xwinner',
            player2_wallet: '0xloser',
            player1_match_result: 'WIN',
            player2_match_result: 'LOSS',
            player1_payout_state: 'NOT_PAID',
            player2_payout_state: 'NOT_PAID',
            claim_status: 'unclaimed',
            stake: '100000000000000000',
            claim_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // Check existing claims
        .mockResolvedValueOnce({ rows: [] }) // Check idempotency
        .mockResolvedValueOnce({
          rows: [{
            payment_reference: 'ref-race',
            amount: 0.1,
            total_claimed_amount: 0,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // Mark payment used
        .mockResolvedValueOnce({ rows: [] }) // Insert claim
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await ClaimController.claimWinnings(mockRequest as any, mockResponse as any);

      // Verify FOR UPDATE was used for row-level locking
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM matches WHERE match_id = $1 FOR UPDATE',
        ['match-race-123']
      );

      // Verify transaction committed successfully
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });
});

console.log('✅ Issue #1 claim bug fix tests defined');
console.log('Run with: npm test -- --testPathPattern=claimBugFix.test');
