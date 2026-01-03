import { ethers } from 'ethers';

/**
 * TreasuryService - Handles payouts from treasury wallet
 * 
 * This service manages WLD token transfers from the platform's treasury wallet
 * to winners after matches complete.
 */

// WLD Token ABI (ERC20 transfer function)
const WLD_TOKEN_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)'
];

export class TreasuryService {
  private static provider: ethers.JsonRpcProvider;
  private static treasuryWallet: ethers.Wallet;
  private static wldToken: ethers.Contract;

  /**
   * Initialize the treasury service
   */
  private static initialize() {
    if (this.provider && this.treasuryWallet && this.wldToken) {
      return; // Already initialized
    }

    // Get configuration from environment
    const RPC_URL = process.env.WORLD_CHAIN_RPC_URL || 'https://worldchain-mainnet.g.alchemy.com/public';
    const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;
    const WLD_TOKEN_ADDRESS = process.env.WLD_TOKEN_ADDRESS || '0x2cFc85d8E48F8EAB294be644d9E25C3030863003'; // World Chain mainnet

    if (!TREASURY_PRIVATE_KEY) {
      console.error('[TreasuryService] TREASURY_PRIVATE_KEY not configured');
      throw new Error('Treasury service not configured - missing TREASURY_PRIVATE_KEY');
    }

    // Setup provider and wallet
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.treasuryWallet = new ethers.Wallet(TREASURY_PRIVATE_KEY, this.provider);
    this.wldToken = new ethers.Contract(WLD_TOKEN_ADDRESS, WLD_TOKEN_ABI, this.treasuryWallet);

    console.log(`[TreasuryService] Initialized with treasury wallet: ${this.treasuryWallet.address}`);
  }

  /**
   * Send payout from treasury wallet to winner
   * @param toWallet - Recipient wallet address
   * @param amountWei - Amount in wei (as BigInt)
   * @returns Transaction hash
   */
  static async sendPayout(toWallet: string, amountWei: bigint): Promise<string> {
    this.initialize();

    try {
      console.log(`[TreasuryService] Sending payout: ${amountWei.toString()} wei to ${toWallet}`);

      // Validate wallet address
      if (!ethers.isAddress(toWallet)) {
        throw new Error(`Invalid wallet address: ${toWallet}`);
      }

      // Check treasury balance
      const balance = await this.getBalance();
      if (balance < amountWei) {
        throw new Error(`Insufficient treasury balance. Required: ${amountWei}, Available: ${balance}`);
      }

      // Send transaction
      const tx = await this.wldToken.transfer(toWallet, amountWei);
      console.log(`[TreasuryService] Transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 0) {
        throw new Error('Transaction failed on-chain');
      }

      console.log(`[TreasuryService] Payout confirmed: ${receipt.hash}`);
      return receipt.hash;
    } catch (error: any) {
      console.error('[TreasuryService] Error sending payout:', error);
      throw new Error(`Failed to send payout: ${error.message}`);
    }
  }

  /**
   * Get treasury wallet balance in wei
   */
  static async getBalance(): Promise<bigint> {
    this.initialize();

    try {
      const balance = await this.wldToken.balanceOf(this.treasuryWallet.address);
      return BigInt(balance.toString());
    } catch (error: any) {
      console.error('[TreasuryService] Error getting balance:', error);
      throw new Error(`Failed to get treasury balance: ${error.message}`);
    }
  }

  /**
   * Verify a deposit transaction on-chain
   * @param txHash - Transaction hash to verify
   * @param expectedAmount - Expected amount in wei
   * @param expectedTo - Expected recipient address (treasury wallet)
   * @returns True if deposit is valid
   */
  static async verifyDeposit(
    txHash: string,
    expectedAmount: bigint,
    expectedTo?: string
  ): Promise<boolean> {
    this.initialize();

    try {
      console.log(`[TreasuryService] Verifying deposit: ${txHash}`);

      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) {
        console.warn(`[TreasuryService] Transaction not found: ${txHash}`);
        return false;
      }

      if (receipt.status === 0) {
        console.warn(`[TreasuryService] Transaction failed: ${txHash}`);
        return false;
      }

      // Get the transaction details
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) {
        console.warn(`[TreasuryService] Transaction details not found: ${txHash}`);
        return false;
      }

      // Verify it's a transfer to the expected address (treasury or platform wallet)
      const toAddress = expectedTo || this.treasuryWallet.address;
      if (tx.to?.toLowerCase() !== this.wldToken.target.toString().toLowerCase()) {
        console.warn(`[TreasuryService] Transaction not to WLD token contract: ${tx.to}`);
        return false;
      }

      // Parse transfer events from logs
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      const transferLog = receipt.logs.find(log => log.topics[0] === transferTopic);
      
      if (!transferLog) {
        console.warn(`[TreasuryService] No transfer event found in transaction`);
        return false;
      }

      // Decode the transfer event
      const toFromLog = ethers.getAddress('0x' + transferLog.topics[2].slice(26));
      const amountFromLog = BigInt(transferLog.data);

      // Verify recipient and amount
      if (toFromLog.toLowerCase() !== toAddress.toLowerCase()) {
        console.warn(`[TreasuryService] Transfer recipient mismatch. Expected: ${toAddress}, Got: ${toFromLog}`);
        return false;
      }

      // Allow small amount differences (0.1% tolerance for gas/rounding)
      const tolerance = expectedAmount / 1000n; // 0.1%
      const diff = amountFromLog > expectedAmount 
        ? amountFromLog - expectedAmount 
        : expectedAmount - amountFromLog;

      if (diff > tolerance) {
        console.warn(`[TreasuryService] Transfer amount mismatch. Expected: ${expectedAmount}, Got: ${amountFromLog}`);
        return false;
      }

      console.log(`[TreasuryService] Deposit verified: ${txHash}`);
      return true;
    } catch (error: any) {
      console.error('[TreasuryService] Error verifying deposit:', error);
      return false;
    }
  }

  /**
   * Get treasury wallet address
   */
  static getTreasuryAddress(): string {
    this.initialize();
    return this.treasuryWallet.address;
  }

  /**
   * Format wei amount to WLD (human readable)
   */
  static formatWLD(amountWei: bigint): string {
    return ethers.formatUnits(amountWei, 18);
  }

  /**
   * Parse WLD amount to wei
   */
  static parseWLD(amount: string): bigint {
    return BigInt(ethers.parseUnits(amount, 18).toString());
  }
}
