import { Request, Response } from 'express';
import { PollingMatchController } from '../pollingMatchController';
import { MatchModel } from '../../models/Match';
import { TapEventModel } from '../../models/TapEvent';
import pool from '../../config/database';

// Mock dependencies
jest.mock('../../models/Match');
jest.mock('../../models/TapEvent');
jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));

describe('PollingMatchController.tap - Reaction Time Validation', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn(() => ({ json: jsonMock }));
    
    req = {
      body: {},
    };
    
    res = {
      json: jsonMock,
      status: statusMock,
    };
    
    jest.clearAllMocks();
  });

  describe('Client timestamp validation', () => {
    it('should ignore negative client timestamps and use server time', async () => {
      const userId = 'user-123';
      const matchId = 'match-1';
      (req as any).userId = userId;
      req.body = { matchId, clientTimestamp: -100 };

      const greenLightTime = Date.now() - 500; // 500ms ago
      (MatchModel.findById as jest.Mock).mockResolvedValue({
        match_id: matchId,
        player1_id: userId,
        player2_id: 'user-456',
        green_light_time: greenLightTime,
      });

      (TapEventModel.create as jest.Mock).mockResolvedValue({
        tap_id: 'tap-1',
        user_id: userId,
        reaction_ms: 500,
        is_valid: true,
        disqualified: false,
      });

      (TapEventModel.findByMatchId as jest.Mock).mockResolvedValue([
        {
          tap_id: 'tap-1',
          user_id: userId,
          reaction_ms: 500,
          is_valid: true,
          disqualified: false,
        },
      ]);

      (MatchModel.recordReaction as jest.Mock).mockResolvedValue(undefined);

      await PollingMatchController.tap(req as Request, res as Response);

      // Should succeed using server timestamp (malformed client timestamp ignored)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should ignore zero client timestamps and use server time', async () => {
      const userId = 'user-123';
      const matchId = 'match-1';
      (req as any).userId = userId;
      req.body = { matchId, clientTimestamp: 0 };

      const greenLightTime = Date.now() - 500;
      (MatchModel.findById as jest.Mock).mockResolvedValue({
        match_id: matchId,
        player1_id: userId,
        player2_id: 'user-456',
        green_light_time: greenLightTime,
      });

      (TapEventModel.create as jest.Mock).mockResolvedValue({
        tap_id: 'tap-1',
        user_id: userId,
        reaction_ms: 500,
        is_valid: true,
        disqualified: false,
      });

      (TapEventModel.findByMatchId as jest.Mock).mockResolvedValue([
        {
          tap_id: 'tap-1',
          user_id: userId,
          reaction_ms: 500,
          is_valid: true,
          disqualified: false,
        },
      ]);

      (MatchModel.recordReaction as jest.Mock).mockResolvedValue(undefined);

      await PollingMatchController.tap(req as Request, res as Response);

      // Should succeed using server timestamp
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should ignore future client timestamps and use server time', async () => {
      const userId = 'user-123';
      const matchId = 'match-1';
      const futureTimestamp = Date.now() + 10000; // 10 seconds in the future
      (req as any).userId = userId;
      req.body = { matchId, clientTimestamp: futureTimestamp };

      const greenLightTime = Date.now() - 500;
      (MatchModel.findById as jest.Mock).mockResolvedValue({
        match_id: matchId,
        player1_id: userId,
        player2_id: 'user-456',
        green_light_time: greenLightTime,
      });

      (TapEventModel.create as jest.Mock).mockResolvedValue({
        tap_id: 'tap-1',
        user_id: userId,
        reaction_ms: 500,
        is_valid: true,
        disqualified: false,
      });

      (TapEventModel.findByMatchId as jest.Mock).mockResolvedValue([
        {
          tap_id: 'tap-1',
          user_id: userId,
          reaction_ms: 500,
          is_valid: true,
          disqualified: false,
        },
      ]);

      (MatchModel.recordReaction as jest.Mock).mockResolvedValue(undefined);

      await PollingMatchController.tap(req as Request, res as Response);

      // Should succeed using server timestamp (future timestamp ignored)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should disqualify early taps based on server time (not client timestamp)', async () => {
      const userId = 'user-123';
      const matchId = 'match-1';
      const greenLightTime = Date.now() + 200; // Green light is 200ms in the FUTURE
      const earlyClientTimestamp = greenLightTime - 100; // Client says 100ms before green (but we ignore this)
      
      (req as any).userId = userId;
      req.body = { matchId, clientTimestamp: earlyClientTimestamp };

      (MatchModel.findById as jest.Mock).mockResolvedValue({
        match_id: matchId,
        player1_id: userId,
        player2_id: 'user-456',
        green_light_time: greenLightTime,
      });

      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      (TapEventModel.create as jest.Mock).mockResolvedValue({
        tap_id: 'tap-1',
        user_id: userId,
        reaction_ms: 0,
        is_valid: false,
        disqualified: true,
        disqualification_reason: 'early_tap',
      });

      await PollingMatchController.tap(req as Request, res as Response);

      // Server detects early tap (beyond 150ms tolerance) and disqualifies with 200 response
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          disqualified: true,
          reason: 'early_tap',
        })
      );
    });

    it('should accept valid client timestamps after green light', async () => {
      const userId = 'user-123';
      const matchId = 'match-1';
      const greenLightTime = Date.now() - 500; // 500ms ago
      const validTimestamp = greenLightTime + 200; // 200ms after green light
      
      (req as any).userId = userId;
      req.body = { matchId, clientTimestamp: validTimestamp };

      (MatchModel.findById as jest.Mock).mockResolvedValue({
        match_id: matchId,
        player1_id: userId,
        player2_id: 'user-456',
        green_light_time: greenLightTime,
      });

      (TapEventModel.create as jest.Mock).mockResolvedValue({
        tap_id: 'tap-1',
        user_id: userId,
        reaction_ms: 200,
        is_valid: true,
        disqualified: false,
      });

      (TapEventModel.findByMatchId as jest.Mock).mockResolvedValue([
        {
          tap_id: 'tap-1',
          user_id: userId,
          reaction_ms: 200,
          is_valid: true,
          disqualified: false,
        },
      ]);

      (MatchModel.recordReaction as jest.Mock).mockResolvedValue(undefined);

      await PollingMatchController.tap(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          tap: expect.objectContaining({
            reactionMs: 200,
            isValid: true,
            disqualified: false,
          }),
        })
      );
    });

    it('should handle missing client timestamp gracefully', async () => {
      const userId = 'user-123';
      const matchId = 'match-1';
      const greenLightTime = Date.now() - 500;
      
      (req as any).userId = userId;
      req.body = { matchId }; // No clientTimestamp

      (MatchModel.findById as jest.Mock).mockResolvedValue({
        match_id: matchId,
        player1_id: userId,
        player2_id: 'user-456',
        green_light_time: greenLightTime,
      });

      (TapEventModel.create as jest.Mock).mockResolvedValue({
        tap_id: 'tap-1',
        user_id: userId,
        reaction_ms: 100,
        is_valid: true,
        disqualified: false,
      });

      (TapEventModel.findByMatchId as jest.Mock).mockResolvedValue([
        {
          tap_id: 'tap-1',
          user_id: userId,
          reaction_ms: 100,
          is_valid: true,
          disqualified: false,
        },
      ]);

      (MatchModel.recordReaction as jest.Mock).mockResolvedValue(undefined);

      await PollingMatchController.tap(req as Request, res as Response);

      // Should succeed using server timestamp
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });
  });
});
