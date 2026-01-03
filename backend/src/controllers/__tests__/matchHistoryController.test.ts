import { Request, Response } from 'express';
import { MatchController } from '../matchController';
import pool from '../../config/database';

// Mock the database pool
jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));

describe('MatchController.getMatchHistory', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn(() => ({ json: jsonMock }));
    
    req = {
      query: { limit: '20' },
    };
    
    res = {
      json: jsonMock,
      status: statusMock,
    };
    
    // Reset mocks
    jest.clearAllMocks();
  });

  it('should return success flag and matches in correct format', async () => {
    const userId = 'user-123';
    (req as any).userId = userId;

    // Mock the column check
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ column_name: 'refund_status' }] }) // Column exists
      .mockResolvedValueOnce({ // Match query
        rows: [
          {
            match_id: 'match-1',
            player1_id: userId,
            player2_id: 'user-456',
            stake: 10,
            status: 'completed',
            winner_id: userId,
            player1_reaction_ms: 150,
            player2_reaction_ms: 200,
            player1_wallet_addr: '0xAAA',
            player2_wallet_addr: '0xBBB',
            player1_avg_reaction: 160,
            player2_avg_reaction: 210,
            completed_at: new Date('2024-01-01T12:00:00Z'),
            claim_status: 'unclaimed',
            claim_deadline: new Date(Date.now() + 3600000), // 1 hour from now
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // Orphaned payments

    await MatchController.getMatchHistory(req as Request, res as Response);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        matches: expect.arrayContaining([
          expect.objectContaining({
            matchId: 'match-1',
            stake: 10,
            won: true,
            yourReaction: 150,
            opponentReaction: 200,
            opponent: expect.objectContaining({
              wallet: '0xBBB',
              avgReaction: 210,
            }),
            claimable: true,
            claimStatus: 'unclaimed',
          }),
        ]),
      })
    );
  });

  it('should filter matches older than 7 days', async () => {
    const userId = 'user-123';
    (req as any).userId = userId;

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [] }) // No refund columns
      .mockResolvedValueOnce({ rows: [] }); // No matches

    await MatchController.getMatchHistory(req as Request, res as Response);

    // Verify the query includes 7-day filter
    const matchQuery = (pool.query as jest.Mock).mock.calls[1][0];
    expect(matchQuery).toContain('completed_at >= $3');
    
    // Verify the params include 7 days ago
    const params = (pool.query as jest.Mock).mock.calls[1][1];
    expect(params[2]).toBeInstanceOf(Date);
  });

  it('should return success: false on error', async () => {
    const userId = 'user-123';
    (req as any).userId = userId;

    (pool.query as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

    await MatchController.getMatchHistory(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to get history',
      })
    );
  });

  it('should calculate claimTimeRemaining correctly', async () => {
    const userId = 'user-123';
    (req as any).userId = userId;

    const claimDeadline = new Date(Date.now() + 30000); // 30 seconds from now

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [] }) // No refund columns
      .mockResolvedValueOnce({
        rows: [
          {
            match_id: 'match-1',
            player1_id: userId,
            player2_id: 'user-456',
            stake: 10,
            status: 'completed',
            winner_id: userId,
            player1_reaction_ms: 150,
            player2_reaction_ms: 200,
            player1_wallet_addr: '0xAAA',
            player2_wallet_addr: '0xBBB',
            player1_avg_reaction: 160,
            player2_avg_reaction: 210,
            completed_at: new Date(),
            claim_status: 'unclaimed',
            claim_deadline: claimDeadline,
          },
        ],
      });

    await MatchController.getMatchHistory(req as Request, res as Response);

    const response = jsonMock.mock.calls[0][0];
    expect(response.matches[0].claimTimeRemaining).toBeGreaterThan(0);
    expect(response.matches[0].claimTimeRemaining).toBeLessThanOrEqual(30);
  });
});
