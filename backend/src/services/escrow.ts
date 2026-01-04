import { TransactionModel } from '../models/Transaction';
import { TransactionType, TransactionStatus } from '../models/types';
import { getContractService } from './contractService';

/**
 * Escrow service for handling game stakes and payouts
 * Integrates with BlinkBattleEscrow smart contract on World Chain
 */

// Refund failure reasons for tracking and admin review
const REFUND_FAILURE_REASONS = {
  NO_ESCROW: 'no_escrow',
  NO_STAKES: 'no_stakes',
  NO_STAKES_ON_CHAIN: 'no_stakes_on_chain',
  NO_TX_HASH: 'no_tx_hash',
  EXCEPTION: 'exception',
} as const;

// Track in-flight operations for idempotency
const IN_FLIGHT_OPERATIONS = new Map<string, Promise<any>>();

export class EscrowService {
  private static readonly PLATFORM_FEE_PERCENT = parseFloat(
    process.env.PLATFORM_FEE_PERCENT || '3'
  );

  /**
   * Idempotent operation wrapper
   * Prevents duplicate operations for the same match
   */
  private static async withIdempotency<T>(
    operationKey: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // Check if operation already in progress
    const inFlight = IN_FLIGHT_OPERATIONS.get(operationKey);
    if (inFlight) {
      console.log(`[Escrow] Operation ${operationKey} already in progress, waiting...`);
      return inFlight;
    }

    // Execute operation
    const promise = operation();
    IN_FLIGHT_OPERATIONS.set(operationKey, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      IN_FLIGHT_OPERATIONS.delete(operationKey);
    }
  }

  /**
   * Verify escrow exists and is correctly configured on-chain
   */
  static async verifyEscrowOnChain(
    matchId: string,
    expectedStake: number
  ): Promise<{ verified: boolean; error?: string; matchData?: any }> {
    try {
      const contractService = getContractService();
      const matchData = await contractService.getMatch(matchId);

      if (!matchData) {
        return { verified: false, error: 'Match not found on-chain' };
      }

      // Check stake amount matches (allowing small rounding differences)
      const onChainStake = parseFloat(matchData.stakeAmount);
      const stakeDiff = Math.abs(onChainStake - expectedStake);
      
      if (stakeDiff > 0.001) { // Allow 0.001 WLD difference for rounding
        return { 
          verified: false, 
          error: `Stake mismatch: expected ${expectedStake} WLD, got ${onChainStake} WLD`,
          matchData 
        };
      }

      // Check if match is in valid state (not completed or cancelled)
      if (matchData.completed || matchData.cancelled) {
        return { 
          verified: false, 
          error: `Match already ${matchData.completed ? 'completed' : 'cancelled'}`,
          matchData 
        };
      }

      console.log(`[Escrow] Verified escrow for match ${matchId}: ${onChainStake} WLD`);
      return { verified: true, matchData };
    } catch (error: any) {
      console.error('[Escrow] Error verifying escrow:', error);
      return { verified: false, error: error.message };
    }
  }

