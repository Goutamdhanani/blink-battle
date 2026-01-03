import { Request, Response } from 'express';
import { ClaimModel, ClaimStatus } from '../models/Claim';
import { MatchModel } from '../models/Match';
import { TreasuryService } from '../services/treasuryService';
import pool from '../config/database';

/**
 * ClaimController - Handles winner claims and payouts
 * 
 * CRITICAL SECURITY FEATURES:
 * - Idempotency via unique keys
 * - Row-level locking to prevent race conditions
 * - Wallet verification
 * - Deadline enforcement
 * - Integer-only math for amounts
 */
export class ClaimController {
  /**
   * POST /api/claim
   * Claim winnings for a completed match
   */
  static async claimWinnings(req: Request, res: Response): Promise<void> {
    const client = await pool.connect();
    
    try {
      const userId = (req as any).userId;
      const { matchId } = req.body;

      if (!matchId) {
        res.status(400).json({ error: 'Missing matchId' });
        return;
      }

      // Get user's wallet address
      const userResult = await pool.query(
        'SELECT wallet_address FROM users WHERE user_id = $1',
        [userId]
      );
      
      if (!userResult.rows[0]) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const claimingWallet = userResult.rows[0].wallet_address;

      // Start atomic transaction with row-level locking
      await client.query('BEGIN');

      // Lock the match row to prevent race conditions
      const matchResult = await client.query(
        'SELECT * FROM matches WHERE match_id = $1 FOR UPDATE',
        [matchId]
      );
      const match = matchResult.rows[0];

      // Validate claim eligibility
      if (!match) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Match not found' });
        return;
      }

      // Check if match is completed
      if (match.status !== 'completed') {
        await client.query('ROLLBACK');
        res.status(400).json({ 
          error: 'Match not yet completed',
          status: match.status
        });
        return;
      }

      // Verify user is the winner
      if (match.winner_id !== userId) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'Not the winner of this match' });
        return;
      }

      // Verify winner wallet matches (case-insensitive)
      if (!match.winner_wallet || 
          match.winner_wallet.toLowerCase() !== claimingWallet.toLowerCase()) {
        await client.query('ROLLBACK');
        res.status(403).json({ 
          error: 'Wallet mismatch',
          details: 'Your wallet does not match the winner wallet for this match'
        });
        return;
      }

      // Check if already claimed
      if (match.claim_status === 'claimed') {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Winnings already claimed' });
        return;
      }

      // Check claim deadline (with 1 minute grace period)
      if (match.claim_deadline) {
        const deadline = new Date(match.claim_deadline);
        const now = new Date();
        const gracePeriodMs = 60000; // 1 minute
        
        if (now.getTime() > deadline.getTime() + gracePeriodMs) {
          await client.query('ROLLBACK');
          res.status(400).json({ 
            error: 'Claim window expired',
            deadline: deadline.toISOString()
          });
          return;
        }
      }

      // Check for existing claim (idempotency)
      const idempotencyKey = `claim:${matchId}:${claimingWallet.toLowerCase()}`;
      const existingClaim = await client.query(
        'SELECT * FROM claims WHERE idempotency_key = $1',
        [idempotencyKey]
      );

      if (existingClaim.rows.length > 0) {
        await client.query('COMMIT');
        const claim = existingClaim.rows[0];
        res.json({ 
          success: true, 
          claim: {
            txHash: claim.tx_hash,
            amount: claim.net_payout,
            amountFormatted: TreasuryService.formatWLD(BigInt(claim.net_payout)),
            status: claim.status
          }
        });
        return;
      }

      // Calculate payout using integer math (wei)
      // Convert stake to wei first
      const stakeWei = BigInt(Math.floor(match.stake * 1e18));
      const totalPool = stakeWei * 2n; // Both players' stakes
      
      // Use PLATFORM_FEE_PERCENT from environment (default 3%)
      const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '3');
      const platformFeeBps = BigInt(Math.round(PLATFORM_FEE_PERCENT * 100)); // Convert % to basis points
      
      const platformFee = (totalPool * platformFeeBps) / 10000n;
      const netPayout = totalPool - platformFee;

      console.log(`[Claim] Match ${matchId} - Total: ${totalPool}, Fee: ${platformFee}, Payout: ${netPayout}`);

      // Create claim record with PROCESSING status
      await client.query(`
        INSERT INTO claims (match_id, winner_wallet, amount, platform_fee, net_payout, idempotency_key, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        matchId, 
        claimingWallet.toLowerCase(), 
        totalPool.toString(), 
        platformFee.toString(), 
        netPayout.toString(), 
        idempotencyKey,
        ClaimStatus.PROCESSING
      ]);

      // Mark match as claimed
      await client.query(
        'UPDATE matches SET claim_status = $1 WHERE match_id = $2',
        ['claimed', matchId]
      );

      await client.query('COMMIT');

      console.log(`[Claim] Processing claim for match ${matchId}, payout: ${netPayout} wei`);

      // Send payout (outside transaction to avoid long locks)
      let txHash: string;
      try {
        txHash = await TreasuryService.sendPayout(claimingWallet, netPayout);
        
        // Update claim with tx hash and mark as completed
        await ClaimModel.complete(idempotencyKey, txHash);

        console.log(`[Claim] Successfully paid out ${netPayout} wei to ${claimingWallet}, tx: ${txHash}`);

        res.json({ 
          success: true, 
          txHash,
          amount: netPayout.toString(),
          amountFormatted: TreasuryService.formatWLD(netPayout)
        });
      } catch (error: any) {
        console.error(`[Claim] Payout failed for match ${matchId}:`, error);
        
        // Mark claim as failed
        await ClaimModel.markFailed(idempotencyKey, error.message);
        
        // Rollback match claim status
        await pool.query(
          'UPDATE matches SET claim_status = $1 WHERE match_id = $2',
          ['unclaimed', matchId]
        );

        res.status(500).json({ 
          success: false,
          error: 'Payout failed',
          details: error.message
        });
      }
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('[Claim] Error in claimWinnings:', error);
      res.status(500).json({ 
        error: 'Failed to process claim',
        details: error.message
      });
    } finally {
      client.release();
    }
  }

  /**
   * GET /api/claim/status/:matchId
   * Get claim status for a match
   */
  static async getClaimStatus(req: Request, res: Response): Promise<void> {
    try {
      const { matchId } = req.params;
      const userId = (req as any).userId;

      const match = await MatchModel.findById(matchId);
      if (!match) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }

      // Verify user is a participant
      if (match.player1_id !== userId && match.player2_id !== userId) {
        res.status(403).json({ error: 'Not a participant in this match' });
        return;
      }

      // Check if match is completed
      if (match.status !== 'completed') {
        res.json({
          matchId,
          claimable: false,
          status: 'match_not_completed',
          matchStatus: match.status
        });
        return;
      }

      // Check if there's a winner
      if (!match.winner_id) {
        res.json({
          matchId,
          claimable: false,
          status: 'no_winner',
          reason: 'Match ended in a tie or both players disqualified'
        });
        return;
      }

      const isWinner = match.winner_id === userId;
      
      // Get claim if exists
      const claim = await ClaimModel.findByMatchId(matchId);

      // Calculate payout
      const stakeWei = BigInt(Math.floor(match.stake * 1e18));
      const totalPool = stakeWei * 2n;
      
      // Use PLATFORM_FEE_PERCENT from environment (default 3%)
      const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '3');
      const platformFeeBps = BigInt(Math.round(PLATFORM_FEE_PERCENT * 100)); // Convert % to basis points
      
      const platformFee = (totalPool * platformFeeBps) / 10000n;
      const netPayout = totalPool - platformFee;

      // Check deadline
      let deadlineExpired = false;
      if (match.claim_deadline) {
        const deadline = new Date(match.claim_deadline);
        const now = new Date();
        deadlineExpired = now > deadline;
      }

      res.json({
        matchId,
        claimable: isWinner && match.claim_status === 'unclaimed' && !deadlineExpired,
        isWinner,
        winnerWallet: match.winner_wallet,
        amount: netPayout.toString(),
        amountFormatted: TreasuryService.formatWLD(netPayout),
        deadline: match.claim_deadline,
        status: claim ? claim.status : match.claim_status,
        txHash: claim?.tx_hash,
        deadlineExpired
      });
    } catch (error: any) {
      console.error('[Claim] Error in getClaimStatus:', error);
      res.status(500).json({ error: 'Failed to get claim status' });
    }
  }
}
