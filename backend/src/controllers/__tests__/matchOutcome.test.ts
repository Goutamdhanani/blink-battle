import { MatchController } from '../matchController';
import pool from '../../config/database';

// Mock dependencies
jest.mock('../../config/database');

describe('MatchController - Match Outcome Rendering', () => {
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      userId: 'user-123',
      query: { limit: '20' },
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('should render win outcome for matches with winner', async () => {
    const mockMatches = {
      rows: [
        {
          match_id: 'match-1',
          player1_id: 'user-123',
          player2_id: 'user-456',
          winner_id: 'user-123',
          stake: 10,
          status: 'completed',
          result_type: 'normal_win',
          player1_reaction_ms: 250,
          player2_reaction_ms: 300,
          completed_at: new Date().toISOString(),
          player1_wallet_addr: '0xabc',
          player2_wallet_addr: '0xdef',
          claim_status: 'unclaimed',
          claim_deadline: new Date(Date.now() + 3600000).toISOString(),
        },
      ],
    };

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ column_name: 'refund_status' }] }) // Refund columns exist
      .mockResolvedValueOnce(mockMatches) // Match query
      .mockResolvedValueOnce({ rows: [] }); // Orphaned payments

    await MatchController.getMatchHistory(mockRequest as any, mockResponse as any);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        matches: expect.arrayContaining([
          expect.objectContaining({
            matchId: 'match-1',
            outcome: 'win',
            won: true,
            claimable: true,
          }),
        ]),
      })
    );
  });

  it('should render loss outcome for matches with different winner', async () => {
    const mockMatches = {
      rows: [
        {
          match_id: 'match-1',
          player1_id: 'user-123',
          player2_id: 'user-456',
          winner_id: 'user-456', // Different winner
          stake: 10,
          status: 'completed',
          result_type: 'normal_win',
          player1_reaction_ms: 300,
          player2_reaction_ms: 250,
          completed_at: new Date().toISOString(),
          player1_wallet_addr: '0xabc',
          player2_wallet_addr: '0xdef',
        },
      ],
    };

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ column_name: 'refund_status' }] })
      .mockResolvedValueOnce(mockMatches)
      .mockResolvedValueOnce({ rows: [] });

    await MatchController.getMatchHistory(mockRequest as any, mockResponse as any);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        matches: expect.arrayContaining([
          expect.objectContaining({
            matchId: 'match-1',
            outcome: 'loss',
            won: false,
            canRefund: false, // Loss doesn't get refund
          }),
        ]),
      })
    );
  });

  it('should render draw outcome for tie matches', async () => {
    const mockMatches = {
      rows: [
        {
          match_id: 'match-1',
          player1_id: 'user-123',
          player2_id: 'user-456',
          winner_id: null, // No winner
          stake: 10,
          status: 'cancelled',
          result_type: 'tie',
          player1_reaction_ms: 250,
          player2_reaction_ms: 250,
          completed_at: new Date().toISOString(),
          player1_wallet_addr: '0xabc',
          player2_wallet_addr: '0xdef',
          refund_status: 'eligible',
          refund_deadline: new Date(Date.now() + 3600000).toISOString(),
          refund_reason: 'tie',
        },
      ],
    };

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ column_name: 'refund_status' }] })
      .mockResolvedValueOnce(mockMatches)
      .mockResolvedValueOnce({ rows: [] });

    await MatchController.getMatchHistory(mockRequest as any, mockResponse as any);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        matches: expect.arrayContaining([
          expect.objectContaining({
            matchId: 'match-1',
            outcome: 'draw',
            won: false,
            canRefund: true, // Draw is eligible for refund
            refundStatus: 'eligible',
          }),
        ]),
      })
    );
  });

  it('should render draw outcome for both_disqualified matches', async () => {
    const mockMatches = {
      rows: [
        {
          match_id: 'match-1',
          player1_id: 'user-123',
          player2_id: 'user-456',
          winner_id: null,
          stake: 10,
          status: 'cancelled',
          result_type: 'both_disqualified',
          player1_reaction_ms: -1,
          player2_reaction_ms: -1,
          completed_at: new Date().toISOString(),
          player1_wallet_addr: '0xabc',
          player2_wallet_addr: '0xdef',
          refund_status: 'eligible',
          refund_deadline: new Date(Date.now() + 3600000).toISOString(),
          refund_reason: 'both_disqualified',
        },
      ],
    };

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ column_name: 'refund_status' }] })
      .mockResolvedValueOnce(mockMatches)
      .mockResolvedValueOnce({ rows: [] });

    await MatchController.getMatchHistory(mockRequest as any, mockResponse as any);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        matches: expect.arrayContaining([
          expect.objectContaining({
            matchId: 'match-1',
            outcome: 'draw',
            canRefund: true,
            refundReason: 'both_disqualified',
          }),
        ]),
      })
    );
  });

  it('should render cancelled outcome for cancelled matches', async () => {
    const mockMatches = {
      rows: [
        {
          match_id: 'match-1',
          player1_id: 'user-123',
          player2_id: 'user-456',
          winner_id: null,
          stake: 10,
          status: 'cancelled',
          cancelled: true,
          result_type: null,
          player1_reaction_ms: -1,
          player2_reaction_ms: -1,
          completed_at: new Date().toISOString(),
          player1_wallet_addr: '0xabc',
          player2_wallet_addr: '0xdef',
          refund_status: 'eligible',
          refund_deadline: new Date(Date.now() + 3600000).toISOString(),
          refund_reason: 'matchmaking_cancelled',
        },
      ],
    };

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ column_name: 'refund_status' }] })
      .mockResolvedValueOnce(mockMatches)
      .mockResolvedValueOnce({ rows: [] });

    await MatchController.getMatchHistory(mockRequest as any, mockResponse as any);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        matches: expect.arrayContaining([
          expect.objectContaining({
            matchId: 'match-1',
            outcome: 'cancelled',
            canRefund: true,
          }),
        ]),
      })
    );
  });

  it('should not allow refund claim for completed refunds', async () => {
    const mockMatches = {
      rows: [
        {
          match_id: 'match-1',
          player1_id: 'user-123',
          player2_id: 'user-456',
          winner_id: null,
          stake: 10,
          status: 'cancelled',
          result_type: 'tie',
          player1_reaction_ms: 250,
          player2_reaction_ms: 250,
          completed_at: new Date().toISOString(),
          player1_wallet_addr: '0xabc',
          player2_wallet_addr: '0xdef',
          refund_status: 'completed', // Already refunded
          refund_deadline: new Date(Date.now() + 3600000).toISOString(),
        },
      ],
    };

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ column_name: 'refund_status' }] })
      .mockResolvedValueOnce(mockMatches)
      .mockResolvedValueOnce({ rows: [] });

    await MatchController.getMatchHistory(mockRequest as any, mockResponse as any);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        matches: expect.arrayContaining([
          expect.objectContaining({
            matchId: 'match-1',
            outcome: 'draw',
            canRefund: false, // Already refunded, can't claim again
            refundStatus: 'completed',
          }),
        ]),
      })
    );
  });
});
