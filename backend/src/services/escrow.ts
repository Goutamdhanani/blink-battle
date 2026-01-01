import { TransactionModel } from '../models/Transaction';
import { TransactionType, TransactionStatus } from '../models/types';
import { getContractService } from './contractService';

/**
 * Escrow service for handling game stakes and payouts
 * Integrates with BlinkBattleEscrow smart contract on World Chain
 */
export class EscrowService {
  private static readonly PLATFORM_FEE_PERCENT = parseFloat(
    process.env.PLATFORM_FEE_PERCENT || '3'
  );

  /**
   * Lock funds for a match (escrow)
   * Now tracks on-chain escrow contract state
   */
  static async lockFunds(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Create match on-chain via smart contract
      const contractService = getContractService();
      const result = await contractService.createMatch(
        matchId,
        player1Wallet,
        player2Wallet,
        stakeAmount
      );

      if (!result.success) {
        console.error('[EscrowService] Failed to create match on-chain:', result.error);
        return { success: false, error: result.error };
      }

      // Record stake transactions in database for tracking
      await TransactionModel.create(
        matchId,
        TransactionType.STAKE,
        stakeAmount,
        player1Wallet,
        'escrow',
        result.txHash
      );

      await TransactionModel.create(
        matchId,
        TransactionType.STAKE,
        stakeAmount,
        player2Wallet,
        'escrow',
        result.txHash
      );

      console.log(`[EscrowService] Match created on-chain: ${matchId}, tx: ${result.txHash}`);
      return { success: true };
    } catch (error) {
      console.error('[EscrowService] Error locking funds:', error);
      return { success: false, error: 'Failed to lock funds' };
    }
  }

  /**
   * Distribute winnings to the winner via smart contract
   */
  static async distributeWinnings(
    matchId: string,
    winnerWallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const contractService = getContractService();
      const result = await contractService.completeMatch(matchId, winnerWallet);

      if (!result.success) {
        console.error('[EscrowService] Failed to complete match on-chain:', result.error);
        return { success: false, error: result.error };
      }

      const totalPot = stakeAmount * 2;
      const fee = totalPot * (this.PLATFORM_FEE_PERCENT / 100);
      const winnerPayout = totalPot - fee;

      // Record payout transaction in database
      const payoutTx = await TransactionModel.create(
        matchId,
        TransactionType.PAYOUT,
        winnerPayout,
        'escrow',
        winnerWallet,
        result.txHash
      );

      // Record fee transaction
      const feeTx = await TransactionModel.create(
        matchId,
        TransactionType.FEE,
        fee,
        'escrow',
        'platform',
        result.txHash
      );

      // Mark transactions as completed
      await TransactionModel.updateStatus(payoutTx.transaction_id, TransactionStatus.COMPLETED);
      await TransactionModel.updateStatus(feeTx.transaction_id, TransactionStatus.COMPLETED);

      console.log(`[EscrowService] Winnings distributed on-chain: ${matchId}, tx: ${result.txHash}`);
      return { success: true };
    } catch (error) {
      console.error('[EscrowService] Error distributing winnings:', error);
      return { success: false, error: 'Failed to distribute winnings' };
    }
  }

  /**
   * Refund both players via smart contract
   */
  static async refundBothPlayers(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const contractService = getContractService();
      
      // Verify on-chain stake status before attempting refund
      console.log(`[EscrowService] Verifying on-chain stake status for match: ${matchId}`);
      const stakeStatus = await contractService.verifyOnChainStakeStatus(matchId);
      
      if (stakeStatus.error) {
        console.error('[EscrowService] Error checking stake status:', stakeStatus.error);
        return { success: false, error: stakeStatus.error };
      }

      // If no stakes exist on-chain, log warning and don't mark as refunded
      if (!stakeStatus.hasStakes) {
        console.warn(`[EscrowService] No on-chain stakes found for match ${matchId}. Cannot refund.`);
        console.warn('[EscrowService] This likely means the match was created in DB but stakes were never deposited on-chain.');
        return { 
          success: false, 
          error: 'No on-chain stakes found. Match was never funded or already refunded.' 
        };
      }

      // Check if both players staked (cancelMatch requires both stakes)
      if (!stakeStatus.player1Staked || !stakeStatus.player2Staked) {
        console.warn(`[EscrowService] Partial stakes for match ${matchId}. Player1: ${stakeStatus.player1Staked}, Player2: ${stakeStatus.player2Staked}`);
        console.warn('[EscrowService] cancelMatch only works if both players staked. This may fail.');
      }

      // Attempt to cancel match and refund
      const result = await contractService.cancelMatch(matchId);

      if (!result.success) {
        console.error('[EscrowService] Failed to cancel match on-chain:', result.error);
        return { success: false, error: result.error };
      }

      // Verify the transaction hash exists before creating records
      if (!result.txHash) {
        console.error('[EscrowService] No transaction hash returned from cancelMatch');
        return { success: false, error: 'Failed to get transaction confirmation' };
      }

      // Record refund transactions in database
      const refund1 = await TransactionModel.create(
        matchId,
        TransactionType.REFUND,
        stakeAmount,
        'escrow',
        player1Wallet,
        result.txHash
      );

      const refund2 = await TransactionModel.create(
        matchId,
        TransactionType.REFUND,
        stakeAmount,
        'escrow',
        player2Wallet,
        result.txHash
      );

      // Mark as completed
      await TransactionModel.updateStatus(refund1.transaction_id, TransactionStatus.COMPLETED);
      await TransactionModel.updateStatus(refund2.transaction_id, TransactionStatus.COMPLETED);

      console.log(`[EscrowService] Players refunded on-chain: ${matchId}, tx: ${result.txHash}`);
      return { success: true };
    } catch (error: any) {
      console.error('[EscrowService] Error refunding players:', error);
      // Return more detailed error information
      const errorMsg = error.message || 'Failed to refund players';
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Refund with processing fee deduction
   * Note: For now, we do full refund via cancelMatch. This could be enhanced.
   */
  static async refundWithFee(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number,
    feePercent: number
  ): Promise<{ success: boolean; error?: string }> {
    // For simplicity, just do a full refund via cancelMatch
    // If you want to implement partial refunds with fees, you'd need to add
    // a separate contract function or handle it differently
    console.log(`[EscrowService] Refunding with fee not supported on-chain, doing full refund`);
    return this.refundBothPlayers(matchId, player1Wallet, player2Wallet, stakeAmount);
  }

  /**
   * Split pot 50/50 for tie scenarios via smart contract
   */
  static async splitPot(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const contractService = getContractService();
      const result = await contractService.splitPot(matchId);

      if (!result.success) {
        console.error('[EscrowService] Failed to split pot on-chain:', result.error);
        return { success: false, error: result.error };
      }

      const totalPot = stakeAmount * 2;
      const fee = totalPot * (this.PLATFORM_FEE_PERCENT / 100);
      const halfPot = (totalPot - fee) / 2;

      // Record payout transactions in database
      const payout1 = await TransactionModel.create(
        matchId,
        TransactionType.PAYOUT,
        halfPot,
        'escrow',
        player1Wallet,
        result.txHash
      );

      const payout2 = await TransactionModel.create(
        matchId,
        TransactionType.PAYOUT,
        halfPot,
        'escrow',
        player2Wallet,
        result.txHash
      );

      // Record fee transaction
      const feeTx = await TransactionModel.create(
        matchId,
        TransactionType.FEE,
        fee,
        'escrow',
        'platform',
        result.txHash
      );

      // Mark as completed
      await TransactionModel.updateStatus(payout1.transaction_id, TransactionStatus.COMPLETED);
      await TransactionModel.updateStatus(payout2.transaction_id, TransactionStatus.COMPLETED);
      await TransactionModel.updateStatus(feeTx.transaction_id, TransactionStatus.COMPLETED);

      console.log(`[EscrowService] Pot split on-chain: ${matchId}, tx: ${result.txHash}`);
      return { success: true };
    } catch (error) {
      console.error('[EscrowService] Error splitting pot:', error);
      return { success: false, error: 'Failed to split pot' };
    }
  }
}
