import { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';

// Store pending payments (in production, use database)
const pendingPayments = new Map<string, {
  id: string;
  amount: number;
  userId: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}>();

export class PaymentController {
  /**
   * Initiate a payment - generates a reference ID
   */
  static async initiatePayment(req: Request, res: Response) {
    try {
      const { amount } = req.body;
      const userId = (req as any).userId; // From auth middleware

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      // Generate unique reference ID (no dashes as per MiniKit requirements)
      const uuid = crypto.randomUUID().replace(/-/g, '');

      // Store payment reference
      pendingPayments.set(uuid, {
        id: uuid,
        amount,
        userId,
        timestamp: Date.now(),
        status: 'pending',
      });

      return res.json({
        success: true,
        id: uuid,
      });
    } catch (error) {
      console.error('Error initiating payment:', error);
      return res.status(500).json({ error: 'Failed to initiate payment' });
    }
  }

  /**
   * Confirm payment - verifies with Developer Portal
   */
  static async confirmPayment(req: Request, res: Response) {
    try {
      const { payload } = req.body;

      if (!payload || payload.status !== 'success') {
        return res.status(400).json({ error: 'Invalid payment payload' });
      }

      const { transaction_id, reference } = payload;

      // Get payment details from our store
      const payment = pendingPayments.get(reference);
      if (!payment) {
        return res.status(404).json({ error: 'Payment reference not found' });
      }

      // Verify transaction with Developer Portal API
      const APP_ID = process.env.APP_ID;
      const DEV_PORTAL_API_KEY = process.env.DEV_PORTAL_API_KEY;

      if (!APP_ID || !DEV_PORTAL_API_KEY) {
        console.error('Missing APP_ID or DEV_PORTAL_API_KEY');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      const response = await axios.get(
        `https://developer.worldcoin.org/api/v2/minikit/transaction/${transaction_id}?app_id=${APP_ID}`,
        {
          headers: {
            Authorization: `Bearer ${DEV_PORTAL_API_KEY}`,
          },
        }
      );

      const transaction = response.data;

      if (transaction.status === 'failed') {
        payment.status = 'failed';
        return res.status(400).json({ 
          error: 'Transaction failed',
          transaction,
        });
      }

      // Update payment status
      payment.status = 'confirmed';

      return res.json({
        success: true,
        transaction,
        payment: {
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
        },
      });
    } catch (error: any) {
      console.error('Error confirming payment:', error.response?.data || error);
      return res.status(500).json({ 
        error: 'Failed to confirm payment',
        details: error.response?.data || error.message,
      });
    }
  }

  /**
   * Get payment status
   */
  static async getPaymentStatus(req: Request, res: Response) {
    try {
      const { reference } = req.params;

      const payment = pendingPayments.get(reference);
      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      return res.json({
        success: true,
        payment: {
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
          timestamp: payment.timestamp,
        },
      });
    } catch (error) {
      console.error('Error getting payment status:', error);
      return res.status(500).json({ error: 'Failed to get payment status' });
    }
  }
}
