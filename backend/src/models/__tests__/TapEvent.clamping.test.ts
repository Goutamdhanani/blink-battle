import { TapEventModel } from '../TapEvent';
import pool from '../../config/database';

// Mock the database
jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));

describe('TapEventModel - Reaction Time Clamping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should clamp negative reaction times to 0ms', async () => {
    const matchId = 'match-1';
    const userId = 'user-123';
    const greenLightTime = Date.now();
    const serverTimestamp = greenLightTime - 100; // Tapped 100ms BEFORE green light
    const clientTimestamp = serverTimestamp;

    // Mock database response
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [{
        tap_id: 'tap-1',
        match_id: matchId,
        user_id: userId,
        reaction_ms: 0, // Should be clamped to 0
        is_valid: false,
        disqualified: true,
        disqualification_reason: 'early_tap',
      }],
    });

    const tap = await TapEventModel.create(
      matchId,
      userId,
      clientTimestamp,
      serverTimestamp,
      greenLightTime
    );

    // Verify the INSERT was called with clamped value (0)
    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        matchId,
        userId,
        clientTimestamp,
        serverTimestamp,
        0, // reaction_ms should be clamped to 0
        false, // is_valid (not valid because it's early)
        true, // disqualified
        'early_tap',
      ])
    );
  });

  it('should clamp extremely large reaction times to 10000ms', async () => {
    const matchId = 'match-1';
    const userId = 'user-123';
    const greenLightTime = Date.now();
    const serverTimestamp = greenLightTime + 15000; // Tapped 15 seconds after
    const clientTimestamp = serverTimestamp;

    (pool.query as jest.Mock).mockResolvedValue({
      rows: [{
        tap_id: 'tap-1',
        match_id: matchId,
        user_id: userId,
        reaction_ms: 10000, // Should be clamped to 10000
        is_valid: false,
        disqualified: false,
      }],
    });

    const tap = await TapEventModel.create(
      matchId,
      userId,
      clientTimestamp,
      serverTimestamp,
      greenLightTime
    );

    // Verify the INSERT was called with clamped value (10000)
    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        matchId,
        userId,
        clientTimestamp,
        serverTimestamp,
        10000, // reaction_ms should be clamped to 10000
        false, // is_valid (>3000ms is invalid)
        false, // disqualified
        undefined,
      ])
    );
  });

  it('should not clamp valid reaction times', async () => {
    const matchId = 'match-1';
    const userId = 'user-123';
    const greenLightTime = Date.now();
    const serverTimestamp = greenLightTime + 250; // 250ms reaction
    const clientTimestamp = serverTimestamp;

    (pool.query as jest.Mock).mockResolvedValue({
      rows: [{
        tap_id: 'tap-1',
        match_id: matchId,
        user_id: userId,
        reaction_ms: 250,
        is_valid: true,
        disqualified: false,
      }],
    });

    const tap = await TapEventModel.create(
      matchId,
      userId,
      clientTimestamp,
      serverTimestamp,
      greenLightTime
    );

    // Verify the INSERT was called with original value
    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        matchId,
        userId,
        clientTimestamp,
        serverTimestamp,
        250, // reaction_ms unchanged
        true, // is_valid
        false, // not disqualified
        undefined,
      ])
    );
  });

  it('should mark reactions > 3000ms as invalid but not disqualified', async () => {
    const matchId = 'match-1';
    const userId = 'user-123';
    const greenLightTime = Date.now();
    const serverTimestamp = greenLightTime + 5000; // 5 second reaction
    const clientTimestamp = serverTimestamp;

    (pool.query as jest.Mock).mockResolvedValue({
      rows: [{
        tap_id: 'tap-1',
        match_id: matchId,
        user_id: userId,
        reaction_ms: 5000,
        is_valid: false, // Invalid because > 3000ms
        disqualified: false, // Not disqualified (just slow)
      }],
    });

    const tap = await TapEventModel.create(
      matchId,
      userId,
      clientTimestamp,
      serverTimestamp,
      greenLightTime
    );

    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        matchId,
        userId,
        clientTimestamp,
        serverTimestamp,
        5000, // reaction_ms (within clamp range)
        false, // is_valid = false (> 3000ms)
        false, // disqualified = false (not early tap)
        undefined,
      ])
    );
  });
});
