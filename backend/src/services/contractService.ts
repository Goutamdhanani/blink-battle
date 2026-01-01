import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Service to interact with BlinkBattleEscrow smart contract on World Chain
 */
export class ContractService {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;

  // Contract ABI - only the functions we need
  private static readonly ABI = [
    'function createMatch(bytes32 matchId, address player1, address player2, uint256 stakeAmount) external',
    'function completeMatch(bytes32 matchId, address winner) external',
    'function splitPot(bytes32 matchId) external',
    'function cancelMatch(bytes32 matchId) external',
    'function getMatch(bytes32 matchId) external view returns (tuple(address player1, address player2, uint256 stakeAmount, bool player1Staked, bool player2Staked, bool completed, bool cancelled))',
    'function isMatchReady(bytes32 matchId) external view returns (bool)',
    'function accumulatedFees() external view returns (uint256)',
    'event MatchCreated(bytes32 indexed matchId, address indexed player1, address indexed player2, uint256 stakeAmount)',
    'event StakeDeposited(bytes32 indexed matchId, address indexed player, uint256 amount)',
    'event MatchCompleted(bytes32 indexed matchId, address indexed winner, uint256 winnerPayout, uint256 platformFee)',
    'event MatchCancelled(bytes32 indexed matchId, address indexed player1, address indexed player2, uint256 refundAmount)',
    'event PotSplit(bytes32 indexed matchId, address indexed player1, address indexed player2, uint256 payoutEach)',
  ];

  constructor() {
    const rpcUrl = process.env.WORLD_CHAIN_RPC_URL;
    const privateKey = process.env.BACKEND_PRIVATE_KEY;
    const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS;

    if (!rpcUrl) {
      throw new Error('WORLD_CHAIN_RPC_URL not configured');
    }

    if (!privateKey) {
      throw new Error('BACKEND_PRIVATE_KEY not configured');
    }

    if (!contractAddress) {
      throw new Error('ESCROW_CONTRACT_ADDRESS not configured');
    }

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(contractAddress, ContractService.ABI, this.wallet);

    console.log('[ContractService] Initialized with contract:', contractAddress);
  }

  /**
   * Convert match ID string to bytes32
   */
  private matchIdToBytes32(matchId: string): string {
    return ethers.id(matchId);
  }

  /**
   * Create a match on-chain
   */
  async createMatch(
    matchId: string,
    player1Address: string,
    player2Address: string,
    stakeAmount: number
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate stake amount is reasonable (between 0.01 and 1000 WLD)
      if (stakeAmount < 0.01 || stakeAmount > 1000) {
        return { success: false, error: `Invalid stake amount: ${stakeAmount} WLD` };
      }

      const matchIdBytes = this.matchIdToBytes32(matchId);
      
      // Convert to wei using string manipulation to avoid precision loss
      // Handle up to 18 decimal places
      const stakeStr = stakeAmount.toFixed(18);
      const [whole, decimal = ''] = stakeStr.split('.');
      const paddedDecimal = decimal.padEnd(18, '0');
      const stakeWei = ethers.getBigInt(whole + paddedDecimal);

      console.log('[ContractService] Creating match on-chain:', {
        matchId: matchIdBytes,
        player1: player1Address,
        player2: player2Address,
        stake: stakeAmount,
        stakeWei: stakeWei.toString(),
      });

      const tx = await this.contract.createMatch(
        matchIdBytes,
        player1Address,
        player2Address,
        stakeWei
      );

      console.log('[ContractService] Transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('[ContractService] Match created, tx confirmed:', receipt.hash);

      return { success: true, txHash: receipt.hash };
    } catch (error: any) {
      console.error('[ContractService] Error creating match:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Complete match and distribute winnings on-chain
   */
  async completeMatch(
    matchId: string,
    winnerAddress: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const matchIdBytes = this.matchIdToBytes32(matchId);

      console.log('[ContractService] Completing match on-chain:', {
        matchId: matchIdBytes,
        winner: winnerAddress,
      });

      const tx = await this.contract.completeMatch(matchIdBytes, winnerAddress);
      console.log('[ContractService] Transaction sent:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('[ContractService] Match completed, tx confirmed:', receipt.hash);

      return { success: true, txHash: receipt.hash };
    } catch (error: any) {
      console.error('[ContractService] Error completing match:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Split pot 50/50 for tie scenarios
   */
  async splitPot(matchId: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const matchIdBytes = this.matchIdToBytes32(matchId);

      console.log('[ContractService] Splitting pot on-chain:', matchId);

      const tx = await this.contract.splitPot(matchIdBytes);
      const receipt = await tx.wait();
      console.log('[ContractService] Pot split, tx confirmed:', receipt.hash);

      return { success: true, txHash: receipt.hash };
    } catch (error: any) {
      console.error('[ContractService] Error splitting pot:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel match and refund players
   */
  async cancelMatch(matchId: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const matchIdBytes = this.matchIdToBytes32(matchId);

      console.log('[ContractService] Cancelling match on-chain:', matchId);

      const tx = await this.contract.cancelMatch(matchIdBytes);
      const receipt = await tx.wait();
      console.log('[ContractService] Match cancelled, tx confirmed:', receipt.hash);

      return { success: true, txHash: receipt.hash };
    } catch (error: any) {
      console.error('[ContractService] Error cancelling match:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if match is ready (both players staked)
   */
  async isMatchReady(matchId: string): Promise<boolean> {
    try {
      const matchIdBytes = this.matchIdToBytes32(matchId);
      const ready = await this.contract.isMatchReady(matchIdBytes);
      return ready;
    } catch (error) {
      console.error('[ContractService] Error checking if match ready:', error);
      return false;
    }
  }

  /**
   * Get match details from contract
   */
  async getMatch(matchId: string): Promise<any> {
    try {
      const matchIdBytes = this.matchIdToBytes32(matchId);
      const matchData = await this.contract.getMatch(matchIdBytes);
      return {
        player1: matchData.player1,
        player2: matchData.player2,
        stakeAmount: ethers.formatEther(matchData.stakeAmount),
        player1Staked: matchData.player1Staked,
        player2Staked: matchData.player2Staked,
        completed: matchData.completed,
        cancelled: matchData.cancelled,
      };
    } catch (error) {
      console.error('[ContractService] Error getting match:', error);
      return null;
    }
  }

  /**
   * Get accumulated protocol fees
   */
  async getAccumulatedFees(): Promise<string> {
    try {
      const fees = await this.contract.accumulatedFees();
      return ethers.formatEther(fees);
    } catch (error) {
      console.error('[ContractService] Error getting fees:', error);
      return '0';
    }
  }
}

// Singleton instance
let contractServiceInstance: ContractService | null = null;

export const getContractService = (): ContractService => {
  if (!contractServiceInstance) {
    contractServiceInstance = new ContractService();
  }
  return contractServiceInstance;
};
