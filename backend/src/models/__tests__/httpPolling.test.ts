import { MatchQueueModel, QueueStatus } from '../MatchQueue';
import { TapEventModel } from '../TapEvent';
import { MatchModel } from '../Match';
import pool from '../../config/database';

describe('HTTP Polling Models', () => {
  beforeAll(async () => {
    // Tests will use existing database tables from migration
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up data before each test
    await pool.query('DELETE FROM tap_events');
    await pool.query('DELETE FROM match_queue');
    await pool.query('DELETE FROM matches');
    await pool.query('DELETE FROM users');
  });

  describe('MatchQueueModel', () => {
    let testUserId: string;

    beforeEach(async () => {
      // Create test user
      const result = await pool.query(
        'INSERT INTO users (wallet_address) VALUES ($1) RETURNING user_id',
        ['0x1234567890abcdef']
      );
      testUserId = result.rows[0].user_id;
    });

    it('should enqueue a player', async () => {
      const entry = await MatchQueueModel.enqueue(testUserId, 0.5);
      
      expect(entry.user_id).toBe(testUserId);
      expect(entry.stake).toBe(0.5);
      expect(entry.status).toBe(QueueStatus.SEARCHING);
      expect(entry.expires_at).toBeDefined();
    });

    it('should find matching player', async () => {
      // Create another user
      const result2 = await pool.query(
        'INSERT INTO users (wallet_address) VALUES ($1) RETURNING user_id',
        ['0xabcdef1234567890']
      );
      const testUserId2 = result2.rows[0].user_id;

      // Enqueue first player
      await MatchQueueModel.enqueue(testUserId, 0.5);

      // Find match for second player
      const match = await MatchQueueModel.findMatch(0.5, testUserId2);
      
      expect(match).not.toBeNull();
      expect(match?.user_id).toBe(testUserId);
      expect(match?.stake).toBe(0.5);
    });

    it('should not match players with different stakes', async () => {
      const result2 = await pool.query(
        'INSERT INTO users (wallet_address) VALUES ($1) RETURNING user_id',
        ['0xabcdef1234567890']
      );
      const testUserId2 = result2.rows[0].user_id;

      // Enqueue with stake 0.5
      await MatchQueueModel.enqueue(testUserId, 0.5);

      // Try to find match with stake 1.0
      const match = await MatchQueueModel.findMatch(1.0, testUserId2);
      
      expect(match).toBeNull();
    });
  });

  describe('TapEventModel', () => {
    let testUserId: string;
    let testMatchId: string;

    beforeEach(async () => {
      // Create test user
      const userResult = await pool.query(
        'INSERT INTO users (wallet_address) VALUES ($1) RETURNING user_id',
        ['0x1234567890abcdef']
      );
      testUserId = userResult.rows[0].user_id;

      // Create test match
      const matchResult = await pool.query(
        'INSERT INTO matches (player1_id, player2_id, stake, status) VALUES ($1, $1, $2, $3) RETURNING match_id',
        [testUserId, 0.5, 'in_progress']
      );
      testMatchId = matchResult.rows[0].match_id;
    });

    it('should record valid tap', async () => {
      const greenLightTime = 1000;
      const serverTimestamp = 1200;
      const clientTimestamp = 1195;

      const tap = await TapEventModel.create(
        testMatchId,
        testUserId,
        clientTimestamp,
        serverTimestamp,
        greenLightTime
      );

      expect(tap.match_id).toBe(testMatchId);
      expect(tap.user_id).toBe(testUserId);
      expect(tap.reaction_ms).toBe(200);
      expect(tap.is_valid).toBe(true);
      expect(tap.disqualified).toBe(false);
    });

    it('should disqualify early tap', async () => {
      const greenLightTime = 1000;
      const serverTimestamp = 900; // Tapped 100ms early
      const clientTimestamp = 895;

      const tap = await TapEventModel.create(
        testMatchId,
        testUserId,
        clientTimestamp,
        serverTimestamp,
        greenLightTime
      );

      expect(tap.reaction_ms).toBe(-100);
      expect(tap.is_valid).toBe(false);
      expect(tap.disqualified).toBe(true);
      expect(tap.disqualification_reason).toBe('early_tap');
    });

    it('should mark slow tap as invalid', async () => {
      const greenLightTime = 1000;
      const serverTimestamp = 7000; // 6 seconds late (beyond 5s cap)
      const clientTimestamp = 6995;

      const tap = await TapEventModel.create(
        testMatchId,
        testUserId,
        clientTimestamp,
        serverTimestamp,
        greenLightTime
      );

      expect(tap.reaction_ms).toBe(6000);
      expect(tap.is_valid).toBe(false);
      expect(tap.disqualified).toBe(false);
    });
  });
});
