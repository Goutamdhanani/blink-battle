import { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { PaymentModel, PaymentStatus } from '../models/Payment';

export class PaymentController {
  /**
   * Initiate a payment - generates a reference ID and stores in database
   * Idempotent: Safe to retry with same parameters
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

      // Store payment reference in database (idempotent)
      const payment = await PaymentModel.create(uuid, userId, amount);

      console.log(`[Payment] Initiated payment reference=${uuid} userId=${userId} amount=${amount} status=${payment.status}`);

      return res.json({
        success: true,
        id: payment.reference,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Payment] Error initiating payment:', errorMessage);
      return res.status(500).json({ error: 'Failed to initiate payment' });
    }
  }

  /**
   * Confirm payment - verifies with Developer Portal
   * Idempotent: Safe to call multiple times with same transaction
   */
  static async confirmPayment(req: Request, res: Response) {
    try {
      const { payload } = req.body;
      const userId = (req as any).userId; // From auth middleware

      console.log('[Payment] confirmPayment called with payload:', JSON.stringify(payload, null, 2));

      if (!payload || payload.status !== 'success') {
        console.error('[Payment] Invalid payload status:', payload?.status || 'missing payload');
        return res.status(400).json({ 
          error: 'Invalid payment payload',
          details: `Expected status 'success', got '${payload?.status || 'missing'}'`
        });
      }

      const { transaction_id, reference } = payload;

      if (!reference || !transaction_id) {
        console.error('[Payment] Missing required fields:', { reference, transaction_id });
        return res.status(400).json({ 
          error: 'Missing reference or transaction_id',
          details: { hasReference: !!reference, hasTransactionId: !!transaction_id }
        });
      }

      // Get payment details from database
      const payment = await PaymentModel.findByReference(reference);
      if (!payment) {
        console.error(`[Payment] Reference not found: ${reference}`);
        return res.status(404).json({ error: 'Payment reference not found' });
      }

      // Verify the payment belongs to the authenticated user
      if (payment.user_id !== userId) {
        console.error(`[Payment] User mismatch for reference=${reference} expected=${payment.user_id} got=${userId}`);
        return res.status(403).json({ error: 'Payment does not belong to this user' });
      }

      // If already confirmed with same transaction_id, return success (idempotent)
      if (payment.status === PaymentStatus.CONFIRMED && payment.transaction_id === transaction_id) {
        console.log(`[Payment] Already confirmed reference=${reference} transactionId=${transaction_id}`);
        return res.json({
          success: true,
          transaction: { status: 'confirmed' },
          payment: {
            id: payment.reference,
            amount: payment.amount,
            status: payment.status,
          },
        });
      }

      // Verify transaction with Developer Portal API
      const APP_ID = process.env.APP_ID;
      const DEV_PORTAL_API_KEY = process.env.DEV_PORTAL_API_KEY;

      if (!APP_ID || !DEV_PORTAL_API_KEY) {
        console.error('[Payment] Missing APP_ID or DEV_PORTAL_API_KEY');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      const apiUrl = `https://developer.worldcoin.org/api/v2/minikit/transaction/${transaction_id}?app_id=${APP_ID}`;
      console.log(`[Payment] Verifying transaction reference=${reference} transactionId=${transaction_id}`);
      console.log(`[Payment] Developer Portal API URL: ${apiUrl}`);

      let transaction;
      try {
        const response = await axios.get(apiUrl, {
          headers: {
            Authorization: `Bearer ${DEV_PORTAL_API_KEY}`,
          },
        });
        transaction = response.data;
        console.log(`[Payment] Developer Portal API response:`, JSON.stringify(transaction, null, 2));
      } catch (apiError: unknown) {
        const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown error';
        const axiosError = apiError as any;
        const errorDetails = {
          message: errorMessage,
          status: axiosError?.response?.status,
          statusText: axiosError?.response?.statusText,
          data: axiosError?.response?.data,
          headers: axiosError?.response?.headers,
        };
        console.error(`[Payment] Developer Portal API error:`, JSON.stringify(errorDetails, null, 2));
        return res.status(500).json({ 
          error: 'Failed to verify transaction with Developer Portal',
          details: errorDetails,
        });
      }

      if (!transaction) {
        console.error('[Payment] Developer Portal returned null/undefined transaction');
        return res.status(500).json({ 
          error: 'Invalid response from Developer Portal',
          details: 'Transaction data is missing'
        });
      }

      console.log(`[Payment] Transaction status from Developer Portal: ${transaction.status}`);

      // Handle different transaction statuses
      if (transaction.status === 'failed') {
        console.error('[Payment] Transaction failed on-chain:', JSON.stringify(transaction, null, 2));
        await PaymentModel.updateStatus(reference, PaymentStatus.FAILED, transaction_id);
        return res.status(400).json({ 
          error: 'Transaction failed',
          transaction,
        });
      }

      if (transaction.status === 'pending') {
        // Transaction is still pending on-chain, keep payment as pending
        console.log(`[Payment] Transaction still pending reference=${reference}`);
        return res.json({
          success: true,
          pending: true,
          transaction,
          payment: {
            id: payment.reference,
            amount: payment.amount,
            status: payment.status,
          },
        });
      }

      // Transaction is confirmed (mined)
      const updatedPayment = await PaymentModel.updateStatus(
        reference,
        PaymentStatus.CONFIRMED,
        transaction_id
      );

      console.log(`[Payment] Payment confirmed reference=${reference} transactionId=${transaction_id}`);

      return res.json({
        success: true,
        transaction,
        payment: {
          id: updatedPayment!.reference,
          amount: updatedPayment!.amount,
          status: updatedPayment!.status,
        },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('[Payment] Error confirming payment:', {
        message: errorMessage,
        stack: errorStack,
        payload: req.body?.payload,
      });
      return res.status(500).json({ 
        error: 'Failed to confirm payment',
        details: errorMessage,
      });
    }
  }

  /**
   * Get payment status
   */
  static async getPaymentStatus(req: Request, res: Response) {
    try {
      const { reference } = req.params;
      const userId = (req as any).userId; // From auth middleware

      const payment = await PaymentModel.findByReference(reference);
      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      // Verify the payment belongs to the authenticated user
      if (payment.user_id !== userId) {
        return res.status(403).json({ error: 'Payment does not belong to this user' });
      }

      return res.json({
        success: true,
        payment: {
          id: payment.reference,
          amount: payment.amount,
          status: payment.status,
          transactionId: payment.transaction_id,
          createdAt: payment.created_at,
          confirmedAt: payment.confirmed_at,
        },
      });
    } catch (error) {
      console.error('[Payment] Error getting payment status:', error);
      return res.status(500).json({ error: 'Failed to get payment status' });
    }
  }
}
