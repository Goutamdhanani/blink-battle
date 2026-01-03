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
    it('should reject negative client timestamps', async () => {
      const userId = 'user-123';
      const matchId = 'match-1';
      (req as any).userId = userId;
      req.body = { matchId, clientTimestamp: -100 };

      const greenLightTime = Date.now() - 100;
      (MatchModel.findById as jest.Mock).mockResolvedValue({
        match_id: matchId,
        player1_id: userId,
        player2_id: 'user-456',
        green_light_time: greenLightTime,
      });

      await PollingMatchController.tap(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid timestamp',
          details: 'Client timestamp must be positive',
        })
      );
    });

    it('should reject zero client timestamps', async () => {
      const userId = 'user-123';
      const matchId = 'match-1';
      (req as any).userId = userId;
      req.body = { matchId, clientTimestamp: 0 };

      const greenLightTime = Date.now() - 100;
      (MatchModel.findById as jest.Mock).mockResolvedValue({
        match_id: matchId,
        player1_id: userId,
        player2_id: 'user-456',
        green_light_time: greenLightTime,
      });

      await PollingMatchController.tap(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid timestamp',
        })
      );
    });

    it('should reject future client timestamps', async () => {
      const userId = 'user-123';
      const matchId = 'match-1';
      const futureTimestamp = Date.now() + 10000; // 10 seconds in the future
      (req as any).userId = userId;
      req.body = { matchId, clientTimestamp: futureTimestamp };

      const greenLightTime = Date.now() - 100;
      (MatchModel.findById as jest.Mock).mockResolvedValue({
        match_id: matchId,
        player1_id: userId,
        player2_id: 'user-456',
        green_light_time: greenLightTime,
      });

      await PollingMatchController.tap(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid timestamp',
          details: 'Client timestamp is in the future',
        })
      );
    });

    it('should reject client timestamps before green light', async () => {
      const userId = 'user-123';
      const matchId = 'match-1';
      const greenLightTime = Date.now();
      const earlyTimestamp = greenLightTime - 100; // 100ms before green light
      
      (req as any).userId = userId;
      req.body = { matchId, clientTimestamp: earlyTimestamp };

      (MatchModel.findById as jest.Mock).mockResolvedValue({
        match_id: matchId,
        player1_id: userId,
        player2_id: 'user-456',
        green_light_time: greenLightTime,
      });

      await PollingMatchController.tap(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid timestamp',
          details: 'Tap timestamp is before green light',
          earlyByMs: expect.any(Number),
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