  /**
   * Lock funds for a match (escrow) with idempotency
   * Now tracks on-chain escrow contract state
   */
  static async lockFunds(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string; txHash?: string }> {
    const operationKey = `lockFunds:${matchId}`;
    
    return this.withIdempotency(operationKey, async () => {
      try {
        // Check if escrow already exists on-chain
        const verification = await this.verifyEscrowOnChain(matchId, stakeAmount);
        if (verification.verified) {
          console.log(`[Escrow] Escrow already exists for match ${matchId}, skipping creation`);
          // Find existing transaction hash
          const transactions = await TransactionModel.getByMatchId(matchId);
          const stakeTx = transactions.find(t => t.type === TransactionType.STAKE);
          return { success: true, txHash: stakeTx?.tx_hash };
        }

        // Create match on-chain via smart contract
        const contractService = getContractService();
        const result = await contractService.createMatch(
          matchId,
          player1Wallet,
          player2Wallet,
          stakeAmount
        );

        if (!result.success) {
          console.error('[Escrow] Failed to create match on-chain:', result.error);
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

        console.log(`[Escrow] Match created on-chain: ${matchId}, tx: ${result.txHash}`);
        return { success: true, txHash: result.txHash };
      } catch (error) {
        console.error('[Escrow] Error locking funds:', error);
        return { success: false, error: 'Failed to lock funds' };
      }
    });
  }

  /**
   * Distribute winnings to the winner via smart contract with idempotency
   */
  static async distributeWinnings(
    matchId: string,
    winnerWallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string; txHash?: string }> {
    const operationKey = `distributeWinnings:${matchId}`;
    
    return this.withIdempotency(operationKey, async () => {
      try {
        // Check if already distributed
        const transactions = await TransactionModel.getByMatchId(matchId);
        const existingPayout = transactions.find(
          t => t.type === TransactionType.PAYOUT && t.status === TransactionStatus.COMPLETED
        );
        
        if (existingPayout) {
          console.log(`[Escrow] Winnings already distributed for match ${matchId}, tx: ${existingPayout.tx_hash}`);
          return { success: true, txHash: existingPayout.tx_hash };
        }

        const contractService = getContractService();
        const result = await contractService.completeMatch(matchId, winnerWallet);

        if (!result.success) {
          console.error('[Escrow] Failed to complete match on-chain:', result.error);
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

        console.log(`[Escrow] Winnings distributed on-chain: ${matchId}, tx: ${result.txHash}`);
        return { success: true, txHash: result.txHash };
      } catch (error) {
        console.error('[Escrow] Error distributing winnings:', error);
        return { success: false, error: 'Failed to distribute winnings' };
      }
    });
  }

  /**
   * Refund both players via smart contract with idempotency
   * Checks if match has on-chain escrow before attempting refund
   */
  static async refundBothPlayers(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string; noEscrow?: boolean; txHash?: string }> {
    const operationKey = `refundBothPlayers:${matchId}`;
    
    return this.withIdempotency(operationKey, async () => {
      try {
        // Check if already refunded
        const transactions = await TransactionModel.getByMatchId(matchId);
        const existingRefunds = transactions.filter(
          t => t.type === TransactionType.REFUND && t.status === TransactionStatus.COMPLETED
        );
        
        if (existingRefunds.length >= 2) {
          console.log(`[Escrow] Refund already completed for match ${matchId}`);
          return { success: true, txHash: existingRefunds[0].tx_hash };
        }

        const contractService = getContractService();
        
        // FIRST: Check if match exists on-chain
        console.log(`[Escrow] Checking on-chain escrow for match: ${matchId}`);
        const matchData = await contractService.getMatch(matchId);
        
        // Check for zero or missing stake amount
        // matchData.stakeAmount is already formatted as ether string by contractService.getMatch()
        if (!matchData || matchData.stakeAmount === '0.0' || matchData.stakeAmount === '0') {
          console.warn(`[Escrow] Match ${matchId} has no on-chain escrow - funds may be in platform wallet`);
          // Record this for manual review/refund
          await this.recordFailedRefund(matchId, player1Wallet, player2Wallet, stakeAmount, REFUND_FAILURE_REASONS.NO_ESCROW);
          return { success: false, error: 'No on-chain escrow found', noEscrow: true };
        }
        
        if (!matchData.player1Staked && !matchData.player2Staked) {
          console.warn(`[Escrow] Match ${matchId} exists but no stakes deposited`);
          await this.recordFailedRefund(matchId, player1Wallet, player2Wallet, stakeAmount, REFUND_FAILURE_REASONS.NO_STAKES);
          return { success: false, error: 'No stakes deposited on-chain', noEscrow: true };
        }
        
        // Verify on-chain stake status before attempting refund
        console.log(`[Escrow] Verifying on-chain stake status for match: ${matchId}`);
        const stakeStatus = await contractService.verifyOnChainStakeStatus(matchId);
        
        if (stakeStatus.error) {
          console.error('[Escrow] Error checking stake status:', stakeStatus.error);
          await this.recordFailedRefund(matchId, player1Wallet, player2Wallet, stakeAmount, stakeStatus.error);
          return { success: false, error: stakeStatus.error, noEscrow: true };
        }

        // If no stakes exist on-chain, log warning and don't mark as refunded
        if (!stakeStatus.hasStakes) {
          console.warn(`[Escrow] No on-chain stakes found for match ${matchId}. Cannot refund.`);
          console.warn('[Escrow] Match was likely created in DB but stakes were never deposited on-chain.');
          await this.recordFailedRefund(matchId, player1Wallet, player2Wallet, stakeAmount, REFUND_FAILURE_REASONS.NO_STAKES_ON_CHAIN);
          return { 
            success: false, 
            error: 'No on-chain stakes found. Match was never funded or already refunded.',
            noEscrow: true
          };
        }

        // Check if both players staked (cancelMatch requires both stakes)
        if (!stakeStatus.player1Staked || !stakeStatus.player2Staked) {
          console.warn(`[Escrow] Partial stakes for match ${matchId}. Player1: ${stakeStatus.player1Staked}, Player2: ${stakeStatus.player2Staked}. cancelMatch only works if both players staked. This may fail.`);
        }

        // Attempt to cancel match and refund
        const result = await contractService.cancelMatch(matchId);

        if (!result.success) {
          console.error('[Escrow] Failed to cancel match on-chain:', result.error);
          await this.recordFailedRefund(matchId, player1Wallet, player2Wallet, stakeAmount, result.error || REFUND_FAILURE_REASONS.EXCEPTION);
          return { success: false, error: result.error };
        }

        // Verify the transaction hash exists before creating records
        if (!result.txHash) {
          console.error('[Escrow] No transaction hash returned from cancelMatch');
          await this.recordFailedRefund(matchId, player1Wallet, player2Wallet, stakeAmount, REFUND_FAILURE_REASONS.NO_TX_HASH);
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

        console.log(`[Escrow] Players refunded on-chain: ${matchId}, tx: ${result.txHash}`);
        return { success: true, txHash: result.txHash };
      } catch (error: any) {
        console.error('[Escrow] Error refunding players:', error);
        await this.recordFailedRefund(matchId, player1Wallet, player2Wallet, stakeAmount, error.message || REFUND_FAILURE_REASONS.EXCEPTION);
        // Return more detailed error information
        const errorMsg = error.message || 'Failed to refund players';
        return { success: false, error: errorMsg };
      }
    });
  }

  /**
   * Record failed refunds for manual review
   * TODO: Implement database table for failed_refunds to track these for admin review
   * GitHub Issue #XXX: Create failed_refunds table with columns: match_id, player1_wallet, 
   * player2_wallet, stake_amount, failure_reason, timestamp, resolved (boolean)
   * For now, this logs critical refund failures to console for monitoring
   */
  private static async recordFailedRefund(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number,
    reason: string
  ): Promise<void> {
    try {
      // Log to console for monitoring and alerting
      console.error(`[REFUND_FAILED] Match: ${matchId}, Players: ${player1Wallet}, ${player2Wallet}, Amount: ${stakeAmount}, Reason: ${reason}`);
      // TODO: In production, insert into a dedicated failed_refunds table:
      // await FailedRefundModel.create({ matchId, player1Wallet, player2Wallet, stakeAmount, reason, timestamp: new Date() });
    } catch (error) {
      console.error('[EscrowService] Error recording failed refund:', error);
    }
  }

  /**
   * Refund with processing fee deduction
   * SECURITY: Actually deducts 3% platform fee from refund amounts as required
   */
  static async refundWithFee(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number,
    feePercent: number
  ): Promise<{ success: boolean; error?: string }> {
    const operationKey = `refundWithFee:${matchId}`;
    
    return this.withIdempotency(operationKey, async () => {
      try {
        // Calculate refund amount after deducting platform fee
        const refundAmount = stakeAmount * (1 - feePercent / 100);
        const platformFee = stakeAmount - refundAmount;
        
        console.log(`[EscrowService] Refunding with ${feePercent}% fee - Original: ${stakeAmount}, Fee: ${platformFee}, Refund: ${refundAmount}`);
        
        // Check if already refunded
        const transactions = await TransactionModel.getByMatchId(matchId);
        const existingRefunds = transactions.filter(
          t => t.type === TransactionType.REFUND && t.status === TransactionStatus.COMPLETED
        );
        
        if (existingRefunds.length >= 2) {
          console.log(`[Escrow] Refund already completed for match ${matchId}`);
          return { success: true };
        }

        // For now, we use the treasury service to send refunds directly
        // since the smart contract doesn't have a partial refund function
        const { TreasuryService } = await import('./treasuryService');
        
        // Send refunds with fee deducted
        const refundAmountWei = BigInt(Math.floor(refundAmount * 1e18));
        
        try {
          const tx1Hash = await TreasuryService.sendPayout(player1Wallet, refundAmountWei);
          const tx2Hash = await TreasuryService.sendPayout(player2Wallet, refundAmountWei);
          
          // Record refund transactions in database
          const refund1 = await TransactionModel.create(
            matchId,
            TransactionType.REFUND,
            refundAmount,
            'treasury',
            player1Wallet,
            tx1Hash
          );

          const refund2 = await TransactionModel.create(
            matchId,
            TransactionType.REFUND,
            refundAmount,
            'treasury',
            player2Wallet,
            tx2Hash
          );

          // Record fee transaction
          // Fee is multiplied by 2 because we collect 3% from BOTH players' refunds
          const feeTx = await TransactionModel.create(
            matchId,
            TransactionType.FEE,
            platformFee * 2, // Total fee from both refunds
            'treasury',
            'platform',
            tx1Hash
          );

          // Mark as completed
          await TransactionModel.updateStatus(refund1.transaction_id, TransactionStatus.COMPLETED);
          await TransactionModel.updateStatus(refund2.transaction_id, TransactionStatus.COMPLETED);
          await TransactionModel.updateStatus(feeTx.transaction_id, TransactionStatus.COMPLETED);

          console.log(`[Escrow] Players refunded with ${feePercent}% fee: ${matchId}, txs: ${tx1Hash}, ${tx2Hash}`);
          return { success: true };
        } catch (error: any) {
          console.error('[Escrow] Error sending refunds with fee:', error);
          return { success: false, error: error.message };
        }
      } catch (error: any) {
        console.error('[Escrow] Error in refundWithFee:', error);
        return { success: false, error: error.message || 'Failed to process refund with fee' };
      }
    });
  }

  /**
   * Split pot 50/50 for tie scenarios via smart contract with idempotency
   */
  static async splitPot(
    matchId: string,
    player1Wallet: string,
    player2Wallet: string,
    stakeAmount: number
  ): Promise<{ success: boolean; error?: string; txHash?: string }> {
    const operationKey = `splitPot:${matchId}`;
    
    return this.withIdempotency(operationKey, async () => {
      try {
        // Check if already split
        const transactions = await TransactionModel.getByMatchId(matchId);
        const existingPayouts = transactions.filter(
          t => t.type === TransactionType.PAYOUT && t.status === TransactionStatus.COMPLETED
        );
        
        if (existingPayouts.length >= 2) {
          console.log(`[Escrow] Pot already split for match ${matchId}`);
          return { success: true, txHash: existingPayouts[0].tx_hash };
        }

        const contractService = getContractService();
        const result = await contractService.splitPot(matchId);

        if (!result.success) {
          console.error('[Escrow] Failed to split pot on-chain:', result.error);
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

        console.log(`[Escrow] Pot split on-chain: ${matchId}, tx: ${result.txHash}`);
        return { success: true, txHash: result.txHash };
      } catch (error) {
        console.error('[Escrow] Error splitting pot:', error);
        return { success: false, error: 'Failed to split pot' };
      }
    });
  }
}
