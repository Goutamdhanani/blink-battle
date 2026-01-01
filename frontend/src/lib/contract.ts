import { MiniKit } from '@worldcoin/minikit-js';
import EscrowABI from './BlinkBattleEscrow.abi.json';
import ERC20ABI from './ERC20.abi.json';

/**
 * Helper functions for interacting with BlinkBattleEscrow contract via MiniKit
 */

const ESCROW_CONTRACT_ADDRESS = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS;
const WLD_TOKEN_ADDRESS = import.meta.env.VITE_WLD_TOKEN_ADDRESS;

/**
 * Convert match ID to bytes32 format (keccak256 hash)
 */
export function matchIdToBytes32(matchId: string): string {
  // Simple keccak256 hash - in production you'd use a proper library
  // For now, we'll send the string and let the backend/contract handle conversion
  return matchId;
}

/**
 * Convert WLD amount to wei (18 decimals)
 */
export function wldToWei(amount: number): string {
  return (BigInt(Math.floor(amount * 1e18))).toString();
}

/**
 * Approve WLD token spending for the escrow contract
 * This must be called before depositing a stake
 */
export async function approveWLDForEscrow(amount: number): Promise<{
  success: boolean;
  transactionId?: string;
  error?: string;
}> {
  try {
    if (!MiniKit.isInstalled()) {
      throw new Error('MiniKit not installed');
    }

    if (!ESCROW_CONTRACT_ADDRESS) {
      throw new Error('Escrow contract address not configured');
    }

    if (!WLD_TOKEN_ADDRESS) {
      throw new Error('WLD token address not configured');
    }

    const amountWei = wldToWei(amount);

    console.log('[Contract] Approving WLD spending:', {
      token: WLD_TOKEN_ADDRESS,
      spender: ESCROW_CONTRACT_ADDRESS,
      amount: amountWei,
    });

    const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
      transaction: [
        {
          address: WLD_TOKEN_ADDRESS,
          abi: ERC20ABI,
          functionName: 'approve',
          args: [ESCROW_CONTRACT_ADDRESS, amountWei],
        },
      ],
    });

    if (finalPayload.status === 'error') {
      console.error('[Contract] Approval failed:', finalPayload.error_code);
      return {
        success: false,
        error: finalPayload.error_code || 'Approval failed',
      };
    }

    console.log('[Contract] WLD approved, tx:', finalPayload.transaction_id);
    return {
      success: true,
      transactionId: finalPayload.transaction_id,
    };
  } catch (error: any) {
    console.error('[Contract] Error approving WLD:', error);
    return {
      success: false,
      error: error.message || 'Failed to approve WLD',
    };
  }
}

/**
 * Deposit stake into the escrow contract for a match
 */
export async function depositStake(matchId: string): Promise<{
  success: boolean;
  transactionId?: string;
  error?: string;
}> {
  try {
    if (!MiniKit.isInstalled()) {
      throw new Error('MiniKit not installed');
    }

    if (!ESCROW_CONTRACT_ADDRESS) {
      throw new Error('Escrow contract address not configured');
    }

    // Convert matchId to bytes32 - the backend will handle this conversion
    // but for now we pass the matchId as-is
    const matchIdBytes = matchId;

    console.log('[Contract] Depositing stake:', {
      contract: ESCROW_CONTRACT_ADDRESS,
      matchId: matchIdBytes,
    });

    const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
      transaction: [
        {
          address: ESCROW_CONTRACT_ADDRESS,
          abi: EscrowABI,
          functionName: 'depositStake',
          args: [matchIdBytes],
        },
      ],
    });

    if (finalPayload.status === 'error') {
      console.error('[Contract] Deposit failed:', finalPayload.error_code);
      return {
        success: false,
        error: finalPayload.error_code || 'Deposit failed',
      };
    }

    console.log('[Contract] Stake deposited, tx:', finalPayload.transaction_id);
    return {
      success: true,
      transactionId: finalPayload.transaction_id,
    };
  } catch (error: any) {
    console.error('[Contract] Error depositing stake:', error);
    return {
      success: false,
      error: error.message || 'Failed to deposit stake',
    };
  }
}

/**
 * Approve and deposit stake in a single flow
 * Handles the two-step process: approve WLD, then deposit to escrow
 */
export async function approveAndDeposit(
  matchId: string,
  stakeAmount: number
): Promise<{
  success: boolean;
  approvalTxId?: string;
  depositTxId?: string;
  error?: string;
}> {
  try {
    // Step 1: Approve WLD spending
    console.log('[Contract] Step 1: Approving WLD...');
    const approvalResult = await approveWLDForEscrow(stakeAmount);
    
    if (!approvalResult.success) {
      return {
        success: false,
        error: `Approval failed: ${approvalResult.error}`,
      };
    }

    // Wait a moment for the approval transaction to be processed
    console.log('[Contract] Step 1 complete, waiting for confirmation...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Deposit stake
    console.log('[Contract] Step 2: Depositing stake...');
    const depositResult = await depositStake(matchId);
    
    if (!depositResult.success) {
      return {
        success: false,
        approvalTxId: approvalResult.transactionId,
        error: `Deposit failed: ${depositResult.error}`,
      };
    }

    console.log('[Contract] Both transactions successful');
    return {
      success: true,
      approvalTxId: approvalResult.transactionId,
      depositTxId: depositResult.transactionId,
    };
  } catch (error: any) {
    console.error('[Contract] Error in approve and deposit:', error);
    return {
      success: false,
      error: error.message || 'Failed to approve and deposit',
    };
  }
}
