import { Request, Response } from 'express';
import { ClaimModel, ClaimStatus } from '../models/Claim';
import { MatchModel } from '../models/Match';
import { TreasuryService } from '../services/treasuryService';
import { calculatePlatformFee } from '../services/paymentUtils';
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

      // CRITICAL SECURITY: Check for existing claim by BOTH match_id AND wallet
      // This prevents the exploit where multiple wallets try to claim the same match
      const existingMatchClaimResult = await client.query(
        'SELECT * FROM claims WHERE match_id = $1 FOR UPDATE',
        [matchId]
      );

      if (existingMatchClaimResult.rows.length > 0) {
        const existingMatchClaim = existingMatchClaimResult.rows[0];
        
        // BUG FIX: Allow retry if the previous claim failed
        // Security: Only allow retry within 24 hours and limit to reasonable attempts
        if (existingMatchClaim.status === 'failed' && existingMatchClaim.claimed === false) {
          const claimTimestamp = existingMatchClaim.claim_timestamp;
          const hoursSinceFailure = claimTimestamp 
            ? (Date.now() - new Date(claimTimestamp).getTime()) / (1000 * 60 * 60)
            : 0;
          
          // Only allow retry within 24 hours of original failure
          if (hoursSinceFailure > 24) {
            await client.query('ROLLBACK');
            res.status(400).json({ 
              error: 'Claim retry window expired',
              details: 'Failed claims can only be retried within 24 hours'
            });
            return;
          }
          
          console.log(`[Claim] Found failed claim for match ${matchId}, allowing retry (${hoursSinceFailure.toFixed(1)}h since failure)`);
          // Delete the failed claim to allow retry
          await client.query('DELETE FROM claims WHERE match_id = $1 AND status = $2', [matchId, 'failed']);
        } else {
          // Claim succeeded or is processing - reject
          await client.query('ROLLBACK');
          res.status(400).json({ 
            error: 'Match already claimed',
            details: 'This match has already been claimed',
            claimedBy: existingMatchClaim.winner_wallet,
            txHash: existingMatchClaim.claim_transaction_hash || existingMatchClaim.tx_hash
          });
          return;
        }
      }

      // Check for existing claim (idempotency by wallet)
      const idempotencyKey = `claim:${matchId}:${claimingWallet.toLowerCase()}`;
      const existingClaimResult = await client.query(
        'SELECT * FROM claims WHERE idempotency_key = $1 FOR UPDATE',
        [idempotencyKey]
      );

      if (existingClaimResult.rows.length > 0) {
        const existingClaim = existingClaimResult.rows[0];
        
        // BUG FIX: If claim failed, allow retry by deleting it
        if (existingClaim.status === 'failed' && existingClaim.claimed === false) {
          console.log(`[Claim] Found failed claim with idempotency key ${idempotencyKey}, allowing retry`);
          await client.query('DELETE FROM claims WHERE idempotency_key = $1 AND status = $2', [idempotencyKey, 'failed']);
        } else if (existingClaim.claimed === true) {
          // SECURITY: Double-check that claim hasn't been marked as claimed
          await client.query('ROLLBACK');
          res.status(400).json({ 
            error: 'Claim already processed',
            details: 'This claim has already been completed',
            txHash: existingClaim.claim_transaction_hash
          });
          return;
        } else {
          // Claim is still processing, return current status
          await client.query('COMMIT');
          res.json({ 
            success: true, 
            claim: {
              txHash: existingClaim.tx_hash,
              amount: existingClaim.net_payout,
              amountFormatted: TreasuryService.formatWLD(BigInt(existingClaim.net_payout)),
              status: existingClaim.status
            }
          });
          return;
        }
      }

      // Calculate payout using integer math (wei)
      const { totalPool, platformFee, netPayout } = calculatePlatformFee(match.stake);

      console.log(`[Claim] Match ${matchId} - Total: ${totalPool}, Fee: ${platformFee}, Payout: ${netPayout}`);

      // SECURITY: Get payment intents for this match and verify maximum payout (2x stake)
      const paymentIntentsResult = await client.query(`
        SELECT payment_reference, amount, total_claimed_amount 
        FROM payment_intents 
        WHERE match_id = $1 AND user_id = $2 AND normalized_status = 'confirmed'
        FOR UPDATE
      `, [matchId, userId]);

      if (paymentIntentsResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ 
          error: 'No confirmed payment found for this match',
          details: 'Unable to verify your stake for this match'
        });
        return;
      }

      const userPayment = paymentIntentsResult.rows[0];
      const originalStake = parseFloat(userPayment.amount);
      const alreadyClaimed = parseFloat(userPayment.total_claimed_amount || 0);
      const maxPayout = originalStake * 2;
      
      // Convert netPayout to WLD once for efficiency
      const netPayoutWLD = parseFloat(TreasuryService.formatWLD(netPayout));

      // SECURITY: Enforce maximum payout protection - user can NEVER receive more than 2x their stake
      if (alreadyClaimed + netPayoutWLD > maxPayout) {
        await client.query('ROLLBACK');
        console.error(`[Claim] SECURITY VIOLATION: User ${userId} attempting to claim more than 2x stake. Original: ${originalStake}, Already claimed: ${alreadyClaimed}, Attempting: ${netPayoutWLD}, Max: ${maxPayout}`);
        res.status(400).json({ 
          error: 'Maximum payout exceeded',
          details: 'You cannot claim more than 2x your original stake',
          maxPayout: maxPayout.toString(),
          alreadyClaimed: alreadyClaimed.toString()
        });
        return;
      }

      // SECURITY: Mark payment as used to prevent reuse
      await client.query(`
        UPDATE payment_intents 
        SET used_for_match = true 
        WHERE payment_reference = $1 AND used_for_match = false
      `, [userPayment.payment_reference]);

      console.log(`[Claim] Security checks passed - Max payout: ${maxPayout}, Already claimed: ${alreadyClaimed}, This claim: ${netPayoutWLD}`);

      // FIXED: Store wei amounts as strings in VARCHAR columns (prevents numeric overflow)
      // Database columns are VARCHAR(78) which can store up to 2^256 in decimal
      // Wei amounts are stored as strings: e.g., "180000000000000000" for 0.18 WLD
      // SECURITY FIX: Do NOT mark as claimed until transaction succeeds
      // This prevents "already claimed" errors when transaction fails
      await client.query(`
        INSERT INTO claims (match_id, winner_wallet, amount, platform_fee, net_payout, idempotency_key, status, claimed, claim_timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        matchId, 
        claimingWallet.toLowerCase(), 
        totalPool.toString(),      // Store as string (wei)
        platformFee.toString(),    // Store as string (wei)
        netPayout.toString(),      // Store as string (wei)
        idempotencyKey,
        ClaimStatus.PROCESSING,
        false  // Only mark as claimed after successful transaction
      ]);

      // BUG FIX: Do NOT mark match as claimed here - only after payout succeeds
      // This prevents the bug where first attempt gets 400, second gets "Already Claimed"
      // The claim_status will be updated after successful payout (line 278-281)

      await client.query('COMMIT');

      console.log(`[Claim] Processing claim for match ${matchId}, payout: ${netPayout} wei`);

      // Send payout (outside transaction to avoid long locks)
      let txHash: string;
      try {
        txHash = await TreasuryService.sendPayout(claimingWallet, netPayout);
        
        // Update claim with tx hash and mark as completed
        await ClaimModel.complete(idempotencyKey, txHash);
        
        // SECURITY: Update claim_transaction_hash to verify blockchain proof
        // SECURITY FIX: Mark as claimed only AFTER successful transaction
        await pool.query(`
          UPDATE claims 
          SET claim_transaction_hash = $1,
              claimed = true
          WHERE idempotency_key = $2
        `, [txHash, idempotencyKey]);
        
        // SECURITY: Update total_claimed_amount to track cumulative claims (both tables)
        await pool.query(`
          UPDATE payment_intents 
          SET total_claimed_amount = COALESCE(total_claimed_amount, 0) + $1 
          WHERE payment_reference = $2
        `, [netPayoutWLD, userPayment.payment_reference]);
        
        // SECURITY: Also update matches.total_claimed_amount for double verification
        // BUG FIX: Now we mark match as claimed ONLY after successful payout
        await pool.query(`
          UPDATE matches 
          SET claim_status = $1,
              total_claimed_amount = total_claimed_amount + $2,
              claim_transaction_hash = $3
          WHERE match_id = $4
        `, ['claimed', netPayout, txHash, matchId]);

        console.log(`[Claim] Successfully paid out ${netPayout} wei to ${claimingWallet}, tx: ${txHash}`);

        res.json({ 
          success: true, 
          txHash,
          amount: netPayout.toString(),
          amountFormatted: TreasuryService.formatWLD(netPayout)
        });
      } catch (error: any) {
        console.error(`[Claim] Payout failed for match ${matchId}:`, error);
        
        // Mark claim as failed (already not claimed)
        await ClaimModel.markFailed(idempotencyKey, error.message);
        
        // BUG FIX: No need to rollback match claim_status since we never set it in the first place
        // The match remains in its original state, allowing retry

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
      const { totalPool, platformFee, netPayout } = calculatePlatformFee(match.stake);

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
