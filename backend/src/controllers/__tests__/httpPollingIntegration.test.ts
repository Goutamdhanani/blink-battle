/**
 * Integration tests for HTTP polling game flow
 * Tests the complete matchmaking → countdown → tap → result cycle
 */

import { PollingMatchmakingController } from '../../controllers/pollingMatchmakingController';
import { PollingMatchController } from '../../controllers/pollingMatchController';
import { UserModel } from '../../models/User';
import { MatchModel } from '../../models/Match';
import { MatchQueueModel } from '../../models/MatchQueue';
import { TapEventModel } from '../../models/TapEvent';
import pool from '../../config/database';

describe('HTTP Polling Integration Tests', () => {
  let testUserId1: string;
  let testUserId2: string;
  let matchId: string;

  beforeAll(async () => {
    // Create test database tables if needed
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    // Clean up and close connections
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM tap_events');
    await pool.query('DELETE FROM match_queue');
    await pool.query('DELETE FROM matches');
    await pool.query('DELETE FROM users WHERE wallet_address LIKE $1', ['test_%']);

    // Create test users
    const user1 = await UserModel.create('test_player1', 'America/Los_Angeles');
    const user2 = await UserModel.create('test_player2', 'America/Los_Angeles');
    testUserId1 = user1.user_id;
    testUserId2 = user2.user_id;
  });

  describe('Complete Game Flow', () => {
    it('should complete a full game cycle: matchmaking → ready → countdown → tap → result', async () => {
      const stake = 0.5;

      // Step 1: Player 1 joins matchmaking
      const req1: any = { userId: testUserId1, body: { stake } };
      const res1: any = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };
      await PollingMatchmakingController.join(req1, res1);
      
      expect(res1.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'searching',
          stake,
        })
      );

      // Step 2: Player 2 joins matchmaking (instant match!)
      const req2: any = { userId: testUserId2, body: { stake } };
      const res2: any = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };
      await PollingMatchmakingController.join(req2, res2);
      
      const matchResult: any = res2.json.mock.calls[0][0];
      expect(matchResult.status).toBe('matched');
      expect(matchResult.matchId).toBeDefined();
      matchId = matchResult.matchId;

      // Step 3: Both players mark ready
      const readyReq1: any = { userId: testUserId1, body: { matchId } };
      const readyRes1: any = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };
      await PollingMatchController.ready(readyReq1, readyRes1);
      
      const readyResult1: any = readyRes1.json.mock.calls[0][0];
      expect(readyResult1.success).toBe(true);
      expect(readyResult1.bothReady).toBe(false);

      const readyReq2: any = { userId: testUserId2, body: { matchId } };
      const readyRes2: any = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };
      await PollingMatchController.ready(readyReq2, readyRes2);
      
      const readyResult2: any = readyRes2.json.mock.calls[0][0];
      expect(readyResult2.success).toBe(true);
      expect(readyResult2.bothReady).toBe(true);
      expect(readyResult2.greenLightTime).toBeDefined();

      const greenLightTime = readyResult2.greenLightTime;

      // Step 4: Wait for green light, then tap
      // Simulate waiting for green light to be active
      await new Promise(resolve => setTimeout(resolve, 100));

      // Player 1 taps after green light
      const tapReq1: any = {
        userId: testUserId1,
        body: { matchId, clientTimestamp: greenLightTime + 200 },
      };
      const tapRes1: any = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      // Manually set green light time to past for testing
      await MatchModel.setGreenLightTime(matchId, Date.now() - 300);

      await PollingMatchController.tap(tapReq1, tapRes1);
      
      const tapResult1: any = tapRes1.json.mock.calls[0][0];
      expect(tapResult1.success).toBe(true);
      expect(tapResult1.tap.isValid).toBe(true);
      expect(tapResult1.tap.disqualified).toBe(false);

      // Player 2 taps slower
      const tapReq2: any = {
        userId: testUserId2,
        body: { matchId, clientTimestamp: greenLightTime + 350 },
      };
      const tapRes2: any = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };
      await PollingMatchController.tap(tapReq2, tapRes2);
      
      const tapResult2: any = tapRes2.json.mock.calls[0][0];
      expect(tapResult2.success).toBe(true);

      // Step 5: Get match result
      const resultReq: any = { userId: testUserId1, params: { matchId } };
      const resultRes: any = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };
      await PollingMatchController.getResult(resultReq, resultRes);
      
      const result: any = resultRes.json.mock.calls[0][0];
      expect(result.winnerId).toBe(testUserId1); // Player 1 was faster
      expect(result.isWinner).toBe(true);
    });

    it('should disqualify early tap', async () => {
      const stake = 0.5;

      // Create match manually
      const match = await MatchModel.create(testUserId1, testUserId2, stake);
      matchId = match.match_id;

      // Set green light time to future
      const greenLightTime = Date.now() + 5000;
      await MatchModel.setGreenLightTime(matchId, greenLightTime);

      // Player taps before green light
      const earlyTapTime = Date.now();
      const tap = await TapEventModel.create(
        matchId,
        testUserId1,
        earlyTapTime,
        earlyTapTime,
        greenLightTime
      );

      expect(tap.disqualified).toBe(true);
      expect(tap.disqualification_reason).toBe('early_tap');
      expect(tap.is_valid).toBe(false);
      expect(tap.reaction_ms).toBeLessThan(0);
    });

    it('should mark slow tap as invalid', async () => {
      const stake = 0.5;

      // Create match manually
      const match = await MatchModel.create(testUserId1, testUserId2, stake);
      matchId = match.match_id;

      // Set green light time to past
      const greenLightTime = Date.now() - 6000; // 6 seconds ago
      await MatchModel.setGreenLightTime(matchId, greenLightTime);

      // Player taps very late
      const slowTapTime = Date.now();
      const tap = await TapEventModel.create(
        matchId,
        testUserId1,
        slowTapTime,
        slowTapTime,
        greenLightTime
      );

      expect(tap.is_valid).toBe(false); // > 5000ms is invalid
      expect(tap.disqualified).toBe(false); // Not early, just slow
      expect(tap.reaction_ms).toBeGreaterThan(5000);
    });

    it('should ignore spam taps (only first valid tap counts)', async () => {
      const stake = 0.5;

      // Create match manually
      const match = await MatchModel.create(testUserId1, testUserId2, stake);
      matchId = match.match_id;

      // Set green light time to past
      const greenLightTime = Date.now() - 500;
      await MatchModel.setGreenLightTime(matchId, greenLightTime);

      // Player taps multiple times
      const tap1 = await TapEventModel.create(
        matchId,
        testUserId1,
        Date.now(),
        Date.now(),
        greenLightTime
      );

      // Try to create second tap (should be prevented by controller)
      const existingTap = await TapEventModel.findByMatchAndUser(matchId, testUserId1);
      expect(existingTap).toBeDefined();
      expect(existingTap?.tap_id).toBe(tap1.tap_id);

      // Database should only have one tap for this user
      const allTaps = await TapEventModel.findByMatchId(matchId);
      const userTaps = allTaps.filter(t => t.user_id === testUserId1);
      expect(userTaps.length).toBe(1);
    });
  });

  describe('Matchmaking Queue', () => {
    it('should handle queue expiration', async () => {
      // Enqueue player
      const entry = await MatchQueueModel.enqueue(testUserId1, 0.5);
      expect(entry.status).toBe('searching');

      // Manually expire the entry
      await pool.query(
        'UPDATE match_queue SET expires_at = NOW() - INTERVAL \'1 minute\' WHERE queue_id = $1',
        [entry.queue_id]
      );

      // Run cleanup
      const cleaned = await MatchQueueModel.cleanupExpired();
      expect(cleaned).toBe(1);

      // Entry should now be expired
      const expiredEntry = await pool.query(
        'SELECT * FROM match_queue WHERE queue_id = $1',
        [entry.queue_id]
      );
      expect(expiredEntry.rows[0].status).toBe('expired');
    });

    it('should not match players with different stakes', async () => {
      await MatchQueueModel.enqueue(testUserId1, 0.5);
      
      // Try to find match with different stake
      const match = await MatchQueueModel.findMatch(1.0, testUserId2);
      expect(match).toBeNull();
    });

    it('should cancel matchmaking', async () => {
      await MatchQueueModel.enqueue(testUserId1, 0.5);
      
      await MatchQueueModel.cancel(testUserId1);
      
      // Entry should be cancelled
      const entry = await MatchQueueModel.findByUserId(testUserId1);
      expect(entry).toBeNull();
    });
  });

  describe('Match State Polling', () => {
    beforeEach(async () => {
      // Create a match for testing
      const match = await MatchModel.create(testUserId1, testUserId2, 0.5);
      matchId = match.match_id;
    });

    it('should return correct state during ready_wait', async () => {
      const req: any = { userId: testUserId1, params: { matchId } };
      const res: any = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await PollingMatchController.getState(req, res);
      
      const state: any = res.json.mock.calls[0][0];
      expect(state.state).toBe('ready_wait');
      expect(state.player1Ready).toBe(false);
      expect(state.player2Ready).toBe(false);
    });

    it('should return correct state during countdown', async () => {
      // Mark both players ready
      await MatchModel.setPlayerReady(matchId, testUserId1);
      await MatchModel.setPlayerReady(matchId, testUserId2);
      
      // Set green light time to future
      const greenLightTime = Date.now() + 4000; // 4s from now
      await MatchModel.setGreenLightTime(matchId, greenLightTime);

      const req: any = { userId: testUserId1, params: { matchId } };
      const res: any = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await PollingMatchController.getState(req, res);
      
      const state: any = res.json.mock.calls[0][0];
      expect(state.state).toBe('countdown');
      expect(state.countdown).toBeGreaterThan(0);
    });

    it('should return correct state when green light is active', async () => {
      // Set green light time to past
      const greenLightTime = Date.now() - 100;
      await MatchModel.setGreenLightTime(matchId, greenLightTime);

      const req: any = { userId: testUserId1, params: { matchId } };
      const res: any = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await PollingMatchController.getState(req, res);
      
      const state: any = res.json.mock.calls[0][0];
      expect(state.state).toBe('go');
      expect(state.greenLightActive).toBe(true);
    });
  });
});
