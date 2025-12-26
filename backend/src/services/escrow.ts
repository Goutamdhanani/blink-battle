import { TransactionModel } from '../models/Transaction';
import { TransactionType, TransactionStatus } from '../models/types';

/**
 * Escrow service for handling game stakes and payouts
 * In production, this would integrate with Worldcoin SDK for actual transactions
 */
export class EscrowService {
  private static readonly PLATFORM_FEE_PERCENT = parseFloat(
    process.env.PLATFORM_FEE_PERCENT || '3'
  );

  /**
   * Lock funds for a match (escrow)
   * In production, this would call Worldcoin SDK to lock funds
   */
  static async lockFunds(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Create stake transactions for both players
      await TransactionModel.create(
        matchId,
        TransactionType.STAKE,
        stakeAmount,
        player1Wallet,
        'escrow'
      );

      await TransactionModel.create(
        matchId,
        TransactionType.STAKE,
        stakeAmount,
        player2Wallet,
        'escrow'
      );

      console.log(`Funds locked for match ${matchId}`);
      return { success: true };
    } catch (error) {
      console.error('Error locking funds:', error);
      return { success: false, error: 'Failed to lock funds' };
    }
  }

  /**
   * Distribute winnings to the winner
   */
  static async distributeWinnings(
    matchId: string,
    winnerWallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const totalPot = stakeAmount * 2;
      const fee = totalPot * (this.PLATFORM_FEE_PERCENT / 100);
      const winnerPayout = totalPot - fee;

      // Create payout transaction for winner
      const payoutTx = await TransactionModel.create(
        matchId,
        TransactionType.PAYOUT,
        winnerPayout,
        'escrow',
        winnerWallet
      );

      // Create fee transaction
      const feeTx = await TransactionModel.create(
        matchId,
        TransactionType.FEE,
        fee,
        'escrow',
        'platform'
      );

      // Mark transactions as completed
      await TransactionModel.updateStatus(payoutTx.transaction_id, TransactionStatus.COMPLETED);
      await TransactionModel.updateStatus(feeTx.transaction_id, TransactionStatus.COMPLETED);

      console.log(`Distributed winnings for match ${matchId}: ${winnerPayout} to ${winnerWallet}`);
      return { success: true };
    } catch (error) {
      console.error('Error distributing winnings:', error);
      return { success: false, error: 'Failed to distribute winnings' };
    }
  }

  /**
   * Refund both players (full refund)
   */
  static async refundBothPlayers(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Create refund transactions for both players
      const refund1 = await TransactionModel.create(
        matchId,
        TransactionType.REFUND,
        stakeAmount,
        'escrow',
        player1Wallet
      );

      const refund2 = await TransactionModel.create(
        matchId,
        TransactionType.REFUND,
        stakeAmount,
        'escrow',
        player2Wallet
      );

      // Mark as completed
      await TransactionModel.updateStatus(refund1.transaction_id, TransactionStatus.COMPLETED);
      await TransactionModel.updateStatus(refund2.transaction_id, TransactionStatus.COMPLETED);

      console.log(`Refunded both players for match ${matchId}`);
      return { success: true };
    } catch (error) {
      console.error('Error refunding players:', error);
      return { success: false, error: 'Failed to refund players' };
    }
  }

  /**
   * Refund with processing fee deduction
   */
  static async refundWithFee(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number,
    feePercent: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const fee = stakeAmount * (feePercent / 100);
      const refundAmount = stakeAmount - fee;

      // Create refund transactions with fee deduction
      const refund1 = await TransactionModel.create(
        matchId,
        TransactionType.REFUND,
        refundAmount,
        'escrow',
        player1Wallet
      );

      const refund2 = await TransactionModel.create(
        matchId,
        TransactionType.REFUND,
        refundAmount,
        'escrow',
        player2Wallet
      );

      // Create fee transactions
      const fee1 = await TransactionModel.create(
        matchId,
        TransactionType.FEE,
        fee,
        'escrow',
        'platform'
      );

      const fee2 = await TransactionModel.create(
        matchId,
        TransactionType.FEE,
        fee,
        'escrow',
        'platform'
      );

      // Mark all as completed
      await TransactionModel.updateStatus(refund1.transaction_id, TransactionStatus.COMPLETED);
      await TransactionModel.updateStatus(refund2.transaction_id, TransactionStatus.COMPLETED);
      await TransactionModel.updateStatus(fee1.transaction_id, TransactionStatus.COMPLETED);
      await TransactionModel.updateStatus(fee2.transaction_id, TransactionStatus.COMPLETED);

      console.log(`Refunded players with ${feePercent}% fee for match ${matchId}`);
      return { success: true };
    } catch (error) {
      console.error('Error refunding with fee:', error);
      return { success: false, error: 'Failed to refund with fee' };
    }
  }

  /**
   * Split pot 50/50 for tie scenarios
   */
  static async splitPot(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const totalPot = stakeAmount * 2;
      const fee = totalPot * (this.PLATFORM_FEE_PERCENT / 100);
      const halfPot = (totalPot - fee) / 2;

      // Create payout transactions for both players
      const payout1 = await TransactionModel.create(
        matchId,
        TransactionType.PAYOUT,
        halfPot,
        'escrow',
        player1Wallet
      );

      const payout2 = await TransactionModel.create(
        matchId,
        TransactionType.PAYOUT,
        halfPot,
        'escrow',
        player2Wallet
      );

      // Create fee transaction
      const feeTx = await TransactionModel.create(
        matchId,
        TransactionType.FEE,
        fee,
        'escrow',
        'platform'
      );

      // Mark as completed
      await TransactionModel.updateStatus(payout1.transaction_id, TransactionStatus.COMPLETED);
      await TransactionModel.updateStatus(payout2.transaction_id, TransactionStatus.COMPLETED);
      await TransactionModel.updateStatus(feeTx.transaction_id, TransactionStatus.COMPLETED);

      console.log(`Split pot 50/50 for match ${matchId}`);
      return { success: true };
    } catch (error) {
      console.error('Error splitting pot:', error);
      return { success: false, error: 'Failed to split pot' };
    }
  }
}
