import { 
  MiniKit, 
  PayCommandInput, 
  VerifyCommandInput, 
  VerificationLevel,
  Tokens,
  tokenToDecimals 
} from '@worldcoin/minikit-js';
import { apiClient } from './api';

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
   * Only call this after ensuring MiniKit is installed
   */
  signInWithWallet: async () => {
    if (!MiniKit.isInstalled()) {
      throw new Error('MiniKit not installed. Please open in World App.');
    }

    try {
      // Get nonce from backend (no auth required for nonce generation)
      const res = await apiClient.get('/api/auth/nonce');
      const { nonce } = res.data;

      // Store the nonce for later verification
      const originalNonce = nonce;

      // Use MiniKit walletAuth command
      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce: originalNonce,
        expirationTime: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
        statement: 'Sign in to Blink Battle',
      });

      if (finalPayload.status === 'error') {
        const errorCode = finalPayload.error_code || 'unknown_error';
        console.error('[MiniKit] Wallet auth error:', errorCode);
        throw new Error(`Wallet authentication failed: ${errorCode}`);
      }

      // Verify SIWE message on backend with both payload and original nonce
      const verifyRes = await apiClient.post('/api/auth/verify-siwe', {
        payload: finalPayload,
        nonce: originalNonce,
      });

      return verifyRes.data;
    } catch (error: any) {
      console.error('[MiniKit] Sign in error:', error);
      // Provide more context for debugging
      if (error.response?.data?.errorCode) {
        throw new Error(`Authentication failed: ${error.response.data.errorCode}`);
      }
      throw error;
    }
  },

  /**
   * Initiate a payment for staking
   * Only call this after ensuring MiniKit is installed
   */
  initiatePayment: async (amount: number) => {
    if (!MiniKit.isInstalled()) {
      throw new Error('MiniKit not installed. Please open in World App.');
    }

    try {
      // First, initiate payment on backend to get reference ID
      // This call now includes auth token via axios interceptor
      const res = await apiClient.post('/api/initiate-payment', {
        amount,
      });
      const { id } = res.data;

      const platformWallet = import.meta.env.VITE_PLATFORM_WALLET_ADDRESS;

      if (!platformWallet) {
        throw new Error('Platform wallet address not configured');
      }

      const payload: PayCommandInput = {
        reference: id,
        to: platformWallet,
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
        // Verify payment on backend (includes auth token via axios interceptor)
        const confirmRes = await apiClient.post('/api/confirm-payment', {
          payload: finalPayload,
        });

        // Handle pending transaction (not yet mined)
        if (confirmRes.data.pending) {
          return {
            success: true,
            pending: true,
            reference: id,
            transaction: confirmRes.data.transaction,
          };
        }

        return {
          success: true,
          reference: id,
          transaction: confirmRes.data.transaction,
        };
      }

      return {
        success: false,
        error: finalPayload.error_code || 'Payment failed',
      };
    } catch (error: any) {
      console.error('[MiniKit] Payment error:', error);
      
      // Provide better error messages for common issues
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please sign in again.');
      }
      
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      
      throw error;
    }
  },

  /**
   * Verify World ID (for anti-cheat)
   * Only call this after ensuring MiniKit is installed
   */
  verifyWorldID: async (action: string) => {
    if (!MiniKit.isInstalled()) {
      throw new Error('MiniKit not installed. Please open in World App.');
    }

    try {
      const verifyPayload: VerifyCommandInput = {
        action: action,
        verification_level: VerificationLevel.Orb,
      };

      const { finalPayload } = await MiniKit.commandsAsync.verify(verifyPayload);

      if (finalPayload.status === 'success') {
        // Send proof to backend for verification (includes auth token via axios interceptor)
        const res = await apiClient.post('/api/verify-world-id', {
          payload: finalPayload,
          action: action,
        });

        return res.data;
      }

      return {
        success: false,
        error: finalPayload.error_code || 'World ID verification failed',
      };
    } catch (error) {
      console.error('[MiniKit] World ID verification error:', error);
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
