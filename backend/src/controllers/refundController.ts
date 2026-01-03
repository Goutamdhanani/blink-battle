import { Request, Response } from 'express';
import { ethers } from 'ethers';
import pool from '../config/database';
import { TreasuryService } from '../services/treasuryService';

/**
 * RefundController - Handles refund claims for cancelled/timeout matches
 */
export class RefundController {
  /**
   * POST /api/refund/claim
   * Claim refund for cancelled/timeout match
   */
  static async claimRefund(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { paymentReference } = req.body;

      if (!paymentReference) {
        res.status(400).json({ error: 'Missing paymentReference' });
        return;
      }

      // Get payment
      const payment = await pool.query(
        `SELECT * FROM payment_intents WHERE payment_reference = $1 AND user_id = $2`,
        [paymentReference, userId]
      );

      if (!payment.rows[0]) {
        res.status(404).json({ error: 'Payment not found' });
        return;
      }

      const paymentData = payment.rows[0];

      // Check if already refunded
      if (paymentData.refund_status === 'completed') {
        res.status(400).json({ error: 'Already refunded' });
        return;
      }

      // Check if eligible for refund
      if (paymentData.refund_status !== 'eligible') {
        res.status(400).json({ error: 'Not eligible for refund' });
        return;
      }

      // Check refund deadline (4 hours)
      if (paymentData.refund_deadline && new Date() > new Date(paymentData.refund_deadline)) {
        res.status(400).json({ error: 'Refund deadline expired' });
        return;
      }

      // Calculate refund (97% - 3% gas fee)
      const amountWei = BigInt(Math.floor(paymentData.amount * 1e18));
      const gasFeeWei = (amountWei * 3n) / 100n;
      const refundWei = amountWei - gasFeeWei;
      const refundWLD = parseFloat(ethers.formatEther(refundWei));

      console.log(`[Refund] Processing for user ${userId}, Payment: ${paymentReference}, Refund: ${refundWLD} WLD`);

      // Mark as processing
      await pool.query(
        `UPDATE payment_intents 
         SET refund_status = 'processing', 
             refund_amount = $1,
             refund_claimed_at = NOW()
         WHERE payment_reference = $2`,
        [refundWLD, paymentReference]
      );

      // Get user wallet
      const user = await pool.query(
        'SELECT wallet_address FROM users WHERE user_id = $1',
        [userId]
      );
      const walletAddress = user.rows[0]?.wallet_address;

      if (!walletAddress) {
        res.status(400).json({ error: 'User wallet not found' });
        return;
      }

      // Send refund
      const txHash = await TreasuryService.sendPayout(walletAddress, refundWei);

      // Mark as completed
      await pool.query(
        `UPDATE payment_intents 
         SET refund_status = 'completed',
             refund_tx_hash = $1
         WHERE payment_reference = $2`,
        [txHash, paymentReference]
      );

      console.log(`[Refund] Completed for ${paymentReference}, TX: ${txHash}`);

      res.json({
        success: true,
        refundAmount: refundWLD,
        gasFee: parseFloat(ethers.formatEther(gasFeeWei)),
        transactionHash: txHash
      });

    } catch (error: any) {
      console.error('[Refund] Error:', error);
      res.status(500).json({ error: 'Failed to process refund' });
    }
  }

  /**
   * GET /api/refund/status/:paymentReference
   * Check refund eligibility
   */
  static async checkRefundStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { paymentReference } = req.params;

      const payment = await pool.query(
        `SELECT pi.*, m.status as match_status, m.cancelled
         FROM payment_intents pi
         LEFT JOIN matches m ON m.match_id = pi.match_id
         WHERE pi.payment_reference = $1 AND pi.user_id = $2`,
        [paymentReference, userId]
      );

      if (!payment.rows[0]) {
        res.status(404).json({ error: 'Payment not found' });
        return;
      }

      const data = payment.rows[0];
      
      // Check deadline
      const expired = data.refund_deadline && new Date() > new Date(data.refund_deadline);

      res.json({
        eligible: data.refund_status === 'eligible' && !expired,
        refundStatus: data.refund_status,
        refundAmount: data.refund_amount,
        refundDeadline: data.refund_deadline,
        expired,
        reason: data.refund_reason
      });
    } catch (error: any) {
      console.error('[Refund] Status check error:', error);
      res.status(500).json({ error: 'Failed to check refund status' });
    }
  }
}
