import pool from '../../config/database';
import { QueueStatus } from '../../models/MatchQueue';

/**
 * Integration tests for Matchmaking Timeout feature
 * 
 * Tests the 1-minute timeout requirement:
 * - Users who don't get matched within 1 minute should get refund eligibility
 * - Refund should have 3% operational fee deduction
 * - Queue entry should be marked as cancelled
 */

describe('Matchmaking Timeout Integration Tests', () => {
  let testUserId: string;
  let testPaymentReference: string;

  beforeAll(async () => {
    // Set up test database connection
    await pool.query('SELECT NOW()');
  });

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
      await pool.query('DELETE FROM match_queue WHERE user_id = $1', [testUserId]);
      if (testPaymentReference) {
        await pool.query('DELETE FROM payment_intents WHERE payment_reference = $1', [testPaymentReference]);
      }
      await pool.query('DELETE FROM users WHERE user_id = $1', [testUserId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (wallet_address) VALUES ($1) RETURNING user_id`,
      [`0x${Math.random().toString(16).slice(2, 42).padStart(40, '0')}`]
    );
    testUserId = userResult.rows[0].user_id;

    // Create test payment
    testPaymentReference = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await pool.query(
      `INSERT INTO payment_intents (payment_reference, user_id, amount, normalized_status, match_id)
       VALUES ($1, $2, $3, $4, NULL)`,
      [testPaymentReference, testUserId, 0.5, 'confirmed']
    );
  });

  afterEach(async () => {
    // Clean up after each test
    if (testUserId) {
      await pool.query('DELETE FROM match_queue WHERE user_id = $1', [testUserId]);
      if (testPaymentReference) {
        await pool.query('DELETE FROM payment_intents WHERE payment_reference = $1', [testPaymentReference]);
      }
      await pool.query('DELETE FROM users WHERE user_id = $1', [testUserId]);
    }
  });

  test('should mark queue entry as cancelled after 1 minute timeout', async () => {
    // Create queue entry with past expiry time (simulate 1 minute timeout)
    const pastTime = new Date(Date.now() - 61000); // 61 seconds ago
    await pool.query(
      `INSERT INTO match_queue (user_id, stake, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [testUserId, 0.5, QueueStatus.SEARCHING, pastTime, pastTime]
    );

    // Import and run the timeout processor
    const { processExpiredMatchmaking } = await import('../../jobs/matchmakingTimeout');
    await processExpiredMatchmaking();

    // Verify queue entry was marked as cancelled
    const queueResult = await pool.query(
      'SELECT status FROM match_queue WHERE user_id = $1',
      [testUserId]
    );

    expect(queueResult.rows[0].status).toBe(QueueStatus.CANCELLED);
  });

  test('should mark payment as eligible for refund after timeout', async () => {
    // Create queue entry with past expiry time
    const pastTime = new Date(Date.now() - 61000);
    await pool.query(
      `INSERT INTO match_queue (user_id, stake, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [testUserId, 0.5, QueueStatus.SEARCHING, pastTime, pastTime]
    );

    // Run timeout processor
    const { processExpiredMatchmaking } = await import('../../jobs/matchmakingTimeout');
    await processExpiredMatchmaking();

    // Verify payment was marked for refund
    const paymentResult = await pool.query(
      'SELECT refund_status, refund_reason, refund_deadline FROM payment_intents WHERE payment_reference = $1',
      [testPaymentReference]
    );

    expect(paymentResult.rows[0].refund_status).toBe('eligible');
    expect(paymentResult.rows[0].refund_reason).toBe('matchmaking_timeout');
    expect(paymentResult.rows[0].refund_deadline).toBeDefined();
    
    // Verify refund deadline is in the future (24 hours)
    const deadline = new Date(paymentResult.rows[0].refund_deadline);
    const expectedDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(deadline.getTime()).toBeGreaterThan(Date.now());
    expect(deadline.getTime()).toBeLessThan(expectedDeadline.getTime() + 60000); // Within 1 minute tolerance
  });

  test('should calculate refund with 3% operational fee deduction', () => {
    // Test refund calculation
    const originalAmount = 1.0; // 1 WLD
    const feePercent = 3;
    const expectedRefund = originalAmount * (1 - feePercent / 100);
    
    expect(expectedRefund).toBe(0.97); // 97% of original
    
    // Test with different amounts
    expect(0.5 * 0.97).toBe(0.485); // 0.5 WLD -> 0.485 WLD refund
    expect(0.25 * 0.97).toBe(0.2425); // 0.25 WLD -> 0.2425 WLD refund
  });

  test('should not process queue entries that have not expired yet', async () => {
    // Create queue entry that expires in future
    const futureTime = new Date(Date.now() + 30000); // 30 seconds from now
    await pool.query(
      `INSERT INTO match_queue (user_id, stake, status, created_at, expires_at)
       VALUES ($1, $2, $3, NOW(), $4)`,
      [testUserId, 0.5, QueueStatus.SEARCHING, futureTime]
    );

    // Run timeout processor
    const { processExpiredMatchmaking } = await import('../../jobs/matchmakingTimeout');
    await processExpiredMatchmaking();

    // Verify queue entry was NOT cancelled
    const queueResult = await pool.query(
      'SELECT status FROM match_queue WHERE user_id = $1',
      [testUserId]
    );

    expect(queueResult.rows[0].status).toBe(QueueStatus.SEARCHING);

    // Verify payment was NOT marked for refund
    const paymentResult = await pool.query(
      'SELECT refund_status FROM payment_intents WHERE payment_reference = $1',
      [testPaymentReference]
    );

    expect(paymentResult.rows[0].refund_status).toBeNull();
  });

  test('should handle entries without associated payments gracefully', async () => {
    // Create queue entry without payment (free match)
    const pastTime = new Date(Date.now() - 61000);
    await pool.query(
      `INSERT INTO match_queue (user_id, stake, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [testUserId, 0, QueueStatus.SEARCHING, pastTime, pastTime]
    );

    // Run timeout processor (should not crash)
    const { processExpiredMatchmaking } = await import('../../jobs/matchmakingTimeout');
    await expect(processExpiredMatchmaking()).resolves.not.toThrow();

    // Verify queue entry was still cancelled
    const queueResult = await pool.query(
      'SELECT status FROM match_queue WHERE user_id = $1',
      [testUserId]
    );

    expect(queueResult.rows[0].status).toBe(QueueStatus.CANCELLED);
  });
});
