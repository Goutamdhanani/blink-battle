import { 
  MiniKit, 
  PayCommandInput, 
  VerifyCommandInput, 
  VerificationLevel,
  Tokens,
  tokenToDecimals 
} from '@worldcoin/minikit-js';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * MiniKit utility functions for World App integration
 */
export const minikit = {
  /**
   * Check if running inside World App
   */
  isInstalled: () => {
    return MiniKit.isInstalled();
  },

  /**
   * Get wallet address from MiniKit context
   * Note: Wallet address is obtained through SIWE authentication, not directly from MiniKit
   * This method is kept for API consistency but always returns null
   * Use the SIWE authentication flow to get the wallet address
   */
  getWalletAddress: () => {
    // Wallet address is obtained through SIWE authentication
    return null;
  },

  /**
   * Get user info from MiniKit context
   * Note: User info is obtained through SIWE authentication, not directly from MiniKit
   * This method is kept for API consistency but always returns null
   * Use the SIWE authentication flow to get user information
   */
  getUser: () => {
    return null;
  },

  /**
   * Sign in with wallet using SIWE
   */
  signInWithWallet: async () => {
    try {
      // Get nonce from backend
      const res = await axios.get(`${API_URL}/api/auth/nonce`);
      const { nonce } = res.data;

      // Use MiniKit walletAuth command
      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce: nonce,
        expirationTime: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
        statement: 'Sign in to Blink Battle',
      });

      if (finalPayload.status === 'error') {
        throw new Error('Wallet authentication failed');
      }

      // Verify SIWE message on backend
      const verifyRes = await axios.post(`${API_URL}/api/auth/verify-siwe`, {
        payload: finalPayload,
      });

      return verifyRes.data;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  },

  /**
   * Initiate a payment for staking
   */
  initiatePayment: async (amount: number) => {
    try {
      // First, initiate payment on backend to get reference ID
      const res = await axios.post(`${API_URL}/api/initiate-payment`, {
        amount,
      });
      const { id } = res.data;

      const platformWallet = import.meta.env.VITE_PLATFORM_WALLET_ADDRESS;

      const payload: PayCommandInput = {
        reference: id,
        to: platformWallet || '0x0000000000000000000000000000000000000000',
        tokens: [
          {
            symbol: Tokens.WLD,
            token_amount: tokenToDecimals(amount, Tokens.WLD).toString(),
          },
        ],
        description: `Stake ${amount} WLD for reaction battle`,
      };

      const { finalPayload } = await MiniKit.commandsAsync.pay(payload);

      if (finalPayload.status === 'success') {
        // Verify payment on backend
        const confirmRes = await axios.post(`${API_URL}/api/confirm-payment`, {
          payload: finalPayload,
        });

        return {
          success: true,
          reference: id,
          transaction: confirmRes.data.transaction,
        };
      }

      return {
        success: false,
        error: 'Payment failed',
      };
    } catch (error) {
      console.error('Payment error:', error);
      throw error;
    }
  },

  /**
   * Verify World ID (for anti-cheat)
   */
  verifyWorldID: async (action: string) => {
    try {
      const verifyPayload: VerifyCommandInput = {
        action: action,
        verification_level: VerificationLevel.Orb,
      };

      const { finalPayload } = await MiniKit.commandsAsync.verify(verifyPayload);

      if (finalPayload.status === 'success') {
        // Send proof to backend for verification
        const res = await axios.post(`${API_URL}/api/verify-world-id`, {
          payload: finalPayload,
          action: action,
        });

        return res.data;
      }

      return {
        success: false,
        error: 'World ID verification failed',
      };
    } catch (error) {
      console.error('World ID verification error:', error);
      throw error;
    }
  },

  /**
   * Send haptic feedback
   */
  sendHaptic: (style: 'success' | 'warning' | 'error') => {
    if (MiniKit.isInstalled()) {
      MiniKit.commands.sendHapticFeedback({
        hapticsType: 'notification',
        style,
      });
    }
  },
};
